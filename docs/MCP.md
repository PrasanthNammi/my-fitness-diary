# My Fitness Diary MCP integration

This branch adds an independently authenticated, stateless Streamable HTTP MCP
endpoint at `/mcp`. No deployment, production Auth settings change, remote SQL,
or production migration is part of this change. Existing diary routes, cookies,
frontend screens, workspace format, imports, exports and Hevy access remain intact.

## Tools and consent

| Tool | Consented section | Response |
| --- | --- | --- |
| `get_workouts` | workouts | Completed workout/session records (heart rate as average, maximum and source; MFD 2.0) |
| `get_routines` | routines | Saved routine records |
| `get_nutrition` | nutrition | Food diary entries |
| `get_progress` | progress | Weight history |
| `get_recovery` | recovery | Per day: sleep hours and stages, bed/wake time, steps, resting heart rate, HRV, energy, soreness, note; averages (MFD 2.0, `database/mcp-recovery.sql`) |
| `get_profile` | profile | Allowlisted fitness profile fields |

List tools accept `limit` (1–100, default 25) and `offset` (0–100000,
default 0). Profile takes no arguments. Results include the workspace revision.
Pagination follows workspace array order; if the revision changes between pages,
restart pagination. No tool accepts a user ID, table name, SQL, external URL, or
arbitrary document. No third-party model or Hevy write API is called.

`/oauth/mcp/consent?authorization_id=…` uses the existing HttpOnly browser
session and Supabase's authorization details, approve and deny endpoints.
The page shows the signed-in account, verified client identity, redirect URI,
OIDC scopes and initially unchecked diary permissions. Users sign in through the
existing diary in another tab if needed, retaining the pending authorization.
Supabase owns authorization codes, exact redirect registration, S256 PKCE,
token exchange and refresh-token rotation. OIDC scopes do **not** authorize diary
sections: the private per-user/client consent table does that.

`/oauth/mcp/connections` lists local diary grants and revokes them. Revocation
deletes local consent and proposals first, then revokes the native Supabase grant
and refresh tokens. Local deletion denies already-issued access tokens on their
next data operation even if the Auth revocation request fails. Retry a failed
revocation to finish native token revocation. Reconnecting after revocation
requires new explicit section consent.

## Trust boundaries

Bearer tokens are required on every MCP request; cookies never authenticate MCP.
Supabase `/auth/v1/user` verifies the token before claims are considered. The
Worker then checks issuer, exact resource URL audience, subject, OAuth client ID,
session ID, authenticated role and expiry. The user bearer is passed to a single
fixed RPC using only the existing publishable key; no service key is needed.

`database/mcp.sql` is an **unapplied, transactional offline SQL change set**.
It adds a private schema with RLS-enabled, non-client-writable client registry,
settings, grants and proposals. A public SECURITY INVOKER RPC delegates to one
narrow private SECURITY DEFINER dispatcher with an empty search path. This is
necessary to project consented sections from the existing indivisible workspace
without granting OAuth clients access to the complete document. The dispatcher
derives ownership from `auth.uid()`, checks the live `auth.sessions` row, approved
client registry, dedicated audience and current consent on every operation. No
authorization decision uses editable `user_metadata`.

Restrictive policies deny OAuth tokens direct access to existing public tables
and storage objects, including the original workspace read/save APIs. Existing
browser sessions (without `client_id`) retain their current policies. Do not
expose `mfd_mcp` through PostgREST. Future tables and RPCs must preserve this OAuth
boundary; a new SECURITY DEFINER function can otherwise bypass RLS.

All personalized responses are private/no-store. JSON-RPC validation bounds
request size, tool arguments and pagination; cross-origin browser requests are
rejected. Browser POST forms require the trusted Origin and use server-side
session cookies. Client and profile text is escaped in consent HTML. Tokens and
diary payloads are never logged or placed in approval URLs.

## Controlled writes: disabled by default

Two independent switches are required: Worker runtime `MFD_MCP_WRITES=true` and
`mfd_mcp.settings.writes_enabled=true` in the database. Both default to disabled.
The only implemented mutation is a fitness profile water-goal change:

1. `propose_water_goal({water_goal_ml, expected_revision})` creates an immutable
   proposal for 250–10000 ml and returns a browser approval URL. It does not edit
   the workspace. Only clients with profile consent can propose it.
2. The signed-in owner opens that URL and sees the exact client, amount, workspace
   revision and expiry. A same-origin POST approves exactly that proposal.
   MCP tokens cannot approve proposals or edit consent.
3. `apply_water_goal({proposal_id})` applies the approved proposal once, within
   ten minutes, for the same account/client. The database updates only
   `profile.waterGoalMl`, preserves every other field, and increments the workspace
   revision atomically. A changed revision returns HTTP 409; obtain a fresh
   proposal and fresh approval. Replay, expired approvals and revoked grants fail.

Disabling database writes also disables approval and direct RPC application of
previously approved proposals. No deletion, bulk edit or arbitrary workspace
replacement tool exists.

## Non-production setup and acceptance

These are future setup steps, **not actions executed for this PR**:

1. Create a disposable Supabase project with the existing schema and representative
   synthetic data. Inspect the actual schema, grants, RLS, exposed schemas and
   all callable SECURITY DEFINER functions before enabling OAuth. Apply the
   reviewed `database/mcp.sql` there only. Run Supabase security advisors and
   resolve findings; never run these tests against production.
2. Use the staging configuration in `hosting/independent/environment.json`, shared by
   browser and Worker through `src/environment.ts`. Runtime overrides that change
   the staging identity are rejected. Run the artifact inspection gate before
   serving or packaging the build. The existing frontend backend settings must match.
   Set `mfd_mcp.settings.resource_uri` to the exact staging origin plus `/mcp`.
   Configure that trusted origin through the existing Worker origin dependency
   (or the staging build's `ORIGIN` constant); do not trust arbitrary Host headers.
3. Enable Supabase OAuth Server on that project, set its Site URL to staging and
   its authorization path to `/oauth/mcp/consent`. Register a **public** client
   with exact redirect URIs and S256 PKCE (`token_endpoint_auth_method=none`).
   Dynamic registration is intentionally not exposed by this integration.
   Insert that registered client ID into `mfd_mcp.clients` using an admin
   migration. Unregistered clients fail closed even if they obtain an OAuth JWT.
4. Configure `mfd_mcp.access_token_hook` as the Custom Access Token hook. Compose
   it with an existing hook if needed rather than replacing other behavior.
   It assigns the resource URL audience only to registered MCP clients and
   preserves all other claims and first-party audiences. The hook is executable
   only by `supabase_auth_admin`; no browser or OAuth client can invoke it.
5. Connect an MCP client to the staging `/mcp`. Discovery is at
   `/.well-known/oauth-protected-resource/mcp` (also at the root alias).
   Supabase authorization-server discovery lives under its `/auth/v1` issuer.
   Request authorization-code flow with S256, state and `resource=<staging /mcp>`.
   Supported MCP versions are 2025-03-26, 2025-06-18 and 2025-11-25. Send both
   `application/json` and `text/event-stream` in Accept. Responses use JSON;
   GET streaming and server sessions are not implemented.
6. Verify two real staging accounts: selected read sections, absent consent,
   cross-account attempts, native refresh/PKCE failures, logout/revocation and
   attempts to call original REST/storage/RPC paths directly. With writes enabled
   in staging only, check approval, replay and simultaneous browser edits. Leave
   both switches disabled for the initial read-only rollout.

## Local verification

`npm run test:mcp` runs transport/consent tests and an actual embedded PostgreSQL
engine (PGlite) with synthetic Supabase auth/session fixtures. It uses no network,
remote database, real accounts or production credentials. Database tests cover
cross-account isolation, direct RLS bypass attempts, permission separation,
audience, active sessions, revocation, disabled writes, approval ownership,
single use, expiry, CAS conflicts and preservation of unknown workspace fields.
Transport tests cover discovery, bearer validation, cookie rejection, protocol
and input validation, XSS, CSRF, deny/revoke flows and default tool visibility.

PGlite validates PostgreSQL behavior, not the hosted GoTrue OAuth server, native
session deletion or multi-connection concurrency. Complete the staging acceptance
above before any later rollout. Supabase docs were checked using the connected
documentation search; direct changelog fetch was blocked by network policy.


## Local Phase B hardening (2026-10-27)

Native OAuth approval and redirect validation now finish before local section
permissions are saved. A failed native approval cannot expand diary access. If
native approval succeeds but the local save fails, new diary permissions remain
unavailable. The two services do not share a transaction; recover a partial setup
through Manage connections (revoke, then reconnect). A complete transactional
consent redesign is outside this local change.

The offline SQL installer and embedded database fixtures now use the staging
resource audience. This does not alter an already-installed hosted settings row;
verify that row separately before Phase C. Do not rerun the non-idempotent installer
against an existing hosted installation.

Duplicate proposals intentionally receive separate IDs. Approval of one does not
approve another, and applying one changes the revision so the duplicate cannot be
approved against the old revision. There is no proposal deduplication or distributed
rate limiter. Keep hosted writes disabled until those operational requirements
have been reviewed and hosted acceptance has passed.

`npm run test:local` runs every local CJS test file with the outer process's fetch
blocked. `tests/database-rls.cjs` loads repository SQL into PGlite, including social,
catalogue, photo and observability schema, and runs all three SQL policy suites.
It supplies synthetic auth/storage contracts and stubs only cron scheduling;
it does not verify the Supabase Storage service or scheduled cleanup execution.

## Connector proxy (2026-11-02, sandbox-verified, not deployed)

Problem: the Supabase OAuth token handed to an AI app was a full account token. In the sandbox
an AI app's token could change the user's password through `PUT /auth/v1/user` (GoTrue
v2.197.0, the same version as staging). "Secure password change" does not prevent it.

Design: the connector Worker (`hosting/independent/colocated-worker.ts`) is now the OAuth 2.1
server AI apps connect to, using `@cloudflare/workers-oauth-provider` 1.2.4:

- AI apps register themselves (DCR at `/oauth/register`, or Client ID Metadata Documents)
  and receive **opaque tokens valid only at `/mcp`**. S256 PKCE only. Grants last until the
  user revokes them (`refreshTokenTTL: undefined`). Access tokens live for 30 minutes.
- `/oauth/authorize` shows the consent page (the app's name is marked unverified; the
  redirect host is shown; sections start unticked). Users who aren't signed in go through
  the existing login and return to the same request.
- After consent, the Worker signs in to Supabase as its **only** OAuth client (public,
  PKCE, callback `/oauth/upstream/callback`). It stores that Supabase session encrypted in
  the grant (KV `OAUTH_KV`) and refreshes it on every AI-app refresh. The session never
  leaves the Worker.
- Section grants are keyed by the AI app's client id. The Worker passes it to the
  dispatcher as `connection` ([database/mcp-connector-proxy.sql](../database/mcp-connector-proxy.sql)).
  The dispatcher still enforces live session, Worker client, audience and per-app sections.
- `/oauth/mcp/consent` is now only Supabase's page for the Worker's own client. It
  approves that leg only when the same browser has a pending connect, for the same user,
  exact client and callback.
- `/oauth/mcp/connections` lists AI apps and revokes them: tokens, grant, diary sections.

Tests: `tests/connector-oauth.cjs` (offline). The sandbox e2e
(`.sites-runtime/sandbox/connector/e2e.mjs`, 58 checks under workerd and local Supabase)
confirms the AI token is rejected by Supabase for password/account/table/RPC access.
Staging rollout needs a KV namespace, a new Supabase OAuth client, the SQL migration and a
deploy; existing connections must reconnect.

### Analysis and add-only writes (2026-11-02, sandbox-verified, not deployed)

Read tools take `from`/`to` (YYYY-MM-DD) and `order` (`oldest`/`newest`). Each analysis tool
needs the matching read permission and is computed inside the database, not in the Worker:
`summarize_training` (workouts), `list_exercises` (workouts), `exercise_progress` (workouts),
`summarize_nutrition` (nutrition) and `weight_trend` (progress). Warm-up sets are excluded.
Estimated 1RM uses Epley for sets of 1–12 reps.

`log_workout`, `log_meal` and `log_weight` each need their own consent tick (`log_workouts`,
`log_nutrition`, `log_progress`). They only append a new entry, with a new id, in the app's
stored format, tagged `addedBy` (app connection, time, optional `request_id`). They never
edit or delete anything. The app's three-way merge treats them as new entities.

Limits on writes:
- `mfd_mcp.settings.writes_enabled` is the kill switch.
- At most 30 new entries per app per day (`mfd_mcp.write_counts`).
- Repeating a `request_id` returns the existing entry instead of adding another.
- Dates must be valid and not in the future; values are range-checked in both the Worker
  and the database.
- Tool annotations are `readOnlyHint:false, destructiveHint:false`, so ChatGPT and Claude
  ask the user before calling them.

Free-plan budget (Cloudflare docs, 2026-11-02; over a limit the operation fails, it is never
billed). KV operations measured in the sandbox:

| Action | KV reads | KV writes | KV deletes | KV lists |
| --- | --- | --- | --- | --- |
| App self-registers (once) | 0 | 1 | 0 | 0 |
| Connect an app | 7 | 5 | 2 | 1 |
| Tool call | 1 | 0 | 0 | 0 |
| Token refresh (every 30 min of use) | 2 | 2 | 0 | 0 |

Two apps in use 12 h/day with 1,000 tool calls is about 100 of the 1,000 free KV writes and
about 1,200 of the 100,000 free reads. The shared Durable Object quota (30 requests/min)
caps the worst case at about 43,000 Worker requests/day (free: 100,000) and about 86,000 DO
rows written (free: 100,000). Supabase Free is never billed. A Free project pauses after
about a week without activity; resuming it is free.
