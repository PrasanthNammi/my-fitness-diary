# Phase B local verification report

Date: 2026-10-27 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Local functional checks pass. Staging deployment is blocked by unresolved hosting dependency advisories. OAuth is not production-ready.**

No Supabase project was contacted by application tests. No hosted configuration, accounts, records, Site publication, deployment, merge, commit or push was performed. No production credentials or user data were used. Frontend design and behavior were preserved. All new account/workspace fixtures are synthetic and held in embedded PostgreSQL. The preview was stopped after verification.

## Environment and build isolation

- Downloaded Node 22.13.1 to the tool cache and used it for dependency installation, tests, checks, builds and smoke checks. Added `.nvmrc` matching CI.
- Root dependencies installed with `npm ci` (npm 10.9.2); hosting installed with `pnpm 11.25.0 install --frozen-lockfile`. Neither lockfile changed.
- Shared configuration now has no production defaults; the MCP handler also obtains its issuer from that configuration. Runtime staging identity overrides still fail closed.
- Active browser and Worker artifacts were scanned before starting the application. `public/` (37 executable/config/document files), `hosting/dist/` (87), and `.sites-runtime/phase-b-dist/` (85) passed. No forbidden production project ID was found in these outputs. The actual bundled Worker module also passes an independent test.
- The old tracked root `dist/` snapshot contains production references. It was preserved unchanged and was never served. Its retained media was copied without copying JavaScript, HTML or JSON. Do not deploy or serve this snapshot.
- Local build output is `.sites-runtime/phase-b-dist/`; normal build output remains `dist/`. `MFD_BUILD_OUTPUT` supports only those two paths. Build verification rejects production references, missing staging references and secret-key markers. Development startup also checks rebuilt browser assets.
- Restored 1,724 missing binary media assets from the pre-existing tracked snapshot into ignored local media paths. Existing source assets were not overwritten.
- Local tests block the outer process's global fetch and use explicit network doubles. Smoke requests went exclusively to `127.0.0.1:5173`, with no real bearer, session, login, or signup.

## Check results

| Check | Result |
| --- | --- |
| Frozen dependency installations | PASS; barcode peer dependency emits Node engine warning |
| Frontend TypeScript, no emit | PASS |
| Hosting/Worker TypeScript, no emit | PASS |
| Hosting ESLint | PASS, zero reported issues after excluding generated public copies |
| Production-mode staging build | PASS |
| Browser/Worker artifact inspection | PASS for the three active output directories |
| All local CJS test files | 29/29 PASS |
| Three repository SQL policy suites | PASS in PGlite |
| Built Worker localhost smoke check | PASS, all 11 requests |
| Root dependency security audit | PASS, zero advisories |
| Hosting dependency security audit | FAIL: 79 advisories, including 3 critical and 32 high |
| Source whitespace check | PASS excluding generated SDK bundles |
| Generated SDK whitespace check | Flags whitespace inside upstream template/string literals; retained to preserve SDK semantics |

The aggregate suite initially passed 25/27 files. Missing retained media caused app-cache and catalogue failures; restoring existing assets resolved both. After rebuilding the service worker, a stale PNG assertion failed in muscle-stats: the frontend and source asset already use SVG. The assertion now verifies the actual SVG path and lazy cache behavior. An initial new test expected the v2 save RPC to throw; its established contract returns a conflict result. The corrected test checks that result and independently verifies that the workspace remains unchanged.

Initial hosting TypeScript failures were caused by missing starter connector modules, undeclared raw HTML imports, and optional D1/R2 settings. These were repaired. The two connector modules were restored verbatim from the installed Sites starter template. Lint initially reported 17 explicit-any annotations; boundary shapes now have types, and generated browser copies are excluded from hosting-source lint.

### Every local test file

| File | Final result |
| --- | --- |
| `app-cache.cjs` | PASS |
| `app-update-safety.cjs` | PASS |
| `auth-security.cjs` | PASS |
| `bridge-performance.cjs` | PASS |
| `catalogue.cjs` | PASS |
| `database-rls.cjs` | PASS |
| `day-selection.cjs` | PASS |
| `exercise-replacement.cjs` | PASS |
| `food-actions.cjs` | PASS |
| `food-summary.cjs` | PASS |
| `image-safety.cjs` | PASS |
| `legacy-events.cjs` | PASS |
| `mcp-database.cjs` | PASS |
| `mcp-server.cjs` | PASS |
| `metrics-endpoint.cjs` | PASS |
| `muscle-stats.cjs` | PASS |
| `nutrition-preferences.cjs` | PASS |
| `routine-overview.cjs` | PASS |
| `security.cjs` | PASS |
| `server-security.cjs` | PASS |
| `set-logging.cjs` | PASS |
| `social-refresh.cjs` | PASS |
| `staging-artifacts.cjs` | PASS |
| `staging-isolation.cjs` | PASS |
| `store-performance.cjs` | PASS |
| `sync-performance.cjs` | PASS |
| `workout-clock.cjs` | PASS |
| `workout-limit.cjs` | PASS |
| `workspace-merge.cjs` | PASS |

The runner includes every existing performance/security test rather than stopping at the first failure. `test:mcp`, `test:performance` and `test:staging` constituent tests are included. Final SQL-only changes were followed by successful reruns of both database test files. Both TypeScript projects were also rechecked after the last code changes.

## Added security coverage

- Native OAuth consent HTTP failures, network interruptions, invalid redirect schemes, local grant-save failure, and consumed authorization replay.
- Repeated and concurrent transport reads; no mutation RPCs are issued by those reads.
- Network failures do not automatically retry data operations. Upstream error replies remain uncached failures.
- Read-only transport rejects proposal and application tools before a data RPC.
- Duplicate proposals have different IDs, require independent approvals, and become stale after one changes the workspace revision. Replaying an applied proposal fails.
- Alice/Bob cross-account attempts across every private section, including forged user IDs supplied directly to the database and cross-owner update/delete attempts.
- SQL schema tests load social, catalogue, photos, private exercises and observability alongside MCP, then exercise the three existing SQL policy suites.
- OAuth tokens cannot directly read populated workspace/profile/storage records, upload storage objects, or change the workspace through the v2 RPC. Restrictive policies are verified across the repository's public tables and storage objects.
- Artifact contamination tests reject a production project ID, missing staging identity and synthetic secret-key markers.

## Fixes implemented

1. Removed production fallback configuration from executable source, rebuilt committed browser bundles with staging configuration, and added inspection gates.
2. Moved native OAuth approval and redirect validation before saving local diary consent. A failed native approval cannot expand local access.
3. Changed the offline SQL installer's default resource audience to the staging resource and updated embedded fixtures. No hosted SQL was applied.
4. Restored missing starter connector source and declarations; typed auth/MCP boundaries and optional hosting settings.
5. Restored retained media safely; corrected the obsolete anatomy test without changing the existing frontend.
6. Added complete offline test execution, staging artifact tests, a localhost smoke script, staging-branch CI coverage, Worker type checks, lint, and a dependency security gate.

## Security findings and remaining risks

**Dependency remediation blocks deployment.** The installed Next.js 16.3.4 matches three critical registry advisories: next/og ImageResponse RCE, SVG image-optimization RCE, and typed-array use-cache RCE. The last two list 16.4.1 as a patched floor. This app uses Vinext, so actual reachability requires investigation; dependency presence alone does not establish an exploitable MFD endpoint. High-severity findings also include react-server-dom-webpack, sharp, Zod and transitive packages. See [the complete 79-advisory inventory](PHASE-B-DEPENDENCY-AUDIT.md).

Proposed remediation, pending approval for a broader dependency compatibility pass: inventory which advisory paths enter the Worker; select mutually compatible patched Next/Vinext/React-server/Vite/Wrangler versions; update exact pins and lockfile deliberately; patch safe transitive paths through supported parent upgrades; rerun security audits, all 29 tests, types, lint, build, bundle inspection and localhost smoke checks. Do not apply a blind audit-fix or broad override set.

Additional limitations:

- `@zxing/library@0.23.0`, required by the current barcode browser dependency, declares Node >=24. Installation warns under CI's Node 22, although these local builds/tests pass. Camera/barcode runtime is not device-tested. Resolve the declared engine mismatch in the dependency pass.
- Native OAuth approval and local permission storage span two services. Reordering prevents premature local expansion, but cannot make them transactional. A native-success/local-save-failure requires revoking the partial connection through Manage connections and reconnecting. Existing prior permissions are not automatically revoked.
- No distributed MCP rate limiter, proposal deduplication, or expired-proposal cleanup was added. Duplicate proposals are authorization-safe in tests but may consume resources. Keep writes disabled. Designing those controls is separate work.
- PGlite is not hosted GoTrue/PostgREST/Storage. It uses synthetic auth/storage contracts and a cron scheduling stub; scheduled cleanup, provider signing, OAuth token rotation and native revocation are unverified.
- Concurrent transport reads were tested; true multi-connection database races and consent/revocation concurrency need hosted or a separate local PostgreSQL setup.
- Worker upstream 429/5xx responses currently produce generic tool errors rather than detailed retry guidance; application-level rate limiting remains unverified.
- The actual staging schema, exposed schemas, grants, Auth settings, signing algorithm, registered clients, resource settings and private Site MCP access have not been queried in this phase.
- The old root `dist/` remains unsafe to serve. Only inspected new outputs may be used.

No hosted test was skipped because it needed production access: production is forbidden for all testing. Hosted tests were deferred because this phase explicitly excludes hosted accounts/configuration/deployment.

## Phase C prerequisites and approval boundaries

1. Remediate/triage hosting advisories and resolve the Node engine mismatch before deployment approval.
2. Read-only review of the existing staging project: full schema/RLS/privileged-function/exposed-schema inventory, security advisors, current resource URI, writes=false, OAuth/client/hook/signing settings. Do not rerun the non-idempotent SQL installer against an existing installation.
3. Obtain separate approval for private staging deployment and any Supabase configuration changes. Verify the intended MCP client can access private discovery without making the Site public.
4. Obtain approval for two synthetic hosted accounts; test login, exact callback/S256/state/resource, invalid credentials, wrong audience, expiry, refresh rotation, logout/native revocation and reconnect.
5. Run bidirectional isolation against MCP and direct REST/RPC/storage paths, native consent failure/recovery, request interruption/rate limits and genuine concurrent transactions. Any hosted write testing needs separately approved switches and synthetic data.
6. Preserve read-only rollout defaults. Production readiness requires successful relevant hosted end-to-end acceptance.

**Safe for staging deployment now: no.** Local application checks pass, but unresolved high/critical dependency matches and unverified hosted configuration prevent a security sign-off. Nothing has been published.

## Files modified or added

- `.github/workflows/ci.yml`
- `.gitignore`
- `README.md`
- `database/mcp.sql`
- `docs/MCP.md`
- `docs/STAGING.md`
- `hosting/cloudflare-env.d.ts`
- `hosting/eslint.config.mjs`
- `hosting/vite.config.ts`
- `hosting/worker/index.ts`
- `hosting/worker/mcp-consent.ts`
- `hosting/worker/mcp.ts`
- `hosting/worker/mfd.ts`
- `package.json`
- `public/legacy/vendor/supabase.js`
- `public/react/main.js`
- `public/sw.js`
- `public/vendor/supabase.js`
- `scripts-build-hosting.cjs`
- `src/environment.ts`
- `tests/mcp-database.cjs`
- `tests/mcp-server.cjs`
- `tests/muscle-stats.cjs`
- `.nvmrc`
- `docs/PHASE-B-DEPENDENCY-AUDIT.md`
- `hosting/lib/connector-contract.mts`
- `hosting/lib/connector-errors.mts`
- `hosting/worker/assets.d.ts`
- `hosting/worker/auth-types.ts`
- `scripts-restore-media.cjs`
- `scripts-smoke-staging.mjs`
- `scripts-verify-staging.cjs`
- `tests/database-rls.cjs`
- `tests/no-network.cjs`
- `tests/run-local-checks.cjs`
- `tests/staging-artifacts.cjs`
- `docs/PHASE-B-REPORT.md` (this report)

Installed dependencies, tool caches, restored media and generated local build output are ignored. No local environment file, access token, secret key or account data was added to the changes. Existing public publishable keys remain in rebuilt browser configuration; these are public client identifiers, not privileged keys.
