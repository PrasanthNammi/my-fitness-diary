# C.0.1 storage-policy investigation and proposed resolution

Date: 2026-10-27. Read-only investigation of `gngnrmzeghjzqsmzuktl` only. No DDL, role assumptions, ownership changes, configuration changes, accounts, publication, commits or pushes. Migration/frontend unchanged.

## Finding: ownership-only preflight was incomplete

The selected project again identifies as `MFD OAuth Phase 2 Testing`, ACTIVE_HEALTHY, PostgreSQL `17.11.0.003`. Read-only catalog/configuration queries establish:

| Item | Observed |
| --- | --- |
| Execution/session role | postgres / postgres; non-superuser |
| storage.objects and storage.buckets owner | **supabase_storage_admin** |
| postgres membership / inheritance / SET authority in that owner | false / false / false |
| Both storage tables' RLS | enabled |
| Existing storage.objects policies | Only restrictive `mcp_no_direct_access`, authenticated, ALL, client_id absent in both USING and WITH CHECK |
| Buckets | 0 |
| Database MCP writes | false; active staging resource unchanged |
| Existing provider delegation | **supautils.policy_grants**, source=configuration file, explicitly lists postgres with storage.objects and storage.buckets |
| Existing provider privileged role | supabase_privileged_role; postgres already has inherited membership. No membership was added or role assumed. |

The prior `storage_objects_owner_or_inherited_owner=false` result is accurate **as an ownership test**, but does not establish lack of policy-management permission on hosted Supabase. The previous FAIL interpretation omitted provider delegation. No actual CREATE POLICY failure was observed. The preflight query/report should distinguish ordinary ownership from configured provider policy delegation in a separately approved preparation revision.

Supautils can be a loaded library without a pg_extension entry: the query returned no supautils pg_extension row but did return registered supautils settings. Absence from pg_extension is not evidence that the configured policy mechanism is absent.

## Supported mechanisms

1. **Existing delegated SQL policy management — preferred.** Supabase's [managed-schema restrictions announcement](https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025) explicitly retains RLS-policy management on storage.objects/buckets. Its official [supautils documentation, Manage Policies](https://github.com/supabase/supautils#manage-policies) explains that policy_grants permits named roles to CREATE/ALTER/DROP/COMMENT ON policies on listed tables without ownership. Staging has exactly that delegation for postgres. Use this existing supported capability normally as postgres; do not configure new delegation, assume a managed role or implement an ownership workaround.
2. **Storage Policies dashboard — supported alternative.** The official [Storage quickstart](https://supabase.com/docs/guides/storage/quickstart#add-security-rules) documents Storage → Policies → Add Policies on OBJECTS, selecting operation, name and SQL condition. Use an account authorized to manage this staging project, custom reviewed predicates and exact target roles. Dashboard support does not prove this particular account's ability to save policies; nothing was saved or submitted in this investigation. Do not use broad templates, alter the existing restrictive policy, or assume the UI can express every desired restrictive/multi-statement operation.
3. SQL Editor and migration tooling are delivery paths for reviewed SQL under their actual database role, not ways to confer ownership. Neither table DML grants, BYPASSRLS nor a service key is a substitute for policy-DDL authority. No private/internal API or privileged credential is proposed.

PostgreSQL's ordinary [CREATE POLICY ownership requirement](https://www.postgresql.org/docs/17/sql-createpolicy.html) remains the baseline; Supabase supplies the documented, preconfigured delegation. This plan uses that authorized provider capability, not a custom permissions bypass. The loaded provider implementation's end-to-end execution has **not** been tested: that would require separately approved DDL, including any create-and-rollback probe.

## Recommended plan and required approval

**Keep the application objects, nine storage policies, private bucket configuration and final catalog guard in one atomic transaction. A separate storage operation is not technically required by the observed ownership result.** The current file already orders referenced public tables/helpers before storage policies. It preserves the existing storage OAuth restriction and validates the combined final state before COMMIT. Supabase's [bucket-creation guide](https://supabase.com/docs/guides/storage/buckets/creating-buckets) explicitly supports SQL bucket creation; no object/file metadata mutation is proposed.

Migration checksum remains `db296a6263e4596cc64f2a0f678000d4ef25ee0892d818c8782e60b671953da5`.

Before execution:

1. Approve a local-only correction of the ownership-only preflight interpretation/query. Record owner authority and provider delegation separately; retain fail-closed behavior if neither exists or metadata is unavailable. Retest any changed preflight locally. No migration guard should be dropped merely to obtain a PASS.
2. Complete the outstanding exact Data API schema-list/private-schema checks, current application write switch and usable recovery evidence. Recheck existing function bodies/ACLs, storage RLS/policy definitions and delegation under the exact eventual execution role/session. Both write switches must remain false.
3. Obtain explicit approval for the exact migration checksum and full hosted transaction. A separately scoped transactional DDL capability probe is an option only if requested/approved; this investigation does not authorize one. A successful read-only configuration check is not represented as an executed DDL test.
4. Execute only the whole approved transaction in the explicitly verified staging project. On permission or catalog error, ROLLBACK and stop. Do not change ownership, role memberships, provider settings or SECURITY DEFINER boundaries to retry.
5. After success, read back all nine new storage policies plus the preserved restrictive OAuth policy. Compare commands, roles, permissive/restrictive mode, USING/WITH CHECK and referenced objects; verify all three buckets remain private with exact limits/MIME types, ownership/delegation unchanged, and the full application catalog/ACL checks. Hosted Alice/Bob/storage behavior tests still require separately approved synthetic accounts and test scope. Do not treat the migration operator's RLS bypass as an isolation test.

## If separate dashboard policy management is chosen

This would be a **different, separately approved rollout**, not selective execution of the existing file. Dashboard saves are hosted changes and generally separate transactions; no cross-dashboard/SQL atomicity is promised. A split is possible in principle, but must be prepared and interruption-tested before approval:

- **A — atomic foundation, closed to clients:** create required public/private tables/helpers with full owner/OAuth RLS but no new PUBLIC/anon/authenticated grants or callable RPCs. Defer activating new triggers on existing workspace behavior until finalization. Preserve existing application access and all existing restrictions. Validate this intermediate state before commit.
- **B — gated storage preparation:** before adding permissive policies, install a separately reviewed temporary restrictive deny-all policy for affected client roles/target buckets using a supported policy path. Preserve mcp_no_direct_access throughout. Create private empty buckets and the exact nine policies through the supported dashboard/SQL path. Keep the deny gate until every definition is verified. If the UI cannot express the exact required gate/predicates or a safe sequence cannot be proven, do not perform this split.
- **C — atomic finalization:** verify the complete storage/application inventory and all restrictions; grant only final intended application privileges, activate reviewed triggers/RPCs and remove only the temporary rollout gate in the same transaction. Final catalog assertion must pass before commit; failure must roll back finalization and retain the gate. Do not remove mcp_no_direct_access or any final OAuth/owner policy.

Each SQL stage can be atomic and idempotent; the overall multi-operation rollout cannot. New checksums, stage-specific catalog assertions, recovery instructions and PostgreSQL 17.11 tests for each interruption/retry boundary would be mandatory. Existing 32-test results cover the original single transaction, not this unimplemented staged design. **No split has been implemented or approved.**

## Decision

The storage ownership concern has a documented, already-configured supported solution: delegated SQL policy management as postgres. Recommend the single transaction after correcting the preflight interpretation and completing remaining gates. No separate policy authorization is needed beyond explicit approval of the full transaction if policies remain in it; any dashboard operation or capability probe requires its own explicit scope/approval.

If delegated policy DDL later fails, or delegation cannot be confirmed in the actual execution session, stop and contact Supabase Support with the staging ref, server version, operator/owner/delegation metadata and exact SQLSTATE/error. Do not send credentials or user payloads. No support message was sent.

**Stopped for approval. Hosted execution remains unauthorized.**
