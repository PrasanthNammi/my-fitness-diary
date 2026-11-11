# Phase C.1B — Audience execution and local recovery preparation

Date: 2026-10-29 (Europe/Berlin).

**CURRENT STATUS: Forward audience transaction COMMITTED and independently verified.** Executed once on staging at 12:11:32–12:11:36 UTC (13:11:32–13:11:36 Europe/Berlin). All required immediate postchecks PASS. No reverse transaction or further rollout action occurred. Earlier stopped/preparation sections below are historical; see the final execution record.

**Historical execution attempt — NOT EXECUTED. Required precondition7 failed: a reviewed post-COMMIT reverse SQL artifact is not available/tested.** The user explicitly required stopping immediately if any precondition failed. This local artifact check found the blocker before hosted preflight/execution. No hosted query or mutation occurred in this attempt. No new migration/reverse SQL was generated, no user/client/configuration changed, no rollback performed and no production access, deployment, commit or push occurred.

## Artifact and scope

Approved forward artifact: database/staging/c1b-audience-transition.proposed.sql.

Fresh SHA-256: `1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590`.

It matches the user's explicit approval and both current execution documents. Original forward artifact unchanged. Inspection confirms the only proposed persistent changes are mfd_mcp.settings.resource_uri and its column default, plus transactional schema-cache NOTIFY; transaction-local settings/locks/assertions preserve safety boundaries. No user/client/grant/RLS/ACL mutation is included.

Expected forward change, not performed:

- From https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp
- To https://mfd-connect-staging.shanustylish777.workers.dev/mcp
- Only target gngnrmzeghjzqsmzuktl; writes must remainfalse.

## Required preflight results

| User requirement | Result | Evidence |
| --- | --- | --- |
|1 Exact fresh staging project | UNKNOWN this attempt | Not queried after local blocker; historical verification is not relabeled fresh |
|2 Both approved users exist | UNKNOWN this attempt | Not queried; prior report verified two |
|3 UUIDs match restricted baseline | UNKNOWN this attempt | No fresh hosted comparison after stop |
|4 Signup/Google/OAuth/write switches and zero client/grant inventory | UNKNOWN this attempt | No fresh hosted reads; prior state is historical only |
|5 Active audience matches expected OLD value | UNKNOWN this attempt | No fresh read; last verified state was old private Site resource |
|6 Approved SQL checksum | PASS | Fresh hash exactly matches approval/reviewed artifact |
|7 Rollback SQL available/tested against before-state | FAIL | Only forward proposal and forward test exist in scoped database/supabase/tests inventory; documentation explicitly says reverse CAS requires separate preparation/review |
|8 SQL affects only approved audience configuration | PASS — source review | Forward SQL preserves user, policy, privilege, client, grant and write-switch state |

## Why existing rollback evidence does not satisfy requirement7

Tests/c1b-audience-transition.cjs injects a late failure in a local copy of the forward transaction and verifies ROLLBACK undoes its UPDATE/DDL. It also tests forward idempotency/guards and preservation of two synthetic Auth users. This establishes pre-COMMIT atomic rollback, not a tested new transaction restoring the old resource/default after COMMIT.

PHASE-C1B-FINAL-EXECUTION-CHECKLIST.md explicitly states not to imply reverse SQL is prepared/approved. The latest configuration review likewise requires preparing a separately reviewed reverse CAS if needed. No existing reverse artifact/checksum/test evidence can be cited honestly. The generic recovery plan and backups are not substitutes for the user's new explicit gate.

## Execution and post-verification

Transaction start/commit timestamp: not applicable; no transaction submitted. Transaction result: not attempted. Before/after current hosted audience: not freshly inspected in this stopped attempt; no hosted write was issued, so no agent-applied change exists. Every requested post-migration check is UNKNOWN/not applicable because execution did not occur. No discrepancy in hosted state was demonstrated; the demonstrated failure is the missing local recovery artifact.

## Next step and authorization boundary

Prepare and locally test a separate reverse CAS proposal against the exact forward/before-state contract, without changing the approved forward artifact. Tests should verify row/default restoration, false writes, preservation of both synthetic users and unrelated state, drift/client/session inventory stop conditions, repeat behavior and late-failure atomicity. Restoring an old audience can reaccept tokens; approval/revalidation must address that risk. No such artifact was created in this stopped attempt.

Then review the recovery artifact/evidence and reconfirm execution scope before rerunning all fresh hosted preflight gates. Preparation/review of a rollback never authorizes its hosted execution; the current approval explicitly forbids an automatic second hosted transaction/recovery action. Preserve that boundary. No Auth configuration/OAuth activation/client/deployment stage is cleared.

**Recommendation: NO-GO for audience execution until precondition7 is resolved. Next OAuth configuration stage is not ready for execution approval based on this attempt. Stop here.**


## Post-COMMIT reverse proposal — local preparation, 2026-10-29

**Recovery artifact is now available and locally tested. GO to rerun read-only audience-transition preflight; hosted execution is not cleared by this local task.** The historical stop above remains accurate. Neither forward nor reverse transaction was submitted to a hosted database. No hosted tools, Auth/configuration changes, user changes, deployments or Git operations were performed during this preparation.

| Artifact | SHA-256 |
| --- | --- |
| [Forward proposal](../database/staging/c1b-audience-transition.proposed.sql), unchanged | `1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590` |
| [Reverse proposal](../database/staging/c1b-audience-rollback.proposed.sql), new | `59e62b0e35e943a22e9783d139f92d538e9be2216f8b0cd52b43edc7baf76ded` |

The reverse changes only the single settings row's resource_uri and its column default, from the exact Worker `/mcp` URL back to the exact private Site `/mcp` URL listed above, followed by transactional PostgREST schema-cache notification. It does not update users, identities, sessions, grants, policies, ACLs, ownership, function bodies or write switches.

### Exact reverse preconditions

- Independently confirm staging project `gngnrmzeghjzqsmzuktl`, correct secure connection, current security/catalog/data baseline, disabled signup, enabled Google, disabled OAuth Server and both false MCP write switches. No assertion supplied by a caller proves the actual project or hosted settings.
- Use role `postgres` and independently verified exact exposed schemas `public,graphql_public`. In the same session supply `mfd.c1b.target_ref`, `mfd.c1b.exposed_schemas`, `mfd.c1b.worker_writes='false'`, `mfd.c1b.oauth_server_disabled='true'`, and `mfd.c1b.approved_user_ids` as a JSON array of the two approved UUIDs loaded privately from restricted evidence. Do not put real UUID mappings, emails or credentials in this report, SQL source or logs.
- Require exactly two confirmed, non-anonymous users matching those UUIDs, exactly one email identity each and no other identities. This intentionally supports only the reviewed **pre-Google-login** baseline. It refuses after identity linking or other baseline drift; a later lifecycle recovery requires a different separately reviewed plan.
- Require zero sessions, including stale session rows; zero native OAuth clients, authorizations and consents; zero local MCP clients, grants and proposals. Existing clients are a stop condition, not objects to delete automatically.
- Require exactly one settings row, id=true, writes_enabled=false, exact current Worker audience and exact Worker text column default. Old/already-restored state, missing default, unexpected row or any mismatch aborts.
- Read and lock authority must already exist. The script checks SELECT plus authority sufficient for its table locks, then locks settings exclusively and Auth/local inventory tables in SHARE mode. PostgreSQL requires more than SELECT for SHARE locks; see [PostgreSQL 17 LOCK](https://www.postgresql.org/docs/17/sql-lock.html). Actual managed staging-role authority has **not** been verified in this local-only task. Check it read-only before execution; missing authority means STOP, with no grants or role escalation.

The explicit READ COMMITTED transaction, shared advisory lock, table locks and compare-and-swap checks prevent concurrent ordinary writers from changing the checked inventory/settings between validation and commit. Five-second lock and 60-second statement timeouts fail closed. Locks may briefly block Auth writers; use a bounded approved recovery window. These controls do not atomically freeze Cloudflare or Auth service configuration, so external containment and rechecks remain necessary.

Repeated reverse execution is deliberately **an error**: once the old audience is restored, the expected-current comparison fails and leaves state unchanged. No silent no-op, forced overwrite or automatic retry is provided.

### Local verification

Added `tests/c1b-audience-rollback.cjs`, using disposable PGlite databases and two synthetic users. No real UUIDs, credentials or upstream services are used. Tests establish:

- Approved forward commits the new row/default; reverse restores the exact old snapshot.
- Both synthetic users/identities, unrelated diary data, RLS policies, owners, ACLs and function privileges/body remain unchanged; false database/runtime assertions remain false.
- Wrong environment/runtime assertions, malformed/duplicate/wrong UUID inventory, row/default/write-switch/provider drift and every nonempty native/local client/grant/authorization/consent/session inventory cause rejection without changes.
- Reverse before forward and repeated reverse both refuse safely; another complete forward/reverse cycle restores the same snapshot.
- An injected error after reverse UPDATE/DDL but before commit rolls back both row and default atomically.

Full local runner: **39/39 PASS**. Frontend and Worker TypeScript, hosting lint, independent build, staging production-mode build and artifact scans PASS. Scans covered public (37), hosting/dist (169) and selected staging output (167 files); old root dist was not served/rebuilt. Root audit: zero findings. Hosting audit: one unchanged development-only moderate `GHSA-67mh-4wv8-2f99`, zero high/critical; not suppressed. No dependency or lockfile changes in this task. Local evidence is ignored under `.sites-runtime/c1b-rollback/`.

PGlite tests validate PostgreSQL transaction semantics in synthetic fixtures; they are not a rehearsal of hosted managed-role permissions or concurrent managed Auth operations. Worker code did not change, so no new native Worker or real OAuth/browser acceptance is claimed. No hosted catalog/data comparison was performed here. Hosted preflight/postchecks remain mandatory.

### Recovery procedure and residual risk

1. Stop rollout and user/client flows; keep writes false. Do not automatically execute this reverse following a forward failure or postcheck discrepancy.
2. Obtain **separate explicit hosted rollback approval** identifying this exact reverse checksum and its narrow pre-OAuth scope. The earlier forward approval excludes an automatic second hosted transaction.
3. Reverify the independent project/configuration/UUID/security/inventory/lock-authority preconditions above, retain restricted before-state evidence, and compare both artifact hashes. Stop on any drift, ambiguous outcome or unexpected tokens/clients/sessions.
4. Only under that approval, execute the entire unchanged reverse once in a dedicated session. On pre-COMMIT failure, ROLLBACK/close the failed transaction and inspect state before any retry. On uncertain commit outcome, inspect first; do not replay.
5. Independently verify restored row **and default**, both users/identities, unchanged counts/data/catalog/RLS/ACL/storage, disabled signup/OAuth, enabled Google and false write switches. A failed postcheck requires separate recovery review, not an automatic second mutation. Do not restore backups, delete users/clients or alter keys.

Restoring an audience is not token revocation and can reaccept still-valid old-audience tokens. Empty current session/client/consent inventories limit this particular recovery scope but do not prove that no historical/offline token exists. Preserve live session/client/consent checks; inventory token/grant history before approving recovery. The old Site remains private and unpublished, and this SQL neither publishes it nor changes its configuration. Do not broaden accepted audiences to bridge the transition.

**Decision: GO for a fresh read-only forward preflight and review of the new recovery artifact. NO-GO for treating this preparation as hosted forward/reverse execution authorization.** The missing-artifact blocker is resolved locally; actual managed lock authority, fresh staging evidence and applicable execution approval remain gates. OAuth activation, clients, Auth redirects/hooks, Google login and Cloudflare deployment remain separate later scopes.


## Final read-only hosted audience preflight — 2026-10-29

Read-only verification completed at 2026-10-29T12:05:49.893624+00:00. No forward/reverse SQL, locks, DDL, mutations, login or Auth/configuration/deployment operations were executed. SQL consisted of explicit READ ONLY transactions with SELECTs against this staging project only. A first multi-statement response exposed only its final result, so the inventory was re-read as one JSON SELECT; no mutation or failed migration occurred.

| Requirement | Result | Fresh evidence |
| --- | --- | --- |
| Exact project/database | PASS | get_project: gngnrmzeghjzqsmzuktl, MFD OAuth Phase 2 Testing, ACTIVE_HEALTHY, eu-central-1, db.gngnrmzeghjzqsmzuktl.supabase.co, PostgreSQL 17.11.0.003; SQL database postgres/current_user postgres |
| Approved two UUIDs unchanged | PASS | Sorted UUID-set digest exactly matches restricted ignored local two-user mapping; no UUID/email/provider identity data included here |
| Users | PASS | Exactly two, both email-confirmed and non-anonymous |
| Identities | PASS | Exactly two email identities, distinct approved user owners, no Google identities |
| Sessions | PASS | Zero total rows, stronger than zero active sessions |
| Native OAuth inventory | PASS | Clients, authorizations, consents all zero |
| Local MCP inventory | PASS | Clients, grants, proposals all zero |
| Signup / Google / anonymous | PASS | Public staging Auth settings HTTP200: disable_signup=true, google=true, anonymous=false; email remains enabled |
| OAuth Server | PASS | Staging authorization-server discovery HTTP404, feature_disabled |
| Database writes | PASS | One settings row id=true, writes_enabled=false |
| Application writes | PASS | Existing private Site runtime revision1, MFD_ENV=staging, MFD_MCP_WRITES=false; no claim of a deployed independent Worker |
| Current row audience | PASS | Exact old private Site /mcp URL below |
| Column default | PASS | Exact old private Site URL with ::text default |
| Forward role / SELECT / UPDATE / locks | PASS by catalog privilege inspection | postgres; SELECT and UPDATE/DELETE/TRUNCATE/MAINTAIN authority on settings/clients/grants/proposals; schema USAGE and advisory/hash function EXECUTE and plpgsql USAGE true |
| Forward ALTER DEFAULT authority | PASS by ownership inspection | mfd_mcp.settings owner=postgres and current role owner authority=true; no ALTER/LOCK was run as a probe |
| Reverse lock/read authority | PASS by catalog privilege inspection | Required Auth and local inventory tables grant current role SELECT and sufficient lock authority; Auth tables remain owned by supabase_auth_admin, not postgres; no grant or ownership change |
| Forward checksum | PASS | 1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590 |
| Reverse checksum / local test | PASS | 59e62b0e35e943a22e9783d139f92d538e9be2216f8b0cd52b43edc7baf76ded; unchanged reviewed proposal; committed forward/reverse test re-run PASS |
| Application catalog/policies/storage | PASS within reviewed scope | Fresh digest086a87995f52cf1a0b7e44fb904b7575 exactly matches approved baseline |
| ACLs / RLS / private schemas | PASS within inspected scope | All 11 application tables and four MCP tables plus sync_totals retain RLS; reviewed role grants/schema restrictions retained; private schema has postgres-only schema ACL |
| MCP functions | PASS within inspected scope | Hook/dispatcher/wrapper normalized hashes 9fde3c29dc02c1313687ce426b5d1237 / 5746d0b1b36036343df0696e0c5429a4 / c0586b393b1d82332c88f1b1123f57c5; postgres ownership, empty search_path, invoker/definer modes and restricted EXECUTE retained |
| Private storage | PASS | All three approved buckets public=false, reviewed size limits; storage.objects count zero; storage policies included in matching catalog digest |
| Scoped data | PASS | Workspaces/profiles/social/messages/blocks/friendships/reactions/catalogue/reports/photo tables all zero; sync_totals two, matching recorded baseline |
| Private schema API exclusion | PASS | Zero-row REST probes return406/PGRST106 for mfd_mcp, mfd_private, mfd_observability and auth |
| Exact exposed-schema list / automatic exposure | PASS — fresh user-observed dashboard evidence | User confirmed staging gngnrmzeghjzqsmzuktl exposes exactly public and graphql_public, automatic exposure OFF; inspection only, no save/change. This is manual evidence, not an independent management-API read. |
| Complete unrelated platform configuration diff | UNKNOWN | No secret-bearing Auth management configuration, Google credentials or full platform audit fetched; scoped evidence does not establish an exhaustive diff |

Current audience and default remain `https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp`; no transition has occurred. Proposed sole new audience remains `https://mfd-connect-staging.shanustylish777.workers.dev/mcp`.

Privilege results establish declared current authority, not a guarantee against a future lock timeout, concurrent change, event-trigger or managed-service execution failure. Recovery remains strictly pre-OAuth/email-only, requires separate hosted approval, and may reaccept old tokens. Do not delete inventory or grant privileges to make its checks pass. Current read-only checks do not reserve state; refresh time-sensitive assertions immediately before any separately approved execution.

**Decision: GO to request fresh, narrowly scoped approval for the forward audience transaction only, conditional on immediate drift revalidation.** The user’s read-only dashboard confirmation closes the last outstanding required preflight evidence gap. All required scoped preflight checks PASS; no FAIL observed. The exhaustive unrelated-platform diff remains UNKNOWN and is not claimed by this scoped review. This task authorizes no execution or automatic continuation. OAuth/configuration/client/deployment and hosted rollback approvals remain separate. No production access, secret exposure, commit or push occurred.


## Approved forward execution — COMMITTED, 2026-10-29

**Outcome: PASS — submitted exactly once, successful return without SQL error, committed state independently confirmed in a separate read-only request.** Submission/return window: **12:11:32–12:11:36 UTC**, **13:11:32–13:11:36 Europe/Berlin**. This records client-observed submission/return times, not an independently captured exact database COMMIT timestamp. Immediate post-verification completed by 12:12:41 UTC.

Target: only `gngnrmzeghjzqsmzuktl`, MFD OAuth Phase 2 Testing; project identity and `db.gngnrmzeghjzqsmzuktl.supabase.co` verified; SQL database/current role `postgres`. Production was not accessed.

Executed artifact: `database/staging/c1b-audience-transition.proposed.sql`, unchanged SHA-256 **1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590**. Reverse artifact remained available and unchanged at **59e62b0e35e943a22e9783d139f92d538e9be2216f8b0cd52b43edc7baf76ded**; it was **not executed**.

Only the two documented same-session prerequisites were set before the verbatim approved artifact: `mfd.c1b.target_ref='gngnrmzeghjzqsmzuktl'` and `mfd.c1b.exposed_schemas='public,graphql_public'`. These use the fresh project evidence and latest user-confirmed dashboard list/automatic exposure OFF. No statement was inserted into or removed from the approved transaction. Its existing BEGIN/COMMIT, advisory/table locks, assertions, timeouts and intended schema-cache NOTIFY were retained. No migration history entry, permission change, guard relaxation or retry was performed.

### Immediate preflight

All critical conditions PASS before submission: exact project/connection identity; both artifact hashes; two approved UUIDs matched restricted local evidence; both users confirmed/non-anonymous; two email identities and zero sessions; exact OLD row/default; signup disabled; Google enabled; OAuth Server disabled; both write switches false; zero native/local OAuth inventories; declared lock/update/DDL ownership and function/language/schema permissions. Actual transaction lock acquisition subsequently succeeded. Data API exposure used the latest explicit read-only dashboard confirmation, not an invented API result. No new dashboard change was requested.

### Independent immediate postchecks

| Check | Result | Evidence |
| --- | --- | --- |
| Transaction commit | PASS | No SQL error; subsequent independent query observes committed new row/default |
| Audience before → after | PASS | `https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp` → `https://mfd-connect-staging.shanustylish777.workers.dev/mcp` |
| Column default | PASS | Old URL `::text` → exact new Worker URL `::text`; old value no longer active |
| Settings identity/count/other fields | PASS | One id=true row; all other settings snapshot unchanged |
| Approved Auth users | PASS | Exactly two confirmed, non-anonymous users; UUID-set digest still matches restricted mapping; selected user metadata snapshot unchanged |
| Identity inventory | PASS | Exactly two email identities belonging to two owners, no Google identity; selected identity snapshot unchanged |
| Sessions | PASS | Zero total rows before and after |
| Public signup | PASS | Fresh post-GET HTTP200 disable_signup=true |
| Google / anonymous sign-in | PASS | google=true, anonymous=false |
| OAuth Server | PASS | Fresh post-discovery HTTP404 feature_disabled |
| Database MCP writes | PASS | writes_enabled=false |
| Application MCP writes | PASS | Existing private Site runtime revision1, staging, MFD_MCP_WRITES=false; no independent Worker deployed |
| Native OAuth clients/authorizations/consents | PASS | All zero before/after |
| Local MCP clients/grants/proposals | PASS | All zero before/after |
| RLS/ACL/ownership/schema | PASS within captured scope | Table/schema privilege and RLS snapshots match exactly across public, mfd_mcp, mfd_private, mfd_observability and storage |
| Columns/defaults | PASS within captured scope | Column definitions match with only the approved resource_uri default normalized out; that default separately verified above |
| Policies/functions | PASS within captured scope | All captured policy and application/MCP function body/mode/search_path/owner/ACL snapshots unchanged |
| Private storage | PASS | Full bucket configuration snapshot unchanged; storage object count remains zero |
| Scoped unrelated data | PASS | All 12 scoped application/storage counts remain zero; full sync_totals data and all non-resource settings snapshots unchanged |
| Exhaustive platform-wide diff | UNKNOWN, outside scoped evidence | No secret-bearing Auth configuration, provider logs or unrelated platform internals fetched; no claim of a complete platform audit |

The security snapshot comparison has **zero differences** after excluding only the separately verified approved audience default. No unexpected finding was observed in the inspected scope. Notification delivery/processing inside PostgREST is not independently observable from the tool result; its intended NOTIFY was included in the committed transaction. Future REST/runtime acceptance remains separately scoped. No new application/security code changed, so no regression rerun is claimed for execution documentation.

Restricted, Git-ignored selected verification evidence: `.sites-runtime/c1b-audience-committed/verification.json`, directory0700/file0600. Reports/evidence omit personal emails, passwords, tokens, provider identity_data and raw private UUID mappings. The existing restricted UUID mapping was compared through a sorted digest.

### Stop and next approval gate

**Rollback required: NO. Rollback performed: NO.** No automatic reverse is authorized. A later discrepancy requires a separate recovery approval of the reviewed reverse checksum after its strict pre-OAuth baseline checks, including token-reacceptance risk review. Preserve users, policies, keys and false writes; never restore backups automatically.

**GO to prepare/review the next narrowly scoped Auth URL/hook configuration approval; NO authority to execute it in this task.** Review exact Site URL/general redirects and existing hook binding from captured before-values, with Google/signup/signing preserved. OAuth Server activation/path/DCR verification, native registration, local allowlisting, Worker/SQLite deployment and login/ChatGPT acceptance remain separately scoped approvals. This audience transition deployed no endpoint and proved no real OAuth-client compatibility. Both writes remain false. Stop after this report; no users/clients, Auth settings, hooks, redirects, Cloudflare resources, production, commits or pushes were changed.
