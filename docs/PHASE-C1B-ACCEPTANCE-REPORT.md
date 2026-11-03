# Phase C.1B — Consolidated acceptance testing

Latest follow-up: [Phase C.1C security/lifecycle report](PHASE-C1C-SECURITY-LIFECYCLE-REPORT.md) records49/49 local test files, unchanged deployed state and the separately proposed disposable first-party acceptance batch. No hosted lifecycle mutation occurred in C.1C; real OAuth-client gaps remain blocked.

**Latest coordinated rollout:** approved reconnect SQL and Worker version dcfcac5d-88d2-4432-a262-e288f05f31e4 are now deployed; both existing A/B profile regressions PASS, with connections/grants preserved. Six security probes PASS; new-version16-request CPU p99=6.574ms is preliminary. Reconnect lacks a supported UI control and remains untested. [Consolidated actual execution report](PHASE-C1B-FINAL-COORDINATED-ROLLOUT.md) supersedes older active-version and pending-deployment statements; remaining hosted acceptance gaps persist.

Latest local reconnect/CPU remediation, corrected ACL contracts and coordinated rollout proposal: [final coordinated rollout](PHASE-C1B-FINAL-COORDINATED-ROLLOUT.md). The coordinated remediation is now deployed as recorded in the latest status above; historical hosted acceptance gaps remain distinct from the successful rollout.

**ACL clarification:** [Dispatcher ACL review](PHASE-C1B-DISPATCHER-ACL-REVIEW.md) corrects the later local fixture/proposal: authenticated EXECUTE on the definer dispatcher is intentional and required by the public invoker wrapper. No hosted permission remediation was performed; use the revised SQL checksums in that review. Historical effective-ACL snapshots are not relabeled as denying this intended grant.

Date: 2026-10-29, Europe/Berlin. Supersedes the remaining-test assessment in the staging integration report; that report retains the deployment/operator history.

**All currently authorized automated checks are complete. Core two-account profile integration remains PASS. Full acceptance and broader/production rollout remain NO-GO.** Two gates fail: existing-consent reconnect compatibility and demonstrated Free-plan CPU headroom. Other hosted negative/lifecycle cases are blocked by the protected-token/session and configuration boundaries below. No working connection was revoked or reauthorized in this testing pass.

## Subsequent local engineering

[Local blockers report](PHASE-C1B-LOCAL-BLOCKERS-REPORT.md) records the locally verified reconnect correction, separately proposed read-only SQL operation, measured CPU improvements and candidate artifact. None is deployed/applied; hosted results and blocked gates below remain historical acceptance evidence. Latest candidate suite47/47 and native reconnect/persistence tests pass; hosted CPU headroom is still not certified.

## Scope, method and preserved state

Only Supabase `gngnrmzeghjzqsmzuktl` and Cloudflare Worker `mfd-connect-staging`, account `fa8205077c4bc4d2bb38ee035e74a156`, were queried. No production access, deployment, hosted SQL mutation, Auth/client/user/identity/grant change, paid upgrade, token rotation, data deletion, commit or push occurred. Hosted probes used only public verification material, the existing publishable key internally, and freshly generated **synthetic invalid** tokens. No personal bearer, refresh token, cookie, authorization code or password was inspected, printed or persisted.

Local state-changing tests used disposable databases and synthetic sessions. A new test, [acceptance-token-lifecycle.cjs](../tests/acceptance-token-lifecycle.cjs), adds real ephemeral ES256 signing/verification at a **modeled Auth boundary** and exercises the existing application handlers. It does not reproduce all Supabase Auth internals or establish hosted refresh behavior. Its private signing key exists only in process memory. No runtime source/configuration changed.

Before/after hosted checks match: users2/original approved UUID-set; identities4; sessions10; native/local clients1/1; two profile-only local grants; active native consents2; proposals0; workspaces2. Aggregate workspace digest `49e93b3b23f89088c49006b2f610f8fa` is unchanged. UUID mappings remain restricted/Git-ignored, not in this report. No direct data inspection beyond approved synthetic fixtures was needed.

Application/MCP table owners/ACLs/RLS, policies including storage, function definitions/ACLs, schema ACLs and bucket privacy/limits retain boundary digest `61546963f7d66d8637dccbd22b0cd61b`. Public signup remains disabled, Google enabled, anonymous disabled. Both database `writes_enabled` and deployed Worker `MFD_MCP_WRITES` remain false. Stored DCR/path/hook settings remain prior saved operator evidence; no full secret-bearing management response was fetched.

## Complete acceptance matrix

Status applies to the stated evidence scope. A local PASS never substitutes for a blocked hosted test. “Interactive” describes a test method, not authority to perform it now. Previously conclusive hosted results are carried forward rather than repeated unnecessarily.

| Requirement | Classification | Result | Evidence / limitation |
| --- | --- | --- | --- |
| Exact target; preserve users, connections, grants, fixtures and false writes | Automated hosted read-only | PASS | Matching before/after counts/digests and active Worker settings; no valid-user authentication request in new probes |
| Primary and secondary Google login; stable UUIDs; no duplicates | Interactive, completed previously | PASS | Operator connections pages and independent identity/session ownership comparisons; original two-user UUID-set unchanged |
| Primary authenticated profile | Interactive, completed previously | PASS | Reported ChatGPT tool result A/revision1 plus independently matched profile-only grant and fixture |
| Secondary authenticated profile | Interactive, completed previously | PASS | Reported ChatGPT tool result B/revision1 plus independently matched profile-only grant and fixture |
| Strict issuer/resource audience/client/role/session/expiry/not-before | Automated local | PASS | Existing MCP/Google suites plus new signed-token tests; invalid variants stop before data RPC |
| Forged ES256 signature with published kid | Automated hosted, new | PASS | Synthetic token uses real public kid but different ephemeral private key; signature independently fails against staging JWKS; Worker returns401 |
| Unsigned alg=none token | Automated hosted, new | PASS |401; no diary response; no live session used |
| Signature/payload tampering and wrong signing key | Automated local, new | PASS | Real cryptographic fixture verifies signature; existing Worker honors denied Auth response before data access |
| Genuine issued token alg/kid/signature; retained HS256 policy | Blocked hosted | BLOCKED | No live token inspection authorized; current published ES256 verification material is consistent, not proof of a particular token. Worker delegates authentication to pinned Auth and is not ES256-only; previous HS256 trust remains a documented residual risk |
| Genuine expired-token and modified-valid-token hosted matrix | Blocked hosted | BLOCKED | No disposable valid hosted token/session accessible without interactive authentication and a safe approved harness; synthetic/local expiry tests pass but do not isolate hosted expiry enforcement |
| Bearer required; browser cookie cannot authenticate MCP | Automated local/native; prior hosted denial | PASS | Native cookie-only MCP401; previous missing/invalid-bearer hosted checks; valid MCP flow requires bearer |
| Exact Origin, malicious cross-origin/null/missing Origin, proxy/Referer spoofing | Automated local/native; prior hosted denial | PASS | Browser-origin-policy suite and existing native/hosted evidence; no wildcard or header fallback added |
| Browser form behavior, secure cookies, CSP, Referrer-Policy | Automated local/native; prior hosted checks | PASS | Native browser reproduction/correction, secure host cookies, corrected login strict-origin and callback no-referrer; current deployed artifact unchanged |
| CSRF, malformed/duplicate forms, callback bounds and redirect targets | Automated local/native | PASS | Existing independent Google/auth and callback diagnostic suites; invalid CSRF/Origin/relative continuation rejected |
| S256 challenge/verifier association, state/browser binding and one-time callback | Automated local/native | PASS | Synthetic upstream enforces verifier association; actual local SQLite atomic consume, cancellation/error/replay/race/expiry tests |
| Actual provider wrong/missing-verifier, state and redirect negative matrix | Blocked hosted | BLOCKED | Would need fresh controlled authorization and approved safe client harness; never replay a consumed real transaction |
| Browser account substitution | Local/native plus observed hosted attempt | PASS | Primary-bound flow selecting secondary returned CB_ACCOUNT and retained primary Worker session; isolated secondary then succeeded |
| Fresh profile-only consent and exact native callback/client | Automated local plus prior hosted/operator evidence | PASS | Both stored grants exactly profile; sole expected Public/none client/callback; source exact-match checks |
| Profile-only nutrition denial | Automated local/native; reported client challenge | PASS locally; hosted NOT TESTED at wire level | Real client returned reconnect challenge/no nutrition data, then get_profile still returned A without reconnect; raw nutrition response unavailable. No permission expansion |
| Owner-ID tool argument rejection | Automated local/native | PASS | Additional user_id argument rejected with JSON-RPC -32602; no owner chosen from caller input |
| Owner-ID rejection through actual ChatGPT transport | Blocked hosted | BLOCKED | Client hides/validates tool schemas; no raw authenticated transport access authorized |
| Cross-account profile ownership | Local databases/native plus reported hosted A/B | PASS in stated scope | A reads A and B reads B; SQL derives auth.uid and checks client/live consent. This does not prove every cross-owner direct API negative |
| Direct anonymous REST against populated workspace table | Automated hosted, new | PASS | GET select=revision&limit=1 returns401; the table has two approved fixtures |
| Direct anonymous profile RPC | Automated hosted, new | PASS | Read-only profile operation returns401; no state change |
| First-party direct REST/RPC/storage cross-owner negatives | Local automated; blocked hosted | PASS locally; hosted BLOCKED | Existing RLS/database suites exercise local roles/claims; no user-held token export or new proxy/test route allowed |
| OAuth direct-table restriction/live-session and consent checks | Local automated; blocked hosted | PASS locally; hosted BLOCKED | Disposable PGlite schema tests reject direct OAuth table reads, wrong owner/session, old audience and revoked local consent; operator-bypass SQL is not acceptance evidence |
| Private schemas, RLS/ACLs and bucket configuration unchanged | Automated hosted catalog | PASS | Matching boundary digest; previous exact Data API dashboard evidence retained; no storage/publication changes |
| Actual per-user private-object isolation | Blocked hosted | BLOCKED | No live user credential channel or approved object fixtures; empty buckets/configuration cannot prove cross-owner access denial |
| Unknown Google signup rejected | Local model + current setting; blocked real flow | BLOCKED hosted | Signup disabled verified; actual third-identity attempt excluded and could create state if misconfigured. No third account used |
| Password-login fallback | Automated local/native | PASS | Existing password/verified-session fixture; no real passwords inspected or hosted password login attempted |
| Refresh rotation/reuse and first-party renewed-session identity | Automated local, new | PASS within model | Synthetic refresh rotates once; reuse after simulated grace rejected, error clears cookies. Does not certify Supabase's actual grace/reuse semantics |
| Forced hosted refresh/reuse | Interactive + additional safe-session access | BLOCKED | No rotation of current client tokens authorized; tokens remain in normal client stores |
| Local revoke before native revoke; native outage containment | Automated local, new | PASS | Native revoke503 after local removal; still-valid signed old token denied private data; other owner remains usable |
| Native consent revocation | Prior interactive + independent readback | PASS | Earlier approved UI revoke yielded zero local grants/active native consents and revoked native record before fresh reconnect |
| Hosted old-access/refresh token reuse after revocation | State-changing hosted | BLOCKED | Cannot revoke current grants or export/reuse existing tokens under this task; earlier database revocation proof is not a replay test |
| Fresh explicit-consent reconnect after revoke | Local model plus prior hosted result | PASS | New model session works, old session stays denied; earlier real profile-only reconnect returned A |
| Existing-consent redirect-only reconnect compatibility | Automated local reproduction; prior hosted symptom consistent | FAIL | Strict wrapper cannot bind redirect-only response to a client in that request and returns503. No unsafe redirect taken; no security bypass. Reproduced in new test; fix outside testing scope |
| Logout/cookie clearing and refresh/session invalidation | Automated local/native | PASS locally; hosted BLOCKED | Existing handler/synthetic session tests; live logout would disturb preserved browser sessions and needs separate testing authority/session |
| Writes/tools/proposals disabled | Automated local/native + hosted configuration | PASS | Only five read tools advertised locally; write-tool invocation rejected; proposals0 and both false switches verified. No hosted write attempted |
| Callback diagnostic privacy and negative branches | Automated local/native | PASS | Fixed identifiers only, no credential/exception reflection, failed validation does not install access cookies |
| Shared limiter/concurrency/persistence/outage denial | Automated local native + prior bounded hosted denial | PASS in stated scope |90 mixed requests cap shared admissions30, no upstream after denial; counters persist after process restart; no binding fallback. No new hosted stress test |
| Forced hosted DO restart/multi-region/outage injection | Operational mutation | BLOCKED | Would risk current service/state; no fault injection/deployment/traffic sources authorized |
| Production-mode build, types, lint, artifact security scans | Automated local | PASS |45/45 test files; both TypeScript projects; lint; staging/independent builds; scanned public37/hosting169/selected167 files |
| Dependency audit free of high/critical findings | Automated local audit | PASS with known moderate | Root0; hosting1 moderate GHSA-67mh-4wv8-2f99 via development Drizzle/esbuild; no install/fix/update |
| Worker Free CPU headroom | Automated read-only metrics | FAIL to clear gate | Current-deployment-window success p99=15.139ms versus10ms documented allowance; see operational section |
| Request/storage metering access | Automated read-only metrics | PASS for retrieved aggregates | Worker/namespace metrics readable with existing connection; not a bill, full daily quota or exact SQL-write accounting |
| Precise billing/SQL row-write quota, all platform log retention/redaction | Operator/billing evidence | BLOCKED | Existing billing authorization unavailable; no new credential requested; app observability disabled does not prove platform retention policy |
| Complete S5–S8 intentional/automatic client request attribution | Evidence unavailable | NOT TESTED completely | New testing pass uses exactly6 public/Worker/API probes, no load; previous client retries not fully observed. Aggregate traffic is not an intentional-request ledger |
| Full independently read Auth management settings (DCR/path/hook/provider selection) | Operator evidence only | BLOCKED independently | Saved dashboard observations retained, metadata consistent; no secret-bearing config dump or extra management credential |

## Execution and reproducible evidence

New local coverage: [acceptance-token-lifecycle.cjs](../tests/acceptance-token-lifecycle.cjs), SHA256 `726665f0ff93c3565fa3e69b92731e9920acb6e9966974c3baaaa089f4d6f74c`. The single test adds coverage only; it is not deployed code.

The first test-fixture run omitted the MCP Accept header and failed before tool handling. Adding the required Accept header to the synthetic request fixed the fixture; no application check was relaxed. Final full runner45/45 PASS. Root audit0; hosting1 moderate,0 high/critical: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). Existing database advisor password-protection warning and intentional private-table RLS INFO findings remain documented; no paid remediation or policy changes applied.

Reproduce with Node22.13.1 and the existing locked packages:

1. `npm run test:local` (network-blocked child runner); both frontend/hosting TypeScript no-emit projects; hosting lint.
2. `node scripts-build-independent.cjs`; `MFD_BUILD_OUTPUT=.sites-runtime/phase-b-dist npm run build`; `node scripts-verify-staging.cjs public hosting/dist .sites-runtime/phase-b-dist`.
3. Existing `scripts-prepare-colocated.cjs` and `scripts-prepare-google-local.cjs`; Wrangler dev **--local** with the existing trusted HTTPS certificate on54444/54445 and retained respective state directories. Run `scripts-smoke-colocated.cjs` and `scripts-smoke-google-local.cjs`; prepare-persistence; stop/restart processes against the same state; run persistence checks. Do not reset quota counters to force a pass.

Native results:90 concurrent mixed routes/global30, missing-binding denial, exact audience/owner-injection/write rejection; Google callback/session/consent, cancellation/state/exchange/replay/Origin negatives; counters survive restart; persisted pending callback race has one303/one400. Emulators stopped; state retained. No hosted login or real provider upstream in native fixtures.

Evidence ignored under `.sites-runtime/c1b-acceptance/`: tests/types/lint/build logs, audit JSON, safe hosted probe JSON, native result/restart logs and metrics summary. Existing native fixture evidence remains under the prior ignored directories. Synthetic refresh/access fixtures are not real credentials; no personal token persisted.

## Operational results and risks

Read-only [Cloudflare GraphQL metrics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) were available without new credentials or enabling logs. Schema introspection establishes CPU percentile units as **microseconds**.

- Worker all-version window from13:50UTC:183 success invocations,1 clientDisconnected; aggregate errors0. These include operator/client and other traffic, not only agent probes. These are invocation-error counters, not a claim that HTTP authentication/permission error responses were absent.
- Current-deployment window from15:21:29UTC:120 success requests,241 subrequests, errors0; CPU p50=3986µs (**3.986ms**), p99=15139µs (**15.139ms**); one additional clientDisconnected. Samples cover mixed routes/window, not a per-route benchmark or guaranteed per-invocation maximum.
- DO namespace window from13:50UTC:199 successes/errors0 plus one clientDisconnected counted as one error; current window145 successes plus one clientDisconnected. The initially aggregated error is classified as client disconnect, not evidence of an uncaught DO exception. Maximum SQL stored bytes28672 (**28KiB**). Exact billed reads/writes/daily headroom remain unverified.

[Workers Free allowance](https://developers.cloudflare.com/workers/platform/limits/) is10ms CPU per HTTP request. Cloudflare documents occasional isolate flexibility, so15.139ms at p99 is not proof of a paid plan, billing failure or an exceededCpu event. None was returned in queried statuses. It **does** prevent certifying reliable CPU headroom within that allowance. No upgrade, higher limit, optimization patch or load test was attempted. A focused profiling/optimization review and a separately approved artifact deployment would be the next engineering scope if needed.

No new known authorization bypass was demonstrated. Residual risks: existing-consent reconnect503; CPU tail/headroom; unverified hosted token/direct-API cases; retained previous HS256 trust; known password-security/advisory findings; public rate-limit exhaustion and fixed-window bursts; opaque client retries/platform log retention. Core A/B profile results remain valid but do not close these gates.

## Exact remaining human/authorization actions

No immediate human action is needed to keep the current working staging connections. No new approval is implied or requested just to end this test pass.

1. **Read-only operator review:** Cloudflare dashboard Free entitlement/billing/usage and applicable log retention/redaction, especially callback-query handling. Supply aggregated/non-secret evidence only. Stored Supabase DCR/path/hook URL observations can be reconfirmed read-only; no toggles or credentials needed.
2. **Hosted first-party/API matrix:** requires a supported, reviewed browser/session harness plus interactive authentication for the existing two identities. It must keep credentials transient and out of chat/logs, avoid affecting current connections, and prove real authenticated REST/RPC/storage ownership. No credential-reading workaround or new endpoint is authorized now; any required harness deployment needs separate approval.
3. **Hosted OAuth refresh/revoke/reuse/expiry matrix:** requires explicit authority for isolated disposable sessions and, where revocation is client-wide, a separately approved test client/allowlist design that cannot revoke the preserved integrations. Current rules forbid new clients and revoking/rotating current grants/tokens, so these gates remain BLOCKED. No new user is necessary or approved.
4. **Unknown identity negative:** needs an explicitly approved identity and account-creation contingency review. Do not attempt it with an unapproved account or reopen signup; current two-identity boundary cannot prove this real-provider case.
5. **Reconnect/CPU engineering:** separately review any runtime patch/hash and deployment. Do not weaken client binding, signature/claim checks, permissions, limiter budgets or false writes as remediation. Force-restart/multi-region tests need their own non-destructive operational test scope.

## Decision

**GO only for retaining the demonstrated controlled two-user, Profile-only staging state. NO-GO for full Phase C.1B acceptance, broader rollout, production or MCP writes.** Every authorized automated test completed; the remaining gaps above are expressly blocked or not tested, not silently passed. Both existing integrations, two fixtures, approved registrations and current namespace/state are retained.

Active version `40f41d56-fe97-446a-8778-3d815ebc688c` remains100%; unchanged deployed/local bundle SHA256 `bbf827bceb0848476177c8e15d7c7b758565c3ba58470aef6b1675f8b67f2f6b`; unchanged release config SHA256 `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5`. Previews remain OFF, same SQLite binding/namespace, no deployment in this pass. Expected subscription increment remains$0 under the owner's existing Free condition; exact billed amount is not claimed.
