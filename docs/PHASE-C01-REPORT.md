# Phase C.0.1 — Staging database remediation preparation

Date: 2026-10-27 (Europe/Berlin). Revised after default-privilege review. Branch: `staging/mfd-oauth-testing`.

**Prepared and locally tested only. No hosted SQL, hosted configuration, users, OAuth, commits, pushes or deployment were executed. Stop for explicit approval before any hosted operation.**

## Deliverables and result

- Proposed migration: `supabase/migrations/20261027173539_staging_mfd_c01_remediation.sql`.
- SHA-256 of reviewed SQL: `db296a6263e4596cc64f2a0f678000d4ef25ee0892d818c8782e60b671953da5`.
- Read-only metadata/recovery snapshot query: `database/staging/c01-preflight.sql`.
- Disposable PostgreSQL test: `tests/staging-remediation.cjs`; native runner: `database/staging/c01-native-rehearsal.cjs`.
- Local result: **32/32 test files pass**, including the new migration suite and the existing MCP/database/security/regression suites. All three application SQL policy suites also pass against the remediated schema.

The proposal targets only staging project `gngnrmzeghjzqsmzuktl`, starting from the C.0 minimal workspace/MCP installation. It adds two schemas, eleven tables, eight functions, five triggers, three private buckets, seventeen named indexes plus fourteen constraint indexes, and forty-nine policies. Existing workspace/MCP objects are prerequisites, not reinstalled. Existing workspace payloads, revisions, timestamps, settings values and user rows are preserved in local tests.

**Ready for conditional approval of the revised application-scoped migration, not authorized for hosted execution.** All 32 local test files pass again. The entire migration suite also passes on native **PostgreSQL 17.11**, including the unchanged catalog fingerprint, under a non-superuser `postgres` role without `supabase_admin` membership. Hosted schema/ownership/storage grants and the exact Data API exposed-schema list still require read-only confirmation. Approval must explicitly accept the future-function discipline described below: global and provider defaults remain unchanged.

## Sources reviewed

Read docs/PHASE-C0-PREFLIGHT.md, docs/STAGING.md and all database schema/application policy files: schema.sql, mcp.sql, social.sql, shared-catalogue.sql, social-photos.sql, catalogue-photos.sql, private-photo-metadata.sql, private-exercises.sql and sync-observability.sql, plus the three database/tests SQL suites and current local database harnesses.

The migration contains explicit reviewed definitions. It does not include/install/run the original scripts dynamically. Sources were adapted as follows:

- Retain final creator-private exercise catalogue read policy from private-exercises.sql, rather than first installing the earlier shared-exercise policy.
- Use the latest sanitized workout projection including tracking/catalogue fields. Fold profiles.created_at into the new table definition.
- Omit the workspace self-update/backfill entirely. Existing historical workouts are not projected by running the migration.
- Omit pg_cron extension creation and the recurring message deletion job. Expiry continues to restrict message visibility; physical retention/cleanup requires separate approval.
- Preserve the current v2 CAS return contract. The metrics helper additionally rejects OAuth-client JWTs, so OAuth cannot mutate metrics through that helper and v2 OAuth attempts roll back.
- Correct only the MCP resource **column default**, never overwrite/reinsert the already-valid settings row or enable either write switch.

## Exact change inventory

Counts describe creation against the C.0 baseline. Repeated execution creates nothing when the schema matches; conflicts abort rather than replacing user-defined objects.

### Schemas and tables

New schemas: `mfd_private`, `mfd_observability`. The public and MCP schemas must already exist.

| Missing table | Purpose / ownership and access |
| --- | --- |
| public.mfd_profiles | Social identity; owner-only column writes, existing authenticated social-profile read behavior; private fitness profile remains in workspace. |
| public.mfd_friendships | Sender-created requests, recipient-only acceptance, participant removal and block checks. |
| public.mfd_blocks | Owner-created/deleted block records; involved-account visibility. |
| public.mfd_social_workouts | Sanitized derived snapshots; owner/friend reads; clients cannot write projections directly. |
| public.mfd_messages | Accepted-friend messaging, participant read constraints, bounded first-read expiry. |
| public.mfd_reactions | Owner-bound reaction records tied to visible workouts. |
| public.mfd_catalogue | Shared foods; custom exercises visible only to their creator; creator-only restricted column updates. |
| public.mfd_catalogue_reports | Reporter insertion/read, creator-only response/status review; immutable submitted content. |
| public.mfd_workout_photos | Owner-bound paths and workout FK; owner writes, authorized friend reads. |
| public.mfd_catalogue_photos | Creator-owned private catalogue photo metadata with owner-prefixed path validation. |
| mfd_observability.sync_totals | Two fixed aggregate counters; no browser table access; service-role SELECT. |

RLS is enabled on every new table. Column grants preserve immutable ownership/content boundaries. OAuth clients are excluded from every new public table regardless of social/shared permissive policies. The private metrics table is protected by schema/table privileges and RLS; no direct authenticated policy is added.

### Functions

| Function | Mode, privilege and ownership boundary |
| --- | --- |
| public.mfd_are_friends(uuid,uuid) | INVOKER, authenticated only; caller must be one of the accounts, with accepted friendship and no block. |
| mfd_private.friend_accepted() | INVOKER trigger; no direct public/anon/authenticated EXECUTE. Sets acceptance time for the RLS-authorized recipient update. |
| mfd_private.project_workouts() | DEFINER owned by postgres, empty search_path, no direct client EXECUTE. Runs only via the fixed workspace trigger; RLS authorizes the workspace owner, NEW.user_id scopes derived rows and an explicit allowlist sanitizes payloads. Trusted administrative writes retain the reference behavior. |
| mfd_private.message_read() | INVOKER trigger; no direct client EXECUTE. First read bounds expiry; later reads cannot extend it. |
| public.mfd_catalogue_validate() | INVOKER trigger; no direct client EXECUTE. Validates numeric food/exercise fields and updates timestamps. |
| mfd_observability.record_sync(text,double precision) | DEFINER owned by postgres, empty search_path; authenticated execute only. Requires auth.uid(), rejects client_id claims, bounds fixed outcomes/elapsed values and updates aggregates only. No workspace read or arbitrary SQL. |
| public.forma_save_workspace_v2(jsonb,bigint) | INVOKER, authenticated execute only, empty search_path; derives auth.uid(), validates object/size/revision, performs atomic CAS under workspace RLS, reports conflict as a result and records metrics. OAuth attempts fail through RLS/helper checks. |
| public.mfd_prometheus_metrics() | INVOKER, service_role execute only, empty search_path; outputs fixed aggregate metrics. No public/browser EXECUTE or privileged key introduced. |

All functions are created only if absent. An existing function with different body, security mode or search_path aborts; the final catalog check also validates owner, argument/result type and effective client execution rights. The existing MCP dispatcher/hook bodies are checked against C.0 hashes and not replaced. Unexpected client-callable public SECURITY DEFINER functions abort preflight.

A trigger function is not a client RPC: trigger execution uses its bound table's authorization, and clients have neither direct EXECUTE nor the TRIGGER/CREATE rights needed to attach these functions elsewhere. The projection's definer privilege is required to write derived snapshots while browser clients have read-only grants on those rows. No definer function accepts an owner ID as an authorization substitute.

### Named indexes and triggers

Seventeen explicit indexes are created if missing (definitions validated after creation):

- `mfd_friend_pair`
- `mfd_friend_recipient`
- `mfd_friend_sender`
- `mfd_block_target`
- `mfd_social_started`
- `mfd_message_recipient`
- `mfd_message_sender`
- `mfd_message_expiry`
- `mfd_reaction_workout`
- `mfd_catalogue_barcode`
- `mfd_catalogue_creator`
- `mfd_catalogue_kind`
- `mfd_reports_item`
- `mfd_reports_reporter`
- `mfd_reports_open`
- `mfd_photo_item`
- `mfd_photo_owner`

Fourteen additional indexes come from the eleven new primary keys and three unique constraints. The resulting scoped catalog has 32 indexes including the pre-existing workspace primary key, and 54 constraints including the five existing workspace constraints. No existing data/index is dropped or rewritten.

Five triggers:

- `public.mfd_friendships.mfd_friend_accepted`
- `public.forma_workspaces.mfd_project_workouts`
- `public.mfd_messages.mfd_message_read`
- `public.mfd_catalogue.mfd_catalogue_validate`
- `public.mfd_catalogue_reports.mfd_report_updated`

### Storage buckets

| Bucket | Access | Size limit | Allowed MIME types |
| --- | --- | --- | --- |
| mfd-avatars | Private | 1 MiB | image/jpeg |
| mfd-workout-photos | Private | 2 MiB | image/jpeg |
| catalogue-photos | Private | 2 MiB | image/jpeg, image/png, image/webp |

Bucket insertion uses ON CONFLICT DO NOTHING. Existing bucket configuration is validated, never overwritten. A public bucket or mismatched size/MIME setting aborts the transaction. No object is uploaded, changed, moved or deleted.

### Policies

Thirty-nine normal application/storage policies are retained from the reviewed final definitions:

- `public.mfd_profiles.profiles_read`
- `public.mfd_profiles.profiles_create`
- `public.mfd_profiles.profiles_update`
- `public.mfd_blocks.blocks_read`
- `public.mfd_blocks.blocks_create`
- `public.mfd_blocks.blocks_remove`
- `public.mfd_friendships.friends_read`
- `public.mfd_friendships.friends_request`
- `public.mfd_friendships.friends_accept`
- `public.mfd_friendships.friends_remove`
- `public.mfd_social_workouts.social_workout_read`
- `public.mfd_messages.messages_read`
- `public.mfd_messages.messages_send`
- `public.mfd_messages.messages_mark_read`
- `public.mfd_reactions.reactions_read`
- `public.mfd_reactions.reactions_create`
- `public.mfd_reactions.reactions_remove`
- `public.mfd_catalogue.catalogue_read`
- `public.mfd_catalogue.catalogue_create`
- `public.mfd_catalogue.catalogue_edit`
- `public.mfd_catalogue_reports.reports_read`
- `public.mfd_catalogue_reports.reports_create`
- `public.mfd_catalogue_reports.reports_review`
- `public.mfd_workout_photos.workout_photo_read`
- `public.mfd_workout_photos.workout_photo_create`
- `public.mfd_workout_photos.workout_photo_update`
- `public.mfd_workout_photos.workout_photo_delete`
- `storage.objects.avatar_read`
- `storage.objects.avatar_insert`
- `storage.objects.avatar_remove`
- `storage.objects.social_photo_read`
- `storage.objects.social_photo_insert`
- `storage.objects.social_photo_remove`
- `storage.objects.catalogue_photo_read`
- `storage.objects.catalogue_photo_upload`
- `storage.objects.catalogue_photo_remove`
- `public.mfd_catalogue_photos.photo_metadata_read`
- `public.mfd_catalogue_photos.photo_metadata_create`
- `public.mfd_catalogue_photos.photo_metadata_delete`

Ten additional restrictive `c01_no_oauth_direct` policies cover each new public application table. Both USING and WITH CHECK require absence of the OAuth client_id claim, with auth.jwt() in an init-plan subquery. Existing `mcp_no_direct_workspace` and `storage.objects.mcp_no_direct_access` are preserved and validated, avoiding redundant restrictions. The final policy inventory has 55 entries: 49 new and six existing.

Policy names alone are not trusted. Different/extra policies, changed qualifiers/roles, disabled/changed triggers, column/type/constraint/index drift, function changes or bucket drift cause the final catalog assertion to roll back everything. No permissive private-table grants are added to silence the existing MCP advisor INFO messages.

### Privilege and default changes — revised review

The earlier proposal could not run under the normal SQL Editor role because it required changing the provider's defaults. That requirement has been removed rather than attempting elevated role membership. No hosted version of the earlier proposal was executed.

Precise revised SQL, for each schema in `public`, `mfd_private`, `mfd_observability`:

```sql
alter default privileges for role postgres in schema <schema>
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema <schema>
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema <schema>
  revoke execute on functions from public,anon,authenticated;
```

The file executes these through identifier-quoted `format()` calls. These are the **only** default-privilege mutations. Service-role defaults remain unchanged. The per-schema function statement removes explicit additive grants only; it does **not** deny effective `PUBLIC EXECUTE` on an otherwise unprotected future function.

Removed entirely:

```sql
-- REMOVED: global across all schemas, for BOTH previous creators
alter default privileges for role <creator>
  revoke execute on functions from public,anon,authenticated;
-- REMOVED: all ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin statements
-- REMOVED: requirement for membership in supabase_admin / superuser authority
```

The global table/sequence-default safety guard now examines `postgres` only. An unexpected global API grant for that application creator still aborts: a scoped revoke cannot fix it. Provider defaults are retained and inventoried, not implicitly declared safe. Explicit object-level grants/revokes remain on every MFD function; all eight function definitions, security modes, empty search paths, owners and effective client permissions remain covered by the **unchanged** catalog fingerprint. The existing MCP dispatcher/hook are still prerequisites, never replaced.

The final table revokes now include PostgreSQL 17 `MAINTAIN` in addition to `TRUNCATE,REFERENCES,TRIGGER` on workspace and all ten new public application tables. Required DML and column grants remain. Tests check all eleven tables. Private schema restrictions, RLS, restrictive OAuth policies, consent/session checks, write-disabled switches and owner checks are unchanged.

### Official documentation findings and scope decision

Reviewed current official documentation on 2026-10-27:

- [PostgreSQL 17 ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html): schema defaults add to global defaults; only the creating role's defaults apply. Consequently a schema-level revoke cannot neutralize global function execution. Global changes influence future functions in every schema, including routines created during an extension installation under that creator; they do not rewrite existing function ACLs.
- [Supabase role hierarchy](https://supabase.com/docs/guides/database/postgres/roles): Dashboard SQL runs as `postgres`; `supabase_admin` is internal. [Superuser limitations](https://supabase.com/docs/guides/database/postgres/roles-superuser) confirm hosted `postgres` is not a superuser.
- [Supabase's exact default-privilege troubleshooting guidance](https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema): `postgres` cannot modify or assume `supabase_admin`; its defaults apply to its own objects, often extension objects. Changing application defaults does not change those provider defaults. Extension placement warrants separate review; no extension is moved or installed here.
- [Supabase function security](https://supabase.com/docs/guides/database/functions#function-privileges) supports explicit function revocation and required-role grants. This proposal selects that approach rather than a database-wide change to future routine execution.
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api): object grants and RLS are distinct controls. Neither the migration's schema assertion nor its SQL grants change dashboard exposure settings.

The Supabase changelog markdown endpoint could not be rendered by the documentation fetcher; the public changelog and the specific current official guides above were consulted. No claim of exhaustive provider-release compatibility is made.

**Why narrower is safer:** provider defaults and globals retain their original behavior, avoiding interference with future provider/extension routine grants outside the application schemas. Even supported global changes to `postgres` defaults could surprise later operator-created extension/helper routines; those changes are unnecessary for protecting the concrete MFD functions in this transaction. No attempt is made to gain provider privileges, modify system catalogs, install event triggers or silently skip a failed privilege command.

**Conflict and approval choice:** the requirement to deny execution for *every arbitrary future function* cannot be met by per-schema revocation while retaining the global PUBLIC default. The proposed alternative is explicit deny/allowlisting of each MFD function in the same transaction as creation, with effective-privilege tests and catalog review before release. Current MFD function protection is preserved; automatic protection of unreviewed future functions is not promised. The test deliberately demonstrates that a new unprotected function remains executable, then demonstrates the transactional restriction pattern. A separate application-owner/schema design could provide broader future defaults with a different scope, but would be an architectural change requiring approval and is not included.

**Provider-managed settings left untouched:** all `supabase_admin` defaults; defaults for Auth/Storage/Realtime administrative roles; global defaults for every role; extension ownership/schema placement; role memberships; Data API exposed schemas and automatic-exposure dashboard setting. Broad provider grants may still appear in advisors/snapshots. They require inventory/appropriate extension placement and provider-supported remediation, not an unsupported revoke in this migration.

## Staging and API-exposure safeguards

1. One explicit transaction, 5-second lock timeout, 60-second per-statement timeout and an advisory transaction lock serialize migration attempts. Errors abort the whole transaction.
2. The session target assertion must equal gngnrmzeghjzqsmzuktl. Existing settings must contain exactly one valid staging resource row with writes=false. Existing MCP bodies/RLS/private ACLs and public schema CREATE rights are checked.
3. Data API exposed schemas must include public and exclude auth/mfd_mcp/mfd_private/mfd_observability. The actual pgrst.db_schemas setting is used if available; otherwise an independently inspected exact dashboard list must be supplied as an operator assertion.
4. These custom session assertions are **not cryptographic project identification or a query of Supabase management configuration**. Verify the selected project/connection externally before any execution. Never use a generic linked-project db push or guess the exposed list. C.0 could reject private-schema access through REST but did not obtain the full list.
5. The migration does not change exposed-schema configuration. If any private schema is exposed, it aborts for separately approved configuration remediation. Post-migration REST/API checks remain mandatory.
6. No setting enables OAuth, creates accounts/clients/consents, signs tokens, changes the valid resource row, enables writes, publishes a Site or changes frontend files.

## Local test evidence

Docker's daemon remains unavailable. A disposable native **PostgreSQL 17.11** server was instead built from the official [17.11 source archive](https://ftp.postgresql.org/pub/source/v17.11/) in `/tmp`; its SHA-256 matched the separately downloaded official checksum (`dd27f2b3c59e73ed14aa3324901242bf69a032a6347805f274e6260322d42979`). It listened only on a mode-0700 local Unix-socket directory with TCP disabled. It used synthetic Auth/Storage fixtures, no project link, hosted credentials or real data. The complete migration suite ran through an external temporary `pg@8.17.2` test driver, without changing project dependencies/lockfiles.

The native harness bootstraps fixtures with a local administrative role, then runs the migration as `postgres NOSUPERUSER BYPASSRLS`, with no membership in `supabase_admin`. It asserts provider-default mutation is denied before running the unchanged migration. The whole migration suite, including all three SQL policy suites, passes in that role. The exact catalog fingerprint from the prior proposal passes unchanged on 17.11: no comparison was relaxed to accommodate the runtime.

The normal network-blocked test runner also passes **32/32 files** under Node 22.13.1 using disposable PGlite 0.3.14/PostgreSQL 17.5 for its database tests. PostgreSQL 17.11 is the upstream release, not the complete Supabase `17.11.0.003` service image. Managed event triggers, storage ownership/grants and actual API behavior still require hosted metadata review and later approved acceptance. The local server was stopped after verification.

| Test | Result |
| --- | --- |
| Wrong target assertion | PASS: abort before application object creation |
| Private schema in exposed-list assertion | PASS: abort before application object creation |
| Writes enabled in existing MCP settings | PASS: abort without changing the row |
| Initial remediation from C.0-shaped baseline | PASS |
| Three immediate applications | PASS: no duplicate objects, no workspace changes |
| Existing payload, unknown fields, revision, updated_at | PASS: unchanged across initial application and repeats |
| Existing social SQL suite | PASS: friendship, privacy, expiry, blocking and photo authorization |
| Existing shared-catalogue SQL suite | PASS: shared food reads, owner writes, validation, report ownership |
| Existing catalogue-photo SQL suite | PASS: private metadata/storage and cross-owner denial |
| Excess TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants | PASS: effective authenticated privileges removed on all eleven public application tables |
| Future postgres tables/sequences in application schema | PASS: no client default access |
| Provider and global default ACL preservation | PASS: unchanged before/after migration |
| Future unprotected function / explicit transactional restriction | PASS: PUBLIC inheritance demonstrated; explicit revoke closes execution |
| Native PostgreSQL 17.11 SQL Editor role model | PASS: non-superuser postgres, no provider membership, full migration suite |
| v2 save and stale CAS conflict | PASS: current return contract, preserved unknown fields |
| Alice/Bob workspace read/update/delete isolation | PASS |
| Alice/Bob MCP owner derivation with forged user_id arguments | PASS: own profile/data only across all five sections |
| OAuth direct reads of all eleven public app/workspace tables | PASS: denied/empty under restrictive RLS |
| OAuth v2 save, metrics-helper write, storage upload | PASS: rejected |
| Consented MCP profile read | PASS |
| MCP write proposal with writes disabled | PASS: rejected |
| Metrics service-role RPC | PASS: fixed aggregate output accessible only as intended |
| Repeat after user activity | PASS: all public/MCP/metric table rows and settings preserved |
| Existing policy/function drift | PASS: fail without replacing the altered definition |
| Late bucket mismatch and missing index | PASS: earlier index recreation rolled back; mismatched bucket not overwritten |
| Read-only snapshot SQL | PASS: parses/executes on the synthetic baseline |
| Full local suite | **32/32 PASS**, including existing MCP, RLS and application regression tests |

No full Supabase/PostgREST/Storage/GoTrue service stack, HTTP account flow, storage upload service, scheduled cleanup or genuine multi-connection race was tested. The native role test establishes PostgreSQL permission compatibility for the reviewed synthetic baseline, not proof of every live Supabase grant. Run the expanded read-only preflight to confirm database CREATE, public schema CREATE, Auth FK REFERENCES, storage-bucket INSERT/SELECT and effective ownership authority to create policies on storage.objects. A missing capability must stop execution for provider-supported review, not be solved by a role escalation or a SECURITY DEFINER workaround.

Reproduce locally without network or hosted credentials:

```sh
node --require ./tests/no-network.cjs tests/staging-remediation.cjs
npm run test:local
```

No build/frontend/dependency files were modified in this phase, so the prior B.1 TypeScript/build/lint results were not relabeled as new C.0.1 checks.


### Reproduce native 17.11 rehearsal

Use a **fresh disposable cluster only**, initialized with bootstrap role `c01_fixture_admin` (not `postgres`), UTF8, local authentication and rejected host authentication. Use trusted local test tooling, not hosted credentials. The runner refuses a non-17.11 server, an existing postgres role or a socket directory outside the private `/tmp/mfd-c01-*` namespace. It is destructive only to its newly created synthetic fixture database and must never be adapted to a hosted URL.

```sh
# With verified PostgreSQL 17.11 binaries and an external pg driver already available:
initdb -D /tmp/mfd-c01-rehearsal-data -U c01_fixture_admin \
  --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8
mkdir -m 700 /tmp/mfd-c01-rehearsal-socket
pg_ctl -D /tmp/mfd-c01-rehearsal-data -l /tmp/mfd-c01-rehearsal.log \
  -o "-k /tmp/mfd-c01-rehearsal-socket -p 55471 -c listen_addresses=''" start
MFD_C01_LOCAL_SOCKET=/tmp/mfd-c01-rehearsal-socket \
MFD_C01_PG_DRIVER=/absolute/path/to/external/node_modules/pg \
node database/staging/c01-native-rehearsal.cjs
pg_ctl -D /tmp/mfd-c01-rehearsal-data stop -m fast
```

The native runner creates the synthetic roles and baseline, applies the same migration repeatedly and executes the exported migration suite. It does not add project dependencies. The 32-file ordinary suite remains independently runnable without that external driver.

### Files changed by this refinement

- `supabase/migrations/20261027173539_staging_mfd_c01_remediation.sql`: scoped defaults, remove managed-role authority requirement, add MAINTAIN revokes.
- `database/staging/c01-preflight.sql`: report expected SQL Editor identity and required application/storage capabilities; provider defaults are review-only.
- `tests/staging-remediation.cjs`: assert retained provider/global defaults, narrow future-object behavior, transactional function protection and all-table excess privileges; accept native fixture adapter.
- `database/staging/c01-native-rehearsal.cjs`: reproducible local-only 17.11 fixture runner.
- `docs/PHASE-C01-REPORT.md`: this revision, checksum, precise changes, evidence and updated approval boundary.

No existing Phase B/B.1/C.0 source, frontend, application dependency pins/lockfiles, hosted state, credentials or user data were changed by this refinement.

## Recovery and rollback plan

### Before future execution

- Save the output of database/staging/c01-preflight.sql to restricted local evidence storage. It captures object/column ACLs, policies, defaults, schema grants, function metadata/hashes, indexes, current settings and bucket configuration without user payloads or secrets.
- Confirm an existing authorized recovery/backup option and the C.0 schema/definition sources. Do not create a paid backup/branch or copy production data. Metadata evidence alone is not a user-data backup.
- Record the exact migration checksum, role, database/project identity and approved exposed schema list. Approve the application-scoped default changes and explicit future-function restriction approach; no global/provider default changes are proposed.

### Failure before COMMIT

Issue ROLLBACK (or close the failed psql session). Do not continue issuing migration statements in an aborted transaction. All created tables/policies/buckets, grants/default changes and resource-default changes roll back atomically. Transactional advisory lock and NOTIFY are released/discarded. The test verifies a late failure rolls back an earlier index recreation. Diagnose and revise the proposal rather than weakening guards or overwriting drift.

### Failure discovered after COMMIT

Prefer a reviewed forward fix while writes/OAuth remain disabled. Keep all new tables and stored user data; never drop schemas/tables/buckets or delete workspace rows as an automatic rollback. Preserve the currently correct resource row and write switches.

If a new trigger causes an incident, an explicitly approved recovery can disable that specific trigger temporarily, retaining derived/source data, followed by a corrected trigger definition and retest. Reverting default ACLs or grants must be derived from the pre-change snapshot and reviewed privilege by privilege; do not restore broad unsafe grants blindly. A function/permission recovery is a separate approved change. There is intentionally no destructive down migration.

## Exact future staging execution procedure — not executed

1. Obtain explicit hosted execution approval for this exact checksum and scope. Reconfirm the staging project ref externally through the connected project metadata or the staging dashboard; never rely solely on a session variable. Do not select any other project.
2. Complete the read-only Data API dashboard check and record the **complete exact list** of exposed schemas. Stop if it exposes a private schema. No Auth/OAuth setting change is part of this migration.
3. Use the staging SQL Editor/connection as postgres and run database/staging/c01-preflight.sql read-only. Save its result. Verify the active staging resource/writes=false, `role=postgres`, expected object ownership and all required `operator_capabilities`. No supabase_admin membership is expected or required. Stop on missing application/storage/Auth privileges; review through a provider-supported path rather than elevating the role or skipping checks. Save full default ACLs for before/after comparison.
4. Compare the live schema and security state to C.0 and this inventory. Stop on changed/missing base objects, unknown callable definer functions or unrelated app changes. Upstream PostgreSQL 17.11 rehearsal now passes; still inspect the actual managed schema/ACL/event-trigger differences before real execution.
5. In one verified staging session, set the two assertions, using the actual reviewed schema list rather than the placeholder below, then execute the complete migration unchanged:

```sql
-- OPERATOR ASSERTIONS ONLY; verify project identity and dashboard values first.
set mfd.c01.target_ref = 'gngnrmzeghjzqsmzuktl';
set mfd.c01.exposed_schemas = '<EXACT REVIEWED DASHBOARD SCHEMA LIST>';
-- Execute the complete approved migration file next, in this same session.
```

   The placeholder deliberately fails validation. The file owns BEGIN/COMMIT. For psql, use `-X -v ON_ERROR_STOP=1` and a securely configured, certificate-verified connection to the exact staging host; never put passwords/tokens in command text, logs or the migration. The connected SQL tool, if separately approved instead, must use explicit project_id gngnrmzeghjzqsmzuktl and the entire reviewed batch. Do not use unqualified linked-project db push, rerun installers, or create hosted test users in this step.
6. On any failure, roll back immediately and stop. Do not modify the valid resource row or lower the safety checks to force success. Record the exact failed guard and revise/retest locally before new approval.
7. After success, run the read-only snapshot again. Verify eleven new tables, eight functions, five triggers, three correct private buckets, intended constraints/indexes/policies, zero excessive authenticated table powers including MAINTAIN, restricted postgres application-schema defaults, unchanged provider/global defaults and unchanged MCP resource/writes=false. Re-run security/performance advisors and review new notices.
8. Verify each private schema is still rejected by the actual Data API and verify the **settings** did not change. Record an approved migration-history/provenance entry separately through the chosen team's process; direct SQL does not automatically establish Supabase migration history. Do not repair migration history or push all local migrations implicitly.
9. Obtain later, separate approval for synthetic hosted accounts and API/account-isolation acceptance. Local tests do not authorize inserting fixtures into staging. Keep OAuth disabled and the Site unpublished; source commit, push, publication, clients/hooks/signing and write enablement remain outside this approval.

## Remaining risks and manual requirements

- Provider default changes are intentionally excluded: hosted postgres cannot change supabase_admin defaults. Future unprotected functions retain global PUBLIC EXECUTE; approve/enforce transactional explicit MFD grants and review all new RPCs. Application schema defaults for postgres still affect later postgres objects in those schemas; review any future extension placement accordingly.
- Exact Data API configuration remains manually verified, not writable or discoverable reliably through this migration. Operator assertions are a gate, not a security substitute.
- The catalog fingerprint is intentionally strict. PostgreSQL version/format differences, extra policies or partially installed older definitions require a revised reviewed migration; no existing definition is silently replaced.
- No historical social backfill or physical message cleanup is installed. Visibility and retention are different requirements; plan separately approved cleanup without importing real data.
- PostgREST cache NOTIFY is included on successful commit; managed service health, signing, consent/refresh/revocation and physical storage behavior remain untested here.
- A migration-history decision and pre-change recovery evidence are required before real execution. No rollback restores unsafe privileges automatically or drops user data.

**Stopped after local preparation/testing. Await explicit approval before any hosted operation.**
