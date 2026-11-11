# MFD OAuth Testing

Current local dependency status: see [Phase B.1](PHASE-B1-REPORT.md). The earlier
79-entry audit is historical; one moderate development-only entry now remains.
Hosted preflight and deployment approval are still required.

Private, owner-only staging Site: appgprj_6ae0ae64c4e88191a385d9bdb6dc37c5.
Reserved origin: https://mfd-oauth-testing.paleriver512.chatgpt.site
Source: feature/mcp-supabase-oauth at dfc499a0df23c29b3eedc4b305165e83d08008b3.
Staging branch: staging/mfd-oauth-testing.

The Site is created but UNPUBLISHED. The workspace network proxy refuses connections and the Sites source workflow helpers are absent, blocking source synchronization and publication. Do not report the reserved origin as a live deployment. Preserve this Site ID on retry.

The tracked .openai/environment.json selects staging for server and browser builds. Sites runtime variables mirror it. src/environment.ts uses the explicit deployment configuration without production defaults and rejects attempts to point this staging build at another project, issuer, key, resource, or origin. Only the disposable project gngnrmzeghjzqsmzuktl is used. AI writes remain disabled in Sites and mfd_mcp.settings. Staging refuses legacy session migration. No users, sessions, credentials, or diary rows were imported. Existing frontend layouts are unchanged.

## Initial staging preparation (historical)

Passed: npm run build; frontend TypeScript check; tests/mcp-server.cjs; tests/server-security.cjs; tests/auth-security.cjs; tests/staging-isolation.cjs.
Both protected-resource discovery aliases were exercised locally and return:
- resource: https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp
- authorization_servers: https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1

Live discovery and browser QA remain unverified. tests/mcp-database.cjs cannot run because @electric-sql/pglite is missing and package installation requires the unavailable proxy. No OAuth end-to-end flow was run.

## Manual Supabase settings — only after publication and explicit OAuth approval

Use only https://supabase.com/dashboard/project/gngnrmzeghjzqsmzuktl/auth.
Do not change Forma.

- Authentication > URL Configuration: Site URL https://mfd-oauth-testing.paleriver512.chatgpt.site; redirect allowlist includes https://mfd-oauth-testing.paleriver512.chatgpt.site/ . Use exact URLs, no wildcard.
- Authentication > OAuth Server: enabling OAuth requires the user's separate approval. Authorization Path /oauth/mcp/consent. Keep dynamic client registration disabled. Register only the intended test client and exact callback URL; add its client ID to mfd_mcp.clients according to docs/MCP.md.
- Authentication > Hooks: enabling the Custom Access Token hook requires the user's separate approval. Select mfd_mcp.access_token_hook, which sets the MCP audience only for registered clients. The existing settings row has already been updated to the reserved staging resource URI with writes_enabled=false.
- Check signing configuration before enabling: Supabase requires asymmetric signing for OpenID Connect ID tokens. Do not change signing keys without approval.
- Create only the two synthetic test accounts; never import production accounts or sessions. Google sign-in requires separate provider setup; no provider or OAuth server was enabled here.

Private Sites require the owner's ChatGPT access before the app's Supabase login. Confirm that the intended MCP client can access private discovery and transport using the platform's supported private-access mechanism. Do not make the Site public to resolve this. Do not share bypass credentials in source or documentation.


## Local Phase B verification — 2026-10-27

**Deployment blocked:** the hosting dependency audit reports 79 advisories, including
3 critical and 32 high. Local functional passes do not resolve these findings.

Phase B ran on local macOS under Node 22.13.1, using both committed lockfiles.
All 29 local test files passed. Both frontend and hosting TypeScript checks,
hosting lint, the production-mode staging build, artifact inspection and built
Worker localhost smoke checks passed. See `docs/PHASE-B-REPORT.md` for scope,
initial failures, changed files and remaining risks.

No hosted database, Auth setting, account, Site, deployment, branch merge, commit
or push was changed by this verification. The older verification notes above
remain historical, including their dependency/network limitations.

The tracked root `dist/` is an old snapshot with production references and is
preserved for retained media. **Do not serve or deploy it.** Local Phase B output
is `.sites-runtime/phase-b-dist/`; the same inspected build is in `hosting/dist/`.
Normal builds still produce root `dist/`, replacing the old snapshot, and must
pass the staging inspection gate before use. No generated build proves hosted
configuration or real OAuth readiness.

Reproduce without replacing the tracked snapshot (after selecting `.nvmrc`):

```sh
npm ci
npx --yes pnpm@11.25.0 --dir hosting install --frozen-lockfile
node scripts-restore-media.cjs
MFD_BUILD_OUTPUT=.sites-runtime/phase-b-dist npm run build
npx tsc -p frontend/tsconfig.json --noEmit
npx tsc -p hosting/tsconfig.json --noEmit --incremental false
npm --prefix hosting run lint
npm run test:local
node scripts-verify-staging.cjs public hosting/dist .sites-runtime/phase-b-dist
```

For an unauthenticated localhost smoke check, start `npm --prefix hosting run start
-- --port 5173` and run `node scripts-smoke-staging.mjs`. That script requests only
localhost routes and supplies no real accounts, sessions or tokens. Stop the
preview afterwards. Hosted sign-in and OAuth tests remain Phase C work.


## Phase B.1 dependency remediation — 2026-10-27

The earlier 79-advisory deployment blocker is superseded by
[docs/PHASE-B1-REPORT.md](PHASE-B1-REPORT.md): 78 entries were fixed; one moderate
Drizzle-loader esbuild advisory remains, with no deployed-code reachability in
the inspected bundle. Both audits remain unfiltered. All 31 local tests, strict
Node-22 installs, types, lint, staging build, artifact scans and 16 localhost
smoke requests passed. Controlled private read-only staging validation is
recommended after separate deployment approval and the existing hosted preflight.
No publication, hosted account creation or Supabase configuration change has
been authorized or performed by this remediation.
