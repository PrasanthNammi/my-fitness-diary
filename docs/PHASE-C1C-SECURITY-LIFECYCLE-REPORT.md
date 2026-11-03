# Phase C.1C — Current consolidated security and lifecycle result

> **Current status (2026-11-02): see [PHASE-C1C-FINAL-ACCEPTANCE.md](PHASE-C1C-FINAL-ACCEPTANCE.md).** It supersedes the summaries below.

**Readiness rechecked 2026-11-02, Europe/Berlin:** GO for the existing controlled two-user Profile-only staging integration; NO-GO for production. Fresh actual connected reads return A/revision1 and B/revision1. Users2/identities4/session count15/native-local clients1/1/grants2 Profile-only/active consents2/workspaces2/proposals0; exact original-user-set digest and grant/fixture inventory match. Masked function/ACL/RLS/policy/schema/storage fingerprint and installed replay-guard body match. Database and Worker writesfalse; same active Worker version. Session count is fresh, but a fresh session-ID-set comparison was not part of this recheck. No new mutation/login or test rerun. No H3 completion baseline/result exists: the secondary-only completion proposal has not executed. The CPU candidate remains local, not deployed; no fresh CPU sample claimed. Remaining native OAuth-client/storage/operational gates are unchanged. [Recheck receipt](artifacts/c1c-readiness-recheck-20261102.json). Waiting alone will not complete the stopped batch.

Updated2026-10-30, Europe/Berlin. **H1 and H2 real hosted PASS. Natural-expiry denial independently PASS (403 bad_jwt/expired). H3 refresh/logout NOT TESTED after harness stop. Production readiness remains NO-GO.** Current statuses below supersede historical stopped-attempt reports. The batch is stopped; no live process is awaiting operator input. [Consolidated completion review](PHASE-C1C-LIFECYCLE-COMPLETION.md).

## Current acceptance matrix

| Requirement | Result | Evidence / boundary |
| --- | --- | --- |
| Both real Google PKCE handoffs using only the approved identities | PASS hosted | Reviewed stepwise Safari harness, two distinct newly owned callbacks exchanged once in memory; no copied URLs/old tokens |
| H1 genuine JWT signature/issuer/audience/role/session/expiry and owner binding | PASS hosted | Current runner reached EXPIRY_WAIT_BOUND after all H1 and H2 assertions; ES256 against public JWKS, original user UUID checks |
| H1 own-profile REST reads and cross-owner denial | PASS hosted | Original A/B revision1 markers through isolated first-party sessions; other-owner rows absent |
| H1 Profile-only grants and first-party token rejected by MCP | PASS hosted | Per-owner connections RPC exact consent; first-party bearer gets MCP401 |
| H2 primary refresh rotation, changed tokens, same user/session and refreshed signatures | PASS hosted | Two successful disposable-session rotations, verified claims/signatures; no original token used |
| H2 old non-parent refresh rejection outside reuse interval | PASS hosted |12-second wait beyond confirmed10 seconds; old token rejected |
| H2 current unexpired access denied private RPC after replay | PASS hosted | REPLAY_SESSION_RPC_DENIED now passes after installed SQL correction; pre-replay RPC was live |
| H3 genuine expiry, secondary refresh, local logout and post-logout denial | PARTIAL: expiry PASS; refresh/logout NOT TESTED | Independent403 bad_jwt/expired logs confirm denial; strict401-only test oracle stopped before refresh/logout. Mac sleep delayed timer past the planned wall-clock window |
| Existing primary/secondary ChatGPT profiles after SQL correction | PASS fresh connected-tool check | Actual connected app reads A/revision1 and B/revision1 while H3 waits; no reconnect/consent changes |
| Existing Profile-only section enforcement | PASS connected-tool boundary, carried forward | Earlier8 actual nutrition/workouts/routines/progress calls returned challenge/no data; raw denial wire status unavailable |
| Users/grants/fixtures/original sessions preserved | PASS checkpoint | Users2/identities4, all13 pre-batch session rows retained plus2 new disposable rows (15 total), grants/active consents2 Profile-only, clients1/1, workspaces2/proposals0/writesfalse; final post-H3 check pending |
| Session-family gap correction | COMMITTED / PASS local and H2 hosted retest | Exact SQL installed; dispatcher requires correctly owned live refresh row plus unexpired/NULL timebox; no ACL/RLS/grant changes |
| Full local regression | PASS63/63 files | Latest network-blocked run incl actual PGlite replay regression and improved pre-auth preparation; modeled provider now retains revoked session row |
| Types/lint/build/scans/native Worker/SQLite concurrency and restart | PASS within prior reviewed scope | Existing evidence applies to the unchanged application/candidate bytes; no claim that live traffic is a load test |
| Invalid JWT/CSRF/Origin/one-time callback/owner injection/read-only tools | PASS local/native and recorded bounded hosted negatives | Real-provider malformed/forged valid-token matrix remains distinct; no original credential extraction |
| CPU-optimized Worker candidate | LOCAL VERIFIED, NOT DEPLOYED | Exact05b1811… bundle; local8–14% warm CPU reduction; existing deployed version remains dcfcac5d… |
| Hosted Free CPU headroom | NOT CLEARED | Last measured mixed-route p99=16.912ms vs10ms documented allowance; no exceededCpu observed. Candidate deployment and representative metrics needed |
| Native ChatGPT OAuth-client forced refresh/reuse/revocation | BLOCKED under current preservation boundary | H1–H3 are first-party sessions, not evidence about client-held OAuth refresh tokens; no existing grant revocation |
| Existing-consent real ChatGPT reconnect | NOT TESTED | Supported Reconnect control unavailable; local exact authorization-binding regression passes |
| Actual private-storage object isolation | BLOCKED | No approved object fixtures; bucket/catalog posture alone not a real object-access test |
| Unknown third Google identity | NOT TESTED | Explicit two-existing-identity boundary; no new account attempted |
| Complete independent Auth management/billing/platform log retention | BLOCKED independently | Session policy screenshots/reconfirmation available; no secret-bearing management dump or new admin credentials |

## Verified correction and preserved boundaries

Hosted replay testing exposed a retained auth.sessions row with all refresh tokens revoked. The old dispatcher checked only row existence. Local actual SQL reproduced the gap; separately approved forward SHA2563255554064d35a7a4fee9aa6f27df2ffcbf4f20ff859c2d30c5fe31c038bff1c committed once. Independently verified normalized body2e64d4e8a8d55ca50701e764a70d0258. ACLs/ownership/definer/empty search_path, public invoker wrapper and service_role grant preserved. H2 now proves immediate protected-RPC denial while the JWT is still unexpired. This does not claim revocation at unrelated direct-table/storage APIs; those policies were not modified.

[SQL review and execution](PHASE-C1C-REPLAY-GUARD-REVIEW.md), [execution receipt](artifacts/c1c-replay-guard-execution.json), [current reviewed harness](PHASE-C1C-STEPWISE-HANDOFF-REVIEW.md), [live checkpoint](artifacts/c1c-stepwise-live-checkpoint.json). The older stopped runs and unused disposable session rows remain retained without automatic cleanup. No new users, client/Google/Auth/ACL/RLS changes, signup/DCR/write enablement, production access, paid upgrade, commit/push or destructive recovery.

Original10 pre-test sessions remain represented in the13-row preservation baseline. The H3 scope=local logout may remove only its newly created secondary session; final expected row count14 if all preceding rows remain. Session count alone is not proof: compare hashed original ID sets and owner-bound inventory/security. Primary test token family is revoked; secondary test tokens remain only in the running process. No personal code/token/cookie is persisted.

## Remaining engineering and operational gates

The approved process stopped at its overly strict401 expiry assertion; independent provider evidence confirms403 expired-JWT denial. Tokens were discarded, so it cannot resume. Postchecks preserve all13 preceding session rows, grants, fixtures and security; both existing connected profiles returned A/B revision1. A secondary-only completion proposal is locally tested, not executed. No automatic cleanup or retry.

The CPU-optimized Worker remains separately hash-pinned: candidate05b1811e2f09042faf36f405241439d78c9c0fefbe8dc2279d635dfe0d19f9f0; runtime configuratione0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5. Original conditional rollout review is in [engineering readiness](PHASE-C1C-ENGINEERING-READINESS.md). The active lifecycle batch explicitly includes no deployment. Do not broaden that batch or claim new hosted CPU measurements before an actual deployment.

Remaining known findings: development-only moderate esbuild/Drizzle advisory (root0, hosting0 high/critical in last audit); leaked-password-protection WARN and intentional3 private-table RLS-without-policy INFO; retained historical HS256 trust; fixed-window/global-rate-limit availability risks. No clean-advisor claim. Exact billing/usage/log retention and sustained Free CPU headroom remain unproven. A passing H3 cannot itself certify production operations or close unsupported native OAuth-client lifecycle tests.

**Decision: GO to retain controlled two-user Profile-only staging. NO-GO for full production/security acceptance until mandatory remaining gates are closed or explicitly dispositioned.** Browser setup and the natural-expiry observation are complete. The stopped harness leaves independent refresh/logout and strict same-session-chain evidence distinct; see the consolidated completion review.

## Historical evidence and stopped attempts

The records below are retained for provenance. Current statuses above supersede conflicting older summaries.

> Latest manual live batch STOPPED at12:38:56 Europe/Berlin on MANUAL_CALLBACK before token exchange. One runner request; H1–H3 BLOCKED. All10 original sessions and account/grant/fixture/security state independently preserved. Prompt-specific diagnosis awaits non-secret operator clarification.

> Manual Safari implementation is now locally verified (2026-10-30): 56/56 tests and five real PTY checks PASS. No manual hosted batch has started. Revised browser-provenance/request-accounting approval is required; see PHASE-C1C-MANUAL-SAFARI-HANDOFF.md.

> Latest 2026-10-30 result: revised local checks PASS; live batch STOPPED on a Google POST fetch failure at11:02:29UTC. H1 authentication incomplete, H2/H3 BLOCKED. Original state independently preserved. See the final section for the current outcome; historical successful synthetic tests do not close hosted gates.

# Phase C.1C — Security and lifecycle acceptance

**Latest live result, 2026-10-30: approved replacement Playwright batch stopped once on BROWSER_TARGET_DENIED (unapproved child-frame document) after2 application requests. H1 did not acquire a session; genuine JWT/API tests NOT TESTED; H2/H3 BLOCKED. All10 original sessions, grants/consents/fixtures and security digests preserved. No retry or policy relaxation. See consolidated actual result at the end.**

2026-10-29, Europe/Berlin. **All currently authorized automated checks complete:49/49 test files PASS. GO to retain controlled two-user, Profile-only staging; NO-GO for complete security/lifecycle acceptance or production.** Protected hosted lifecycle gates remain BLOCKED. No hosted mutation, deployment, authentication, refresh, revocation, logout or new session occurred in this phase.

## Scope and evidence

Reviewed the latest C.1B acceptance, final coordinated rollout and staging integration reports. The coordinated rollout's actual-results section supersedes older active-version, reconnect503 and pending-deployment statements. Previously conclusive Google linking, A/B retrieval, broad-grant revocation and negative hosted probes were carried forward; they were not unnecessarily repeated.

Only staging project gngnrmzeghjzqsmzuktl and Worker mfd-connect-staging/account fa8205077c4bc4d2bb38ee035e74a156 were read. Current active version remains dcfcac5d-88d2-4432-a262-e288f05f31e4 at100%, same SQLite namespace/binding, writesfalse. Full runtime bundle hash remains0fa8494b…; no runtime source/configuration/SQL changed. Existing two ChatGPT connections were not contacted, reconnected or revoked in this phase.

Before/after read-only inventory matches: users2/original restricted UUID-set; confirmed non-anonymous2; identities4; sessions10; native/local clients1/1; exactly2 Profile-only grants/active native consents; proposals0; exact owner-bound A/B fixtures/revision1; writesfalse. Final inventory at19:17:25.301747UTC (20:17 Europe/Berlin). Catalog/security/storage digest ec1f27ff9b3d5f2f35c01e8b99c85d51 matches the already-deployed C.1B before-state. Private buckets remain private and storage objects0. No raw UUID mapping, identity payload, credential or personal token is included here.

Fresh public Auth reads: signupdisabled, Googleenabled, anonymousdisabled, exact active issuer, no registration endpoint; published verification key EC/P-256/ES256 with no private material. This does not prove the algorithm of any hidden OAuth access token or independently read stored DCR/path/hook/Site URL settings. Those retain explicit prior saved operator evidence, consistent with public metadata. No management credential or secret-bearing dump was requested.

## Complete acceptance matrix

PASS always applies to the evidence scope shown. BLOCKED means the real hosted requirement cannot currently be completed safely; NOT TESTED means an unperformed observation with no equivalent proof. No new FAIL was demonstrated in this pass; this is not a claim that blocked gates pass.

| Mandatory requirement | Local/model/native | Hosted status | Evidence / limitation |
| --- | --- | --- | --- |
| Target, two users, grants, fixtures and disabled writes preserved | PASS | PASS | Matching before/after inventory, digest and active settings |
| Both original Google identities/stable UUIDs/no duplicates | PASS | PASS, carried | Prior operator logins plus independent owner comparisons; no new login |
| Both account-specific Profile reads | PASS | PASS, carried | Latest coordinated rollout A/revision1 and B/revision1; actual client evidence was operator-observed |
| Access-token authentication required | PASS | PASS in observed flow | MCP/Google suites; prior actual profile retrieval, missing-bearer401; no cookie-only MCP authentication |
| JWT cryptographic signing, wrong key/signature/tampering/alg=none | PASS | PASS for prior synthetic invalid probes; genuine-issued matrix BLOCKED | Ephemeral ES256 trust model plus prior forged-public-kid/unsigned hosted401; no real bearer inspected |
| Issuer/resource audience/client/role restrictions | PASS | BLOCKED for isolated genuine-token negatives | Signed local variants and SQL/native exact-resource/client guards; pinned Auth verification remains mandatory |
| exp and nbf | PASS | BLOCKED for genuine hosted boundary tests | Signed local expired/future-nbf variants stop before data RPC; modifying a token invalidates its signature and is not an isolated exp/nbf proof |
| Invalid/mismatched/terminated session | PASS | BLOCKED for forced real termination/reuse | PGlite live-session/owner guards and synthetic Auth models; no current session terminated |
| Actual issued alg/kid/signature and retained HS256 policy | PASS for synthetic ES256 | BLOCKED for actual OAuth token | Public JWKS is ES256; Worker delegates trust to pinned Auth, not an ES256-only runtime policy; previous HS256 acceptance risk remains unresolved |
| Bearer-only MCP / cookie exclusion | PASS | PASS, carried | Native cookie-only401 and earlier hosted missing-bearer checks |
| Owner argument cannot select another account | PASS | BLOCKED for raw authenticated client transport | JSON-RPC user_id injection rejects -32602; direct SQL ignores caller owner and derives auth.uid; actual ChatGPT may validate/hide schema before transmission |
| Cross-owner profile/RLS isolation | PASS | PASS for A/B flow; direct-API negative BLOCKED | Disposable role/claim tests; genuine user REST/RPC/storage bearer channel is not currently available |
| Consent enforced on every section | PASS | NOT TESTED at actual nutrition wire level | Prior profile-only nutrition challenge/no data, followed by successful unchanged Profile call; raw HTTP/tool denial unavailable |
| Unauthorized/unknown/write tool calls | PASS | PASS for disabled configuration; authenticated negative BLOCKED | Read-only tool registry, unknown/write invocation rejection, proposals0, both switchesfalse; no hosted write attempted |
| Exact Origin, null/missing/hostile Origin, proxy/Referer spoofing | PASS | PASS, carried | Browser/native and prior bounded malicious-Origin403/invalid-CSRF400 |
| CSRF/form/redirect parsing | PASS | PASS within prior probes | Exact Origin, first-party identity and bounded forms; Google double-submit CSRF; no Referer fallback or wildcard |
| PKCE S256, state/browser binding, consume once/replay/race | PASS | Successful positive flow carried; provider negative matrix BLOCKED | Native SQLite restart/concurrent one-winner callback, replay/cancel/expiry/state tests; consumed real transactions never replayed |
| Browser account substitution | PASS | PASS, carried | Real CB_ACCOUNT refusal retained primary session; isolated secondary subsequently worked |
| Callback diagnostic privacy/cookie/header/CSP protections | PASS | PASS, carried | Fixed CB_* categories, no secret/exception reflection, strict-origin form pages, no-referrer callback and no-store |
| Fresh profile-only consent/native client/exact callback | PASS | PASS, carried + current inventory | Two unchanged Profile-only grants, sole approved Public/none client; no client/callback change |
| Consent reduction replaces rather than unions permissions | PASS, new | BLOCKED | New synthetic broad→profile test; no hosted grant changed |
| Expansion prevented on GET/reconnect/deny/native error/local save error | PASS, new | BLOCKED | New application-handler tests plus secure binding tests; no GET writes local consent; native replay error prevents subsequent local save |
| Existing-consent redirect-only reconnect | PASS, including native | BLOCKED | Deployed binding fix; latest client exposes no supported Reconnect control; no delete/recreate workaround |
| Refresh rotation and owner/session binding | PASS within model | BLOCKED | Existing model + proposed runner's synthetic end-to-end test; not Supabase internals |
| Refresh replay outside permitted exceptions | PASS within model | BLOCKED | Prepared non-parent replay sequence below; simplistic synthetic strict-reuse behavior is not real-provider evidence |
| Grant revocation/local deny before native outage | PASS | PASS for earlier UI revocation only | Prior broad-grant revoke independently read back; current grants untouched |
| Old valid access/refresh token after grant revocation | PASS within model | BLOCKED | Local revoke-outage/old-access denial; client-wide revocation would threaten current integrations |
| Access after session termination | PASS within model | BLOCKED | Dispatcher session check; direct first-party JWT/RLS semantics are separate from MCP live-session enforcement |
| Logout/local-cookie clearing | PASS | BLOCKED | Auth handler uses scope=local; no live logout performed |
| Fresh explicit-consent reconnect after revoke | PASS | PASS, carried | Earlier real primary Profile reconnect after verified revoke; not equivalent to redirect-only existing-consent reconnect |
| Anonymous direct workspace/readonly RPC denial | PASS | PASS, carried | Prior populated-table REST401 and read-only RPC401; no repeat needed |
| OAuth direct-table restriction/private schemas/RLS/ACL | PASS | PASS catalog; authenticated negative BLOCKED | Reviewed dispatcher/wrapper/service_role ACLs preserved; schema API exclusion previously verified; no operator-bypass isolation claim |
| Private storage configuration | PASS | PASS | Buckets private, objects0, unchanged storage policies/digest |
| Actual cross-owner stored-object access | NOT TESTED with real objects | BLOCKED | Empty buckets prove no object isolation behavior; no storage fixtures added |
| Unknown third identity/signup rejection | PASS model/settings only | BLOCKED | Signupdisabled; no additional identity/user permitted, even as a negative probe |
| Password fallback | PASS | BLOCKED | Synthetic handler; proposed existing-password flow below requires private participation and approval; no password retrieved/reset |
| Shared limiter, concurrency, persistence, binding failure | PASS | PASS within prior bounded quota denial | Native90 mixed requests/shared30 cap, persisted counters, no-binding503, one-time callback restart race |
| Hosted DO restart/multi-region/outage injection | NOT TESTED | BLOCKED | No operational fault injection/deployment authorized |
| Free-plan CPU | PASS local attribution | NOT TESTED for sustained headroom | Same new-version16-request sample: p50=2.612ms/p99=6.574ms, errors0; no new invocations or load generated |
| Billing, quota headroom and platform log redaction/retention | NOT TESTED exhaustively | BLOCKED | Existing Free condition retained; no billing credentials or logging change; application settings do not establish platform retention |
| Independently read complete Auth management configuration | NOT TESTED | BLOCKED | Operator evidence remains distinct from independent public metadata |
| Full tests/types/lint/build/scans/native checks | PASS | Not a hosted acceptance substitute |49/49; details below |

## Local engineering and verification

Added [consent-lifecycle-acceptance.cjs](../tests/consent-lifecycle-acceptance.cjs): tests exact consent reduction, native replay refusal, unchanged grant on redirect-only GET/deny/unknown permission, hostile Origin and wrong-owner refusal, and native/local-save failure containment. All use synthetic accounts and in-memory permissions. No deployed authorization vulnerability was newly demonstrated or corrected; this is additional regression coverage, not a claimed hosted fix.

Prepared [c1c-session-acceptance.cjs](../scripts/c1c-session-acceptance.cjs), a **local terminal runner only**, with default plan-only/no-network behavior. Explicit live mode is not permission to use it. It requires reviewed non-secret preflight evidence, private TTY input, exact staging endpoints, no redirects, request cap40, no new client/user/grant/fixture, independently checked fresh issued ES256 signature, pre-existing-session hash exclusion and account binding. It never exports a bearer, refresh token, password, cookie, user UUID or response body; results contain fixed test labels only. Credentials remain in process memory; no promise of guaranteed JavaScript heap zeroization or OS-level memory forensics is made. Do not use core dumps, inspector, TLS key logging, HAR/console/network-body capture, shell credential arguments or environment credential exports. CLI rejects common unsafe runtime options and emits a generic failure, not arbitrary upstream exception text.

[New runner tests](../tests/c1c-session-harness.cjs) exercise default no-network mode, pinned transport, independent cryptographic verification, isolated-session collision and unsafe-baseline refusal, own/cross-owner reads, bounded modeled rotation/non-parent reuse, expiry and local logout. These tests model provider responses; they do not certify hosted provider behavior. The existing strict-refresh fixture's immediate reuse error is a deliberate error-handling model, not proof of Supabase's documented grace/parent exceptions.

Full final runner49/49 PASS. Frontend/Worker TypeScript and hosting lint PASS. Independent and staging production-mode builds PASS; artifact scans public37/hosting169/selected167 files PASS. Runtime bundle remains byte-identical to deployed approved0fa8494b… . Root audit0; hosting1 existing development-only moderate [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), zero high/critical; no dependency/lockfile changes.

Native HTTPS workerd/SQLite PASS: MCP/auth/consent/reconnect/Google synthetic flow, S256, Origin/owner/session checks,90 mixed concurrent requests/shared quota30, missing-binding denial, persisted counters after full process restart and one303/one400 concurrent consumption of a persisted pending callback. Emulators stopped; retained SQLite state/counters not reset. Native profiles/upstreams are synthetic; no real provider request occurred.

Ignored evidence under .sites-runtime/c1c-acceptance/: tests.log, types-*.log, lint/build/scans/audit JSON, native/restart logs and safe public-auth.json. Prior deployment/operator evidence remains in C.1B reports. No runtime change means no deployment artifact is proposed.

Fresh advisor retains3 intentional private-table RLS-without-policy INFO findings and the existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No paid upgrade or configuration remediation performed. Fixed-window bursts/exhaustion, HS256 trust, opaque client retries and incomplete provider/logging evidence remain risks; no new authorization bypass found.

## One proposed bounded hosted batch — NOT EXECUTED

**Request one approval for H1–H3 below only**, using the reviewed local runner/plan hashes below. This creates at most two disposable first-party sessions of the existing identities and terminates only those sessions. It cannot close OAuth-client-specific grant-revocation/reconnect gates and must not be represented as doing so. No administrative credential, Worker/SQL deployment, callback, OAuth client, grant, RLS or setting change is part of this request.

### Preconditions before any authentication

- Recheck project/version/runtime hashes, exact native/local client, two original UUIDs, unchanged Profile-only grants/fixtures/writes and security digest. Save only non-secret existing auth.session ID SHA256 hashes in protected ignored preflight evidence; raw session IDs/tokens are not exported.
- Operator must inspect staging Sessions configuration read-only and establish that a fresh login/refresh cannot invalidate the preserved sessions through single-session or lifetime policies. Confirm the actual current refresh-reuse interval, unchanged, in range0–120seconds; do not assume the documented default. If settings/evidence are unavailable, do not set the runner's session_policy_safe assertion; leave this batch BLOCKED. Caller assertions do not independently verify hosted settings.
- Existing passwords must already be available to the operator. Enter only into the local private TTY after approval; never chat, source, files, CLI arguments or environment. No reset, password change, email change, signup or admin session minting. If the supported password flow cannot be used, stop; do not invent a credential workaround.
- Verify clock synchronization and disable core dumps/debug/key logging before starting. Review runner and mock tests; rehash before execution. No baseline approval file/live credential is prepared in this current task.

| Batch | Exact operations and bounds | Expected effects / verification |
| --- | --- | --- |
| H1 — fresh first-party identity/API matrix | GET pinned public JWKS; exactly one POST /auth/v1/token?grant_type=password per approved identity. Verify ES256 signature/issuer/authenticated audience/role/sub/session and that session SHA256 is absent from before-state. Per session: GET own workspace payload/revision; GET peer-owner workspace revision filter; POST readonly mfd_mcp connections; GET Worker /mcp with this first-party bearer | Own synthetic marker/revision1; peer rows[]; same owner Profile-only connections; Worker401 because first-party audience is not MCP. Creates only2 new Auth sessions; no diary/grant/client change. Do not expose parsed personal fields or response bodies |
| H2 — primary disposable refresh/replay | Refresh R0→R1→R2 with two POST /auth/v1/token?grant_type=refresh_token calls; require distinct refresh values and same intended owner/session. Wait actual unchanged reuse interval+2seconds. Submit R0 once, then read connections with R2 access token | R0 is now neither active nor active-parent and outside reuse interval; expected400/401. Same disposable session's live dispatcher read must be401/403. Any unexpected success is a stop requiring investigation, never revoke the real grant or retry |
| H3 — secondary disposable expiry/logout | Keep secondary initial token unrefreshed; wait until its genuine exp+120seconds, with wait capped70minutes and clock preflight. One GET /auth/v1/user must401. Refresh its R0 once, require same owner/session; POST /auth/v1/logout?scope=local with renewed access; one connections read with that access | Natural expiry observed without changing token/expiry config; refresh succeeds on still-live secondary disposable session; local logout204 and live dispatcher401/403. Never global/others logout |

Runner cap40 total HTTP requests, including at most2 Worker bearer-denial requests; timeouts15seconds per call, no retry/load loop, natural-expiry wait≤70minutes plus reuse wait≤122seconds. Maximum network/wait budget under90minutes after credentials are entered. No tokens persisted during waiting. Snapshot/read-only control checks before/after are separate bounded management reads. Do not send fresh tokens to any OAuth client/ChatGPT or import them into existing browser stores.

Supabase [documents reuse-interval and active-parent exceptions](https://supabase.com/docs/guides/auth/sessions#what-is-refresh-token-reuse-detection-and-what-does-it-protect-from); therefore replaying R0 immediately after one rotation is not an appropriate failure expectation. H2 specifically advances two generations. Supabase [documents local versus global signout](https://supabase.com/docs/reference/javascript/auth-signout); H3 pins scope=local. Access-token cryptographic validity can outlast logout; the dispatcher additionally requires a live session. Do not label continued raw JWT validity as equivalent to permitted MCP access.

After separate approval, prepare protected .sites-runtime/c1c-acceptance/approved-session-baseline.json from fresh independent/manual evidence, then use the existing Node22 toolchain from repository root:

```sh
ulimit -c 0
node scripts/c1c-session-acceptance.cjs --execute-approved
```

Default `node scripts/c1c-session-acceptance.cjs` is plan-only and does not authenticate. The script/flag is not approval. On any failure, stop; CLI must not print tokens or arbitrary exceptions. No automatic cleanup/retry/global logout: inspect only the disposable-session state and preserved baseline read-only. Failed incomplete runs may leave isolated sessions; report them rather than deleting or revoking anything automatically. Capture only fixed PASS/FAIL labels and counts. Afterwards verify original sessions/identities/grants/consents/fixtures/security/writes preserved; distinguish authorized new/terminated disposable sessions from original records. Existing A/B tool acceptance is carried forward unless an actual regression requires retesting.

## Gates excluded from that approval

- **Actual OAuth-client token rotation/replay/grant revocation:** the sole client/callback is ChatGPT-owned, with both working owner grants. Tokens are unavailable through a supported independent harness; native grant revocation is user/client-wide, not proven disposable-session-only. No client-wide revocation, test client or callback change is proposed. First-party H1–H3 results cannot close these gates.
- **Existing-consent reconnect:** no supported ChatGPT control was exposed. Do not delete/recreate/disconnect the app, steal callback codes or intercept current sessions. A future supported control or separately reviewed isolated OAuth harness is necessary; no hidden-code interception is approved here.
- **Unknown third identity / real provider PKCE negatives / private object ownership:** no new identity, reused real callback, client change or object fixture permitted. Keep BLOCKED; missing-object404 is not owner-isolation evidence.
- **Hosted consent reduction/expansion/revocation:** changing the existing grants would violate preservation. Local tests pass; no hosted pass is claimed.
- **Sustained Free CPU, multi-region/fault injection, precise billing/log retention and independent complete Auth settings:** same limited16-request sample remains2.612ms p50/6.574ms p99/errors0. No further traffic was generated. No paid service, forced restart or management credential introduced.

## Reviewed checksums

| Artifact | SHA-256 |
| --- | --- |
| Local-only session runner | `abad08430345f4c5c515ae8b5d728d445660928a3ad039a97e1e18355adb5cfc` |
| Hosted test-plan JSON | `30a0610ac37fc1f9c48cef6800ae0b0aebc6f2e09d0208b3642f2c78490a2022` |
| New runner regression suite | `b65a605829c3e30d7e715e3af26eea167d7934c324575b27ecf8ed0cc11496a5` |
| New consent suite | `aeea269d3e9eca6cb5739b86be9a21ac95ba79eccaa3023aaecb438fc991dea3` |
| Unchanged deployed/local Worker | `0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e` |
| Unchanged protected runtime config | `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5` |
| Previously committed reconnect SQL, not proposed for re-execution | `1e2382dbbddbe69691f01caac8e86b1c61530aa0595f8f120a9e5332c072fb8c` |

## Decision and next boundary

**Local/application security checks PASS within stated synthetic/native scope. Retain controlled staging; full C.1C/production acceptance NO-GO because mandatory hosted gates are BLOCKED.** No claim that existing-consent or sustained CPU acceptance is complete. No personal credential/token/session cookie read, authentication, grant change, additional user, hosted SQL/configuration mutation, deployment, paid upgrade, data deletion, production access, commit or push occurred.

One consolidated decision is requested: approve only H1–H3's two disposable first-party sessions, bounded reads, own-family refresh/replay, natural expiry and scope=local termination, conditional on the independent safety/credential preconditions. Operator involvement would be read-only policy evidence and private local credential entry; never credentials in chat. If those preconditions cannot be met, stop without authentication and retain BLOCKED. That approval would not authorize any excluded gate or changes to the two working ChatGPT integrations.

## Approved H1–H3 attempt — stopped before authentication

2026-10-29, Europe/Berlin. User explicitly approved the documented H1–H3 batch, conditional on mandatory independent preconditions. **H1 BLOCKED; H2 BLOCKED; H3 BLOCKED. No authentication or lifecycle operation was submitted.** This is an unavailable-precondition stop, not a failed sign-in or demonstrated security regression.

| Precondition / result | Status | Fresh evidence |
| --- | --- | --- |
| Exact staging project/database | PASS | gngnrmzeghjzqsmzuktl, MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, expected DB host/PostgreSQL17.11; database/current rolepostgres |
| Runner and plan SHA256 | PASS | Fresh abad0843… and30a0610a… match the full reviewed values above |
| Worker/configuration artifact SHA256 | PASS | Fresh0fa8494b… ande0f45c65… match reviewed values |
| Active Worker/binding/write switch | PASS | dcfcac5d-88d2-4432-a262-e288f05f31e4 at100%, original AbuseCoordinator namespace781eaeca44c74543be214f485033adda, MFD_MCP_WRITES=false |
| Original accounts/session/grant/fixture inventory | PASS | READ ONLY at19:26:45.782464UTC (20:26 Europe/Berlin): users2/original restricted UUID-set, confirmed/non-anonymous2, identities4, sessions10, native/local client1/1, grants2/Profile-only2, active consents2, exact A/B fixtures unchanged, proposals0, DBwritesfalse/exact Worker audience |
| Independently established session-policy safety | BLOCKED | Current connected tools expose project/SQL/etc., not Auth-management config readback. No fresh evidence establishes single-session/lifetime/inactivity behavior. Existing session counts do not prove policy safety |
| Actual refresh-reuse interval and rotation/reuse detection | BLOCKED | No supported authenticated management read channel or fresh dashboard evidence; documented defaults are not actual configuration evidence |
| Private existing-credential entry / clock/core-dump/live-run preflight | NOT TESTED | Not started after mandatory policy gate could not be established; no credentials requested in chat or retrieved elsewhere |
| H1 session creation / issued JWT / direct API | BLOCKED | Zero new sessions; runner not invoked in live mode |
| H2 rotation/non-parent replay | BLOCKED | No disposable primary session; no token rotation/replay |
| H3 natural expiry/refresh/local logout | BLOCKED | No disposable secondary session; no logout or wait initiated |

Tool-capability discovery reconfirms that the available Supabase connector has no Auth-configuration GET or arbitrary authenticated Management API method. Prior capability evidence documents the supported management endpoint but does not supply usable approved access. No attempt was made to extract connector credentials, reuse browser cookies, search credential stores, create a PAT, read server files, query undocumented Auth endpoints or substitute database/session GUCs for service configuration. No session_policy_safe assertion or approved-session-baseline.json was manufactured.

Required operator participation was requested once, bundled and read-only: exact displayed single-session restriction, maximum session lifetime/timebox, inactivity timeout, refresh rotation/reuse-detection status and reuse interval seconds. No saving, credential disclosure or new execution approval was requested. Operator evidence must remain labeled as such, checked against the mandatory safety contract; unavailable/ambiguous values do not clear the gate. An approved supported read mechanism returning only these non-secret fields is an alternative, not authorization to obtain new credentials.

**Preservation:** no new authentication, session, grant, client, user, fixture or configuration mutation; no refresh, revocation, logout, recovery, deployment, production access, cost change, commit or push. Both existing ChatGPT grants/consents remain Profile-only and unchanged in read-only inventory. No new tool invocation tested either client's current token validity; the earlier successful A/B results are carried forward, not relabeled fresh.

**Next recommended batch:** resume this same already-approved H1–H3 coordinated run only after the independent session-policy/reuse evidence is established and existing credentials can be entered through the reviewed private local terminal. No additional routine approval is needed. If policy safety or supported credential access cannot be established, retain BLOCKED and do not create a session. OAuth-client-specific lifecycle/revocation/reconnect, protected storage/provider negatives and sustained operational gates remain as listed above; this stop does not close any of them. Full security/lifecycle acceptance remains NO-GO; preserve controlled staging.

## H1–H3 resumed after read-only dashboard evidence

2026-10-29, Europe/Berlin. Operator reports saved staging settings, inspection only: single-sessionOFF; timebox0hours/Never; inactivity0hours/Never; JWTexpiry3600seconds; refresh replay detectionON; reuse interval10seconds. Rotation has no separate displayed control and must be observed in H2. This is operator-observed dashboard evidence independent of runner assertions, not an agent Management API read. The user's explicit continuation accepts this evidence source; no setting was changed or default substituted.

Fresh independent preflight at19:32:55.343240UTC: exact healthy staging project/database; original users2/confirmed2/identities4/sessions10; matching restricted UUID-set; native/local client1/1; two Profile-only grants/active consents; original owner-bound fixtures/revision1; proposals0; DBwritesfalse/exact audience. Security digest ec1f27ff9b3d5f2f35c01e8b99c85d51 matches. Worker versiondcfcac5d-88d2-4432-a262-e288f05f31e4 at100%, same namespace/staging/writesfalse. Runner, plan, bundle and configuration hashes match reviewed values. Public Auth signupdisabled/Googleenabled/anonymousdisabled and server Date versus local clock within30seconds verified read-only.

A mode0600 ignored approved-session-baseline.json now contains the exact10 pre-existing session SHA256 hashes, actual reuse interval10 and source-labeled dashboard policies. It contains no token, cookie, password, email or raw session/user identifier. The reviewed runner was not modified. A local one-run launcher rechecks hashes, disables core dumps and prevents repeat launch with an atomic local lock; it records only readiness/final process exit status. It does not capture terminal input/output or alter any hosted resource. H2 wait is12seconds; H3 retains actual expiry+120seconds within reviewed caps.

Launcher opened in the operator's local Terminal at19:34:52.435UTC (20:34 Europe/Berlin). It requests the two existing account credentials through hidden private TTY prompts only and invokes the unchanged approved runner. No credentials are requested in chat. Operator participation is required for these private inputs; no renewed execution approval requested. Terminal must remain open for approximately62minutes. Failure means stop without relaunch, replay or cleanup.

**Current status: H1/H2/H3 results PENDING private credential entry/run completion.** Readiness status alone cannot distinguish waiting for input from a running test and is not evidence of any acceptance PASS or authentication attempt. Do not relabel this as completion or as continuing policy blockage. On completion, inspect the sanitized exit/result evidence and perform independent original-session/grant/fixture/security postchecks before reporting final results. Both existing ChatGPT connections remain outside this test batch.

## Consolidated alternative execution plan — existing Google identities, no passwords

2026-10-29, Europe/Berlin. **Password batch retired; H1/H2/H3 remain BLOCKED/not completed. Local alternative preparation PASS52/52. No real Google navigation, code exchange, session mutation or hosted setting change performed in this alternative task.** This latest plan supersedes the preceding credential-entry instructions. The user's latest instruction prohibits hosted mutation; the earlier password-batch approval is not reused to execute a different acquisition method.

### Password-launcher disposition and preserved state

The local launcher was already finished with exit130 at19:40:37.655UTC (20:40 Europe/Berlin); process inspection found neither launcher nor acceptance-runner process to terminate. Its execute permission was removed, one-run lock retained, and the approved password baseline moved to stopped-password-baseline.json as retained evidence. The password runner's reviewed source is unchanged; its old live command now lacks the required baseline. Do not reopen it.

Operator reports provisioning passwords were not saved. No password guess, hash lookup, credential search, password reset/change, admin-generated login, user deletion or retry was performed. No successful authentication/session creation is observed; a full failed-request Auth audit was not retrieved and no stronger request-level claim is invented.

Independent READ ONLY at19:42:03.489033UTC: users2/original UUID-set, identities4, sessions10, both Profile-only grants and native consents2, native/local client1/1, workspaces2, proposals0, writesfalse. A separate comparison proves **all ten original session IDs remain present**, using SHA256 hashes without exporting raw session IDs. Existing connections were not exercised or reauthorized; prior A/B profile results remain carried evidence. No hosted mutation occurred in this task.

### Supported-method assessment

| Method | Can establish identity without lost password? | Can feed isolated H1–H3 safely? | Disposition |
| --- | --- | --- | --- |
| Existing Worker Google /login | YES; previously demonstrated for both identities | Not by ordinary UI alone: Worker consumes its own PKCE transaction and installs HttpOnly first-party cookies | Keep existing connections untouched. Do not scrape cookies or replay consumed callbacks |
| Separate SDK-owned Google S256 PKCE flow | Supported Supabase protocol and existing provider configuration | Technically feasible with a new private browser context, same configured callback, a harness-owned verifier and own-flow callback handling; needs explicit review/approval below | Recommended; prepared/tested locally, real provider compatibility NOT TESTED |
| Google Identity Services / signInWithIdToken | Supported in general | Requires a fresh Google ID token, proper nonce and compatible existing Google client/origin configuration; current authorized JS origins are unknown | Not chosen; no Google configuration or new client introduced |
| Email OTP / magic link, shouldCreateUser=false | Supported in general | Conditional on current template/delivery: default magic-link versus numeric OTP and SMTP/recipient limits matter | Not chosen; no emails sent. Do not change templates/SMTP or use recovery/password-reset flows |
| Existing ChatGPT token/cookie extraction, hashes, admin minting, implicit token-in-URL | Does not meet this safety contract | Would expose/reuse protected credentials or change trust boundaries | Excluded |

Supabase documents [Google provider sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow) and [exchangeCodeForSession](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession). The same SDK client/verifier store must initiate and exchange a one-use code; the local design retains that ownership. PKCE code validity is5minutes. The browser callback bridge described here is **custom local test infrastructure**, not a Supabase-documented browser interception feature or a guarantee that Google's live security checks will accept this controlled browser.

Google ID-token sign-in's origin/nonce requirements are documented in the Google guide. [Email passwordless sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless) requires distinguishing the existing email template's magic-link/OTP behavior; [shouldCreateUser=false](https://supabase.com/docs/reference/javascript/auth-signinwithotp) prevents automatic user creation. No alternate email/GIS authentication was attempted to probe availability.

### Recommended alternative: owned Google PKCE acquisition, unchanged lifecycle checks

1. Repeat exact staging/project/version/ACL/grant/fixture/write/clock/session-baseline preflight, retaining the source-labeled saved dashboard policy evidence: single-sessionOFF, timebox/inactivityNever, expiry3600seconds, replay detectionON, actual reuse interval10seconds. Reconfirm if time/state drift warrants it; never set policy defaults to pass a guard.
2. Use the existing locked Supabase SDK2.118.0 and publishable key internally. For PRIMARY, create a **new Chrome process with a new private browser context** and a new in-memory SDK client/verifier store. No existing browser/profile/ChatGPT session is attached or imported. Disable SDK automatic refresh, URL-session detection, debug logging and disk session storage. The SDK uses an explicit Map-backed memory adapter, not browser localStorage.
3. SDK signInWithOAuth(provider=google, flowType=pkce, skipBrowserRedirect=true, prompt=select_account) creates a S256 authorization URL with **exact unchanged redirectTo** https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback. No application state/sb_flow_id query pattern, redirect allowlist, Google Cloud client or Supabase native OAuth client is added. The existing ChatGPT client is not used as a Google provider client.
4. Only the operator chooses/signs into the approved PRIMARY identity in Google's normal visible UI. No automated credential entry, credential field inspection, headless live Google login, fingerprint evasion, TLS bypass or provider-security workaround. Each flow has a5-minute deadline; an error, provider refusal or timeout stops the batch without retry.
5. Local CDP over **anonymous pipes**, never a debugging network port or an existing browser connection, watches only its own private target. At the new flow's exact callback **top-frame GET**, abort the browser request before Worker ingress. Send the callback only to the same in-memory SDK flow. Verify private-context binding, exact origin/path, singleton bounded code, no fragment/unknown parameters, deadline and one-time consumption. Do not import or inspect any existing/old Worker/ChatGPT callback, code or cookie.
6. A separate local CONNECT proxy denies the **entire Worker hostname** and all unrelated targets, independently of CDP interception. Only staging Auth and required Google TLS hosts can be tunneled; no TLS decryption/logging. Thus unhandled popup/iframe/redirect traffic cannot accidentally deliver the harness code to the hosted Worker. If the callback cannot be captured correctly, fail closed; do not forward it to the Worker or weaken existing Worker PKCE/CSRF guards.
7. Exchange that own-flow code once through the supported Auth PKCE endpoint, with the verifier held by the same SDK client. Keep only first-party access/refresh tokens and the verified user ID in process memory. Discard provider_token/provider_refresh_token and personal response fields; clear the Map store. The lifecycle core independently verifies issued ES256 signature/issuer/audience/role, original expected owner, absence of client_id and new-session baseline exclusion before diary/API checks. A wrong Google identity stops immediately; no automatic account switching or retry.
8. Run H1 PRIMARY read-only ownership/API checks. Close that private browser/context normally, retaining only disposable Supabase session material in the Node process. Repeat with a separately created private context for the existing SECONDARY identity; verify exact original secondary UUID before H1 checks.
9. Run the same H2 primary R0→R1→R2, wait12seconds, submit non-parent R0 once, verify rejected replay and live-dispatcher denial. No local/native grant revocation or existing-client token rotation.
10. Run the same H3 genuine secondary expiry+120seconds, wait≤70minutes, one expiry check, one refresh, scope=local logout of only that disposable secondary session, then live-dispatcher denial. Existing ChatGPT sessions/grants remain excluded.
11. Read-only postchecks must prove all original session hashes, two users/identities, two Profile-only grants/consents, exact fixtures, sole client/callback, RLS/ACL/security digest and false write switches preserved. Record only fixed check labels, request counts, timestamps and sanitized outcome; no URL/token/cookie/code/HAR/browser console dumps. On failure stop, inspect read-only and do not retry, delete a session/user, perform global logout or destructive cleanup.

This captures only the new harness's own callback—not another application's active authorization. Nevertheless it is a **new explicit authorization boundary**, previously excluded from C.1B/H1–H3. Approval of the recommended Google batch must specifically cover its own fresh callback routing and code exchange. There is no new hosted callback endpoint, route, permission, client, deployment or Auth configuration change.

### Concrete local artifacts and evidence

- scripts/c1c-google-pkce-plan.cjs uses the actual installed SDK: memory-only verifier/session store, exact authorize URL and S256 assertion, private-context/main-frame callback checks, one-use exchange and fixed errors. No live CLI/default transport. Regression tests verify actual challenge↔verifier correspondence, duplicate/unknown/error/expired callbacks, wrong context/method/frame/user, transport failure, one-time behavior, memory-store clearing and suppression of provider credentials/personal fields.
- scripts/c1c-alternative-lifecycle-core.cjs copies the reviewed lifecycle core with only session acquisition injected instead of password exchange, plus a fixed-label progress callback. The signature, ownership, consent, fresh-session, refresh/replay, natural expiry and local-logout checks remain. Synthetic acquisition supplies fresh PKCE sessions; no password endpoint is called.
- scripts/c1c-owned-browser.cjs provides fresh private Chrome contexts and pipe-only CDP routing. scripts/c1c-browser-proxy.cjs permits only necessary Auth/Google CONNECT targets and blocks Worker/unrelated targets before TLS. No cookie-reading, browser storage export, console/Network-response capture or credential automation API is used.
- scripts/c1c-google-h1-h3.cjs composes the proposed flow. Default mode is **plan-only/no network**. Live mode requires a separate approved-google-baseline.json, which **does not exist and was not prepared** in this task. Fixed-label progress goes only to an ignored mode0600 progress file, without arbitrary exception bodies. Existing password-runner artifacts/approval cannot activate it.
- Final network-blocked full suite **52/52 PASS**. The first SDK response fixture omitted expires_in, so the real SDK correctly rejected it; adding that required synthetic response field fixed the test, with no application check weakened. No runtime or dependency/lockfile change.
- Native local-only Chrome fixture PASS: private context/pipe callback interception, exact owned top-frame delivery, abort before external network. Separate real local CONNECT test returns403 for Worker before TLS. Fixture browser uses a dead outbound proxy and localhost synthetic redirect; **no real Google, Supabase or Worker auth request occurs**. Chrome/proxy processes were closed normally; local fixture profile files contain only synthetic test data and were not deleted.
- Real Google UI acceptance, actual first-party PKCE token exchange and live H1–H3 remain NOT TESTED. Google may reject the controlled browser; unexpected UI/targets mean STOP, not a reason to relax security. Local tests cannot certify every Google UI variation or OS/browser memory-forensics behavior.

### Bounds and proposed single approval

No live execution is requested by the current user instruction, and none occurred. For a later **single consolidated alternative batch** approval, the exact proposed scope is:

- At most2 new first-party sessions for the two existing approved identities through the described Google provider flow, with at most one manual Google selection per identity and no retries.
- Explicit permission for routing **only these two new harness-owned callback navigations** into their own in-memory SDK/verifier exchanges. Never existing codes/cookies or ChatGPT authorization callbacks.
- Same H1–H3 read/refresh/replay/expiry/local-logout operations and preservation requirements; no password operations, email sending, OAuth-client/grant changes or configuration/deployment changes.
- Hard cap40 combined application/staging requests, enforced **before sending** across Node API traffic and browser staging-Auth hops; browser Auth subset cap8. Worker receives at most2 first-party-bearer denial probes from Node, never browser callbacks. Normal interactive Google UI/assets are outside the application-request cap and are not a load test; no complete third-party page-asset request ledger is claimed.
- Operator has up to5minutes per isolated Google flow; expiry wait≤70minutes, replay wait12seconds; bounded network timeouts and total operation budget under100minutes after preflight. No auto-refresh or test load to shorten expiry. Passive waiting retains tokens in process memory only; exiting loses them.
- Same Free/no-upgrade condition. Existing provider settings, OAuth clients/callbacks, users, grants, fixtures and permissions remain unchanged. No new paid/billable resource provisioning or administrative credential.

After that separate approval and fresh safe baseline, the proposed command is the reviewed Node22 toolchain from repository root:

```sh
ulimit -c 0
node scripts/c1c-google-h1-h3.cjs --execute-approved-google
```

Do not execute it now. Its live baseline must be created only for that approved window. Failure progress/result remains sanitized; do not store tokens to support retry or recovery. Actual cleanup/recovery outside the planned isolated session-family termination requires separate review.

### Alternative artifact SHA-256

| Artifact | SHA-256 |
| --- | --- |
| Google batch runner | 76dd7458bd5427e758a191e1b801e95f5e8ce8694c8b5f229da7fe0e31acd549 |
| SDK-owned Google PKCE adapter | 5d4a041cbb4f69b68da75dd99e150cee7ebd4fb9319918889bd3acff41e5f658 |
| Injectable lifecycle core | 8c647698c72f8e16899f3252963d5ede7740255c3e18caf22a0f0b20540522ba |
| Owned private-browser bridge | 5dfcf26d9051f816666a14a7211b70acaeb9c7ac9521dc1cca69634671586ff8 |
| Restricted CONNECT proxy | ff7680725c9f83ca7dc12069c38a3fbec70303697ec1dbc180c25186d8503195 |
| Alternative plan JSON | 8a6a392c6959b5072783a17d74b9b97314ec257c4b0d969214d0d72e83149488 |

Full helper/test manifest retained ignored under .sites-runtime/c1c-acceptance/google-alternative-manifest.json; full52-test log in google-alternative-tests.log. Original deployed Worker0fa8494b… and runtime configuratione0f45c65… remain unchanged; no deployment artifact is proposed.

**Decision:** GO for review of this consolidated alternative Google batch; NO-GO for executing it under the stopped password-run approval or for claiming H1/H2/H3 complete. Google protocol support and local ownership/isolation controls are verified in stated scope; real provider compatibility/acceptance still requires the bounded approval and two interactive Google selections. Retain the current controlled integration. Native ChatGPT OAuth-client rotation/revocation/reconnect, third-identity/private-object and sustained operational gates remain excluded; first-party Google-session results would not close them.

Final alternative-preparation check at19:59:56.004970UTC (20:59 Europe/Berlin): users2/original UUID-set, sessions10, identities4, grants2/all Profile-only, active consents2, native client1, workspaces2, DBwritesfalse. No password/Google acceptance process remains running; no approved Google baseline or live Google progress file exists. All alternative source hashes match the manifest. This confirms preparation-only disposition; no current first-party or ChatGPT token was inspected or rotated. No production access, hosted mutation, upgrade, commit or push occurred.

## Approved Google alternative H1–H3 — actual stopped execution, 2026-10-30

**H1 FAIL to complete authentication initiation; its issued-token/direct-API assertions NOT TESTED. H2 BLOCKED. H3 BLOCKED.** User explicitly approved the six exact alternative artifacts and two owned Google flows, with stop-on-unexpected-result and no retry. One coordinated runner invocation occurred; no second invocation, source change, safeguard relaxation or cleanup/recovery followed the failure.

### Ordered evidence and outcome

| Item | Result / actual evidence |
| --- | --- |
| Six approved artifact SHA256 values | PASS freshly matched every full value in the alternative table above; helper manifest checked again immediately before invocation |
| Staging identity | PASS gngnrmzeghjzqsmzuktl/MFD OAuth Phase2 Testing, ACTIVE_HEALTHY, expected staging DB host, PostgreSQL17.11, database/current rolepostgres |
| Fresh original baseline | PASS independent read08:05:37.204094UTC (09:05 Europe/Berlin): two original confirmed users/identities4, exact10 original session hashes, native/local client1/1, two Profile-only grants/active consents, exact A/B fixtures/revision1, writesfalse/proposals0 |
| Runtime/security baseline | PASS active dcfcac5d-88d2-4432-a262-e288f05f31e4 at100%, original AbuseCoordinator namespace, staging/writesfalse; scoped catalog/security digest ec1f27ff9b3d5f2f35c01e8b99c85d51 |
| Public Auth and clock | PASS signupdisabled/Googleenabled/anonymousdisabled; server Date versus local clock within30seconds; Node22.13.1 with unsafe runtime/key-log options absent, core dumps disabled |
| Session policy/reuse evidence | Previously supplied explicit operator dashboard evidence retained, not relabeled as a new independent Management API read: single-sessionOFF, lifetime/inactivityNever, expiry3600seconds, replay detectionON, reuse10seconds. Rotation was to be tested in H2 |
| Initial read-only catalog call | One tool invocation failed schema validation because the historical in-memory query value was unavailable in the new tool session. No database query/mutation occurred from that call; the explicit read-only query then passed |
| Single live launch | Exact reviewed Google runner invoked once with owned private Chrome/proxy and in-memory-only acquisition; no Google baseline existed from a previous run |
| Last successful assertion | PUBLIC_KEYS_REQUIRED; initial published-key fetch/shape check PASS |
| Unexpected result | Generic owned Google acceptance stop, exit1, at08:08:54.080UTC (09:08 Europe/Berlin); application request counter2 |
| H1 | FAIL to complete owned primary authentication initiation. No issued-token/owner/session/API/fixture assertion passed; those subtests remain NOT TESTED. No secondary flow began |
| H2 | BLOCKED: no disposable primary authenticated session. No refresh, replay or12second replay wait performed |
| H3 | BLOCKED: no disposable secondary session. No natural-expiry wait, refresh or local logout performed |
| User interaction | No account-selection request was issued because the process had already stopped when its first progress read returned. No credential or callback requested in chat |
| Retry/recovery | NONE; no code changes/redeployment, proxy/origin allowance widening, password fallback, session deletion, revocation or global logout |

The fixed progress file reports status=stopped, last_passed=PUBLIC_KEYS_REQUIRED, application_requests=2. Source ordering accounts for the initial key request and initiation-stage traffic; no completed PKCE exchange is evidenced. No secrets or browser events were read to reconstruct the failure. The reviewed CLI suppresses arbitrary exception details, so **the exact failing predicate is UNKNOWN**. Available evidence does not distinguish browser/proxy/navigation denial, callback handling or provider compatibility. It is not proof that a Google identity was wrong, that the provider rejected credentials, or that deployed OAuth configuration drifted. Do not assign a fabricated diagnostic code or weaken the allowlist based on inference.

### Independent preservation verification

READ ONLY postcheck at08:10:02.125447UTC (09:10 Europe/Berlin): users2/original UUID-set, identities4, sessions10, **all10 original session hashes still present**, native/local clients1/1, grants2/Profile-only2, active consents2, exact original owner-bound A/B fixtures/revision1, writesfalse and proposals0. Security digest still ec1f27ff9b3d5f2f35c01e8b99c85d51. No disposable session was created successfully; no original session was terminated or replaced. Existing ChatGPT connections were not exercised, revoked or reauthorized; earlier A/B results are retained, not relabeled fresh transport tests.

Process inspection confirms no acceptance-runner process remains. The live Google baseline was moved to stopped-google-baseline-20261030.json as retained protected evidence; the one-run lock and sanitized stopped progress remain. No active baseline is left to permit accidental relaunch. No token, password, code, cookie, provider response or raw session ID was printed/persisted. Local launch/result evidence stays ignored/protected under .sites-runtime/c1c-acceptance/: google-approved-run.log, google-live-progress.json, google-approved-result.json and stopped baseline. No production, hosted settings/RLS/ACL/client/callback mutation, paid upgrade, deployment, commit/push or destructive recovery occurred.

### Remaining gates and next recommended batch

All genuine-token H1 assertions, first-party H2/H3 lifecycle acceptance and previously excluded ChatGPT OAuth-client refresh/revocation/reconnect, provider negatives, private-object ownership and sustained operational gates remain open. Current state is safe to retain as controlled two-user/Profile-only staging; **full C.1C/production acceptance remains NO-GO**.

Next recommended work is **local-only browser/proxy diagnosis and a credential-free fixed-category diagnostic patch**, reproducing failure categories with synthetic navigation and preserving callback/network/identity guards. Obtain a concrete reviewed artifact/hash before proposing any new hosted authentication attempt; this execution did not create or deploy such a patch. Do not consume another Google flow merely to get better logs, relax permitted targets, inspect existing browser credentials or retry automatically. A later bounded attempt needs a separately reviewed execution scope after diagnosis; no further hosted operation is pending under this stopped run.

## Local-only Playwright diagnosis and replacement review — 2026-10-30

**Local preparation COMPLETE/PASS. No new hosted Google attempt, authentication, token exchange, SQL/configuration mutation or deployment occurred. H1–H3 remain unaccepted from the stopped run.** The replacement below is separate from the six previously approved alternative artifacts; those files were preserved unchanged. No existing browser, ChatGPT connection, cookie or token was accessed.

### What is established, and what remains unknown

The historical run's exact predicate remains UNKNOWN: its generic catch discarded the error category. It is not possible to reconstruct that private browser event after the process exited without inventing evidence. This task did not retry hosted authentication to obtain a trace.

Two concrete local findings changed the proposed harness:

1. **Premature-stop pattern reproduced:** an Auth HTML document causes Chrome to request /favicon.ico. The previous policy denies that path and terminates the whole flow. The same strict policy reproduced a denial after a synthetic Auth document, consistent with a stop after only the initial Auth request. This is a verified local failure pattern, **not proof it caused the historical hosted failure**. The replacement continues to abort that request before networking, but treats only GET /favicon.ico with Image/Other resource type as informational BROWSER_AUXILIARY_BLOCKED. Navigation, script/fetch and other unexpected Auth paths remain fatal. No host/path is newly permitted through the network guard.
2. **Ordinary Playwright routing is insufficient for server redirects:** an offline prototype following a mocked302 escaped the next ordinary route handler and was safely blocked by the deny-all proxy. [Playwright documents that routing handles the original request and browsers follow redirects without another route callback](https://playwright.dev/docs/network#redirects). Therefore the candidate uses Playwright for browser lifecycle/isolation and its supported [CDPSession API](https://playwright.dev/docs/api/class-cdpsession) for per-hop Fetch interception. This is a correction found during local replacement preparation; the failed historical harness was raw CDP and cannot be blamed on this Playwright-specific issue.

The response-stage handler checks a redirect Location in memory before allowing the next hop. An exact callback redirect can be captured directly from the staging Auth response and aborted before Worker ingress. This also preserves fragments for rejection—fragments can disappear from a later network-request URL. No response body, Set-Cookie header, full redirect URL or code is logged. Real localhost HTTP redirects tested actual response-stage continuation/capture, not only synthetic route fulfillment.

### Replacement behavior and diagnostics

- Installed Playwright **1.61.1** was found in the existing npm cache; no package install, upgrade or project lockfile edit. Both Playwright/playwright-core metadata versions and hashes are checked. System Chrome used for native verification:153.0.8010.47. Runtime cache location is an execution dependency; if unavailable/drifted, STOP rather than automatically download/install.
- New browser process and non-persistent browser context, normal TLS validation, no prior profile attachment, no cookie/storage import/export, no tracing/HAR/video/screenshot/console/body capture. Service workers and downloads are disabled. Headful mode is reserved for a separately approved live run; local fixtures are headless and offline.
- Same exact staging Auth/Google CONNECT allowlist and independent Worker-host denial before TLS. Unknown targets are blocked; no provider-host widening, TLS bypass, automation fingerprint evasion or third-party security workaround. Popup, iframe, wrong-method and malformed callback attempts still fail closed.
- Only the new harness's own exact callback/main frame can supply a code, once, to the unchanged SDK-owned verifier/account adapter. The unchanged lifecycle core independently verifies signatures, claims, original owner/new session, RLS/consent/API restrictions, refresh replay and expiry/logout. Current ChatGPT/native-client token lifecycle remains out of scope.
- Fixed diagnostics distinguish target denial, HTTP status failure, proxy/tunnel failure, TLS/DNS/connection classification, timeout, browser closure, callback context/parameters/cancellation/replay and request limits. Existing fixed SDK/check labels are allowlisted rather than arbitrary exception strings. Unknown errors remain ACCEPTANCE_STOP.
- Safe metadata is limited to known surface classes (for example auth_other), method/resource/frame categories, numeric HTTP status, lifecycle phase, fixed passed-check labels and request counts. No hostname/path/query/header/body/error-description, correlation ID, account identifier, credential or raw exception is emitted. Diagnostic tests include credential sentinels and unknown fields/errors.
- Intentionally aborted requests are tracked only in bounded in-memory state so their expected requestfailed events do not overwrite the correct denial/callback outcome. Final result metadata is frozen against late proxy/browser-close events. The nonfatal icon handling does not hide a blocked fetch or navigation to the same path.

### Verification evidence

| Verification | Result |
| --- | --- |
| Full network-blocked runner | PASS53/53 files; prior52 plus Playwright security regression file |
| Native redirect chain | PASS own Auth→synthetic Google→Auth→callback, one-use consumption, no Worker delivery |
| Narrow icon policy | PASS icon blocked while flow completes; favicon navigation and fetch remain fatal |
| Target/status/network handling | PASS unknown target, other Auth subresource, HTTP403 and connection refusal classified safely |
| Callback negative matrix | PASS empty/duplicate code, fragment, cancellation, child frame, POST and popup rejected |
| Timeout and process lifecycle | PASS pending-flow timeout and explicit close; private browser/proxy closed normally |
| Real response-stage processing | PASS actual localhost HTTP redirects capture callback and reject fragment before any Worker request |
| Independent proxy | PASS actual local CONNECT to Worker receives403 before TLS |
| Native total | PASS20 browser/proxy checks; no real provider or staging response involved |
| Privacy/default mode | PASS sentinel redaction, fixed allowlisted fields/codes, plan-only CLI with no network; no live Playwright baseline/progress file prepared |
| Types/lint/build/security scans | PASS frontend/Worker TypeScript, hosting lint, independent and staging production-mode builds; public37/hosting169/selected staging167 files |
| Audits | Root0; installed Playwright runtime0; hosting1 existing development-only moderate GHSA-67mh-4wv8-2f99, zero high/critical; no dependency changes |
| Existing deployed bytes | Unchanged local Worker0fa8494b…/confige0f45c65…; prior Google runner76dd7458… and raw-browser5dfcf26d… unchanged |

All synthetic browser fixtures force a deny-all outbound proxy. Page mocks are fulfilled locally; the response-stage integration server binds only127.0.0.1. Production and staging requests cannot fall through to the network. Browser background CONNECT attempts are also denied in offline mode. Tests did not use actual Google credentials or bypass TLS. Playwright's documented non-persistent context behavior supports isolation; OS/browser memory-forensics guarantees are not claimed.

Evidence is ignored under .sites-runtime/c1c-playwright-review/: native.log/results, tests/types/lint/build/scans logs and three audit reports. Native profiles/fixture files contain only synthetic data and were retained; local processes were closed. Existing Worker/SQL/native-workerd evidence is carried forward because those runtime sources and bundle bytes did not change; no fresh hosted or native-workerd acceptance is inferred from these browser tests.

### Exact replacement artifacts

[Review manifest](artifacts/c1c-playwright-manifest.json) pins all replacement/support/test files plus the unchanged SDK adapter and lifecycle core. [Approval specification](artifacts/c1c-playwright-approval.json) records the exact bounded scope and narrow icon behavior.

| Artifact | SHA-256 |
| --- | --- |
| scripts/c1c-google-h1-h3-playwright.cjs | ab03a417bffa212655e7538a90e73f0b69caf5e1e9d28d099f41146020a2fb0c |
| scripts/c1c-playwright-browser.cjs | 3264453e3248965f446dc33ff44619ddf417a376e1011f5a3fe468b957fd4ed4 |
| scripts/c1c-browser-proxy-v2.cjs | 03fdcd9c92a20a8089cc62d984d22c1f0c2f481d74bc8470f06343d44dfdb524 |
| scripts/c1c-browser-policy.cjs | 18b4371fddff0a0c744eea1f6dc6751755b7614186dcbb241f0a4eef47948bf0 |
| scripts/c1c-safe-diagnostics.cjs | a4e0adb365edb67fa2ed23bc044c729ff6f0e536dcaabe1657d361b61e92a9bb |
| scripts/c1c-playwright-runtime.cjs | 020095566f37db89c8e74a5151d0f625a64e12acf9272844d555adc3e0fa5bef |
| Approval JSON | 89124b6e7e76a1d2bbb405d729f05e599e1432b952a406bc8ae4dbb5013f5807 |
| Complete review manifest | b611f374213c502172feb4108171bff683faee8add606be97d46faceb33e2905 |

The manifest includes unchanged SDK adapter5d4a041c… and lifecycle core8c647698… . Installed runtime metadata hashes: Playwright6b840268612656f0639fb7d68782e8353bdf11518589d30ddf66f283c2670ed5; playwright-core759e376f995bf39edd4810d699b99469bab1d7428b6fbc78d41912f367df7ba9. These checks identify the expected installed runtime, not a complete independent source audit of every dependency file.

### One proposed replacement-harness approval — not executed

**GO for review/approval of this replacement test harness; NO-GO for claiming the hosted failure solved or H1–H3 accepted.** Real Google compatibility remains untested. No new hosted authentication is permitted by this local preparation, and the stopped old batch is not replayed.

A single future approval should cover the manifest/approval hashes above and exactly the previously documented staging-only two-flow H1–H3 scope, with these implementation details explicit:

1. Fresh independent project/version/security/user/session/grant/fixture/write/clock preflight and source/runtime hash checks. Retain source-labeled dashboard policies/reuse10seconds; STOP on drift/uncertainty. Prepare a fresh protected approved-playwright-baseline.json only for that approved window; none exists now.
2. At most one new visible Google selection per existing identity, fresh Playwright private contexts, only own newly initiated callback code interception/exchange, no existing credentials/cookies or native ChatGPT code. The proxy always denies Worker ingress; the narrow icon request remains blocked/nonfatal. No source/host/path/permission relaxation during the run.
3. Same H1–H3 operations, total application cap40, Auth-browser subset8, no automatic retry, replay wait12seconds and natural-expiry wait≤70minutes. Normal Google UI/assets remain outside the application cap as previously disclosed. Operator participation only for primary/secondary visible Google selection. Google incompatibility or unexpected security/identity/context result means stop, not bypass.
4. Independent postchecks preserve every original session hash, both users/Profile-only grants/consents, fixtures/client/callback and false writes. No global/client-wide revocation, password/email/setting change, deployment, paid upgrade, destructive cleanup, production, commit or push. Failed runs may leave only newly issued disposable state; no automatic recovery.

Only after that separate approval, existing Node22 from repository root would run:

```sh
ulimit -c 0
node scripts/c1c-google-h1-h3-playwright.cjs --execute-approved-playwright
```

Default invocation is plan-only/no network. A future authorized single-run wrapper must rehash the complete review manifest and establish fresh baseline evidence; it must not import the stopped baseline as a current snapshot. Safe progress is stored separately in playwright-live-progress.json, leaving historical stopped-run evidence intact.

**Disposition:** current controlled integration retained; full C.1C/production acceptance still NO-GO. No hosted MFD reads/mutations/authentication were used for this local diagnosis. No dependency install, new OAuth client/user/grant/permission, password retrieval/reset, Worker/SQL deployment, paid upgrade, commit/push or destructive recovery occurred.

## Final local-only handoff — 2026-10-30

User explicitly selected **Local preparation only**. No replacement live Google batch was launched. The currently authorized local deliverable is complete; no further approval is requested by this handoff.

Added scripts-smoke-c1c-local-e2e.cjs, combining the exact candidate Playwright browser, installed Supabase SDK PKCE adapter, real ephemeral ES256 signing/verification, real disposable PGlite schema/RLS/dispatcher and actual application MCP service. Only the Auth provider/session gateway is modeled; clocks are advanced to exercise expiry. The browser's outbound proxy denies all external traffic; Node's real fetch is forbidden and an explicit synthetic transport handles only expected URLs.

The integrated chain PASSes both owner-bound synthetic profile reads, actual SQL cross-owner denial, both exact Profile-only grants, first-party-token MCP rejection, matching S256 verifier, one-use exchange, modeled primary refresh rotation/non-parent replay and actual SQL live-session denial, simulated secondary expiry, same-owner refresh/local logout and SQL post-logout denial. All original synthetic sessions/grants/fixtures/security definitions remain unchanged. It completed25 synthetic application/upstream transport calls (including4 browser admissions), with0 hosted requests. Fixed label GENUINE_EXPIRY_DENIED is exercised with a simulated clock here; it does not close the genuine hosted expiry gate.

Final fresh verification:53/53 regression files,20 native browser/proxy checks, integrated local E2E, frontend/Worker TypeScript, hosting lint, independent/staging production-mode builds and artifact scans PASS. No candidate implementation/dependency/lockfile changed in this final pass. Original candidate review manifest remains b611f374213c502172feb4108171bff683faee8add606be97d46faceb33e2905; deployed/local Worker and private configuration hashes remain unchanged. No hosted Google/ChatGPT activity, token access, user/client/grant/session mutation, deployment, production access, paid upgrade, commit/push or destructive cleanup occurred.

[Local handoff/readiness report](PHASE-C1C-LOCAL-HANDOFF.md) and [candidate archive](../artifacts/mfd-c1c-local-candidate-2026-10-30.zip) are delivered. Archive SHA256: c983a5855bbad2f816fdd7b9cdb9cd09ffb8084a770fc11ab926875808625452. The19-entry allowlisted archive was reopened, CRC-tested and every payload SHA256 verified. It contains source/tests/review metadata and sanitized receipts; no private runtime config, account mappings, baseline hashes, personal credentials, browser state or raw logs. It is a repository review handoff requiring the existing checkout/dependencies, not a standalone production release.

**Decision: local handoff COMPLETE/PASS; production readiness NOT CERTIFIED.** Real-provider H1–H3, safe native-client lifecycle/reconnect, remaining hosted API/storage/provider negatives and operational/security-policy gates remain open as documented. The local E2E proves the application chain within its stated synthetic-provider scope; it does not replace those hosted gates. Current controlled staging remains the last accepted operating scope.

## Approved replacement Playwright live batch — consolidated result, 2026-10-30

**H1 FAIL to complete authentication; genuine JWT/API subtests NOT TESTED. H2 BLOCKED. H3 BLOCKED.** The user explicitly approved one bounded batch with replacement manifest b611f374213c502172feb4108171bff683faee8add606be97d46faceb33e2905 and mandatory stop-on-error/no-retry. That batch was invoked once and stopped. Existing users, original sessions, grants, consents, fixtures, clients and security state are preserved by independent postchecks. No production-readiness claim is made.

### Preflight and provenance

- Fresh hashes matched the complete reviewed manifest and all listed source/test/approval artifacts; rechecked immediately before launch. No source or runtime substitutions, policy relaxation or deployment.
- Exact staging project/database healthy17.11, expected host, current rolepostgres. Worker remains dcfcac5d-88d2-4432-a262-e288f05f31e4 at100%, original AbuseCoordinator namespace781eaeca44c74543be214f485033adda, staging/MFD_MCP_WRITES=false.
- Independent read10:42:26.351140UTC (11:42 Europe/Berlin): users2/original restricted UUID-set, confirmed/non-anonymous2, identities4, sessions10 with all ten original SHA256 hashes exactly matching prior evidence, native/local clients1/1, grants2/all Profile-only, active consents2, exact owner-bound fixtures/revision1, proposals0, database writesfalse/exact Worker audience. Native client Public/none/exact callback and sole local registry ID independently matched.
- Security/RLS/ACL/schema/storage boundary digest ec1f27ff9b3d5f2f35c01e8b99c85d51 matched. New same-operation grant/consent/fixture digest befbb5ee8105a4d45b70e5c7734e03ad captured before launch and independently matched after failure; no raw account identifiers/credentials returned.
- Public Auth HTTP200 signupdisabled/Googleenabled/anonymousdisabled; server Date/local clock within30seconds. Node22.13.1, Playwright1.61.1 with pinned package metadata and Chrome153.0.8010.47 match review. Unsafe runtime/extra-CA/key-log options absent; core dumps disabled.
- Session policies were reviewed against the retained explicit operator dashboard evidence (single-sessionOFF, lifetime/inactivityNever, expiry3600, replay detectionON, reuse10seconds). **This was not a fresh independent Management API read**; that evidence limitation remains explicit. No documented default was substituted or setting changed.

### Genuine hosted outcome

| Stage | Result | Actual evidence |
| --- | --- | --- |
| Initial public verification material | PASS | PUBLIC_KEYS_STATUS and PUBLIC_KEYS_REQUIRED checks completed |
| PRIMARY browser acquisition | FAIL to complete | Fixed diagnostic BROWSER_TARGET_DENIED, surface=other, method=GET, frame=child, kind=document |
| PRIMARY callback/token exchange | NOT TESTED / not completed | Phase remained primary_browser; no issued-token assertion passed; no new session in independent postcheck |
| H1 issued signature/claims, owner reads/cross-owner denial | NOT TESTED | No authenticated disposable session was acquired; earlier local synthetic PASS is not hosted evidence |
| SECONDARY browser acquisition | NOT TESTED | Never reached after primary failure |
| H2 refresh rotation/non-parent replay/access denial | BLOCKED | No primary disposable session; no refresh/replay or12second wait occurred |
| H3 natural expiry/refresh/local logout/access denial | BLOCKED | No secondary disposable session; no expiry wait, refresh or logout occurred |
| Original-state preservation | PASS within scoped verification | Full original-session set and grant/consent/fixture/security digests match; details below |

At10:44:14.719UTC (11:44 Europe/Berlin), sanitized progress recorded status=stopped, phase=primary_browser, last_passed=PUBLIC_KEYS_REQUIRED, application_requests=2 and failure BROWSER_TARGET_DENIED/other/GET/child/document. Process exited1. No Google account-selection handoff was requested because the stop had already occurred before the first progress inspection. No retry, second identity attempt or fallback occurred.

The failure is now **localized to the egress policy denying an unapproved child-frame document request**, rather than an unknown generic callback assertion. Exact scheme/hostname/path/query were intentionally not recorded. Do not infer a specific Google/YouTube/country-domain endpoint, harmlessness, bad identity or failed password from the category. A last proxy diagnostic also reports PROXY_CONNECT_DENIED/other, but it is not correlated to a particular browser request and may be background traffic; no request-level correlation is claimed.

This is a real live harness/provider compatibility failure under the reviewed strict policy, not a demonstrated application authorization bypass or JWT rejection. There is no evidence that the favicon change caused it: favicon denial is a separate Image/Other category, while this event was a child Document. No allowlist was broadened, frame bypass added or error ignored to continue the batch.

### Independent postcheck and preservation

READ ONLY at10:45:36.161634UTC (11:45 Europe/Berlin): users2/original UUID-set, identities4, sessions10 and **all ten original session hashes present**, native/local clients1/1, grants2/Profile-only2, active consents2, exact fixtures/revision1 unchanged, writesfalse/proposals0. The grant/consent/fixture digest still equals befbb5ee8105a4d45b70e5c7734e03ad; the security digest still equals ec1f27ff9b3d5f2f35c01e8b99c85d51. Native client Public/none/callback and active Worker/version/binding/false write switch were independently rechecked unchanged.

No authenticated disposable session was created successfully or original session removed. Existing ChatGPT connections were not exercised/reconnected, and no existing token/cookie was extracted. Preservation checks establish unchanged recorded sessions/grants/consents/data/security; they do not recapture opaque current client token validity. Earlier genuine A/B retrieval remains historical evidence.

Only approved public-key/initiation traffic preceded failure. Authentication initiation may create transient provider-flow/audit state even when no session is minted; that state was not inspected for codes or deleted. No full unrelated Auth-platform diff is claimed. No client/user/password/setting/RLS/ACL change, grant revocation, token refresh, global/local logout, production access, paid upgrade, deployment, migration, commit/push or destructive cleanup occurred.

The live baseline was retired to stopped-playwright-baseline-20261030.json, preserving evidence and preventing accidental relaunch. One-run lock, mode0600 sanitized progress/result/log files remain ignored under .sites-runtime/c1c-acceptance/: playwright-approved-run.log, playwright-live-progress.json, playwright-approved-result.json and stopped baseline. Original reviewed files and local handoff archive remain unchanged. The runner exited and no automatic recovery was performed.

### Remaining acceptance gaps and recommendation

Genuine issued-token H1, hosted first-party H2/H3 and all previously excluded native ChatGPT-client lifecycle/reconnect, provider/storage negatives and sustained operational gates remain outstanding. Synthetic53-test/native20-check/integrated local E2E results stay separate from this failed live acquisition; they cannot close those gates.

**Retain controlled staging; full C.1C/production acceptance remains NO-GO.** Next recommended work is local-only review of denied embedded-document behavior, with synthetic cases that retain network denial and callback/account binding. Determine a defensible policy for expected nonessential embedded resources before proposing another live attempt. Do not guess or whitelist a provider hostname, log full credential-bearing URLs, replay the flow, widen permissions or silently retry. No patch or further hosted test was authorized/executed within this stopped batch, and no repeat approval is requested by this report.


## Revised embedded-document containment and new authorized batch — 2026-10-30

Current user authorized completing the remaining staging acceptance. A local harness-only correction aborts unrelated child-frame GET documents without terminating the main flow. No request is newly allowed, proxy rules remain unchanged, and top-level, POST, Auth/Worker and callback violations still stop. The historical denied target remains unidentified; this is a tested containment/continuation policy, not proof of that target's identity or safety.

Local verification: 53/53 regression files, 24 native Playwright/proxy checks, integrated synthetic SDK/ES256/PostgreSQL/lifecycle E2E, both TypeScript projects, hosting lint, independent/staging builds and artifact scans PASS. Initial sandbox browser launch failed before testing; authorized unsandboxed local checks passed. An initial TypeScript command used a nonexistent root config; corrected frontend/tsconfig.json passed. Build retains framework sourcemap/dynamic-import notices; no dependency update or deployment.

Revised manifest SHA256: 61d7ac6ee80d7407456d705676f7aaa9c0413d497f3b9ec7f2f8e065921d2cbb. Worker/config hashes remain 0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e / e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5.

Fresh read-only baseline 10:59:37UTC: original sessions10, users2/identities4, clients1/1, two Profile-only grants/active consents, fixtures2/proposals0/writesfalse. Security ec1f27ff9b3d5f2f35c01e8b99c85d51 and inventory befbb5ee8105a4d45b70e5c7734e03ad match prior evidence. Worker dcfcac5d-88d2-4432-a262-e288f05f31e4 at100%, same namespace, environmentstaging/writesfalse. Public settings/signup/Google/anonymous and clock PASS. Session-policy evidence remains explicitly prior operator dashboard observations, not an independent fresh Management API read.

One new batch launched at approximately11:00UTC; awaiting primary Google selection. No live H1/H2/H3 success claimed at this entry. Same caps40 total application requests,8 browser Auth requests, one attempt per identity, no automatic retry, replay12seconds and expiry wait≤70minutes. Existing sessions/grants must remain untouched. Production acceptance is not certified.


### Revised live batch final result — stopped, original state preserved

Operator reported the private Chrome window vanished. Sanitized runner evidence independently records a Google-surface POST/fetch failure, BROWSER_NAVIGATION_FAILED, at2026-10-30T11:02:29.866UTC. The runner then closed its owned browser in finally and exited1. Last proxy event was PROXY_UPSTREAM_FAILED/google, not request-correlated. Do not claim it proves the failing fetch's transport cause. No raw error message, URL, query, request body or credentials were captured. The existing classifier maps unrecognized Chromium failures, including cancellation, to generic navigation failure; therefore cancellation versus transport/provider rejection is not established. The previous child-document failure and this new failure are distinct. No callback exchange, new session or successful H1 issued-token/API assertion occurred. Two application requests consumed; secondary not started; H2/H3 never reached. No retry or relaunch.

| Requirement | Final result | Evidence |
| --- | --- | --- |
| Embedded-document containment/continuation | PASS locally | Unknown child GET is aborted; valid main-frame callback continues; child alone times out. Worker child, child POST and callback violations remain fatal. No allowlist expansion. |
| Full regression suite | PASS53/53 | Final rerun after diagnostic changes; ignored revised-final-tests.log |
| Native browser/proxy matrix | PASS24 checks | Repeated after final diagnostics; deny-all synthetic responses and real loopback redirect interception |
| Integrated local E2E | PASS synthetic scope | Playwright/SDK PKCE, ephemeral ES256, PGlite RLS/dispatcher, owner isolation and modeled lifecycle; real-provider semantics unproven |
| Types/lint/build/scans | PASS | Frontend and hosting types, lint, independent/staging builds; public37/hosting169/selected167 inspected |
| Fresh dependency audits | PASS high/critical gate; known moderate remains | Root0; pnpm hosting1 moderate/0 high/critical. First sandbox network audit failed; authorized network read succeeded. Hosting npm audit was inappropriate for its pnpm lockfile and corrected without generating a new lockfile. |
| H1 actual Google/JWT/API | BLOCKED | One approved primary flow stopped before exchange; no genuine issued JWT or authenticated API test |
| H2 rotation/non-parent replay | BLOCKED | No disposable primary session; no refresh/replay |
| H3 natural expiry/local logout | BLOCKED | No disposable secondary session; no expiry wait/refresh/logout |
| Preserve existing accounts/connections state | PASS within read-only evidence | All10 original session hashes match at11:03:05UTC; users2/original UUID set/identities4/clients1+1/grants2 Profile-only/consents2/workspaces2/proposals0/writesfalse confirmed11:04:53UTC. No fresh ChatGPT tool call or opaque-token capture claimed. |
| Security/data boundary unchanged | PASS scoped comparison | Security ec1f27ff9b3d5f2f35c01e8b99c85d51 and grant/consent/fixture befbb5ee8105a4d45b70e5c7734e03ad match at11:03:05UTC |
| Production readiness | NO-GO | Genuine H1–H3, safe native-client lifecycle/reconnect, remaining provider/API/storage negatives, sustained Free CPU/quota/log-retention and documented policy findings remain open |

After the stop, a local-only diagnostic improvement distinguishes fixed BROWSER_REQUEST_CANCELLED from generic errors and records only allowlisted proxy errno names (e.g. ECONNRESET). Arbitrary messages/hosts/URLs remain excluded. It does not ignore failures, retry requests, widen egress or change callback/session/PKCE checks. Unit privacy/cancellation mapping and the full/native suites pass. This diagnostic change was NOT used in another hosted authentication run.

Final local diagnostic manifest SHA256: **8ad985c24981e7a5c2a110d2903ade0b5b8ea3e77e86e05bd400067c6398aabc**. It supersedes the in-progress candidate for local review, not the historical exact live61d7ac6e… manifest. Deployed Worker/config remain unchanged at0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e / e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5. No runtime artifact is proposed for deployment in this correction.

Retired baseline: stopped-revised-playwright-baseline-1102.json. No approved-playwright-baseline.json remains. Sanitized latest progress/log retained; no existing cookies, codes, bearer/refresh tokens or passwords inspected/persisted. Existing users/clients/grants/fixtures and hosted configuration/security were not changed. Authentication initiation can leave transient flow/audit state; none was exported/deleted. No production, deployment, paid upgrade, commit/push or destructive cleanup.

**Next technical gate:** classify the Google fetch cancellation/transport error using the tested fixed diagnostics in a future explicitly bounded fresh flow; never replay this consumed/stopped flow. This run cannot establish that the browser/provider path is repaired. Existing controlled A/B staging remains retained; production security acceptance is not certified.


## Fresh fixed-diagnostic run — 2026-10-30, stopped11:09UTC

User explicitly approved the proposed fresh diagnostic/H1–H3 plan. Exact manifest8ad985c24981e7a5c2a110d2903ade0b5b8ea3e77e86e05bd400067c6398aabc/source/runtime hashes matched. Fresh read11:07:47UTC and security11:08:09UTC matched all10 original session hashes, original2 users/4 identities, native/local clients1/1, two Profile-only grants/active consents, fixtures2, proposals0/writesfalse and prior inventory/security digests. Worker/version/binding/writesfalse unchanged; public Auth/clock PASS. Same prior operator session-policy evidence retained; no fresh management read claimed. A local checksum-wrapper variable-shadowing error was corrected before authentication; no artifact hash changed. Execution used reviewed Node22.13.1.

One batch launched approximately11:08:41UTC. At11:09:39.306UTC it stopped in primary_browser: BROWSER_REQUEST_CANCELLED/google/GET/document, with last proxy event PROXY_UPSTREAM_FAILED/google/ECONNRESET. These events remain uncorrelated; do not assert reset caused cancellation. This is a cancelled document request, whereas the preceding run recorded a generic POST/fetch failure. Operator reports the window closed with wording paraphrased as not safe; exact warning and source remain unconfirmed. No automation-detection/provider rejection is proven from the paraphrase alone. No browser security bypass, stealth flags or credential export was attempted.

Runner exited1 and closed its private browser. Application requests2; no callback/token exchange; no new H1 issued-token/API result; H2/H3 BLOCKED; secondary not started. No retry. Baseline retired to stopped-diagnostic-baseline-1109.json.

Independent postread11:11:21UTC confirms same10 session hashes, users2/original UUID-set/identities4, clients1/1, grants2/Profile-only2/consents2, workspaces2, proposals0/writesfalse and unchanged inventorybefbb5ee8105a4d45b70e5c7734e03ad. Existing tokens/cookies were not accessed. No settings/deployment/client/user/grant/ACL/RLS change, production access, paid upgrade, commit/push or destructive cleanup.

A manual standard-browser alternative needs a reviewed way to deliver only its own fresh callback to the in-memory PKCE adapter. Ordinary MFD Safari login alone cannot close H1–H3 because those issued tokens stay in the Worker session; do not export existing Safari/ChatGPT credentials. No Safari flow has been started, callback copied into chat, remote access configured or new hosted operation executed. Await exact non-secret warning wording and assess the supported manual path locally. Production acceptance remains NO-GO.


Operator clarification after stop: warning appeared on Google's sign-in page and offered Try again; clicking it preceded the window closing. Exact wording was not recalled. This is consistent with the recorded document cancellation on navigation, but does not establish Google's internal rejection reason or correlate the proxy reset. No further automated attempt is justified from this evidence. No remote access is needed or configured.

Manual-browser design boundary: ordinary Safari /login can exercise existing MFD UI but does not provide the disposable tokens required by H1–H3. A supported manual PKCE alternative would keep the SDK/verifier and issued tokens in harness memory and accept only its own newly initiated callback through a local hidden input. It must explicitly review manual provenance/attestation rather than fabricate CDP context/main-frame evidence, account for the existing Worker callback being reached, prevent clipboard/history/log persistence, and document how request limits are enforced without browser interception. No such adapter has been implemented or launched, and no existing session/token extraction is permitted as a shortcut. No callback/client/settings change or remote-control access is necessary merely to review this design.


## Manual Safari implementation — local handoff complete, 2026-10-30

The user requested implementing the manual browser alternative. Added an independent SDK-owned manual PKCE adapter, hidden local Terminal input helper, guarded lifecycle runner/launcher, three regression suites, a real PTY fixture and integrated SDK/ES256/PGlite/Auth-handler/lifecycle model. No Safari/browser automation, remote access, new hosted user/client/callback/permission/setting, live authentication, SQL, deployment, payment or Git publication occurred.

Local results: full56/56 files PASS; actual PTY success/paste/fragmented-paste/SIGTERM/timeout PASS with no synthetic secret echoed and terminal flags restored; frontend/hosting TypeScript and hosting lint PASS. The integrated model makes19 runner calls,6 modeled browser application calls and2 modeled Worker subrequests; verifies unchanged original synthetic sessions/grants/fixtures and strict issued-token/account/consent/isolation/replay/logout checks. Expiry and provider rotation are modeled; actual Safari/Google/hosted H1–H3 remain NOT TESTED/BLOCKED.

Local PTY tests caught and corrected signal-listener setup timing and the need to drain fragmented forbidden paste before restoring echo. The initial E2E count assertion conflated runner/browser/Worker subrequests; the final receipt separates these counts. No application authorization check was changed. In-memory cleanup is not a guarantee of secure erasure of JavaScript strings/OS memory.

The exact callback stays fixed. In a genuinely cookie-free private main window, compiled Worker source rejects it with CB_TRANSACTION_REQUIRED before transaction consume/upstream exchange; this is verified locally. Operator must confirm that result before manually typing only its own fresh callback into the hidden TTY. The manual adapter explicitly records operator attestation rather than inventing CDP context evidence. Existing Safari/ChatGPT session credentials are never accessed. Code reaches the existing Worker callback in this method, so infrastructure callback-query retention remains unresolved; no zero-log claim.

Final [manual handoff](PHASE-C1C-MANUAL-SAFARI-HANDOFF.md), [plan](artifacts/c1c-manual-plan.json) and [source manifest](artifacts/c1c-manual-manifest.json) are concrete review artifacts. Manifest SHA256 **de4029bb7b7c1f5114fd85f1c45883323d9d092b05f55cec3ffcbae8658e9612**. Worker/config SHA256 unchanged at0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e / e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5; no new deployment artifact. Current runtime/build/native-workerd/dependency evidence is carried from the unchanged release; no new workerd/CPU/audit claim.

No approved-manual-baseline.json exists. Default invocation is plan-only; guarded execute mode needs a private TTY, Node22.13.1, core dumps disabled, fresh independently prepared safe baseline, exact manifest/runtime hashes, explicit manual-scope/budget acceptance and an exclusive one-run lock. Future agent-readable progress stores fixed labels/counts only. The reviewed .command launcher must be used only after approval, never a recorded tool PTY or secret-bearing transcript.

**One revised live approval is required:** at most30 Node-runner requests and two manually operated Google flows, one per existing identity, five-minute flow deadlines, no retry,12second isolated replay wait and natural expiry≤70minutes. Safari redirects/requests cannot be machine-counted and the original aggregate40-request cap cannot be verified; operator provenance replaces programmatic browser observation. These differences must not be silently treated as the earlier exact-artifact scope. If the old browser-inclusive cap/provenance remains mandatory, this method is blocked.

**GO for local manual-handoff review; NO-GO for claiming live H1–H3 or production acceptance.** The two working integrations remain outside this preparation; no credentials entered, fresh baseline written or hosted state changed. Remaining native OAuth-client lifecycle, API/storage/provider negatives, operational and policy gates remain as previously recorded.


## Approved manual Safari live batch — in progress, 2026-10-30

User explicitly accepted the revised two-manual-flow/maximum30-runner-request scope after explanation that Safari background traffic is not automatically counted. Exact reviewed manifest de4029bb7b7c1f5114fd85f1c45883323d9d092b05f55cec3ffcbae8658e9612 and all16 inputs match; unchanged Worker/config hashes verified. No implementation or guard changed during execution.

Fresh11:34:49UTC read confirms users2/original restricted UUID-set and mapping, identities4, all10 original session hashes, native/local clients1/1, two Profile-only grants/active consents, fixtures2/proposals0/writesfalse. Native Public/none/exact sole callback and confirmed/nonanonymous users independently match. Security read11:34:52UTC matches ec1f27ff9b3d5f2f35c01e8b99c85d51 and grant/consent/fixture befbb5ee8105a4d45b70e5c7734e03ad. Worker dcfcac5d-88d2-4432-a262-e288f05f31e4 at100%, same namespace/staging/false writes. Public Auth/clock PASS. Session policies/reuse10seconds retain explicitly source-labeled same-day operator dashboard evidence, not a fresh independent Management API read. No new administrative credential or management-config dump.

A fresh mode0600 approved-manual-baseline.json records original hashes, exact manifest and revised-scope acceptance. Reviewed launcher opened in local Terminal with core dumps disabled and Node22.13.1; no tool PTY/transcript/remote browser used for secret input. Progress11:36:41UTC: running/primary_manual, PUBLIC_KEYS_REQUIRED, runner_requests1/manual_flows1. The public JWKS GET passed; no callback exchange or H1–H3 success claimed at this entry. Operator handoff requested; all confirmations and callbacks stay in the hidden local TTY. Only sanitized fixed progress labels/counts will be read by the agent.

Same one-attempt/no-retry,5minute initiated-flow,12second isolated replay and≤70minute natural-expiry limits. Original ChatGPT connections/grants remain excluded. Final hosted results and independent preservation checks are pending.


### Manual batch final outcome — stopped before token exchange

At2026-10-30T11:38:56.056UTC (12:38:56 Europe/Berlin), sanitized progress records status=stopped, phase=primary_manual, last_passed=PUBLIC_KEYS_REQUIRED, runner_requests1, manual_flows1, failure MANUAL_CALLBACK. That fixed category can originate from Terminal escape/bracketed-paste/multiline/control/length handling or callback URL validation. The existing progress does not identify which input prompt caused it; do not infer a paste, URL mismatch or provider failure without operator evidence. No secret input or Terminal transcript was read.

Only the public JWKS request was made by the Node runner. No PKCE exchange, genuine JWT/owner API assertions, secondary handoff, refresh/replay, expiry wait or logout occurred. H1 BLOCKED at manual handoff; issued-token/API subtests NOT TESTED; H2/H3 BLOCKED. Manual flows1 is an acquisition-attempt counter incremented before isolation confirmation, not proof that Google authentication started. Safari traffic is not observed, so do not claim no browser request or transient provider-flow state. No automatic retry or bypass.

Independent postread11:39:58UTC: original users2/UUID-set, identities4, exact10 original session hashes, native/local clients1/1, grants2/Profile-only2, consents2, fixtures2/proposals0/writesfalse and inventory befbb5ee8105a4d45b70e5c7734e03ad unchanged. Security read11:40:14UTC still ec1f27ff9b3d5f2f35c01e8b99c85d51. Original opaque ChatGPT tokens were not read or exercised; unchanged recorded connections/grants are the scoped preservation evidence. No new session observed or original session removed.

Baseline retired to stopped-manual-baseline-1138.json; exclusive one-run lock remains. No approved-manual-baseline.json remains. Sanitized progress preserved; no token/code/password/cookie persisted or exported. No Auth/client/user/grant/ACL/RLS/Worker/configuration mutation, production access, paid upgrade, deployment, commit/push or destructive cleanup.

Asked operator only which prompt failed and whether input was typed/pasted, never the input itself. Until clarified, exact input-stage cause remains UNKNOWN. No source change or further authentication performed within this stopped batch. **Controlled staging retained; live H1–H3 and production acceptance remain NO-GO.**


### Guided continuation after operator confusion — in progress

Operator requested one step at a time and had not reported a completed Google handoff. Routine local UI correction replaces long typed confirmations with y/Y after the full statements are displayed. Empty/nonaffirmative responses still reject; canonical manual attestation, hidden callback/URL/PKCE/owner checks, budgets and all hosted scope remain unchanged. Focused SDK/privacy and integrated lifecycle regressions PASS. New exact source manifest28d2f5accf7059d9d9bf05738e4e5df21fa5edda746899ee55d832a2c0090699. Old lock/baseline/progress retained; no failed Auth exchange replayed or lock deleted.

Fresh11:46:40–43UTC checks match original10 session hashes/users2/identities4, Profile-only grants2/consents2, clients1/1, fixtures2/proposals0/writesfalse, security/inventory digests and unchanged Worker version/binding/writesfalse. Public Auth/clock and exact source/runtime hashes PASS; restricted UUID mapping matched privately. Policy evidence remains the same explicitly labeled operator dashboard observations.

Fresh protected guided baseline prepared under the existing staging approval and operator's requested guided continuation. Terminal launched once for the new UI; progress11:47:12UTC running/primary_manual/PUBLIC_KEYS_REQUIRED/runner_requests1. Only first readiness confirmation requested in chat; no new live H1/H2/H3 success claimed. Current process awaits operator action; do not infer Google URL generation or sign-in from this phase alone. No existing credentials/session extraction, hosted configuration/deployment/security change, production access, payment or Git publication.
