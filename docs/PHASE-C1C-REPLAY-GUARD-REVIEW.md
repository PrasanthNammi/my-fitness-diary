# C.1C — Replay session guard correction

Date: 2026-10-30, Europe/Berlin. **Implemented and verified locally only. No hosted SQL, grant changes, Auth changes, login retry or Worker deployment.** This report supersedes the preliminary diagnosis of REPLAY_SESSION_RPC_DENIED; it does not convert the failed hosted acceptance into a PASS.

## Root cause and evidence

The deployed dispatcher treats an owned row in auth.sessions as a live session. Refresh reuse detection can revoke all refresh tokens while that row remains. The dispatcher therefore has no check for the observed revoked-family state. Supabase's [session documentation](https://supabase.com/docs/guides/auth/sessions#what-is-refresh-token-reuse-detection-and-what-does-it-protect-from) describes family revocation; its [Auth implementation](https://github.com/supabase/auth/blob/master/internal/models/refresh_token.go) updates refresh-token revocation separately. Upstream master is explanatory evidence, not a claim about the exact hosted binary version.

Independent read-only staging inspection, without selecting any token/code/cookie column, confirms: the disposable PRIMARY session row remains with three revoked refresh rows and zero unrevoked rows; SECONDARY has one unrevoked row. All ten original session groups have an unrevoked refresh row, including both OAuth-client sessions. The existing session_id/revoked index is present. Function body and security state remain unchanged. The hosted harness did not preserve the precise failing HTTP response, so its fixed failure category alone does not prove a particular response status. Actual disposable Postgres tests establish that the deployed function allows connections in this retained-row/all-revoked state and that the patch rejects it.

The previous local lifecycle model removed sessions upon revocation. It did not represent this provider behavior, which is why those earlier synthetic tests passed. The new database regression explicitly retains the row. This is an application session-enforcement gap, not a broken Google login or evidence of cross-account data exposure.

## Narrow correction

Replace only mfd_mcp.dispatch(text,jsonb)'s initial session predicate. Require an owned session whose not_after is absent or future, plus at least one auth.refresh_tokens row with the same session_id, matching user_id and revoked=false. NULL revoked, a refresh row for a different owner/session, all-revoked families and missing sessions fail closed. The check reads identifiers/booleans only; it does not retrieve token material. Existing client/audience/live-consent/owner checks and the reconnect authorization_binding branch remain intact. This predicate covers all dispatch operations through both the public wrapper and intentional direct authenticated entry point.

Normal rotation revokes the old token and inserts its successor in one provider transaction. A normal READ COMMITTED statement sees either committed version, both of which contain a live successor. The regression models committed rotation and verifies continued access; no claim of a full hosted concurrent-rotation stress test is made. In-flight requests that began before revocation committed are not retroactively canceled. Future provider schema/refresh-storage changes require compatibility review; absence of a qualifying row fails closed.

No GRANT/REVOKE, ACL/RLS, ownership, security mode, search_path, schema, user/session/refresh row, grant/consent or fixture change is included. Existing authenticated dispatcher EXECUTE and authenticated/service_role invoker-wrapper EXECUTE are preserved. SECURITY DEFINER and empty search_path remain as reviewed. No canonical/historical SQL or previously approved artifact was silently rewritten; this is a separate staged proposal.

**Boundary:** this correction hardens the MCP dispatcher. It does not change workspace/storage RLS policies, turn provider JWTs into immediately revoked credentials at every unrelated API, or establish native OAuth-client lifecycle acceptance. Direct first-party table access after refresh-family revocation remains a separate acceptance/design question. Do not claim system-wide token revocation from this patch.

## Verification

| Check | Result |
| --- | --- |
| Retained session + fully revoked family reproduces old access | PASS actual disposable SQL |
| Forward correction denies old first-party and OAuth RPC access | PASS wrapper and direct dispatcher callers |
| Another live same-owner session cannot revive the revoked session | PASS |
| Wrong-owner refresh, NULL revoked, absent/wrong-owner session | PASS denial |
| Normal committed rotation with live successor | PASS continued access |
| Finite expired timebox versus NULL/future timebox | PASS |
| Other owner's profile remains isolated and available | PASS |
| Users/sessions/refresh rows/grants/fixtures/policies/settings/ACLs unchanged by migration | PASS snapshots |
| Exact recovery restores before-body, including known gap | PASS; never automatic |
| Late forward/recovery errors roll back atomically; repeat forward refuses drift | PASS |
| ACL drift refusal without repair | PASS |
| Complete network-blocked test suite | PASS62/62 files |
| Hosted patched behavior / fresh H2 and H3 | NOT TESTED; separate approval required |

An initial generated proposal accidentally used the after-body hash in its before-body assertion. The local migration test correctly rejected it; the assertion was corrected and all tests passed. No hosted SQL was submitted. No runtime TypeScript or Worker code changed, so this SQL-only task did not regenerate/deploy a Worker or repeat unrelated native browser/Worker checks. Existing native evidence for the unchanged Worker remains recorded separately.

Local runner: Node22.13.1 tests/run-local-checks.cjs. Detailed disposable SQL regression: [replay-session-guard.cjs](../tests/replay-session-guard.cjs). Full output retained in ignored .sites-runtime/c1c-replay-fix/tests.log. No credentials or hosted token material are in tests/evidence.

## Exact artifacts

| Proposal | SHA-256 |
| --- | --- |
| [Forward SQL](../database/staging/c1c-replay-session-guard.proposed.sql) | 3255554064d35a7a4fee9aa6f27df2ffcbf4f20ff859c2d30c5fe31c038bff1c |
| [Recovery SQL](../database/staging/c1c-replay-session-guard.rollback.proposed.sql) | dcb71f0df7582365f4b4c22a185558a67740095372b6c60534dec3b23e0eaa79 |

Normalized body MD5 (CAS identity, not artifact integrity): before7d93d522e07936bca67faa53903d4868; after2e64d4e8a8d55ca50701e764a70d0258. [Manifest](artifacts/c1c-replay-session-guard-manifest.json) pins SQL and regression. SHA-256 above is the file-integrity boundary. Recovery restores the known weaker guard and therefore requires a separate security decision; it is not permission to recover automatically. No new Worker/config checksum is proposed by this correction.

## Next single hosted step — separate approval, SQL only

Proposed approval covers exact forward SQL once against staging gngnrmzeghjzqsmzuktl, with read-only pre/postchecks. No browser interaction, new session, token use, recovery SQL or Worker deployment belongs to this step.

Immediately before execution: independently verify project/connection; exact forward/recovery hashes; body7d93…; postgres owner/SECURITY DEFINER/empty search_path; exact dispatcher ACL and invoker-wrapper body/ACL including service_role; expected audience/writesfalse; two original users and all original sessions; Profile-only grants/consents/fixtures and baseline security. Confirm the required refresh-table columns and index and that all preserved original session IDs have an unrevoked correctly owned refresh row. Identify the two prior disposable sessions using restricted evidence; do not mistake the all-revoked test session for unexpected production drift. Stop on any unexplained state change. Use the transaction's exact boundaries/timeouts and its target assertion mfd.c1c.target_ref; external project verification must not be replaced by caller-supplied assertions.

Execute once; independently verify after-body2e64…, identical ACL/owner/modes/wrapper, and unchanged session/grant/fixture/security boundaries except the approved function definition. On failure/ambiguous commit stop read-only; no retry or recovery. This approval cannot alone establish live bearer denial because the earlier harness correctly discarded its tokens. After successful SQL verification, prepare one separate bounded fresh-session H2/H3 acceptance attempt; existing connections must remain preserved. The prior optimized Worker deployment remains gated and is not needed for this SQL fix.

**GO for review of the exact SQL-only staging correction. NO-GO for production/full acceptance or claiming H2/H3 complete.** No operator action or fresh login is needed during this completed local implementation.

## Approved SQL-only execution — COMMITTED/PASS

Submitted 2026-10-30T14:52:26.919Z; independently verified 2026-10-30T14:55:25.108Z (UTC; Europe/Berlin is UTC+1). Exact forward SHA256 3255554064d35a7a4fee9aa6f27df2ffcbf4f20ff859c2d30c5fe31c038bff1c rehashed immediately before submission. Applied once through the supported migration API as c1c_replay_session_guard; the API reported success and a separate read found the committed after-body2e64d4e8a8d55ca50701e764a70d0258. The exact SQL was preceded only by its documented same-session target assertion; external get_project/connection/preflight supplied independent staging verification. No retry, reverse SQL, session mutation or Worker deployment. Migration-history registration is part of the supported DDL operation.

All12 existing session rows are unchanged, including all10 original pre-test sessions; all10 originals still have a correctly owned live refresh row. Disposable primary remains fully revoked/retained; secondary remains live. Two users/original UUID set, identities4, native/local clients1/1, two Profile-only grants/active consents, two fixtures and proposals0 unchanged. Refresh/session metadata digests unchanged. The public invoker-wrapper body/ACL including service_role, dispatcher ACL/owner/definer/empty search_path, table/schema/RLS/policy/storage and unrelated function boundary match. Excluding only the approved dispatcher body, the security digest remains1b8f362223f85e081722289efdb79508. Both write switches retain prior state; database writesfalse freshly verified, no Worker change. Original inventory digest remainsbefbb5ee8105a4d45b70e5c7734e03ad.

These are committed-source and preservation checks, not a new bearer-token test. Earlier tokens were discarded; H2 remains RETEST REQUIRED and H3 NOT TESTED. No claim of production readiness. [Sanitized execution receipt](artifacts/c1c-replay-guard-execution.json).

### Next separate approval boundary: one fresh lifecycle batch

Use the unchanged reviewed Safari18-file manifest1491b31097581d3ca3452c8894d5eb7186d0f2ead32e5183148b89a2179453ba against the newly verified SQL and unchanged current Worker. Preserve all12 current session rows and both working integrations. At most one fresh Google PKCE flow per existing identity in two explicitly dedicated private Safari windows, no retry; only newly harness-owned codes/tokens in memory. The repeated short H1 checks are justified as regression for the changed live-session predicate. Retest H2 primary rotation/non-parent replay and immediate RPC denial, then H3 secondary natural expiry/refresh/scope=local logout/denial. Limits unchanged: at most30 runner requests,5minute login flows,12second replay wait and at most70minute expiry wait; browser/provider HTTP traffic remains outside machine counter. Fresh target/security/artifact/session-policy preflight mandatory; preserve the old run lock/evidence by archiving it only after new explicit attempt approval. Stop on unexpected behavior; no recovery, grant revocation, new client/user, deletion, SQL change or Worker deployment in this next batch. Google selections are the only authentication handoffs; natural expiry needs no user action. This section prepares the next step; it does not start or authorize it.

## User-directed post-SQL attempt — secondary pairing stop

2026-10-30: real primary PKCE and initial signature/owner/direct-API/Profile-only/MCP-rejection assertions passed against the installed guard. Stopped at secondary private-window pairing with SAFARI_WINDOW after7 runner requests. No secondary exchange, H2 replay, H3 expiry/logout, deployment or retry. Read-only postcheck: users2; all12 preceding session rows retained plus one new primary disposable row (13 total); original grant/consent/fixture inventory unchanged; writesfalse. The new primary session is retained; its tokens were discarded when the process exited. This is not a replay-guard failure or full H1/H2/H3 PASS. Local handoff must provide a clear secondary-window preparation stop before another live attempt. [Sanitized receipt](artifacts/c1c-secondary-window-stop.json).

Local handoff preparation proposal: scripts/c1c-safari-owned-window.stepwise.proposed.cjs, SHA256 2b77720849ec48d6ce2f980732152076fa8d407c546219983a87edfdae127e27. Missing/no-window or wrong-tab-count preparation now permits up to3 explicit preparation dialogs before any Google navigation, verifier creation or callback exchange. Unknown errors still stop. New network-blocked tests/c1c-safari-preparation.cjs PASS for secondary-not-ready recovery and bounded failure without authentication operations. This proposal is not wired into the hash-pinned live runner, not approved as a replacement manifest and not live-executed; the original manifest remains unchanged. It addresses recoverable window preparation, not retrying a failed login.

## Stepwise handoff review complete

[Replacement review](PHASE-C1C-STEPWISE-HANDOFF-REVIEW.md): local63/63 PASS, missing-window preparation is recoverable only before authentication; exact new manifest d5a056d90e007122b3db129ebc99c49cc077ead9270359633cae02806e6d25cc. Updated synthetic provider retains revoked session rows and tests the installed replay guard. No live run or deployment in this review. New restricted method/baseline required; historical approvals/locks are not reused.
