# Phase C.0 — Hosted staging security preflight

Date: 2026-10-27 (Europe/Berlin). **Read-only preflight completed; deployment approval withheld pending the findings below.** Phase B.1 acceptance remains valid for its dependency scope, but does not establish hosted schema/configuration readiness.

Only Supabase project `gngnrmzeghjzqsmzuktl` and Site `appgprj_6ae0ae64c4e88191a385d9bdb6dc37c5` were inspected. No production project was queried or modified. No hosted settings, users, records, OAuth grants, keys, deployments, access controls, resources, commits or pushes were changed. No bypass token or source-write credential was requested. This report is the only non-ignored file added by C.0.

Status meanings: **PASS** = evidence meets the stated check; **FAIL** = observed mismatch/security deficiency; **NOT CONFIGURED** = observed missing/disabled component; **NOT VERIFIED** = insufficient authorized evidence. A disabled component can be both an expected current safety condition and unavailable for future OAuth acceptance.

## Decision

**Do not deploy the current full application yet.** Core MCP SQL exists and the active settings target staging with writes disabled, but the hosted project lacks the current diary save RPC and the rest of the application schema/storage. Excess database privileges need review. Several Auth configuration controls and private MCP transport compatibility remain unverified. No remediation was applied.

Next approval should cover a reviewed staging-only schema/privilege remediation plan and completion of manual configuration checks. Publication, OAuth enablement, hook activation, client registration, synthetic account creation, commits and pushes remain separately approval-gated.

## Status matrix

| Check | Status | Evidence / implication |
| --- | --- | --- |
| Git branch | PASS | `staging/mfd-oauth-testing`, tracking its matching origin branch. |
| Working-tree scope | PASS | 54 pre-existing changed paths: 32 tracked modifications/deletion and 22 untracked additions; none staged. All map to Phase B/B.1. Inventory below. |
| Unrelated frontend/design work | PASS | No `frontend/` source changes. Generated React/barcode/SDK/service-worker files are expected builds. |
| Credentials/local state in candidate source | PASS | No actual secret-shaped key/private-key/GitHub-token matches in changed files; no new env/key files. Public publishable key remains unchanged. This scan is not a universal secret-detection guarantee. |
| Supabase identity/health | PASS | Exact staging ref; name `MFD OAuth Phase 2 Testing`, `ACTIVE_HEALTHY`, eu-central-1, PostgreSQL 17.11.0.003. |
| Workspace + MCP schema | PASS | `public.forma_workspaces`, `mfd_mcp.clients/settings/grants/proposals` exist with required columns, ownership, checks, keys and indexes. |
| Current diary save RPC | FAIL | `public.forma_save_workspace_v2(jsonb,bigint)` is absent. `public/legacy/cloud.js` uses it. Only the older save RPC exists. |
| Rest of existing application schema | FAIL | Ten repository public tables, private/social/observability support and storage buckets are missing; details below. |
| Existing workspace RLS | PASS | Owner SELECT/INSERT/UPDATE/DELETE policies; UPDATE has USING/WITH CHECK; restrictive OAuth client_id exclusion has both predicates. |
| Existing private MCP RLS/ACLs | PASS | Four tables have RLS; anon/authenticated have no direct table grants. Only auth-admin SELECT policies exist for clients/settings. |
| OAuth storage restriction | PASS | `storage.objects` has restrictive `mcp_no_direct_access` for authenticated OAuth client claims. No buckets exist to exercise normal storage behavior. |
| Workspace table least privilege | FAIL | authenticated has `TRUNCATE`, `REFERENCES`, `TRIGGER` beyond intended DML. TRUNCATE/REFERENCES are outside RLS. No destructive test was performed. |
| Default grants for future objects | FAIL | public-schema default ACLs for postgres/supabase_admin grant broad table privileges and function execution to anon/authenticated. New migrations must explicitly restrict these. |
| Existing function definitions/privileges | PASS | Four relevant function bodies match local SQL after removing whitespace; EXECUTE/security mode/search_path reviewed below. |
| Exact hosted exposed API schema list | NOT VERIFIED | No pgrst.db_schemas value in queried database/session role settings; complete list needs Data API dashboard verification. |
| Private MCP schema rejected by REST | PASS | Read-only zero-row probe with Accept-Profile=mfd_mcp returned 406/PGRST106 `Invalid schema: mfd_mcp`; a nonexistent control schema was also rejected. |
| Auth email/anonymous/provider settings | PASS | Public settings endpoint: email=true, anonymous=false, Google=false, email auto-confirm=false, signup not disabled. No signup/login was attempted. |
| Auth Site URL and exact redirect allowlist | NOT VERIFIED | Not returned by connected tools or public Auth settings. Manual checks required. |
| OAuth issuer metadata | PASS | OIDC metadata issuer is exactly `https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1`. |
| OAuth Server activation | NOT CONFIGURED | OAuth authorization-server discovery aliases return 404 `feature_disabled`: `OAuth server is disabled`. Left disabled as instructed. |
| Native OAuth client registration | NOT CONFIGURED | Zero active rows in auth.oauth_clients; zero dynamic registrations currently stored. No client created. |
| MCP client allowlist | NOT CONFIGURED | mfd_mcp.clients has zero rows. No client currently gains diary access. |
| Dynamic registration setting | NOT VERIFIED | Zero dynamic clients does not prove that the registration setting is disabled. Check dashboard. |
| Custom Access Token hook implementation | PASS | mfd_mcp.access_token_hook exists, body matches local SQL, only auth-admin has EXECUTE, required read policies/privileges exist. |
| Hook enabled/bound in Auth | NOT VERIFIED | Function existence does not establish activation or binding. Public settings expose no such field. |
| Published asymmetric verification key | PASS | JWKS returns one ES256/EC signing key. No private key was read. |
| Active JWT signing selection/rotation | NOT VERIFIED | JWKS alone does not prove which algorithm currently signs newly issued tokens or whether legacy signing is still active. No token issued. |
| Active database resource URI | PASS | settings row id=true contains exact staging `/mcp` resource. |
| Database resource column default | FAIL | Hosted default still names the old production Site origin; local SQL now defaults to staging. Active row is correct, so this is reset/recreation drift rather than an observed active production connection. |
| Worker write switch | PASS | Stored Site runtime MFD_MCP_WRITES=`false`; local deployment config also false. Runtime is not live yet. |
| Database write switch | PASS | mfd_mcp.settings.writes_enabled=false. |
| Site environment/code identity match | PASS | Seven stored MFD variables match the unchanged tracked deployment configuration, including publishable-key equality without exposing its value. |
| Site privacy | PASS | Owner role, custom access, one allowed owner, no groups or external visitors. No audience change. |
| Site publication | NOT CONFIGURED | version=0, no live/preview URL; Site remains unpublished. |
| Private MCP client access | NOT VERIFIED | Connector refuses MCP connection details until publication. Unauthenticated reserved-origin discovery returns 401 HTML and GET /mcp returns 404; neither proves usable MCP transport. |
| Native Sites MCP provisioning | NOT CONFIGURED | `.openai/hosting.json` has only project_id, no `mcp` capability. Current integration instead implements independent Supabase OAuth. Do not add a capability or replace authentication blindly. |
| Rebuild/isolation code path | PASS | Root build rebuilds browser and Worker, replaces selected output, removes static HTML entry files, then scans output. Source manifest declares Worker rather than static hosting. |
| Current deployable-output scans | PASS | public 37 files, hosting/dist 169 files, .sites-runtime/phase-b-dist 167 files: no forbidden production project references. No build run in C.0. |
| Old root dist fit for deployment | FAIL | It remains the old tracked static snapshot; no `dist/server/index.js`, and it contains production references. Never serve it. |
| Exact future source/package provenance | NOT VERIFIED | No approved commit/source synchronization/archive exists. Only GitHub origin is configured; Site source-write flow was not opened. Helper auto-staging needs the controls below. |

## Hosted schema and security evidence

Read-only SQL used explicit `BEGIN TRANSACTION READ ONLY` / `COMMIT`, selecting metadata, function source hashes, settings values, and OAuth-client/bucket counts. No workspace payloads, user identities, passwords, client secrets, signing secrets or authorization codes were selected. No impersonation, RPC execution, consent or mutation test occurred.

### Existing components

- public.forma_workspaces has UUID user ownership/FK, JSON-object payload check, 8 MB limit, positive revision and timestamps.
- MCP tables have their expected primary/FK/check constraints, ten-minute proposal expiry, false approval/consumption defaults and proposal user/client indexes.
- Table owners are postgres; RLS is enabled but not forced. The intentional SECURITY DEFINER dispatcher must therefore enforce ownership/session/consent itself. Its installed body matches the reviewed local implementation.
- No public/MCP views or extra application SECURITY DEFINER RPCs were found. Storage system functions are outside this application-function inventory; the project security advisor and targeted storage policy were checked.
- anon/authenticated cannot CREATE in public. anon does not have TRUNCATE on workspace. authenticated does have TRUNCATE/REFERENCES/TRIGGER; do not interpret successful ordinary RLS checks as protection against those extra privileges.

[PostgreSQL's row-security documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) explicitly excludes whole-table operations such as TRUNCATE and REFERENCES from RLS. The observed privilege excess is a least-privilege failure; this preflight did not demonstrate an HTTP/RPC route that invokes TRUNCATE, and no truncation was attempted.

### Missing components required by the current application

These public tables are absent:

- mfd_profiles
- mfd_friendships
- mfd_blocks
- mfd_social_workouts
- mfd_messages
- mfd_reactions
- mfd_catalogue
- mfd_catalogue_reports
- mfd_workout_photos
- mfd_catalogue_photos

`mfd_private` and `mfd_observability` are absent. The v2 save/observability RPC is absent. Storage has **zero buckets**, so `mfd-avatars`, `mfd-workout-photos`, and `catalogue-photos` are not configured. Current profile, catalogue, social/photo and workspace-sync behavior cannot be treated as functional against this minimal project.

Relevant reviewed repository sources are database/social.sql, shared-catalogue.sql, social-photos.sql, catalogue-photos.sql, private-photo-metadata.sql, private-exercises.sql and sync-observability.sql. They are reference/install scripts, not authorization to run them. Some include backfills or scheduled jobs; prepare a staging-only, non-destructive change set rather than applying the entire collection blindly.

**Order matters:** database/mcp.sql installed restrictions on tables present at installation time. Adding the missing tables later will not automatically create their OAuth restrictions. A remediation must install their normal owner/social policies and explicit restrictive OAuth policies before any OAuth client can use them; inventory callable privileged functions again. Do not rerun the existing non-idempotent MCP installer.

### Installed function privileges and body comparison

Whitespace-normalized source MD5 values were computed independently from local SQL and hosted pg_proc.prosrc. These are source-comparison checks, not authentication/signature hashes.

| Function | Security mode / execution | Source MD5, matches local |
| --- | --- | --- |
| public.forma_save_workspace(jsonb,bigint) | INVOKER; authenticated/service_role; no anon; empty search_path | b5f2f2a43a916cd5f36251a1e10eb0b0 |
| public.mfd_mcp(text,jsonb) | INVOKER; authenticated; no anon; empty search_path | c0586b393b1d82332c88f1b1123f57c5 |
| mfd_mcp.dispatch(text,jsonb) | DEFINER owned by postgres; authenticated; no anon; empty search_path | 5746d0b1b36036343df0696e0c5429a4 |
| mfd_mcp.access_token_hook(jsonb) | INVOKER; supabase_auth_admin only; empty search_path | 9fde3c29dc02c1313687ce426b5d1237 |

The dispatcher checks auth.uid(), the live auth.sessions row, registered client, current audience and live consent; approval/application are isolated and revision-bound. Hook activation is a separate unverified Auth setting.

### Security advisor

The connected advisor returned two INFO findings: RLS enabled without policies on mfd_mcp.grants and mfd_mcp.proposals. This is consistent with deliberate no-direct-table access and use of the dispatcher, not a reason to add broad client policies. No WARN/ERROR was returned in that response, but that is not a complete security certification and did not detect the privilege excess above. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Auth, issuer, resource and private Site

Expected values match the stored Site runtime and active database row:

| Setting | Expected / observed |
| --- | --- |
| Supabase project URL | https://gngnrmzeghjzqsmzuktl.supabase.co |
| OAuth issuer | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1 |
| Reserved Site origin | https://mfd-oauth-testing.paleriver512.chatgpt.site |
| MCP resource | https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp |
| Consent path intended by code | /oauth/mcp/consent |
| Worker / DB write switches | false / false |

OIDC discovery returns issuer/endpoints even while OAuth-server discovery returns feature_disabled. OIDC metadata lists S256 and plain PKCE and multiple signing algorithms; those are advertised capabilities, not proof of a client's enforced PKCE or the current signing choice. Future test clients must use S256; verify rejection of plain/missing PKCE during approved OAuth acceptance. [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

The Site is owner-private but unpublished. `get_site(include_mcp_connection=true)` returned `Publish this Site before connecting its MCP server to Codex`; a subsequent basic read confirmed the private access policy and version 0. No bypass mechanism was generated or tried. Public reserved-origin probes are not evidence that a functional deployed server exists.

The installed Sites skill's native MCP integration provisions its own private-access/plugin mechanism when an MCP capability is published. MFD currently requires a separately verified Supabase bearer and section consent, supports its existing initialize-based protocol, and has no such capability declaration. A supported private client transport compatible with both layers must be established. Do not assume native provisioning will work, remove Supabase validation, make the Site public, or introduce bypass credentials. Any architectural/authentication change needs approval.

### Required read-only dashboard checks

The connected tools supply SQL/metadata but not full Auth management settings. The public settings endpoint cannot establish these items. Use only the staging project's dashboard; do not switch to another project.

1. [Data API](https://supabase.com/dashboard/project/gngnrmzeghjzqsmzuktl/integrations/data_api/settings): record the complete exposed-schema list. Ensure public is available as intended and mfd_mcp/mfd_private/mfd_observability/auth are not exposed. REST probing already rejected mfd_mcp, but did not reveal the complete list.
2. [Authentication](https://supabase.com/dashboard/project/gngnrmzeghjzqsmzuktl/auth), URL Configuration: read Site URL and exact redirect allowlist. Required staging origin/redirect are the reserved origin and its trailing-slash `/` URL. Local localhost redirects, if needed, must be separately reviewed; no production redirects or wildcard test shortcuts.
3. Authentication > OAuth Server: confirm it remains disabled; read intended authorization path, dynamic registration setting and any client settings. The observed active client count is zero. Do not enable or register anything in C.0.
4. Authentication > Hooks: read whether Custom Access Token is enabled and which function it selects. Intended function is mfd_mcp.access_token_hook. Do not activate/replace a hook in C.0.
5. Authentication > JWT Signing Keys: record the active algorithm, key state and rotation status, without exporting secrets. ES256 verification material exists, but active signing selection is not proven. OIDC ID tokens require asymmetric signing; do not rotate/change keys without approval.
6. Authentication > Providers / signup/security: confirm email confirmation, signup controls and desired provider settings. Public settings show email enabled, Google disabled and email auto-confirm disabled. Google is not required for an email-only test plan and must not be enabled implicitly.
7. Read the Sites project's owner-only access and runtime configuration again immediately before any later publication. Record the supported private MCP client-access procedure; current live transport is not verifiable before a deployment.

## Current working-tree scope and future commit controls

HEAD is `af8e4149cf3bee6de3c90e14bfb74dea92d556e9` (`Isolate private MFD OAuth staging configuration and preserve production defaults`). Branch is correct; no index entries are staged. The 54 existing paths map to the accepted Phase B/B.1 reports, including test additions, dependency locks, optional build evidence and the generated barcode chunk replacement. No unrelated source work was identified. The generated chunk deletion/addition is expected, not a removed feature.

The inventory below is an explicit candidate review list, **not a staged commit**. A future commit must recheck it, include the new C.0 report if approved, and stage explicit paths rather than indiscriminately adding the entire workspace. Ignored tool state, installed dependencies, restored media and env files must stay excluded. No frontend source or tracked root dist changes currently exist.

| Initial status | Path |
| --- | --- |
| Modified | `.github/workflows/ci.yml` |
| Modified | `.gitignore` |
| Modified | `README.md` |
| Modified | `database/mcp.sql` |
| Modified | `docs/MCP.md` |
| Modified | `docs/STAGING.md` |
| Modified | `hosting/cloudflare-env.d.ts` |
| Modified | `hosting/eslint.config.mjs` |
| Modified | `hosting/package.json` |
| Modified | `hosting/pnpm-lock.yaml` |
| Modified | `hosting/pnpm-workspace.yaml` |
| Modified | `hosting/scripts/connector-preview/protocol.mjs` |
| Modified | `hosting/vite.config.ts` |
| Modified | `hosting/worker/index.ts` |
| Modified | `hosting/worker/mcp-consent.ts` |
| Modified | `hosting/worker/mcp.ts` |
| Modified | `hosting/worker/mfd.ts` |
| Modified | `package-lock.json` |
| Modified | `package.json` |
| Modified | `public/legacy/vendor/barcode.js` |
| Modified | `public/legacy/vendor/supabase.js` |
| Deleted generated chunk | `public/react/esm-Q25AYMRA.js` |
| Modified | `public/react/main.js` |
| Modified | `public/sw.js` |
| Modified | `public/vendor/barcode.js` |
| Modified | `public/vendor/supabase.js` |
| Modified | `scripts-build-hosting.cjs` |
| Modified | `scripts-build-react.cjs` |
| Modified | `src/environment.ts` |
| Modified | `tests/mcp-database.cjs` |
| Modified | `tests/mcp-server.cjs` |
| Modified | `tests/muscle-stats.cjs` |
| Untracked addition | `.nvmrc` |
| Untracked addition | `docs/PHASE-B-DEPENDENCY-AUDIT.md` |
| Untracked addition | `docs/PHASE-B-REPORT.md` |
| Untracked addition | `docs/PHASE-B1-ADVISORY-TRIAGE.md` |
| Untracked addition | `docs/PHASE-B1-BUNDLE-INVENTORY.json` |
| Untracked addition | `docs/PHASE-B1-REPORT.md` |
| Untracked addition | `hosting/lib/connector-contract.mts` |
| Untracked addition | `hosting/lib/connector-errors.mts` |
| Untracked addition | `hosting/scripts/vite/dependency-manifest.mjs` |
| Untracked addition | `hosting/worker/assets.d.ts` |
| Untracked addition | `hosting/worker/auth-types.ts` |
| Untracked addition | `public/react/esm-5SK6SCDV.js` |
| Untracked addition | `scripts-build-barcode.cjs` |
| Untracked addition | `scripts-restore-media.cjs` |
| Untracked addition | `scripts-smoke-staging.mjs` |
| Untracked addition | `scripts-verify-staging.cjs` |
| Untracked addition | `tests/barcode-compatibility.cjs` |
| Untracked addition | `tests/database-rls.cjs` |
| Untracked addition | `tests/hosting-dependency-compatibility.cjs` |
| Untracked addition | `tests/no-network.cjs` |
| Untracked addition | `tests/run-local-checks.cjs` |
| Untracked addition | `tests/staging-artifacts.cjs` |

### Important packaging/commit hygiene finding

The installed Sites source workflow helper's `saveSource()` performs `git add --all`, commits if necessary, and pushes. Running it is not a read-only packaging check. It was not invoked.

A normal `MFD_BUILD_OUTPUT=dist npm run build` replaces the old **tracked** dist tree even though `.gitignore` contains /dist/. That will create additional generated-output changes beyond the 54-path inventory. An automatic source helper commit could include those changes. Before using it, choose and approve an isolated, curated Site source checkout/output strategy or explicitly review the generated dist changes as part of the candidate tree. Do not silently untrack/delete retained media or rewrite history to solve this. Current GitHub origin is not evidence of a configured Sites source remote; no Site write credential was requested to discover one.

## Rebuild and old-artifact exclusion

- package.json build runs scripts-build-react.cjs followed by scripts-build-hosting.cjs. Browser/SDK/barcode/service-worker assets are rebuilt from the shared staging config.
- scripts-build-hosting.cjs copies current public assets, runs the hosting framework build, replaces the selected output with hosting/dist, removes client/index.html and client/legacy/index.html, then runs scripts-verify-staging.cjs.
- With no output override, output is root dist. B.1 deliberately used .sites-runtime/phase-b-dist to preserve the historical tracked tree.
- Current .sites-runtime/phase-b-dist has server/index.js, ASSETS with run_worker_first=true, no static hosting declaration and no static HTML entry files. Current hosting/dist retains those HTML asset copies and is for local preview; use the root-script postprocessed output for the deployment archive.
- Source .openai/hosting.json contains only the exact staging Site ID, no `static` field. The installed Sites preparer therefore requires dist/server/index.js. The old root snapshot has no such file, so it is rejected as a Worker by that preparer, rather than safely usable as a static alternative.
- build-site.mjs runs this project's package build script. site-workflow.mjs accepts optional ordered commands; it does not make a fresh build inevitable if the caller omits them. Future publication must include the explicit build and scan commands below, then inspect the exact archive. An end-to-end source-save/package/deploy run is NOT VERIFIED in C.0 because it would require unauthorized Git/hosted changes.

Do not serve the old dist, omit the mandatory rebuild, introduce static hosting as a workaround, copy old JavaScript from dist into public, or assume an independently scanned local folder is the artifact a future deployment will use.

## Required changes, proposed only

These changes need approval and a concrete reviewed staging-only change set; none were executed:

1. Install the missing application tables, storage buckets/policies, v2 save/observability support and associated functions/triggers without importing real accounts/data. Preserve existing workspace rows and revisions; avoid blanket backfills that rewrite existing payloads. Verify any scheduled-job prerequisites without enabling paid resources.
2. Apply explicit ownership/RLS and restrictive OAuth policies to every newly created exposed table/storage path, and inventory all callable functions again. Existing MCP restrictions are not automatically inherited by new tables.
3. Revoke the unintended authenticated TRUNCATE/REFERENCES/TRIGGER privileges and review the broad public-schema default ACLs. Preserve required browser DML/RPC access. Do not execute destructive probes to validate this.
4. Align the hosted resource_uri column default with the staging resource while preserving the already-correct settings row and writes_enabled=false.
5. Complete the manual Auth/exposed-schema checks. Propose exact URL/redirect corrections only if a mismatch is observed; do not assume they are wrong. Later OAuth client/path/hook configuration and asymmetric signing selection require separate approval after initial publication, in the order described in STAGING.md. Keep OAuth disabled for the initial publication.
6. Resolve private MCP client access and the source/archive workflow before attempting an OAuth connection. No authentication redesign or audience change is approved.

## Exact staged deployment checklist — future approved execution only

### Gate 1: hosted blockers and scope

- [ ] Review/approve a non-destructive staging-only schema/grant/default remediation plan; apply nothing to any other project.
- [ ] After separately approved remediation, re-run read-only table/function/policy/ACL checks; verify v2 save RPC and all ten missing public tables/buckets/support schema are present, no excessive grants remain, and new tables have OAuth restrictions.
- [ ] Complete the manual dashboard checks above and record evidence. Keep OAuth disabled, native/client allowlists empty unless separately approved later, and both writes-disabled switches false.
- [ ] Agree the supported private-access/MCP transport and future test client/callback. Do not solve a private-access failure by changing Site audience or bypassing authentication.
- [ ] Approve a source-checkout/output strategy that prevents helper auto-staging unrelated or unreviewed generated output. Refresh branch/status and explicit candidate inventory; verify no credentials/local env/state enter it.

### Gate 2: reproduce and inspect the exact artifact

Select Node 22.13.1 from .nvmrc in the approved build/source workspace. The following commands are a checklist, not commands executed by C.0:

```sh
npm ci --engine-strict
npx --yes pnpm@11.25.0 --dir hosting install --frozen-lockfile --strict-peer-dependencies --config.engine-strict=true
node scripts-restore-media.cjs
MFD_BUILD_OUTPUT=dist MFD_DEPENDENCY_MANIFEST=staging npm run build
npm run test:local
npx tsc -p frontend/tsconfig.json --noEmit
npx tsc -p hosting/tsconfig.json --noEmit --incremental false
npm --prefix hosting run lint
node scripts-verify-staging.cjs public dist
npm audit
npx --yes pnpm@11.25.0 --dir hosting audit
```

- [ ] Confirm 31 tests pass and root audit remains clean. Inspect the unfiltered hosting audit; B.1 accepted one documented development-only moderate finding, not future/new findings. Check the unchanged CI high/critical gate separately.
- [ ] Require dist/server/index.js, correct Site ID, Worker metadata and ASSETS binding; no `static` declaration. Require dist/client/index.html and dist/client/legacy/index.html to be absent.
- [ ] Verify staging issuer/resource and both write switches against runtime variables again. Inspect the actual archive contents and scan that exact extracted output for production references/secrets; match its provenance to the approved source SHA. Never package the old snapshot or the unprocessed preview directory.
- [ ] If using Sites helper ordered commands, include `node /Users/prasanthnammi/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/scripts/build-site.mjs` followed by `node scripts-verify-staging.cjs public dist` with output targeting dist; never omit the build merely because an older check passed. First resolve Gate 1's auto-commit issue.
- [ ] Refresh the candidate source tree after build. Any additional generated-output changes require explicit review before staging. Source synchronization/commit/push helper invocation needs its own approval; never merge into main.

### Gate 3: publication approval and post-publication verification

- [ ] Obtain explicit commit/push/source synchronization approval and explicit private staging publication approval. No such permission is granted by this checklist.
- [ ] Preserve Site ID, owner-only custom access, seven verified staging runtime variables and writes=false. Use only the saved version matching the approved pushed source/archive; use the owner-private publication operation.
- [ ] Observe successful deployment and verify the served artifact identity, security headers, discovery resource/issuer, private visibility and missing-bearer behavior. Do not generate bypass tokens or expose the Site to make probes pass.
- [ ] Stop before OAuth enablement/hook activation/client registration/account creation. Request the separately scoped approval described by STAGING.md; only then run the real hosted authorization/refresh/revocation/account-isolation/concurrency matrix.

**Current approval boundary: stop here.** The report records PASS/FAIL/NOT CONFIGURED/NOT VERIFIED findings and proposed next actions. No code/frontend, hosted state, user data, commits or deployment was changed by C.0.
