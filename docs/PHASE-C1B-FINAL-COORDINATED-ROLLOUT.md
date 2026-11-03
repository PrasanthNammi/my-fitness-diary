# Phase C.1B — Coordinated staging rollout and execution report

**Latest status: approved SQL and Worker rollout executed and verified. See the actual execution result below. Both existing A/B profile reads pass; reconnect UI and sustained CPU acceptance remain open.**

2026-10-29, Europe/Berlin. **GO for one consolidated execution approval; no hosted mutation authorized or performed by this preparation. Full acceptance/production remain NO-GO.** This document supersedes the ACL and proposal-checksum conclusions in the earlier local reports. Historical hosted results remain intact.

## Resolved discrepancies and implementation

The dispatcher requires authenticated EXECUTE because the public wrapper is SECURITY INVOKER. Denying that permission or elevating the wrapper would contradict the approved architecture. Fresh staging inspection additionally confirms the wrapper has a legitimate retained service_role EXECUTE entry. Its historical provenance is not established by this review; no claim is made that the dashboard created it. Preserve it, rather than rewriting permissions to match an incomplete fixture.

| Function | Owner / mode / search_path | Exact explicit EXECUTE grantees | Normalized body MD5 |
| --- | --- | --- | --- |
| mfd_mcp.dispatch(text,jsonb), before/recovery | postgres / DEFINER / empty | postgres, authenticated | 5746d0b1b36036343df0696e0c5429a4 |
| Same, proposed forward | unchanged | unchanged | 7d93d522e07936bca67faa53903d4868 |
| public.mfd_mcp(text,jsonb) | postgres / INVOKER / empty | postgres, authenticated, service_role | c0586b393b1d82332c88f1b1123f57c5 |
| mfd_mcp.access_token_hook(jsonb) | postgres / INVOKER / empty | postgres, supabase_auth_admin | 9fde3c29dc02c1313687ce426b5d1237 |

All listed grants lack grant options; PUBLIC/anon EXECUTE is denied. service_role has neither mfd_mcp schema USAGE nor dispatcher EXECUTE. Its wrapper grant cannot elevate it through the invoker wrapper; disposable role tests confirm denial. No runtime service-role credential is introduced. Authenticated direct dispatcher calls and public-wrapper calls receive identical owner/session/consent checks. Private schema exclusion from the Data API remains a separate boundary.

Both SQL artifacts now assert the exact two-entry dispatcher and three-entry wrapper ACLs, owner, mode, empty search_path and body hashes before and after replacement. ACL order is compared semantically. Tests preserve the actual invoker/definer architecture and reject missing/extra/grant-option ACL drift. Neither artifact contains GRANT, REVOKE, owner changes or table/data mutation. CREATE OR REPLACE retains existing permissions; [PostgreSQL reference](https://www.postgresql.org/docs/17/sql-createfunction.html). The reverse body equals the original; the forward differs only by the new authorization_binding branch. The canonical database/mcp.sql and historical audience artifacts remain unchanged.

Reconnect failure: an existing native consent can produce a redirect_url-only authorization-details response. The old Worker cannot bind that response to a verified client and safely rejects it. The candidate obtains only client_id/redirect_uri through the authenticated wrapper's new read-only authorization_binding operation. It requires the current first-party user/live session, exact bounded authorization_id argument, that user's approved/unexpired native authorization, registered client and existing nonempty same-user grant. It returns no code, state, token, scopes or user identifier. The Worker then independently verifies runtime registration and exact callback/redirect. It never infers identity from callback alone or accepts query-supplied owner/client selectors. Explicit consent POST and OAuth-token guards remain unchanged. Missing, stale, mismatched or unavailable binding fails closed.

CPU improvements remove repeated configuration/router construction and repeated authorization-response parsing/cloning. Deployment-input caching invalidates on any relevant variable/binding/fetcher change; no token, session, identity or consent is cached. Shared Site callers retain their default policy. PKCE S256, strict Origin/CSRF, one-time consumption/replay protection, account binding and live consent/data checks are preserved.

## Verification completed

| Check | Result / evidence |
| --- | --- |
| Full network-blocked suite | PASS 47/47 files, final-tests.log |
| Forward/recovery SQL | PASS committed round trip, exact body restoration, data/ACL/RLS preservation, repeat refusal, drift refusal and injected late-failure atomicity |
| ACL/RLS/security | PASS intended authenticated call paths; service_role wrapper entry cannot reach private dispatcher; wrong owner/session/client/audience/authorization/consent rejected |
| OAuth/JWT/consent/isolation | PASS local synthetic lifecycle, signed invalid-token matrix, reconnect, owner injection, cross-account, profile-only, CSRF and replay suites; no live token exported |
| Native HTTPS workerd/SQLite | PASS reconnect, MCP/auth/consent/Google synthetic routes, Origin denial, 90 mixed concurrent requests/shared cap, missing-binding denial |
| Native restart | PASS retained quota snapshot; persisted pending callback has exactly one303 winner/one400 rejection under concurrency |
| Frontend and Worker TypeScript / hosting lint | PASS |
| Independent and staging production-mode builds / scans | PASS public37, hosting169, selected staging167 files; root dist not a release input |
| Exact Wrangler dry-run packaging | PASS packaged module byte-identical to candidate; no upload |
| Fresh dependency audits | Root0; hosting1 existing development-only moderate GHSA-67mh-4wv8-2f99; zero high/critical. Hosting uses pnpm audit, not npm's incompatible lockfile reader; no dependency change |

Evidence is ignored under .sites-runtime/c1b-local-blockers/, including final-* logs/profiles, audit JSON and manifest. Local emulators were stopped; SQLite state was retained. Initial sandbox EPERM on loopback binding was resolved through approved local execution, with no security test bypass. No hosted Google/ChatGPT test was repeated in this preparation.

Repeated local benchmark: 3,000 requests per route per artifact, synthetic upstream/admission stub, Node process CPU microseconds/request:

| Route | Baseline | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| Login | 113.880 | 103.732 | 8.9% |
| MCP profile | 215.857 | 214.708 | 0.5%; effectively unchanged |
| Consent | 111.368 | 73.599 | 33.9% |
| Connections | 100.877 | 83.389 | 17.3% |

Earlier native profiling independently showed configuration construction24→1 over24 matched requests. These are local attribution/mean measurements, not hosted CPU percentiles. [Cloudflare's current limit](https://developers.cloudflare.com/workers/platform/limits/) remains10ms CPU/HTTP request on Free, excluding network wait and with limited occasional burst flexibility. The previous hosted p99=15.139ms therefore remains an unresolved headroom gate; this proposal cannot certify its improvement before deployment and fresh metrics. No paid fallback or limit increase is proposed.

## Fresh read-only staging preflight

Final database inventory read at 2026-10-29T18:32:12.962671Z; catalog/config reads in the same preparation window. These reads do not reserve state; repeat immediate assertions before approved mutation.

| Required condition | Result |
| --- | --- |
| Exact project/database | PASS gngnrmzeghjzqsmzuktl, MFD OAuth Phase2 Testing, healthy, eu-central-1, expected staging DB host; postgres database/current role |
| Original two users | PASS2 confirmed/non-anonymous; UUID-set matches restricted evidence, identities4, sessions10; no private mappings included |
| Existing integrations | PASS native/local client1/1, two Profile-only grants/active consents, two unchanged synthetic workspaces; earlier aggregate fixture digest retained |
| Proposal target/body/ACL compatibility | PASS exact old dispatcher, wrapper/hook bodies/modes/owners/search paths and current ACLs above; native authorization SELECT and existing owner replacement authority present |
| Auth public settings | PASS HTTP200 signup disabled, Google enabled, anonymous disabled; OAuth discovery200/exact issuer, no advertised registration endpoint |
| DCR/path/hook/Site URL | Prior saved operator evidence retained; metadata consistent. Independent stored management read remains unavailable; no secret-bearing dump or new credential requested |
| Both MCP write switches/audience | PASS database false and active Worker false; exact Worker /mcp audience |
| Application security boundary | PASS catalog/ACL/RLS/policy/schema/storage digest61546963f7d66d8637dccbd22b0cd61b unchanged; buckets private, proposals0 |
| Worker target/version/config | PASS expected account/origin, active version40f41d56-fe97-446a-8778-3d815ebc688c at100%; same AbuseCoordinator namespace781eaeca44c74543be214f485033adda, no replacement/new namespace |
| Free/no upgrade | Existing owner condition retained; exact billing remains unavailable. Stop on any payment/upgrade prompt |

No unexpected hosted state or security drift found. One namespace-inventory GET initially used an unsupported API path (404); the documented Workers path was used for readback, with no mutation. Repository-wide whitespace checking also reports pre-existing generated vendor trailing whitespace; scoped documentation checks pass, and vendor output was not changed to conceal it. Read-only inspection is not an exhaustive platform audit. Existing password-protection warning, intentional private-table policy INFO findings, prior HS256 trust and platform log-retention limitations remain documented in the acceptance report.

## Exact proposed release

| Artifact | SHA-256 |
| --- | --- |
| [Forward SQL](../database/staging/c1b-reconnect-binding.proposed.sql) | `1e2382dbbddbe69691f01caac8e86b1c61530aa0595f8f120a9e5332c072fb8c` |
| [Recovery SQL](../database/staging/c1b-reconnect-binding.rollback.proposed.sql) | `6da8bcd152efe88683074718e39762d9999dddea3db3fecb5fa1e67b3c775288` |
| Candidate .sites-runtime/independent/colocated-worker.js | `0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e` |
| Unchanged .sites-runtime/c1b-release/wrangler.json | `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5` |
| Ignored release-manifest.json | `1210ecd066725c99cce8b4c87114e664cd802fcb828c2cf5f41a716e09b46b17` |

Earlier SQL hashes f3e090…/b9df7… and earlier manifests are superseded. Candidate bundle is53,689bytes. Actual hosted bundle remains bbf827…; preparation did not deploy it. Configuration contains an existing publishable key and must remain ignored/protected, never pasted into a report. No new variable, secret, client, permission, migration, namespace or paid resource is required.

## Single requested execution approval

Approval is requested for the following ordered staging-only scope, with automatic continuation only after each verification passes:

1. Rehash all reviewed artifacts; repeat project/account/version/config, restricted UUID/fixture/grant, Auth/write, ACL/body/security and native-client preflight. Stop on drift, ambiguous result or cost prompt; do not repair permissions.
2. Execute the unchanged forward SQL exactly once in a dedicated session, with its existing transaction/timeouts and verified same-session mfd.c1b.target_ref context. The context assertion does not prove project identity; independent connection preflight does. Preserve all ACLs and data. Independently verify new dispatcher body and unchanged wrapper/hook/ACL/security/data. On failure inspect commit outcome read-only, no blind retry.
3. Only after SQL PASS, upload the exact candidate bundle using unchanged protected runtime config, account/Worker/binding/state/migration history and Free condition. SQL-first is compatible with the old Worker, which simply does not use the added operation. Candidate-before-SQL fails reconnect closed and is not the planned order.
4. Read back active version, downloaded module hash, bindings/config/routes. At most six initial non-authenticating HTTP checks: login/header policy, callback missing transaction diagnostic, hostile-origin denial, invalid-CSRF denial, missing-bearer MCP denial and discovery. Allow at most two propagation follow-ups. Never send personal cookies/codes/tokens in probes.
5. For the specific reconnect regression, one supported PRIMARY existing-consent reconnect, only if ChatGPT offers it without deleting the integration or expanding consent; preserve the same client/callback/primary identity/Profile-only grant. Interactive owner action is required only then. If no supported control or unexpected consent/identity occurs, stop; do not revoke/delete/recreate. One profile read per existing connected account verifies unchanged A/B/revision1 after the code/SQL change; no repeated Google-linking test. Total intentional Worker verification ceiling20 requests excluding opaque client-managed OAuth/tool subrequests; no loops/load test. Pace within shared limits; stop on unexpected429 rather than resetting counters.
6. Read-only CPU/error/namespace metrics for the new version/window after bounded representative traffic. Report sample count and p50/p99 in correct units, excluded old-version traffic and any exceededCpu. Sparse samples cannot clear reliable headroom; leave gate pending instead of creating load. Repeat unchanged users/grants/fixtures/security/write checks and issue one consolidated actual-results report.

Future upload command, from hosting using the reviewed Node22 toolchain, **not executed**:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js deploy --config ../.sites-runtime/c1b-release/wrangler.json --no-bundle --no-autoconfig
```

Emergency stop: stop rollout/interactive flows on any unexpected user/permission/data/claim/cost result. Use only previously approved non-destructive route-disable containment if required; retain namespace/counters/data. Failed postchecks do not authorize automatic recovery SQL or repeated deployment. The recovery artifact requires separate explicit execution approval; normally restore the prior compatible Worker before removing the new SQL branch, then verify exact old body/ACL/data. An uncertain commit must be inspected before any recovery. Never delete users/clients/grants, reset state, reverse the audience or weaken authorization as recovery.

## Remaining acceptance boundaries

No additional Google-linking or profile-isolation interaction is needed before approval. Live first-party/OAuth direct REST/RPC/storage ownership negatives need a supported transient-credential browser harness; hosted refresh/reuse/revoke/logout need isolated sessions and authority that cannot disturb current grants; unknown-identity/provider negatives require separately approved identity/contingency. Current constraints prohibit forcing these cases with exported tokens, new clients/users/test endpoints, revoking working grants or bypass SQL. Local models pass; these hosted gates remain BLOCKED, not completed.

**Recommendation: GO for the single coordinated scope above; NO-GO for declaring Phase C.1B fully accepted, production-ready, broader users/data or writes.** Local engineering and supported automated verification are complete. Hosted reconnect acceptance and CPU measurement await approval/deployment; protected hosted lifecycle gaps remain explicit. No hosted SQL mutation, deployment, Auth/user/client/grant change, production access, paid upgrade, deletion, commit or push occurred in this preparation.

## Approved coordinated rollout — actual execution result

2026-10-29, completed after final security read at18:46:35UTC (19:46 Europe/Berlin). **Ordered SQL and Worker rollout PASS. Both existing profile connections PASS after deployment. Existing-consent reconnect remains BLOCKED by unavailable supported UI control; sustained CPU headroom and other protected hosted lifecycle gates remain unaccepted.** This actual-results section supersedes the proposal's pending-execution wording above. User explicitly approved this exact ordered scope and hashes; recovery execution remained excluded.

| Ordered action / verification | Actual result |
| --- | --- |
| Fresh target/artifact preflight | PASS exact staging project/database, previous expected Worker version, approved forward/bundle/config/recovery hashes, restricted UUID baseline, native client/callback, two Profile-only grants/fixtures and old dispatcher/wrapper/hook/ACLs |
| Forward SQL | PASS submitted exactly once during18:39UTC; independent committed-state read at18:39:37.286572Z confirms new body7d93d522e07936bca67faa53903d4868. Exact server COMMIT timestamp was not returned; no false precision is claimed |
| SQL security postcheck | PASS ownerpostgres, DEFINER, emptysearch_path, dispatcher two-entry ACL and wrapper three-entry ACL unchanged; hook unchanged; normalized broader security fingerprint matches before-state |
| Worker upload | PASS single approved deployment; no rebuild/source substitution/config edit, permission change, new resource or upgrade/payment prompt |
| Active version | PASS dcfcac5d-88d2-4432-a262-e288f05f31e4 at100% |
| Deployment | 169ccbd8-efa1-4e7c-a5d2-b627a58b4cb8, created2026-10-29T18:40:28.033332Z (19:40:28 Europe/Berlin) |
| Downloaded code | PASS extracted multipart module53,689bytes; SHA2560fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e exactly approved |
| Runtime configuration/bindings | PASS all sorted public runtime-variable values match local configuration by digest66a5acf87eaa074d2629119b9ab339d9b6d47f2d21b72985178dae0809fdae6c; local full config hash remains e0f45c65…; sole non-variable binding remains original MFD_ABUSE/AbuseCoordinator namespace781eaeca44c74543be214f485033adda |
| Resource/routing preservation | PASS namespace count remains1; workers.devON, previewsOFF; same canonical origin, compatibility date2026-10-12 and writesfalse. No secret binding added or read |
| Bounded Worker probes | PASS exactly6 intentional non-authenticating requests, no propagation follow-ups: login200/strict-origin/provider CSP/no-store; callback400/CB_TRANSACTION_REQUIRED/no-referrer/flow-cookie clearing; hostile-origin403; invalid-CSRF400; missing-bearer MCP401; resource discovery200/exact resource and issuer |
| Existing-consent reconnect | BLOCKED / NOT TESTED: operator reports no supported Reconnect control. No disconnect/delete/revoke/new authorization was attempted to force it |
| Primary profile regression | PASS operator-observed existing ChatGPT get_profile returns MFD STAGING A, revision1 |
| Secondary profile regression | PASS operator-observed existing ChatGPT get_profile returns MFD STAGING B, revision1 |
| Final account/data checks | PASS at18:45:18.957096Z users2/original restricted UUID-set, confirmed/non-anonymous2, identities4, sessions10 unchanged; native/local client1/1, exactly2 Profile-only grants/active consents; exact original owner-bound A/B fixtures/revision1; proposals0; database writesfalse and exact Worker audience |
| Signup/provider/write controls | PASS final public settings HTTP200 signupdisabled/Googleenabled/anonymousdisabled; Worker writesfalse. DCR OFF/path/Site URL/hook binding retain saved operator evidence, unchanged by this scope; no independent secret-bearing management dump claimed |
| Final security advisor | Same3 intentional private-table RLS-without-policy INFO findings and existing leaked-password-protection WARN; no new advisor finding. No automatic remediation |
| Recovery | NOT REQUIRED / NOT EXECUTED; no rollback, retry, deletion, grant repair or state reset |

Security fingerprint interpretation: raw post-change digest isec1f27ff9b3d5f2f35c01e8b99c85d51, expected to differ because the approved function definition changed. A read-only comparison substitutes only the reviewed old dispatcher source into pg_get_functiondef for hashing; it reproduces original61546963f7d66d8637dccbd22b0cd61b. All other table/owner/ACL/RLS/policy/function/schema/storage entries remain unchanged. This is a scoped catalog comparison, not a full platform audit or direct authenticated cross-owner API test. No hosted function was reverted for this comparison.

### Actual hosted CPU and error evidence

GraphQL introspection confirms CPU quantiles are microseconds. Final retrieved aggregates filter exact new versiondcfcac5d-88d2-4432-a262-e288f05f31e4 and window starting18:40:28UTC, excluding the previous version:

- Worker16 success invocations, errors0, subrequests27; CPU p50=2612µs (**2.612ms**), p99=6574µs (**6.574ms**). No exceededCpu or other invocation-error status appeared in the returned groups.
- Same namespace/new-version window:15 successful DO invocations, errors0.
- The first version-filtered read returned no rows before analytics populated; subsequent window read and exact-version read agree. This was read-only ingestion latency, not a replay/deployment retry.

**Observed-sample CPU PASS against10ms; reliable sustained Free-plan headroom NOT ESTABLISHED.** Only16 mixed invocations are available; route mix, cold starts, traffic and windows differ from the historical120-request/p99=15.139ms sample. Do not describe this as a controlled hosted speedup, statistically stable percentile or proof that all requests remain below10ms. No load or extra traffic was generated to increase the sample. Metrics count includes opaque client/operator traffic, not just the six agent probes; no complete per-request attribution is claimed. HTTP authorization denials are distinct from invocation-error counters.

### Preserved constraints, remaining gaps and disposition

No production access, Auth setting/user/identity/client/grant mutation by the agent, public signup/DCR/write enablement, additional account, namespace reset, paid upgrade/subscription, destructive recovery, commit or push. The two working connections and their Profile-only grants remain intact. No personal bearer, refresh token, password, cookie or authorization code was inspected/exported. Publishable configuration was used internally only; deployment evidence is ignored/protected locally. Expected incremental subscription cost remains$0 under the existing Free condition; exact bill/usage headroom remains unavailable and is not guaranteed.

One initial read-only client assertion used an array comparison for a native text column and failed with a type error; the assertion was corrected to the actual text representation and passed before the single forward execution. No failed migration, hosted state drift or security guard bypass occurred. Advisor warnings and the existing development-only moderate dependency advisory remain the previously documented limitations.

Remaining acceptance gates: real existing-consent reconnect through a supported client control/harness; representative hosted CPU headroom; genuine-token/direct REST/RPC/storage cross-owner negatives; isolated refresh/reuse/revoke/logout/provider-negative cases and operational fault-injection/log-retention/billing evidence. Existing local tests support these paths but do not substitute for blocked hosted acceptance. No broad grant, new user/client, exported-token workaround or revocation of the preserved connections is authorized to force completion.

**Final recommendation: GO to retain the updated controlled two-account, Profile-only staging integration. NO-GO for full Phase C.1B acceptance, production, broader access or MCP writes.** No additional routine approval or login is needed for completed checks. Reconnect requires an available supported control or a separately reviewed safe acceptance harness; there is no reason to delete/recreate the working app. Continue passive CPU observation during ordinary authorized use rather than creating test load. No further mutation is pending under this completed rollout.

Evidence: ignored coordinated-deploy.log and coordinated-probes.json under .sites-runtime/c1b-local-blockers/; downloaded-module hash, independent SQL/catalog reads, metrics aggregates above and operator-reported A/B results. Exact forward/config/bundle/recovery SHA256 values remain those in the release table; recovery remains separately unauthorized.
