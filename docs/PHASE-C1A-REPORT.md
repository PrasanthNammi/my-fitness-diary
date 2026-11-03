# Phase C.1A — OAuth integration and private staging preparation

Date: 2026-10-28 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Local checks pass and the remediated staging database remains consistent. Private MCP deployment is blocked pending a supported transport/authentication integration decision. Phase C.1B publication or OAuth activation is not recommended yet.** No production readiness is claimed.

Only Supabase `gngnrmzeghjzqsmzuktl` and the existing staging Site were inspected. Hosted access was read-only: metadata, public discovery, zero-row REST probes and advisors. No migration, hosted configuration change, user/client creation, OAuth activation, write enablement, deployment, publication, commit, push, merge, paid resource or backup deletion occurred. Frontend source/design/functionality and production manifests were unchanged. The localhost preview was stopped after verification.

## Source and environment audit

- Correct branch; HEAD remains `af8e4149cf3bee6de3c90e14bfb74dea92d556e9`. Index empty. Existing uncommitted B/B.1/C changes were preserved. A future source commit requires a fresh explicit inventory and approval.
- Exact existing owner-private Site: `appgprj_6ae0ae64c4e88191a385d9bdb6dc37c5`; access policy revision 1, one owner, no groups/external visitors. Version 0, no live/preview URL. Reserved origin is not a deployment.
- Seven stored runtime entries, revision 1, match `.openai/environment.json`, including publishable-key equality. Required values are listed below. No privileged key is required by the application.
- `src/environment.ts` has no production fallback and rejects staging identity/issuer/resource/key/origin substitutions. Worker upstream requests use the selected staging URL and publishable key. Session migration remains disabled in staging.
- Source `.openai/hosting.json` and its hosting copy identify the staging Worker Site, without a static declaration or MCP capability. Neither manifest was edited.
- Ten candidate repository files contain the forbidden production ref. Four are the historical root `dist/` snapshot (`cloud.js`, `legacy/cloud.js`, both vendor Supabase copies); three are deny/assertion fixtures (`scripts-smoke-staging.mjs`, `scripts-verify-staging.cjs`, `tests/staging-artifacts.cjs`); three are retained production documentation/examples (`database/README.md`, `monitoring/README.md`, `monitoring/prometheus.yml.example`). The examples must not be used for staging monitoring/setup. No active inspected bundle contains the ref. Root `dist/` was neither rebuilt nor served.
- Active output inspection covered 373 executable/config/document files across `public` (37), `hosting/dist` (169), and `.sites-runtime/phase-b-dist` (167). Staging identity checks passed. Additional secret-marker checks found no secret Supabase key, private-key PEM or GitHub-token marker. This is a scoped scan, not proof against every possible secret format. Public publishable identifiers are expected in browser bundles.

## OAuth architecture and findings

There are two separate flows. The diary browser uses the Worker as a backend for sessions: password login or optional provider authorization, S256 PKCE callback exchange, refresh and HttpOnly cookies. External MCP clients authorize at Supabase OAuth Server; the Worker consent UI reads Supabase's authorization record using a verified first-party browser identity. Supabase issues codes/tokens; the client exchanges and refreshes them. The Worker is the MCP resource server, not a custom token issuer.

| Control | Review result / practical boundary |
| --- | --- |
| Authorization code + PKCE | External client/Supabase responsibility; require S256 and wrong/missing verifier rejection in later hosted acceptance. Browser provider/signup flow generates a random 32-byte verifier and SHA-256 challenge. No hosted exchange performed. |
| Redirect validation | Browser adapter restricts provider destinations to staging Supabase. Consent redirects come only from verified Supabase authorization responses, accept HTTP/HTTPS, and reject other schemes. Exact registered callback restrictions are provider-enforced; loopback HTTP should be limited to an explicitly reviewed local client. |
| State / nonce | External client must generate/validate state and, if using OIDC ID tokens, nonce. MFD preserves the provider-returned redirect rather than constructing callback state. Browser provider state handling is delegated to Supabase; callback requires the HttpOnly PKCE verifier. This is not evidence of hosted state/nonce rejection. MCP does not accept ID tokens as substitutes for its resource access token. |
| Token verification | Every MCP request other than public discovery requires Bearer and successful staging `/auth/v1/user`, followed by exact sub/issuer/resource audience/role, nonempty client/session and future-expiry checks. Decoding claims alone is not signature verification; upstream Auth performs verification first. No browser cookie substitutes for MCP Bearer. |
| Client / consent / session | Every private-data RPC independently derives auth.uid(), checks live auth.sessions owner/session, exact audience, registered MCP client and current section grant. API input rejects owner arguments; direct SQL ignores forged owner arguments. Tool listing/initialize/ping verify tokens but do not query live DB consent/client/session; these return no diary data. Do not claim revocation disables metadata responses immediately. |
| Scope separation | OAuth identity scopes govern provider identity information. Diary sections are separate database grants, not inferred from `openid/email/profile` or user_metadata. No per-section OAuth scope mapping is currently advertised. |
| Expiry / refresh / rotation | MCP clients own `/auth/v1/oauth/token` refresh and must retain rotated refresh tokens. Browser refresh uses first-party Auth token endpoint and replaces both cookies; terminal failures clear session. Hosted rotation/reuse/session-expiry behavior remains unverified. Concurrent browser refresh is not serialized; provider reuse-window behavior needs acceptance testing. |
| CSRF / browser session | Host-prefixed Secure, HttpOnly, Path=/, SameSite=Lax access/refresh cookies; no Domain. Mutating API/consent requests require exact Origin; cross-site requests rejected. Duplicate cookies rejected; tokens omitted from browser session JSON. Callback clears PKCE cookie, redirects to fixed origin. Private no-store caching and security headers applied. |
| Revocation | Local diary grant/proposals deleted first; native grant revocation follows, denying old-token data access even if native deletion fails. Database checks current grants/session on every private read. Native-only grants remain visible for recovery. Supabase session deletion/refresh revocation must still be demonstrated with later synthetic accounts. |

**MEDIUM — consent spans two services.** Native approval precedes local grant-save, preventing premature local expansion. Native success/local failure can leave a partial connection; revoke through Manage connections and reconnect. Prior permissions are not automatically erased. Cross-service transactional redesign is outside this phase.

**MEDIUM — hosted lifecycle/settings unverified.** No users, registered clients or OAuth flow exist. Public Auth checks confirm email enabled, Google/anonymous disabled, email auto-confirm false, signup enabled. OAuth-server discovery returns 404 `feature_disabled`. OIDC issuer matches staging and advertises S256 and plain; metadata does not establish enforced S256. JWKS exposes an ES256/EC verification key; it does not prove current token signing selection, hook activation, rotation, Site URL or redirect allowlist. Leave all these settings unchanged until separately approved.

## MCP security and client compatibility

Fixed tools read only the five consented diary sections; profile fields use an explicit allowlist. No arbitrary SQL, table name, workspace replacement or assistant-supplied identity is accepted. API and SQL enforce separate boundaries. Both write switches remain false, so proposal/application tools are unavailable. Existing proposal design binds user/client/revision, requires separate browser approval, expiry and single consumption; CAS prevents a duplicate from applying after a revision change. Consent locks and proposal row locks serialize applicable SQL operations. Multi-connection hosted races are not tested by PGlite.

**HIGH — owner-private MCP access is not established.** The installed Sites skill's native MCP contract requires a manifest `mcp` capability, Site-authenticated callers and `server/discover` with protocol 2026-07-28. MFD currently has no capability, requires an independent Supabase bearer, and implements initialize-based 2025-03-26/06-18/11-25 Streamable HTTP. There is no verified supported way for the intended client to satisfy Site privacy and forward the distinct Supabase credential. Adding the capability alone, trusting Site headers as diary identity, removing Supabase verification, or making the Site public is not a valid fix. No capability or authentication change was implemented. Obtain a supported dual-layer access contract or approve a concrete integration design before C.1B publication.

**MEDIUM — OpenAI tool-auth UX/registration compatibility is incomplete.** MFD provides protected-resource discovery and HTTP Bearer challenge but lacks explicit per-tool `securitySchemes` and `_meta["mcp/www_authenticate"]` reauthorization results. Current official guidance documents these for tool linking; generic consent errors may not reopen linking. Select the exact ChatGPT connection mode before adding metadata. Current OpenAI guidance prefers CIMD and documents DCR; MFD uses a static SQL client allowlist and keeps DCR disabled. Verify whether the selected client supports approved preregistration or requires an integration change. Never enable DCR automatically.

**MEDIUM — distributed abuse protection absent.** Request sizes (16 KiB MCP / 4 KiB consent), pagination, 20-second upstream timeout, Origin check and no automatic RPC retry bound individual operations. They are not rate limiting. No distributed per-client/user limiter, proposal deduplication or expiry cleanup exists. Local tests demonstrate upstream 429 becomes an uncached tool error without retry; Retry-After is currently lost. Review supported platform limits and a concrete limiter design before untrusted/multi-user use or write rollout. Do not introduce paid bindings implicitly.

**LOW — denial diagnostics are generic.** Missing/invalid Bearer gets HTTP 401 with discovery challenge; downstream client/session/consent denial returns isError without differentiated reauthorization guidance. This fails closed for data but can impair reconnect UX. No auth fallback or retry was added.

Generic transport uses POST JSON-RPC, bounded envelopes, Accept JSON + event-stream, supported protocol header checks and stateless JSON replies; authenticated GET returns 405 (no SSE stream). Notifications/initialized returns 202. MCP public discovery intentionally requires no diary token. Repeated reads are allowed and can consume resources; repeated writes are not enabled. Local tests exercise malformed envelopes, missing/invalid/expired credentials, client/session/consent denials, cross-account access, consent failure/replay, revoked grants and duplicate/stale proposals.

Client differences requiring later verification:

- ChatGPT: exact callback and client identity must be copied from the actual management screen. Current docs permit callback-ID-specific or stable redirects depending on issuer identification; do not hardcode an old universal callback. Confirm resource binding, S256, discovery and both privacy/auth layers.
- Claude remote connectors: run from Anthropic infrastructure, not the user's localhost. Official docs describe remote HTTP/SSE and selectable published identity/automatic registration/own-client modes. The private Sites gate still requires a supported path; confirm exact callback/client mode in the chosen interface. Claude API Bearer usage is a different integration from interactive connectors.
- Gemini CLI: official project docs support remote HTTP/SSE OAuth discovery and a local callback listener, with issuer-response validation. Select an exact allowed callback/port and approved client registration mechanism. This does not establish Gemini web-app compatibility. No provider-specific behavior was implemented.

## Hosted database verification — read only

Project identity rechecked: exact staging ref, ACTIVE_HEALTHY, eu-central-1, PostgreSQL 17.11.0.003. Fresh final-catalog digest is **086a87995f52cf1a0b7e44fb904b7575**, identical to approved C.0.1: 61 columns, 54 constraints, 32 indexes, 55 policies, eight new functions, five triggers, three private buckets. All 16 application/MCP tables are postgres-owned with RLS enabled; zero authenticated excess TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants.

All ten new public restrictive OAuth policies, workspace restriction and storage restriction remain. Nine ordinary storage policies plus the restrictive policy match; buckets retain exact private limits/MIME types. Existing MCP function hashes/modes/empty search_path/ACLs match reviewed definitions. New functions and grants match the catalog fingerprint. No new callable public SECURITY DEFINER function was found. Auth users, native OAuth clients and MCP client registrations remain zero.

Database writes_enabled=false; active resource unchanged. Stored Worker MFD_MCP_WRITES=false. postgres storage delegation remains configured for objects/buckets. Fresh zero-row Data API probes reject mfd_mcp, mfd_private, mfd_observability and auth with 406/PGRST106; nonexistent control also rejected. Complete exposed-schema list `public,graphql_public` and disabled auto-exposure use the user's 2026-10-28 dashboard confirmation; SQL does not independently reveal that management setting. No unexpected scoped catalog/security drift observed; this is not an inventory of every provider object.

**INFO — advisor findings unchanged:** three intentional private-table RLS-without-policy notices (grants, proposals, sync_totals), and sixteen unused indexes on empty/new tables. No WARN/ERROR returned. Do not add permissive policies or remove indexes to silence INFO. Future functions still require explicit transactional EXECUTE revocation/grants because global PUBLIC defaults were intentionally preserved.

Migration remains unchanged: `db296a6263e4596cc64f2a0f678000d4ef25ee0892d818c8782e60b671953da5`. No installer or migration was executed in C.1A.

## Local validation and dependencies

Used installed locked dependencies and Node 22.13.1 (matching `.nvmrc`/CI). No dependency/lockfile update or reinstall. Initial checks passed; after targeted test additions, the complete suite passed again.

| Check | Result |
| --- | --- |
| Frontend TypeScript no emit | PASS |
| Worker TypeScript no emit, incremental false | PASS |
| Hosting ESLint | PASS |
| All existing local CJS test files | 32/32 PASS, including migration/preflight, RLS, MCP, application and performance suites |
| Added MCP negative/throttling coverage | PASS within existing mcp-server.cjs |
| Production-mode staging build | PASS, output `.sites-runtime/phase-b-dist` |
| Staging artifact inspection | PASS all three current output directories before serving |
| Additional secret-marker scan | PASS, scoped patterns described above |
| Built Worker localhost smoke | PASS all 16 requests; no real login/token/account used |
| Root npm audit | 0 findings |
| Hosting pnpm audit | 1 moderate; 0 low/high/critical |
| Changed test whitespace | PASS |
| Frontend/manifests/old root dist | Unchanged |

The one remaining advisory is **GHSA-67mh-4wv8-2f99**, esbuild 0.18.20 via hosting > drizzle-kit 0.31.11 > @esbuild-kit/esm-loader 2.6.5 > @esbuild-kit/core-utils 3.3.2. Patched esbuild >=0.25.0; loader pins the older range. It is development schema tooling, absent from the deployed bundle inventory; the vulnerable serve API is not used. Residual development exposure remains if that API is introduced. Retain the advisory in audits; no suppression/forced override/audit-fix was applied. Previous B.1 critical fixes remain installed. No newly reported runtime advisory matched this audit.

Sandbox registry/loopback requests initially failed. Approved network-enabled retries produced successful fresh audits and localhost smoke results. A clean final hosting audit was written separately after overlapping earlier attempt logs; the report uses only the valid final result. Vinext's route-classification informational warning remains; it does not establish static safety. No visual/device browser QA or hosted token-lifecycle/account/storage acceptance was performed.

## Changes and files reviewed

Only phase-specific source change: `tests/mcp-server.cjs`, extending existing coverage for missing session claim, Auth rejection before RPC, database client/session/consent denial, malformed JSON-RPC and upstream 429 without retry. These characterize security boundaries and the known retry-guidance gap; no runtime security check was weakened. No confirmed small runtime defect required a production-code fix in this review. `docs/PHASE-C1A-REPORT.md` is new. Rebuilt browser output remains deterministic against the existing candidate changes.

Reviewed: STAGING/MCP and C.0.1 execution/recovery/storage reports; src/environment.ts; frontend/adapters/auth.ts; Worker index/mfd/mcp/mcp-consent/auth-types; database/schema.sql, mcp.sql and C.0.1 definitions/catalog assertion; preflight SQL; MCP/RLS/remediation/auth/server tests; root/hosting package manifests/locks and CI; build/verify/smoke scripts; hosting Vite/Sites plugin/dependency manifests; both hosting manifests and environment config. Local test loading additionally exercises social/catalogue/photos/private/observability reference SQL. Evidence/logs are ignored under `.sites-runtime/c1a/`; do not package that directory or credentials.

## Exact manual requirements and future deployment plan

This checklist proposes future operations; none authorizes them. Resolve the HIGH private transport blocker first, with a concrete supported design and approval if authentication/protocol architecture changes. C.1B must define whether it is browser-only private deployment or a supported private MCP rollout; they have different acceptance criteria.

1. Reconfirm branch, source scope and owner-private Site ID above. Curate a separate source checkout or explicitly reviewed output strategy. Sites source helper performs git add --all, commit and push: do not invoke it until source synchronization is expressly approved. No source write credential was requested in this phase.
2. Keep runtime variables exactly:

| Variable | Value |
| --- | --- |
| MFD_ENV | staging |
| MFD_SUPABASE_URL | https://gngnrmzeghjzqsmzuktl.supabase.co |
| MFD_SUPABASE_PUBLISHABLE_KEY | Existing staging public publishable key; compare without logging value |
| MFD_OAUTH_ISSUER | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1 |
| MFD_SITE_ORIGIN | https://mfd-oauth-testing.paleriver512.chatgpt.site |
| MFD_MCP_RESOURCE_URL | https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp |
| MFD_MCP_WRITES | false |

3. Read staging dashboard URL Configuration: intended Site URL is the reserved origin and first-party redirect is its exact trailing-slash `/`. Confirm current values before proposing corrections. OAuth authorization path must eventually be `/oauth/mcp/consent`. Keep OAuth disabled for initial browser publication unless later explicitly approved. Keep Google disabled for email-only acceptance.
4. Before separately approved OAuth activation, record current hook selection, signing/rotation state and dynamic registration setting. Intended hook is mfd_mcp.access_token_hook; compose with any existing hook rather than blindly replacing it. Use asymmetric signing for OIDC, but do not rotate keys without approval. Register only the selected reviewed client/callback, then add its exact identity to SQL allowlist through separately approved scope. Do not invent callbacks, enable DCR or add CIMD support without a verified client/provider contract.
5. Keep exposed schemas exactly public,graphql_public; auto exposure disabled; private/Auth schemas excluded. Preserve all existing policies/grants and both false write switches. Synthetic accounts, client records and lifecycle tests require their own approval.
6. In the curated source workspace, use Node 22.13.1, frozen root/npm and hosting/pnpm locks. Rebuild through the root package build with `MFD_BUILD_OUTPUT=dist MFD_DEPENDENCY_MANIFEST=staging npm run build`; rerun test:local, both TypeScript checks, hosting lint, unfiltered audits and `node scripts-verify-staging.cjs public dist`. The build replaces tracked old dist: review generated changes explicitly before source staging. Never copy old executable files into the new build.
7. Require `dist/server/index.js`, ASSETS with run_worker_first, correct staging identity, no static manifest, no client/index.html or client/legacy/index.html. Inspect and scan the exact extracted publication archive, not merely a separate preview folder. Match its SHA/source provenance to approved source. Keep local state, backup, environment credentials and dependency evidence outside the archive.
8. Only after separate source/publication approval, use the owner-private Sites operation and exact approved version/archive. Preserve audience; never use public access or bypass credentials to solve client reachability. No native MCP capability should be added until the reviewed design defines its authentication and protocol handling.
9. After any later private publication, verify anonymous visibility denial, owner browser access, served staging artifact, headers/caching, anonymous session, protected-resource discovery through the supported access path and missing/invalid bearer behavior. Keep OAuth off until its own approval. Then test approved synthetic Alice/Bob isolation, S256/state/resource/callback, invalid issuer/audience/signature/expiry/client/session, refresh reuse/rotation, native/local consent/revocation/reconnect, direct REST/RPC/storage denial and genuine concurrency. Do not claim success from the operator's RLS bypass.

## Recovery, costs and readiness

Retain the verified application-scoped backup at `/Users/prasanthnammi/MFD-Staging-Backups/gngnrmzeghjzqsmzuktl-20261027T200208Z`; no backup files were changed/deleted. Its accepted scope and local restore procedure remain in PHASE-C01-EXECUTION-READINESS.md. No new restore was necessary. Application archive is pre-remediation and is not a full Supabase recovery image. Do not automatically restore it over the remediated live project.

Before first publication, retain approved source/archive checksums and record that the Site currently has no deployed version. On deployment failure, stop; do not change auth/audience as recovery. After a later successful version, rollback means a separately approved redeployment of a known-good staging version while preserving privacy and false writes. First-publication incidents need a supported stop/disable or forward fix because no prior hosted version exists; verify the available operation before approval. Auth changes need recorded before-values and separately approved reversions; no key rotation, policy removal, schema drop or hosted restore is an automatic rollback.

This phase created no billable resources. Supabase documents OAuth Server beta as having no separate charge, with users counting toward MAUs; later usage remains subject to existing project quotas. Sites publication, traffic, storage/egress, email delivery, rate-limit bindings and any plan upgrade require checking the actual account entitlement before execution. No blanket zero-cost guarantee is made; do not enable paid backups/PITR/branches/SMTP/resources. No extra service is proposed here.

**Readiness:** C.1A review complete. Local application/security/build checks pass; database remains ready within reviewed scope. **C.1B private MCP deployment/OAuth integration is BLOCKED** by private transport/authentication compatibility and unverified client registration/tool-auth behavior. Dashboard settings and hosted lifecycle acceptance remain outstanding. No CRITICAL confirmed finding; HIGH compatibility blocker, MEDIUM operational/integration risks, LOW diagnostics gap and INFO advisor notices are explicitly retained. Browser-only publication would be a separately scoped decision, not an implied bypass of the MCP blockers. Stop for the user's next approval.

## Current official references

- [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [flows/state/PKCE/refresh](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [token security/RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security), [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
- [Supabase changelog](https://supabase.com/changelog): markdown endpoint could not be rendered; HTML index and relevant linked notices reviewed. [Explicit table exposure](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) is compatible with MFD's explicit grants; [token success status guidance](https://supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201) favors response.ok, already used here. That notice concerns its named endpoint and is not evidence of a project-level OAuth exchange. Node 22 remains compatible with the reviewed Node 20 support removal.
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [OpenAI authentication/current callbacks and tool-linking](https://developers.openai.com/plugins/build/auth), [OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server).
- [Claude connector modes/network access](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities), [Gemini CLI official MCP/OAuth documentation](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md).
- Installed [Sites MCP contract](/Users/prasanthnammi/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/skills/sites/references/site-mcp-server.md), [Sites skill](/Users/prasanthnammi/.codex/plugins/cache/openai-curated-remote/sites/1.1.2/skills/sites/SKILL.md), [Supabase skill](/Users/prasanthnammi/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md). These document preparation/review, not permission to publish in this phase.
