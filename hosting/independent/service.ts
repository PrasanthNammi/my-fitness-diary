import {handleMcp, serveMcp, PERMISSIONS} from '../worker/mcp';
import type {IntegrationConfig} from './config';
import type {ConnectorProps} from './connector';
import type {RateGate} from './limits';
import {tokenKey} from './limits';

export function privateJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, {status, headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...extra}});
}
export function integrationUpstream(config: IntegrationConfig, fetcher: typeof fetch) {
  return (path: string, init: RequestInit = {}, token?: string) => fetcher(config.supabase + path, {
    ...init, headers: {...Object.fromEntries(new Headers(init.headers)), apikey: config.key, Authorization: 'Bearer ' + (token || config.key)},
    redirect: 'manual', signal: AbortSignal.timeout(20_000),
  });
}
// /mcp behind the Worker's OAuth server: the provider already verified the AI app's opaque
// token for this resource. The stored Supabase session reads the diary; the RPC still
// enforces live session, Worker client, audience and this connection's section consent.
/** Called after an AI app successfully adds something (used for phone notifications). */
export type OnWrite = (userId: string, connection: string, operation: string, args: Record<string, unknown>) => Promise<void>;
const ADDS = new Set(['log_workout', 'create_routine', 'log_meal', 'log_weight', 'suggest_workout_targets', 'start_workout', 'log_water', 'log_measurements', 'move_routine', 'edit_routine', 'change_settings']);
export function createConnectorMcpService(config: IntegrationConfig, fetcher: typeof fetch, gate: RateGate, onWrite?: OnWrite) {
  const raw = integrationUpstream(config, fetcher);
  const challenge = `Bearer error="invalid_token", resource_metadata="${config.authOrigin}/.well-known/oauth-protected-resource/mcp"`;
  return async (request: Request, props: ConnectorProps, scope: string[], ctx?: ExecutionContext): Promise<Response> => {
    try {
      if (!props?.sb?.access || !props.connection) return privateJson({error: 'Invalid or missing MCP access token'}, 401, {'WWW-Authenticate': challenge});
      if (!await gate.allow('all') || !await gate.allow(await tokenKey(props.userId + ' ' + props.connection))) return privateJson({error: 'Rate limited'}, 429, {'Retry-After': '60'});
      let expired = false, throttled = false;
      const call = async (operation: string, args: Record<string, unknown>) => {
        const r = await raw('/rest/v1/rpc/mfd_mcp', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({operation, args: {...args, connection: props.connection}})}, props.sb.access);
        if (r.status === 401) expired = true;
        if (r.status === 429) throttled = true;
        if (r.ok && onWrite && ADDS.has(operation)) ctx?.waitUntil(onWrite(props.userId, props.connection, operation, args));
        return r;
      };
      const response = await serveMcp(request, {origin: config.authOrigin, writes: false, sections: PERMISSIONS.filter(s => scope.includes(s)), call});
      // Upstream session expired before the client refreshed: make the client refresh now.
      if (expired) return privateJson({error: 'Access token expired'}, 401, {'WWW-Authenticate': challenge});
      if (throttled) return privateJson({error: 'Upstream rate limited'}, 429, {'Retry-After': '60'});
      if (!response.headers.get('content-type')?.includes('application/json')) return response;
      // Only tools/list replies carry inputSchema; skip parsing large data replies (free-plan CPU budget).
      const body = await response.text();
      if (!body.includes('"inputSchema"')) return new Response(body, response);
      const payload = JSON.parse(body) as {result?: {tools?: Record<string, unknown>[]}};
      if (!payload.result?.tools) return new Response(body, response);
      for (const tool of payload.result.tools) tool.securitySchemes = [{type: 'oauth2', scopes: []}];
      return privateJson(payload, response.status);
    } catch {return privateJson({error: 'MCP service unavailable'}, 503);}
  };
}
export function createMcpService(config: IntegrationConfig, fetcher: typeof fetch, gate: RateGate) {
  const endpoint = new URL(config.resource), prefix = endpoint.pathname.slice(0, -4);
  const metadataPath = prefix + '/.well-known/oauth-protected-resource/mcp';
  const challenge = `Bearer resource_metadata="${endpoint.origin}${metadataPath}"`;
  const deny = () => privateJson({error: 'Invalid or missing MCP access token'}, 401, {'WWW-Authenticate': challenge});
  const raw = integrationUpstream(config, fetcher);
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.origin !== endpoint.origin) return privateJson({error: 'Wrong resource origin'}, 421);
      if (url.pathname === metadataPath || url.pathname === prefix + '/.well-known/oauth-protected-resource') {
        if (!['GET', 'HEAD'].includes(request.method)) return privateJson({error: 'Method not allowed'}, 405);
        const response = privateJson({resource: config.resource, authorization_servers: [config.issuer], bearer_methods_supported: ['header']});
        return request.method === 'HEAD' ? new Response(null, response) : response;
      }
      if (url.pathname !== endpoint.pathname || url.search) return privateJson({error: 'Not found'}, 404);
      if (request.headers.has('origin') && request.headers.get('origin') !== endpoint.origin) return privateJson({error: 'Invalid origin'}, 403);
      const token = /^Bearer ([^\s]{1,8192})$/.exec(request.headers.get('authorization') || '')?.[1];
      if (!await gate.allow('all')) return privateJson({error: 'Rate limited'}, 429, {'Retry-After': '60'});
      if (!token) return deny();
      if (!await gate.allow(await tokenKey(token))) return privateJson({error: 'Rate limited'}, 429, {'Retry-After': '60'});
      const verified = await raw('/auth/v1/user', {}, token);
      if (!verified.ok) return deny();
      const user = await verified.json() as {id?: string};
      let claims;
      try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return deny(); }
      if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return deny();
      if (!user.id || claims.sub !== user.id || claims.iss !== config.issuer || claims.aud !== config.resource || claims.role !== 'authenticated' || typeof claims.session_id !== 'string' || !claims.session_id || !config.clients.includes(claims.client_id) || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > Date.now() / 1000))) return deny();
      // Reuse the verified response only within THIS request. The business handler
      // still executes the same live-session/consent/owner-enforcing data RPC.
      let authorizationDenied = false;
      const upstream = async (path: string, init?: RequestInit, bearer?: string) => {
        if (path === '/auth/v1/user') return Response.json(user);
        const response = await raw(path, init, bearer);
        if ([401,403].includes(response.status)) authorizationDenied = true;
        if (response.status === 429) throw new Error('upstream-rate-limit');
        return response;
      };
      let throttled = false;
      const checked = async (path: string, init?: RequestInit, bearer?: string) => {
        try { return await upstream(path, init, bearer); } catch (error) {
          if (error instanceof Error && error.message === 'upstream-rate-limit') throttled = true;
          throw error;
        }
      };
      // Validate the envelope without ever buffering more than the transport cap.
      // Unknown methods/tool arguments remain the shared handler's responsibility.
      const reader = request.body?.getReader(); let text = '', size = 0;
      const decoder = new TextDecoder();
      if (reader) for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 16384) {await reader.cancel(); return privateJson({error:'Request too large'},413);}
        text += decoder.decode(part.value,{stream:true});
      }
      text += decoder.decode();
      let toolsList = false;
      try {
        const message = JSON.parse(text);
        toolsList = message?.method === 'tools/list';
        if (message && message.params !== undefined && (!message.params || typeof message.params !== 'object' || Array.isArray(message.params))) return privateJson({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid params'}},400);
      } catch { /* Shared handler emits the standard parse error below. */ }
      const local = new URL(request.url); local.pathname = '/mcp';
      const response = await handleMcp(new Request(local, {method:request.method,headers:request.headers,...(['GET','HEAD'].includes(request.method)?{}:{body:text})}), checked, endpoint.origin, false, config.issuer, config.resource);
      if (throttled) return privateJson({error: 'Upstream rate limited'}, 429, {'Retry-After': '60'});
      // Only locally generated tool definitions/denial envelopes need decoration.
      // Successful reads/initialize/ping keep their original response untouched.
      // Consume once when decorating: clone() tees a stream we never otherwise need.
      if ((toolsList || authorizationDenied) && response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.text();
        const payload = JSON.parse(body) as {result?: {tools?: Record<string, unknown>[]; isError?: boolean; _meta?: Record<string, unknown>}};
        if (payload.result?.tools) {
          for (const tool of payload.result.tools) tool.securitySchemes = [{type:'oauth2',scopes:[]}];
          return privateJson(payload,response.status);
        }
        if (authorizationDenied && payload.result?.isError) {
          payload.result._meta = {'mcp/www_authenticate':[challenge + ', error="insufficient_scope", error_description="MFD session or section consent required"']};
          return privateJson(payload,response.status);
        }
        return new Response(body,response);
      }
      return response;
    } catch { return privateJson({error: 'MCP service unavailable'}, 503); }
  };
}
