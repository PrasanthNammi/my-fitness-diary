import {integrationConfig} from './config';
import {localRateGate} from './limits';
import {createMcpService} from './service';
import {privateJson} from './service';
import {edgeRequest} from './edge-routing';
// Built as a self-contained Web API bundle: no Sites/Vinext/Node runtime required.
declare const Deno: {env: {toObject(): Record<string, string>}; serve(handler: (request: Request) => Promise<Response>): void};
const config = integrationConfig(Deno.env.toObject());
const service = createMcpService(config, globalThis.fetch.bind(globalThis), localRateGate());
Deno.serve(request => {
  const normalized = edgeRequest(request, config);
  return normalized ? service(normalized) : Promise.resolve(privateJson({error:'Unexpected Edge runtime authority or route'},421));
});
