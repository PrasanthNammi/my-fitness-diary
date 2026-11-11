# Phase C.1B — Independent Google authentication, local verification

Date: 2026-10-29 (Europe/Berlin). Local implementation/testing only. No hosted Supabase/Google/Cloudflare configuration, database, user, OAuth client, signing key, deployment, Site, commit/push or production access occurred. The existing private Site/frontend and SQL migrations remain unchanged. Synthetic upstreams only; local workerd stopped after verification.

**Local Google implementation: PASS. Hosted deployment: NO-GO pending provider/signup/configuration and normal C.1B approval gates.** This closes the missing independent Google initiation/callback implementation. It does not establish real Google/Supabase login acceptance or existing-user-only provider behavior.

## Implemented flow and identity boundaries

1. GET /login retains email/password and adds Continue with Google. Both forms receive a random browser CSRF cookie/value and the validated relative continuation, including the pending authorization_id.
2. POST /auth/google requires exact Origin, non-cross-site POST, form content type, a4KiB streamed bound, nonduplicated allowed fields and matching CSRF. The shared SQLite quota class is auth, before any upstream work. No GET initiates authentication.
3. A fresh256-bit random state and256-bit random PKCE verifier are generated with Web Crypto; S256 challenge is sent only to the pinned staging /auth/v1/authorize?provider=google endpoint. A five-minute Secure/HttpOnly/SameSite=Lax/Path=/ __Host-mfd-integration-google cookie stores pending browser context. The verifier is never in the redirect URL. No environment secret or persistent identity record is added.
4. redirect_to is fixed to the configured independent origin+/auth/google/callback with the random state as a query parameter. Only the already-validated relative continuation is stored, not any assistant owner ID. Supabase handles Google-provider state/token verification; the Worker validates its own browser state on Supabase's return. It never accepts a Google ID token as an MFD/MCP bearer.
5. GET /auth/google/callback requires the matching cookie/state, unexpired five-minute context, exactly allowed singleton query parameters and a bounded nonempty code. Cancellation/errors/missing cookie/state fail with a generic page. Context cookie is cleared on every callback, success or error; callbacks are no-store/no-referrer. No callback code is echoed into a response or diagnostic.
6. The code is exchanged at pinned /auth/v1/token?grant_type=pkce using auth_code and the browser's verifier. Supabase owns one-time code redemption/PKCE verification. A replay after browser cookie clearing is denied before exchange; reuse retaining a copied old cookie is denied by the one-time provider code. No server-wide “consumed state” database/cache is claimed.
7. Before session cookies are set, /auth/v1/user verifies the returned bearer. Its user ID must equal both the token subject and exchange reply user. Exact staging issuer, first-party audience authenticated, authenticated role, nonempty session_id, expiry/not-before and absence of OAuth client_id are enforced. Password-token saving now also applies this identity check.
8. A login started with an existing Worker session records its verified owner and token fingerprint. Callback must still have that same browser session and return that same owner. Alice→Bob substitution fails without replacing Alice's cookies. To switch accounts deliberately, logout first and begin a new flow; logout clears pending Google context. Starting anonymously but finishing with another newly installed Worker session also fails. Expired existing sessions may require logout/renewal before starting Google; they are not silently discarded.
9. Successful Google authentication establishes fresh __Host Secure/HttpOnly/SameSite=Lax access/refresh cookies and redirects only to the saved relative continuation. No consent grant is written by login. The existing native authorization-user check rejects Bob viewing/approving Alice's pending authorization. The shared consent UI displays the authenticated MFD identity and requires explicit section choices; RPC still checks live session/client/consent and derives auth.uid(). Cookie identity never authenticates /mcp.

The flow cookie is browser-held PKCE context, not a server-signed user assertion. Its owner/context never independently authorizes diary access; authenticated upstream identity and native/SQL checks remain authoritative. Host-prefixed cookies, exact Origin, CSRF and state bind the flow to its initiating browser. No public limiter API or local-only quota fallback was added. Failure pages do not reveal whether a Google/MFD account exists.

## Exact manual prerequisites — not configured or assumed

Only project gngnrmzeghjzqsmzuktl may be used. Prior provider evidence was Google disabled; no fresh hosted provider read was performed in this local phase. Do not infer readiness from the added button.

| System | Required reviewed configuration |
| --- | --- |
| Supabase Providers → Google | Review enabled status; select approved staging Google OAuth Web client credentials. Store Google secret only in Supabase/provider secret storage, never this Worker, source or chat. No activation is authorized now. |
| Google Auth Platform | Approved staging Web application client; audience/test-user restrictions and required consent configuration. Review existing project/client before proposing resource creation. Do not reuse production credentials. |
| Google authorized redirect URI | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/callback — verify exact provider-dashboard callback before approval |
| Google authorized JavaScript origin | https://mfd-connect-staging.shanustylish777.workers.dev as applicable to approved Web client configuration; this is not its redirect URI |
| Supabase Site URL | Planned independent origin; capture existing http://localhost:3000 before changing |
| Supabase general redirect URLs | Exact https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback and planned origin+/ as needed; verify legitimate state query is preserved/accepted in real flow. No wildcard shortcut if rejected. Current list is empty. |
| Existing-user-only requirement | Review/approve disabling public new-user signup or an equivalent provider-supported restriction before Google acceptance. Google sign-in can create a Supabase account; this implementation does not query admin APIs or prevent provider-side creation before callback. No unknown account may be tested until the provider restriction is established. |
| Identity/linking | Verify existing approved staging user/provider identities and Supabase linking behavior without selecting/exporting secrets. Authorization uses verified Supabase subject, never matching an email locally. Do not force Google users to create a password or copy Site cookies. |
| Native MCP OAuth | Existing C.1B hook/path/DCR/client/audience setup still required separately. Google provider enablement is distinct from enabling Supabase OAuth Server for ChatGPT. |

Do not confuse three redirects: Google→Supabase provider callback; Supabase→Worker /auth/google/callback; Supabase OAuth authorization→ChatGPT https://chatgpt.com/connector/oauth/Xm83tVWz4VJh. The new Google route is not a replacement ChatGPT callback. OIDC nonce/provider signature verification occurs in Supabase/Google's provider flow; no direct Google token validation or nonce-bypass option was added.

Current dashboard before-values remain Site URL localhost:3000, no redirect URLs, OAuth Server disabled, no Auth Hooks, current ES256/previous HS256. Authorization Path/DCR remain unverified while disabled. Do not enable OAuth to inspect. Keys/RLS/storage/ACLs and both writes=false remain untouched.

## Local test evidence

| Check | Result |
| --- | --- |
| Full network-blocked local test runner | 38/38 PASS, including existing MCP/RLS/ownership/application/SQL suites |
| Google suite | PASS: correct S256 hash, random state/context, valid callback/session, preserved authorization_id, malformed/duplicate/state/expired/context redirect failures |
| Provider failure/cancellation/replay | PASS: cancelled/missing code/upstream failure, cookie clearing, browser replay denied; one-time-code mock rejects copied-context replay |
| Session/account substitution | PASS: wrong issuer/audience/session/expiry/nbf, mismatched exchange/user/subject, existing Alice→Bob, changed browser token |
| Cross-account consent | PASS: anonymous Bob may sign into his own account; cannot read or approve Alice's pending authorization; no consent/RPC write on rejection |
| Password login | PASS in existing independent suite, including added verified-identity boundary |
| Frontend / Worker TypeScript | PASS |
| Hosting lint | PASS |
| Production-mode staging build | PASS, output .sites-runtime/phase-b-dist; old root dist untouched |
| Independent build / scans | PASS; added module bundled with existing Web APIs, no new dependency |
| Staging output checks | PASS public37, hosting/dist169, selected output167 files |
| Actual local HTTPS workerd + local SQLite DO | PASS Google start/callback/exchange→consent, missing-bearer denial despite session cookie, replay/cancel/bad-state/exchange/Origin failures |
| Root / hosting dependency audits | 0 /1 moderate,0 high/critical; unchanged Drizzle loader esbuild advisory |

New final colocated bundle SHA-256: **553804ec71d01df3a60ecbc9b182a8eaabeee721e44f96d5a0ff1c694d714de0**. This supersedes earlier local artifact hashes only, not an approved release/config checksum. No dependency/lockfile changes.

The first full run found a test-fixture timing issue: constructing different synthetic tokens on separate millisecond timestamps made an intended token replacement fail intermittently. The fixture now fixes its synthetic expiry once; no runtime security check was relaxed. Final38-file run passes after the added cross-account assertion. Sandbox loopback failures were retried with approval. Native mock code exchange/user replies never contacted Supabase/Google; this proves workerd compatibility and handler security branches, not real provider or browser acceptance. The actual native fixture uses the private binding and real local SQLite class; the prior90-request coordination/persistence tests remain in the existing regression evidence, not falsely relabeled as new Google-specific multi-region tests.

Logs/evidence and synthetic fixture state are ignored under .sites-runtime/c1b-google. The emulator is stopped; state retained. Fixture diagnostic routes and synthetic tokens must never enter release packaging. Platform access logs may capture state/code query strings; verify redaction/retention before real login. No application token/password/code logging was introduced.

## Source changes / reproduction

- Added hosting/independent/google.ts: PKCE/context construction, callback parsing and upstream-verified first-party identity.
- Changed hosting/independent/auth.ts: Google button/start/callback, browser/account binding, context cleanup and verified identity when saving password sessions.
- Changed hosting/independent/colocated-router.ts: two fixed auth routes through the shared limiter.
- Added tests/independent-google-auth.cjs and scripts-prepare-google-local.cjs / scripts-smoke-google-local.cjs: synthetic tests/native harness.
- Updated independent README and C.1B checklist; this report. No private Site/shared business handler/frontend/SQL/lockfile changes.

Reproduce using Node22.13.1 and locked packages: npm run test:local; both TypeScript no-emit projects; hosting lint; scripts-build-independent.cjs; root staging build with MFD_BUILD_OUTPUT=.sites-runtime/phase-b-dist; scripts-verify-staging.cjs.

Native rehearsal: run scripts-prepare-google-local.cjs, then installed Wrangler dev with --local against .sites-runtime/c1b-google/cloudflare/wrangler.json, HTTPS127.0.0.1:54445, the retained trusted local certificate, --persist-to that directory's state and --inspector-port0. Run scripts-smoke-google-local.cjs from repository root, then stop Wrangler. Use a fresh/expired quota window, never reset persisted counters to force a pass. No remote bindings or deployment command.

## Revised decision and approval boundary

**GO for local implementation review; NO-GO for hosted Google login or C.1B execution yet.** Independent Google compatibility is implemented and locally verified; real provider/signup/identity-linking/callback behavior remains a blocking manual and later hosted acceptance prerequisite. Approve only a concrete configuration/provider/Google Cloud/test-account scope after those before-values/entitlements are reviewed. No code-path requires enabling MCP writes, bypassing privacy, accepting another audience or changing ownership.

The first proposed audience-only SQL scope is unchanged, SHA1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590. It remains unexecuted/unauthorized; no reason to execute it just to close a local implementation item. Follow the final checklist and obtain explicit hosted execution approval. No automatic provider activation, client registration or account creation.

Official references reviewed: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Existing-user signup restrictions must be verified against the actual staging Auth settings before future provider use.

## Later manual provider setup

The user subsequently configured staging Google. Fresh read-only settings verify google=true but disable_signup=false; database users/identities/sessions remain zero and both MCP write switches false. See the final checklist's “Manual Google setup follow-up” for exact evidence, callback/redirect limitations, administrative existing-user provisioning plan and the new first proposed operation (Scope0S: disable public signup only). This supersedes the earlier provider-disabled observation without implying Google flow acceptance or any agent-performed hosted change.
