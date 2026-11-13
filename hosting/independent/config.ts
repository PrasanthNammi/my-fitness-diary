// Isolated integration configuration. Never changes the private Sites build.
// The deployment profile is fixed at build time: staging by default; the production bundle
// is built with __MFD_DEPLOYMENT__ defined (scripts-build-independent.cjs), so neither
// artifact can be pointed at the other project by changing runtime variables.
declare const __MFD_DEPLOYMENT__: {env: string; supabase: string; origin?: string; app?: string} | undefined;
const DEPLOYMENT = typeof __MFD_DEPLOYMENT__ === 'object' ? __MFD_DEPLOYMENT__ : {env: 'staging', supabase: 'https://gngnrmzeghjzqsmzuktl.supabase.co', app: 'https://mfd-oauth-testing.paleriver512.chatgpt.site'};
export const SUPABASE = DEPLOYMENT.supabase;
/** The diary app people sign up in (linked from the connector's sign-in page). */
export const APP_ORIGIN = DEPLOYMENT.app ?? null;
export const RESOURCE = SUPABASE + '/functions/v1/mfd-mcp/mcp';
export type IntegrationConfig = {supabase: string; issuer: string; resource: string; authOrigin: string; key: string; clients: string[]; redirects: Record<string, string[]>; aiClients?: string[]};
// AI apps allowed to connect, by client metadata document origin. Without it (sandbox only) any app may self-register.
export const AI_CLIENT_ORIGINS = ['https://chatgpt.com', 'https://claude.ai', 'https://claude.com'];
export function integrationConfig(env: Record<string, unknown>): IntegrationConfig {
  if (env.MFD_ENV !== DEPLOYMENT.env || env.MFD_MCP_WRITES !== 'false') throw Error('Deployment profile mismatch');
  if (env.MFD_SUPABASE_URL !== SUPABASE || env.MFD_OAUTH_ISSUER !== SUPABASE + '/auth/v1' || env.MFD_MCP_RESOURCE_URL !== RESOURCE) throw Error('Integration identity mismatch');
  if (typeof env.MFD_SUPABASE_PUBLISHABLE_KEY !== 'string' || !/^sb_publishable_[\w-]+$/.test(env.MFD_SUPABASE_PUBLISHABLE_KEY)) throw Error('Public publishable key required');
  const origin = new URL(String(env.MFD_AUTH_ORIGIN));
  if ((DEPLOYMENT.origin && origin.origin !== DEPLOYMENT.origin) || origin.protocol !== 'https:' || origin.origin !== env.MFD_AUTH_ORIGIN || origin.username || origin.password || origin.hostname.endsWith('.supabase.co') || origin.hostname.endsWith('.chatgpt.site')) throw Error('Separate HTTPS auth origin required');
  const clients: unknown = JSON.parse(String(env.MFD_ALLOWED_CLIENT_IDS));
  if (!Array.isArray(clients) || !clients.length || clients.length > 32 || clients.some(c => typeof c !== 'string' || !/^[\w-]{1,200}$/.test(c)) || new Set(clients).size !== clients.length) throw Error('Explicit preregistered client IDs required');
  const redirects = JSON.parse(String(env.MFD_CLIENT_REDIRECTS)) as Record<string, unknown>;
  if (!redirects || typeof redirects !== 'object' || Array.isArray(redirects) || Object.keys(redirects).length !== clients.length) throw Error('Exact callback inventory required');
  for (const client of clients) {
    const list = redirects[client];
    if (!Array.isArray(list) || !list.length || list.length > 8) throw Error('Callback allowlist required');
    for (const value of list) {
      const uri = new URL(value);
      if (uri.username || uri.password || uri.hash || uri.href !== value || !((uri.protocol === 'https:') || (uri.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)))) throw Error('Unsafe callback');
      if (['code','state','iss','error','error_description'].some(key => uri.searchParams.has(key))) throw Error('Callback cannot predefine OAuth response parameters');
    }
  }
  return {supabase: SUPABASE, issuer: SUPABASE + '/auth/v1', resource: RESOURCE, authOrigin: origin.origin, key: env.MFD_SUPABASE_PUBLISHABLE_KEY, clients, redirects: redirects as Record<string, string[]>, aiClients: AI_CLIENT_ORIGINS};
}
