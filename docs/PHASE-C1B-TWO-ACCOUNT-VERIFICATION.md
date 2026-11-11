# Phase C.1B — Two-account staging verification

Date: 2026-10-29 (Europe/Berlin). **Strictly read-only hosted verification after the user's manual secondary-account creation.** Local restricted evidence/documentation saved. No hosted mutations, login attempts, new users, OAuth activation, migrations, deployments, commits/pushes or production access.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Exact staging project | PASS | Explicit get_project gngnrmzeghjzqsmzuktl: MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, eu-central-1, PostgreSQL17.11.0.003; database host db.gngnrmzeghjzqsmzuktl.supabase.co |
| Exactly two Auth users | PASS | READ ONLY metadata returns2 records,2 distinct UUIDs |
| Confirmed / non-anonymous | PASS | Both email_confirmed_at and confirmed_at populated; is_anonymous=false for each |
| Primary UUID unchanged | PASS | Exact match to ignored primary verification evidence; all selected primary metadata unchanged |
| Primary identity preserved | PASS | Previously recorded email identity unchanged in selected metadata |
| Each user's email identity | PASS | Two identities total, provider=email for both, exactly one associated to each user |
| No Google/other unexpected identities | PASS | No identity provider other than email; Google linking has not occurred |
| Sessions / user sign-in state | PASS | auth.sessions=0; user.last_sign_in_at=null for both. No historical audit claim |
| Native OAuth clients | PASS |0 |
| Native authorizations / consents | PASS |0 /0 |
| Local MCP clients / grants / proposals | PASS |0 /0 /0 |
| Signup closed | PASS | Public settings HTTP200 disable_signup=true |
| Google enabled | PASS | Public settings external.google=true |
| Anonymous disabled | PASS | Public settings external.anonymous_users=false |
| OAuth Server disabled | PASS | Discovery404 feature_disabled |
| Database write switch | PASS | settings.writes_enabled=false; active audience remains old private Site /mcp |
| Stored application write switch | PASS | Existing Site runtime revision1 MFD_MCP_WRITES=false; no independent deployed Worker behavior claimed |
| Application catalog consistency | PASS | Fresh digest086a87995f52cf1a0b7e44fb904b7575 matches reviewed C.0.1 and primary baseline |
| Scoped application data | PASS | Application/workspace/photo/social/catalogue rows and storage objects remain0; settings1 and sync_totals2 |
| Other observable Auth settings | PASS | email=true, mailer_autoconfirm=false, exact staging OIDC issuer and advertised S256/plain, ES256/EC JWKS consistent |
| Exact personal-email/Google ownership verification | UNKNOWN independently | User identifies the two manual creations as their controlled primary/secondary. No email or provider identity_data was selected; no Google login performed |
| Complete unrelated Auth/database audit | UNKNOWN | Scoped catalog/counts and public settings are not a full management-setting or provider-object diff |

## Baseline comparison and local evidence

Expected difference from primary-only baseline: users1→2; email identities1→2; exactly one additional UUID. Primary UUID/selected metadata and original identity are unchanged. User-level sign-in timestamps remain null and session/client/grant counts remain0. No unexpected findings in inspected scope.

UUID mapping and limited account/identity metadata are stored only in `.sites-runtime/c1b-two-user-evidence/uuid-mapping.json` and `verification.json`. Directory0700; files0600; Git ignore verified. Primary reference remains `.sites-runtime/c1b-primary-evidence/verification.json`, unchanged. Reports/chat omit UUIDs and all email/password/token/provider identity_data. The local “secondary” label means the sole added UUID relative to the primary baseline, not an independent email comparison.

Read-only SQL selected UUIDs, timestamps, confirmation/role/anonymous fields, identity provider/user associations and aggregate counts. No email, password/hash, provider subject, identity_data, credential or token selected. Google authentication was not exercised. Initial Google linking may add one Google identity per existing UUID later; that expected change must not be confused with duplicate account creation.

## Readiness and next prerequisites

**GO for the next OAuth configuration preparation/approval phase against this explicit two-user baseline. NO-GO for executing configuration, login or deployment without the applicable approval and fresh preflight.** Successful administrative creation does not prove Google linking, account isolation or client interoperability.

Remaining gates:

- Reconfirm exact Site URL/general redirects and approve planned Worker origin plus /auth/google/callback. Last supplied before-values were localhost:3000/no redirects; this pass did not retrieve management settings.
- Approve the exact audience-transition SQL separately using the recorded two-approved-UUID baseline; retain its empty local-client/grant/proposal checks. No zero-user operational expectation should be replayed.
- Record/approve hook binding, OAuth setup window, exact Authorization Path and disabled DCR hold point. OAuth remains disabled now; do not enable solely to inspect hidden settings.
- Reconfirm ChatGPT draft callback, register only the approved public native client under separate scope, capture actual assigned ID and configure runtime/SQL registry in reviewed order. Google client ID is not the native MCP client ID.
- Finalize/hash actual release config/bundle, confirm Cloudflare Free entitlement/current account/inventory, exact hostname and supported emergency stop; approve Worker/SQLite creation/deployment separately. Preserve private Site, false writes and all RLS/consent/session/owner controls.
- Separately approve controlled Google acceptance: each verified Google login must return its previously recorded Supabase UUID, leave users2, add at most the expected Google identity, and preserve separate sessions. Stop if linking fails; never reopen public signup or merge/recreate identities as a workaround.
- Approve synthetic data/account-isolation, consent, token lifecycle and unknown-account negative test scope separately. Google Testing restrictions may mask Supabase signup rejection; mark untested layers UNKNOWN rather than involving an unapproved identity.

No cleanup/rollback needed for this verification. No additional account is approved. Preserve restricted evidence and backups; no deletion or automatic restore. Stop here.
