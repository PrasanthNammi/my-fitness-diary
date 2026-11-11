# Phase C.1B — Staging integration execution and security report

**Latest coordinated rollout:** approved reconnect SQL and Worker version dcfcac5d-88d2-4432-a262-e288f05f31e4 are now deployed; both existing A/B profile regressions PASS, with connections/grants preserved. Six security probes PASS; new-version16-request CPU p99=6.574ms is preliminary. Reconnect lacks a supported UI control and remains untested. [Consolidated actual execution report](PHASE-C1B-FINAL-COORDINATED-ROLLOUT.md) supersedes older active-version and pending-deployment statements; remaining hosted acceptance gaps persist.

Latest local reconnect/CPU remediation, corrected ACL contracts and coordinated rollout proposal: [final coordinated rollout](PHASE-C1B-FINAL-COORDINATED-ROLLOUT.md). No remediation is deployed yet; historical hosted acceptance gaps and current connections remain as recorded below.

**ACL clarification:** [Dispatcher ACL review](PHASE-C1B-DISPATCHER-ACL-REVIEW.md) corrects the later local fixture/proposal: authenticated EXECUTE on the definer dispatcher is intentional and required by the public invoker wrapper. No hosted permission remediation was performed; use the revised SQL checksums in that review. Historical effective-ACL snapshots are not relabeled as denying this intended grant.

Date: 2026-10-29 (Europe/Berlin). **Core two-account profile integration PASS; full S7–S8 security/lifecycle acceptance PARTIAL.** User explicitly approved consolidated plan scopes S1–S8, exact artifacts/bounded substitutions, two synthetic workspace INSERTs, interactive two-account acceptance and defined non-destructive emergency stops. Account Free/no upgrades/subscriptions/payment authorization reconfirmed. No production, additional users/deletions, credential extraction, arbitrary migration, key change, commit/push/PR or destructive recovery authorized.

## Latest local blocker follow-up

[Consolidated local blockers report](PHASE-C1B-LOCAL-BLOCKERS-REPORT.md): reconnect fixed locally with a minimal same-user authorization-binding SQL proposal; config construction reused safely and response parsing reduced;47/47 tests/native checks PASS. Candidate Worker0fa8494b… and SQL are proposals only. Existing hosted version/connections/grants were not contacted or changed in this task; hosted CPU and lifecycle gates remain open.

## Latest acceptance follow-up

[Consolidated acceptance report](PHASE-C1B-ACCEPTANCE-REPORT.md) is authoritative for the remaining-test disposition. New local suite45/45, types/lint/build/scans/audits and native workerd restart/concurrency checks PASS; six credential-safe staging probes PASS. Both working integrations/grants/data/session counts and deployed artifact remain unchanged. Newly retrieved operational metrics show CPU p99=15.139ms, so Free-plan CPU headroom is not cleared. Existing-consent reconnect503 is reproduced locally. Full acceptance remains NO-GO; blocked hosted lifecycle/direct-API cases and exact next human/authorization actions are enumerated in that one report. No deployment or hosted mutation in this follow-up.

## Current execution status — consolidated result

**Primary ChatGPT get_profile→MFD STAGING A/revision1; secondary ChatGPT get_profile→MFD STAGING B/revision1: PASS in operator-observed tool evidence, corroborated by independent account/consent/fixture checks.** No raw MCP client transcript or user token was exported. Existing controlled two-user profile-only staging works; this is not full production/security acceptance.

| Scope | Actual result | Boundary |
| --- | --- | --- |
| S1 | COMPLETE/PASS | Maintenance Worker + one SQLite namespace; bounded denial/discovery checks |
| S2 | COMPLETE/PASS within evidence | Owner saved Site URL/hook; independent function/ACL checks unchanged |
| S3 | COMPLETE/PASS within evidence | Owner saved OAuth ON/path/DCR OFF; issuer metadata independently verified; exact stored toggle remains manual evidence |
| S4 | COMPLETE/PASS | One Public/none native client and exact callback independently verified |
| S5 | COMPLETE/PASS | Full release plus separately approved browser-header and diagnostic replacements; active version40f41d56-fe97-446a-8778-3d815ebc688c |
| S6 | COMPLETE/PASS | One exact guarded local client INSERT |
| S7 | Core login/UUID checks PASS; lifecycle PARTIAL | Both existing Google identities link to original users; real attempted cross-account browser switch rejected with CB_ACCOUNT |
| S8 | Fixtures/A→A/B→B retrieval PASS; broader acceptance PARTIAL | Both grants profile-only; observed revoke/reconnect and unconsented-section challenge; direct API and opaque-token cases below remain unverified |

**Final deployed bundle SHA256:** `bbf827bceb0848476177c8e15d7c7b758565c3ba58470aef6b1675f8b67f2f6b`. Config SHA256 `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5`. Worker mfd-connect-staging, account fa8205077c4bc4d2bb38ee035e74a156; namespace781eaeca44c74543be214f485033adda retained; previews OFF. Sole native/local client fcad3c45-07cd-418a-978a-7e1d94ee0406. Production never accessed. No commit, push, PR, additional user or destructive recovery.

### Final independent state and evidence

- Exactly2 original confirmed non-anonymous users, identities4 (email+Google for each); native/local client1/1; exactly2 local profile-only grants and active native consents, each matched to original intended UUID; OAuth sessions represent both owners.
- Workspaces2: exact A/B synthetic profile payloads, revision1, unchanged. Proposals0; database writes_enabled=false; active Worker MFD_MCP_WRITES=false. No real health data seeded.
- Fresh public Auth settings: disable_signup=true, Google=true, anonymous=false. DCR OFF/Site URL/hook/path retain recorded operator management evidence; no complete secret-bearing management diff claimed.
- Final application/MCP table/owner/ACL/RLS, policies, function definitions/ACLs, schema ACLs and storage-bucket boundary digest61546963f7d66d8637dccbd22b0cd61b matches the pre-fixture snapshot. No privilege/security remediation was applied.
- Security advisor retains3 intentional private-table RLS-without-policy INFO findings and the already recorded [leaked-password-protection WARN](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No paid upgrade or Auth change made. Performance advisor reports15 [unused-index INFO findings](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); no index removed. These are findings, not a clean-advisor claim.
- Latest code verification44/44 local test files, both TypeScript projects, hosting lint, staging/independent builds, scans and exact Wrangler packaging PASS. Native HTTPS workerd/SQLite callback, denial, replay and persisted concurrent consume PASS. Source did not change after that reviewed candidate; no unnecessary new full rerun is claimed.

### Security observations and remaining untested items

**Observed:** browser-native Origin:null initiation failure fixed through approved header/CSP replacement; strict cross-origin/CSRF denial retained. Operator broad-consent mistake detected and revoked through the first-party UI; local grants0/native consent revoked verified before profile-only reconnect. Primary get_nutrition produced a reconnect/reauthorization prompt without nutrition data; subsequent get_profile still returned A on the same connection. This is consistent with insufficient_scope handling, not proof of expiry; raw hosted nutrition denial status remains UNKNOWN. A primary-session→secondary-Google attempt was rejected with CB_ACCOUNT, existing primary identity retained; isolated secondary flow then succeeded.

**Not established by current client access:** direct first-party/OAuth REST/RPC/storage cross-owner negative tests; real-client owner-ID injection rejection; complete PKCE/state/issuer/signature/expiry negative matrix; fresh token alg/kid capture/verification independent of pinned Auth; forced refresh rotation/reuse; old-access-token private-data denial after revoke; logout lifecycle; third/unknown Google identity rejection; forced hosted DO restart/multi-region/10ms CPU and exact metering/log retention. Existing local tests/source and catalog checks support these protections but are not hosted substitutes. The plan excludes a third identity and exporting tokens/credentials; a client-hidden or unavailable test stays UNKNOWN. Do not use operator-bypass SQL as isolation evidence or add test routes/change protections to force completion. Safe supported client/session access would be needed to finish these cases; no new privileged credential is requested.

The earlier post-PKCE generic callback failure's precise predicate remains UNKNOWN because the fresh diagnostic attempt succeeded without a CB_* error. Persistent header mismatch was ruled out by later correct headers/exact module readback; the initial transient response's cause remains unproven. Native existing-consent redirect-only responses remain a known reconnect compatibility limitation of the strict client-binding guard; revocation then fresh profile-only consent worked, without loosening callback checks.

### Costs, containment and decision

Resources actually created: one Worker and one SQLite namespace; later replacements reuse namespace/class/name/schema/state. No paid upgrade, new subscription/payment authorization, custom domain or paid backing store observed. Expected incremental subscription cost$0 under the owner's Free/no-upgrade condition; exact billed usage and quota headroom UNKNOWN (billing scope unavailable). Auth/Workers/DO share existing quotas. Logged intentional agent probes are bounded (S1=19; later checks recorded below); client-managed retries are not fully observable, so no fabricated aggregate request count or billing guarantee. No hosted load test.

Both authorized synthetic fixtures and both profile-only consents remain; no automatic cleanup/deletion. Containment remains workers.dev disable/no previews or approved compatible maintenance artifact while retaining namespace/counters, and supported OAuth OFF operator action if required by an incident; no automatic action needed/applied now. Never reopen signup, enable writes/DCR, reset quota counters, restore a DB or reverse the audience as an availability shortcut.

**Decision: GO for the current controlled two-user, profile-only staging integration demonstrated here. NO-GO for claiming full S7–S8 acceptance, broader users/data, production, write enablement or unrestricted rollout.** No current functional blocker to the observed A/B profile retrieval; remaining blockers concern safe access to the untested acceptance surfaces and operational evidence. Existing approvals do not imply permission to expand scope. Current state is retained for review; no further login or reconnect is required for the completed profile test.

Historical execution entries follow; where statuses differ, this consolidated result supersedes them.

## Running execution record

- S1 preflight: approved maintenance/full/config/SQL artifact hashes match; approved source manifest matches; private UUID-set comparison matches; exact staging project healthy; two confirmed non-anonymous users/two email identities; zero sessions/native/local OAuth lifecycle records; signup disabled, Google enabled, OAuth Server disabled; DB/Site application writes=false and committed Worker audience unchanged. Cloudflare exact account/subdomain, accepted Super Administrator membership, empty Worker and namespace inventories confirmed through GET. Existing authentication check in progress. No mutation yet at this entry.

Final deployed versions, account-isolation results, actual provider evidence, costs and remaining limitations will be recorded as scopes execute. Local42-test evidence is distinct from future hosted acceptance. No real authenticated tool invocation has occurred yet.


## S1 — maintenance deployment PASS

Executed once through the approved locked Wrangler command with existing authentication; no upgrade/payment/permission prompt. Cloudflare creation/deployment recorded **2026-10-29T13:50:53.801339Z (14:50:53 Europe/Berlin)**. Reported Worker startup time2ms is not a measured per-request CPU guarantee.

- Worker: mfd-connect-staging; origin https://mfd-connect-staging.shanustylish777.workers.dev.
- Version: bb974946-1968-417b-8eb2-a1efd485c3a1, deployed100%; deployment0d557331-c468-4d0a-986f-dc63bfb24361.
- Private MFD_ABUSE→AbuseCoordinator namespace781eaeca44c74543be214f485033adda, name mfd-connect-staging_AbuseCoordinator, use_sqlite=true.
- workers.dev enabled, previews disabled; runtime staging/pre-oauth/writes=false read back through supported GET. Reviewed bundle hash f56abc06ee671408749c5f1e4e2807771a2b0ab02f62ea14958e55aac1f9de50; config hash5143a99996088a6dff67cbf6d32a46cea821bddaeb208540f1945eb91472602c.

**19/20 allowed S1 probes used**, all PASS: HTTPS metadata resource/issuer exact; root/login/consent/callback/MCP return503 maintenance, including fake Bearer; unknown route404; cross-origin403;10 public metadata requests admitted and11th429. Every inspected response has no-store/nosniff/CSP/no-referrer/HSTS, no Set-Cookie/Location and no input reflection. No real auth token, Google login, user session or consent request was initiated. Probe evidence is ignored `.sites-runtime/c1b-execution/s1-probes.json`.

Hosted binding/SQLite configuration and rate denial are verified. Actual forced object/process restart, cross-region coordination, per-request CPU, precise quota metering and complete provider access-log retention are NOT VERIFIED; do not relabel native evidence as hosted measurements. Source/approved bundle has no upstream fetch implementation; no application-level upstream call is possible in this release, but no independent provider-network trace is claimed. App observability disabled per release config does not prove infrastructure retains no logs.

Actual new resources: one Worker/deployment/version and one SQLite namespace/binding; probes initialize counter storage. No new subscription/payment/upgrade authorized or observed. Free condition owner-confirmed; precise billed/usage amount UNKNOWN until account metering, expected subscription increment$0 within included quotas. No paid resource fallback.

## S2 — preflight PASS; operator action pending

Fresh read-only staging check after S1: same restricted approved UUID digest, users2, sessions/native/local clients/authorizations/consents/grants/proposals0, DBwrites=false/resource Worker /mcp; public Auth settings signup disabled/Google enabled; OAuth discovery404 feature_disabled. Existing Site application write switch remainsfalse from immediate S1 preflight.

Existing access-token hook function matches normalized body hash9fde3c29dc02c1313687ce426b5d1237, ownerpostgres, invoker mode, empty search_path; EXECUTE false forPUBLIC/anon/authenticated, true forsupabase_auth_admin. No SQL body/permission change required or performed. Auth management binding itself remains dashboard-only evidence.

Requested the approved S2 operator handoff: verify exact URL/redirect/no-hook before-values, save Site URL to Worker origin preserving fixed callback, bind/enable existing mfd_mcp.access_token_hook as Custom Access Token PostgreSQL hook, keep OAuth OFF. If function selection or before-values differ, stop/report. No settings were changed by this agent. Await saved operator evidence before S3; no additional approval requested. S3–S8 not executed yet.


## S2 — verified PASS after owner save

Owner confirmed Site URL exact Worker origin; complete general redirects retain exactly the fixed Google callback; Custom Access Token hook enabled, PostgreSQL schema mfd_mcp/function access_token_hook. OAuth remains OFF. These selected management values are **operator-confirmed saved-dashboard evidence**, not an independent Auth-management API read.

The owner reported the hook UI ran GRANT/REVOKE statements. Independent read-only checks find **no effective privilege drift** in the inspected approved application/MCP boundary:

| S2 check | Result / evidence |
| --- | --- |
| Project/database | PASS exact staging ref/name/host, postgres database/role, healthy17.11.0.003 |
| Approved users | PASS2 confirmed/non-anonymous, UUID-set and selected metadata match restricted pre-hook evidence |
| Identities | PASS2 email identities/two owners, no Google identities yet |
| Lifecycle inventories | PASS sessions/native clients/authorizations/consents/local clients/grants/proposals all0 |
| Public signup / Google / anonymous | PASS fresh settings disable_signup=true, google=true, anonymous=false |
| OAuth status | PASS fresh feature discovery404 feature_disabled |
| Write switches | PASS DBfalse; deployed Worker staging/pre-oauth/MFD_MCP_WRITES=false readback; existing private Site revision1/MFD_MCP_WRITES=false |
| Hook integrity | PASS normalized body9fde3c29dc02c1313687ce426b5d1237, ownerpostgres, invoker mode, empty search_path unchanged |
| Hook effective EXECUTE ACL | PASS only postgres and supabase_auth_admin; PUBLIC/anon/authenticated false |
| mfd_mcp schema | PASS same ACL: postgres USAGE/CREATE, authenticated USAGE, supabase_auth_admin USAGE; no anon USAGE or authenticated/anon CREATE |
| Other private schemas | PASS mfd_private postgres-only schema ACL; mfd_observability reviewed USAGE retained; no new access |
| MCP table ACL/RLS | PASS same restricted grants, all4 tables RLS enabled, no direct anon/authenticated DML |
| Broader app/MCP function ACL/body/mode snapshot | PASS807746a13158535dc0acd79f7e326e1c equals pre-hook evidence |
| Table ACL/owner/RLS snapshot | PASSa6a55183f1bf13379b47faca29de48e6 equals pre-hook evidence |
| Schema ACL/owner snapshot | PASScee9045bf59dfb92eb746344849ec04f equals pre-hook evidence |

The inspected public/storage default grants remain the previously reviewed managed/default posture; no new default grant in mfd_mcp/private schemas was observed. Snapshot equality supports unchanged effective application/schema/function/table permissions; it does not prove no idempotent GRANT/REVOKE statement was executed, nor is it an exhaustive platform/audit-log diff. No privilege repair, role change or SQL mutation was performed by the agent. Hook activation is operator evidence; real token issuance/hook behavior remains later acceptance.

**No unexpected security change found; no emergency action required.** S2 is complete. Proceeding under existing S3–S8 approval; no renewed permission request.

## S3 — draft-only operator handoff pending

Requested owner to reveal controls with the unsaved ON toggle, set path=/oauth/mcp/consent and Dynamic OAuth Apps OFF, **not Save yet**, and confirm separate Save UI. Agent will independently recheck OAuth still OFF before requesting the approved single Save. If dashboard autosaves/activates immediately, approved emergency OFF containment applies and execution stops. No client registration, full release, registry/fixture SQL or real login yet.


### S3 unsaved draft backend check — PASS

Owner reported unsaved enabled=true draft, exact Worker Site URL, /oauth/mcp/consent, Dynamic OAuth Apps OFF and separate Save button; Save not clicked. Independent credential-safe GET of the exact staging Auth authorization-server discovery at2026-10-29T14:12:33.856Z (15:12:33 Europe/Berlin) returned404/feature_disabled. Backend remains disabled; the toggle has not activated the service. Evidence: ignored `.sites-runtime/c1b-execution/s3-draft-backend.json`.

The exact draft is safe to Save once under the existing consolidated S3 approval. This finding confirms disabled backend status, not unsaved-field persistence. After operator Save, require saved enabled/path/DCR evidence and independent discovery verification before native client registration. No unrelated action or hosted mutation performed in this check.


## S3 — saved configuration verified PASS

Owner reports saved OAuth Server ON, Authorization Path=/oauth/mcp/consent, DCR OFF and exact Worker Site URL. These selected settings remain explicitly operator-confirmed management evidence. Independent read-only post-save discovery/OIDC GETs now HTTP200 with exact staging issuer, authorization/token/userinfo/JWKS URLs, code/query response, authorization_code/refresh_token grants, methodnone support and S256 capability. No registration_endpoint advertised; this is consistent with DCR OFF but **not independent proof of the stored toggle**. Public metadata also advertises plain and multiple signing algorithms; no claim of server-wide S256-only or ES256-only acceptance. Client flow must use S256; current JWKS still publishes only the previously observed EC/P-256/ES256 key, no private fields. No key operation.

Fresh independent settings: signup disabled, Google enabled, anonymous disabled. Exact staging project/ref/host verified. Two confirmed non-anonymous users and selected metadata/UUID-set digests unchanged; two email identities; sessions/native clients/authorizations/consents/local clients/grants/proposals0. Active audience Worker/mcp, DBwritesfalse. Hook normalized body9fde3c29dc02c1313687ce426b5d1237, owner/mode/search_path/restricted ACL unchanged. Broader table/schema/function fingerprints still exactly pre-hook baseline; no privilege exposure or automatic repair observed. Worker staging/pre-oauth/writesfalse and private Site staging/writefalse readbacks are retained/checked independently. No real authorization/token exchange or login attempted.

Evidence under ignored `.sites-runtime/c1b-execution/s3-settings.json`, s3-issuer.json, s3-oidc.json, s3-jwks.json. S3 completed without additional agent-applied mutation; owner performed approved dashboard save. No emergency stop required.

## S4 — required operator registration handoff

Connected Supabase tools expose project/SQL methods but no native OAuth client creation method. No administrative credentials were retrieved/created, no direct Auth-table INSERT or undocumented endpoint attempted. Requested one supported dashboard registration: MFD Staging — ChatGPT, Public/none/no secret, sole reconfirmed ChatGPT callback; return provider-assigned public ID and saved non-secret metadata. No repeated approval requested. If UI cannot express exact settings, stop rather than create confidential client. S5/full config and S6 depend on that assigned ID; S7 real login and S8 fixtures/acceptance remain not executed. Current maintenance endpoint remains safe and unusable for login/private MCP.


### Current S3–S8 status

| Scope | Status | Remaining dependency |
| --- | --- | --- |
| S3 | COMPLETE/PASS within recorded independent/manual evidence | Real token issuance is later acceptance |
| S4 | WAITING required supported dashboard interaction | Owner creates exactly one public/none client and supplies its non-secret native ID/metadata |
| S5 | NOT EXECUTED | Assigned verified S4 client ID for approved config substitution |
| S6 | NOT EXECUTED | S4/S5 native-runtime agreement and fresh guarded SQL preflight |
| S7 | NOT EXECUTED | Full release/allowlist; then approved interactive two-account Google login |
| S8 | NOT EXECUTED | S7 stable identity proof, approved fixtures and actual client connection |

No new hosted mutation was attempted during this S3 post-save verification turn. Execution pauses only for S4's required dashboard action; no renewed approval or administrative credential is requested. The existing approved authority remains in force for later covered scopes.


## S4 — native registration independently verified PASS

Owner completed exactly one supported dashboard registration. READ ONLY metadata confirms native client ID **fcad3c45-07cd-418a-978a-7e1d94ee0406**, name MFD Staging — ChatGPT, typepublic, token_endpoint_auth_method=none, deleted_atNULL, grantsauthorization_code,refresh_token and sole exact ChatGPT callback. No client-secret hash/value selected. This ID is public application configuration, not a user UUID or Google client ID. Other users/identities/lifecycle/security baseline remained unchanged. No duplicate registration or agent-created native client.

## S5 — full Worker deployed and initial verification PASS

Final ignored runtime configuration generated only after native ID verification. Exact template substitutions/startup validator and staging publishable-key equality checks PASS without printing key values. Worker TypeScript/lint PASS; actual dry-run packaged module byte hash equals approved full bundle. No source change or dependency update.

- Full bundle SHA256:4ed447ba67423347b489a232f78497001d7fc8dcabe9432e879f88c52b30a879.
- Final ignored config SHA256:e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5.
- Deployment executed once; Cloudflare creation timestamp2026-10-29T14:27:47.974811Z (**15:27:47 Europe/Berlin**).
- Version13f41563-bfb3-4d70-b61c-8383ab39218c; deployment2460c1de-7124-4f47-88fb-d450455171f8;100% full version.
- Same namespace781eaeca44c74543be214f485033adda/classAbuseCoordinator/fixed object; no second namespace, no migration reset. Preview URLs remainfalse; workers.dev enabled. Runtime staging/writefalse, exact one client/callback read back; maintenance-only mode removed.

Fresh deployment preflight confirmed existing CLI authentication/target, prior maintenance version/namespace/subdomain, exact artifacts, signup closed/Google enabled/OAuth metadata active and no advertised DCR endpoint. DCR/path values still operator-confirmed. No billing/upgrade/permission prompt, new subscription or privileged runtime secret. Worker startup2ms is not per-request CPU certification.

Six real HTTPS probes PASS: public metadata exact resource/issuer; missing and synthetic-invalid Bearer401; login200 with Google/password forms and Secure/HttpOnly/Host-prefix/Path=/ SameSite=Lax cookies/no Domain, CSP/no-referrer/no-store; unauthenticated consent401 and missing-transaction callback400. No real Google login, token or native authorization initiated. Evidence ignored `.sites-runtime/c1b-release/route-checks.json`; release config/private logs mode-protected/ignored, publishable-key console line redacted.

## S6 — single-ID local registry transaction COMMITTED/PASS

Fresh preflight verified users2/approved UUID digest, sessions/authorizations/consents/grants/proposals/local clients0, exactly one matching native public registration, writesfalse and required SELECT/lock/INSERT authority. Executed the unchanged approved c1b-client-allowlist.proposed.sql once, SHA256 **c0c9a8c878d92310450596752aedda07bc9e82394d411109ee8069cc8b243404**. Successful return and independent committed-row verification by14:30:30UTC (**15:30:30 Europe/Berlin**).

Only one INSERT into mfd_mcp.clients for the assigned native ID. Documented same-session target/runtime/OAuth/native-ID assertions were supplied; approved user-ID array was constructed privately in the database only after matching the fresh UUID-set digest against restricted local evidence. No raw user IDs returned/printed, no credentials extracted. No body/guard changes or automatic retry. This assertion preamble grants no permission and is not independent project/config evidence; separate read-only preflight supplied that evidence.

Postcheck PASS: exactly one local and one native client; users2/original UUIDs and two email identities unchanged; sessions/authorizations/consents/grants/proposals0; DBwritesfalse/resource exactWorker /mcp; workspaces0. Broader table/schema/function ACL/RLS/source fingerprints unchanged from approved baseline. No audience SQL, Auth-table mutation, seeded consent, role change or rollback.

## S7 — automated pre-login checks PASS; interactive primary login requested

Nine additional real Worker requests PASS: login/CSRF bootstrap, cross-origin/missing-CSRF denial, Google initiation303 with fixed redirect_to (no application state query), S25643-character challenge/no exposed verifier, secure cookie attributes, duplicate-start denial, wrong-browser callback denial, cancellation/replay denial and invalid return_to denial. Provider redirect was **not followed**; no real Google authentication or token exchange occurred. Tests do not prove successful hosted identity linking or successful code-verifier association with a real provider code; those remain interactive acceptance. Evidence ignored google-prelogin-checks.json. Temporary synthetic browser transactions use the approved private DO; cancellation/expiry cleanup applies, not quota reset.

Independent after-check: users2/UUID digest unchanged; email identities2; sessions/authorizations/consents/grants/proposals0; native/local clients1/1; writesfalse. No Google identity yet. Agent-issued full-stage Worker probes so far15 (S5six + S7nine), plus limited read-only Auth metadata preflights; within approved bounds, no hosted load test.

Required owner handoff: primary account only first, via fixed deployed /login → Continue with Google in its own browser profile. Keep page open and report completion/error without emails/tokens/codes/UUIDs. Verify same original UUID and no extra user before permitting secondary login in another profile. No new approval requested. S8 fixtures/ChatGPT connection/isolation NOT EXECUTED because authoritative order requires S7 stable identities first. No public/signup/write switches or production changes.


## S7 browser initiation blocker — local correction, 2026-10-29

**Root cause confirmed locally; corrected release NOT deployed.** The reported JSON is produced by the independent router's exact Origin guard: POST `/auth/google`, HTTP403. The deployed login document sends `Referrer-Policy: no-referrer`. An actual isolated Chrome native form submission against the unchanged approved bundle in local HTTPS workerd sends `Origin: null`, `Sec-Fetch-Site: same-origin` and form-encoded content. The router rejects it before Google initiation/upstream work. Ordinary navigation GETs may omit Origin; accepting missing/null POST Origin is not the fix. These are redacted local browser observations matching the reported failure, not a capture of the user's hosted browser headers.

Local correction in `hosting/independent/auth.ts`: HTML form documents use `strict-origin`, preserving exact POST Origin while limiting Referer to its origin. Callback and POST/redirect responses retain `no-referrer`. A second native-browser finding was CSP `form-action 'self'` blocking the legitimate redirect chain. Login documents now additionally permit only the pinned staging Supabase authorize path and Google accounts origin; consent documents permit only configured registered callback origin/path sources. No wildcard or arbitrary response-derived redirect source. Default/base/framing restrictions remain. Origin/CSRF, S256, browser-bound one-time DO transactions, exact callback/relative continuation, verified session/user binding and account-switch restrictions are unchanged. No Referer/proxy fallback or null-Origin acceptance was added.

| Verification | Result / limits |
| --- | --- |
| Reproduce original failure with actual Chrome + local workerd | PASS: native POST403, Origin null; no real provider navigation |
| Corrected browser initiation | PASS: POST303 with exact same origin; synthetic Supabase→Google chain permitted by CSP, external requests intercepted before network |
| Malicious actual cross-origin form | PASS: HTTP403 |
| Missing/null/wrong Origin, spoofed Referer/proxy headers, cross-site POST | PASS: denied before upstream work |
| Correct Origin with invalid CSRF | PASS: denied; CSRF remains required |
| Callback privacy / configured consent CSP | PASS unit checks; real consent/provider acceptance remains untested |
| Complete network-blocked local runner | PASS: 43/43 files, including security/MCP/SQL/account-isolation and new browser-policy regression |
| Frontend and hosting TypeScript / hosting lint | PASS |
| Staging build / artifact security checks | PASS: public37 and selected staging output167 files |
| Exact Wrangler dry-run packaging | PASS: packaged module equals candidate bundle; no upload |
| Hosted read-only safety check | PASS: two approved users/UUID-set digest and two email identities unchanged; zero sessions/authorizations/consents/local grants; DB writes false; deployed configuration retains application writes false |
| Real Google login / identity linking / ChatGPT / S8 | UNTESTED; no retry, fixture INSERT or additional user |

No hosted mutation, configuration change, real Google retry, dependency/lockfile change, new Cloudflare resource or cost occurred during diagnosis. No new dependency audit claim: prior development-only moderate advisory remains recorded. Local browser profiles, redacted evidence and synthetic fixture state remain ignored; Chrome and workerd were stopped. Fixture diagnostics are excluded from release packaging.

Candidate full bundle and identical dry-run module SHA-256: `7df5701d78d6494b4e8c537a12940e5866ae85ae36fa6b0d229a45b493f92d06`.
Unchanged runtime config SHA-256: `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5`.
Preserved original approved bundle SHA-256: `4ed447ba67423347b489a232f78497001d7fc8dcabe9432e879f88c52b30a879`.
Hosted version remains `13f41563-bfb3-4d70-b61c-8383ab39218c`; no rollback required/performed.

**Next scope: approve replacement full bundle only**, using the candidate hash above, unchanged account/config/client/namespace/migration history and existing Free/no-upgrade/emergency-stop conditions. The authoritative consolidated plan states “No other settings, capabilities, audience, account, permissions or source may change” and “a change beyond these declared substitutions requires additional review/approval.” This source correction exceeds its original hash-pinned substitutions; the user's diagnostic instruction expressly requires stopping if outside that scope. All local preparation is complete for concrete review. After replacement approval, revalidate provenance/config/security, deploy once, perform bounded route/header denial verification, then request exactly one fresh primary Google login. S7–S8 resume only after stable primary identity verification; no additional approval is needed for their already-authorized unchanged operations.

Technical basis: [Fetch request Origin algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header), [browser Referrer-Policy behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy). No Supabase/Google settings change is indicated by this failure.


## Approved replacement deployment — 2026-10-29, postcheck STOP

User explicitly approved replacement bundle SHA-256 `7df5701d78d6494b4e8c537a12940e5866ae85ae36fa6b0d229a45b493f92d06`. Immediately before deployment, bundle and unchanged config hash `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5` both matched. Fresh read-only precheck: users2 with original UUID-set digest, identities2, sessions0, local grants0, database writesfalse; existing Worker origin/binding/application writesfalse unchanged.

Deployment command completed successfully once. Cloudflare independently reports version `e770b200-f79d-4588-93f6-e2bbcd3955f9` at100%, deployment `5c4d9968-e6cb-487f-8b75-46b3a17e9a05`, timestamp `2026-10-29T14:55:52.104512Z`. Binding retains namespace `781eaeca44c74543be214f485033adda`, class AbuseCoordinator; canonical origin and application writesfalse unchanged. No new namespace, Supabase mutation, user/client/grant change, upgrade or payment prompt.

**Unexpected hosted result: STOP.** First bounded GET `/login` returned HTTP200 but `Referrer-Policy: no-referrer`, where the approved corrected source/local browser expected `strict-origin`. The assertion stopped immediately; remaining five probes, including malicious cross-origin tests, were NOT executed. Their prior local PASS is not a hosted postdeployment PASS. Cause of deployed-header discrepancy remains UNKNOWN; successful deployment/version readback does not close acceptance. No blind redeployment, automatic rollback or Google retry occurred. Scope remains blocked pending investigation; do not attempt primary login yet. No destructive action, commit/push or production access.

| Replacement check | Result |
| --- | --- |
| Exact approved bundle / unchanged local configuration hashes | PASS |
| Single deployment / independently active new version | PASS |
| Existing namespace, origin and false application write switch | PASS |
| Login HTTP200 | PASS |
| Expected corrected login Referrer-Policy | FAIL: no-referrer observed |
| Remaining hosted denial/security checks | UNTESTED: stopped at first unexpected result |
| Real primary Google login / UUID linking / S8 | UNTESTED, blocked |

No successful authentication or integration completion is claimed. The newly active version is recorded above; prior version entries are historical. Further diagnosis must resolve the observed header before another interactive login is requested.


## Postdeployment header investigation — resolved observation, 2026-10-29

**Current hosted checks PASS; no further source change or deployment required.** The earlier unexpected response was real observed evidence and remains recorded. It is no longer reproducible. Two bounded GETs (`/login` and `/login?diagnostic=header-check`, request Cache-Control no-cache) now both return200, Referrer-Policy strict-origin, corrected explicit provider CSP, private/no-store and the expected Google form. No Age or CF-Cache-Status header was present. No login/provider redirect was attempted.

Cloudflare script download was read as multipart data, with only the extracted module's hash/length returned. Its exact50615-byte module SHA256 is `7df5701d78d6494b4e8c537a12940e5866ae85ae36fa6b0d229a45b493f92d06`, identical to the approved local artifact. Active version remains e770b200-f79d-4588-93f6-e2bbcd3955f9 at100%. The multipart envelope itself is not the code artifact and must not be compared as its checksum. Local configuration remains unchanged at recorded e0f45c65… hash.

Header trace: auth.ts sets strict-origin only for GET HTML form pages; callback/POST responses intentionally use no-referrer. Colocated router and privateJson do not overwrite that header. The shared Site mfd.ts helper sets no-referrer but is not part of this independent bundle. Maintenance handler also uses no-referrer but is not the active module. The packaged full module contains one header setter with the expected conditional. Therefore no persistent helper override or wrong uploaded artifact was found.

Most likely explanation for the first immediate post-upload response is transient serving of the earlier release during deployment propagation. **Exact historical cause remains UNKNOWN**: the failed probe did not preserve its body/CSP/ray/cache metadata, so it cannot conclusively distinguish an older edge response from an intervening transformation. No persistent caching or transformation is evidenced: repeat ordinary and query-varied responses agree with approved code and no-store. No zone transformation changes or purge were needed/performed. Local tests reproduce old-bundle no-referrer/native Origin:null403 and corrected-bundle strict-origin/native Origin303, as previously documented; the transient hosted rollout timing itself was not reproduced locally.

Eight non-authenticating hosted requests in this investigation: two GET header checks, four POST denial checks, missing-bearer MCP and missing-transaction callback. All PASS. Cross-origin/null/missing Origin POSTs403; exact Origin with invalid CSRF400; MCP without bearer401; callback without transaction400/no-referrer. No valid Google initiation POST, external redirect, upstream exchange or real login. These results establish the corrected document policy and retained denial boundaries, not real browser/provider success. Focused browser-origin-policy and independent Google SQLite/PKCE/session/replay/account-switch suites rerun PASS. Prior actual native Chrome/workerd evidence remains applicable to the identical byte artifact; no fresh native emulator run is claimed here.

**Disposition:** observed mismatch resolved without mutation; no new artifact/hash or fix approval required. Current document policy should permit the legitimate browser POST while preserving strict Origin/CSRF; malicious POSTs remain denied. Request exactly one fresh primary-account login under existing approval, then verify original UUID and user count before secondary/S8. Do not automatically retry on an error. No Supabase settings, users, clients, grants, public signup/DCR/write switches, namespace/state, production, Git history or deployed version changed in this investigation.


## S7 primary attempt — linked identity, UI completion blocked

The operator's single fresh attempt returned the generic Worker failure page. No retry or mutation was performed in diagnosis. Fresh read-only staging evidence: users2 with unchanged approved UUID-set digest; identities3 including exactly one Google identity; sessions1. Restricted digest comparison confirms both new Google identity and session belong to the original primary UUID, not the secondary. Both users remain confirmed/non-anonymous; no duplicate user. Native authorizations/consents and local grants remain0; DB writesfalse. A redacted Auth-log aggregate includes one successful PKCE POST200, consistent with completed code exchange; log paths are normalized to `/`, so these logs cannot independently pinpoint the failing Worker route. No token, code, personal email or provider identity payload was read/exported.

**Partial PASS:** primary Google identity linked to the intended existing account with no additional user. **BLOCKED/UNKNOWN:** first-party Worker session establishment and connections-page completion; the generic catch covers multiple validation/RPC stages. Requested only the currently displayed URL path and whether Google selection appeared, without reload/query disclosure. Do not conclude login acceptance or proceed to secondary/S8 until the failing stage is identified. No settings changed, new code deployed, session revoked or Google retry attempted. Existing session is retained for diagnosis; no automatic cleanup/deletion.


### Callback-stage confirmation

Operator confirms Google selection appeared and failure page remains on `/auth/google/callback`. The supplied query/code is intentionally not reproduced, stored or redeemed. Successful PKCE exchange log plus primary-owned session narrows failure to the post-exchange callback response/session validation path; it is not a Google initiation Origin failure or a connections-page RPC failure. Callback code consumes the private transaction before exchange and only sets first-party session cookies after upstream user/claims validation; no retry of that consumed authorization is appropriate.

Current diagnostics cannot identify which callback assertion threw: all exceptions use one generic400 page, and available Auth logs do not expose safe per-assertion claim results. A historical bad_jwt403 aggregate classifies as malformed segments and cannot be attributed to this valid login (earlier synthetic bearer probes exist). Do not use it as proof the real Google token was invalid. Current public Auth source documents distinct token exchange and hook serialization, but upstream source alone does not establish this hosted token's contents. No claim check has been weakened, no real token extracted, no new source deployed or settings changed. Exact failing predicate remains UNKNOWN; further progress needs narrowly scoped safe callback-stage diagnostics, with no token/email/code logging, reviewed locally and separately approved before replacing the hash-pinned artifact.


## S7 callback diagnostics patch — local verification complete, NOT DEPLOYED

**GO for review/approval of the diagnostic bundle only. Hosted S7 completion remains blocked.** Current active version is still e770b200-f79d-4588-93f6-e2bbcd3955f9; no hosted request, SQL/configuration mutation, login retry or deployment was performed in this local task. The existing two users, linked primary identity/session, native/local registrations, Supabase configuration and disabled write switches were not changed. The consumed callback/code was not reused, copied into tests or retained as evidence.

### Callback trace and fixed identifiers

Errors return HTTP400 with a compile-time identifier in `X-MFD-Callback-Diagnostic` and the generic failure HTML. No arbitrary exception message/cause, upstream body/status detail, request ID, token, code, cookie, verifier, browser state, user identifier, email or personal data is included. No console logging, remote telemetry or persistent diagnostic record was added. Identifiers are fixed categories shared by every user, not correlation identifiers. Successful callbacks have no diagnostic header. Normal origin/method/rate-limit responses retain their existing421/403/405/429 behavior; diagnostics do not bypass them.

| Callback stage | Fixed failure identifiers |
| --- | --- |
| Request/cookie parsing fallback | CB_REQUEST; CB_COOKIES |
| Required browser transaction and atomic DO consume | CB_TRANSACTION_REQUIRED; CB_TRANSACTION_TAKE |
| Stored context structure, expiry, browser ownership | CB_CONTEXT |
| Singleton allowed callback parameters; provider cancellation; bounded code | CB_PARAMETERS; CB_CANCELLED; CB_CODE |
| Validated relative continuation | CB_CONTINUATION |
| Browser session fingerprint and existing authenticated account | CB_SESSION_BINDING; CB_EXISTING_IDENTITY |
| PKCE exchange transport/status/JSON/required fields | CB_EXCHANGE_REQUEST; CB_EXCHANGE_STATUS; CB_EXCHANGE_JSON; CB_EXCHANGE_FIELDS |
| Upstream first-party user validation transport/status/JSON | CB_USER_REQUEST; CB_USER_STATUS; CB_USER_JSON |
| Token payload parsing | CB_CLAIMS_JSON |
| Verified user/subject, exact issuer/audience/role, absent external client | CB_SUBJECT; CB_ISSUER; CB_AUDIENCE; CB_ROLE; CB_CLIENT |
| Nonempty session, expiry and not-before | CB_SESSION; CB_EXPIRY; CB_NOT_BEFORE |
| Exchange user versus verified subject/existing owner | CB_ACCOUNT |
| Final redirect response construction | CB_RESPONSE |

The preceding successful PKCE exchange and primary UUID evidence narrow the actual hosted failure toward exchange-response parsing, first-party identity/claims or final response construction. The exact predicate remains UNKNOWN until a newly approved deployed diagnostic version observes a fresh authorized attempt. No claim representation is normalized or broadened to guess at a fix: an audience array, null client_id, wrong issuer, mismatch or missing session remains rejected exactly as before. No direct Google token is accepted.

### Patch and security review

Files: new `hosting/independent/google-diagnostics.ts`; changed `google.ts` and `auth.ts`; new `tests/google-callback-diagnostics.cjs`; diagnostic assertions added to `scripts-smoke-google-local.cjs`. Existing Origin/CSRF, fixed redirect/S256 verifier, account/session binding, SQL/RLS/ownership checks and DO transaction consumption order are preserved. Transactions are still consumed before callback parsing/exchange and never resurrected. Pending flow cookie is cleared on callback failures as before. A small local hardening orders successful redirect construction before queuing access/refresh cookies, so an injected response-construction error does not install a session on the error page. Other auth handlers and MCP routes do not gain diagnostic headers.

| Local verification | Result |
| --- | --- |
| Full network-blocked suite | PASS44/44 files, including existing security/MCP/database/account isolation |
| New diagnostic suite | PASS success and every reachable rejection category, expiry/context/duplicate/unknown parameters, cancellation/code bounds, transport/status/JSON failures, all strict claim checks, account mismatch and injected late response failure |
| Diagnostic privacy | PASS sentinel credentials, synthetic code/token/cookie/verifier and arbitrary exception text absent from response; failure responses do not install access cookies |
| Frontend/hosting TypeScript and hosting lint | PASS |
| Staging build/artifact checks | PASS public37 and selected output167 files |
| Native HTTPS workerd + real local SQLite | PASS successful callback/consent and diagnostic replay/cancel/parameter/exchange failures; missing-bearer and malicious-Origin denial retained |
| Native process restart + concurrent callback | PASS persisted transaction survives restart; exactly one303 winner and one400 rejection |
| Wrangler dry-run packaging | PASS candidate module byte-for-byte identical to packaged module, no upload |

`CB_REQUEST` is a defensive early fallback, not a reachable validation failure for a normally constructed Request; no artificial hosted trigger is claimed. All detailed branches are tested with synthetic inputs; neither local tests nor native fixtures establish the contents of the real token. Emulators stopped; persisted local state/counters retained without quota resets. No dependency/lockfile change or new audit claim. Local evidence/source manifest remains ignored under `.sites-runtime/c1b-origin-fix/`.

### Exact artifact proposed for replacement approval

- Full colocated bundle/identical dry-run module SHA256: **`bbf827bceb0848476177c8e15d7c7b758565c3ba58470aef6b1675f8b67f2f6b`** (52022bytes).
- Unchanged ignored release config SHA256: `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5`.
- Same staging Worker/account/namespace/class/fixed object/migration history. No added runtime variables, keys, secret bindings or privileges. Other locally emitted bundles are not proposed deployment targets.

Approval request: replace only mfd-connect-staging's existing full bundle with this diagnostic hash, preserving unchanged config, bindings/state/secrets and existing Free/no-upgrade/emergency-stop limits. Before upload rehash both files, verify active version/config and current staging invariants read-only, and stop on drift. Use the same reviewed hosting-directory Wrangler deploy command/config, no new migration or resource. No approval is inferred from local test success.

After approved deployment, independently compare downloaded deployed module hash and active version/bindings. Use at most six initial non-authenticating checks: login200/strict-origin/CSP, callback without transaction400 with CB_TRANSACTION_REQUIRED/no-store/no-referrer and flow-cookie clearing, hostile-origin POST403, correct-origin invalid-CSRF POST400, missing-bearer MCP401 and discovery200. Do not send real cookies/codes in probes. Allow a bounded follow-up header check if rollout propagation produces an earlier version response; do not declare it fixed until headers/artifact agree, and stop on persistent/unexpected results. No hosted load test or provider redirect.

Only after those checks pass, request exactly one fresh primary Google login. Operator reports only completion or the fixed diagnostic identifier, never the callback query or credentials. Compare same primary UUID, count2 and account/session/consent state before secondary/S8. On failure stop without retry, transaction replay, signup/claim relaxation or automatic rollback; no cleanup/deletion. Existing non-destructive containment authority remains, but this preparation performs none. The underlying real callback rejection is not yet fixed or proven; this patch supplies the missing safe evidence.


## Approved diagnostic replacement — deployed and verified PASS

Executed once under explicit bundle-replacement approval. Immediately before upload, bundle SHA256 `bbf827bceb0848476177c8e15d7c7b758565c3ba58470aef6b1675f8b67f2f6b` and unchanged config SHA256 `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5` matched. No rebuild or source substitution during execution.

- Active version: `40f41d56-fe97-446a-8778-3d815ebc688c`,100%.
- Deployment: `39ebebd3-192f-436f-b5fb-10ed772eb88e`, created `2026-10-29T15:21:29.85036Z` (16:21:29 Europe/Berlin).
- Independent downloaded module SHA256 exactly matches approved diagnostic bundle.
- Existing MFD_ABUSE/AbuseCoordinator namespace `781eaeca44c74543be214f485033adda`, canonical origin and MFD_MCP_WRITES=false unchanged. No new namespace, migration reset or config/secret substitution. No upgrade/payment prompt.

Fresh preflight PASS: original two-user UUID-set digest; identities3/Google1/sessions1 as recorded after prior primary attempt; native/local clients1/1; authorizations/consents/grants/proposals0; DBwritesfalse and exactWorker audience. Existing public settings independently return disable_signup=true, Google=true, anonymous=false. OAuth metadata200/exact issuer/no registration_endpoint; saved DCR OFF remains prior operator evidence, not an independent management-setting read. An initial unauthenticated public-settings request lacked required API-key context and supplied no signup/provider evidence; repeated with the existing publishable key internally, only selected booleans returned. No secret read/export or setting change.

All six bounded probes PASS: login200/strict-origin/explicit provider CSP; empty callback400/CB_TRANSACTION_REQUIRED/no-store/no-referrer/flow-cookie clearing; hostile-origin POST403; correct-origin invalid-CSRF POST400; missing-bearer MCP401; protected-resource metadata200/exactresource. No valid Google initiation, provider redirect, actual code/token/cookie or login test in probes. Evidence ignored diagnostic-hosted-checks.json. No propagation mismatch occurred.

Supabase remains read-only throughout deployment verification; no user/identity/client/grant mutations, login retry, Auth setting change, signup/DCR/write enablement, production access, Git commit/push or destructive rollback. Current diagnostic release does not claim to fix the underlying rejection. Next required interaction: exactly one fresh primary Google login from `/login`, never the consumed callback URL. On error report only the fixed CB_* identifier; no query/code/token/email. Stop without retry and diagnose that category. On success verify same primary UUID/count2 before continuing already-approved secondary/S8.


## S7 primary Google login — completed/PASS

Operator reports successful MFD connections page from the single fresh primary login after diagnostic deployment. Personal account text supplied by the operator is not reproduced or retained in this report. No diagnostic failure was reported and no automatic retry occurred.

Independent staging read-only postcheck PASS: exactly2 confirmed non-anonymous users with original UUID-set digest; two email identities and one Google identity; Google owner matches restricted original PRIMARY UUID; zero duplicate user/provider identity groups. Sessions2, both owned by original primary (previous failed-completion attempt had already created one Auth session; the fresh successful login adds one). These are two session records, not two additional accounts. One native/one local client; authorizations/consents/local grants/proposals remain0; DBwritesfalse. No user, identity or session deletion/repair performed. Worker success is operator-observed UI plus existing server-side verified-session checks, not token export or a separate captured bearer inspection.

The earlier callback rejection's precise predicate remains UNKNOWN: the fresh diagnostic attempt succeeded without emitting CB_* failure. This diagnostic patch did not broaden claims or bypass validation; do not invent a causal fix or retroactively assign an error code. Primary Google→existing Supabase UUID→Worker connections is now accepted within observed scope. Refresh/revoke, consent continuation, native MCP and data isolation remain later tests.

Next required interaction under existing S7 authority: exactly one SECONDARY Google login using a separate browser profile with no primary Worker session; retain the primary connections page/session. Stop on any error; report only CB_* identifier or generic non-secret wording. Verify secondary original UUID/user-count2 and identity/session ownership before S8 synthetic fixture INSERTs/ChatGPT acceptance. No third identity, extra account, hosted configuration change or consent has been introduced. Both MCP writes remain disabled; public signup remains closed.


## S7 secondary Google login — completed/PASS

Operator reports successful connections page in the separate secondary browser profile. Personal account text is not reproduced. Independent fresh staging read-only check: exactly2 confirmed non-anonymous original UUIDs; two email and two Google identities; each Google identity maps to its intended restricted original primary/secondary UUID; zero duplicate user/provider identity groups. Sessions3 with both approved owners represented (two primary records including the earlier failed-completion attempt, one secondary). No new user. Native/local clients1/1, authorizations/consents/grants/proposals0, DBwritesfalse and exactWorker resource retained. Public settings freshly confirm signup disabled and Google enabled; reviewed release writesfalse unchanged.

This completes both existing-account Google→Supabase UUID→Worker connections-page checks. Unknown-account rejection, real lifecycle/revoke/refresh, consent continuation, browser-account switching and direct API/data isolation are not inferred from successful logins. No third identity/login probe or account mutation was made. Earlier callback rejection remains historically unexplained; no fabricated diagnostic code or weakening is claimed.

## S8 exact fixtures — transaction COMMITTED and postverified

Fresh preflight: exact staging project gngnrmzeghjzqsmzuktl/MFD OAuth Phase2 Testing, healthy17.11.0.003, postgres connection; approved UUID set unchanged, required SELECT/INSERT/lock authority present, public.forma_workspaces empty/RLS enabled, activeWorker audience and falsewrites. Hook EXECUTE remains denied to anon/authenticated. No grant/permission change.

Executed unchanged `database/staging/c1b-isolation-fixtures.proposed.sql` once, SHA256 `34bfd3e213ea1230cacfac25e5626b88298b27a1cd2ebb644c199c680b25f82e`, under existing explicit S8 approval. Same-session preamble verifies the private UUID-set digest then binds target, false runtime assertion and exact primary/secondary IDs through server-side restricted mapping comparisons; no raw account IDs/emails returned. This preamble is caller-supplied context, not independent project/config evidence; external preflight supplied those checks. SQL source/guards were not edited. No retry or rollback.

Independent postcheck completed by `2026-10-29T15:32:26Z` (16:32:26 Europe/Berlin): exactly2 workspaces, primary payload exactly `{"profile":{"name":"MFD STAGING A"}}` revision1 and secondary payload exactly `{"profile":{"name":"MFD STAGING B"}}` revision1. Users2/original UUID set, identities4, sessions3 unchanged; authorizations/consents/grants/proposals0, writesfalse. Only approved synthetic workspace INSERTs were submitted; no health/workout data or consent seeded, no overwrite/deletion.

Fresh before/after boundary digest `61546963f7d66d8637dccbd22b0cd61b` matches exactly across inspected application/MCP table owner/ACL/RLS, policies including storage, function definitions/owners/ACLs, schema ACLs and bucket privacy/limits. This digest is a new same-operation comparison, not a replacement for historical differently defined catalog digests. It is not a full platform audit or authenticated isolation test. No production access, Auth configuration/client/user change, paid resource, commit/push or destructive operation.

**Next interaction:** primary ChatGPT custom MCP draft, exact approved native client/callback, profile-only explicit consent and genuine `get_profile` invocation. Expected synthetic result is MFD STAGING A. Retain both browser sessions. Verify native/local consent owner and marker before asking for secondary connection. Use the normal supported UI/client stores; do not export tokens or use operator-bypass SQL as evidence of isolation. Direct REST/RPC/storage and lifecycle details not exposed safely by the client remain UNTESTED/UNKNOWN until supported acceptance can establish them. Do not claim integration complete from fixture insertion.


## S8 primary over-consent/reconnect — STOP; revocation handoff pending

Operator reports selecting all diary permissions, deleting the ChatGPT integration and retrying, then seeing the shared consent handler's generic failure page. This differs from the requested profile-only acceptance. No authenticated get_profile result is claimed. Agent performed only read-only investigation; no reconnect/retry, grant overwrite, SQL recovery or deletion.

Fresh state: original users2/UUID-set unchanged, identities4, sessions5, native/local clients1/1, authorizations2, native consents1, local grants1, proposals0, workspaces2, DBwritesfalse. The primary's existing local grant still contains workouts/routines/nutrition/progress/profile, all for the expected approved client; no secondary grant. Thus deleting the ChatGPT-side connection did **not** remove native consent or local diary permissions. Do not claim profile-only isolation while that broader grant remains. Sessions increased during operator-driven OAuth activity; all ownership and lifecycle acceptance still require verification. One initial read-only query used the wrong native-client column name and failed without mutation; corrected query uses id.

Selected metadata: expected nondeleted Public/none native registration and original sole callback unchanged; both authorization rows belong to primary, expected client/callback, S256 and approved status. At inspection neither had expired. Native consent for expected primary/client is unrevoked. No code, verifier/challenge value, state, personal email or provider payload was selected. This rejects a simple changed-registration/expired-row explanation at inspection; it does not exclude other transient/UI failures.

Source/docs finding: Supabase getAuthorizationDetails may return only redirect_url when consent already exists ([official API documentation](https://supabase.com/docs/reference/javascript/oauth-server-getauthorizationdetails)). The independent upstream wrapper intentionally refuses redirect-only replies without a client identity verified in that request. This produces the shared generic failure rather than allowing an unbound redirect. Existing approved consent plus retry is consistent with this known reconnect/auto-consent compatibility limitation, but the exact private response from the operator's request was not captured; do not label a full hosted trace proven. No origin/CSRF/callback/client checks were relaxed.

Required next action under already-approved S8 revoke authority: operator uses primary `/oauth/mcp/connections` → Revoke access once for the expected native client. Handler revokes local diary access first, then attempts native refresh-token grant revocation. Stop on error; independently inspect local/native state before any retry or reconnect. No direct SQL DELETE, client/user removal, consent seeding, destructive rollback or permission change. Once revocation is verified, review the current ChatGPT draft/callback and permit only a fresh profile-only flow. The old broad consent must not be treated as automatically narrowed by deleting the ChatGPT app. Secondary connection remains on hold.


## S8 primary broad-consent revocation — verified PASS

Operator used the primary connections page once and reported Access revoked. Personal account text is not reproduced. Agent verification was strictly read-only: local MCP grants0, active native consents0, revoked native consents1. Native/local client registrations remain1/1; original users2/UUID-set unchanged, identities4, workspaces2 with exact owner-bound A/B fixtures/revision1 unchanged, proposals0, DBwritesfalse. Sessions4 (previously5), both approved owners still represented. Revocation was through the already-approved first-party endpoint, not SQL deletion or account/client deletion.

This verifies removal of local diary permission and recorded native consent revocation. Live old-token/refresh reuse was not attempted or exported; do not claim cryptographic access-token revocation or complete lifecycle testing. Existing dispatcher requires current local consent/session, so absence of grants is its source-enforced denial boundary; an actual replay denial remains untested. No new approval needed for the covered reconnect stage, but no blind retry occurred.

Next: exactly one fresh PRIMARY ChatGPT connect using the unchanged approved native client and exact callback, with only profile checked (workouts/routines/nutrition/progress unchecked). Stop if callback differs or fresh permission choice is not offered. Invoke genuine get_profile and report only expected synthetic marker MFD STAGING A, or non-secret error. No additional connection/deletion/approval attempt on failure; secondary connection waits for verified primary profile-only result. No signup/DCR/write enablement, hosted configuration/source change, production access, commit/push or destructive recovery.


## S8 primary authenticated profile retrieval — PASS within reported client evidence

Operator reports ChatGPT invoked get_profile through the connected MFD Staging app and returned exactly MFD STAGING A. This is user-observed client/tool evidence, not an agent-captured raw MCP transcript. Independent staging read-only check corroborates exactly one local grant: original PRIMARY UUID + expected native client + permissions=[profile] only; active native consent and OAuth-client session ownership are primary. Users2/original UUID-set, identities4, native/local clients1/1, both exact fixtures/revision1 unchanged, proposals0 and DBwritesfalse. No secondary consent exists. This is the intended least-permission primary state, replacing the earlier revoked broad grant; source/config unchanged.

PASS for primary expected-profile acceptance under that evidence boundary. Do not yet claim full A/B isolation, unconsented-section denial, owner-argument rejection, refresh/reuse/signature/expiry or direct REST/RPC/storage tests; those remain pending or not safely observable. No raw token/code/email or private UUID is included. Agent cannot invoke this separately connected ChatGPT MFD app through current Codex tool inventory; operator interaction is required for genuine client tool calls, and operator-bypass SQL is not a substitute.

Next: one read-only get_nutrition attempt through the currently profile-only primary connection, without adding permissions, to observe denial. If client hides/declines the call before sending, record client-side enforcement/UNKNOWN server outcome instead of PASS. Secondary acceptance subsequently requires a supported separate-account/reconnect flow using the secondary MFD browser session; do not assume changing browser profiles alone changes an existing ChatGPT token's owner. Preserve callback/client and stop on any unauthorized data, consent drift or ambiguous account switch.


## S8 nutrition denial probe — client requests reconnect; no reconnect authorized yet

Operator reports ChatGPT displays connection expired/reconnect on the requested get_nutrition test. No nutrition data/tool response was reported. Agent instructed no reconnect while investigating and performed only read-only checks: original users2/UUID-set unchanged, primary profile-only local grant still present for expected client, active native consent1, OAuth-client session1, sessions5, DBwritesfalse/proposals0. These persistent records do not prove the client-held access token is unexpired or that the actual nutrition request reached the MCP server.

Source trace: service.ts intentionally translates downstream401/403 tool errors into result.isError with `_meta['mcp/www_authenticate']` and error=insufficient_scope. Therefore a valid identity requesting an unconsented section can trigger a client reconnect/consent UI; ChatGPT's displayed expired label is not by itself evidence of token expiry. Existing isolated MCP regression rerun exercises both401/403→insufficient_scope and passes. No source/config change or permission expansion is required to establish this explanation. Available redacted upstream log aggregates do not independently capture the specific MCP response, so exact hosted cause remains UNKNOWN, not a proven nutrition-denial wire trace.

Acceptance: no nutrition data reported; client blocked and requested authentication. Server-side unconsented-section denial remains unconfirmed through the real client. Do not broaden consent or reconnect merely to make the negative test pass. Next bounded client check is one get_profile attempt without reconnect/consent change. If A still returns, it distinguishes the section challenge from blanket client failure; if client refuses, preserve UNKNOWN and inspect supported account controls before further OAuth activity. No automatic retry or third-party credential inspection.


## S8 primary connection remains usable after nutrition challenge

Operator reports one get_profile call through the existing connection, without reconnect or consent change, returned `{"data":{"name":"MFD STAGING A"},"revision":1}`. This supports a section-specific reauthorization prompt rather than blanket connection expiry at that time. Nutrition data was not returned. Exact raw nutrition denial/transport status remains UNKNOWN; do not claim a captured server error or prove token expiry/refresh behavior from UI wording. Existing local regression corroborates insufficient_scope challenge behavior only as local evidence.

Primary expected marker and unchanged connection PASS in reported client evidence; no additional authorization requested for that check. Proceed with secondary acceptance using its already authenticated separate MFD browser profile and a supported ChatGPT account/reconnect control. Do not assume an existing ChatGPT binding becomes secondary merely from changing browser profiles: verify displayed MFD identity before consent and actual B marker afterward. Preserve the app/native client/exact callback; no deletion/recreation, primary grant expansion, third identity or new account. If UI offers no supported reconnect/account action, pause only for that UI blocker.


## S8 secondary connection attempt — CB_ACCOUNT, stopped

Operator reports CB_ACCOUNT during Google callback for the secondary ChatGPT connection attempt. No retry, logout, grant change, code replay, deployment or configuration mutation was performed by the agent. Source predicate is `verifiedOwner !== exchangeReply.user.id || (flow.owner && verifiedOwner !== flow.owner)`: exchange user/verified subject mismatch OR Google returned an owner different from the verified account already bound at flow initiation. Previous browser-session fingerprint/existing-identity checks occur before this predicate; cookies are installed only after it succeeds. Account switching within an authenticated first-party flow is deliberately rejected, not silently adopted.

Fresh independent staging evidence: original users2/UUID-set unchanged; Google identities2/total identities4 still mapped to original owners; latest non-OAuth session belongs to SECONDARY. Session groups: primary first-party3 plus OAuth1, secondary first-party3; no secondary OAuth session. Only primary profile-only local grant and active native consent remain. No secondary local permission or native consent; proposals0, workspaces2, DBwritesfalse. Extra Auth sessions may be created by provider exchanges before Worker rejects account substitution; do not delete/revoke automatically or equate them with installed Worker cookies.

This is consistent with Google returning secondary while the actual browser flow was still bound to primary, but does not conclusively distinguish the two CB_ACCOUNT predicates. The existing Worker session must be observed safely, not inferred from the intended browser profile or supplied email. Requested one normal connections GET in the exact failing profile, reporting only primary/secondary/sign-in label, with no reload of callback, account details, tokens or state. Do not start a new authorization until browser identity is clarified. If primary remains, use a deliberate approved logout/clean-session procedure before selecting secondary; if secondary remains, investigate the alternate response-identity mismatch rather than bypassing the guard.

Existing independent Google-auth and callback-diagnostics suites rerun PASS, including synthetic existing-Alice→Google-Bob rejection and mismatched exchange user. No security check weakened, new artifact proposed or hosted test claimed from local mocks. Primary working profile connection remains intact; secondary data retrieval/actual A/B isolation remains incomplete. No production access, destructive cleanup, commit/push or permission expansion.


### Secondary attempt browser mismatch confirmed

Operator checked the same failing browser profile's connections page and reports PRIMARY. Combined with the new secondary-owned upstream session and CB_ACCOUNT, this establishes a browser-account mismatch sufficient to explain the rejection: a primary-bound first-party flow selected secondary at Google. The existing primary Worker session was retained rather than replaced; no secondary consent/data grant was installed. This is the intended account-substitution protection, not a reason to weaken it or change the OAuth client/callback.

Next controlled procedure uses a brand-new isolated browser profile/Guest window, not another tab in the primary profile. Keep the primary ChatGPT connection and primary browser session untouched. Establish only the existing approved SECONDARY MFD account through `/login` once, then verify connections identifies SECONDARY before initiating ChatGPT authorization in that same profile. No callback reload, account creation, cookie/token export, manual identity linking, source/config change or destructive cleanup. If the expected identity is not displayed, stop. Fresh ChatGPT flow follows only after the isolated first-party identity is verified.


## S8 secondary ChatGPT authorization — independently verified

Operator reports adding secondary to ChatGPT after the isolated-browser instructions. Fresh read-only staging metadata now confirms both original UUIDs have exactly profile-only local grants for the sole approved native client, active native consents and OAuth-client session ownership. Users remain2/original UUID-set; identities4; native/local clients1/1; both owner-bound synthetic fixtures remain exact/revision1; proposals0 and DBwritesfalse. No second native client, additional user, broader permission, agent-applied mutation or source/config change.

This confirms secondary authorization, not yet an authenticated B tool result. Operator did not separately report isolated-session completion/step-by-step UI details; those are not invented. Request one get_profile invocation through the secondary-connected ChatGPT session, expected MFD STAGING B/revision1, without reconnect/permission changes. Primary previously returned A. A/B retrieval acceptance remains pending this actual result; direct API and unobserved lifecycle tests remain distinct.


## S8 secondary actual profile result and final review

Operator reports existing secondary-connected ChatGPT returned MFD STAGING B, revision1. Earlier primary calls returned A/revision1. Independent final checks match both exact owner-bound profile-only grants and OAuth session owners to the original restricted UUIDs, with users2/identities4/client1 and both fixtures unchanged. This supports per-account expected-profile isolation in the reported client flow; arbitrary cross-owner API denial is a distinct unperformed test.

Final Cloudflare readback: version40f41d56-fe97-446a-8778-3d815ebc688c at100%, deployment39ebebd3-192f-436f-b5fb-10ed772eb88e, same namespace, exact origin, application writesfalse, workers.devON/previewsOFF. Fresh database writesfalse/signupclosed/Googleenabled confirmed. Final boundary digest equals61546963f7d66d8637dccbd22b0cd61b. Security/performance findings and costs/limits are summarized at the top. No mutation in this final review. No claim of full negative/lifecycle completion; no further routine confirmation or approval requested.
