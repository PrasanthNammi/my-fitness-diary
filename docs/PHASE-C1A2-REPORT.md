# Phase C.1A.2 — Provider-independent MCP local implementation

Date: 2026-10-28 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Architecture B has an isolated local implementation with passing synthetic security/regression checks. Deployment is NOT ready.** The MCP core and separate login/consent handler are prepared; HTML hosting, native Edge runtime/gateway verification, distributed abuse protection and real client registration/acceptance remain blocked. No provider compatibility is claimed from local mocks.

No hosted database or configuration was queried/changed in this phase. No SQL migration, OAuth activation, registration, hosted user creation, deployment, Site publication/access change, write enablement, paid resource, commit, push, merge or backup deletion occurred. Production was not contacted. The existing private Site's entrypoint, manifests, environment, frontend and shared business handlers were not edited. Existing B/B.1/C candidate changes were preserved. All database mutations mentioned below occurred only in disposable synthetic local fixtures.

## Architecture implemented locally

Two isolated Web API entrypoints reuse the existing business logic:

- `hosting/independent/edge.ts`: Supabase Deno.serve adapter for the MCP service; no Sites identity or dispatch dependency.
- `hosting/independent/auth-worker.ts`: separate HTTPS Worker candidate for existing-user login, consent and connection management. Not added to any Site manifest or provisioned account.
- `service.ts` wraps existing `hosting/worker/mcp.ts`; `auth.ts` wraps existing `hosting/worker/mcp-consent.ts`. No provider-specific diary tools or RPCs were duplicated.

The one proposed new resource is:

`https://gngnrmzeghjzqsmzuktl.supabase.co/functions/v1/mfd-mcp/mcp`

This is a **candidate route**, not a deployed URL or existing function. Config pins exactly this staging audience and issuer. The current hosted resource remains the private Site URL. `staging.example.json` deliberately has an invalid auth origin, placeholder public key and empty client inventories; it fails startup until independently reviewed settings are supplied. No real client ID or secret was added.

MCP resource metadata is served beneath the function prefix at `/functions/v1/mfd-mcp/.well-known/oauth-protected-resource/mcp` (and its root alias). The Bearer challenge advertises that exact metadata URL. It points to Supabase's issuer; authorization-server discovery remains Supabase's responsibility, rather than fabricated/proxied metadata. Only MCP discovery is anonymous. All tool/initialize/ping requests require verified Bearer; generic 404/401/429 errors contain no diary information.

## Hosting design and established constraints

[Supabase's official MCP walkthrough](https://supabase.com/docs/guides/ai-tools/byo-mcp) documents stateless Streamable HTTP, OAuth resource discovery, application token verification and RLS-scoped requests. It also explains why a default gateway JWT gate can block anonymous discovery. Any future `verify_jwt=false` setting would require the reviewed application validator on every protected path; it must never make diary tools anonymous. No active gateway/deployment config was written or changed.

The Edge bundle uses Web APIs and Deno.serve, with no runtime Node/Vinext/Sites/SQL driver dependency. Existing esbuild creates self-contained artifacts. **Deno is not installed in this environment**, so native Deno, Supabase gateway path/origin rewriting, cookie/header behavior and deployed time/resource limits have not been verified. VM execution with a Deno.serve double is additional local evidence, not a managed runtime rehearsal. Exact canonical-origin guards must be tested against the real local Edge runtime before deployment; do not remove them to make routing work.

[Edge limits](https://supabase.com/docs/guides/functions/limits) currently include 256 MB memory, 2 seconds CPU/request, 150-second Free worker duration and 150-second idle timeout, with bundle size caps. Stateless JSON replies and a 20-second upstream timeout fit the intended model, but no native performance certification is claimed. Built integration artifacts are approximately 18 KB MCP and 22 KB auth, far below the function size caps.

**HIGH — HTML hosting constraint:** the shared Supabase function domain rewrites HTML responses. [Custom domains](https://supabase.com/docs/guides/platform/custom-domains) are a paid add-on and are not intended as general frontend hosting. Therefore a complete MCP + browser authorization system cannot be promised on Supabase Free alone. Auth-worker is prepared for a separate HTTPS host; a [Cloudflare Worker](https://developers.cloudflare.com/workers/platform/pricing/) is a candidate. Its account/entitlements and runtime must be reviewed before selection. No domain, Worker, account, binding or paid add-on was created. The private Site remains private and is not a login proxy for other users.

If Edge cannot pass gateway/runtime/abuse-control rehearsal, evaluate placing both isolated handlers on a separate HTTPS Worker. That would require a new exact reviewed audience/config plan; current guards intentionally reject an arbitrary Worker resource. This fallback was not implemented or deployed.

## Authentication and consent design

External clients perform authorization-code **S256 PKCE**, state validation, exact registered callback and token exchange/refresh with Supabase. MFD does not implement its own OAuth issuer or handle client secrets. OIDC nonce validation belongs to a client consuming an ID token. No hosted flow is proven here. [Supabase flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows).

The separate auth handler provides existing-user password login only; it does not create accounts, add social providers or replace the diary UI. A bounded same-origin form uses a random 32-byte CSRF value bound to a Secure/HttpOnly/Host-prefixed cookie. Email/password go only to the pinned staging Auth endpoint, never into URLs or response bodies. Fixed relative continuation routes preserve the pending authorization ID and reject external redirects. There is necessarily a public login form to bootstrap authentication, but no anonymous diary/connection data.

Integration-specific access/refresh cookies are isolated from the private Site, Secure, HttpOnly, SameSite=Lax, Path=/, without Domain. Refresh replaces both cookies; terminal Auth failures clear them. Tokens are neither logged nor exposed to JavaScript. Responses use no-store, no-referrer, CSP with self-only forms and no framing, nosniff and HSTS. Exact Origin/cross-site checks protect POSTs; body limits are 8 KiB login and 4 KiB inherited consent. First-party consent sessions additionally require the staging issuer, authenticated audience, no OAuth client claim and unexpired session claims; Supabase verifies the bearer and SQL enforces live session ownership when managing grants.

The existing consent UI still shows the MFD account, verified client, redirect and initially unchecked diary sections. New configuration requires an explicit local client/callback inventory. Authorization details must identify an allowed client and exact registered redirect; returned native callbacks must match that inventory after stripping only OAuth response parameters. Native approval/redirect verification precede local permission expansion. A consumed authorization lacking enough redirect identity fails closed and requires starting a fresh flow.

Manage connections reuses local revoke-first/native revoke-second behavior. Logout revokes the first-party session then clears isolated cookies. Both proposal review/approval routes stay disabled. Existing native/local consent nontransactionality remains: native success/local failure requires revoke/reconnect. Concurrent browser refresh and genuine consent/revocation races remain hosted acceptance items.

## OAuth registration compatibility

One standards-based MCP handler serves all clients. No provider identity is treated as an MFD account and no client can choose an owner ID. **Predefined registration remains a candidate, not established MFD compatibility.** DCR remains disabled; no CIMD/private-key assertion support was assumed or added.

| Client | Official evidence | Still blocked/unverified |
| --- | --- | --- |
| ChatGPT | [Authentication guidance](https://developers.openai.com/plugins/build/auth) documents predefined clients, CIMD/DCR, S256, exact callback selection and tool linking | Actual account/workspace interface, callback, token-endpoint method, issuer-response behavior and native Supabase flow |
| Claude | [Connector guidance](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) offers own-client/published identity/automatic registration modes; remote service must be reachable from its cloud | Exact selected mode/callback and staging acceptance |
| Claude Code | [Official MCP docs](https://code.claude.com/docs/en/mcp) document preconfigured client IDs, optional public-client use and fixed callback ports | Installed version and callback hostname must match exactly; docs note localhost/127.0.0.1 behavior changed between releases |
| Gemini CLI | [Official docs](https://geminicli.com/docs/tools/mcp-server/) document configured clientId/redirectUri, discovery, refresh and issuer-response validation | Version-specific S256/resource handling, exact callback and Supabase acceptance; no Gemini web-app claim |
| Other MCP clients | Existing initialize-based Streamable HTTP versions 2025-03-26, 2025-06-18, 2025-11-25 reused | A compatible version, registration method and refresh flow must be demonstrated per client |

Tool listings now declare OAuth security schemes with no invented section scopes, and RPC 401/403 tool errors carry reauthorization challenge metadata. Identity scopes and MFD section grants remain separate. All metadata requests still require verified Bearer except discovery, preserving the current security contract. Client linking behavior under that contract needs actual acceptance; no anonymous tool listing was enabled to improve UX. Registered client IDs are bounded explicit strings, not arbitrary metadata URLs, so CIMD is intentionally not implemented.

## Security controls and rate limiting

- Config fails closed unless staging identity, exact resource, separate HTTPS auth origin, publishable key, nonempty client inventory, exact callbacks and writes=`false` are supplied. Production defaults, wildcard audiences and runtime target substitution are absent.
- MCP signature verification is delegated to pinned staging `/auth/v1/user` before decoded claims are used. Subject must match returned user; issuer, single audience, role, nonempty session, configured client, numeric expiry and not-before are checked. Verification is cached only inside one request. No service-role key or editable metadata authorization is used.
- Every private tool calls the same fixed public RPC with the caller's token. Its existing client registry, live session, current consent, owner derivation and revision checks remain authoritative. Metadata methods authenticate but do not independently query live database consent/session. Do not claim immediate metadata revocation.
- Strict bounded envelopes, params shape, tool argument allowlists and pagination remain. Unknown identity fields are rejected by the transport; direct SQL derives the owner. No arbitrary SQL, upstream URL, table or document mutation API exists. Repeated reads do not trigger mutation retries.
- New code hardcodes the reused business handler's writes argument false; config also requires false. Hosted DB writes were not changed. Existing proposal/approval/expiry/single-use architecture, RLS, storage/OAuth restrictions and private schemas remain untouched.
- Local limiter: MCP 60 request attempts/minute per isolate plus token-hash counters; auth 30/minute per isolate. Map has at most 1,024 keys, expires entries and rejects new keys at capacity instead of evicting active limits. No raw token/user data is stored in limiter keys. Request-body limits and generic errors apply; upstream 429 becomes 429/Retry-After without replay.

**HIGH — no distributed quota:** in-memory limits reset with isolate lifecycle and do not coordinate replicas. They bound local tests but are not a global anti-abuse guarantee. Auth cap is deliberately shared, so an attacker can exhaust an isolate's login budget. A reviewed platform/distributed limiter and ingress policy are mandatory before general rollout. The [Supabase rate-limiting example](https://supabase.com/docs/guides/functions/examples/rate-limiting) uses an external store; none was added. Do not add paid Redis, D1/KV, SQL counters or managed privileges implicitly. `RateGate` is injectable for a later verified implementation.

**MEDIUM — logging/hosting prerequisites:** no application code logs tokens, passwords, codes, user payloads or URLs. Provider access logs can still capture authorization_id/query strings and must be checked for redaction/retention before deployment. Use bounded route/status/timing diagnostics, not Request/header/body dumps. [Supabase logging](https://supabase.com/docs/guides/functions/logging). No paid log drain or observability resource was configured.

## Database resource transition plan — not applied

The existing hosted resource still names the private Site; local source is intentionally unusable against that old audience until an approved transition. Do not enable broad old/new acceptance to bridge them.

1. After selecting the actual MCP/auth hosts and client mode, obtain fresh read-only staging identity/catalog/ACL/policy/settings/hook evidence, exact Data API configuration and both false write switches. Verify recovery evidence; record current resource row, column default and client/grant/session counts without dumping secrets.
2. Confirm one settings row, exact current old audience, writes=false, unchanged hook/dispatcher definitions and privileges. Stop on drift. Review the new canonical URL and gateway routing before approving SQL. No installer replay or generic db push.
3. Prepare a new separately reviewed transaction: lock settings, assert the expected old resource and disabled writes, change **only** active resource_uri and its column default to the one new URL, assert exactly one row/new default/writes=false, notify schema cache if needed, commit. Do not alter users, grants, clients, RLS, policies, hook body, provider defaults or execution rights. Creation/execution of that migration needs explicit later approval and normal provenance procedure.
4. Existing access-token audience becomes invalid for the new endpoint; SQL also denies old-audience access through the old endpoint after the change. Old tokens are not cryptographically revoked by an audience edit. Refresh may mint new-audience tokens for registered clients; require an explicit reconnect/revocation plan. Hook continues to read the active setting; no broad audience array is introduced.
5. Under separately approved Auth configuration, point Site URL/authorization path to the **new auth UI**, register only exact reviewed callbacks and mirror client IDs into the existing SQL registry and service config. Activate the reviewed hook/signing settings only with approval; DCR stays disabled. Check first-party login redirects/email links for the project-wide Site URL change. Consent redirects remain client callbacks, never the private Site by default.
6. Require resource metadata, service validator, token hook output and DB setting/default to agree exactly. Private API schemas remain excluded and write switches false. Run approved synthetic hosted lifecycle/isolation tests before rollout.
7. Rollback requires stopping the new endpoint, recording/revoking newly issued client grants/tokens as approved, and an independently reviewed compare-and-set transaction restoring captured resource/default and Auth settings. Restoring the old audience could reaccept still-live old tokens; account for that explicitly. Never automatically overwrite the database with the pre-remediation backup or drop policies/tables.

Local `independent-mcp-database.cjs` rehearses new audience/hook behavior, old-audience denial, live session/client/consent checks, Alice/Bob isolation and transactional rollback. It does not execute the proposed hosted migration, change a live setting or prove hosted token invalidation.

## Local verification

Used Node 22.13.1 and existing locked packages. No dependency or lockfile changes/reinstallation. Independent build emits only ignored `.sites-runtime/independent/edge.js` and `auth-worker.js`; it rejects production references and secret-key/private-key markers. Existing Site build still uses `.sites-runtime/phase-b-dist`, never the old tracked root dist.

| Check | Result |
| --- | --- |
| Complete local test runner | **34/34 PASS**, including the original 32 files and two new suites |
| Independent security/consent tests | PASS: token failures/issuer/audience/expiry/nbf/client/session claims, owner arguments, missing consent, disabled writes, malformed/oversized traffic, duplicates, local rate expiry/capacity/429, login CSRF/cookies, exact callback, native failure, revoke-first, logout |
| Independent PostgreSQL fixture | PASS: both owners isolated, session/client/consent denial, OAuth direct-table restriction, disabled writes, new audience/hook, old audience denied, rollback |
| Existing migration/RLS/MCP/application suites | PASS in full runner; synthetic fixtures only |
| Frontend TypeScript | PASS |
| Worker TypeScript, including independent modules | PASS |
| Hosting ESLint | PASS, zero issues after local type/export corrections |
| Existing staging production build | PASS; output scan PASS |
| Independent neutral ESM bundles | PASS, approximately 18/22 KB; no new runtime dependency |
| Independent localhost smoke | PASS, seven requests to actual generated bundles, synthetic upstream only; server closes |
| Existing Worker localhost smoke | PASS, sixteen requests; server stopped |
| Root dependency audit | 0 findings |
| Hosting dependency audit | 1 moderate; 0 low/high/critical |
| Hosted/Deno/Supabase service acceptance | NOT VERIFIED — no hosted flow or native Edge runtime run |

An initial Worker type check found untyped Response.json access, and lint flagged an anonymous default export; both were corrected without weakening checks. Initial sandbox loopback access failed; approved localhost-only retries succeeded. Existing Worker smoke encountered one Wrangler ProxyWorker connection loss; an unchanged rerun passed all assertions. No failed security assertion was bypassed. Fresh final regression results include the last token-shape guard.

The remaining advisory is unchanged **GHSA-67mh-4wv8-2f99**, development-only esbuild 0.18.20 through drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils; patched >=0.25.0 crosses the loader's pin. Not in the isolated deployed bundles; do not invoke its vulnerable serve API. Audits remain unsuppressed. Build uses already-patched root esbuild. No paid dependencies/services or broad overrides were introduced.

These tests use synthetic identities and Auth doubles. A mock rejecting a client/session is not a real provider verification; SQL fixtures independently test live session/client/consent logic. Multi-process races, managed Auth rotation/PKCE/native revocation, remote client linking and true browser cookie behavior remain unverified. No frontend/device redesign or visual QA was needed or claimed.

Final locally inspected artifact SHA-256 values (not published): `edge.js` = `89f43bb977094852cf18686be9703acf7df11630fa4d12a34f7c949fe5adac37`; `auth-worker.js` = `083772aea169c320f6389128f3b5251a9893b389b106f7e63baa1ea351bfa74d`. These identify local outputs, not an approved deployment archive or source commit.

## Files added and reviewed scope

Added:

- `hosting/independent/config.ts`, `limits.ts`, `service.ts`, `auth.ts`, `edge.ts`, `auth-worker.ts`.
- `hosting/independent/staging.example.json`, `README.md`.
- `scripts-build-independent.cjs`, `scripts-smoke-independent.cjs`.
- `tests/independent-mcp.cjs`, `tests/independent-mcp-database.cjs`.
- `docs/PHASE-C1A2-REPORT.md`.

No existing application source, frontend, shared handler, hosting manifest, package manifest, lockfile or migration was edited in this phase. Prior working-tree modifications still exist. Index remains empty. Reviewed the C.1A/C.1A.1/C.0.1 reports, STAGING/MCP docs, shared Worker/consent/database/config and current official hosting/client guidance. Ignored local logs are in `.sites-runtime/c1a2/`; they are not publication inputs.

Reproduce locally:

```sh
node scripts-build-independent.cjs
node scripts-smoke-independent.cjs
npm run test:local
node node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit
node hosting/node_modules/typescript/bin/tsc -p hosting/tsconfig.json --noEmit --incremental false
npm --prefix hosting run lint
```

## Estimated costs and Free-plan feasibility

**Conditional, not a billing guarantee:** the MCP JSON service can plausibly fit existing Free quotas at small test scale; the full auth website needs an additional approved free-capable host. No account capacity/remaining quota was queried or reserved.

- Example estimate: 50 users × 20 tool calls/day × 30 days = 30,000 MCP calls/month. Adding one daily discovery, initialize and tools/list per user gives about 34,500 invocations/month, below the documented 500,000 Free Edge invocation allowance. Each tool also makes Auth verification and a fixed RPC request; retries, attacks, multiple devices/clients and refresh traffic increase usage. This is an assumption, not measured load.
- [Supabase Free pricing](https://supabase.com/pricing) lists 50,000 MAU, 500 MB DB, 1 GB file storage and 5 GB egress. Existing project/app consumption shares those allowances. MCP reads add no application tables or file storage. At 10 KB/tool response, 30,000 replies alone are about 300 MB before overhead and upstream traffic; larger allowed sections can be much larger. No hard cost cap is supplied by the local limiter.
- [Function pricing](https://supabase.com/docs/guides/functions/pricing) lists 500,000 Free invocations; paid-plan overage is $2/million above included quota. No upgrade authorized. Free inactivity pause/availability can interrupt testing.
- Auth website Worker Free is a candidate with a documented 100,000 requests/day ceiling, but actual entitlement, CPU, abuse controls and traffic must be verified. No Workers account/domain/route was created. A purchased domain is unnecessary for a future approved default-hostname option, but that option is not selected or tested here.
- Logs: use existing included diagnostic facilities only; no paid drains/long retention/export. Current code emits no sensitive request logs; platform redaction still requires verification. Rate limiting may require a store/feature with separate usage limits/costs; that selection is blocked, not assumed free.
- Paid Supabase custom domain, paid plans/PITR, paid Redis/log drains/SMTP, new resources or subscriptions are excluded. Existing-user login avoids signup/email-account creation; future confirmation/recovery email capacity still needs review.

## Future deployment procedure — blocked and not executed

1. Resolve exact auth hosting/entitlement, distributed or supported ingress limits, native local Edge runtime/path/header behavior and concrete client registration. Keep predefined registration a candidate until verified. Do not enable DCR as a fallback.
2. Rehearse generated MCP bundle on a disposable local Supabase/Deno runtime and auth bundle on the selected local host emulator; prove discovery reaches the handler before gateway auth while every data path fails closed. Retain strict staging origin/audience checks and existing RPC protections. No hosted configuration workaround or paid custom domain.
3. Replace placeholders in a reviewed runtime configuration supplied outside source secrets. Prepare exact isolated function packaging and deployment config only after gateway behavior is established. The current adapters/JSON template are not a ready-to-run deployment manifest. Do not point generic linked-project deploy/push commands at this repo.
4. Refresh staging metadata/security/write-switch/recovery checks. Obtain separate approval for exact audience transition SQL, Auth Site URL/hook/signing/client settings, synthetic accounts and endpoint publication. Source commit/push approval remains separate. Preserve the existing owner-private Site.
5. Build exact isolated bundles, record hashes/source provenance, inspect the actual archive for production/credentials, run 34 tests/types/lint/audits and local smoke. Review the remaining development advisory, not suppression. Never package old root dist, local logs, env files or backups.
6. Deploy only the approved isolated resources after explicit approval. Keep writes false. Confirm anonymous discovery, protected data, real S256/state/callback/resource and refresh/revocation behavior, exact client linking and hosted Alice/Bob/direct-API isolation before widening access. Do not treat operator privilege or test doubles as acceptance.

No deployment command is provided as an executable shortcut while these gates remain unresolved.

## Rollback and readiness

Local changes are isolated additions; no hosted rollback is required. Preserve existing uncommitted work and backups. Do not delete files or reset the repository as an automatic cleanup.

Future endpoint rollback means stop/disable the new service or redeploy a reviewed known-good version under separately authorized procedures, retaining false writes and no public diary access. Resource/Auth rollback must use captured before-values and account for old/new token reacceptance and native grants as described above. No automatic hosted restore, role escalation, policy removal or broad audience compatibility is permitted.

**Phase C.1B deployment readiness: NO.** Local implementation and regression verification are complete within established runtime-neutral boundaries. Native managed-runtime verification, reachable HTML hosting, distributed abuse control and actual multi-client OAuth registration/lifecycle acceptance remain critical unresolved parts; implementation of those provider-specific pieces stopped as requested. No claim that every ChatGPT/Claude/Gemini account can already connect. Stop for explicit next approval; do not deploy or activate OAuth.
