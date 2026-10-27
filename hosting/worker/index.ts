import handler from "vinext/server/fetch-handler";
import {handleMfd} from './mfd';
import appHTML from '../public/index.html?raw';
import legacyHTML from '../public/legacy/index.html?raw';
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handleMfd(request, {env: env as any, fetch: globalThis.fetch.bind(globalThis), mcpWrites: (env as any).MFD_MCP_WRITES === 'true', assets: {fetch: (r: Request) => {
      const path=new URL(r.url).pathname;
      const html=['/','/index.html'].includes(path)?appHTML:['/legacy/','/legacy/index.html'].includes(path)?legacyHTML:null;
      if(html!==null)return Promise.resolve(new Response(r.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}}));
      return (env as any).ASSETS?.fetch(r) || handler.fetch(r,env,ctx);
    }}}));
  },
};

export default worker;

