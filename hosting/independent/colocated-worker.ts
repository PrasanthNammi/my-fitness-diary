import {OAuthProvider, OAuthError} from '@cloudflare/workers-oauth-provider';
import {colocatedConfig} from './colocated-config';
import {createColocatedService, type CoordinatorNamespace} from './colocated-router';
import type {IntegrationConfig} from './config';
import {AUTHORIZE, TOKEN, REGISTER, refreshUpstream, type ConnectorProps} from './connector';
import {PERMISSIONS} from '../worker/mcp';
import {privateJson} from './service';
export {AbuseCoordinator} from './coordinator';
export {PushHub} from './push';
import {aiNotifier, handlePush} from './push';
const IDLE_EXPIRY = 90 * 86400;
// Only immutable deployment inputs/handler construction are cached, never users,
// bearer tokens, verified sessions or consent. Mutated inputs/bindings invalidate.
const keys=['MFD_ENV','MFD_MCP_WRITES','MFD_SUPABASE_URL','MFD_OAUTH_ISSUER','MFD_MCP_RESOURCE_URL','MFD_AUTH_ORIGIN','MFD_SUPABASE_PUBLISHABLE_KEY','MFD_ALLOWED_CLIENT_IDS','MFD_CLIENT_REDIRECTS','MFD_ABUSE'] as const;
type Entry={values:unknown[];fetcher:typeof fetch;config:IntegrationConfig;service:ReturnType<typeof createColocatedService>;provider:OAuthProvider<Record<string,unknown>>};

// AI apps connect to this Worker's OAuth server (Client ID Metadata Documents; self-registration
// only without an app list, i.e. the sandbox) and get opaque tokens valid only at /mcp.
// A connection ends after 90 days without use, or when the user removes it.
export function connectorProvider(config: IntegrationConfig, service: ReturnType<typeof createColocatedService>, fetcher: typeof fetch) {
  return new OAuthProvider<Record<string,unknown>>({
    apiRoute: '/mcp',
    apiHandler: {fetch: (request: Request, _env: unknown, ctx: ExecutionContext) => {const c = ctx as ExecutionContext & {props: ConnectorProps; auth?: {scope: string[]}}; return service.connectorMcp(request, c.props, c.auth?.scope ?? [], ctx);}},
    defaultHandler: {fetch: (request: Request, env: Record<string,unknown>) => service.auth(request, env.OAUTH_PROVIDER as never)},
    authorizeEndpoint: AUTHORIZE, tokenEndpoint: TOKEN, ...(config.aiClients ? {} : {clientRegistrationEndpoint: REGISTER}),
    scopesSupported: PERMISSIONS,
    resourceMetadata: {resource: config.resource, authorization_servers: [config.authOrigin]},
    clientIdMetadataDocumentEnabled: true,
    // Shorter than Supabase's 1 h access token, so every client refresh renews it upstream.
    accessTokenTTL: 1800,
    // Every refresh (any use within half an hour) pushes the end date out again.
    refreshTokenTTL: IDLE_EXPIRY, refreshTokenIdleTTL: IDLE_EXPIRY,
    tokenExchangeCallback: async ({grantType, props}) => {
      if (grantType !== 'refresh_token') return;
      const result = await refreshUpstream(config, fetcher, props as ConnectorProps);
      if (result.status === 'revoked') throw new OAuthError('invalid_grant', {description: 'Diary access was revoked'});
      if (result.status !== 'ok') throw new OAuthError('temporarily_unavailable', {description: 'Diary service unavailable', statusCode: 503, headers: {'Retry-After': '30'}});
      return {newProps: result.props};
    },
  });
}
// `localPush` lets the sandbox use a local fake push service; deployed Workers only accept browser push services.
export function connectorWorker(configOf: (env: Record<string, unknown>) => IntegrationConfig, gates?: Parameters<typeof createColocatedService>[3], {localPush = false} = {}) {
  const entries=new WeakMap<Record<string,unknown>,Entry>();
  return {async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    try {
      const fetcher=globalThis.fetch;
      let entry=entries.get(env);
      if(!entry || keys.slice(0,-1).some(key=>typeof env[key]!=='string') || entry.fetcher!==fetcher || keys.some((key,index)=>env[key]!==entry!.values[index])) {
        const config=configOf(env),service=createColocatedService(config,env.MFD_ABUSE as CoordinatorNamespace | undefined,fetcher.bind(globalThis),gates,aiNotifier(env));
        entry={values:keys.map(key=>env[key]),fetcher,config,service,provider:connectorProvider(config,service,fetcher.bind(globalThis))};entries.set(env,entry);
      }
      // Phone notifications: server-to-server from the MFD app, authenticated per user (push.ts).
      const url=new URL(request.url);
      if(url.pathname.startsWith('/push/')) return url.origin===entry.config.authOrigin ? await handlePush(request,env,entry.config,fetcher.bind(globalThis),localPush) : privateJson({error:'Wrong service origin'},421);
      const denied=await entry.service.guard(request,true);
      if(denied) return denied;
      const response=await entry.provider.fetch(request,env,ctx);
      if(response.status===401&&url.pathname==='/mcp') ctx?.waitUntil(entry.service.refused(request));
      return response;
    } catch {return privateJson({error:'Invalid staging service configuration'},503);}
  }};
}
export default connectorWorker(colocatedConfig);
