# Phase C.0.1 — Readiness recheck

Date: 2026-10-27. Target exclusively `gngnrmzeghjzqsmzuktl`; branch `staging/mfd-oauth-testing`.

**Not every execution prerequisite is satisfied. Overall readiness: FAIL (incomplete evidence). Do not execute the migration.** Storage delegation is now correctly recognized, but exact Data API exposure and a usable recovery option remain NOT VERIFIED.

## Checklist

| Check | Result | Evidence |
| --- | --- | --- |
| Staging identity | PASS | Explicit get_project request returned matching id/ref, MFD OAuth Phase 2 Testing, ACTIVE_HEALTHY, eu-central-1, PostgreSQL 17.11.0.003. No production project queried. |
| Migration checksum | PASS | `db296a6263e4596cc64f2a0f678000d4ef25ee0892d818c8782e60b671953da5`, matches requested checksum/latest preparation report. Migration unchanged. |
| Corrected preflight distinguishes ownership/delegation | PASS | Separate owner name, ordinary_owner_or_inherited_owner, supported_delegation_configured and combined policy_management_preflight_pass per storage table; aggregate all_storage_policy_authority_established requires both tables. |
| Existing delegation, storage.objects | PASS | postgres; owner=supabase_storage_admin; ordinary authority=false; supported delegation=true; combined check=true. |
| Existing delegation, storage.buckets | PASS | Same result; no membership, ownership or provider setting changed. |
| Fail-closed behavior | PASS | Missing/wrong-role/wrong-shape/wildcard/partial metadata never establishes both-table authority. Malformed JSON errors instead of authorizing. Local tests cover these cases. |
| Revised read-only snapshot | PASS | Exact revised c01-preflight.sql executed on staging in READ ONLY transaction; role=postgres, non-superuser, no supabase_admin membership. Database CREATE, public CREATE, Auth REFERENCES and bucket INSERT/SELECT are true. |
| Data API exposes exactly public and graphql_public | **NOT VERIFIED** | pgrst.db_schemas remains null in this SQL session; tools provide no complete Data API management-setting getter. Native Safari access timed out; in-app browser unavailable. Default/documented schema lists are not project-specific proof. |
| mfd_mcp currently rejected by Data API | PASS, scoped | Fresh zero-row request with Accept-Profile=mfd_mcp returned HTTP 406/PGRST106, Invalid schema. Nonexistent control profile produced the same rejection. |
| Newly created private schemas remain unexposed | **NOT VERIFIED for future state** | mfd_private and mfd_observability currently return 406/PGRST106. They do not yet exist, so this is not proof of their treatment after creation. Migration does not change exposure settings and rejects a supplied list containing private schemas; the exact authoritative list still must be confirmed before execution and checked again afterward. |
| Application MCP write switch | PASS | Stored Site runtime for appgprj_6ae0ae64c4e88191a385d9bdb6dc37c5, revision 1: MFD_MCP_WRITES="false". Staging Supabase URL/issuer/resource match. Local .openai/environment.json also false. No deployed-Worker behavior test implied. |
| Database MCP write switch | PASS | Exactly one settings row; writes_enabled=false and expected staging /mcp resource. |
| Existing usable recovery option | **NOT VERIFIED** | No project-specific backup inventory/restore timestamp/retention or existing verified encrypted logical backup established. Connected tool catalog has no backup-list operation, and dashboard access was unavailable. No paid service or resource was enabled. |
| Relevant local tests | PASS | Updated migration/preflight test and all three SQL policy suites pass; complete local runner passes 32/32 files under Node 22.13.1. |
| Hosted DDL / migration / configuration changes | PASS: none | Only metadata reads and zero-row staging REST probes. No account creation, OAuth enablement, commit, push, frontend change or deployment. |

## Local implementation and evidence

Changed `database/staging/c01-preflight.sql` only in its read-only reporting logic. It reads the registered `pg_settings` entry for `supautils.policy_grants`, parses JSON, requires an object containing an array for the **current execution role**, and checks exact table-name containment independently for storage.objects and storage.buckets. Ordinary ownership remains a separate sufficient path. It does not trust a caller-supplied custom session assertion as provider delegation, infer delegation from DML grants/BYPASSRLS, change provider settings or execute a policy-DDL probe. A false combined field is a stop condition for the execution checklist; the snapshot itself is a diagnostic query, not the migration runner.

Extended `tests/staging-remediation.cjs` with the exact SQL authority CTE. Only its pg_settings metadata input is substituted for synthetic local cases, since PGlite does not register the provider library. Tests verify ordinary ownership, no authority, wrong role, partial grants, valid exact delegation, wrong JSON shapes, wildcard/near-match rejection and malformed JSON rejection. The remaining migration/idempotency/rollback/RLS/MCP tests run unchanged. No new native 17.11 rehearsal was claimed in this pass; the prior full-migration native result remains historical evidence for the unchanged migration.

The revised hosted snapshot returned all_storage_policy_authority_established=true. Existing workspace/MCP RLS and the restrictive storage OAuth policy remain present. Broad workspace privileges and application defaults remain as previously documented for remediation; this preflight did not fix or reclassify them as a secure final state.

## Remaining manual evidence required

1. In the **staging** [Data API settings](https://supabase.com/dashboard/project/gngnrmzeghjzqsmzuktl/integrations/data_api/settings), read and record the entire exposed-schema list. Require exactly public and graphql_public. Confirm mfd_mcp, mfd_private, mfd_observability and auth are absent. Do not edit settings as part of this check. Do not use an operator assertion as a substitute for the observation.
2. In staging Database → Backups, identify an already available backup and record completed status, pre-migration timestamp, retention/restore availability and recovery limitations. Alternatively identify an **existing** encrypted staging-only logical backup with verified scope/integrity and recovery procedure. Do not enable PITR, buy a plan, create a branch or invoke restore. If no usable backup exists, stop and propose a separately approved staging-only logical backup before migration execution.

[Supabase's backup documentation](https://supabase.com/docs/guides/platform/backups) describes Dashboard and Management API inventory paths; the available connector does not expose the latter. General backup entitlements do not prove this project's recoverable state. Database backup coverage excludes Storage file contents; metadata snapshots and transaction rollback are not substitutes for post-COMMIT recovery.

After those observations are supplied or readable access becomes available, refresh the read-only metadata/configuration checks and checksum, save recovery evidence securely, then seek explicit approval for the complete single transaction. Do not run any migration statements now.

Files changed in this readiness pass: `database/staging/c01-preflight.sql`, `tests/staging-remediation.cjs`, this report, plus a pointer in the earlier final-preflight report. Existing migration, frontend, dependency manifests and lockfiles remain unchanged.

**Stopped. Execution recommendation: NO until the NOT VERIFIED gates are resolved and explicit hosted execution approval is received.**
