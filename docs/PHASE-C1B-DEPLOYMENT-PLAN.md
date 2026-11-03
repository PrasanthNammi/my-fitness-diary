# Phase C.1B — Final deployment preparation

> Consolidated execution authority and ordering: [PHASE-C1B-FINAL-EXECUTION-CHECKLIST.md](PHASE-C1B-FINAL-EXECUTION-CHECKLIST.md). This report is retained as supporting/historical evidence; use the consolidated checklist for future execution review.

Date: 2026-10-29 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**NO-GO for deployment now. Preparation and local verification are complete; Cloudflare authentication/account authority and the real ChatGPT client/callback/bootstrap sequence remain unresolved.** This task authorized no hosted mutations. No Worker/namespace, OAuth client, account, configuration change, audience transition, deployment, commit, push or PR was created. Production was not contacted. Existing uncommitted changes and backups were preserved. The private Site remains unchanged and unpublished.

**Later readiness recheck:** see [PHASE-C1B-READINESS-RECHECK.md](PHASE-C1B-READINESS-RECHECK.md). Cloudflare login/account/subdomain/inventory checks now pass. The historical unauthenticated result below is superseded; the user has now verified the exact ChatGPT callback/public-client settings and the recheck selects preregistration before the full Worker. The recheck also records user-verified active ES256 signing and a matching-algorithm public JWKS; other Auth management evidence, assigned client ID and execution approvals remain pending.

## Readiness checklist

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Branch and working tree | PASS | Correct staging branch; index empty; existing candidate work retained. |
| Cloudflare authentication | FAIL | Installed Wrangler 4.151.0 `whoami --json` returns loggedIn=false. Account-verification portion stopped; no login initiated. |
| Account ID, permissions, script availability | NOT VERIFIED | Cannot inspect authenticated account, selected subdomain, script inventory or provisioning authority. No creation probe. |
| Free plan / SQLite support | PASS for documented platform support | User previously confirmed Free, subdomain shanustylish777.workers.dev, no existing Workers/DOs/payment method. Account-specific capability remains unverified. |
| Staging identity/health | PASS | Explicit get_project only for gngnrmzeghjzqsmzuktl: MFD OAuth Phase 2 Testing, ACTIVE_HEALTHY, eu-central-1, db.gngnrmzeghjzqsmzuktl.supabase.co, 17.11.0.003. |
| C.0.1 application catalog | PASS | Fresh read-only digest 086a87995f52cf1a0b7e44fb904b7575 matches approved final catalog, including function definitions/rights, policies, indexes, triggers and buckets. No installer replay. |
| Ownership/RLS/excess powers | PASS | All 16 application/MCP tables postgres-owned with RLS. Authenticated has no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on them. |
| Existing MCP functions | PASS | Reviewed four normalized body hashes, modes, empty search paths and ACLs match. Hook execute limited to owner/auth-admin; dispatcher to owner/authenticated. No replacement. |
| Storage | PASS | Catalog confirms nine ordinary policies plus preserved restrictive OAuth policy and three private buckets with exact MIME/size limits. postgres policy delegation still lists objects/buckets. |
| Data API settings | PASS — manual evidence | User confirmed current exact public,graphql_public allowlist and automatic exposure disabled in this turn. SQL setting remains null; not independently retrieved. |
| Private schemas | PASS | Fresh zero-row REST probes reject mfd_mcp, mfd_private, mfd_observability and auth with 406/PGRST106; nonexistent control also rejected. |
| Database writes/resource | PASS | writes_enabled=false; current resource remains the private Site /mcp. Users, MCP clients and grants each zero. |
| Application writes/private Site | PASS | Sites runtime revision 1 MFD_MCP_WRITES=false; staging identity. Site version 0, no live URL. No deployed independent Worker exists. |
| OAuth server | NOT CONFIGURED | Fresh discovery returns 404 feature_disabled. Left disabled. |
| Signing/hook/URLs/DCR settings | NOT VERIFIED | ES256 JWKS exists; this does not prove active signing, hook binding, exact Auth URLs or disabled DCR. Dashboard review required before approval. |
| Client registration and callback | NOT VERIFIED | No real client ID, callback, selected token authentication method or actual ChatGPT linking acceptance. No guesses/registrations. |
| Backup integrity | PASS | Both hashes match recorded values; pg_restore 17.11 fully read both archives to /dev/null successfully. Earlier local restore evidence retained; no new restore performed. |
| Local verification | PASS | 37/37 files, types, lint, builds, artifact scan, native SQLite concurrency/restart; details below. |
| Hosted CPU/logs/quota behavior | NOT VERIFIED | Local runtime does not establish Free CPU compliance, provider log retention/redaction or actual metered SQLite costs. |
| Release provenance | NOT VERIFIED | No approved final account/client-filled config or immutable release package. No commit/source synchronization authorized. |

Read-only security advisor returns the same three INFO notices for private grants/proposals/sync_totals RLS without direct policies. This is intentional no-direct-client access; no WARN/ERROR returned. Do not add permissive policies to silence them. Scope is the reviewed application catalog, not every provider-managed object.

## Deployment inventory and security review

Selected architecture remains one independent Worker plus a private SQLite-backed AbuseCoordinator namespace. Supabase remains the sole issuer and application database. No Supabase Edge deployment, public limiter API, Sites authentication bridge, service-role credential, Redis or custom domain is needed.

| Item | Exact proposal |
| --- | --- |
| Worker | mfd-connect-staging |
| Origin | https://mfd-connect-staging.shanustylish777.workers.dev |
| MCP and sole audience | origin + /mcp |
| Public discovery | origin + /.well-known/oauth-protected-resource/mcp and /.well-known/oauth-protected-resource |
| Existing-user login/logout | origin + /login and /logout; / also serves login |
| Consent | origin + /oauth/mcp/consent |
| Connections/revocation | origin + /oauth/mcp/connections |
| Approval | /oauth/mcp/approve remains disabled |
| Issuer | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1 |
| Private binding | MFD_ABUSE → AbuseCoordinator |
| Migration declaration | mfd-c1b-v1, new_sqlite_classes=[AbuseCoordinator] |
| Fixed object name | mfd-staging-shared-v1 |
| Proposed config | hosting/independent/colocated-wrangler.example.jsonc |

The hostname is proposed, not assigned/verified. The config is deliberately not deployable: placeholder publishable key, empty clients/redirects, no verified account ID. Future release config must pin the approved account, use the actual staging publishable key and exact client/callback inventory, disable preview URLs, retain workers_dev=true with no extra routes, no source-map upload and observability disabled. Review provider infrastructure logs separately; application observability off is not a promise of no provider logging.

Required runtime variables: MFD_ENV=staging; MFD_SUPABASE_URL exact staging URL; MFD_OAUTH_ISSUER above; MFD_AUTH_ORIGIN exact proposed origin; MFD_MCP_RESOURCE_URL exact /mcp; MFD_SUPABASE_PUBLISHABLE_KEY existing staging public key; MFD_ALLOWED_CLIENT_IDS explicit JSON array; MFD_CLIENT_REDIRECTS exact per-client callback arrays; MFD_MCP_WRITES=false. No database password, client secret or privileged Supabase key belongs in the Worker.

Reviewed colocated-config/router/coordinator, service/auth handlers and shared MCP/consent boundaries. Exact origin and scalar audience are pinned, never selected from forwarded headers. Bearer is verified by pinned Supabase Auth before claims are used; subject, issuer, audience, role, expiry, client and session must match. Cookies never authenticate /mcp. Fixed data RPC independently checks live session, current section consent/client and derived owner. Assistant identity arguments cannot select another user.

Login uses existing-user password authentication, CSRF cookie/form binding and exact same-origin POSTs. Secure/HttpOnly/host-prefixed cookies, no-store, CSP, no-referrer and HTTPS origins remain. Native consent callbacks must match local exact inventory. OAuth client handles S256, state and applicable OIDC nonce; MFD does not become a token issuer. Native approval/local grant persistence is still nontransactional; partial failure requires revoke/reconnect. Metadata methods authenticate but do not independently check live DB consent; diary reads do. Native revoke failure cannot restore deleted local consent.

Every recognized route passes the same private object before upstream work. Missing binding, exception or two-second timeout returns denial, never a local-only fallback. Global 30/minute, MCP 25, auth 20, discovery 10 are UTC fixed windows. Four persistent counter rows contain no tokens/user IDs/IPs. Boundary bursts and shared-budget denial of service remain availability risks; this is staging protection, not fair per-user allocation.

## OAuth compatibility and required manual action

Current [OpenAI authentication guidance](https://developers.openai.com/plugins/build/auth) documents predefined clients alongside CIMD/DCR, S256 discovery and resource binding. Therefore DCR is not inherently required. That does not establish that this particular ChatGPT account/workspace interface offers predefined registration. MFD does not implement CIMD URL client IDs; do not enable CIMD/DCR as a workaround.

Before saving or connecting anything, inspect the actual ChatGPT MCP management interface and record:

- Proposed server name: MFD Staging; MCP URL: https://mfd-connect-staging.shanustylish777.workers.dev/mcp; authentication: OAuth.
- Whether predefined client credentials are supported, the exact callback shown, and the required token-endpoint authentication method. Do not select a universal callback from memory: callback-ID-specific versus stable callback depends on issuer identification support.
- Do not press Create/Save/Connect if it registers or initiates OAuth under this preparation authorization. If a draft cannot reveal the callback before an endpoint exists, stop for a separately approved bootstrap design; do not invent a client ID or relax startup validation.

Only after that review and separate approval: register the exact client in staging Supabase OAuth Apps, supply its assigned ID to the ChatGPT field and mirror it into MFD runtime/SQL client registry. If confidential credentials are required, place the secret only in the approved client's secure credential field, never in source, Worker config or chat. Public clients use none; confidential Supabase clients use client_secret_basic or client_secret_post as supported by the selected client. [Supabase registration guidance](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

Authorization-server metadata must publish the exact issuer, authorization/token endpoints, S256 and mutually supported token authentication method; verify actual issuer-response behavior before choosing callback mode. Protected-resource metadata points to that issuer and exact /mcp resource; 401 advertises its metadata URL. Keep identity scopes separate from MFD section consent. Users sign into their own MFD account at /login, explicitly consent, and the external client exchanges/refreshes tokens directly with Supabase. Each connection is scoped to that Supabase user, never the ChatGPT identity. Manage connections removes local consent first and then native grant; later acceptance must demonstrate old-token denial and refresh/reconnect behavior.

Future [Claude Code](https://code.claude.com/docs/en/mcp) and [Gemini CLI](https://geminicli.com/docs/tools/mcp-server/) configurations support OAuth client settings; each needs separately verified version/callback/registration/resource tests. This is not evidence of Claude web or Gemini web compatibility. Existing transport supports initialize-based 2025-03-26, 2025-06-18 and 2025-11-25; no SSE GET stream. Real clients must negotiate a supported version. No universal multi-provider compatibility is claimed.

## Proposed audience transition — NOT EXECUTED

File: database/staging/c1b-audience-transition.proposed.sql.
SHA-256: **1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590**.

Direct transition from https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp to the proposed Worker /mcp; never through the unused Edge audience. One BEGIN/COMMIT, timeouts/advisory lock, postgres/target/exposure assertions, settings lock and empty client/grant/proposal gates. It verifies one id=true row with writes=false and matching old default, updates only resource_uri/default, validates the final state and reloads PostgREST cache. Repetition is a no-op only when new row/default agree and inventory is still empty. Drift aborts. No user, hook, RLS, privileges, other settings or provider objects are changed. Operator assertions do not independently identify a project.

Future approved same-session assertions are mfd.c1b.target_ref='gngnrmzeghjzqsmzuktl' and mfd.c1b.exposed_schemas='public,graphql_public'. Execute the whole reviewed file only after external identity/exposure checks and checksum approval. It is deliberately outside automatic migrations; no generic db push/history repair. It must run before client/grant creation; later invocations with clients present intentionally fail.

Audience edits invalidate old-audience authorization at the new resource/DB but do not cryptographically revoke tokens. Refresh/reconnect must be explicitly tested. Rollback to the old audience could reaccept still-live old tokens; inventory/revoke affected sessions/grants under separate approval before any reviewed reverse compare-and-set transaction. No broad old/new audience array.

## Verification performed

| Check | Result |
| --- | --- |
| All local CJS tests | 37/37 PASS; includes MCP/auth/consent/RLS/isolation and new transition suite |
| Transition suite | PASS: target, false writes, nonempty clients, default drift, late UPDATE/DDL rollback, preserved fields, repeat |
| Frontend and Worker TypeScript | PASS |
| Hosting ESLint | PASS |
| Independent build | PASS; colocated output SHA 8a154eed107c482fe75bc6e29ae06bc3966d93b1945a14ae00b9f8fd371768b3 |
| Production-mode staging build | PASS to .sites-runtime/phase-b-dist; old root dist not served/replaced |
| Artifact scans | PASS: public 37, hosting/dist 169, selected staging output 167 files |
| Actual local HTTPS workerd + SQLite | PASS: auth/login/consent, protected MCP, old audience denial, cookie cannot authenticate MCP, owner injection/writes denied |
| Coordinated concurrency | PASS: 90 mixed requests, global admissions 30, four rows, denied requests make no extra upstream call |
| Full process restart | PASS: counters identical with retained state; no reset |
| npm audit | 0 findings |
| hosting pnpm audit | 1 moderate, 0 low/high/critical |

Remaining advisory is unchanged GHSA-67mh-4wv8-2f99 via Drizzle's development loader/esbuild 0.18.20, absent from inspected runtime bundles. No suppression, forced override, dependency or lockfile change. Sandbox DNS/listener failures were retried with approval; native checks and final audits succeeded. An initial fixture command used the wrong working directory and was corrected. Whole-tree git diff --check still flags pre-existing generated Supabase vendor whitespace; no unrelated generated code was reformatted. New SQL/test paths have no whitespace errors.

Local PostgreSQL tools formerly under /tmp were absent; installed pg_restore 17.11 successfully read the retained archives instead. No recovery evidence was discarded or relabeled as a new full restore. Logs are ignored under .sites-runtime/c1b; local SQLite evidence remains in .sites-runtime/c1a4. All emulators stopped. No real account flow, distributed hosted location test, CPU profiling or managed token lifecycle test is claimed.

## Recovery and operating cost

Backup directory: /Users/prasanthnammi/MFD-Staging-Backups/gngnrmzeghjzqsmzuktl-20261027T200208Z.
Application SHA: 8d11b21cce6c791b49a7178e6afaa3e0bf15e5dd25e8eaf35b38ed7399e2bc80.
Managed-definition SHA: a402dfec575b60459e711bb8df78e3165e2a1549d1be5371f3d41e1e1c83f55a.
Existing 17.11 disposable restore evidence remains usable within the accepted application-scoped, pre-remediation scope. These are not full platform backups or automatic rollback images. Never overwrite staging from them automatically.

[Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Free 100,000 requests/day, 10 ms CPU, 128 MB, 50 subrequests. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/): Free SQLite 100,000 requests/day, 13,000 GB-s/day, 5 million row reads/day, 100,000 writes/day and 5 GB storage. No purchase required by documented small-scale design, but no authenticated entitlement or measured CPU/billing guarantee exists. Existing Supabase Auth/DB/storage/egress quotas still apply; no Edge invocation charge for this MCP host.

At continuous full admission, 30/minute is 43,200/day and two logical counter upserts imply 86,400 logical row updates plus overhead. This is not proof of billable row counts: index writes and provider accounting must be measured before sustained traffic. Denied traffic still consumes Worker/DO requests. A small 50×20-tool/day scenario is about 30,000 tools/month plus auth/discovery/metadata; attacks or peak traffic can exceed quotas. Free exhaustion must deny service; no upgrade/paid fallback is authorized. No availability guarantee or zero-cost promise. Hosted metering/CPU/logging validation is mandatory during a bounded test, not general rollout.

## Ordered future execution and approval gates

1. **Read-only/user local action:** authenticate the existing Cloudflare account. From hosting/, use installed Node 22.13.1 and `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js login --use-keyring`, then `... whoami --json`. Complete the provider browser login yourself; do not send tokens. This authorizes the CLI, not resource creation. I did not run login. Select the verified existing account; record account ID, Free plan, subdomain, Worker inventory and namespace permissions. Stop on billing/upgrade prompts. No creation test.
2. **Read-only preparation:** obtain exact ChatGPT callback/client mode, Auth current URL/hook/signing/DCR evidence, refresh staging checks and verify recovery hashes. Finalize immutable bundle/source manifest and account-filled config; disable preview URLs. No automatic git add/commit/push helper. Review a stop procedure and configuration before-values.
3. **Approval gate:** approve exact artifact/config, account, Worker name and creation of one SQLite namespace/binding/migration, bounded public staging endpoint and emergency stop procedure. First deploy is a hosted mutation and is not authorized by this report. Provision the binding through that reviewed deployment; do not create arbitrary probe resources.
4. **Bootstrap ordering gate:** current startup requires real clients, but callback discovery may require a reachable server. If actual ChatGPT UI supplies callback before deployment, separately approve native client preregistration (without granting diary access) and configure that assigned ID before first release. If it cannot, prepare/review a distinct metadata-only fail-closed bootstrap release; none exists here. Do not seed invented IDs. No deployment until one sequence is concretely reviewed. Do not activate OAuth simply to discover an interface limitation.
5. **Approved Worker-only deployment:** after the preceding gate, deploy only the independent bundle and final isolated config, preserving class/binding/fixed object name. Record provider version/deployment/namespace IDs and exact source/archive checksums. Supabase OAuth and writes stay disabled; no Site change. Run bounded HTTPS metadata, missing/invalid bearer, origin, HTML/header/cookie and limiter outage/quota checks. No diary acceptance yet. Stop on DO init or CPU failure.
6. **Separate SQL approval:** fresh settings/default/client inventory and target/TLS checks; execute only the reviewed audience proposal before inserting the DB client allowlist. If native client preregistration occurred, verify it has no local consent; this SQL gates local clients/grants/proposals. Do not rerun C.0.1. Roll back and stop on error.
7. **Separate Auth/client approval:** record before-values, set Site URL to new origin, exact first-party redirect origin+/, Authorization Path /oauth/mcp/consent, reviewed hook binding and active asymmetric signing; keep DCR disabled. Any key rotation requires its own decision. Register the exact native client here if not preregistered; add only its exact ID to MFD's SQL allowlist and runtime inventory through a reviewed transaction/config update. No client secret in Worker. Verify discovery/resource/issuer consistency before account testing. Project-wide URL effects require review.
8. **Separate synthetic-user/test approval:** create only approved synthetic Alice/Bob staging accounts. Test real S256/missing-wrong verifier, state, exact callback/issuer/resource/signature/expiry, browser CSRF/cookies, live session/consent, each section and cross-account/direct REST/RPC/storage denials. Never use operator RLS bypass as acceptance.
9. **Approved ChatGPT connection:** enter the actual preregistered credentials and exact MCP URL, connect one synthetic MFD account, then another independently. Confirm no provider identity selects the diary owner. Test refresh rotation/reuse, grant removal, native revocation failure, logout/reconnect, concurrent requests and old-token denial. Keep writes false.
10. **Final read-only verification:** check policies/ACL/catalog/resource/false switches, advisors and quotas/CPU/logs; record provenance without unreviewed migration-history repair. Stop and report; broader rollout or other clients require separate approval.

First release has no previous good version. On deployment/DO initialization/auth/invalid audience/consent/revocation failure, stop acceptance and use the explicitly approved emergency route disable or deny-all release, preserving namespace/state. [Cloudflare documents disabling workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/); additionally disable previews/version/deployment URL access or ensure every remaining URL fails closed. Disabling workers.dev alone does not disable those other URLs. Do not delete the namespace or reset counters. For excessive limiting, stop/load-review/wait for the window; never raise caps or bypass the binding automatically.

For later code rollback, use a recorded known-good compatible version; [Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) does not undo SQLite data or independent Supabase settings. Retain the same DO class/schema/binding/name. Auth/audience reversions are separately reviewed compare-and-set changes with token reacceptance analysis. Local consent deletion precedes native revoke; if native revoke fails, keep data denied and perform approved recovery. No automatic database restore, policy removal or managed-role changes.

## Changed files and decision

Added this report, database/staging/c1b-audience-transition.proposed.sql and tests/c1b-audience-transition.cjs. No runtime security source, frontend, private Site manifest, dependencies, lockfiles, existing C.0.1 migration or hosted object was edited. Generated local build/evidence remains ignored; existing candidate assets were rebuilt through the authorized staging path.

**Required next actions:** local Cloudflare login and read-only account verification; actual ChatGPT callback/client-method evidence; Auth hook/signing/URL/DCR read-only review; concrete bootstrap/release config; scoped approvals for Worker/DO deployment, audience SQL, Auth/client setup and synthetic acceptance. Preparation is complete. **Do not begin controlled deployment until these gates pass.**
