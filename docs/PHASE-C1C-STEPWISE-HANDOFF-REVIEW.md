# C.1C — Reviewed stepwise Safari handoff

Date: 2026-10-30, Europe/Berlin. **Local verification complete; no live run started with this replacement.** This replaces the earlier one-shot window-preparation harness, not the application Worker. Existing hosted H2 failure is still RETEST REQUIRED after its separately installed SQL correction; H3 is NOT TESTED. No production readiness claim.

## What changed

For each account, window preparation can now be corrected at most3 times within a shared5-minute setup deadline. Only fixed missing-window/not-running/wrong-tab-count results return to an explicit preparation dialog; unknown errors, cancellation, permission failures and timeouts stop. A numeric paired window ID is required before smoke checks or Google navigation. Error strings are never added to the used-window-ID set. Reusing a real window ID across identities is still rejected. The secondary dialog explains that no Google login has started for that account and waits for a fresh private one-tab window. Do not click Start until that window is ready.

No navigation, authentication, callback or exchange retry was added. Real Google flows remain one attempt per existing approved identity, callback codes and tokens stay in harness memory, and only the attested owned window is read/closed. Private-mode attestation is still human: Safari exposes no supported scripting property to prove it. No browser cookies/history are extracted. No callback URL copying is needed. Flow deadlines begin after preparation; the5-minute preparation and5-minute authentication limits are distinct.

The runner now requires method=safari-owned-window-stepwise and a new exact manifest. Old baselines fail closed before a run lock is created. Historical original manifests and stopped-run evidence remain retained; no old approval is silently relabeled. Live execution requires a new restricted baseline created after approval and fresh staging preflight. The test-only proposed helper copy is byte-identical to the actual helper and pinned by the manifest.

## Verification

- PASS63/63 network-blocked test files, including retained-session replay SQL regression.
- PASS missing primary/secondary preparation recovery, bounded3 checks/shared timeout, cancellation/unknown/permission refusal, window reuse and callback replay/Origin/CSRF checks.
- PASS integrated installed-SDK S256 → synthetic ES256 provider → actual PGlite/RLS/installed replay-guard chain. Both modeled identities initially lack a prepared window and recover before navigation.23 runner requests unchanged; no real Google/network traffic.
- Updated provider model revokes refresh rows while retaining the replayed session row. The installed SQL guard denies it. Normal rotation inserts the successor atomically; secondary local logout removes only its modeled disposable session. Original synthetic sessions/grants/fixtures remain unchanged. This is stronger local modeling, not a new hosted H2/H3 PASS.
- PASS native AppleScript compilation only. No Safari UI/Google/login/live session was launched in this review.
- Worker/configuration/SQL source untouched by this review. Existing Worker/native/build evidence is retained; no unrelated build/type/lint rerun is claimed for these CJS/AppleScript-only harness edits.

Ignored evidence: .sites-runtime/c1c-stepwise-review/tests.log; revised synthetic result .sites-runtime/c1c-engineering/safari-e2e.json; compiled bridge .sites-runtime/c1c-stepwise-review/safari-bridge.scpt. No secrets or real authorization material in evidence.

## Exact replacement and next approval

[Replacement manifest](artifacts/c1c-safari-stepwise-manifest.json), **SHA256 d5a056d90e007122b3db129ebc99c49cc077ead9270359633cae02806e6d25cc**, pins21 files, including the installed replay-guard proposal and installed SDK package version. [Bounded plan](artifacts/c1c-safari-stepwise-plan.json).

Proposed approval: one staging-only fresh H1–H3 batch with this exact replacement manifest against project gngnrmzeghjzqsmzuktl, unchanged Worker mfd-connect-staging and installed dispatcher body2e64d4e8a8d55ca50701e764a70d0258. Preserve all13 current session rows (including the earlier disposable rows), original two accounts, Profile-only grants/consents, clients, fixtures and false writes. Fresh preflight must check exact hashes, original session set, exact target/runtime/security, safe session policies and reuse10 seconds before authentication. Explain expected prior all-revoked disposable state instead of treating it as unexplained drift.

At most2 new harness-owned PKCE sessions/callback exchanges, one per approved identity. At most30 runner requests, no machine-counted cap for browser/provider HTTP traffic; at most3 pre-auth preparation confirmations per identity/shared5-minute preparation deadline;5-minute authentication deadline;12-second primary replay wait; at most70-minute secondary natural-expiry wait. H1 repeats only as regression for the new session guard; H2 retests rotation/non-parent replay/immediate RPC denial; H3 tests natural expiry/refresh/scope=local logout/denial. No current grant/client revocation, new users, existing-token extraction, settings/ACL/RLS changes, deployment, SQL/recovery, paid upgrade, commit/push or destructive cleanup. Stop on any authentication/security/provider failure without retry. Preserve all stopped-run locks by archiving only under the newly approved attempt authority.

Human sequence after approval: prepare the PRIMARY private one-tab window before the launcher starts; then click Start and choose PRIMARY. When SECONDARY preparation appears, open a new private one-tab window before clicking Start, then choose SECONDARY. Once both succeed, leave the terminal process running for expiry; no further browser work is needed. Operator can Cancel at any handoff. No immediate UI action requested by this local report.

**GO for approval of this replacement staging test batch. Full security/production acceptance remains NO-GO.**

## Approved live execution checkpoint — H1/H2 PASS; H3 waiting

2026-10-30: both real Google PKCE handoffs completed with the reviewed replacement. Live progress reached h3_wait_expiry after18 runner requests; last assertion EXPIRY_WAIT_BOUND. H1 genuine signatures/claims/owner/cross-owner/Profile-only/MCP-audience checks PASS. H2 real refresh rotation, old non-parent refresh rejection and immediate protected-RPC denial while the current JWT remained unexpired PASS after the installed guard. This closes the earlier specific H2 failure within the tested disposable first-party scope. No claim about native ChatGPT OAuth-client refresh/revocation follows.

H3 is still RUNNING, waiting for real token expiry; no accelerated clock, Auth expiry change or skipped wait. After natural expiry the same process will attempt the approved secondary refresh and scope=local logout/denial once. No extra browser work is required. Read-only checkpoint: users2, all13 preexisting session rows preserved plus2 new disposable rows (15 total), Profile-only grants2 and inventory unchanged, writesfalse. No Worker deployment, SQL change, cleanup or retry. [Sanitized live checkpoint](artifacts/c1c-stepwise-live-checkpoint.json).
