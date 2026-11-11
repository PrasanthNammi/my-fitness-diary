import {CallbackFailure, callbackFailure, callbackStep, type CallbackCode} from './google-diagnostics';
import {type GoogleTransactions, validTransactionId} from './google-transactions';
import {handleMcpConsent} from '../worker/mcp-consent';
import type {IntegrationConfig} from './config';
import type {RateGate} from './limits';
import {integrationUpstream, privateJson} from './service';
import {GOOGLE_BROWSER, random, GOOGLE_FLOW, GOOGLE_START, GOOGLE_CALLBACK, startGoogle, googleContext, firstPartyIdentity, sessionFingerprint} from './google';
import type {OAuthHelpers} from '@cloudflare/workers-oauth-provider';
import {brand, htmlPage, message, uiPolicy} from './ui';
import {AUTHORIZE, UPSTREAM_CALLBACK, SUPABASE_CONSENT, CONNECTIONS, authorize, supabaseConsent, upstreamCallback, connections, audienceIs} from './connector';

const ACCESS = '__Host-mfd-integration-access', REFRESH = '__Host-mfd-integration-refresh', CSRF = '__Host-mfd-integration-csrf';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const cookie = (key: string, value: string, seconds = 2592000) => `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
function page(text: string, status = 200) { return new Response(htmlPage('My Fitness Diary', text.startsWith('<section') ? text : message(text)), {status, headers: {'Content-Type':'text/html; charset=utf-8'}}); }
const OAUTH_PARAMS = ['response_type','client_id','redirect_uri','state','code_challenge','code_challenge_method','scope','resource','prompt'];
function returnPath(value: string, origin: string) {
  const url = new URL(value, origin);
  // An AI app's authorization request survives sign-in; the OAuth provider re-validates it.
  if (url.pathname === AUTHORIZE && value.startsWith(AUTHORIZE + '?') && url.origin === origin && !url.hash && url.search.length <= 2048 && [...url.searchParams.keys()].every(key => OAUTH_PARAMS.includes(key) && url.searchParams.getAll(key).length === 1)) return url.pathname + url.search;
  if (!value.startsWith('/') || value.startsWith('//') || url.origin !== origin || !['/', '/oauth/mcp/connections','/oauth/mcp/consent'].includes(url.pathname) || url.hash) throw Error('Invalid return path');
  if ([...url.searchParams.keys()].some(key => key !== 'authorization_id') || (url.search && !/^[\w-]{1,200}$/.test(url.searchParams.get('authorization_id') || ''))) throw Error('Invalid continuation');
  return url.pathname + url.search;
}
export function createAuthService(config: IntegrationConfig, fetcher: typeof fetch, gate: RateGate, transactions?:GoogleTransactions) {
  const raw = integrationUpstream(config, fetcher);
  return async (request: Request, oauth?: OAuthHelpers): Promise<Response> => {
    const changes: string[] = [];
    let extraFormTargets: string[] = [];
    let response: Response;
    let callbackStage: CallbackCode = 'CB_REQUEST';
    try {
      const url = new URL(request.url);
      // Clear pending browser context on every callback, including cancellation/errors.
      if (url.pathname === GOOGLE_CALLBACK) changes.push(cookie(GOOGLE_FLOW,'',0));
      if (url.origin !== config.authOrigin) return privateJson({error:'Wrong auth origin'},421);
      if (!['GET','POST'].includes(request.method)) return privateJson({error:'Method not allowed'},405);
      if (request.method === 'POST' && (request.headers.get('origin') !== config.authOrigin || request.headers.get('sec-fetch-site') === 'cross-site')) return privateJson({error:'Same-origin required'},403);
      if (!await gate.allow('auth-all')) return privateJson({error:'Rate limited'},429,{'Retry-After':'60'});
      callbackStage='CB_COOKIES';
      const jar = new Map<string,string>();
      for (const item of (request.headers.get('cookie') || '').split(';')) {
        const at = item.indexOf('='); if (at < 0) continue;
        const key = item.slice(0,at).trim(); if (jar.has(key)) throw Error('Duplicate cookie');
        jar.set(key,decodeURIComponent(item.slice(at+1)));
      }
      const clear = () => {changes.push(cookie(ACCESS,'',0),cookie(REFRESH,'',0));};
      async function save(r: Response) {
        if (!r.ok) {clear(); throw Error('Authentication failed');}
        const data = await r.json() as {access_token?: string; refresh_token?: string; user?: {id?: string}};
        if (!data.access_token || !data.refresh_token || !data.user?.id) throw Error('Invalid Auth reply');
        if (await firstPartyIdentity(config,raw,data.access_token) !== data.user.id) throw Error('Session identity mismatch');
        changes.push(cookie(ACCESS,data.access_token),cookie(REFRESH,data.refresh_token));
        return data.access_token;
      }
      async function token() {
        let value = jar.get(ACCESS), expired = true;
        try {expired = JSON.parse(atob(value!.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp < Date.now()/1000+60;} catch { /* Refresh below. */ }
        if (expired) {
          const refresh = jar.get(REFRESH); if (!refresh) throw Error('Sign in required');
          value = await save(await raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh})}));
        }
        const claims = JSON.parse(atob(value!.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        if (claims.iss !== config.issuer || !audienceIs(claims.aud, 'authenticated') || claims.client_id !== undefined || claims.role !== 'authenticated' || !claims.session_id || typeof claims.exp !== 'number' || claims.exp <= Date.now()/1000) throw Error('First-party session required');
        return value!;
      }
      const identity = async () => {
        let bearer: string;
        try {bearer = await token();} catch {return null;}
        const userId = await firstPartyIdentity(config,raw,bearer);
        const user = await (await raw('/auth/v1/user',{},bearer)).json() as {email?: string};
        return {userId, email: user.email || '', token: bearer};
      };
      const connector = oauth && {config, raw, fetcher, oauth, identity};
      if (connector && url.pathname === AUTHORIZE) {
        const result = await authorize(request, connector);
        response = result.response; extraFormTargets = result.formTargets || [];
      } else if (connector && url.pathname === UPSTREAM_CALLBACK && request.method === 'GET') {
        response = await upstreamCallback(request, connector);
      } else if (connector && url.pathname === SUPABASE_CONSENT) {
        response = await supabaseConsent(request, connector);
      } else if (connector && url.pathname === CONNECTIONS) {
        response = await connections(request, connector);
      } else if (url.pathname === GOOGLE_START && request.method === 'POST') {
        if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw Error('Form required');
        const reader=request.body?.getReader();let body='',size=0;const decoder=new TextDecoder();
        if(reader) for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();throw Error('Form too large');}body+=decoder.decode(part.value,{stream:true});}
        body+=decoder.decode();const form=new URLSearchParams(body);
        if([...form.keys()].some(key=>!['csrf','return_to'].includes(key) || form.getAll(key).length!==1)) throw Error('Invalid form');
        const csrf=form.get('csrf');if(!csrf || csrf!==jar.get(CSRF) || !/^[a-f0-9]{64}$/.test(csrf)) throw Error('Invalid CSRF');
        const next=returnPath(form.get('return_to') || '/oauth/mcp/connections',config.authOrigin);
        const browser=jar.get(GOOGLE_BROWSER);
        if (!transactions || !validTransactionId(browser)) throw Error('Google transaction service required');
        const flow=await startGoogle(config,next,jar.get(ACCESS),raw);
        if (!await transactions.create(await sessionFingerprint(browser),flow.context)) throw Error('Google login already pending or capacity reached');
        changes.push(cookie(GOOGLE_FLOW,flow.context.id,300),cookie(CSRF,'',0));
        response=new Response(null,{status:303,headers:{Location:flow.destination}});
      } else if (url.pathname === GOOGLE_CALLBACK && request.method === 'GET') {
        const id=jar.get(GOOGLE_FLOW),browser=jar.get(GOOGLE_BROWSER);
        if (!transactions || !validTransactionId(id) || !validTransactionId(browser)) callbackFailure('CB_TRANSACTION_REQUIRED');
        // Atomic consume before parsing/exchange. Failures never resurrect a transaction.
        const flow=googleContext(await callbackStep('CB_TRANSACTION_TAKE',async()=>transactions.take(await sessionFingerprint(browser),id)),url,value=>returnPath(value,config.authOrigin));
        // Starting/finishing under different browser sessions must not silently switch accounts.
        if(await sessionFingerprint(jar.get(ACCESS))!==flow.session) callbackFailure('CB_SESSION_BINDING');
        if(flow.owner && await firstPartyIdentity(config,raw,jar.get(ACCESS)!)!==flow.owner) callbackFailure('CB_EXISTING_IDENTITY');
        const result=await callbackStep('CB_EXCHANGE_REQUEST',()=>raw('/auth/v1/token?grant_type=pkce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auth_code:flow.code,code_verifier:flow.verifier})}));
        if(!result.ok) callbackFailure('CB_EXCHANGE_STATUS');
        const data=await callbackStep('CB_EXCHANGE_JSON',()=>result.json()) as {access_token?:string;refresh_token?:string;user?:{id?:string}};
        if(!data?.access_token || !data?.refresh_token || !data?.user?.id) callbackFailure('CB_EXCHANGE_FIELDS');
        const owner=await firstPartyIdentity(config,raw,data.access_token);
        if(owner!==data.user.id || (flow.owner && owner!==flow.owner)) callbackFailure('CB_ACCOUNT');
        callbackStage='CB_RESPONSE';
        response=new Response(null,{status:303,headers:{Location:config.authOrigin+flow.next}});
        changes.push(cookie(ACCESS,data.access_token),cookie(REFRESH,data.refresh_token),cookie(CSRF,'',0));
      } else if (url.pathname === '/' || url.pathname === '/login') {
        const next = returnPath(url.searchParams.get('return_to') || '/oauth/mcp/connections', config.authOrigin);
        if (request.method === 'GET') {
          if (!validTransactionId(jar.get(GOOGLE_BROWSER))) changes.push(cookie(GOOGLE_BROWSER,random(),1800));
          const csrf = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
          changes.push(cookie(CSRF,csrf,600));
          response = page(`<section class="card"><div class="head">${brand}<h1>Sign in to connect your AI assistant</h1><p class="muted">Use the same account as your diary app.</p></div><div class="foot">
<form method="post" action="/auth/google"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="return_to" value="${escape(next)}"><button class="btn primary">Continue with Google</button></form>
<div class="or">or</div>
<form class="fields" method="post" action="/login"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="return_to" value="${escape(next)}"><label>Email <input type="email" name="email" autocomplete="username" required></label><label>Password <input type="password" name="password" autocomplete="current-password" required></label><button class="btn">Sign in with email</button></form></div></section>`);
        } else {
          if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw Error('Form required');
          const reader = request.body?.getReader(); let body = '', size = 0; const decoder = new TextDecoder();
          if (reader) for (;;) {const {done,value}=await reader.read(); if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw Error('Form too large');}body+=decoder.decode(value,{stream:true});}
          const form = new URLSearchParams(body), csrf = form.get('csrf');
          if (!csrf || csrf !== jar.get(CSRF) || !/^[a-f0-9]{64}$/.test(csrf)) throw Error('Invalid CSRF');
          const email = form.get('email'), password = form.get('password');
          if (!email || email.length>254 || !password || password.length>4096) throw Error('Invalid credentials');
          const destination = returnPath(form.get('return_to') || '/oauth/mcp/connections', config.authOrigin);
          await save(await raw('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})}));
          changes.push(cookie(CSRF,'',0)); response = new Response(null,{status:303,headers:{Location:config.authOrigin+destination}});
        }
      } else if (url.pathname === '/logout' && request.method === 'POST') {
        const bearer = await token();
        const result = await raw('/auth/v1/logout?scope=local',{method:'POST'},bearer);
        if (!result.ok && ![401,403].includes(result.status)) throw Error('Logout failed');
        if (transactions && validTransactionId(jar.get(GOOGLE_BROWSER)) && validTransactionId(jar.get(GOOGLE_FLOW))) await transactions.take(await sessionFingerprint(jar.get(GOOGLE_BROWSER)),jar.get(GOOGLE_FLOW)!);
        clear();changes.push(cookie(CSRF,'',0),cookie(GOOGLE_FLOW,'',0),cookie(GOOGLE_BROWSER,'',0));response = page('<h1>Signed out</h1><a class="btn primary" href="/login">Sign in again</a>');
      } else if (['/oauth/mcp/consent','/oauth/mcp/connections','/oauth/mcp/approve'].includes(url.pathname)) {
        let client: string | undefined;
        const validateAuthorization = async (data: import('../worker/mcp-consent').Authorization, path:string, bearer:string, owner:string) => {
          if (data.redirect_url && data.user?.id && data.user.id!==owner) throw Error('Authorization account mismatch');
          if (data.client?.id) {
            if (!config.clients.includes(data.client.id)) throw Error('Client not permitted');
            client=data.client.id;
            if(data.redirect_uri && !config.redirects[client]?.includes(data.redirect_uri)) throw Error('Unexpected registered redirect');
          }
          if(data.redirect_url) {
            if(!client) {
              const match=/^\/auth\/v1\/oauth\/authorizations\/([A-Za-z0-9_-]{1,200})$/.exec(path);
              if(!match) throw Error('Client redirect cannot be verified');
              // Native Auth omits client metadata on existing-consent GETs.
              // Recover binding from the live-user/consent constrained database,
              // never from callback matching or caller-supplied client identity.
              const result=await raw('/rest/v1/rpc/mfd_mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'authorization_binding',args:{authorization_id:match[1]}})},bearer);
              if(!result.ok) throw Error('Authorization binding unavailable');
              const binding=await result.json() as {client_id?:string;redirect_uri?:string};
              if(!binding?.client_id || !config.clients.includes(binding.client_id) || typeof binding.redirect_uri!=='string' || !config.redirects[binding.client_id]?.includes(binding.redirect_uri)) throw Error('Unregistered authorization binding');
              client=binding.client_id;
            }
            const target=new URL(data.redirect_url);
            for(const key of ['code','state','iss','error','error_description']) target.searchParams.delete(key);
            if(!config.redirects[client]?.includes(target.href)) throw Error('Unregistered callback');
          }
        };
        response = await handleMcpConsent(request,raw,token,config.authOrigin,false,validateAuthorization);
        if (response.status === 401) {
          const next = returnPath(url.pathname+url.search,config.authOrigin);
          response = page(`<p>Sign in to your diary account to continue.</p><a class="btn primary" href="/login?return_to=${escape(encodeURIComponent(next))}">Sign in</a>`,401);
        }
      } else response = privateJson({error:'Not found'},404);
    } catch (error) {
      response = page('<p>Request could not be completed. Check sign-in or start a new authorization. No new diary access is confirmed.</p>',400);
      if (new URL(request.url).pathname === GOOGLE_CALLBACK && request.method === 'GET') {
        const code=error instanceof CallbackFailure ? error.code : callbackStage;
        // Only compile-time identifiers: no exception message, cause or request data.
        response=page('<p>Request could not be completed. No new diary access is confirmed.</p><p>Diagnostic: '+code+'</p>',400);
        response.headers.set('X-MFD-Callback-Diagnostic',code);
      }
    }
    const headers = new Headers(response.headers);
    // Native form POSTs under no-referrer use Origin:null. Preserve the exact
    // origin check by sending only the origin from form documents. Callback and
    // POST/redirect responses retain no-referrer to protect codes/context.
    // The connections page's POST answers (undo review) hold forms too; they need the same Origin behaviour.
    const formDocument=(request.method==='GET' || (request.method==='POST' && new URL(request.url).pathname==='/oauth/mcp/connections')) && ['/', '/login','/oauth/mcp/consent','/oauth/mcp/connections',AUTHORIZE].includes(new URL(request.url).pathname) && response.headers.get('Content-Type')?.startsWith('text/html');
    headers.set('Cache-Control','private, no-store');headers.set('CDN-Cache-Control','no-store');headers.set('Referrer-Policy',formDocument?'strict-origin':'no-referrer');headers.set('X-Content-Type-Options','nosniff');
    const formTargets=["'self'"];
    if(formDocument){
      const path=new URL(request.url).pathname;
      // Chrome enforces form-action across redirects. Only the fixed Google
      // federation endpoints and configured native callback paths may follow.
      if(path==='/' || path==='/login') formTargets.push(config.supabase+'/auth/v1/authorize','https://accounts.google.com');
      for(const source of extraFormTargets) if(/^https?:\/\/[a-zA-Z0-9:/._~%\[\]-]+$/.test(source)) formTargets.push(source);
      if(path==='/oauth/mcp/consent' && !oauth) for(const uri of Object.values(config.redirects).flat()){
        const target=new URL(uri),source=target.origin+target.pathname;
        if(!/^[a-zA-Z0-9:/._~%\[\]-]+$/.test(source)) throw Error('Unsafe form callback source');
        formTargets.push(source);
      }
    }
    const html=response.headers.get('Content-Type')?.startsWith('text/html');
    headers.set('Content-Security-Policy',"default-src 'none'; "+(html?await uiPolicy()+'; ':'')+"form-action "+[...new Set(formTargets)].join(' ')+"; base-uri 'none'; frame-ancestors 'none'");
    headers.set('Strict-Transport-Security','max-age=31536000');
    for (const value of changes) headers.append('Set-Cookie',value);
    return new Response(response.body,{status:response.status,headers});
  };
}
