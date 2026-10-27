# MFD OAuth Testing

Private, owner-only staging Site: appgprj_6ae0ae64c4e88191a385d9bdb6dc37c5.
Reserved origin: https://mfd-oauth-testing.paleriver512.chatgpt.site
Source: feature/mcp-supabase-oauth at dfc499a0df23c29b3eedc4b305165e83d08008b3.
Staging branch: staging/mfd-oauth-testing.

The Site is created but UNPUBLISHED. The workspace network proxy refuses connections and the Sites source workflow helpers are absent, blocking source synchronization and publication. Do not report the reserved origin as a live deployment. Preserve this Site ID on retry.

The tracked .openai/environment.json selects staging for server and browser builds. Sites runtime variables mirror it. src/environment.ts retains production defaults and rejects attempts to point this staging build at another project, issuer, key, resource, or origin. Only the disposable project gngnrmzeghjzqsmzuktl is used. AI writes remain disabled in Sites and mfd_mcp.settings. Staging refuses legacy session migration. No users, sessions, credentials, or diary rows were imported. Existing frontend layouts are unchanged.

## Verification

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
