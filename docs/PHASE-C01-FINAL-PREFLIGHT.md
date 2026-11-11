# Phase C.0.1 — Final read-only hosted preflight

Date: 2026-10-27 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Current status:** see [the readiness recheck](PHASE-C01-READINESS.md). The local preflight now recognizes configured provider delegation and passes for both storage tables; exact Data API configuration and recovery evidence remain unverified. Hosted execution is still not cleared.

**Later read-only investigation:** [Storage permission plan](PHASE-C01-STORAGE-PLAN.md) identifies existing Supabase `supautils.policy_grants` delegation for postgres on storage.objects. The ownership result below remains accurate, but the ownership-only FAIL interpretation is superseded by that finding. No DDL failure was demonstrated. Other incomplete gates and the requirement for explicit migration execution approval remain in force; this historical checklist is not a current execution clearance.

**STOP: required storage-policy ownership capability failed. The migration is not cleared for hosted execution.** No migration, DDL, role change, hosted setting change, user creation, OAuth enablement, publication, commit or push occurred. Only the exact staging project was queried. Remaining hosted checks were stopped when the blocker was observed, as instructed.

## Artifact and identity

Migration: `supabase/migrations/20261027173539_staging_mfd_c01_remediation.sql`.

SHA-256: `db296a6263e4596cc64f2a0f678000d4ef25ee0892d818c8782e60b671953da5`. Matches the latest `docs/PHASE-C01-REPORT.md`; the migration was not edited during this preflight.

`get_project` was called with only `gngnrmzeghjzqsmzuktl`. Returned identity: `MFD OAuth Phase 2 Testing`, matching id/ref, `ACTIVE_HEALTHY`, eu-central-1, database host `db.gngnrmzeghjzqsmzuktl.supabase.co`, PostgreSQL release `17.11.0.003`.

The exact current `database/staging/c01-preflight.sql` was executed through the connected SQL tool with that explicit project_id. Its transaction is READ ONLY. Only metadata and non-secret MCP configuration were selected; no workspace payload, account record, secret or production data was read.

## Final checklist

| Prerequisite | Result | Evidence / consequence |
| --- | --- | --- |
| Approved artifact checksum | PASS | Exact match above. |
| Branch | PASS | `staging/mfd-oauth-testing`. |
| Selected project identity | PASS | Explicit staging id/ref/host match. |
| Exact read-only snapshot execution | PASS | Completed; database `postgres`, server version `17.11`. |
| Expected execution role | PASS | `postgres`; superuser=false; supabase_admin membership=false, as expected. |
| Database CREATE | PASS | operator_capabilities.database_create=true. |
| Public schema CREATE | PASS | operator_capabilities.public_schema_create=true. |
| Auth users REFERENCES | PASS | operator_capabilities.auth_users_references=true. |
| Storage bucket INSERT and SELECT | PASS | operator_capabilities.storage_bucket_insert_select=true. |
| Storage policy owner authority | **FAIL** | operator_capabilities.storage_objects_owner_or_inherited_owner=false. Required ownership authority is not established for the proposed storage policy DDL. |
| Existing application object ownership/RLS | PASS, scoped | Workspace and all four MCP tables are postgres-owned with RLS enabled. MCP schema owner is postgres; public owner is pg_database_owner. New application schemas/tables/buckets remain absent, consistent with the proposed baseline. |
| Existing grants/defaults | PASS for expected baseline, not least-privilege end state | Workspace still grants authenticated all table powers including TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, as previously observed. postgres public defaults remain broad; supabase_admin public/provider defaults remain present. These are not declared secure merely because they match the baseline. Proposed application-scoped remediation is still required. |
| Existing OAuth restrictions | PASS, scoped | Workspace/storage restrictive client_id policies retain USING and WITH CHECK; MCP tables have no direct anon/authenticated table grants. |
| Database MCP write switch/resource | PASS | Exactly one settings row: writes_enabled=false; active resource is the expected staging Site `/mcp` URL. Stale column default remains as documented for remediation. |
| Data API schemas exactly public, graphql_public | **NOT VERIFIED — gate fails** | api_schema_setting=null in the snapshot. No exact management/dashboard list obtained before stopping. Must not infer the list from this null value. |
| mfd_mcp currently unexposed | **NOT VERIFIED in this pass — gate fails** | C.0's earlier REST rejection is historical evidence; no fresh exposure probe/dashboard confirmation completed before stopping. |
| Application/Worker MCP write switch | **NOT VERIFIED in this pass — gate fails** | Earlier C.0 recorded false. Stored Site runtime was not re-read after the storage blocker. No claim of a live deployed Worker is made. |
| Available recovery option | **NOT VERIFIED — gate fails** | No current backup inventory, retention or approved recoverable export established before stopping. No paid resource, backup or branch was created. |

FAIL denotes a failed required capability; NOT VERIFIED denotes an incomplete prerequisite, not an observed incorrect setting. Neither permits migration execution.

## Blocker and required next decision

The proposed migration creates policies on `storage.objects`. The reviewed preflight requires effective owner/inherited-owner authority for this operation; its result is false for the actual connected postgres role. Bucket INSERT/SELECT privilege does not establish permission to create table policies. No policy-creation probe, SET ROLE, ownership change or privilege escalation was attempted. The snapshot alone does not prove whether a provider-specific delegated mechanism exists; such a mechanism must be established through a supported, separately reviewed path rather than assumed.

Before further execution approval, establish the exact storage owner and supported policy-management path using read-only metadata/provider documentation. If that path differs from the reviewed migration's assumptions, revise and test the proposal locally and obtain approval for the revised artifact. Do not add SECURITY DEFINER, change storage ownership, assume supabase_admin, weaken policies or skip the storage section to force success.

The next read-only pass must also verify the exact Data API list, exclusion of private schemas, stored application writes=false, unchanged function definitions/ACLs and a usable recovery option. Raw source MD5 values in this snapshot are not compared to whitespace-normalized hashes as though they were equivalent. No full final migration-guard sign-off is claimed.

Recovery candidates for verification, not currently confirmed available: an already included provider backup with a known restore timestamp/retention, or an explicitly approved encrypted staging-only logical backup under the existing plan. A metadata snapshot and transactional rollback do not replace post-COMMIT data recovery. Do not enable PITR, paid backups, branches or perform a restore as part of preflight.

## Exact migration execution plan — blocked, future approval only

1. Resolve the storage authority blocker through an approved provider-supported path. Complete all NOT VERIFIED gates and record current recovery evidence. Re-run the full read-only snapshot and compare all required ownership/ACL/function/policy/default assumptions to the reviewed baseline.
2. Obtain explicit approval for the exact artifact checksum above, or a newly reviewed checksum if any revision is necessary. This preflight approval does not authorize migration execution.
3. Reconfirm project identity `gngnrmzeghjzqsmzuktl` externally and the expected SQL role. Confirm Data API exposed schemas are exactly `public` and `graphql_public`; private application/Auth schemas must not be exposed. Confirm both MCP write switches remain false.
4. Save pre-change metadata securely and confirm the approved recovery path. In the same explicitly targeted SQL session, set `mfd.c01.target_ref='gngnrmzeghjzqsmzuktl'` and `mfd.c01.exposed_schemas='public,graphql_public'` only after independently verifying those facts.
5. Execute the complete approved migration file unchanged, including its own BEGIN/COMMIT and all guards. Use no linked-project db push, installer replay, selective statement execution or migration-history repair. A connected tool must name the exact staging project_id. A psql path must use a securely configured certificate-verified connection and `-X -v ON_ERROR_STOP=1`, with no credentials in command text.
6. On error, ROLLBACK and stop; never bypass guards or continue in an aborted transaction. After success, repeat read-only catalog/ACL/policy/bucket/default inspection, compare provider/global defaults and active settings, verify private schemas through the Data API, and review advisors. Handle migration provenance through the separately approved process.
7. Stop again before accounts, OAuth/hooks/clients, write enablement, source commits/pushes or deployment; none are included in database execution approval.

**Execution recommendation: NO. Await a separately scoped decision on the blocker and completion of the read-only prerequisites.**
