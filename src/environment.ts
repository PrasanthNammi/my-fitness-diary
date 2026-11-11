import deployment from '../hosting/independent/environment.json';
// This checkout has one explicit deployment configuration; no production fallback.
const defaults = {...deployment};
export function environment(overrides: Record<string, unknown> = {}) {
 const config = {...defaults, ...deployment};
 for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
  if (typeof overrides[key] === 'string') config[key] = overrides[key] as string;
 }
 if (!config.MFD_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) throw Error('Publishable key required');
 if (deployment.MFD_ENV === 'staging') {
  for (const key of ['MFD_ENV','MFD_SUPABASE_URL','MFD_SUPABASE_PUBLISHABLE_KEY','MFD_OAUTH_ISSUER','MFD_SITE_ORIGIN','MFD_MCP_RESOURCE_URL'] as const) {
   if (config[key] !== deployment[key]) throw Error('Staging isolation configuration mismatch');
  }
 }
 if (config.MFD_OAUTH_ISSUER !== config.MFD_SUPABASE_URL + '/auth/v1' || config.MFD_MCP_RESOURCE_URL !== config.MFD_SITE_ORIGIN + '/mcp') throw Error('OAuth configuration mismatch');
 return config;
}
