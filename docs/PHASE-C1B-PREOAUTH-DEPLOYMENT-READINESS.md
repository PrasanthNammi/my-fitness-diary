# Phase C.1B — Safe pre-OAuth Worker deployment readiness

Date: 2026-10-29 (Europe/Berlin).

**GO to request approval for the exact isolated pre-OAuth maintenance deployment below. NO deployment performed or authorized by this report. NO-GO for full OAuth/login/MCP rollout.** A new narrow entrypoint solves the real-client-ID bootstrap dependency without relaxing the full application validator. The maintenance consent page is reachable setup containment, not a functional authorization UI. OAuth must remain OFF.

Only local source/config/test/build work and read-only Cloudflare/Supabase/Site-runtime verification occurred. No hosted resource/configuration/client/user/SQL mutation, Google login, OAuth activation, audience migration, commit/push or production access. Local DOs below are emulator files, not hosted resources. Emulators are stopped; state/evidence retained.

## Why this is a separate maintenance release

The full `colocated-worker.js` correctly rejects startup without real predefined client IDs/callback mappings and a staging publishable key. Its old proposed config still has placeholders; it is **not** the first release here. We did not insert dummy clients, accept anonymous tools, or change that validator. Instead `preoauth-worker.ts` has its own strict pre-oauth-only validator and minimal route handler. Changing an environment flag cannot turn this bundle into the full application. Full login/client acceptance requires a later separately reviewed code/config deployment.

This release imports the same private SQLite AbuseCoordinator and its rate limits, but **no Auth, consent business, MCP tool/RPC handler or upstream fetch implementation**. There is no Supabase API key, Google secret, token-verification call or DB data request in its configuration/code path. It never accepts bearer/cookie credentials as identity; it denies all protected operations regardless of credentials. Public resource discovery is metadata only and correctly points to the staging issuer, which remains disabled.

## Fresh account and staging checks

| Check | Result / evidence |
| --- | --- |
| Cloudflare account | PASS GET account fa8205077c4bc4d2bb38ee035e74a156 |
| Membership | PASS accepted, Super Administrator — All Privileges, read-only membership response |
| workers.dev | PASS GET returns shanustylish777 |
| Worker scripts | PASS empty; mfd-connect-staging unused at inspection, not reserved |
| Durable Object namespaces | PASS empty; total_count0 |
| Wrangler identity | PASS outside sandbox, loggedIn=true, sole expected account; account:read/workers:write/workers_scripts:write/workers_routes:write among granted scopes. Sandbox-only whoami initially showed false; existing keyring authentication worked with read-only unsandboxed check. No login/new credential/export performed |
| Free plan/no payment method | Prior explicit owner dashboard evidence; subscription API still403 because no OAuth scope covers billing. No Billing token requested. Reconfirm Free/no-upgrade in deployment approval |
| Free SQLite support | Documented; actual first namespace/script provisioning still untested, no creation probe |
| Supabase identity | PASS gngnrmzeghjzqsmzuktl, MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, eu-central-1,17.11.0.003 |
| Auth state | PASS fresh public GET: disable_signup=true, Google=true, anonymous=false; OAuth discovery404 feature_disabled |
| Accounts/inventories | PASS fresh READ ONLY SQL: users2; sessions/native clients/authorizations/consents/local clients/grants/proposals0. This count check does not replace the earlier restricted UUID comparison before an actual deployment |
| Writes/audience | PASS database writes=false and exact Worker /mcp resource; existing private Site runtime revision1 staging/MFD_MCP_WRITES=false |
| Site URL/redirects | Latest explicit owner saved-dashboard evidence: localhost:3000 and sole fixed Google callback; not independently re-read management configuration in this review |

No personal account emails, raw UUID mapping, provider identity_data or credential values are included in this report. API authority/scopes and dry-run success do not prove first provisioning will succeed; stop on permission/billing/quota prompts without upgrading or changing privileges.

## Exact release/configuration

- Account: `fa8205077c4bc4d2bb38ee035e74a156`.
- Worker: `mfd-connect-staging`.
- Expected origin: `https://mfd-connect-staging.shanustylish777.workers.dev` (not reserved/deployed).
- Sole resource: exact origin + `/mcp`.
- Config: [preoauth-deployment.proposed.jsonc](../hosting/independent/preoauth-deployment.proposed.jsonc).
- Bundle: ignored `.sites-runtime/independent/preoauth-worker.js`, **7,383 bytes**.
- Compatibility date: retained reviewed `2026-10-12`; locked Wrangler4.151.0/workerd supports it. Initial attempt with today's date was rejected by installed runtime (max2026-10-19); no dependency upgrade or security check weakening used.
- workers_dev=true, preview_urls=false, routes=[], no custom domain/assets/service binding, no source map upload, observability disabled.
- Private binding `MFD_ABUSE` → exported `AbuseCoordinator`; SQLite `new_sqlite_classes` migration tag `mfd-c1b-v1`; fixed object name `mfd-staging-shared-v1`.

| Hash input | SHA-256 |
| --- | --- |
| Reviewed bundle AND actual Wrangler dry-run packaged module (identical) | f56abc06ee671408749c5f1e4e2807771a2b0ab02f62ea14958e55aac1f9de50 |
| Exact proposed deployment config | 5143a99996088a6dff67cbf6d32a46cea821bddaeb208540f1945eb91472602c |
| Ignored source-manifest.json | cce74431408a7578cd9337fa4d046ce880c4f428e8913ef9d046d403512bce73 |

Manifest under `.sites-runtime/c1b-preoauth/` pins source entrypoints, coordinator/transaction implementation, config and build script. HEAD remains af8e4149cf3bee6de3c90e14bfb74dea92d556e9; index empty; pre-existing uncommitted work preserved. A future deployment must explicitly approve this local artifact/provenance; this is not approval to commit/push or represent HEAD alone as the release. Rebuild/hash drift requires review before upload.

### All required runtime settings

| Name | Exact setting |
| --- | --- |
| MFD_RELEASE_MODE | pre-oauth |
| MFD_ENV | staging |
| MFD_SUPABASE_URL | https://gngnrmzeghjzqsmzuktl.supabase.co |
| MFD_OAUTH_ISSUER | same URL + /auth/v1 |
| MFD_AUTH_ORIGIN | exact expected Worker origin |
| MFD_MCP_RESOURCE_URL | exact expected Worker /mcp |
| MFD_ALLOWED_CLIENT_IDS | [] (explicitly empty in this release) |
| MFD_CLIENT_REDIRECTS | {} (explicitly empty in this release) |
| MFD_MCP_WRITES | false |
| MFD_ABUSE | private namespace binding, created only by later approved deployment |

**No runtime secrets or publishable key required.** A supplied MFD_SUPABASE_PUBLISHABLE_KEY is rejected, to catch accidentally using full-app config. No Google secret, Supabase secret/service-role key, database credential or Cloudflare token is placed in Worker vars/source/archive. Existing CLI/connector authentication is control-plane authorization, not a runtime binding. No production ref/URL/credential marker or fixture diagnostic export found in either generated or actual packaged module. Neither root dist nor env files/logs/fixtures/backups are deployment inputs.

## Expected deployed routes while OAuth is OFF

| Surface | Behavior |
| --- | --- |
| GET both /.well-known/oauth-protected-resource aliases | 200 public resource/issuer metadata within discovery quota; does not assert issuer activation/client compatibility |
| GET /oauth/mcp/consent | 503 setup HTML, no authorization lookup, form, redirect, cookie or approval |
| GET /auth/google/callback (including code/error query) | 503 setup HTML; query/credentials ignored, no exchange, no echo or session |
| GET /, /login, /logout, /auth/google, /oauth/mcp/connections, /oauth/mcp/approve | 503 maintenance HTML |
| POST known auth routes | 503 JSON, body/credentials not processed; no state/user/client/grant change |
| GET/POST /mcp with or without Bearer/cookies | 503 JSON, no initialize/list/tools/data access, no token verification/upstream call |
| Missing coordinator / exception /2-second timeout | 503; no local-only fallback |
| Denied quota | 429 + Retry-After60 |
| Wrong canonical origin / cross-origin Origin | 421 /403; forwarded headers cannot override origin |
| Unknown route / unsupported method (including HEAD/OPTIONS) | 404 /405 as applicable; no CORS/login bypass |

Maintenance responses use no-store, CSP with no content/forms/framing/base, no-referrer, nosniff and HSTS; no account or query details are reflected. OAuth-disabled issuer discovery failure is expected. Do not save/connect ChatGPT or attempt Google login at this stage. A 503 consent page is **not functional consent** and does not by itself clear activation/DCR/client sequencing.

## Durable Object security, cost and persistence

Same budgets: global30/minute, MCP25, auth20, discovery10, UTC fixed windows. All recognized requests use the same fixed object before responses. Private transaction methods remain compiled for class compatibility but no HTTP bootstrap path calls them. Native checks confirm zero pending transactions, no cleanup alarm and zero upstream fetches. Construction creates an empty transactions table plus counter table; counters remain at most four rows. Later full-app upgrade must preserve namespace/class/migration history/object name/schema/counters and separately review transaction retention/alarms/quotas. Do not reset counters or repeat the first namespace migration as a new namespace.

The first approved deployment would create **one Worker/script version/deployment and one SQLite namespace/binding**; first recognized traffic instantiates the fixed object/storage. These are usage-metered Cloudflare resources even when Free allowances cover them. No separate paid subscription/custom domain/store/log drain is needed by this design. Expected added subscription cost **$0 conditional on Free entitlement and quotas**, not a billing/availability guarantee. Stop on any upgrade/payment request. No deployment was used to prove entitlement.

Current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) / [limits](https://developers.cloudflare.com/workers/platform/limits/) and [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) document Free Workers100,000 requests/day and10ms CPU, and SQLite DO100,000 requests/day,13,000GB-s/day,5million row reads/day,100,000 row writes/day,5GB storage. This bootstrap makes no Supabase requests. At most30 admissions/minute implies43,200 admissions/day and86,400 logical counter upserts; index/initialization/metadata overhead still requires actual metering. Each recognized denied request still invokes DO; unknown routes consume ingress too. Attackers may exhaust availability/daily quotas. First acceptance should be bounded to at most20 intentional HTTP requests, not a load test; local concurrency evidence is not hosted10ms profiling.

## Local checks

| Check | Result |
| --- | --- |
| Complete runner | **40/40 PASS** (prior39 plus maintenance security suite) |
| Frontend/Worker TypeScript | PASS |
| Hosting lint | PASS |
| Independent builds/scans | PASS, fourth isolated preoauth-worker.js |
| Staging production-mode build/artifact scans | PASS: public37, hosting/dist169, selected output167 files |
| Config + exact routes / all credentials denied / no side effects | PASS |
| Missing/denied/exception/timed-out binding | PASS fail closed |
| Wrangler final deploy --dry-run --no-bundle --no-autoconfig | PASS; no upload, dry-run module identical SHA |
| Native HTTPS workerd/SQLite routes | PASS, maintenance/discovery/missing-binding, no cookies/redirects/upstream/transactions/alarm |
| Native90-request mixed-route concurrency | PASS global30; rest denied without upstream work |
| Full process restart | PASS exact quota snapshot retained |
| Actual hosted provisioning/CPU/hostname/access logs | UNKNOWN; requires approved first deployment |

Native wrapper adapts loopback request URL to canonical origin solely in the ignored fixture; wrong-origin behavior is independently unit-tested. Deployment bundle contains no adapter/diagnostics. This is local workerd compatibility, not proof of managed routing/latency/multi-region behavior. The initial local connection refusal followed the unsupported-date runtime startup failure; corrected config then passed. No failed security assertion was bypassed. Existing dependency advisory remains the previously audited development-only moderate Drizzle loader esbuild issue; no new dependency/lockfile or fresh audit claim in this task. No new runtime dependency introduced.

Evidence under ignored `.sites-runtime/c1b-preoauth/`; emulators stopped, counters retained. Added source `preoauth.ts`/`preoauth-worker.ts`, proposed config, `tests/preoauth-worker.cjs`, `scripts-smoke-preoauth.cjs`; build script emits fourth bundle. No existing auth/MCP business handler or frontend/private Site modification.

## Exact proposed commands — NOT executed as deployment

From repository root, revalidate source/config hashes and existing read-only identities/inventories. Build with `node scripts-build-independent.cjs`. Run the following commands **from the hosting directory** with the reviewed Node22 toolchain; the dry-run was executed locally only:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js deploy --config ./independent/preoauth-deployment.proposed.jsonc --no-bundle --no-autoconfig --dry-run --outdir ../.sites-runtime/c1b-preoauth/dry-run
```

The import fixes process cwd to hosting; starting there avoids relative module-resolution errors. An initial root-relative import form failed before running Wrangler and was corrected/tested in hosting. The future actual upload command, **only after exact-artifact approval**, is:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js deploy --config ./independent/preoauth-deployment.proposed.jsonc --no-bundle --no-autoconfig
```

Use existing Node22.13.1/locked Wrangler; no install/login/upgrade helper. Pin account through the exact config. Dry-run alone does not prove deployment authority or resource entitlement. Do not substitute the incomplete full colocated config, generic linked-project deploy, Supabase deploy, Sites publication or a command without the exact config. Reconfirm no script/name/namespace drift and Free/no-upgrade before any upload; on error inspect read-only, no blind retry. This report's deployment command is a proposal, not permission to run it.

## Emergency stop and rollback

First deployment has no prior known-good version. Approval must explicitly cover containment: disable workers.dev in Cloudflare Worker Settings → Domains & Routes, leave preview URLs off/no other routes. Verify all alternative version/deployment URLs fail the hard canonical-origin guard. Disabling workers.dev alone is not proof all URLs are unreachable; [routing guidance](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). If needed use a separately reviewed deny-all version retaining the class/binding/namespace; do not silently generate one mid-incident. Persist workers_dev=false in an approved recovery config before redeployment to prevent route reenablement.

A compatible later code rollback/redeploy retains namespace, fixed name, schema/counters and migration history. Never delete namespace/reset counters/restore a DB or reverse the committed audience to recover availability. Preserve the bootstrap bundle as a later compatible maintenance fallback; invoking it after real login must account for pending transactions/alarms and token/grant state separately. OAuth OFF must remain OFF throughout this first scope; no signup, Google, Site URL, hooks, DCR, key, client, allowlist or user changes. Unexpected hosted state requires stopping and separate recovery approval.

## Narrow approval request and stop gate

Proposed approval covers **only** first upload of the exact7,383-byte pre-OAuth bundle/config hashes above to account fa8205077c4bc4d2bb38ee035e74a156 as mfd-connect-staging, creating its SQLite AbuseCoordinator namespace/binding with mfd-c1b-v1 and allowing the fixed object's first use. Include the defined route-disable emergency-stop authority, existing Free/no-upgrade/no-purchase condition, acceptance of untested first provisioning, and at most20 bounded HTTP GET probes (metadata/maintenance/denial, never real login; these initialize/update quota state) plus read-only deployment/security/quota inventory checks. No concurrent changes by other operators during that window.

Immediately before approved execution: recheck both hashes, manifest/source provenance, account/CLI/subdomain/no collision, Free/no payment change, exact staging OAuth OFF/signup closed/Google enabled, unchanged two-user baseline/zero lifecycle inventories, both false switches and expected audience/redirects. Stop on drift, billing/permission prompt, changed archive or unknown config. After deployment verify actual origin/routes/metadata/503 denials, security headers, namespace binding/counter behavior and initial CPU/usage/log retention without request/header dumps. Stop and report before any later scope.

**GO for this conditional deployment-only approval request. NO-GO for full Worker/OAuth activation, Google or ChatGPT connection, registrations, Site URL/hook/DCR/key changes or broader traffic.** Management API credentials are not introduced. Deploying an available maintenance route removes the dead-host bootstrap issue but does not resolve unknown DCR/preconfiguration capability. Later activation must still use a separately reviewed supported sequence that preserves DCR disabled; no automatic toggle after publication. Stop here.
