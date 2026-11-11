# Phase C.1B — Primary test-user verification

Date: 2026-10-29 (Europe/Berlin). **Primary account creation by the user is verified. This agent performed strictly read-only hosted checks and local evidence/documentation writes only.** No hosted mutation, login, second user, OAuth activation, migration, deployment, commit/push or production access occurred.

The previous agent provisioning attempt stopped because no supported administrative tool/credential was available. The user subsequently created the account manually in the staging dashboard. This report supersedes the earlier blocked/zero-user execution status, not the approval boundaries for later operations.

## Verification results

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Exact target | PASS | Explicit get_project gngnrmzeghjzqsmzuktl returned MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, eu-central-1, db.gngnrmzeghjzqsmzuktl.supabase.co, PostgreSQL17.11.0.003. No other project contacted. |
| Exactly one user exists | PASS | Explicit BEGIN TRANSACTION READ ONLY metadata query returns one auth.users record. |
| Successful account creation | PASS | Persisted UUID, created timestamp, role=authenticated, aud=authenticated, non-anonymous account. No creation request made by this agent. |
| Email confirmation | PASS | email_confirmed_at and confirmed_at are populated. This verifies stored confirmation state, not an independent Google-ownership ceremony. |
| Intended primary address/control match | UNKNOWN independently | User identifies the account as their primary. Email/identity_data/password fields were deliberately not selected, so no independent exact-email match or ownership proof is claimed. |
| UUID captured privately | PASS | Stored in ignored owner-only local evidence, not this report or chat. |
| Identity/provider inventory | PASS | Exactly one email identity, associated with the sole user. No Google identity exists yet; expected before approved Google linking. |
| User last sign-in / sessions | PASS | User last_sign_in_at=null; auth.sessions count0. No current session or user-level sign-in timestamp observed. No claim of a full historical login audit. |
| Public signup closed | PASS | Public /auth/v1/settings HTTP200: disable_signup=true. |
| Google enabled | PASS | Same endpoint external.google=true. No provider login attempted. |
| Anonymous disabled | PASS | Same endpoint external.anonymous_users=false. |
| OAuth Server disabled | PASS | Authorization-server discovery404 feature_disabled, “OAuth server is disabled.” |
| Other observable Auth baseline | PASS | Email enabled, mailer_autoconfirm=false; exact staging OIDC issuer, S256/plain capabilities; JWKS ES256/EC material consistent with prior observations. |
| Database MCP write switch | PASS | mfd_mcp.settings.writes_enabled=false; resource remains old private Site /mcp. |
| Application MCP write switch | PASS | Existing Sites runtime revision1 MFD_MCP_WRITES=false. No independent deployed Worker behavior implied. |
| Native OAuth clients / authorizations / consents | PASS | Counts0 /0 /0. |
| Local MCP clients / grants / proposals | PASS | Counts0 /0 /0. |
| Reviewed application catalog | PASS | Fresh catalog digest086a87995f52cf1a0b7e44fb904b7575, identical to reviewed C.0.1 baseline. Scoped definitions, policies, constraints, indexes, triggers, function rights and private buckets match. |
| Scoped application data | PASS | Workspaces, profiles, friendships, blocks, social workouts, messages, reactions, catalogue/reports, photo metadata and storage objects each0; settings1 and sync_totals2, as expected. No workspace/data payloads selected. |
| Complete unrelated database/Auth-config history | UNKNOWN | Catalog digest and counts are scoped, not a full database before/after audit. Public endpoints do not expose exact redirects/hook/path/DCR/provider credentials. No claim that every provider object or secret setting is unchanged. |

## Comparison with prior zero-user baseline

Expected observed change: users0→1 and identities0→1 (email provider only). Sessions remain0. Native/local OAuth clients, authorizations, consents, grants and proposals remain0. Application rows/counts and catalog digest remain consistent; both writes remainfalse. No unexpected scoped data/security change found.

One metadata detail required review: the identity has a populated last_sign_in_at even though user.last_sign_in_at is null and sessions are0. Its timestamp matches its creation to millisecond precision; the identity was created17ms after the user. Current [Supabase identity model](https://github.com/supabase/auth/blob/master/internal/models/identity.go) initializes LastSignInAt during NewIdentity, so a populated identity field alone is not proof of interactive login. This is consistent with administrative creation, not a demonstrated unexpected session. Upstream source is explanatory evidence, not a complete audit of the hosted Auth build. No authentication probe was run.

## Restricted local evidence and privacy

UUID, identity UUID/owner association, timestamps, confirmation booleans and aggregate counts are retained at `.sites-runtime/c1b-primary-evidence/verification.json` within this repository's ignored local state. Directory mode0700, file0600, git check-ignore confirmed. No email, password, provider subject, identity_data, credential or token was selected or saved. Do not package/upload/commit this directory or display the evidence in screenshots. UUID is intentionally absent from repository reports/chat; operator can inspect the private file locally.

The user supplied the account ownership assertion through the manual creation report; this agent did not collect their address or access Google secrets. No password requirement/actual password value can be inferred from these metadata checks.

## Secondary provisioning readiness and next approval

**Conditional GO for review/approval of secondary-only administrative creation; NO-GO for execution without that separate approval and private exact-address confirmation.** Primary postchecks pass within scope; no observed failure requires deletion or rollback.

Before secondary creation, the owner privately confirms the primary is indeed the intended address and enters/confirms the distinct controlled secondary email locally/directly in the staging dashboard. Do not send either email/password in chat or reports. Approve the exact supported creation/confirmation/password variant; no secondary creation is implied by the first-account approval. Recheck current one-user UUID/inventory privately, signup restriction, Google and false switches before saving.

After separately approved secondary creation, require users2 with distinct recorded UUIDs, expected initial identities, sessions0, clients/grants0 and false writes; stop again. Primary UUID must remain unchanged. A first Google identity may be added only during later approved login; linking must preserve the corresponding approved UUID and user count. Stop on linking failure/duplicate users; never reopen signup or fabricate identities.

Audience provisioning order now explicitly recognizes the approved primary user; future audience migration preflight must use the one/two-approved-UUID baseline, not the superseded zero-user expectation. The SQL empty local-client/grant/proposal guards remain unchanged and the migration is not executed here.

Google login/refresh/revocation, account isolation, unknown-user denial, Auth hook/client/path/DCR setup, audience transition and Worker deployment remain separately approved future work. Production remains strictly excluded.

No rollback performed. Any future cleanup/deletion needs exact-UUID/session/grant/storage/application dependency review and explicit approval. Never automatically delete this account or restore a database. Keep public signup disabled, Google enabled and both MCP writesfalse.

**Final result: scoped primary provisioning verification PASS, with explicit UNKNOWN limits above. Stop for secondary-only approval; no additional hosted action authorized.**
