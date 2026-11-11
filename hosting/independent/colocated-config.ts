import {integrationConfig, RESOURCE, type IntegrationConfig} from './config';
// Separate explicit deployment profile; the existing split-host validator stays
// pinned to Edge. Neither profile accepts both audiences or a caller's Host.
export function colocatedConfig(env: Record<string, unknown>): IntegrationConfig {
  const config = integrationConfig({...env, MFD_MCP_RESOURCE_URL: RESOURCE});
  if (env.MFD_MCP_RESOURCE_URL !== config.authOrigin + '/mcp') throw Error('Exact colocated audience required');
  return {...config, resource: config.authOrigin + '/mcp'};
}
