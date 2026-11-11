# Phase C.1B — Local reconnect fix and CPU investigation

**Final consolidation update:** Fresh read-only staging inspection confirms the wrapper also intentionally retains service_role EXECUTE. The dispatcher does not grant that role EXECUTE and its schema does not grant it USAGE. Both proposals preserve this three-entry wrapper ACL; no permissions are changed. Current checksums below supersede earlier proposals. See [final coordinated rollout](PHASE-C1B-FINAL-COORDINATED-ROLLOUT.md) for current verification, preflight, approval scope and remaining gates. Earlier task-specific no-hosted-query statements describe those historical tasks only.

Date: 2026-10-29, Europe/Berlin. **Local implementation and verification complete; no hosted change or deployment.** This supersedes the local engineering findings in the acceptance report, not its historical hosted results.

| Item | Result |
| --- | --- |
| Existing-consent reconnect | PASS locally, including native workerd; requires the proposed read-only SQL operation and candidate Worker |
| CPU diagnosis/optimization | Measured repeated work removed; local mean CPU improves, hosted Free-plan headroom remains unverified |
| Regression/complete suite |47/47 test files PASS |
| Types/lint/build/scans/audits/native tests | PASS, with the existing moderate development dependency advisory retained |
| Hosted acceptance | NOT TESTED in this task; existing integrations not contacted or changed |
| Recommendation | GO for review of the exact proposals; NO-GO for declaring full acceptance or production readiness |

No staging/production SQL, Auth configuration, grant revocation, token rotation, user/client change, deployment, paid upgrade, data deletion, commit or push occurred. No personal credentials were read or exported. Native upstreams and sessions are synthetic. Both existing ChatGPT connections were left alone. Last observed hosted version remains `40f41d56-fe97-446a-8778-3d815ebc688c`, bundle `bbf827bceb0848476177c8e15d7c7b758565c3ba58470aef6b1675f8b67f2f6b`; no fresh hosted-state verification is claimed here.

## ACL reconciliation correction

The earlier requirement to deny authenticated EXECUTE on the dispatcher was incorrect. [Dispatcher ACL review](PHASE-C1B-DISPATCHER-ACL-REVIEW.md) is authoritative: the approved public wrapper is SECURITY INVOKER and requires that grant. The earlier local fixture erroneously switched the wrapper to SECURITY DEFINER and revoked the grant; that test architecture and its ACL conclusion are withdrawn. Corrected fixture and full47-test rerun PASS. Forward/reverse guards now preserve the intended postgres/authenticated dispatcher ACL and postgres/authenticated/service_role invoker-wrapper ACL; no permission change is in either proposal. SQL/manifest checksums in this report have been updated; earlier checksums are superseded. Worker artifact and function-body hashes are unchanged. No hosted action.

## Verified reconnect cause and correction

[Supabase's supported authorization-details API](https://supabase.com/docs/reference/javascript/oauth-server-getauthorizationdetails) returns either full client/user metadata or only `redirect_url` when consent already exists. The old independent upstream wrapper resets its client variable for each request and requires client metadata before allowing any returned redirect. On a redirect-only GET it therefore throws; the shared consent handler converts the error to503. The local lifecycle model reproduces this precise response shape. Earlier hosted reconnect symptoms are consistent with it, but were not a captured wire trace.

Inferring client identity from a matching callback alone is insufficient: two native clients could register the same callback. Trusting a query-supplied client/user would also bypass the intended binding. Neither shortcut was used.

The candidate handles a redirect-only **authorization-details GET** by calling the existing authenticated RPC wrapper with operation `authorization_binding` and only the bounded authorization_id. The proposed dispatcher branch returns exactly client_id and registered redirect_uri, only when all of these hold:

- Existing live session belongs to auth.uid(); caller is first-party (`client_id` absent and exact audience authenticated).
- The authorization row belongs to that same user, is approved and unexpired.
- Its native client ID is in the local MCP registry.
- The same user/client still has a nonempty local consent row.
- Arguments contain exactly one valid authorization_id; caller-supplied user/client selectors are rejected.

No code, state, verifier, scopes, token, user UUID or email is returned by this lookup. The Worker independently checks the returned client against runtime registration, its stored redirect against the exact callback inventory, and the native redirect URL against that client's callback. It never expands permissions on this GET. POST approval still requires client details and normal explicit section selection. Missing operation, expired/revoked/mismatched context, unregistered client, unexpected callback or lookup outage fails closed. A concurrent later revocation still blocks data at the existing live RPC checks; no cross-service atomicity is claimed.

Changes:

- `hosting/independent/auth.ts`: secure metadata recovery and request-local validation policy.
- `hosting/worker/mcp-consent.ts`: optional independent validation hook after parsing each successful authorization response once; ordinary Site callers retain the existing default behavior. Missing verified user IDs fail closed, and existing wrong-account403 behavior is preserved.
- SQL is a **separate proposal**, not an applied change. The historical `database/mcp.sql`, audience transition artifacts and C.0.1 migration were preserved byte-for-byte from this task's starting state. No historical guard was weakened to accept the new function body.

### Minimal SQL proposal and recovery

[Forward proposal](../database/staging/c1b-reconnect-binding.proposed.sql) changes only the existing dispatcher function body. Target/role/settings and exact prior function owner/security-definer/search_path/body checks precede replacement; the intended authenticated EXECUTE must remain granted, while PUBLIC/anon remain denied. The public wrapper must remain SECURITY INVOKER with its original body/ACL. Both properties are checked before and after replacement. No table/policy/ACL/hook/signing/user/grant change or generic schema replay.

Normalized dispatcher body MD5: old `5746d0b1b36036343df0696e0c5429a4` → candidate `7d93d522e07936bca67faa53903d4868`. These are body compare-and-swap values, not the artifact SHA256 below.

[Reverse proposal](../database/staging/c1b-reconnect-binding.rollback.proposed.sql) restores only that exact old body from the exact new body. Disposable PostgreSQL-compatible databases verified successful forward/reverse, repeated execution refusal, injected late-failure rollback, unchanged data/ACL/policy snapshots, both users/sessions preserved, same-owner and cross-owner cases, wrong audiences/clients, stale sessions, expired/pending authorization, absent local consent and malicious argument rejection. Synthetic code/state sentinels are never in the returned lookup result. These tests do not certify future managed-role privileges; a hosted read-only privilege/catalog preflight is still mandatory.

Reverse execution needs separate explicit approval. It neither changes the audience nor revokes grants. Prefer restoring the prior compatible Worker before removing the new operation; otherwise redirect-only reconnect again denies access. No automatic rollback, account deletion, quota reset or database restore is proposed.

## CPU findings and measured improvement

The prior hosted aggregate p99 **15.139ms** is a real observation across mixed routes; it does not identify its function-level cause. No new hosted traffic or profiler capture was performed here.

Baseline CPU sampling and source tracing identify two repeat costs:

1. `colocated-worker.ts` rebuilt validated config/router/services on every request, parsing client/callback JSON and URLs each time. Native instrumented baseline builds config24 times for24 requests.
2. The independent authorization wrapper cloned/teed and decoded a response, then the shared handler decoded it again. The candidate validates the already-parsed authorization object instead, eliminating that duplicate response processing.

The candidate caches only validated deployment setup in a WeakMap keyed by environment. Every relevant input, binding and fetcher identity is compared on use; mutation invalidates the entry. Non-string configuration inputs are not trusted for reuse. Native workerd observes **one** configuration build for the same24-request mix. No bearer verification, user/session, consent or callback transaction result is cached across requests. Regression tests change Auth/consent results between successive requests and confirm fresh denial, and verify writes/config/registration/binding drift invalidation.

### Local measurements

Same Node22.13.1 harness,3000 measured iterations per route after warmup, synthetic upstreams, stub admission. Values are **mean process CPU per request**, not Cloudflare CPU or p99. Persistent DO and real provider work are excluded from this microbenchmark.

| Route | Baseline µs | Candidate µs | Reduction |
| --- | ---: | ---: | ---: |
| /login |119.010 |102.729 |13.7% |
| /mcp profile |209.433 |203.262 |2.9% |
| /oauth/mcp/consent, full details |113.714 |73.722 |35.2% |
| /oauth/mcp/connections |97.594 |81.879 |16.1% |

New redirect-only reconnect adds one narrowly constrained database RPC, so these full-details measurements do **not** claim its extra request is free or that all routes improve by the same amount. Auth/token/SQL security checks and shared quota costs were retained.

Native DevTools CPU profiles cover24 matched login/MCP/consent requests with actual local workerd and SQLite coordinator. Profile copies add only an ignored local config-build counter; this instrumentation and its endpoint are absent from deployment packaging. Baseline profile172 samples/candidate100 samples are retained for attribution, not treated as a valid CPU percentage comparison: sampling duration, idle/I/O, cold initialization and machine scheduling differ. The robust native observation is24→1 configuration builds. All profiling processes stopped; local state retained.

[Official Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) specify10ms CPU/request on Free and occasional isolate flexibility. Network wait is excluded from CPU; local development does not enforce hosted CPU limits. [Official CPU profiling guidance](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/) also cautions that local behavior may not reproduce production. Therefore local sub-millisecond means and fewer setup operations **cannot clear** the hosted p99/headroom gate. A reviewed deployment and bounded comparable hosted CPU measurement are still required; no paid upgrade or limit increase is proposed.

## Verification and evidence

| Check | Result |
| --- | --- |
| Complete network-blocked local runner |47/47 PASS, including existing security, MCP, RLS, account isolation and lifecycle suites |
| New reconnect SQL regression | PASS binding/data privacy/ACL preservation, forward/reverse CAS and atomic failures |
| New Worker regression | PASS cache reuse/drift invalidation, per-request Auth/consent verification, redirect-only success, absent/malformed/unregistered bindings, cross-owner and malicious redirects |
| Updated lifecycle regression | PASS existing-consent reconnect with modeled authorized binding; no permission expansion |
| Frontend and Worker TypeScript | PASS |
| Hosting lint | PASS |
| Independent and staging production-mode builds | PASS; old root dist untouched |
| Staging artifact scans | PASS public37, hosting169, selected staging167 files |
| Dependency audits | Root0; hosting1 existing development moderate GHSA-67mh-4wv8-2f99,0 high/critical; no install/update |
| Native workerd/SQLite | PASS exact audience, owner injection/write denial, fresh consent and redirect-only reconnect, Google callback/account binding/CSRF/replay negatives |
| Native concurrency and persistence | PASS90 mixed routes/global30 cap, failure closed before upstream; counters persist; pending callback restart race one303/one400 |
| Exact Wrangler dry-run package | PASS matches candidate byte hash; no upload |
| Deployed hosted behavior / new SQL / new CPU | NOT TESTED; prohibited in this task |

[Existing moderate advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) remains unsuppressed. No dependency/lockfile change. Two initial regression failures were resolved without relaxing checks: wrong-account status was preserved at403, and the historical C.0.1 test continues using its original dispatcher body rather than silently replacing its approved hash. Fixture-only compiler/WebSocket setup issues were corrected; final results above are the completed runs.

Ignored evidence: `.sites-runtime/c1b-local-blockers/` contains baseline/candidate CPU profiles and summaries, tests/types/lint/audit/build/scans/native/dry-run logs, source manifest and preserved deployed baseline bundle. No personal tokens, UUID mappings or credentials are in the report. New durable test sources: `tests/reconnect-binding-database.cjs`, `tests/worker-reconnect-performance.cjs`; native helper scripts now test the automatic reconnect branch. `scripts-profile-c1b-local.cjs` uses only loopback, synthetic traffic and the already installed WebSocket package.

## Exact proposed artifacts — none applied

| Artifact | SHA256 |
| --- | --- |
| Candidate full Worker,53689bytes; identical dry-run module | `0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e` |
| Unchanged ignored runtime config | `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5` |
| Forward read-only-binding function proposal | `1e2382dbbddbe69691f01caac8e86b1c61530aa0595f8f120a9e5332c072fb8c` |
| Reverse function proposal | `6da8bcd152efe88683074718e39762d9999dddea3db3fecb5fa1e67b3c775288` |
| Ignored release/source manifest | `1210ecd066725c99cce8b4c87114e664cd802fcb828c2cf5f41a716e09b46b17` |

The candidate depends on the new dispatcher operation for automatic existing-consent reconnect. Uploading only the Worker while the operation is absent will still fail closed; it is not a complete fix. Same Worker/account/origin/config/client/callback/namespace/class/fixed object/migration history; no new runtime secret or environment variable.

Before any separately approved execution, rehash files and verify exact staging project, original two users, profile-only grants, writesfalse, native/local registration/callback, dispatcher/body/ACLs, Auth authorization-table schema and postgres SELECT authority, Free entitlement and namespace/state. Stop on drift; do not grant permissions to force success.

Smallest future setup window, requiring explicit SQL and Worker approvals:

1. Apply the exact forward function proposal once after the fresh read-only preflight and same-session verified target assertion. Independently verify new body/unchanged owners, ACLs and state.
2. Deploy only the exact candidate with unchanged reviewed config. Re-read version/module hash/binding and check bounded metadata/login/denial/security headers. No new namespace or migration. Existing connections need no revoke.
3. Separately authorize one existing-consent reconnect through the supported client per approved account, with profile-only grants unchanged. This is a real authorization/session operation and is not authorized by this local task. Stop on wrong identity/callback, new user/client or expanded sections. Verify A/B results and original UUIDs without exporting tokens.
4. Read bounded comparable hosted metrics after accepted traffic. Require appropriate CPU headroom before closing that gate. No load test, quota reset or upgrade.

The previously reviewed hosting-directory Wrangler command/config remains the proposed packaging mechanism. No command was run without --dry-run in this task.

## Smallest safe remaining hosted acceptance procedure

The existing integrations and grants must remain untouched. Previously observed A/B results and anonymous/forged-token denials need not be repeated merely to fill a checklist.

| Remaining case | Minimal safe mechanism | Required interaction/authority |
| --- | --- | --- |
| Genuine issued-token alg/kid/signature, expiry, wrong issuer/audience/signature, PKCE/state errors | Reviewed local public-client PKCE harness; existing approved Google identities; credentials held only transiently in its process; emit fixed result labels/booleans | Interactive Google authentication and explicit credential-safe harness/session authority; no token in chat/logs/files |
| First-party REST/RPC cross-owner isolation | Dedicated first-party sessions for the same two users; existing exact workspace fixtures; assert A/B own result and cross-owner denial; no operator bypass | Interactive login in isolated sessions and reviewed harness; no new user or hosted data needed |
| OAuth direct-table/section/argument negatives | Dedicated test-client sessions with profile-only consent and same resource; operate only on synthetic fixtures | New test client/runtime+local allowlist entry need separate explicit approval, with exact assigned ID/callback and bounded config/SQL proposals |
| Native revoke, old access/refresh reuse, reconnect and logout | One isolated test client shared by the two approved users; revoke only its user/client grants, rotate/reuse only its disposable sessions, logout scope local | Explicit state-changing test authority; no revocation of current ChatGPT client and no global logout. A separate client is needed where native revocation is client-wide |
| Real private-object cross-owner isolation | Only if separately approved: tiny owner-bound test objects in existing private buckets, with exact MIME/path/cleanup scope | Object writes/deletion are not authorized now; otherwise this case stays blocked. Do not infer it from empty storage |
| Unknown Google identity rejected | Provider-approved additional controlled identity plus account-creation contingency | Explicit new identity/test scope; current two-user limit does not authorize it |
| CPU, billing, storage-write metering/log retention, controlled failover | Existing aggregate metrics/dashboard review first; narrowly bounded non-destructive capture/test plan if still needed | Read-only operator evidence where current APIs lack access; separate approval for hosted profiling/fault injection/config/deployment |

Use no service-role credential or extra Supabase Management API credential. Do not enable signup/DCR/writes, mint broad audiences, replay a consumed real code, manufacture provider identities, weaken RLS, or use existing connection tokens as disposable fixtures. If the minimal test-client/harness scope is not approved, retain those gates as BLOCKED.

**Final recommendation:** local reconnect correction and measured optimization are ready for review. Full staging acceptance remains NO-GO pending the approved SQL/Worker rollout, real existing-consent acceptance, hosted CPU evidence and the separately constrained lifecycle/API gates. No production readiness claim or hosted execution authority is inferred.
