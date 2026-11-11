import type {GoogleTransaction} from './google-transactions';
import {iconResponse} from './icon';
import type {IntegrationConfig} from './config';
import {createAuthService} from './auth';
import {createConnectorMcpService, createMcpService, privateJson, type OnWrite} from './service';
import {AUTHORIZE, UPSTREAM_CALLBACK, TOKEN, REGISTER} from './connector';
import {localRateGate, type RateGate} from './limits';

export interface CoordinatorNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): {consume(kind: string): Promise<boolean>; createGoogle?(browser:string,flow:GoogleTransaction):Promise<boolean>; takeGoogle?(browser:string,id:string):Promise<GoogleTransaction|null>};
}
const localMcp = localRateGate(), localAuth = localRateGate(30);
export function createColocatedService(config: IntegrationConfig, namespace: CoordinatorNamespace | undefined, fetcher: typeof fetch, gates: {mcp: RateGate; auth: RateGate} = {mcp: localMcp, auth: localAuth}, onWrite?: OnWrite) {
  const stub=()=>{if(!namespace) throw Error('Missing transaction coordinator');return namespace.get(namespace.idFromName('mfd-staging-shared-v1'));};
  async function timed<T>(operation:Promise<T>) {let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Transaction timeout')),2000);})]);}finally{if(timer!==undefined)clearTimeout(timer);}}
  const transactions={create:async(browser:string,flow:GoogleTransaction)=>{const target=stub();if(!target.createGoogle)throw Error('Missing transaction RPC');return timed(target.createGoogle(browser,flow));},take:async(browser:string,id:string)=>{const target=stub();if(!target.takeGoogle)throw Error('Missing transaction RPC');return timed(target.takeGoogle(browser,id));}};
  const mcp = createMcpService(config,fetcher,gates.mcp), auth = createAuthService(config,fetcher,gates.auth,transactions);
  const connectorMcp = createConnectorMcpService(config,fetcher,gates.mcp,onWrite);
  // Shared origin/route/quota guard. null = allowed; the caller then routes the request.
  async function guard(request: Request, connector = false): Promise<Response | null> {
    try {
      const url = new URL(request.url);
      if (url.origin !== config.authOrigin || config.resource !== config.authOrigin+'/mcp') return privateJson({error:'Wrong service origin'},421);
      // The connector's public icon is answered here directly (a response ends the request).
      const icon = connector ? iconResponse(url.pathname, request.method) : null;
      if (icon) return icon;
      const discovery = ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp',...(connector?['/.well-known/oauth-authorization-server']:[])].includes(url.pathname);
      const authPath = ['/','/login','/logout','/auth/google','/auth/google/callback','/oauth/mcp/consent','/oauth/mcp/connections','/oauth/mcp/approve',...(connector?[AUTHORIZE,UPSTREAM_CALLBACK,TOKEN,REGISTER]:[])].includes(url.pathname);
      if (!discovery && url.pathname!=='/mcp' && !authPath) return privateJson({error:'Not found'},404);
      // Token/registration requests come from AI-app servers, not browsers; they send no Origin.
      if (request.headers.has('origin') && request.headers.get('origin') !== config.authOrigin) return privateJson({error:'Invalid origin'},403);
      if (!namespace) return privateJson({error:'Abuse control unavailable'},503);
      const stub = namespace.get(namespace.idFromName('mfd-staging-shared-v1'));
      // No local fallback. Timeout/outage/quota errors cannot reach Auth or RPC.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let allowed: boolean;
      try {
        allowed = await Promise.race([stub.consume(discovery?'discovery':authPath?'auth':'mcp'),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Coordinator timeout')),2000);})]);
      } finally {if (timer !== undefined) clearTimeout(timer);}
      if (allowed !== true) return privateJson({error:'Rate limited'},429,{'Retry-After':'60'});
      return null;
    } catch {return privateJson({error:'Service or abuse control unavailable'},503);}
  }
  // Direct Supabase-token mode (pre-connector). The deployed entry uses guard/auth/connectorMcp.
  const service = async (request: Request): Promise<Response> => {
    const denied = await guard(request); if (denied) return denied;
    const path = new URL(request.url).pathname;
    return path === '/mcp' || path.startsWith('/.well-known/') ? mcp(request) : auth(request);
  };
  return Object.assign(service, {guard, auth, connectorMcp});
}
