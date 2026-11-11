import {callbackFailure, callbackStep} from './google-diagnostics';
import type {GoogleTransaction} from './google-transactions';
import type {IntegrationConfig} from './config';

export const GOOGLE_BROWSER = '__Host-mfd-integration-browser';
export const GOOGLE_FLOW = '__Host-mfd-integration-google';
export const GOOGLE_START = '/auth/google';
export const GOOGLE_CALLBACK = '/auth/google/callback';
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const hex = (bytes: Uint8Array) => Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
export const sessionFingerprint = async (token: string | undefined) => token ? hex(await digest(token)) : '';
// Auth verifies the token before its claims become an identity decision.
export async function firstPartyIdentity(config: IntegrationConfig, raw: (path: string, init?: RequestInit, token?: string)=>Promise<Response>, token: string) {
  const response = await callbackStep('CB_USER_REQUEST',()=>raw('/auth/v1/user',{},token));
  if (!response.ok) callbackFailure('CB_USER_STATUS');
  const user = await callbackStep('CB_USER_JSON',()=>response.json()) as {id?: string};
  const claims = await callbackStep('CB_CLAIMS_JSON',()=>JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))));
  if (!user?.id || claims?.sub !== user.id) callbackFailure('CB_SUBJECT');
  if (claims.iss !== config.issuer) callbackFailure('CB_ISSUER');
  // A one-element array is the same audience (Auth emits it right after a restart).
  if (claims.aud !== 'authenticated' && !(Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === 'authenticated')) callbackFailure('CB_AUDIENCE');
  if (claims.role !== 'authenticated') callbackFailure('CB_ROLE');
  if (claims.client_id !== undefined) callbackFailure('CB_CLIENT');
  if (typeof claims.session_id !== 'string' || !claims.session_id) callbackFailure('CB_SESSION');
  if (typeof claims.exp !== 'number' || claims.exp <= Date.now()/1000) callbackFailure('CB_EXPIRY');
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > Date.now()/1000)) callbackFailure('CB_NOT_BEFORE');
  return user.id;
}
export async function startGoogle(config: IntegrationConfig, next: string, token: string | undefined, raw: Parameters<typeof firstPartyIdentity>[1]) {
  const state=random(),verifier=random();
  const owner=token ? await firstPartyIdentity(config,raw,token) : null;
  const context:GoogleTransaction={id:state,verifier,next,owner,session:await sessionFingerprint(token),expires:Date.now()+300_000};
  const callback=new URL(GOOGLE_CALLBACK,config.authOrigin);
  const destination=new URL('/auth/v1/authorize',config.supabase);
  const challenge=btoa(String.fromCharCode(...await digest(verifier))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  destination.search=new URLSearchParams({provider:'google',redirect_to:callback.href,code_challenge:challenge,code_challenge_method:'s256',prompt:'select_account'}).toString();
  return {context,destination:destination.href};
}
export function googleContext(c:GoogleTransaction|null, url:URL, validateNext:(value:string)=>string) {
  if (!c || !/^[a-f0-9]{64}$/.test(c.id) || !/^[a-f0-9]{64}$/.test(c.verifier) || c.expires<=Date.now() || c.expires>Date.now()+300_000 || !((c.owner===null && c.session==='') || (typeof c.owner==='string' && c.owner && /^[a-f0-9]{64}$/.test(c.session)))) callbackFailure('CB_CONTEXT');
  for (const key of url.searchParams.keys()) if (!['code','error','error_code','error_description'].includes(key) || url.searchParams.getAll(key).length!==1) callbackFailure('CB_PARAMETERS');
  if (url.searchParams.has('error') || url.searchParams.has('error_code') || url.hash) callbackFailure('CB_CANCELLED');
  const code=url.searchParams.get('code');if(!code || code.length>2048 || /[\s\x00-\x1f]/.test(code)) callbackFailure('CB_CODE');
  let next:string;try {next=validateNext(c.next);} catch {return callbackFailure('CB_CONTINUATION');}
  return {...c,next,code};
}
