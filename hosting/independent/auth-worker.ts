import {integrationConfig} from './config';
import {localRateGate} from './limits';
import {createAuthService} from './auth';
// Separate HTTPS host candidate, not a Sites entrypoint. No hosting account,
// routes, bindings or deployment manifest are provisioned by this module.
const gate = localRateGate(30);
const worker = {async fetch(request: Request, env: Record<string, unknown>) {
  return createAuthService(integrationConfig(env), globalThis.fetch.bind(globalThis), gate)(request);
}};
export default worker;
