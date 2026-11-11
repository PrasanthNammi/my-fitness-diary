# Phase C.1B — Final execution checklist

> Current ordered execution gates and fresh two-user preflight: [PHASE-C1B-OAUTH-CONFIGURATION-REVIEW.md](PHASE-C1B-OAUTH-CONFIGURATION-REVIEW.md). Use that review for the latest scope A–H ordering, exact values, advisor warning and first audience-only approval proposal. Historical entries below remain evidence, not extra authority.

Consolidated: 2026-10-29 (Europe/Berlin).

**Execution decision: NO-GO until Gate 0 is complete and the applicable hosted operations are explicitly approved.** This is the single current C.1B execution checklist. It supersedes the ordering and readiness summaries in PHASE-C1B-DEPLOYMENT-PLAN.md and PHASE-C1B-READINESS-RECHECK.md; retain those as supporting evidence. Consolidation itself authorizes no execution.

Only local documentation changed in this consolidation. No hosted state, source/runtime configuration, credentials, users, clients, keys, deployments, Git history or backups changed. Evidence below is carried forward from the reports unless explicitly stated; it is not a new hosted verification pass.

## Fixed scope and invariants

| Item | Exact target |
| --- | --- |
| Repository / branch | PrasanthNammi/my-fitness-diary / staging/mfd-oauth-testing |
| Only Supabase project | gngnrmzeghjzqsmzuktl — MFD OAuth Phase 2 Testing |
| Forbidden production project | djyozltkmbzhwuvemxuy — never connect, read or modify |
| Cloudflare account | fa8205077c4bc4d2bb38ee035e74a156 |
| Worker | mfd-connect-staging |
| Origin | https://mfd-connect-staging.shanustylish777.workers.dev |
| MCP / sole new audience | https://mfd-connect-staging.shanustylish777.workers.dev/mcp |
| Supabase issuer | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1 |
| Native OAuth client | MFD Staging — ChatGPT; Public; token authentication none; no secret |
| Exact ChatGPT callback | https://chatgpt.com/connector/oauth/Xm83tVWz4VJh |
| Client ID | Not yet assigned; must come from approved Supabase registration |
| Private limiter binding / class | MFD_ABUSE / AbuseCoordinator |
| SQLite migration / fixed object name | mfd-c1b-v1 / mfd-staging-shared-v1 |
| Existing private Site | appgprj_6ae0ae64c4e88191a385d9bdb6dc37c5 — unchanged and unpublished |

Preserve RLS, owner derivation, live sessions, native/local client restrictions, section consent, privileged-function EXECUTE restrictions and restrictive OAuth policies. Both MFD_MCP_WRITES and database writes_enabled remain false throughout. No service-role credential, managed-role change, broad audience array or authentication bypass. Do not enable DCR/CIMD, rotate/revoke/create signing keys, publish the private Site, change the frontend, run unrelated migrations, create paid resources, commit/push/merge or restore a hosted database under this checklist.

## Evidence and remaining gates

| Check | Recorded status | Execution implication |
| --- | --- | --- |
| Cloudflare login/account/subdomain | PASS | CLI/connector identities agree; accepted administrator membership; subdomain shanustylish777 verified by GET. |
| Worker and DO inventory | PASS at inspection | Both empty; proposed name unused, not reserved. Refresh immediately before creation. |
| Free plan | User-confirmed | Billing API rejects OAuth access. standard usage-model setting is not subscription proof. Reconfirm Free/no upgrade; stop at any payment prompt. |
| SQLite on Free | PASS documented | Actual first provisioning remains untested; do not create a probe. |
| Staging database/security | PASS in prior read-only checks | C.0.1 digest086a87995f52cf1a0b7e44fb904b7575; 16 RLS tables, intended ACLs/policies/private buckets; refresh before mutations. |
| Existing inventory/write switches | PASS at inspection | Zero users/native clients/local clients/grants; old Site resource; both writes false. Refresh counts without selecting secrets/payloads. |
| Data API | User-confirmed + REST probes | Exactly public,graphql_public; auto exposure disabled; private/Auth schemas rejected. Refresh evidence. |
| ChatGPT registration | PASS — user-observed | User-Defined OAuth Client, manual ID, none, S256 and exact callback available before deployment. Recheck same draft/callback. |
| Current signing | PASS — user dashboard + JWKS consistency | Current ES256/P-256; previous HS256; no standby/pending rotation. No signing change required. |
| Auth Site URL / redirects | PASS — user-confirmed dashboard evidence | Site URL http://localhost:3000; redirect list empty. These are current before-values, not hosted-ready proposed values. |
| OAuth Server / Auth Hooks | PASS — user-confirmed dashboard evidence | OAuth Server disabled; no Auth Hooks configured. mfd_mcp.access_token_hook exists in SQL but is not activated in Auth. |
| Authorization Path / DCR | NOT VERIFIED while OAuth disabled | Exact stored path and registration toggle are not established by the supplied observations. Do not infer defaults or enable OAuth to inspect them. |
| Intended Google-user login | PASS locally; hosted NOT VERIFIED | Google initiation/callback/S256, browser context/session binding and account-substitution tests pass; provider/signup/exact-redirect prerequisites remain. See PHASE-C1B-GOOGLE-AUTH-LOCAL.md. |
| Real client ID/release config | NOT CONFIGURED | No dummy IDs; proposal cannot start with empty inventory. |
| Hosted runtime/token lifecycle | NOT VERIFIED | Requires separately approved bounded acceptance, not a prerequisite to claim already passed. |
| Execution authority | NOT GRANTED | Preparation/login approval is not deployment/Auth/SQL/client/user approval. |

Signing detail: public JWKS key kid e3a069e3-599c-4897-9a74-b1cd6d70876e, EC/P-256/ES256/sig. Dashboard current kid was not supplied; no exact kid match or new-token signature test is claimed. The previous HS256 key may remain trusted until revoked. Worker verification delegates to pinned Auth and does not enforce ES256-only headers. Preserve the key; later verify new token alg/kid/signature and all authorization claims. Do not equate absent symmetric JWKS material with revocation. See [Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys).

## Exact change inventory

| Scope | Proposed change | Preserved boundary |
| --- | --- | --- |
| Audience SQL | Update only mfd_mcp.settings.resource_uri and its column default from old Site /mcp to new Worker /mcp; schema-cache NOTIFY | Row identity/other values, writes=false, policies, functions and grants unchanged |
| Auth URLs | Site URL=new origin; exact first-party redirects=new origin+/ and new origin+/auth/google/callback; Authorization Path=/oauth/mcp/consent | Capture current values; review project-wide login/email effects; no wildcard callbacks |
| Auth hook | Enable/bind mfd_mcp.access_token_hook only if required and approved | Inspect existing hook first; no blind replacement or body/ACL change |
| Signing | No change | Current ES256; previous HS256 retained; no rotation/revocation |
| OAuth Server | Enable only under explicit approved setup window | Keep DCR disabled; no accounts/flows until service validation |
| Native client | Register exactly one public client with sole exact ChatGPT callback and method none | Supabase assigns ID; no secret; no invented/CIMD identity |
| Local release config | Fill actual client ID/callback map and existing staging publishable key; pin account; preview_urls=false | Existing strict startup validation and writes=false |
| Cloudflare | First deployment of independent Worker plus SQLite class migration/private binding | No extra routes/custom domain/resources; no private Site change |
| Local SQL client registry | Add only assigned native ID to mfd_mcp.clients after audience transition | Separate reviewed SQL; no grants/consents/proposals seeded |
| Acceptance only | Approved synthetic Alice/Bob and ChatGPT connection | Separate scope; no production users/data |

Audience proposal: [c1b-audience-transition.proposed.sql](../database/staging/c1b-audience-transition.proposed.sql).
SHA-256: `1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590` (rechecked during consolidation).

Old audience: `https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp`.
New audience: `https://mfd-connect-staging.shanustylish777.workers.dev/mcp`.

The SQL uses one transaction, locks/timeouts, postgres/target/exposure assertions, exactly one false-write settings row, expected default and empty local clients/grants/proposals. It aborts on drift and preserves all other state. Do not insert the local client before this SQL. Native registration and local allowlisting are different operations. No generic db push, C.0.1 replay or history repair.

Config proposal: [colocated-first-deployment.proposed.jsonc](../hosting/independent/colocated-first-deployment.proposed.jsonc). It remains deliberately incomplete. Runtime variables:

| Variable | Required release value |
| --- | --- |
| MFD_ENV | staging |
| MFD_SUPABASE_URL | https://gngnrmzeghjzqsmzuktl.supabase.co |
| MFD_OAUTH_ISSUER | exact issuer above |
| MFD_AUTH_ORIGIN | exact Worker origin above |
| MFD_MCP_RESOURCE_URL | exact Worker /mcp above |
| MFD_SUPABASE_PUBLISHABLE_KEY | Existing staging public publishable key; compare without logging |
| MFD_ALLOWED_CLIENT_IDS | JSON array containing only actual assigned ID |
| MFD_CLIENT_REDIRECTS | JSON object mapping that ID to the single exact callback |
| MFD_MCP_WRITES | false |

Full Worker routes: /mcp; / and /login; /logout; POST /auth/google and GET /auth/google/callback; /oauth/mcp/consent; /oauth/mcp/connections; both /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/mcp aliases. /oauth/mcp/approve remains disabled. No /internal/limiter API. Discovery/login bootstrap is public; private MCP requires verified Supabase bearer, browser operations use protected first-party sessions/CSRF. Unknown/other-host requests fail closed.

## Ordered execution checklist and approval boundaries

An approval may explicitly cover several named scopes together; this checklist does not require repeated permission for an already-approved scope. It grants none itself. Every stop condition overrides continuation.

### Gate 0 — read-only readiness, before any mutation

- [ ] Confirm branch/source scope, staging project/host/account and empty index; preserve all existing uncommitted work. No automatic source-save helper.
- [x] Record supplied dashboard before-values: Site URL http://localhost:3000; redirect URLs none; OAuth Server disabled; Auth Hooks none configured. Evidence is user-confirmed screenshot observations, not an independent management-API read.
- [ ] Preserve explicit uncertainty about Authorization Path/DCR while disabled; require an approved setup hold point that verifies DCR is off before client registration or flows. Never enable just to inspect.
- [x] Implement independent Google login locally; synthetic/native workerd verification passed.
- [ ] Verify/approve staging Google provider, exact callback configuration, identity linking and existing-user-only signup restriction before hosted Google use. Do not assume current provider readiness.
- [ ] Confirm ES256 dashboard selection/JWKS consistency; preserve previous HS256. Do not issue tokens solely for preflight.
- [ ] Reconfirm ChatGPT callback from the same draft, public client/method none/S256; no Save/Connect yet.
- [ ] Refresh staging catalog/ACL/RLS/storage/private-schema exposure, resource/default, users/native/local clients/grants/proposals/sessions counts, both false switches and storage delegation. Stop on unexpected drift.
- [ ] Verify backup hashes and retain before-values privately. Confirm Free plan/no upgrade, account permissions, Worker/namespace inventory and unchanged proposed hostname.
- [ ] Review and approve a bounded coordinated setup window, ordered mutation scopes below and emergency-stop authority. Capture which scope the approval covers.

### Scope A — audience transaction; explicit SQL approval

- [ ] Verify exact approved SQL hash, project externally and secure session. For libpq require sslmode=verify-full with the reviewed CA; never display .pgpass or a credential URL.
- [ ] In that same staging session set mfd.c1b.target_ref='gngnrmzeghjzqsmzuktl' and mfd.c1b.exposed_schemas='public,graphql_public' only after independent verification.
- [ ] Execute the entire unchanged proposed SQL including BEGIN/COMMIT. On error ROLLBACK and stop; no partial replay/guard changes.
- [ ] Read back one correct resource row/default, writes=false, unchanged security and empty local inventory. Record provenance without unreviewed migration-history repair.

### Scope B — Auth setup and native client; explicit configuration/registration approval

- [ ] Apply only reviewed URL/path/hook changes from captured before-values. Preserve signing and provider permissions; stop if an existing hook conflicts. Keep DCR disabled.
- [ ] Enable OAuth only within the approved setup window if registration requires it. Supabase's documented flow enables the server before registration; do not assume disabled-server registration works.
- [ ] Register MFD Staging — ChatGPT, Public, method none, exact callback above. Record/verify assigned ID, no secret. Stop if the provider cannot express these exact settings.
- [ ] No users, local consent or OAuth login yet. Issuer metadata may exist before the Worker; this temporary cross-service state must be explicitly accepted. No atomic rollback across providers is promised.

### Scope C — local release finalization, then separate Worker/SQLite deployment approval

- [ ] Fill real client inventory/key into final account-pinned config. Keep previews off, no custom routes, no source maps/application observability, false writes; review platform logging/redaction separately.
- [ ] Build independent bundle and inspect exact release inputs for production references/secrets/test-only diagnostics. Record source manifest, config/archive SHA and provenance; a commit/push is not implied.
- [ ] Run all local tests, types, lint, audits, staging build/artifact checks and native fail-closed/concurrency/persistence checks appropriate to final changes. Stop on regression.
- [ ] Obtain approval for the exact finalized artifact/config and first Worker/SQLite namespace migration/binding creation, including emergency stop. The earlier artifact hash is not a substitute for this gate.
- [ ] Deploy only approved isolated resources. Record provider deployment/version/namespace IDs; stop on permission/billing/quota prompts. No paid upgrade or retries with weakened permissions.
- [ ] Verify bounded HTTPS routing/discovery, exact audience/issuer, missing/invalid bearer rejection, browser CSRF/cookie/security headers, DO initialization/coordination/outage denial, CPU and quotas. No real users/diary tests yet.

### Scope D — application client registry; explicit SQL approval

- [ ] Prepare/review exact single-ID allowlist transaction using the actual assigned ID. It is not included in the audience SQL.
- [ ] Insert only that ID after Scope A; validate registry/runtime/native agreement, no section grants/proposals and writes=false. Do not rerun the empty-inventory audience transition afterward.

### Scope E — synthetic users and client connection; explicit acceptance approval

- [ ] Create only approved synthetic Alice/Bob staging accounts before attempting account-based ChatGPT connection. Never import real/production data.
- [ ] Configure ChatGPT with proposed /mcp, OAuth/User-Defined client, actual assigned ID, blank secret, none and S256; verify callback unchanged. Prefer real issuer discovery.
- [ ] If manual endpoints are needed: authorization=https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/oauth/authorize; token=https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/oauth/token. Manual configuration must preserve issuer/resource/state/PKCE validation, not hide broken metadata.
- [ ] Test S256/wrong or missing verifier, state/callback/issuer/resource/signature/expiry/client/session denial, consent sections, refresh rotation/reuse, revoke/reconnect/logout and concurrent operations.
- [ ] Independently connect each synthetic user's own MFD identity; test Alice/Bob and direct REST/RPC/storage isolation. Never use operator RLS bypass or ChatGPT identity as owner proof. ID tokens cannot substitute for resource access tokens.
- [ ] Verify new token alg/kid/signature against trusted JWKS, live consent/session and exact audience. Record residual previous-HS256 trust accurately; no key changes.
- [ ] Final read-only catalog/ACL/policy/bucket/default/exposure/write-switch checks and security/performance advisors; review CPU, quota/logging and error findings. Stop/report before broader rollout or other clients.

**Bootstrap resolved:** callback is already known, so native preregistration supplies the real ID before the full Worker is built/deployed. No metadata-only release is needed for this observed dependency. Do not introduce one or dummy clients as a shortcut. Client compatibility remains unproven until Scope E succeeds.

## Expected costs and hard limits

Expected incremental subscription cost for a bounded test within existing Free allowances: **$0**, conditional on reconfirmed Free entitlement and staying within quotas. This is not a guaranteed usage bill or availability promise. No paid upgrade, custom domain, Redis, log drain, SMTP, PITR, branch or backup service is approved.

| Service | Documented Free allowance / constraint | Operational consequence |
| --- | --- | --- |
| Workers | 100,000 requests/day;10ms CPU/request;128MB;50 subrequests/request | Hosted CPU/traffic must be measured; local success is not certification |
| SQLite DO compute | 100,000 requests/day;13,000GB-s/day | Denials still consume requests; outage/quota errors deny access |
| SQLite DO storage | 5 million row reads/day;100,000 writes/day;5GB | Four fixed counter rows; metered index/write overhead still needs observation |
| Supabase | Existing shared Auth/DB/storage/egress quotas | OAuth Server has no separate charge per reviewed docs; sign-ins count toward MAU |

Shared quota: global30/minute, MCP25, auth20, discovery10, UTC fixed windows. Continuous full admissions imply43,200/day and86,400 logical row upserts plus overhead; not proof of billable writes. A 50-user×20-tool/day example is30,000 tools/month plus auth/discovery/metadata. Attackers can exhaust shared availability/daily requests; no per-user fairness guarantee. Fixed-window boundaries permit bursts. Free exhaustion must fail closed, not upgrade automatically.

References carried from reviewed official documentation: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Supabase OAuth](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [OpenAI authentication](https://developers.openai.com/plugins/build/auth). Recheck applicable entitlement/limits before approved execution; consolidation did not refresh pricing/API state.

## Failure and recovery actions

| Failure / stage | Stop and containment | Recovery approval boundary |
| --- | --- | --- |
| Read-only gate fails | Execute no mutation; record discrepancy | Revise/review evidence; never skip guards |
| Audience SQL fails before COMMIT | ROLLBACK/close failed session, stop | No modified-permission automatic retry |
| Incident after audience COMMIT | Keep writes false; stop rollout | Reviewed reverse compare-and-set only after token/grant inventory; old audience can reaccept old tokens |
| Auth setup/client registration fails | Stop remaining operations; no user login | Restore only captured approved before-values via separately authorized actions; don't guess/delete clients or keys |
| First Worker/DO initialization/deployment fails | Stop acceptance; use approved emergency stop | No earlier good version exists; reviewed deny-all/forward fix or route disable; preserve namespace |
| Invalid audience/auth/isolation/consent | Stop traffic/tests, retain denial | Diagnose config/token/native/local state; no wide audience/ACL/auth fallback |
| Rate limits/Free quota exhausted | Deny, wait/review actual usage | Do not reset counters/change object names/raise limits/upgrade automatically |
| Native revoke fails | Local consent removal keeps data denied; stop test | Approved native/session recovery; don't recreate consent to mask failure |
| Later code rollback | Known-good compatible code only | Same DO class/binding/schema/name; code rollback does not roll back SQLite or Auth settings |

**Emergency stop must be included in deployment approval:** disable workers.dev under Worker Settings → Domains & Routes; keep preview URLs disabled/no custom routes. Confirm alternate deployment/version URLs fail canonical-origin checks or use a separately reviewed deny-all release retaining the class/binding/namespace. Disabling workers.dev alone does not disable every alternative URL. Persist workers_dev=false in the reviewed recovery config before any later redeploy so the route is not accidentally reenabled. Never delete namespace/counters or make the private Site public. See [route disabling](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) and [rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Retain backup directory `/Users/prasanthnammi/MFD-Staging-Backups/gngnrmzeghjzqsmzuktl-20261027T200208Z`:

| Archive | Recorded SHA-256 |
| --- | --- |
| application.dump | 8d11b21cce6c791b49a7178e6afaa3e0bf15e5dd25e8eaf35b38ed7399e2bc80 |
| managed-schema-only.dump | a402dfec575b60459e711bb8df78e3165e2a1549d1be5371f3d41e1e1c83f55a |

Hashes/archive readability and prior local17.11 restore were verified in earlier preparation. It is an accepted application-scoped, pre-remediation capture, not full platform recovery or an automatic hosted rollback. Preserve backups; no restore, deletion, schema drop or broad-grant restoration is authorized.

## Release evidence and final approval record

Historical preparation results:37/37 test files, both TypeScript projects, lint, staging/independent builds and artifact checks passed. Native90-request mixed-route test capped admissions at30, fail-closed checks and process-restart persistence passed. Root audit0; hosting1 development-only moderate GHSA-67mh-4wv8-2f99, no high/critical; do not suppress it. New final config requires fresh relevant validation under Scope C.

Current independent bundle SHA rechecked during consolidation: `8a154eed107c482fe75bc6e29ae06bc3966d93b1945a14ae00b9f8fd371768b3`. It identifies a local artifact, not an approved deployment. No new tests or hosted acceptance were run for this documentation-only consolidation.

Before execution record: approver/date; covered scopes A–E and emergency-stop authority; exact project/account/host; audience SQL hash; actual assigned client ID/callback; source/config/archive hashes; approved recovery limits; Free/no-upgrade condition; allowed synthetic users/test window. Anything omitted remains unauthorized. Commit/push/publication of the existing private Site, paid services and production access remain excluded.

**Next gate:** obtain the missing read-only Auth management evidence and review the coordinated setup scope. The architecture/bootstrap is ready for approval review; the placeholder configuration and missing runtime inventory mean a finalized deployable release is not yet cleared. Stop here.


## Gate 0 final assessment and first approval scope — 2026-10-29

This section refines the earlier checklist using the user's confirmed dashboard observations. No new screenshots were independently opened in this pass; the supplied exact observations are recorded as manual evidence. No hosted calls/mutations were needed for this documentation/source review.

### Confirmed before-values and remaining uncertainty

| Setting | Current evidence | Proposed later change |
| --- | --- | --- |
| Site URL | http://localhost:3000 | Exact independent Worker origin |
| General redirect URLs | Empty | Exact origin+/ and origin+/auth/google/callback proposed; real provider preservation of the state query remains an acceptance prerequisite |
| OAuth Server | Disabled | Enable only during an expressly approved setup window |
| Auth Hooks | None configured | Bind/enable existing mfd_mcp.access_token_hook; required before external client token acceptance, not an optional step |
| Signing | Current ES256; previous HS256 | No change |
| Authorization Path | Exact stored value not established while disabled | Explicitly set/verify /oauth/mcp/consent under later approval |
| Dynamic Client Registration | Exact saved/effective toggle not established while disabled | Require explicitly disabled before registration/authorization; do not report current DCR=false without evidence |

Gate 0 evidence collection is now finalized with these known values and declared unknowns; **Gate 0 is not cleared for a general MFD-user rollout.** Fresh catalog/inventory/recovery checks still precede any execution. Authorization Path/DCR uncertainty can be handled only by a specifically approved configuration hold point: enable as part of intentional setup, inspect/set DCR off and exact path immediately, stop before registering clients or issuing tokens if those controls cannot be verified. No enablement solely for inspection, no guessed default and no automatic continuation through that hold point. If policy requires proving DCR off before any server enablement, obtain a supported provider read/configuration mechanism first; current evidence cannot satisfy that stricter requirement.

### Google-user compatibility finding — historical before local remediation

**Superseded implementation status:** Google login is now implemented and locally verified; see the update at the end and PHASE-C1B-GOOGLE-AUTH-LOCAL.md. The following explains the original gap, not the current source.

Source review: hosting/independent/auth.ts exposes an email/password form and calls /auth/v1/token?grant_type=password. It has no Google authorization initiation, provider callback handler or PKCE code exchange. Its host-prefixed cookies are isolated from the private Site, so a user already signed into the diary via Google does not automatically have an independent consent session. The frontend adapter and existing Site Worker support Google, but that code is not the independent router. The protocol-level Supabase OAuth client flow does not supply this missing first-party login implementation.

**Email/password:** existing staging test accounts can use the local implementation, subject to separately approved account creation and real hosted acceptance. **Google-only users:** cannot complete the independent sign-in as implemented unless they separately have a valid password; do not assume that, require password creation, copy cookies/tokens between origins, or treat their Google email as an authenticated MFD identity.

Supporting intended Google users needs a separate local implementation/review: Google initiation through staging Supabase; random browser-bound PKCE verifier/challenge and login-context protection; exact independent callback exchanging the code server-side; verified first-party Supabase identity/session; Secure/HttpOnly cookies; preservation of only a validated pending authorization_id; replay/error/cross-site/redirect negative tests. Reuse the same Supabase user subject and existing consent/RLS; no assistant-supplied user ID or email-based identity lookup. Review provider/linking/new-user behavior before testing so Google sign-in does not silently create unauthorized hosted accounts. No Google provider activation/credentials/project changes are authorized. The current staging Google provider status was not newly verified by these dashboard observations.

The required Google callback is not implemented or selected, so the general redirect allowlist for Google cannot yet be finalized. Do not reuse the ChatGPT callback: Google→Supabase provider callback, Supabase→MFD first-party callback, and MFD authorization→ChatGPT callback are three separate boundaries. See [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). This is a product-readiness blocker, not a reason to weaken MCP or database checks.

### Intermediate-state exposure review

| State | Data-access boundary / failure behavior |
| --- | --- |
| Audience changed; OAuth disabled; no clients | No new endpoint or identity access. Existing old-audience MCP data calls fail DB audience validation. Browser first-party DML remains governed by unchanged RLS. |
| Site URL/path changed before Worker | May cause login/email redirects or consent UI to be unavailable; record before-values. A broken redirect is not a diary-access grant. |
| Hook activated | Changes token claims for registered MCP clients using exact active setting; does not itself create consent. Must verify first-party claims remain unaffected in later acceptance. |
| OAuth enabled, no registered clients/local grants/users | Exposes issuer endpoints; no established local diary entitlement. DCR is unknown until configured, so do not claim zero registration exposure during enablement. Use bounded setup/stop hold point. |
| Native public client exists; local registry absent | Runtime client identity alone grants no diary access; dispatcher rejects unregistered local clients. Hook may not assign MCP audience before local registration, further failing closed. No consent flow/testing yet. |
| Worker deployed; local registry absent | Discovery/login is public by design; tools require verified bearer and exact claims, data RPC also checks local client/session/consent. Keep no account/authorization flows until allowlist and validation gates pass. |
| Local registry populated | Registered identity still does not grant diary sections; live per-user consent and session required. Only approved synthetic users/flows may now begin. |
| Partial native approval/local grant save | Native approval alone does not authorize missing local sections. Existing grants may persist; revoke/reconnect on failure. Never claim cross-service atomicity. |

These boundaries prevent an intermediate setup step from intentionally granting diary access; they are source/design evidence, not new hosted race/penetration tests or a guarantee against every implementation defect. RLS alone does not make arbitrary setup safe: keep zero unexpected users/clients/grants as a hard stop, preserve callable-function ACLs and SQL consent checks, verify DCR before client operations, and do not start flows early. The password login endpoint is an authentication surface and must retain coordinated quotas/CSRF even before any diary entitlement exists.

### Exact first hosted execution scope proposed for approval

**Scope A only — staging audience preparation. No Auth enablement, URL change, hook activation, client creation, allowlist insertion, Worker/DO deployment or user creation.** This is concrete/reviewable but remains unauthorized and is not recommended to execute merely to make progress while the login-scope decision is unresolved.

- Target: gngnrmzeghjzqsmzuktl only, verified externally as MFD OAuth Phase 2 Testing; role postgres; verified TLS if using libpq.
- SQL: database/staging/c1b-audience-transition.proposed.sql, unchanged SHA-2561050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590. Set only the reviewed session target/exposure assertions and execute the entire guarded transaction.
- Changes: only active resource_uri and its column default, old private Site /mcp→new independent Worker /mcp, plus transactional PostgREST cache NOTIFY. No dashboard configuration changes in this first scope.
- Expected effects: new expected MCP audience is prepared; no endpoint is deployed, no token/client/consent is created and writes stay false. Old-audience data requests are denied after commit; this is not cryptographic token revocation. Existing private Site remains unpublished/unchanged.
- Preconditions: explicit approval of this checksum/scope; refreshed exact staging identity/catalog/ACL/RLS/write switches/default/resource and zero users/native/local clients/grants/proposals/sessions; unchanged exact Data API list/auto-exposure; verified backup hashes; recorded before-values; accepted downtime/old-token behavior. SQL guards enforce only part of this list, so external preflight remains mandatory.
- Before-COMMIT failure: ROLLBACK and stop. Never edit guards/permissions to retry.
- After-COMMIT issue: stop subsequent setup; leave OAuth disabled/no deployment and writes=false. A reverse resource/default change is a separate reviewed compare-and-set transaction after checking current inventory and token reacceptance risk; no blind replay/automatic rollback or database restore. Do not imply the reverse SQL is already approved or prepared.
- Costs: no new resource/subscription; negligible existing DB/API operations within current quotas, no zero-usage guarantee. No paid feature.

**Blocking decisions before requesting this first scope:** either resolve Google support in a separately approved local-only implementation phase, or explicitly accept an email/password-only synthetic staging rollout with Google readiness deferred. A complete MFD-user OAuth rollout is NO-GO with the current password-only independent handler. Even for the narrower staging path, later Auth approval must explicitly cover disabled-state path/DCR uncertainty and the post-enable stop gate; actual client ID/config/artifact approval still follows registration. No signing changes are needed.

**Recommendation: NO-GO for hosted execution/deployment now. GO for review of the bounded Scope A proposal and a local-only Google-login remediation plan (or an explicit narrower staging decision).** No mutation authority is inferred from this assessment. Stop after this checklist; no code/security/runtime changes or new regression run were performed.


## Google compatibility implementation update — 2026-10-29

This update supersedes the historical password-only finding and the requirement to implement Google locally before scope review. Full evidence and manual configuration inventory: [PHASE-C1B-GOOGLE-AUTH-LOCAL.md](PHASE-C1B-GOOGLE-AUTH-LOCAL.md).

- [x] Independent POST /auth/google and GET /auth/google/callback implemented; same shared auth quota, no public quota bypass.
- [x] Five-minute browser-bound random state/S256 verifier, exact staging provider destination/callback, validated relative pending authorization_id continuation, cancellation/error/replay handling.
- [x] Returned Supabase token independently verified before cookies; exact first-party issuer/audience/subject/session/role/expiry enforced. Existing browser account cannot silently switch. Logout required to change users.
- [x] Alice/Bob pending-authorization mismatch is rejected before native approval/local grant write. Session cookie cannot authenticate MCP; no implicit section consent.
- [x] Password login retained; token saving additionally verifies first-party identity. RLS/SQL/session/client/owner/consent checks, limiter budgets and false writes unchanged.
- [x] 38/38 local files, types, lint, builds/scans, native HTTPS workerd with real local SQLite and synthetic provider exchanges pass. Audits0 root/1 documented development moderate hosting,0 high/critical. No new dependency.
- [ ] Staging Google provider configuration and approved Google Web client/audience/test-user restrictions verified. No production client credentials or new resource assumptions.
- [ ] Google→Supabase callback exact https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/callback verified against provider dashboard.
- [ ] Supabase→Worker callback exact https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback approved in general redirects; real flow retains browser state query. No wildcard fix.
- [ ] Existing-user-only rule configured through an approved provider-supported path before Google testing. Supabase “Allow new users to sign up” disabled means only existing users may sign in per official docs; current state is not newly verified. Worker does not prevent provider-side user creation before callback. No unknown/real Google account test until this prerequisite passes.
- [ ] Hosted Google/cookie/provider PKCE/replay and existing-user linking acceptance separately approved. Local mocks are not provider acceptance.

Current local bundle SHA553804ec71d01df3a60ecbc9b182a8eaabeee721e44f96d5a0ff1c694d714de0 replaces the earlier local artifact identifier. A final actual-client/config release still needs fresh hashes/review. Old release approval cannot be inferred.

The first proposed hosted Scope A remains audience-only and unexecuted; SQL SHA1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590 is unchanged. Add separately reviewed Google provider/general-signup/redirect changes to later scope approvals only after recording before-values; neither existing Scope A nor this implementation authorizes them. Current Google/provider signup gates must not be bypassed by testing with unknown accounts or accepting an email as identity. Existing Google Cloud/Supabase configuration was not modified or presumed valid.

**Revised recommendation:** GO for review of locally verified Google compatibility. NO-GO for hosted execution/deployment until manual provider/signup/configuration prerequisites, fresh Gate0 checks, real client inventory and scoped approvals pass. Both MCP writes remain disabled. Stop before hosted execution.

## Manual Google setup follow-up — 2026-10-29

**Current recommendation: NO-GO for login tests/deployment; next proposed hosted operation is signup containment only.** This supersedes the earlier recommendation to make audience SQL the first mutation. No hosted mutation was performed in this verification pass.

### New evidence and its limits

| Check | Result | Evidence |
| --- | --- | --- |
| Google provider | PASS, independently read | Staging public /auth/v1/settings HTTP200: google=true, email=true, anonymous=false, mailer_autoconfirm=false. |
| Public signup restriction | FAIL for intended closed staging | Same response: disable_signup=false. Google enabled does not make this existing-user-only. |
| Staging accounts | Zero, independently read | READ ONLY counts: auth.users=0, auth.identities=0, auth.sessions=0. No account details/passwords/secrets selected. |
| Native/local clients and grants | Zero, independently read | auth.oauth_clients=0, mfd_mcp.clients=0, mfd_mcp.grants=0. |
| OAuth Server | Disabled, independently read | Discovery404 feature_disabled; Google provider activation is separate. |
| Database writes/resource | PASS, independently read | writes_enabled=false; active resource remains old private Site /mcp. |
| Application writes | PASS, independently read | Sites runtime revision1: MFD_ENV=staging, MFD_MCP_WRITES=false. No independent Worker deployed. |
| Signing discovery | PASS, scoped | Public JWKS still exposes ES256 EC verification material; no issuance or key change. |
| Google Cloud project/client | User-confirmed | MFD OAuth Staging, Testing mode, user's Google account added as test user. Client ID48312208925-bo2nhlk16thamusr7aui42ttonp9qn8c.apps.googleusercontent.com. No secret inspected. |
| Google→Supabase callback | PASS for expected value + user confirmation | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/callback matches documented provider callback structure. Google console registration not independently retrieved; use supplied confirmation. |
| Supabase configured Google client ID | NOT VERIFIED independently | Public settings establish enabled status, not the selected client ID/secret. User-provided ID is recorded; no secret-bearing management response requested. |
| Site URL/general redirects | Prior manual evidence, not freshly re-read | Last supplied dashboard: http://localhost:3000 and no redirects. Google setup confirmation did not confirm changes here. Planned Worker /auth/google/callback must be explicitly approved/configured later. Do not assume the redirect list changed. |

Google's client ID is public configuration for Google→Supabase login, not the pending ChatGPT→Supabase public OAuth client. Do not put it in MFD_ALLOWED_CLIENT_IDS or mfd_mcp.clients. Google Client Secret stays only in approved Supabase/provider secret storage; do not copy it to Worker/source/chat. Testing-mode access limits are an additional provider boundary, not a substitute for Supabase signup control, per-user RLS or local section consent.

### Existing-user-only and zero-user bootstrap

[Supabase general configuration](https://supabase.com/docs/guides/auth/general-configuration) documents that disabling “Allow new users to sign up” permits only existing users to sign in. With zero users, that intentionally prevents all ordinary first-time sign-ins until approved administrative provisioning. Do not enable public signup temporarily to seed test users or try an unknown Google identity first.

Recommended process, requiring separately approved operations:

1. **Contain signup first:** disable “Allow new users to sign up” for this exact staging project and verify disable_signup=true via a read-only settings request. Preserve Google/email/anonymous/provider credentials, confirmation settings, keys, OAuth Server, hook/path/DCR, URLs, audience, policies and both write switches. No login/registration probe is needed to read back this setting.
2. **Approve exact test identities:** identify the account owner's explicit Google test identity and a separate Bob synthetic identity through a secure operator process. Google test-user inclusion alone is not permission for this agent to create that MFD account. Never infer approved emails from client IDs or from the operator's Cloudflare identity. Specify whether the owner's account is a controlled personal test identity (not synthetic) and obtain explicit consent for that scope. For a second Google identity, separately approve its Google test-user inclusion; do not change Google Cloud here.
3. **Administrative provisioning only:** after approval, use Supabase Dashboard Auth Users supported creation/invitation, or documented server-only Auth Admin createUser, for exactly the approved accounts. Do not insert auth.users/auth.identities by SQL. No service-role credential in the Worker/browser/chat; prefer owner dashboard action instead of requesting a new privileged credential. Record only approved IDs/counts in restricted evidence. Any password must be random/unique and privately handled; no shared/public example password. Do not auto-confirm arbitrary email ownership: require explicit controlled-account ownership confirmation/approval or an approved verification process.
4. **Separate linking decision:** an administratively created email user is not yet a Google identity. Verify provider-supported linking and that Google authentication returns the intended same Supabase UUID; automatic linking depends on provider/verified email semantics and must not be assumed from matching strings. No application email-based identity assignment, manufactured Google identity or blind email-confirm flag. If the approved existing account cannot Google-sign-in with signup closed, stop and review supported linking/verification; do not reopen public signup or enable manual linking as a workaround. No actual linking/login is attempted now.
5. **No diary fixtures or consent from provisioning:** account creation grants neither native MCP registration nor section consent. If test fixtures are later needed, approve synthetic owner-bound data separately. Keep local MCP clients/grants empty until their normal sequence, and keep both write switches false. Creating an Auth account is a hosted mutation even when its data is empty.
6. **Preserve earlier audience guard:** current Scope A operational preflight expects zero users/sessions in addition to the SQL's empty local-client/grant/proposal gates. Therefore do signup containment now if approved, then perform the separately approved audience transition while inventory is still zero, before administrative test-user provisioning. If users are intentionally provisioned earlier, stop and explicitly revise the zero-user preflight/provenance instead of calling approved accounts unexpected drift or silently bypassing checks. Do not weaken the SQL empty-client/grant/proposal gates.
7. **Readiness before login:** finish separately approved exact Worker redirects, hook/issuer/client/audience/allowlist/deployment steps. Then approve bounded existing-account Google/password login and verify same UUID, PKCE/state, callback/replay, Alice/Bob isolation, direct API restrictions and revoke/refresh. Do not attempt Google authentication solely to test provider setup while the Worker callback is undeployed/unallowlisted.

References: [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking). Admin provisioning is a plan, not an executed API call or claim that the actual dashboard flow has been tested with signup disabled.

### Unapproved identities and data access

Current signup-enabled state is not acceptable evidence of a closed existing-user test environment. An unknown identity could potentially obtain a new first-party account through available signup/provider paths. Google Testing mode does not close email/password signup. Existing owner RLS should prevent reading another user's diary; a new authenticated owner may still create/access their own workspace through intended first-party DML. “Both MCP writes=false” disables MCP mutations, not ordinary browser DML. Do not claim that empty MCP registry prevents all first-party account/data creation.

For MCP, unregistered client/wrong audience/no live session/no per-user consent continues to fail closed; an identity cannot pick another owner via user_id/email. Signup containment, restricted administrative test provisioning, preserved RLS/ACL/private schemas, exact registered callbacks, CSRF/browser PKCE/session binding and explicit section consent are complementary controls. No unapproved identity/login attempt is authorized as a negative test in this pass. If unexpected users or sessions appear, stop and investigate metadata under approval; do not delete accounts or revoke sessions automatically.

### Next exact operation proposed for approval — Scope 0S

- **Target:** only Supabase gngnrmzeghjzqsmzuktl, MFD OAuth Phase2 Testing.
- **Single change:** Authentication signup setting “Allow new users to sign up” enabled→disabled (disable_signup=false→true). Use the owner dashboard or a separately approved supported management path; no SQL/object/policy change.
- **Expected effect:** ordinary signup/new-account creation is closed; with current zero users, ordinary sign-in cannot bootstrap a new account. Existing approved users can be provisioned afterward through a separately approved administrative procedure. Google/email provider setup and OAuth Server remain as currently observed; no endpoint deployment.
- **Verification:** read public settings and zero-user/session/client/grant counts; both write switches must remain false. No registration/login probes or emails/users created.
- **Failure:** stop without further operations. Do not automatically retry via role/credential changes. If setting does not read back true, no provisioning/deployment/testing.
- **Recovery:** leave signup closed on a later setup failure. Re-enabling it restores public registration and needs separate explicit approval/risk review; it is not an automatic rollback. No backup restore, account deletion or provider disablement is implied.
- **Cost:** no new resource/subscription/paid capability; existing API usage only. No purchase/upgrade.
- **Not included:** audience SQL, URL/hook/OAuth/DCR/signing/provider/client changes, account provisioning, identity linking, fixture insertion, Worker/DO deployment, ChatGPT save/connect, commit/push or production access.

**Decision:** GO to request approval for Scope0S signup containment; NO-GO for hosted login/deployment or account creation now. Subsequent scopes need verified before-values, exact approved test identities and explicit approval. No Google secret was read, and no hosted mutation was performed. Documentation-only revision; no new regression run claimed.

## Scope 0S approval and execution blocker — 2026-10-29

The user explicitly approved only disabling staging public signup, with pre/post verification and no other hosted changes. **Scope0S is authorized but NOT APPLIED by this agent.** This supersedes the earlier “request approval” status for that scope only; all other approvals remain outstanding.

Fresh pre-change checks:

- get_project explicitly targeted gngnrmzeghjzqsmzuktl and returned MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, eu-central-1, db.gngnrmzeghjzqsmzuktl.supabase.co. No production endpoint/project was contacted. Auth configuration changes are project-ref scoped; the proposed operation targets only this staging ref.
- Public settings HTTP200: disable_signup=false, Google=true, email=true, anonymous=false, mailer_autoconfirm=false. OAuth Server discovery404 feature_disabled. These selected non-secret fields record the before-state; no Google secret or complete secret-bearing Auth configuration was requested.
- READ ONLY counts: users0, sessions0, native OAuth clients0, local MCP clients0, grants0. Database writes_enabled=false.
- Existing Sites runtime revision1 MFD_MCP_WRITES=false. No independent Worker exists.

Execution blocker: connected Supabase tools offer project metadata/SQL but no Auth-management configuration update operation. No SUPABASE_ACCESS_TOKEN environment credential or conventional CLI token file was available (presence checks only; no credential values read). The supported Management API is PATCH /v1/projects/gngnrmzeghjzqsmzuktl/config/auth with body {"disable_signup":true}; it requires management authorization. Database SQL is not a supported substitute for this service configuration. No PATCH or SQL mutation was attempted, and no elevated credential was requested.

The already-authorized owner-dashboard action has been requested: in this exact staging project turn off “Allow new users to sign up” and save, leaving every other setting unchanged. After user confirmation, independently re-read public settings, Google status, both switches and counts. **Current signup remains last-observed enabled; successful containment is NOT VERIFIED.** Do not proceed to provisioning/deployment on the strength of approval alone.

Rollback: no agent-applied change exists to roll back. Once the owner saves the restriction, retain signup disabled during any later setup failure. Re-enabling (disable_signup=false) restores public registration and needs separate explicit approval; no automatic reversal, Google disablement, account deletion or backup restore. Production, OAuth Server, RLS, keys, clients/users and deployment remain untouched.

## Scope 0S completion verification — 2026-10-29

**Signup restriction independently verified after the user's manual dashboard save.** The user performed the configuration mutation; this agent performed strictly read-only verification. This supersedes the earlier blocked/unapplied and signup-enabled observations, without changing historical evidence.

| Requested check | Result | Fresh evidence / limit |
| --- | --- | --- |
| Exact staging identity | PASS | get_project gngnrmzeghjzqsmzuktl: MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, eu-central-1,17.11.0.003. No production access. |
| disable_signup=true | PASS | Public staging /auth/v1/settings HTTP200 returns true. |
| Google remains enabled | PASS | Same settings response google=true. No login attempted. |
| Other observable Auth baseline | PASS | email=true, anonymous=false, mailer_autoconfirm=false unchanged; OAuth discovery404 feature_disabled; OIDC exact staging issuer with S256/plain capabilities; JWKS ES256/EC material. Advertised plain is not proof a client enforces S256. |
| Complete Auth configuration unchanged | UNKNOWN | Public endpoints do not return exact Site URL/redirects, hook activation, stored path/DCR, provider client selection/secrets or full key state. Prior manual before-values remain evidence, not a fresh comprehensive management diff. No secret-bearing management config was fetched. |
| Users / identities / sessions | PASS | Explicit READ ONLY SQL count(*) returns0 /0 /0. No identities/passwords selected. |
| Native OAuth clients / local MCP clients / local MCP grants | PASS | Same read-only count returns0 /0 /0. Native consent/authorization counts checked separately below. |
| Database MCP writes | PASS | settings.writes_enabled=false; current resource still old private Site /mcp. |
| Application MCP writes | PASS | Sites runtime revision1 MFD_ENV=staging and MFD_MCP_WRITES=false. No deployed independent Worker behavior is claimed. |

No settings, accounts, clients, grants, SQL rows/policies or deployment were changed by this verification. No signup/login probe or mutation negative test was run. Keep signup disabled; re-enabling would need separate explicit approval. No blanket claim that every unobservable Auth setting is unchanged.

### Safest next provisioning decision — proposal only

The safest immediate step is to approve an exact test-identity inventory and account-verification procedure, not reopen signup. There are currently no “existing” staging users: Google Testing-mode membership alone does not create an MFD user, and ordinary first Google login must not bootstrap an unapproved account.

1. Obtain explicit approval for each exact staging test identity and who controls it. Use a secure operator channel for personal identity details; do not infer email from the Cloudflare operator or expose passwords. Distinguish a user-approved real Google test identity from synthetic Alice/Bob; these are not automatically interchangeable scopes.
2. Preserve the audience sequence: complete separately approved ScopeA while the currently reviewed zero-user/session baseline holds, then provision accounts after its postcheck. Alternatively, separately review changing only the external zero-user preflight expectation for intentional approved users before provisioning; never silently bypass it or weaken the SQL's empty local-client/grant/proposal guards. Signup containment being complete does not approve audience SQL or user creation.
3. After exact-account approval, owner creates only those users through supported staging Dashboard Auth Users/Admin createUser. Keep public signup disabled; no raw auth.users/auth.identities inserts, service-role Worker credential, anonymous signup window or Google-provider secret access. Email confirmation/administrative ownership attestation must be deliberate and approved; never confirm arbitrary/uncontrolled email merely to make linking pass. Passwords, if required for synthetic accounts, stay unique/private and out of logs/source/chat.
4. An email account created administratively is not yet a Google identity. Supabase documents automatic linking for matching verified identities and protection against unverified-email takeover. During a later approved Google flow it must resolve to the already-approved Supabase user UUID, without increasing user count. Confirm provider identity/linkage and UUID, not just displayed email. No app-level email-based owner mapping, manual Google identity fabrication or automatic enablement of manual linking. If closed-signup linking does not work as required, stop for supported provider review instead of reopening signup.
5. Google acceptance happens only after exact Worker redirects, Auth hook/client/audience/local allowlist, deployment and synthetic/controlled-account test scope are approved. The Worker uses S256 plus browser state/CSRF and verifies the first-party bearer before setting HttpOnly cookies; native consent-user match and SQL live session/owner/section checks remain. Unknown users should be unable to register with signup closed, but actual provider rejection and linking are later approved tests, not demonstrated now.
6. Verify after approved provisioning: exactly approved user IDs/counts, no sessions until separately authorized sign-in, no native/local clients or grants created incidentally, signup still disabled and both writes false. Account creation alone grants no MCP section consent; no diary fixtures/data writes unless separately approved.

References: [signup restriction](https://supabase.com/docs/guides/auth/general-configuration), [server/admin user provisioning](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [verified identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

**Decision: Scope0S verification PASS; no FAIL observed in the exposed settings/count checks. Full Auth diff UNKNOWN. NO-GO for unapproved provisioning/login/deployment. GO to review the exact approved identity roster and provisioning method, while retaining the existing audience/preflight ordering. Stop before every mutation not explicitly approved.**

Fresh native-grant follow-up: READ ONLY count(*) of auth.oauth_consents and auth.oauth_authorizations both0 (PASS). These provider tables were discovered through catalog metadata; no consent payload, code or secret was read.

## Two-identity preparation complete — 2026-10-29

Current provisioning/acceptance/cleanup procedure: [PHASE-C1B-TEST-IDENTITY-PLAN.md](PHASE-C1B-TEST-IDENTITY-PLAN.md). Documentation and upstream Auth source support administrative precreation plus Google linking with signup disabled; hosted acceptance remains unexecuted. Exactly two user UUIDs must remain stable, while first Google sign-in is expected to add a Google identity per approved user. Repeated sign-in must not create duplicates.

No roster is invented or implicitly approved. Require exact identities/ownership, explicit administrative email confirmation/password policy, audience/preflight ordering and provisioning-only approval before creation. A Google Testing-mode denial alone does not test Supabase signup rejection; a controlled Google-allowed/Supabase-absent negative identity needs separate approval and must never be provisioned as an MFD user. All RLS/live-consent/session restrictions and both false switches remain prerequisites. No hosted calls or mutations occurred in this preparation turn. GO for plan review; NO-GO for unapproved creation/login/deployment.


## Test account ownership decision — 2026-10-29

The two positive staging test identities are exclusively the user’s own primary and secondary Google accounts. No friend’s account is permitted. Exact emails must be collected privately via local non-echo input or direct owner-dashboard entry before any approved creation; never store them in repository reports/logs/command arguments. See the updated [test-identity plan](PHASE-C1B-TEST-IDENTITY-PLAN.md) for sequential supported admin creation, explicit confirmation/password/ordering choices and UUID/identity/session/isolation acceptance. Account selection is confirmed; provisioning, login and all other hosted operations remain unapproved. No hosted calls or mutations were performed by this documentation update.

## Primary-first provisioning ordering clarification — 2026-10-29

Use the final pre-provisioning review in [PHASE-C1B-TEST-IDENTITY-PLAN.md](PHASE-C1B-TEST-IDENTITY-PLAN.md): provision only the primary account after explicit approval/private input, verify UUID/Auth state, then STOP. Secondary creation is separately approved later. No mutation occurred in this review.

Audience-before-user ordering is not a technical requirement: the actual SQL gates local clients/grants/proposals, not auth.users. For the user's selected provisioning-first sequence, the external preflight must recognize only approved primary/secondary UUIDs/counts (1 then2), not insist on zero users. This explicitly supersedes earlier audience-first/zero-user operational instructions; no SQL/security guard changes. Audience transition remains separately approved before local client registration/consent. Keep sessions zero until approved login. Password omission in Admin createUser must not be described as guaranteed passwordless; current upstream can generate a random password internally. Explicit single-account email confirmation/method approval is required; signup stays disabled throughout.

## Authorized primary provisioning — current execution status

See [PHASE-C1B-PRIMARY-PROVISIONING-EXECUTION.md](PHASE-C1B-PRIMARY-PROVISIONING-EXECUTION.md). The user authorized exactly one primary account subject to private local email/ownership confirmation and no mandatory supplied password. Fresh staging checks pass, including zero users/identities/sessions/clients/grants and both writes=false. Execution is blocked before input/creation: no Admin Auth connector operation or local administrative API credential is available. No user/UUID exists. A non-mutating owner-dashboard password/auto-confirm capability check is pending; no email/password requested through chat. Do not use SQL/auth-table inserts, expand scope, retry creation blindly or delete anything. All other hosted scopes remain unauthorized.

## Primary account manually created — verification complete

See [PHASE-C1B-PRIMARY-PROVISIONING-EXECUTION.md](PHASE-C1B-PRIMARY-PROVISIONING-EXECUTION.md). Fresh read-only checks verify exactly1 confirmed non-anonymous user and1 email identity, sessions0, native/local clients/authorizations/consents/grants/proposals0, signup disabled, Google enabled and both write switchesfalse. Catalog digest and scoped application counts match the reviewed baseline. UUID is captured only in ignored0700/0600 local evidence; no email/password selected. Exact primary-address ownership is user-attested, not independently checked by this metadata review. No Google identity/linking exists yet.

Conditional GO for separately approved secondary-only administrative creation after private address/ownership/method confirmation; no secondary or login approval inferred. Existing primary UUID must be preserved. Future operational preflight recognizes this approved one-user baseline, with SQL security guards unchanged. No hosted mutations occurred in verification.

## Two-user baseline verified — 2026-10-29

[PHASE-C1B-TWO-ACCOUNT-VERIFICATION.md](PHASE-C1B-TWO-ACCOUNT-VERIFICATION.md) records fresh strictly read-only verification after the user's manual secondary creation. Exactly2 confirmed non-anonymous users with distinct UUIDs; primary UUID/selected metadata unchanged; one email identity each, no Google identities; sessions/native/local clients/authorizations/consents/grants/proposals0; signup disabled, Google enabled, OAuth Server disabled and both writesfalse. Catalog digest and scoped data counts match the reviewed baseline. Private UUID mappings are ignored0700/0600 local evidence only; no emails/passwords/provider identity_data selected.

The operational Auth baseline is now these2 approved UUIDs, not zero or one. Google linking and isolation remain untested hosted acceptance. GO for next OAuth configuration preparation/approval; no configuration mutation, audience migration, login, client registration or deployment is authorized by verification. Remaining prerequisites and UNKNOWN scope limits are in the linked report. Stop after verification.

## Audience execution approval — stopped on recovery-artifact gate

The user approved only the unchanged audience transaction but required an available/tested rollback SQL artifact before execution. Fresh forward checksum matches. No reverse post-COMMIT artifact/test exists; existing tests demonstrate failed-transaction rollback only. Execution stopped immediately before hosted queries/mutations. See [PHASE-C1B-AUDIENCE-EXECUTION.md](PHASE-C1B-AUDIENCE-EXECUTION.md). Do not treat the approved forward transaction as executed or advance OAuth setup. Recovery SQL preparation/review is needed; no automatic hosted rollback is authorized.


## Local post-COMMIT recovery preparation — 2026-10-29

The missing reverse-artifact stop is resolved locally. See [audience execution and recovery evidence](PHASE-C1B-AUDIENCE-EXECUTION.md) for the exact strict pre-OAuth recovery scope and hashes. Forward SQL remains unchanged at `1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590`; reverse proposal is `59e62b0e35e943a22e9783d139f92d538e9be2216f8b0cd52b43edc7baf76ded`. Disposable tests verify committed forward/reverse restoration, two-user/data/security preservation, drift/inventory denial, strict repeat refusal and late-failure atomicity. Full local runner 39/39 passes; types/lint/build/scans pass; audits retain the documented development-only moderate.

GO to rerun read-only forward preflight. Before hosted execution verify actual managed-role lock authority and all fresh project/configuration/UUID/inventory/security gates; missing permission is a stop, never permission escalation. The reverse requires zero sessions/clients/grants/authorizations and exactly the original two email-only identities, so it is not a recovery plan after Google linking or OAuth acceptance. Restoring the old audience can reaccept valid old tokens. Hosted rollback still requires separate explicit approval of its checksum and scope. No hosted SQL or configuration operation occurred in this preparation, and no automatic resumption or rollback is authorized.


## Final audience preflight closure — 2026-10-29

Fresh hosted read-only project/user/inventory/audience/default/privilege/security checks PASS; both artifact hashes match their reviewed values. The user additionally confirmed the staging Data API dashboard exposes exactly `public` and `graphql_public`, with automatic exposure OFF, inspection only. Record this as manual evidence. See [final preflight results](PHASE-C1B-AUDIENCE-EXECUTION.md).

**GO to request fresh approval for the unchanged forward-only audience transaction**, SHA-256 `1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590`, targeting only `gngnrmzeghjzqsmzuktl`. Revalidate time-sensitive baseline immediately before execution. This confirmation is evidence, not execution approval. No forward/reverse SQL or hosted configuration change was performed. Reverse execution, Auth/OAuth/client changes and deployment remain separately unauthorized.


## Scope A execution completed — 2026-10-29

The explicitly approved forward audience transaction was submitted exactly once at 12:11:32–12:11:36 UTC and committed. Row and column default now equal `https://mfd-connect-staging.shanustylish777.workers.dev/mcp`. Approved artifact SHA remains `1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590`. Immediate independent user/identity/inventory/Auth/write-switch/security/storage/scoped-data postchecks PASS. No rollback required or executed. See [execution record](PHASE-C1B-AUDIENCE-EXECUTION.md). Earlier audience-pending statements are historical. Do not rerun the forward transaction.

GO to review the next narrowly scoped Auth URL/hook setup approval; no later mutation is authorized by this result. OAuth activation/client registration/allowlisting/deployment/login testing and hosted rollback remain separate. Preserve disabled signup, enabled Google, disabled OAuth Server and both false writes. No commit/push or production access occurred.


## Redirect-only scope refinement — 2026-10-29

See [Auth redirect review](PHASE-C1B-AUTH-REDIRECT-REVIEW.md). Keep Site URL localhost:3000 unchanged for the first-party Google redirect-only proposal; origin `/` is not required by the current handler. Current redirect_to includes `/auth/google/callback?state=<random64hex>`, so the earlier bare callback allowlist entry is not established as sufficient. Official upstream Auth matches the query as part of the URL. NO-GO for saving the old bare-URL proposal until a pinned local matcher/serialization investigation establishes the final constrained entry; no broad wildcard or state-removal workaround. Future OAuth Server consent still requires a separate Site URL/Authorization Path review. No hosted setting or code changed in this review.


## Google callback allowlist matcher resolved locally — 2026-10-29

[Redirect review](PHASE-C1B-AUTH-REDIRECT-REVIEW.md) now includes pinned actual Auth validator tests. The candidate `state=*` FAILS (empty state/extra parameters accepted). A fixed 64-lowercase-hex character-set pattern PASSes all required tested cases; exact single dashboard line is in [allowlist artifact](artifacts/c1b-google-redirect-allowlist.txt), 1,236 characters. GO to request separate redirect-only approval for that exact value, Site URL unchanged. Stop on dashboard syntax/length rejection or changed readback; no broader pattern or Site URL workaround. Local test scope is verbatim upstream validator/helper plus minimal config and exact compilation options, not hosted Auth/dashboard acceptance. Fragments are ignored by Auth and localhost Site URL fallback remains. No hosted settings, users, login or deployments changed.


## Fixed Google callback replaces query-pattern proposal — 2026-10-29

User-selected Option B is implemented locally and verified: server-managed five-minute browser-bound single-use transactions in the existing private SQLite coordinator, fixed redirect_to without application state query, retained S256/CSRF/session/account/consent checks. 39/39 tests, types/lint/build/scans, actual pinned bare-URL matcher, native Google/restart-race and90-request shared-limit/persistence checks PASS. See [implementation record](PHASE-C1B-AUTH-REDIRECT-REVIEW.md).

GO for separate approval to add only `https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback`; Site URL stays `http://localhost:3000`. No long pattern or root entry. Artifact file now contains76-character bare URL, SHA64ed80237b3fbcb871f8803e46c546485b568f8836ff8b6d66022d99647463e4 including newline. No hosted change occurred.

Deployment review must account for up to128 temporary transaction rows plus four counters, sensitive PKCE/owner/session-fingerprint context, cleanup alarms, additional quota usage and pending-flow-compatible rollback. Old four-row/two-writes total estimates no longer describe the whole object. Real Google identity linking/signup enforcement, managed runtime quotas/retention, native client flow and all later Auth/deployment approvals remain outstanding. Committed audience and both false MCP switches are preserved; no SQL or production access.


## Fixed callback redirect save verified — 2026-10-29

Owner's manual save verified: independent project/SQL/Auth/runtime checks PASS; explicit subsequent saved-dashboard inspection confirms Site URL `http://localhost:3000` and the complete redirect list containing only `https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback`, no wildcard/backslash/state query. URL values are operator evidence; independent management read remains unavailable, not falsely claimed. Two approved UUIDs/selected user metadata unchanged; two email identities; zero sessions/native/local clients/authorizations/consents/grants/proposals; signup disabled, Google enabled, OAuth disabled; both write switches false; committed audience/default unchanged. See [verification table](PHASE-C1B-AUTH-REDIRECT-REVIEW.md).

Redirect-only verification COMPLETE/PASS. No login, hosted configuration change by the agent, deployment, OAuth activation, SQL mutation, commit/push or production access. No new scope authorized. Hosted Google linking and all later Auth/client/deployment acceptance remain outstanding.


## OAuth activation readiness refinement — 2026-10-29

[Activation readiness review](PHASE-C1B-OAUTH-ACTIVATION-READINESS.md) supersedes earlier activation-before-available-UI ordering. Required eventual Site URL is Worker origin; Authorization Path `/oauth/mcp/consent`. Existing fixed Google callback remains. Do not change Site URL or activate OAuth now: full Worker startup needs a real registered client ID, disabled-server preregistration is unproven, and no bootstrap artifact exists.

First proposed narrow hosted scope, only after supported secret-safe selected-field access/readback and separate approval: Management API Auth PATCH with oauth_server_enabled=false, oauth_server_allow_dynamic_registration=false, oauth_server_authorization_path=/oauth/mcp/consent. Site URL remains localhost; preserve all other settings. Documented fields are not proof this account accepts disabled preconfiguration; stop if unsupported, never enable solely to inspect.

Resolve disabled-server preregistration or separately prepare a fail-closed available consent bootstrap before deployment; deploy/verify a reachable route before Site URL change and activation. A maintenance page is not functional consent. Hook binding, activation with verified DCR off/path, native registration/full real-client release, DB allowlist and real login each retain separate approvals. No hosted reads/changes or code/test rerun were performed for this documentation/source review.


## OAuth preconfiguration capability — 2026-10-29

Official Management API fields support expressing enabled=false, DCR=false and path=/oauth/mcp/consent, but disabled-state persistence/account capability is unverified. No Auth-config management tool/approved access is established in this session; no credentials read/created, no hosted calls. [Exact proposal and readback/contingency](PHASE-C1B-OAUTH-PRECONFIGURATION-CAPABILITY.md). NO-GO for execution/activation now. Next non-mutating step: provider-supported capability confirmation and approved secret-safe selected-field management channel. Preserve OFF/localhost and all existing security state; never toggle ON to inspect hidden fields.


## Pre-OAuth maintenance deployment candidate — 2026-10-29

[Deployment readiness](PHASE-C1B-PREOAUTH-DEPLOYMENT-READINESS.md): separate strict preoauth-worker.js requires no real/fake client or runtime key; it exposes bounded discovery/maintenance only and denies all login/consent/MCP operations, with the existing private SQLite quota coordinator. Full application validator unchanged.40/40 tests, types/lint/build/scans, local dry-run/native90-request concurrency/restart persistence PASS. Fresh Cloudflare account/subdomain/empty inventories and CLI authentication verified; Free remains owner-dashboard evidence (billing GET403). No deployment/namespace creation occurred.

GO for exact-artifact conditional deployment-only approval, hashes and narrowly bounded acceptance/emergency stop in the linked report. OAuth remains OFF, Site URL unchanged, signup closed, Google enabled, both writes false. Full release, registrations, DCR/path/hook/Site URL changes and Google/ChatGPT login remain separate gates. A maintenance page is not functional consent or a reason to ignore DCR uncertainty. No Supabase Management API credentials introduced.


## Consolidated supervised execution gate — 2026-10-29

The user's operating instructions request ONE explicit consolidated approval before the next hosted mutation. [Consolidated execution plan](PHASE-C1B-CONSOLIDATED-EXECUTION-PLAN.md) now defines S1–S8, exact artifacts/parameter substitutions, manual dashboard/Google/ChatGPT handoffs, two guarded SQL proposals (one client registry INSERT and two optional-only-if-approved synthetic workspace INSERTs), bounded probes and non-destructive containment. Latest full runner42/42 PASS; no new hosted mutation. Current ChatGPT callback/public/none/blank-secret settings reconfirmed by owner.

Pinned official Studio source shows toggle modifies unsaved form state and Save submits enabled/path/DCR together; operator must verify actual dashboard/backend behavior before Save. This replaces the assumption that revealing fields necessarily activates the server, without claiming the deployed UI version is verified. Stop if it behaves differently. No new Management API credentials. All historical per-step “separate approval” text can be covered by one explicit approval naming these bounded scopes; no permission is inferred before that response.
