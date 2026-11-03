# Phase C.1B — Two Google test identities: provisioning and acceptance plan

Date: 2026-10-29 (Europe/Berlin). **Preparation only; no hosted operations performed.** Only local documentation and current official documentation/source were reviewed. No users, identities, sessions, clients, grants, settings, deployments, commits or pushes were created/changed. No production access or secrets inspected. This plan grants no mutation authority.

## Decision and supported approach

**GO for review of a two-account administrative provisioning scope; NO-GO for execution until exact identities, ownership attestation and scope are approved.** Keep public signup disabled. Google Testing mode is an additional provider filter, not an MFD user registry.

Use supported administrative creation to establish two verified existing staging users, then Google's verified identity links to those same Supabase UUIDs on later approved sign-in. Do not create Google identities manually, reopen signup, match owner IDs by email in application code or add privileged keys to the independent Worker.

| Method | Assessment |
| --- | --- |
| Supabase owner dashboard, Auth Users → Add/Create user | Preferred operational path: avoids distributing a service credential. Inspect actual UI options before saving; require exact email/confirmation/password behavior. No dashboard creation was attempted. |
| Server-only Auth Admin createUser | Documented supported API alternative. Can specify email and explicitly authorized email confirmation; use an existing securely handled administrative credential outside Worker/browser/source/chat. No new credential requested and no API invoked. |
| Administrative invitation | Supported alternative with email delivery/acceptance side effects; would require separate approval and correct live redirect/verification flow. Not selected while callback/deployment is pending. |
| Ordinary signup/first Google signup | Rejected for provisioning: signup stays disabled. |
| Raw SQL inserts into auth.users/auth.identities or fabricated Google subject | Rejected; bypasses provider-managed account lifecycle and identity verification. |
| Manual identity linking | Not selected; no enabling a new Auth feature or cross-email linking workaround. Stop for separate review if automatic verified linking fails. |

[Supabase createUser reference](https://supabase.com/docs/reference/javascript/auth-admin-createuser) documents administrative creation and warns against browser exposure of privileged credentials. [General Auth configuration](https://supabase.com/docs/guides/auth/general-configuration) states signup-disabled permits only existing users to sign in. These are distinct administrative and public operations.

## Evidence for closed-signup Google linking

[Official identity-linking documentation](https://supabase.com/docs/guides/auth/auth-identity-linking) describes automatic linking to an existing matching-email user and protection against unverified-email takeover. Treat email normalization/verification and provider linkage as Supabase decisions; the Worker authorizes only the verified user subject. Avoid SAML/SSO accounts for this Google-only test roster.

Current [upstream Auth external callback source](https://github.com/supabase/auth/blob/master/internal/api/external.go) performs account-linking decisions before its new-account branch. LinkAccount attaches an identity to the existing user, while CreateAccount checks DisableSignup and rejects when enabled. This supports the planned distinction between adding an identity to an existing approved account and registering a new user. The [admin creation implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go) is a separate administrative endpoint. Upstream master is not proof of the deployed Auth release or every project setting; real closed-signup linkage remains a required hosted acceptance test.

**Expected counts:** from zero, admin provisioning should produce exactly two users and the administrative method's normal identity records, with no login sessions. Capture that actual identity baseline rather than assuming it. First Google sign-in may legitimately add one Google identity per approved user. That is expected identity creation, not a duplicate account. Repeat Google sign-ins must not add another identity for the same provider subject. Two users with email+Google commonly have four identities total; assert the actual recorded per-user inventory and unique provider-subject associations, not a blanket “identities never change.”

## Approved account selection — exact emails collected locally later

| Required field | Test A — primary | Test B — secondary |
| --- | --- | --- |
| Exact Google account email | Request privately through a local prompt before provisioning | Request privately through a local prompt before provisioning |
| Controller/ownership attestation | User confirms own primary Google account | User confirms own secondary Google account |
| Google Testing-mode inclusion | Confirm for exact account | Confirm for exact account |
| Classification | User-controlled personal test identity | User-controlled personal test identity |
| Administrative confirmation authorization | Required, scoped to owned email | Required, scoped to owned email |
| Supabase UUID | Assigned only after approved creation | Assigned only after approved creation |
| Initial identity inventory | Record privately after creation | Record privately after creation |

No email is inferred from Cloudflare login or any other connected account. Exactly two positive test identities require approval; do not add aliases, plus-address variants or alternate accounts to resolve a mismatch. An actual personal Google account is not described as synthetic. Record the private roster/UUID mapping in restricted operator evidence; repository reports may use A/B labels. Never include passwords, provider tokens, codes or secrets.

## Ordered provisioning procedure — future approval only

1. **Read-only baseline:** reconfirm exact project gngnrmzeghjzqsmzuktl, disable_signup=true, Google enabled, anonymous disabled, both writes=false, current counts, exact callback/redirect before-values and recovery evidence. The baseline supplied for this plan remains zero users/identities/sessions/native clients/grants; no new hosted verification was performed here.
2. **Ordering gate:** perform the separately approved audience transition while the current zero-user/session operational preflight still holds, before creating users; or explicitly approve a revised operational baseline that records the two approved users. Do not weaken the SQL empty local-client/grant/proposal guards or silently treat planned users as drift. This plan does not approve audience execution.
3. **Exact provisioning approval:** approve the completed two-row roster, verified ownership, method, intentional email-confirmation choice and any password handling. Proposed default is two email-only administrative records, email_confirm=true only with explicit ownership attestation, no invitation/email flow. If the chosen method can omit a password, omit it for Google-only accounts; if the actual supported UI/API requires one, use separate strong random passwords retained privately by their controllers, with no password login unless separately included in acceptance. Inspect actual method behavior; do not improvise provider metadata.
4. **Create sequentially:** owner creates A once, records UUID/confirmation/identity inventory, checks count1, then B once and checks count2. No retry on an ambiguous network result until read-only evidence establishes whether the first creation succeeded. No sign-in, email change, identity linking, diary fixtures, native clients or section grants as part of account creation.
5. **Provisioning postcheck:** exactly the two approved UUIDs and expected verified email states; zero sessions; no native/local OAuth clients/grants added by this scope; signup remains disabled and both writes false. Stop on unexpected triggers/data effects and review before continuing. Admin creation is not a grant of application-wide or cross-user rights.
6. **Later Google acceptance gate:** only after separately approved reachable Worker, exact Supabase redirect /auth/google/callback, Google provider callback, hook/client/audience/local-registry setup and testing scope. Each controller signs in through the Worker using their approved Google account. Never ask the agent to capture Google credentials.
7. **Verify identity before data tests:** compare returned verified user/sub to recorded UUID, inspect only approved provider/user-ID association metadata and counts, confirm user count remains2. If a new UUID/user appears or linking fails, stop immediately; do not merge/delete/edit emails, enable manual linking or reopen signup automatically.

Google callback boundaries remain: Google→https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/callback; Supabase→https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback; native MCP OAuth→the exact approved ChatGPT callback. The Google client ID is not an MCP client ID.

## Acceptance matrix — not executed

All interactive login/negative tests are separately authorized hosted operations, even when expected to fail. Use isolated browser profiles and private evidence; never log tokens/codes or authenticate as database operator to prove isolation.

| Test | Required result / evidence |
| --- | --- |
| Admin provisioning | Exactly2 approved user UUIDs; expected per-user email identity/confirmation baseline;0 sessions before login; signup remains disabled |
| A Google first sign-in | PKCE/state/CSRF callback succeeds; verified user/sub=recorded A UUID; user count2; one Google identity linked to A |
| B Google first sign-in | Same for B; distinct UUID/provider subject; user count2 |
| Repeated Google sign-in | Same UUID each time; one Google identity per provider subject; no additional users or duplicate identities |
| Session fixation/switching | Alice's active browser session cannot silently become Bob; logout then fresh flow permits deliberate switching; pending authorization account mismatch rejected |
| Unknown Google account | No Supabase user/session/identity created and no data access; counts for approved accounts unchanged |
| Provider-level unknown denial | Account outside Google Testing allowlist rejected by Google; label as provider-only evidence, not proof of Supabase signup enforcement |
| Supabase-level unknown denial | Requires an explicitly authorized controlled negative-test Google identity allowed by Google but absent from Supabase; signup-disabled rejection with unchanged counts. No third identity is authorized by the two-account decision, and no friend’s account may be used. A future separately approved user-controlled negative-test identity would not be provisioned as an MFD user and any Google test-list change would need separate approval. Until then mark this layer NOT VERIFIED; never claim the provider-only denial tests it. |
| Cancellation/wrong state/verifier/replay | Generic denial, temporary context cleared, no section grant; one-time code cannot be reused |
| Callback/issuer/audience | Exact paths and staging issuer/resource; wrong redirect/issuer/audience/token/expired session rejected, no fallback |
| Native consent ownership | A cannot view/approve B authorization or vice versa; initially no local section grant; explicit selected sections only |
| Account-isolation fixtures | Only separately approved synthetic data, written through each owner's normal supported browser/API path. A cannot read/update/delete B workspace or restricted photos/other owner records; reciprocal test. Shared/social reads are tested against their intentional policies rather than blanket denial. |
| MCP isolation | Authorized A client reads only A consented fields/sections; unconsented sections/wrong session/client and forged owner arguments denied; repeat for B |
| Direct API/OAuth restriction | OAuth tokens cannot bypass MCP through direct REST/RPC/storage; private schemas inaccessible; ordinary first-party owner behavior remains RLS-scoped |
| MCP writes | Database writes_enabled=false and runtime MFD_MCP_WRITES=false before/during/after; mutation tools unavailable/denied. This does not prohibit separately approved owner/browser fixture writes. |
| Refresh/revocation | Correct user on refresh; rotation/reuse and expiry tested; removed local consent/session denies old-token diary access; native revoke failures remain closed locally |

Do not require “no identities created” during the first legitimate link: require only the two approved users and the expected new Google identity per user. Do not change emails/provider metadata to force linking. Google account switching and native section consent remain separate decisions.

## Failure, rollback and cleanup

There is no single transaction across two administrative creations and Google sign-ins. Failure after A exists does not authorize deleting A or blindly recreating it. Record partial count/UUID state, keep signup disabled, stop for a scoped recovery decision. Never restore the pre-remediation backup over hosted staging.

For an unexpected identity/session/data access: stop login/acceptance and use separately approved service containment. Preserve logs/evidence without secrets. Revoke affected native/local grants and sessions through supported APIs only under explicit cleanup approval; do not remove RLS/policies to inspect data. Existing live-session checks are important because revoking refresh tokens/deleting users alone must not be represented as instant invalidation of every stateless access JWT.

Proposed cleanup order, separately reviewed/approved against exact UUIDs: stop test traffic; remove/revoke test-specific MCP consent/proposals/native authorizations as appropriate; invalidate sessions/refresh through supported Auth operations; inventory each test user's workspace/social/photo/storage records and FK/cascade effects; then delete only approved synthetic records/objects and finally approved test users using supported admin lifecycle operations. Do not delete shared clients or another user's data automatically. Do not assume deleting a user also cleans Storage objects; handle storage ownership/dependencies explicitly before deletion. Preserve required backups/provenance and consent to retain/remove controlled personal test data. Identity unlinking changes account login capability and also requires separate review.

Post-cleanup read-only checks must match the approved target counts, absence of affected live sessions/grants, retained security policies/private buckets, signup disabled and both writes false. Provider Google credentials/configuration, OAuth Server, keys and other app settings are not automatically reverted. Never reopen signup as rollback; it needs new explicit approval.

## Unresolved risks and approval requirements

- Account selection and ownership are confirmed: user’s primary and secondary Google accounts only. Exact emails are not collected, and administrative confirmation/provisioning execution are not yet approved. No accounts can be created yet.
- Closed-signup linking is supported by documentation/current upstream design, but the actual hosted Auth build/provider/email verification behavior has not been exercised. Stop rather than weaken controls on failure.
- Administrative confirmation is a trust action: incorrect ownership attestation could pre-provision the wrong account. Never use arbitrary email_confirm=true or app email matching as an identity shortcut.
- Unknown-account testing has two layers; Google Testing restrictions can mask the Supabase restriction. Third negative-test identity/control changes need their own scope or remain unverified.
- Creating accounts changes the earlier zero-user preflight. Resolve audience ordering explicitly before provisioning. No SQL guard is changed here.
- Reachable callback/service, Auth hook/path/DCR, exact native client and audience/runtime configuration remain separate prerequisites. Hosted configuration/client/deployment/user-test scope has not been approved.
- Small test use consumes existing Auth MAU/API/email/egress allowances. No paid service/upgrade or resource is authorized; no invitation email required by selected administrative creation plan.

**Next approval package:** exact two-row roster; controller/ownership and confirmation attestation; supported admin creation method/password policy; audience-before-provisioning or explicitly revised preflight baseline; provisioning-only postchecks and stop/cleanup boundaries. Sign-in/linking/data tests are separate approval scopes. Preparation complete; stop before mutation.


## Primary/secondary account decision and exact approval proposal — 2026-10-29

The user confirms that both positive Google test accounts belong to them: A is primary, B is secondary. **No friend or other third-party account is involved.** This approves which two accounts the plan should cover, not their creation or a hosted login. The actual email values are deliberately absent from repository documents/configuration/logs.

### Private local collection, before any approved provisioning

After execution approval, request the two exact addresses in a local non-echo terminal prompt or have the user enter them directly into the staging owner dashboard. Do not request them through chat, embed them in command arguments/history, print prompt responses, infer them from connected services, or write them to reports/Git/logs. Use only A/B labels and restricted UUID mappings for subsequent evidence. If local tooling is used, keep the values in process memory for the operation and redact API responses/errors rather than logging entire user objects. Any persisted roster requires a separately agreed owner-only location outside Git; no such file is needed or created now.

Require two distinct entered addresses; do not rewrite plus aliases/dots/case to guess account equivalence. The user privately checks that A and B correspond to their intended primary/secondary Google accounts and confirms both are included in the staging Google Testing audience. A mismatch stops creation. A non-echo prompt is input privacy, not proof of Google account control; preserve the explicit ownership/confirmation approval and later verified-provider subject test.

### Proposed operations requiring approval

1. **Preflight only:** target gngnrmzeghjzqsmzuktl, verify signup disabled, Google enabled, unchanged write switches/security and expected inventory. Record counts/labels, not emails. No hosted SQL in this preparation task.
2. **Resolve ordering:** retain audience-before-provisioning, or explicitly approve revising the external zero-user expectation to recognize these two intentional users. Audience SQL remains a separate approval; do not execute it under provisioning approval or modify its empty-client/grant/proposal guards.
3. **Collect exact emails locally** as above; stop before mutation if either is missing, duplicated or not privately confirmed by the user. No third account, no friend’s account.
4. **Supported administrative creation only:** prefer the owner staging Auth Users dashboard. An existing securely authenticated server-side Auth Admin createUser is an alternative if separately chosen; never obtain/use a privileged key in the Worker or put it in chat. Create A, verify exactly one new UUID, then create B, verify a second distinct UUID. Use only the standard authenticated role; no custom authorization metadata or fabricated Google identities. email_confirm=true is proposed only with explicit approval of administrative confirmation for these two owned addresses. Omit a password if the selected supported method permits; if it requires a password, agree on unique privately handled random passwords before execution. No invitation email, sign-in, identity linking, fixture/data write or MCP consent is included in the creation operation.
5. **Read-only postcheck:** exactly the two new UUIDs and expected admin-created identities, zero sessions until separately approved sign-in, no clients/grants added, signup still disabled, both writes=false. Do not retry ambiguous creations before checking whether they succeeded.
6. **Later separately approved Google acceptance:** isolated primary/secondary browser profiles; returned verified user UUID must equal that account’s recorded UUID. First linking may add one Google identity per account; later logins may create sessions but not users/duplicate provider identities. Sessions remain associated with the correct separate user UUIDs. Existing-user email linking is a provider decision, not an app owner lookup. Existing account switching protection still requires logout before switching within one Worker browser session.
7. **Later separately approved isolation tests:** A/B synthetic data through supported owner flows; reciprocal read/update/delete denial and native consent-owner checks. MCP mutation tools remain unavailable. Unknown-account live testing is NOT VERIFIED until an explicitly allowed negative-test identity exists; do not involve a friend or silently expand the two-account scope.

### Stop and recovery boundary

Stop immediately on Google linking failure, changed UUID, duplicate user/provider identity, unexpected session owner, cross-account access or a write switch becoming true. Keep public signup disabled; never enable it to fix linking. Do not merge/delete/recreate accounts, change their emails, enable manual linking or bypass consent/RLS automatically. Partial creation is recorded as partial, not rolled back by deleting a user without approval. Cleanup requires exact-UUID/session/grant/data review and separate deletion/revocation approval as described above.

**Approval requested in substance, not executed:** administrative provisioning of only the privately entered primary and secondary accounts, explicit confirmation/password method, ordering decision, sequential postchecks and stop conditions. Google login, linking, data fixtures/testing, audience changes, Auth configuration, deployment and cleanup remain separate scopes. Current decision: GO for approval review; NO-GO for provisioning until that approval and private local inputs exist. This revision changed documentation only and made no hosted calls.

## Final pre-provisioning review — primary only, then mandatory stop

Date: 2026-10-29. This section supersedes earlier instructions to create both accounts in one approval window. No hosted query, account creation, Auth setting change or SQL execution occurred in this review.

**Recommendation: conditional GO for approval of primary-account creation only; NO-GO for execution until the exact address is privately supplied and administrative confirmation/method are approved.** Secondary creation, Google login, linking, sessions, deployment and isolation tests remain separate later scopes.

### Exact supported creation mechanism

Preferred operational delivery: owner selects staging gngnrmzeghjzqsmzuktl → Authentication → Users → Add/Create user. Inspect the actual UI before saving. If it requires a password or sends an invitation, do not silently substitute that behavior for the proposal below; stop and agree the precise method.

The documented API equivalent is server-only `supabase.auth.admin.createUser({email: primaryEmailFromPrivateInput, email_confirm: true})`, against https://gngnrmzeghjzqsmzuktl.supabase.co (Auth endpoint POST /auth/v1/admin/users). The email variable must come from local non-echo input or direct dashboard entry, never hardcoded/logged/passed as a command argument. Use only a supported administrative session; no SQL inserts or privileged credential in the Worker/browser/chat. Available connector tools do not currently offer this administrative creation action, and no local administrative credential has been established. Therefore owner-dashboard execution is the practical proposed delivery; do not imply the agent can execute it using read-only SQL credentials.

[Official createUser documentation](https://supabase.com/docs/reference/javascript/auth-admin-createuser) explicitly shows email_confirm:true without a supplied password. This is account creation, not sign-in, so the first operation should create no session or OAuth consent and need not send an invitation email.

### Confirmation and password semantics

- email_confirm:true deliberately marks the address confirmed without an email verification ceremony. Approval must explicitly attest control of the privately entered primary Google address and authorize that confirmation. Do not infer this permission merely from the prior decision to use two owned accounts.
- Keep the project's email-confirmation/global signup settings unchanged. Confirmation applies to this single approved account only.
- Omitting a password is supported by the documented API example, but **does not establish that the stored account is passwordless**. Current [upstream administrative implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go) generates a random password when none is supplied. The hosted implementation may differ; no generated password should be extracted or displayed. This corrects any earlier implication that omission guarantees absence of password authentication.
- If the dashboard requires an operator-supplied password, use a unique strong random value handled privately and explicitly approve that variant before saving. No reused Google password, shared test password or password reset/login is included. No Google secret is required for administrative creation.

### Google linking with signup disabled

[Supabase identity-linking guidance](https://supabase.com/docs/guides/auth/auth-identity-linking) supports linking a verified provider identity to an existing matching-email user. Current [upstream external callback implementation](https://github.com/supabase/auth/blob/master/internal/api/external.go) treats LinkAccount separately from CreateAccount; the latter checks DisableSignup. Thus an existing approved confirmed email user can be a candidate for first Google-identity linking without permitting a new user signup. Supabase, not the application, determines identity equivalence/provider verification.

This is a supported design, not proof of deployed behavior. Later acceptance must verify the Google result maps to the recorded primary UUID and adds only the expected Google identity; user count stays1 until secondary provisioning, then2. Repeat login must not duplicate either. If matching/verification/provider linkage fails or a new UUID appears, stop; no email rewrite, user merge, manual identity insertion, public-signup enablement or manual-linking activation.

Risks: a typo or incorrect administrative ownership attestation can precreate the wrong confirmed account; an unverified precreated email creates takeover/linking hazards; aliases/provider normalization can differ from operator assumptions; a duplicate/ambiguous request can leave a partial creation. Collect the actual address privately and confirm it with the owner, check existing inventory before creation, and never blindly retry an ambiguous response. No friend/third-party account is involved.

### Audience migration ordering — clarified

**The audience migration is not technically required before administrative user creation or Google first-party account linking.** It controls MCP resource audience; it does not create or authorize the first-party Auth account. Inspection of the actual proposal confirms its SQL gates empty mfd_mcp.clients/grants/proposals, not zero auth.users/sessions. The earlier zero-user requirement was an external operational baseline, not a database/security dependency.

The user's proposed primary→verify→stop→secondary→later OAuth test sequence is therefore compatible with performing audience migration afterward, before local MCP client registration/consent. Revise the external execution preflight to recognize only the explicitly approved UUIDs/counts (first1, later2), with no unexpected users/sessions; do not retain a contradictory blanket zero-user requirement. All SQL security guards, RLS, session/consent/ownership checks and false write switches stay unchanged. Audience SQL still needs its own approval/hash/security/recovery preflight; provisioning approval does not authorize it. No public signup window is necessary in either order.

### Exact first operation proposed for approval

1. Read-only preflight, only staging: current disable_signup=true, Google enabled, both writes=false and expected zero users/identities/sessions/native/local clients/grants. Stop on drift; do not delete unexpected accounts.
2. Privately request only the primary account's exact email; confirm ownership and intended primary classification. Do not collect or create the secondary yet.
3. Approve one administrative creation, including email confirmation and either omitted API password or the explicitly reviewed dashboard-required random-password variant. No provider/URL/hook/OAuth/signing/audience setting changes.
4. Owner creates exactly one account once through the chosen supported method. If delivery differs from the approved method, stop before saving.
5. Read-only postcheck: total users1, intended new UUID present/confirmed, actual initial identity inventory recorded privately, sessions0, native/local clients/grants0, signup disabled, Google enabled and both writes=false. No Google sign-in or linked Google identity is expected merely from admin creation. Review any trigger-created application metadata rather than asserting that no trigger exists.
6. **Stop and report primary UUID/Auth state using labels/restricted evidence, never email/password.** No automatic secondary creation. Request a separate secondary-account approval only after this review.

### Rollback and cleanup

If no creation request succeeded, there is no account to roll back. On an ambiguous response, inspect read-only state before retrying; do not risk a duplicate. If the primary exists but any postcheck fails, stop with the partial state and preserve signup disabled. Deletion is not an automatic rollback: it requires explicit approval for the exact new UUID after checking sessions, grants, storage/application FK/cascade effects and any unexpected data. Use supported Auth lifecycle operations; never drop policies or restore a database. Sessions/refresh and local/native consent must be handled before deletion if later flows have occurred; deleting a user alone is not blanket proof all access JWTs are invalid. No re-enabling signup, key changes or provider disablement as recovery.

**First-account scope is bounded and supportable. GO to approve that scope with private primary input/confirmation/method; not authorization to execute now.** No full Google/MCP acceptance readiness is claimed. Secondary, unknown-account negatives, audience transition, Auth setup, Worker deployment and data-isolation tests remain unapproved and unexecuted.
