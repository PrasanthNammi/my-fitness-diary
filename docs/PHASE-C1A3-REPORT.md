# Phase C.1A.3 — Native runtime and hosting readiness

Date: 2026-10-28 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Native Supabase Edge and Cloudflare workerd rehearsals pass after a narrowly scoped Edge routing fix. Cloudflare Workers is recommended for the auth website. Phase C.1B deployment remains blocked by coordinated abuse protection and concrete account/client/hostname configuration.** This is not hosted OAuth or production-readiness acceptance.

No hosted database/project was connected, queried or modified. No OAuth activation, hosted client/user creation, deployment, Site access/publication change, write enablement, paid resource, commit/push/merge or backup deletion occurred. The private Site's entrypoint, manifests, frontend and shared handlers remain unchanged. All account/consent replies in native smoke tests were synthetic doubles. Database regressions used disposable local fixtures.

## 1. Official tooling and native runtime results

Installed **Supabase CLI 2.122.0** only into ignored `.sites-runtime/c1a3/tools`, without changing application dependencies. Downloaded from the official release; archive SHA-256 `fe87a5f9781d5423dbd5ebba2d5a6e1a541d01754d14941c574952e5695eaab0` matches both checksums.txt's versioned asset and GitHub release metadata's unversioned alias digest. An initial checksum URL was wrong, and a filename assertion did not recognize that alias; neither failed check was bypassed. No unverified binary was executed.

Read CLI help before init/start/functions serve/stop. First sandbox invocation failed writing CLI telemetry state; subsequent commands used the documented `SUPABASE_TELEMETRY_DISABLED=1`. Docker initially was stopped; started existing Docker Desktop and confirmed no pre-existing running containers. Initialized a **new unlinked local project**, `mfd-c1a3-native`, under ignored `.sites-runtime/c1a3/native`. No repository migration/installer or backup was copied into it. OAuth server and dynamic registration stayed disabled in this disposable local config too.

Official CLI started the local database/Auth/REST/gateway/Edge services and served fixtures through its actual gateway. Runtime reported **supabase-edge-runtime 1.77.8, compatible with Deno 2.1.4**. Standard Deno CLI was not substituted for this service. Reference: [official local development](https://supabase.com/docs/guides/functions/development-environment), [CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started), [pinned release](https://github.com/supabase/cli/releases/tag/v2.122.0).

### Confirmed defect and fix

Before the fix, native anonymous discovery returned **421**, because the gateway forwarded:

```text
request origin: http://127.0.0.1:8081
request path:   /mfd-mcp/...
external path: /functions/v1/mfd-mcp/...
```

The service correctly rejected that internal origin against its configured public resource. New `edge-routing.ts` maps **only** the observed exact internal loopback origin and three fixed function paths to the already pinned staging HTTPS origin and full prefix. Unknown authorities, ports, functions and paths fail closed. Host/X-Forwarded-* headers do not select the destination. Original Origin, Bearer, body and query remain intact for all existing checks. The service's origin/audience checks were not removed or widened. Direct canonical requests still use the same service validator.

This is a version-specific runtime transport adaptation, not authorization based on loopback identity. If the hosted gateway uses a different internal contract, it must fail and be reviewed rather than expanding the mapping automatically. [Official function routing](https://supabase.com/docs/guides/functions/routing) and the measured local request establish the local behavior; hosted parity still needs later observation.

| Native check | Result |
| --- | --- |
| Actual Edge bundle boot on Deno-compatible Edge Runtime | PASS |
| Gateway default JWT control, missing and invalid Bearer | PASS: 401 before control handler |
| MCP function with local verify_jwt=false, public discovery | PASS: 200 with exact staging resource/issuer; HEAD has no body |
| Private tool without Bearer | PASS: 401 with exact public resource-metadata challenge |
| Synthetic credential accepted by Auth double | PASS: fixed profile RPC response only |
| Invalid upstream credential, wrong issuer/audience/client/subject/session claim, expired token | PASS through combined new/existing suites; native checks exercise wrong audience/client/subject/session/expiry and invalid credential |
| Hostile browser Origin | PASS: 403 after route normalization |
| Malformed JSON and oversized payload | PASS: 400 / 413 |
| Unknown internal authorities/ports/paths and forged forwarding | PASS in added routing regression |
| Live sessions, actual revoked consent and Alice/Bob SQL ownership | PASS in synthetic PostgreSQL regressions; NOT a real native GoTrue lifecycle test |

Only discovery is anonymous on MCP. Native functions use a **synthetic fetch fixture that refuses every real upstream destination**. It does not cryptographically validate a provider token or contact staging. Thus native runtime/gateway/application control flow is verified, while actual Supabase bearer issuance/validation, registered clients, refresh and revocation remain separately approved hosted acceptance requirements.

### Resource limits and lifecycle

The 16 KiB MCP cap was enforced in the native runtime. Stateless replies, fixed RPC, 20-second upstream timeout and bounded local limiter remain. [Documented hosted Edge limits](https://supabase.com/docs/guides/functions/limits) include 256 MB memory, 2 seconds CPU/request, 150-second Free wall-clock duration and idle timeout. Local success does **not** prove enforcement or sufficient CPU/memory under those hosted quotas. No exhaustion test, benchmark or hosted load was run; hosted profiling remains a gate. Bundled Edge is 18,938 bytes, far below documented package caps.

CLI default Docker mappings published local API/database ports 55421/55422 on host interfaces, not exclusively loopback. All test clients used 127.0.0.1 and no real user data/credentials; repeat only in an appropriately isolated local environment. Both services and emulators have now stopped, confirmed by empty docker ps. Local volumes/evidence were retained; no --all or --no-backup cleanup was used. Docker Desktop itself remains available. The separately verified staging backups were untouched.

## 2. Authentication website hosting

**Recommend a separate Cloudflare Worker with an approved workers.dev HTTPS hostname**, retaining the existing owner-private Site. Default Workers hosting supports HTTPS and normal HTML responses; no Supabase custom-domain add-on is needed. [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). Actual account entitlement/subdomain is not known or provisioned; no final hostname is invented.

Ran the **actual generated auth-worker.js** in installed Wrangler **4.151.0 / workerd**, using local-only mode, a separate config and synthetic upstream wrapper. Listened at `https://127.0.0.1:54443`. Generated a two-day localhost certificate and private key in ignored local state; driver trusts that exact certificate and retains hostname/certificate verification. No TLS validation was disabled, no system trust store or hosted SSL setting changed. The local private key and logs are owner-only.

| workerd HTTPS check | Result |
| --- | --- |
| HTML content type/renderable document response | PASS; no text/plain rewrite |
| Secure/HttpOnly/SameSite=Lax/Host-prefixed cookies and separate Set-Cookie fields | PASS |
| CSP, no-store and no-referrer headers | PASS |
| Hostile Origin / missing login CSRF cookie | PASS: 403 / 400 before login success |
| Synthetic existing-user login and fixed authorization continuation | PASS: 303, no token in URL |
| Authenticated consent page and exact callback | PASS: 200 / 303 |
| Connection revocation | PASS using existing local-first/native-second logic and synthetic replies |
| Write approval | PASS: 403 |
| Per-isolate login/consent budget and upstream protection | PASS: 429/Retry-After, no further Auth fetch when limited |

An initial test failed because the synthetic fixture calculated expiry at module initialization; workerd request-time clocks made that token expired. Fixed the fixture to mint expiry during a request. Application expiration validation was not weakened. All native checks then passed. This is a useful limit of earlier VM-only fixtures, not evidence that real Auth tokens are expired.

No actual browser cookie jar/SameSite navigation, managed OAuth callback or hosted certificate was tested. The driver explicitly replays synthetic cookie headers over verified local HTTPS; browser enforcement is a later acceptance item. Auth server uses standard Web APIs and requires no Node compatibility flag, static asset store or new runtime dependency.

## 3. Distributed abuse protection decision

**Still a deployment blocker. No appropriate complete cross-platform limiter has been implemented or verified.** Keep current conservative bounded per-isolate limits and fail-closed error behavior; do not call them global quotas. Added tests prove limiter denial/unavailability causes no upstream Auth/RPC request. MCP reports 503 on limiter exception; current auth handler reports generic 400, still without fetching credentials/data. A backend failure must never fall back to allowing traffic.

| Option | Evaluation |
| --- | --- |
| Existing in-memory map | Tested and bounded; restarts/replicas reset or multiply allowances. Not sufficient for distributed protection |
| Workers Rate Limiting binding | Official docs say location-local, approximate and eventually consistent. Useful extra edge protection, not a strict shared Supabase/Cloudflare budget. Awaiting limit() does not make it worldwide/atomic |
| SQLite Durable Object | Officially available on Workers Free; suitable strict per-key counter with serialized/persisted updates. Free-capable candidate for auth Worker; no namespace or implementation was created |
| KV/eventually consistent counters | Not accepted as an atomic quota without another coordinator |
| Existing Supabase Auth limits | Provider defense in depth; not a documented general quota for MFD MCP/RPC/consent traffic |
| Hosted PostgreSQL counter/RPC | Would require schema/privilege mutation, contention/cleanup and separate approval. Not introduced |
| External Redis/paid limiter | Not selected; no new service/account or subscription |

Cloudflare explicitly [distinguishes approximate binding limits from strict Durable Object limits](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). DO [Free availability and limits](https://developers.cloudflare.com/durable-objects/platform/pricing/) do not establish that this account has sufficient remaining allowance or that an authenticated cross-provider service already exists.

### Proposed bounded design for review, not implementation

Use a bounded coordinator with fixed global category budgets before any password/token verification traffic, then verified user/client budgets for private tools. Do not trust assistant user_id, unverified token claims, caller forwarding headers or raw email as authorization keys. Keep hashed identifiers private and retention short; limit state cardinality and payload size. Deny before upstream work if quota is exhausted or the coordinator is unavailable. Include separate login, consent and MCP/tool/verification budgets, plus public-discovery ingress protection so quota exhaustion cannot become an unbounded bill.

For an auth Worker, a SQLite DO binding can coordinate within the account. **Supabase Edge has no direct Cloudflare DO binding.** Keeping Edge requires a separately reviewed authenticated server-to-server limiter endpoint, request integrity/replay bounds, bounded network timeouts and secret handling. No public unauthenticated limiter endpoint or shared user/service-role token is acceptable. Introducing that cross-provider control plane is an architectural/security decision; not implemented implicitly.

Alternative: colocate separate MCP and auth handlers on a non-Sites Cloudflare Worker with a common coordinator, reducing that bridge. It would require a newly approved exact MCP URL/audience transition and source adaptation; current pins intentionally reject arbitrary Worker audiences. Do not switch hosts or broaden audiences automatically. The present task establishes the options, not approval to select/provision one.

Free quota exhaustion should deny further operations, not activate overage/upgrades. An attacker can still consume a shared availability budget; fail-closed protects data/upstream work but does not guarantee availability. Strict quotas also do not eliminate authentication/replay/consent checks.

## 4. Exact source changes

Modified:

- `hosting/independent/edge.ts`: applies fixed internal-runtime route normalization before the existing service.
- `tests/independent-mcp.cjs`: adds fail-closed limiter-unavailability checks for MCP and auth, asserting zero upstream calls.
- `hosting/independent/README.md`: points to current native evidence and distinguishes proposal templates from active deployment config.

Added:

- `hosting/independent/edge-routing.ts`: exact internal authority/path mapping; ignores forwarding values for resource selection.
- `tests/independent-edge-routing.cjs`: positive mappings and forged/unknown authority/route rejection.
- `scripts-prepare-native-readiness.cjs`: generates only ignored unlinked local Supabase/workerd synthetic fixtures; does not initialize, link, start, deploy or execute SQL itself.
- `scripts-smoke-native-readiness.cjs`: loopback-only official runtime driver with verified local HTTPS, safe synthetic diagnostics and machine-readable result.
- `hosting/independent/supabase-config.example.toml`, `auth-wrangler.example.jsonc`: **proposal-only**, outside active hosted manifests; placeholders fail closed.
- `docs/PHASE-C1A3-REPORT.md`.

No dependency/lockfile update, private Site/Frontend source change, shared-handler rewrite, SQL file or active deployment config change occurred. Historical candidate changes remain uncommitted; index empty. Ignored state `.sites-runtime/c1a3/` includes pinned CLI/checksums, unlinked runtime config, synthetic env, native results/logs and local certificate. Do not commit or package it.

## 5. Regression, security and build results

Used Node 22.13.1 and existing locked packages.

| Check | Final result |
| --- | --- |
| Complete test runner | **35/35 PASS**: original 34 plus Edge-routing regression |
| Existing SQL/RLS/MCP/account-isolation/migration suites | PASS, disposable synthetic fixtures |
| Auth failures, malformed/oversized inputs, audience/client/consent, replay/duplicate/write denials | PASS in existing/new suites |
| Limiter deny/unavailable/expiry/capacity and native auth throttling | PASS; no distributed guarantee implied |
| Frontend TypeScript | PASS |
| Worker TypeScript including routing adapter | PASS |
| Hosting lint | PASS, zero reported issues |
| Independent bundle build and contamination scan | PASS |
| Native Supabase gateway + Deno-compatible runtime smoke | PASS after route fix |
| Native HTTPS workerd login/consent/security smoke | PASS after synthetic fixture correction |
| Root dependency audit | 0 findings |
| Hosting dependency audit | 1 moderate, 0 low/high/critical |
| Private frontend/manifests/old root dist | Unchanged; old root dist never served |

The unchanged moderate is GHSA-67mh-4wv8-2f99: development-only esbuild 0.18.20 through drizzle-kit/esm-loader/core-utils, patched >=0.25.0. It remains absent from the isolated runtime artifacts. No advisory suppression or forced override. Native Supabase CLI/images are external toolchain components, not covered by npm audit; image/vulnerability provenance needs release review before hosted publication.

Final local artifact hashes:

- `edge.js`: `83ab4a3c4185cbde3967002699e5377793f8be1d287201f47f507fe6445cff42` (18,938 bytes).
- `auth-worker.js`: `083772aea169c320f6389128f3b5251a9893b389b106f7e63baa1ea351bfa74d` (21,785 bytes, unchanged).

Native evidence: `.sites-runtime/c1a3/native-results.json`, native-smoke-latest.log, serve.log, workerd-final.log. Both emulators and the project containers were stopped after tests; local volumes/backups retained. Report evidence identifies local artifacts, not an approved source commit or hosted version.

## 6. Proposed hosting configuration and endpoints

| Setting | Proposed value / unresolved requirement |
| --- | --- |
| Supabase target | Only gngnrmzeghjzqsmzuktl; no hosted changes in this phase |
| Function | mfd-mcp; standalone generated bundle copied to functions/mfd-mcp/index.ts in an approved package |
| MCP URL / sole audience | https://gngnrmzeghjzqsmzuktl.supabase.co/functions/v1/mfd-mcp/mcp |
| Protected metadata | https://gngnrmzeghjzqsmzuktl.supabase.co/functions/v1/mfd-mcp/.well-known/oauth-protected-resource/mcp |
| Auth issuer | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1 |
| Gateway JWT gate | Proposal verify_jwt=false for mfd-mcp only, because discovery must reach app; application Bearer/claim/RPC verification mandatory |
| Auth Worker name | mfd-auth-staging, separate from Sites |
| Auth URL | https://mfd-auth-staging.<VERIFIED_ACCOUNT_SUBDOMAIN>.workers.dev — **not known, allocated or approved** |
| Auth routes | /login, /logout, /oauth/mcp/consent, /oauth/mcp/connections; /oauth/mcp/approve remains disabled |
| Writes | MFD_MCP_WRITES=false; database writes_enabled=false must be freshly verified before later execution |
| DCR/OAuth | Remain disabled until separately approved; no client registration in this phase |

Both services require the existing nine runtime variables: MFD_ENV, MFD_SUPABASE_URL, MFD_OAUTH_ISSUER, MFD_MCP_RESOURCE_URL, MFD_AUTH_ORIGIN, MFD_SUPABASE_PUBLISHABLE_KEY, MFD_ALLOWED_CLIENT_IDS, MFD_CLIENT_REDIRECTS, MFD_MCP_WRITES. Use the exact staging public key, approved client IDs and callback lists; no service-role key, database password or private signing key. New abuse-control configuration depends on the unapproved design. Do not copy synthetic values or local certs into hosted config.

Auth Wrangler proposal has no account_id, route, DO namespace or secret, logs disabled and no source-map upload. Its invalid auth host/key/empty client placeholders deliberately prevent use. Existing Site ID/access/environment stays untouched. Without an inspected account subdomain, a final exact auth URL cannot honestly be supplied.

Supabase audience row/default transition, hook selection, Auth Site URL and exact client callbacks must be reviewed together as described in C.1A.2. A hosted Auth Site URL change affects other project login/email redirects; verify the scope before approving it. Preserve the current hook/dispatcher/RLS/ACL/storage policies and private schema exclusions; never replay installers. No transition SQL was executed here.

## 7. Costs, quotas and logs

No hosted resource or paid feature was created. Tool downloads/local Docker disk and CPU were used. Actual account plan/remaining quota and production resource-limit behavior were not queried.

- Workers Free: documented 100,000 requests/day, 10 ms CPU/request, 128 MB memory, 50 subrequests/request. Waiting for network does not count as CPU. The local auth handler works in workerd, but its 10 ms hosted CPU budget needs profiling. [Limits](https://developers.cloudflare.com/workers/platform/limits/), [pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- Supabase Edge Free: documented 500,000 invocations/month; existing project traffic shares this and Auth/DB/egress limits. A 50-user, 20-tool-call/day example remains roughly 34,500 MCP invocations/month including daily connection metadata; untrusted traffic can be much higher. This is an estimate, not a reservation. [Function pricing](https://supabase.com/docs/guides/functions/pricing).
- SQLite DO Free candidate: 100,000 requests/day, 13,000 GB-s/day, 5 million row reads/day, 100,000 row writes/day and 5 GB stored data. Exceeding Free limits fails operations; no paid upgrade is authorized. Each coordinated check consumes request/storage budget; multiple buckets per user request multiply usage. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- No added application file storage; limiter state would need fixed expiry/cardinality and a deliberate cleanup strategy. No external Redis, purchased domain, paid custom domain, log drain, SMTP, PITR or new subscription. Workers default hostname avoids a domain purchase if entitlement is available.
- Existing code does not log passwords/tokens/request bodies. Platform access logs may contain authorization_id/query strings; redaction, retention and account entitlement need hosted review before any real login. Observability-off template does not prove all provider infrastructure logs disappear. Synthetic logs were retained privately; no real credentials were exported.

A free-capable auth host and coordinator product exist, but **the complete cross-platform rollout cannot yet be certified free, bounded or deployment-ready**. Do not convert quota uncertainty into a paid service.

## 8. Deployment and rollback procedure — proposal only

1. Resolve coordinated abuse protection architecture and exact account/hostname/entitlement; review any cross-provider service credential or colocation design. No paid store or audience fallback. Rehearse the chosen coordinator and outage/quota exhaustion locally before deployment approval.
2. Confirm actual client preregistration/callback/token-endpoint support in the selected ChatGPT/Claude/Gemini interface; DCR stays off. Local docs and fixtures do not establish a hosted client's compatibility.
3. Refresh read-only staging identity, resource/settings, both write switches, hooks/signing, exposed schemas, catalog/ACLs and recovery evidence. No historical PASS substitutes for current execution gates. Obtain separate exact audience/Auth/client/account/source/publication approvals.
4. Build and scan exact isolated artifacts; run 35 regressions/types/lint/audits/native smoke. Pin tool/image versions; package only the generated app function and reviewed config, not fixture bootstrap, local probes/gated controls, .sites-runtime, env/certs, repository migrations, old dist or backups. Compare source/archive checksums to approved scope.
5. Under explicit future approval only, provision/deploy the isolated hosts and controls, apply only the reviewed staging audience/configuration changes and keep both writes false. No generic linked-project push, Site publication, role assumption or installer replay. Auth configuration and synthetic hosted accounts require their explicit scope.
6. Verify HTTPS hostname, external routing, gateway challenge/discovery and exact issuer/resource; rejected anonymous/invalid requests; live signed tokens/refresh/revocation; browser cookie/CSRF/redirect behavior; per-user sections and Alice/Bob direct REST/RPC/storage denial; quota/outage behavior; headers/log redaction and runtime metrics. Do not infer hosted signing from the synthetic native fixture.
7. Record exact versions and before-values. On a first-publication failure, use an approved stop/deny or forward fix; there is no prior version. Later Worker rollback can redeploy a retained compatible known-good version, but bindings/config/state must remain compatible. [Cloudflare rollback guidance](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/). Edge rollback similarly redeploys the retained approved function package; it does not reverse SQL/Auth settings automatically.
8. Any audience/Auth rollback requires the previously reviewed compare-and-set plan and explicit token/grant handling: restoring the old audience may reaccept old live tokens. Preserve false writes and all restrictions. No automatic hosted restore, schema drop, policy removal or backup cleanup.

## 9. Remaining blockers and readiness

| Requirement | Status |
| --- | --- |
| Native Edge/Deno bundle and gateway/routing rehearsal | PASS, synthetic Auth/RPC boundary clearly limited |
| workerd HTTPS HTML/cookie/CSRF/consent rehearsal | PASS |
| Exact fixed internal-route adaptation with regression | PASS |
| Existing account/RLS/OAuth/write protections | Preserved; local regressions PASS, hosted switches not reread here |
| Free-capable auth hosting product | Established; actual account/hostname/remaining entitlement NOT VERIFIED |
| Strict coordinated protection for MCP/login/consent/token validation | **BLOCKED**: candidate design only, no tested cross-platform coordinator |
| Concrete client registration and real lifecycle acceptance | NOT VERIFIED; OAuth/client/user creation prohibited in this phase |
| Hosted internal gateway contract, CPU/memory, TLS/browser/log behavior | Later separately approved hosted acceptance |
| Final hosting configuration/publication approval | NOT GRANTED |

**Phase C.1B readiness: NO for deployment/OAuth activation.** The two native runtime blockers have concrete passing local evidence and a tested routing fix. The remaining smallest step is a reviewed coordinated-abuse-control design plus account/hostname/client configuration evidence, followed by its local implementation/rehearsal. No security check was weakened to obtain a pass. Stop after this local verification; no hosted deployment is authorized.
