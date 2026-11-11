import type {IntegrationConfig} from './config';
// Supabase CLI 2.122.0 / Edge Runtime 1.77.8 forwards these exact internal
// loopback routes. Never derive the public resource from forwarded/Host headers.
// Unknown runtime authorities fail closed and need a separately reviewed mapping.
export function edgeRequest(request: Request, config: IntegrationConfig): Request | null {
  const incoming = new URL(request.url), resource = new URL(config.resource);
  if (incoming.origin === resource.origin) return request;
  if (incoming.origin !== 'http://127.0.0.1:8081') return null;
  const paths = ['/mfd-mcp/mcp', '/mfd-mcp/.well-known/oauth-protected-resource', '/mfd-mcp/.well-known/oauth-protected-resource/mcp'];
  if (!paths.includes(incoming.pathname)) return null;
  const target = new URL(resource.origin);
  target.pathname = '/functions/v1' + incoming.pathname; target.search = incoming.search;
  return new Request(target, request);
}
