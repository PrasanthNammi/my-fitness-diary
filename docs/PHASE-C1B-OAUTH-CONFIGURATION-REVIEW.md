# Phase C.1B — Final OAuth configuration review and execution gates

Date: 2026-10-29 (Europe/Berlin). **Preparation only. No hosted changes, user/client creation, login, OAuth activation, audience migration, deployment, commit/push or production access.** This is the current ordered configuration checklist; prior C.1B reports remain evidence/history. Target only gngnrmzeghjzqsmzuktl.

**Recommendation: conditional GO to approve the first audience-only transaction; NO-GO for automatic full rollout.** No action is authorized by this report. The actual native client ID and final deployable config cannot exist until separately approved registration; never invent them. Hidden disabled-state OAuth settings remain an explicit hold point.

## Fresh preflight

| Check | Result | Evidence |
| --- | --- | --- |
| Branch/index | PASS | staging/mfd-oauth-testing; index empty; prior uncommitted work retained |
| Staging identity | PASS | Exact get_project: MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, eu-central-1,17.11.0.003 |
| Approved accounts | PASS | Two confirmed non-anonymous users; UUID set exactly matches restricted primary/secondary mapping; two email identities, no Google identity |
| Sessions/client/consent inventory | PASS | Sessions0; native clients/authorizations/consents0; local MCP clients/grants/proposals0 |
| Signup/Google/anonymous | PASS | Fresh public settings disable_signup=true, Google=true, anonymous=false; email=true, mailer_autoconfirm=false |
| OAuth Server | PASS disabled | Discovery404 feature_disabled; no OAuth flow attempted |
| Site URL/redirects | PASS manual current evidence | User rechecked this turn: http://localhost:3000 and empty redirect list; nothing saved |
| Hooks | PASS manual current evidence | User rechecked this turn: no hooks configured |
| Authorization Path/DCR | UNKNOWN while server disabled | Actual saved path/toggle not observable from available tools; do not infer defaults or enable just to inspect |
| Signing | PASS within evidence limits | Fresh ES256/EC JWKS; prior user current ES256/P-256, previous HS256, no pending/standby. No newly issued token or fresh dashboard active-kid comparison |
| Database/resource/default | PASS | writes=false; row/default both old private Site /mcp; unchanged audience proposal hash |
| Stored application switch | PASS | Existing private Site runtime revision1 MFD_MCP_WRITES=false; no live independent Worker |
| Application catalog/functions | PASS | Digest086a87995f52cf1a0b7e44fb904b7575; dispatcher/hook/wrapper normalized source/mode/owner/search_path/ACL match reviewed baseline |
| Private schemas | PASS | Fresh zero-row REST406/PGRST106 rejects mfd_mcp/mfd_private/mfd_observability/auth; control also rejected |
| Exact exposed list/auto-exposure | Prior manual evidence | Last user confirmation public,graphql_public only and auto-exposure disabled; fresh REST rejection is not a full management-list read. Reconfirm before SQL assertion |
| Cloudflare | PASS read-only inventory | Verified account fa8205077c4bc4d2bb38ee035e74a156; subdomain shanustylish777; scripts/namespaces empty |
| Free entitlement | User-confirmed, API limitation | Earlier administrator membership/scopes verified; billing endpoint inaccessible to OAuth. Reconfirm Free/no upgrade before deployment |
| Recovery archives | PASS integrity | Both recorded archive hashes match; earlier application-scoped local restore evidence retained. Backups predate the two accounts and exclude managed Auth data; they do not recover these new users |

Only privacy-safe account metadata/counts were selected. Restricted current UUID comparison is under .sites-runtime/c1b-final-oauth/private (0700/0600), ignored; no emails/identity_data/passwords selected. No new account ownership claim beyond the user's manual provisioning confirmation.

### Security advisor finding requiring acknowledgement

Fresh advisor: three intentional private-table RLS-without-policy INFO notices plus **WARN auth_leaked_password_protection**. This is a fresh observed warning, not proof it arose from this phase. [Supabase password security](https://supabase.com/docs/guides/auth/password-security) states leaked-password protection requires Pro or above; no upgrade or feature enablement is authorized. Do not claim a clean advisor result or suppress it. The independent login retains password capability, and admin omission may internally generate a password; do not claim accounts are passwordless. Require owner confirmation that any deliberately supplied test passwords are unique/strong/private, retain signup closure and coordinated quotas, and explicitly accept residual password risk for a bounded staging rollout. This does not block the resource/default-only SQL, which introduces no password exposure. No passwords/hashes were inspected.

## Three separate OAuth boundaries — exact configuration

| Boundary | Client / credentials | Callback / purpose |
| --- | --- | --- |
| Google→Supabase first-party sign-in | Google Web client ID48312208925-bo2nhlk16thamusr7aui42ttonp9qn8c.apps.googleusercontent.com; Google secret stays in Supabase only | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/callback; user-confirmed Google project MFD OAuth Staging, Testing mode, approved test audience |
| Supabase→independent browser session | Worker uses existing staging publishable key, browser PKCE/state and verified first-party tokens, not a Google secret | https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback; general Auth redirect allowlist |
| ChatGPT→Supabase OAuth Server→MCP | New public native client, method none, no secret; ID assigned by Supabase after approved registration | https://chatgpt.com/connector/oauth/Xm83tVWz4VJh; exact native client callback, not a general first-party redirect |

Never place Google's client ID in mfd_mcp.clients/MFD_ALLOWED_CLIENT_IDS. Never replace ChatGPT's callback with /auth/google/callback or /oauth/mcp/consent. Do not place Google/client/service-role/management secrets in Worker/source/chat.

Expected final Supabase values:

| Setting | Proposed final value |
| --- | --- |
| Site URL | https://mfd-connect-staging.shanustylish777.workers.dev |
| General redirect list | https://mfd-connect-staging.shanustylish777.workers.dev/ and https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback |
| Signup / Google / anonymous | Disabled / enabled unchanged / disabled |
| OAuth Server | Enable only in approved setup window |
| Authorization Path | /oauth/mcp/consent |
| DCR | Explicitly disabled; stop before registration/flows unless read-back confirms this |
| Custom Access Token hook | Enable/bind existing mfd_mcp.access_token_hook; no source/ACL change, no replacement of an unexpected hook |
| JWT keys | Preserve current ES256 and previous HS256; no rotation/revocation/new key |
| Issuer | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1 |
| Native client | MFD Staging — ChatGPT; Public; none; sole exact callback above; assigned ID currently absent |
| Resource row/default | https://mfd-connect-staging.shanustylish777.workers.dev/mcp, writes=false |
| API exposure | public,graphql_public only; automatic new-table exposure disabled; private/Auth schemas excluded |

Google callback must preserve legitimate random state query in the real flow. Do not add wildcard redirects to make it pass. The existing independent Worker validates state/PKCE, continuation, verified subject and browser-session binding; no email-based ownership or automatic consent. Changing Site URL affects project-wide login/email redirects; with accounts now present, no password reset/invite/login flow should occur during setup. Manual endpoints, if ChatGPT requires them, are staging /auth/v1/oauth/authorize and /auth/v1/oauth/token; they do not bypass issuer/resource/PKCE/state validation.

## Audience SQL against two-user baseline

File database/staging/c1b-audience-transition.proposed.sql; unchanged SHA-256:

`1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590`

It updates only settings.resource_uri and its column default from https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp to exact Worker /mcp and notifies schema cache. It preserves other settings/writes, functions, users, identities, ACLs, RLS, storage and provider roles. One transaction, locks/timeouts, role/target/exposure assertions, exact one settings row/default and empty local-client/grant/proposal guards remain.

Two Auth users are compatible: they are not an empty-user SQL guard. Fresh external preflight must compare exactly the two approved UUIDs, not zero users. The local transition test now includes two synthetic Auth users and asserts they survive initial/repeated execution and guard/rollback checks. Only tests/c1b-audience-transition.cjs changed; migration/runtime code unchanged.

Old-audience private MCP data access will fail after commit. Audience edits are not cryptographic token revocation. There are no current sessions/client grants to migrate in this preflight; stop if that changes. Do not accept old/new audiences simultaneously. A reversal could reaccept old tokens later; review sessions/grants before a separately approved reverse CAS operation.

## Independent Worker release review

Proposal hosting/independent/colocated-first-deployment.proposed.jsonc has account fa8205077c4bc4d2bb38ee035e74a156; name mfd-connect-staging; main ../../.sites-runtime/independent/colocated-worker.js; compatibility_date2026-10-12; workers_dev=true; preview_urls=false; routes[]; upload_source_maps=false; observability.enabled=false.

SQLite binding MFD_ABUSE→AbuseCoordinator; migration tag mfd-c1b-v1 new_sqlite_classes=[AbuseCoordinator]; fixed object mfd-staging-shared-v1. One private coordinator, no public limiter API. Missing binding/timeout/storage error denies access; budgets global30/mcp25/auth20/discovery10 per fixed minute; four rows contain no identities/tokens. Daily ingress/exhaustion and fairness remain risks, never a paid/local-only fallback.

| Runtime variable | Exact value/source |
| --- | --- |
| MFD_ENV | staging |
| MFD_SUPABASE_URL | https://gngnrmzeghjzqsmzuktl.supabase.co |
| MFD_OAUTH_ISSUER | staging URL+/auth/v1 |
| MFD_AUTH_ORIGIN | exact Worker origin |
| MFD_MCP_RESOURCE_URL | exact Worker origin+/mcp |
| MFD_SUPABASE_PUBLISHABLE_KEY | Existing staging public publishable key; no privilege key |
| MFD_ALLOWED_CLIENT_IDS | JSON array of only actual approved native client ID, not yet assigned |
| MFD_CLIENT_REDIRECTS | That ID mapped only to exact ChatGPT callback |
| MFD_MCP_WRITES | false |

The proposal is field-complete but not a deployable release: placeholder key/client inventory must be resolved after approved registration, then actual config/artifact hashes reviewed. Do not replace the missing ID with a guessed value or Google's ID. Startup intentionally rejects empty inventory even for discovery; known ChatGPT callback allows preregistration without deploying a metadata-only workaround.

Routes: public well-known metadata aliases; protected /mcp; browser /,/login,/logout,/auth/google,/auth/google/callback,/oauth/mcp/consent,/oauth/mcp/connections; approval remains disabled. Browser cookie cannot authenticate MCP. Every data tool uses the fixed caller-token RPC with live session/client/consent/owner checks. Logs must not contain codes/state/headers/tokens/passwords; check provider retention/redaction separately from observability flag. Existing private Site remains unchanged.

## Exact ordered execution checklist — separate approvals

### A. FIRST narrowly scoped hosted operation: audience preparation only

- [ ] Obtain explicit approval for the exact SQL hash/project and expected old→new row/default; no other scope implied.
- [ ] Immediately refresh project, exactly two approved UUIDs/no sessions, zero native/local clients/grants/proposals, catalog/ACL/policies, false switches, old resource/default, recovery evidence and exact dashboard API exposure. Stop on drift. Reconfirm operator postgres authority; session assertions are not project identity.
- [ ] In one verified staging session set mfd.c1b.target_ref='gngnrmzeghjzqsmzuktl' and mfd.c1b.exposed_schemas='public,graphql_public' from independently verified facts. If using libpq require verify-full and approved CA; no credential-bearing command/log.
- [ ] Execute complete unchanged SQL. Verify row/default exact Worker /mcp, writes=false, same two UUIDs, unchanged catalog and zero sessions/clients/grants. Record provenance without generic db push/history repair.
- [ ] On pre-COMMIT failure ROLLBACK and stop; no permission/guard retry. After COMMIT issue: stop subsequent setup, retain false writes/OAuth disabled, prepare separately reviewed reverse CAS only if needed; no automatic restore or user deletion.

**Expected effect:** prepares the dedicated resource audience only; no reachable endpoint, Auth setting, user/client/token, diary grant or billable resource created. Existing unpublished private Site remains unchanged. Two users do not acquire new access. Incremental subscription cost $0; normal existing DB operations only. No Google login/readiness claim follows this step.

### B. Auth redirects and hook — explicit configuration approval

- [ ] Record current Site URL localhost:3000, empty redirects, no hooks; ensure no one is signing in during setup.
- [ ] Set only exact proposed Site URL/general redirects; enable/bind existing access-token hook after verifying source/ACL and no unexpected hook. Preserve provider credentials/Google/signup/keys/API exposure.
- [ ] Read back exact values; publicly verify signup true-disabled/Google true. No login probes. If any mismatch stop; restore only captured values under approved recovery scope. No key rotation or blanket config push.

### C. OAuth Server setup hold point — explicit activation approval

- [ ] Approve a bounded setup window with two existing users but no authorized flows. No cross-provider atomicity exists.
- [ ] Configure exact authorization path and DCR off using supported controls. If they are inaccessible while disabled, enable only as part of this approved setup, then immediately set/read-back path and DCR before any client registration/flow. Do not enable solely for inspection. If policy requires DCR verified off before enabling, resolve a supported preconfiguration path first; do not proceed under unknown exposure.
- [ ] Stop if path/DCR cannot be controlled/verified. An enable→disable recovery must be explicitly covered by activation approval; stop and request it if omitted. No automatic registration or allowlist assumption during this interval.
- [ ] Verify actual issuer/discovery/endpoints, S256 and compatible token methods; keep write switches false. Existing users could attempt a flow during setup, so maintain operator-only test discipline; absence of MCP clients/grants prevents established diary entitlement, not all public metadata/registration exposure.

### D. Native public client — explicit registration approval

- [ ] Reconfirm exact same ChatGPT draft callback and public method none. Register only MFD Staging — ChatGPT, Public, none, no secret, sole exact callback.
- [ ] Capture assigned ID and read back registration. Enable only required/advertised identity scopes consistently; do not invent diary scopes. Stop on wrong callback/method, unexpected client or any secret-required interface.
- [ ] Keep local mfd_mcp.clients empty until deployment checks. A native client alone gives no local section consent; hook may not set MCP audience until local registration. No account OAuth flow yet.

### E. Final release and first deployment — explicit artifact/resource approval

- [ ] Fill only actual assigned ID/callback and existing staging publishable key. Review immutable source/config/package manifest/hash and accepted advisor/password risk. No source synchronization/commit/push helper.
- [ ] Rebuild/recheck final real config, lockfile scope, no test harness/UUID evidence/secrets/old dist contamination. Current local SHA is evidence, not release approval.
- [ ] Reconfirm exact Cloudflare account/Free entitlement/hostname/inventory and approve one Worker/SQLite namespace migration/private binding, expected public surface and emergency-stop authority. Stop on billing/upgrade/permission prompts; do not create a probe.
- [ ] Deploy only exact reviewed package. Verify HTTPS, metadata audience/issuer, missing/invalid bearer, limiter outage/coordination, headers/caching, CPU/logging/quota behavior without real login. Record deployment/version/namespace IDs. First deployment has no earlier good version.

### F. Local MCP allowlist — separate SQL approval

- [ ] Prepare/review exact single assigned-ID insertion with drift checks, no grants. Apply only under its own approval after audience transition; validate native/runtime/local agreement and false writes. No C.0.1 replay or global permission changes.

### G. Google first-party acceptance — separate login/identity test approval

- [ ] Approve only the two controlled accounts, isolated browser profiles and exact callback/linking tests. Verify signup still disabled and expected two UUIDs first.
- [ ] Each Google sign-in must return its recorded UUID, user count2, one expected Google identity each; repeated login adds no duplicate user/identity. Sessions must remain owner-correct; stop on substitution/new UUID/link failure. Never reopen signup, change emails or fabricate identities.
- [ ] Test cancellation/state/PKCE/replay, cookies/CSRF, expiry/logout before ChatGPT linking. No diary fixtures unless separately approved. Provider Testing denial is not proof of Supabase unknown-user signup rejection; unapproved negative identity is not silently introduced.

### H. ChatGPT connection/data acceptance — separate consent/test approval

- [ ] Enter actual native ID, blank secret, none/S256, exact /mcp and callback. Prefer verified discovery; manual authorize/token paths are exact staging /auth/v1/oauth/authorize and /auth/v1/oauth/token only.
- [ ] Explicitly grant minimal sections for each owned MFD account; verify token alg/kid/signature/issuer/resource/client/session; tools cannot choose owner. Test revoked/missing consent, wrong audience/client/session and approved cross-account/direct API isolation.
- [ ] Test refresh rotation/reuse, native/local revoke partial failures and reconnect, real concurrency. Keep both writes=false; no mutation-tool activation. Stop/report before wider use or other clients.

## Emergency stop and recovery boundaries

Before E approve owner-dashboard disable workers.dev and the exact no-other-route/preview policy; verify alternate version/deployment URLs fail canonical-origin checks. If needed use a separately reviewed deny-all release retaining DO class/binding/namespace. Persist workers_dev=false in recovery config before redeploy to avoid re-enabling the route. Never delete namespace/reset counters or make private Site public. Supabase keys, RLS, Google and signup restrictions are not an availability workaround.

A/B/C/D reversions use captured before-values and separately approved scopes; no database restore. Native/client/user deletion is not an automatic cleanup. Code rollback preserves SQLite state and compatible class/binding/schema/fixed name; code rollback does not reverse Auth/audience settings. Restoring old audience can reaccept still-live tokens, so inventory/revoke under approval first. Excessive limiting/quota requires stopping/waiting/reviewing usage, not raising caps or buying a plan. Signup remains closed throughout; preserve the two accounts and backups.

## Fresh local verification and limitations

| Check | Result |
| --- | --- |
| Full test runner |38/38 PASS; includes two-Auth-user audience-preservation extension |
| Frontend/Worker types | PASS |
| Hosting lint | PASS |
| Independent and production-mode staging builds | PASS; selected .sites-runtime/phase-b-dist, old root dist not used |
| Artifact scans | PASS public37/hosting169/selected167 |
| Native HTTPS Google/auth/MCP | PASS with synthetic provider/token replies, real local SQLite gate; no hosted login |
|90 concurrent mixed-route checks | PASS global admissions30, four bounded rows, denied requests do not call upstream |
| Process-restart persistence | PASS with same local SQLite state |
| Root/hosting audits |0 /1 unchanged development moderate,0 high/critical |
| Security advisor |3 intentional INFO plus leaked-password-protection WARN; retained, no paid remediation |

Verified colocated bundle SHA: `553804ec71d01df3a60ecbc9b182a8eaabeee721e44f96d5a0ff1c694d714de0`.
Audience SQL SHA: `1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590`.

No dependency/runtime/SQL changes made in this review. Only the synthetic transition test, this report and the final-checklist link changed. Logs are ignored under .sites-runtime/c1b-final-oauth; private UUID evidence0700/0600, never release input. Both emulators stopped. Hosted CPU/limits/Google/Supabase PKCE/client compatibility/unknown-user denial remain NOT VERIFIED. Backup hashes match prior records; accepted backup scope does not include new Auth user data. Official references: [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [Cloudflare DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

**Final recommendation:** GO to seek explicit approval for A only, conditional on immediate exact-project/two-UUID/security/exposure/recovery revalidation. NO-GO for enabling OAuth, registering a client, or deploying the incomplete release under that approval. Stop now; no hosted execution authorized or performed.
