# Phase C.1A.4 — Final hosting architecture decision

Date: 2026-10-29 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Select B for the proposed staging rollout: one independent Cloudflare Worker routing MCP and authentication, with one shared SQLite-backed Durable Object coordinator.** Local workerd verification establishes routing and coordinated, persistent limits without a cross-provider limiter API. Supabase remains the OAuth issuer and database authorization authority. The existing owner-private MFD Site is unchanged.

**Deployment is not authorized or cleared yet.** Account-specific provisioning permission, approved client/callback inventory, fresh hosted preflight, exact audience/Auth changes and release provenance remain conditions. No hosted Worker, Durable Object, binding, deployment, OAuth client/user or paid resource was created. No hosted Supabase connection/mutation, production access, Site change, commit/push/merge or backup deletion occurred. SQLite objects mentioned below are local emulator files only. The emulator is stopped and local evidence/state retained.

## 1. Architecture comparison

| Aspect | A — Supabase Edge MCP + Cloudflare auth | B — Colocated independent Cloudflare Worker |
| --- | --- | --- |
| MCP runtime | Native Edge rehearsal passed in C.1A.3; requires a version-specific internal routing adapter | Same fixed MCP handler runs directly on canonical /mcp in workerd; no Edge gateway adaptation |
| Browser auth | Separate Worker needed because shared Supabase domain rewrites HTML | Same Worker serves login/consent HTML under the approved service origin |
| Supabase identity | Supabase OAuth bearer and database session/client/section checks | Exactly the same; Cloudflare/Sites identity never substitutes for MFD identity |
| Shared quotas | Edge cannot directly use a Cloudflare binding. Requires an authenticated cross-provider limiter service, replay protection, network timeout/credentials and additional failure modes | Private binding to one object; no public limiter route or service-to-service credential |
| Configuration | Two deployments, origins and rollback lifecycles | One deployment/origin plus namespace; stable binding/object schema must survive rollback |
| Free usage | Supabase invocations plus Workers and any coordinator | Workers/DO quotas plus existing Supabase Auth/DB/egress; removes Edge invocation use for MCP |
| Limits | Edge CPU/window limits and Workers limits both matter | Workers Free 10 ms CPU becomes the main handler CPU constraint; hosted profiling still required |
| Security exposure | More transport boundaries and exposed limiter ingress if bridged | One HTTPS surface; strict route separation, no raw identity/token persistence in coordinator |
| Decision | Keep existing source/rehearsal as an alternative; do not deploy it alongside B | Preferred simpler design, locally rehearsed; not yet deployed |

Both remain architecture B from C.1A.1 in the broader sense: independent OAuth-protected service outside the private Site. The A/B labels here follow this phase's hosting comparison. Changing the host does not remove MFD authentication or make the existing Site public.

## 2. Actual Cloudflare account evidence

Wrangler 4.151.0 `whoami --json` returned `loggedIn:false`. No token/config credential was read, printed or requested; no login flow was initiated. Therefore account ID, membership permissions and account entitlement could not be independently read through an authenticated API.

The user subsequently verified in the dashboard:

- Workers plan **Free**; existing subdomain **shanustylish777.workers.dev**.
- No existing Workers or Durable Objects; current request use **0 / 100,000** and DO usage zero.
- Durable Objects dashboard accessible; no payment method configured.
- Account-specific deployment capability has **not** been tested; no permission to create a hosted resource as a probe.

Treat these as current user-confirmed dashboard facts, not API-verification or successful namespace creation. [Official DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) establishes SQLite-backed objects on Free. It does not establish this operator's provisioning permissions. Actual account ID, script-name availability, workers.dev assignment, applicable policy and namespace/migration permission remain explicit gates. A creation test would be a hosted change and must wait for approval. Do not upgrade/add payment or create a placeholder resource to resolve uncertainty.

## 3. One Worker: routing and security boundaries

The local candidate has a separate `colocated-worker.ts`, configuration profile and router. Neither the private Site nor the split-host entrypoint/config is replaced.

| Path | Handler and boundary |
| --- | --- |
| /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/mcp | Public metadata only, coordinated discovery budget |
| /mcp | Fixed MCP handler; verified Supabase Bearer required, exact resource audience and client checks |
| / and /login | Existing-user login form; CSRF-bound same-origin POST, no account creation |
| /logout | Existing first-party session revocation/secure cookie clearing |
| /oauth/mcp/consent | Verified first-party Supabase user + native authorization + exact callback + section consent |
| /oauth/mcp/connections | Live user grant listing/revoke-first management |
| /oauth/mcp/approve | Still disabled with writes=false |
| Any other route, including /internal/limiter | Rejected; coordinator is not exposed as an HTTP API |

The metadata aliases are `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`; `/mcp` itself is never an anonymous metadata endpoint. Only those well-known routes are anonymous on the MCP surface. Login bootstrap HTML is necessarily reachable without a diary session; it exposes no diary or connection data.

The router checks the exact configured origin and resource=origin+/mcp; it never selects them from Host/X-Forwarded headers. A separate colocated config validates the same staging Supabase issuer, public key, exact callback/client inventory and false write switch. It accepts one scalar audience for this deployment, not both the Edge/Site/Worker resources. The existing split-host parser retains its original Edge pin.

Cookie identity cannot authenticate /mcp, even on the same origin. Browser/ID-token audience `authenticated` cannot replace the dedicated MCP audience. No Sites/OpenAI identity header or assistant user_id selects the diary account. Bearer verification precedes claim use. Every private data operation still uses the existing fixed RPC, current auth.uid/session/client/audience/section checks and RLS/OAuth restrictions. No service-role credentials, new SQL helper or direct table access is introduced.

Existing S256/code/state/nonce responsibilities remain with the external client and Supabase, not a new Cloudflare issuer. Shared consent, exact registered callback checks, HttpOnly cookies, refresh/revoke handling, CSRF and no-store/CSP behavior are reused. Native/local consent still spans two services and can require revoke/reconnect. Neither write switch is enabled. Hosted values were not reread during this local phase and require fresh verification later.

## 4. Coordinated abuse protection

`AbuseCoordinator` uses a SQLite namespace and `transactionSync` to check/update counters atomically. Every recognized public request passes the same private binding and fixed object name **mfd-staging-shared-v1** before Auth verification, login, consent or tool work. Binding absence, exception, 2-second timeout or quota failure denies access; there is no allow/fallback to local-only protection. Timeout may conservatively consume a late budget slot, never grant an extra request.

Final conservative fixed-window limits:

| Budget | Maximum admissions per UTC-aligned minute |
| --- | --- |
| Shared global, all three classes combined | **30** |
| MCP, including token validation/metadata methods | **25**, subject to global 30 |
| Auth/login/consent/connections/logout | **20**, subject to global 30 |
| Public discovery | **10**, subject to global 30 |

These are fixed windows, not a rolling-minute guarantee: adjacent window boundaries can allow a burst spanning two windows. They are intentionally small for controlled staging and may be too restrictive for wider use. The SQL schema has at most **four rows**, overwritten each window. No token, user ID, client ID, email or IP is stored. Backward clock movement does not reset a future stored window. Existing bounded per-isolate gates remain additional defenses, not distributed fallbacks.

This coordinates all Worker instances/locations through one object, unlike approximate location-local Rate Limiting bindings. [Cloudflare storage consistency](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/), [Rate Limiting locality/strict limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

The coordinator protects total upstream work, not individual-user fairness. An attacker can exhaust the shared staging availability budget or daily ingress quota. Unknown routes still consume Worker ingress/CPU even though they never call Auth/DO. Errors must fail closed; no zero-cost or availability guarantee is claimed. Persistent global coordination solves the split-host limiter boundary, but general release needs traffic/CPU/abuse monitoring and possibly a separately reviewed bounded fairness design. Never trust unverified identity fields as a fix.

## 5. Local evidence

Ran the actual generated colocated bundle in local HTTPS Wrangler/workerd with a real **local SQLite-backed DO**, using the existing test certificate with hostname/chain verification. All Auth/RPC replies were synthetic; the fixture refuses real upstream network access. No hosted namespace or binding was created. Local diagnostic methods exist only in the ignored fixture subclass and must never enter the deployment package.

- Same Worker served protected MCP, login, consent and revocation correctly.
- Exact colocated resource metadata matched the validator; old Edge audience was rejected.
- Cookies alone did not authenticate MCP. Owner injection and write tools failed.
- Missing coordinator binding returned 503 without an upstream request. Unit checks also cover denial, exception and timeout.
- **90 concurrent mixed MCP/auth requests** converged on one shared coordinator. Total final admissions were **30**, not independent allowances per route. Stored category counts summed to the global count; row count stayed four. Subsequent denials made no additional Auth/RPC calls.
- Stopped the workerd process, restarted it against the same retained local state, and verified counters/window values were **identical**, without resetting/consuming them. Persistence survives isolate/process restart; normal expiry still resets the next logical window as designed.
- Concurrency was exercised in one local workerd environment. Actual cross-region coordination is supported by the provider's single-object consistency contract, not measured by this local test; hosted behavior remains an acceptance item.
- First rehearsal used 60 global/minute. Cost review identified two SQLite row updates per admission; final source and native rehearsal use 30/minute to leave write-quota headroom. No limit was increased to obtain a test pass.

| Check | Result |
| --- | --- |
| Complete local regression/security runner | **36/36 PASS** |
| Colocated router/config/fail-closed unit suite | PASS |
| Disposable SQL isolation/resource tests | PASS for Edge and colocated audiences separately; Site and other nonselected audience rejected |
| Existing RLS/session/consent/replay/write protection suites | PASS, synthetic local fixtures |
| Frontend TypeScript | PASS |
| Worker TypeScript | PASS after correcting the DO environment generic type |
| Hosting lint | PASS |
| Independent build/contamination scan | PASS, including new colocated artifact |
| Native colocated HTTPS/SQLite concurrency + restart | PASS |
| Root npm audit | 0 findings |
| Hosting pnpm audit | 1 moderate, 0 low/high/critical |

Unchanged moderate: GHSA-67mh-4wv8-2f99, development-only esbuild 0.18.20 through drizzle-kit/esm-loader/core-utils; patched >=0.25.0 crosses that loader's pin. Not in the runtime bundle; not suppressed. No dependency/lockfile update. Node 22.13.1, locked Wrangler 4.151.0; no browser/device or real provider OAuth acceptance is claimed.

Final colocated artifact: 39,258 bytes, SHA-256 **8a154eed107c482fe75bc6e29ae06bc3966d93b1945a14ae00b9f8fd371768b3**. Local evidence under ignored `.sites-runtime/c1a4/`: account status, native smoke results, quota snapshot, restart comparison, 36-test/types/lint/audit logs. Emulator stopped; SQLite state/evidence and backups retained. Hosted CPU/memory/latency, real browser SameSite behavior and provider credential/signature/session lifecycle remain unverified.

## 6. Exact proposed URLs and configuration

**Proposed origin, not reserved or deployed:**

`https://mfd-connect-staging.shanustylish777.workers.dev`

| Purpose | Exact proposed URL |
| --- | --- |
| MCP / sole resource audience | https://mfd-connect-staging.shanustylish777.workers.dev/mcp |
| Protected resource metadata | https://mfd-connect-staging.shanustylish777.workers.dev/.well-known/oauth-protected-resource/mcp |
| Metadata root alias | https://mfd-connect-staging.shanustylish777.workers.dev/.well-known/oauth-protected-resource |
| Existing-user login | https://mfd-connect-staging.shanustylish777.workers.dev/login |
| Consent / future Authorization Path | https://mfd-connect-staging.shanustylish777.workers.dev/oauth/mcp/consent |
| Manage/revoke connections | https://mfd-connect-staging.shanustylish777.workers.dev/oauth/mcp/connections |
| Logout | https://mfd-connect-staging.shanustylish777.workers.dev/logout |
| Supabase issuer, unchanged | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1 |

The user confirmed the base subdomain, not this particular Worker hostname's assignment or availability. Each external client's final callback belongs to that client and must come from the actual interface; these MFD URLs are not substitutes for ChatGPT/Claude/Gemini callbacks.

`hosting/independent/colocated-wrangler.example.jsonc` is a **proposal only**, never passed to a hosted operation. Proposed name mfd-connect-staging; entrypoint generated colocated-worker.js; compatibility date 2026-10-12; workers_dev=true; no custom routes/domain; source-map upload and Worker observability disabled. The future binding is MFD_ABUSE → AbuseCoordinator, with a new_sqlite_classes declaration tagged mfd-c1b-v1. That declaration would create hosted state only during a later explicitly approved deployment. No account ID/namespace ID was guessed. Existing private Sites manifest/ID remains separate and unchanged.

Runtime values:

| Variable | Proposed value |
| --- | --- |
| MFD_ENV | staging |
| MFD_SUPABASE_URL | https://gngnrmzeghjzqsmzuktl.supabase.co |
| MFD_OAUTH_ISSUER | same URL + /auth/v1 |
| MFD_AUTH_ORIGIN | exact proposed Worker origin above |
| MFD_MCP_RESOURCE_URL | exact proposed /mcp above |
| MFD_SUPABASE_PUBLISHABLE_KEY | existing staging public publishable key, supplied without logging |
| MFD_ALLOWED_CLIENT_IDS | explicit separately approved client IDs; currently no real inventory |
| MFD_CLIENT_REDIRECTS | exact independently verified per-client callback arrays |
| MFD_MCP_WRITES | false |

The template deliberately retains a placeholder key and empty client inventories, so it is not runnable as a release. The namespace is private to the Worker; no public cross-platform rate endpoint, limiter credential, Supabase service-role key or database connection string is needed.

## 7. Resource-audience transition and OAuth prerequisites

The last verified installed resource is the **private Site** audience, not the never-deployed Edge candidate. Transition directly from:

`https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp`

to:

`https://mfd-connect-staging.shanustylish777.workers.dev/mcp`

1. Before any execution, freshly verify exact staging identity, active row/default, writes=false, client/grant/session counts, hook/dispatcher/ACLs, private schema exclusion and recovery evidence. No hosted preflight was rerun here. Stop on drift or unexpected existing users/grants/tokens; do not delete them or silently carry consent into a new service.
2. Obtain explicit approval for the final Worker hostname/account, exact artifact/source, namespace creation and the distinct audience/Auth/client/account-test changes. OAuth and writes stay disabled during this decision phase.
3. Prepare/review a staging-only transaction: lock settings; assert exactly one expected old-resource row, false writes and expected default; update only resource_uri and its column default to the one Worker URL; assert final values; commit. Preserve row identity, other values, RLS, grants, storage policies, private schemas, hook and dispatcher bodies. No installer replay, generic db push or broad audience array. No SQL executed in this phase.
4. The existing hook reads the setting for registered clients, so future issuance/refresh must produce the same scalar audience. Existing old-audience tokens are rejected by the new endpoint and SQL after transition. An audience edit is not cryptographic revocation; tokens and grants require a deliberate separately approved reconnect/revocation plan.
5. Under separate approval, Auth Site URL becomes the exact new origin, Authorization Path /oauth/mcp/consent, and first-party redirect allowlist uses its exact `/` URL as appropriate. Review effects on project-wide login/email redirects before changing them. Keep DCR disabled and asymmetric signing/hook activation separately reviewed.
6. Register only client/callback/method combinations verified in the selected interface, mirror exact client IDs into MFD's DB allowlist and runtime inventory, and test S256/state/resource/issuer/refresh/revocation with approved synthetic hosted users. Predefined registration remains a candidate until actual acceptance; CIMD is not implemented. No provider's identity replaces MFD's user subject.

Current code fails closed without a valid real client inventory. Before initial deployment, choose an explicitly approved sequence for client setup versus serving discovery; do not seed invented client IDs or relax authentication to solve bootstrap ordering. A metadata-only bootstrap release would itself need separate preparation/review, not an implicit mode here.

## 8. Costs and Free limits

No purchase, paid dependency or hosted resource was introduced. User-confirmed plan is Free with no payment method; account entitlement/permission still needs independent confirmation before execution. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) list 100,000 requests/day, 10 ms CPU/request, 128 MB memory and 50 subrequests/request. Local workerd success does not certify the hosted 10 ms budget. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

DO Free documented allowances: 100,000 requests/day, 13,000 GB-s/day, 5 million row reads/day, 100,000 row writes/day, 5 GB storage. Exceeding Free allowances fails operations; no paid upgrade/overage path is approved. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Each recognized request makes one coordinator RPC, including denied requests. Each admitted request updates two fixed rows. At 30 admissions/minute continuously, at most 43,200 daily admissions imply about 86,400 row updates, plus small initialization overhead. This is quota planning, not a measured billing guarantee: verify actual metered writes/reads and other account usage. Reads scan at most four rows/check. Four counters require negligible logical storage; actual SQLite minimum overhead must be measured. No per-user objects, growing key log, alarms or periodic jobs are added.

A small example of 50 users × 20 tool calls/day × 30 days gives 30,000 tool requests/month, plus initialization/discovery/auth traffic. Supabase still handles Auth verification and fixed RPCs, consuming existing Auth/DB/egress quotas; MCP no longer consumes Edge invocation allowance. The global/minute cap can intentionally throttle peaks. Attackers can exhaust ingress/DO daily request allowances even while admissions are bounded; the intended result is denial, not a promise of availability or zero platform usage.

No purchased domain is needed for the proposed workers.dev URL. No Redis, public limiter service, custom Supabase domain, paid log drain/PITR/SMTP or new plan. Redact provider access-log queries, retain no tokens/passwords/codes, and verify account log retention/entitlement before real login. Disabling application observability does not prove that all provider infrastructure logs disappear.

## 9. Rollback and controlled deployment conditions

Before publication retain approved source/archive hashes, runtime configuration before-values and a known-good colocated package. This is a first deployment, so no hosted version exists to roll back to initially. First-release failure needs an approved stop/deny or reviewed forward fix, not changed Site audience/authentication.

For later rollback, preserve the same SQLite namespace, exported class/schema and fixed coordinator name. Do not delete/reset counters or change object names to restore availability. A code rollback across incompatible DO class/migration/binding changes requires explicit review; it is not a data rollback. Supabase audience/Auth settings are independent and must be restored only through a reviewed compare-and-set procedure. Restoring an old audience can reaccept still-live old tokens; account for grants/sessions first. No automatic hosted database restore or backup deletion.

Remaining conditions before controlled C.1B execution:

- Verify authenticated Cloudflare account ID/operator permissions, Free SQLite entitlement and exact hostname without creating a probe resource; if capability cannot be established read-only, explicitly scope that uncertainty into the first approved deployment and stop on any permission/billing prompt.
- Review/accept this colocated design and conservative shared budgets; confirm staging availability/fairness expectations and hosted CPU/logging checks.
- Prepare final client/callback/bootstrap sequence and exact runtime config. No placeholders or invented identities in a release.
- Fresh staging security/write-switch/resource/recovery preflight and separately approved transaction/Auth changes.
- Explicit hosted Worker/SQLite namespace deployment authorization, provenance/source synchronization approval if needed, and separate synthetic-account/OAuth acceptance scope. No automatic commit/push helper.
- After approved deployment: prove real HTTPS routing, DO coordination/quotas/outage behavior, signed-token issuance/refresh/revocation, browser CSRF/cookies, Alice/Bob and direct REST/RPC/storage isolation. Preserve false writes throughout.

**Decision:** B meets the local architectural/routing/coordinated-limit requirements and is the simpler secure proposal. The split-host coordination blocker is removed from the selected design. **C.1B is not authorized or fully cleared**: account-specific capability and final configuration/client/hosted acceptance gates remain. Stop after local verification.

## Source changes and reproducibility

Added colocated-config.ts, colocated-router.ts, colocated-worker.ts and coordinator.ts under hosting/independent; proposal colocated-wrangler.example.jsonc; tests/colocated-mcp.cjs; scripts-prepare-colocated.cjs and scripts-smoke-colocated.cjs; this report. Modified scripts-build-independent.cjs to build the third artifact and leave cloudflare:workers runtime import external. Extended independent-mcp-database.cjs to rehearse both candidate audiences separately and reject the nonselected one. Updated the independent README with the current decision. No SQL/lockfile/private Site/frontend change.

Build with `node scripts-build-independent.cjs`; run `npm run test:local`, both existing TypeScript projects and hosting lint. Local fixture preparation reuses the earlier synthetic auth harness/certificate; generated config is local-only with remote bindings disabled. Run the colocated smoke against a fresh or expired retained fixed window, then restart workerd with the same persist-to directory and run `node scripts-smoke-colocated.cjs persistence`. Never reset live counters or package fixture diagnostic exports. All local emulators are stopped at completion.
