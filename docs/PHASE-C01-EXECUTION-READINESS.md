# Phase C.0.1 — Execution readiness and verified local recovery

Date: 2026-10-27 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Subsequent approved execution:** the exact migration was committed once and verified successfully; see [the C.0.1 execution report](PHASE-C01-EXECUTION-REPORT.md). This document preserves the pre-execution backup/readiness evidence and accepted recovery limitations. Phase C.1 remains separately approval-gated.

**Verified, usable application-scoped recovery is now available. Overall recovery scope is PARTIAL: this is not a complete Supabase platform/database-state backup.** The application archive and managed-schema definitions were created through the staging Session pooler and restored successfully into disposable LOCAL PostgreSQL 17.11. Auth/Storage data and signing secrets were deliberately excluded under the approved boundaries. Full provider-service recovery is not claimed. Explicit approval accepting this recovery scope is required before any hosted migration.

No hosted DDL, migration, setting/ownership/role change, user/client creation, OAuth/write enablement, publication, commit, push or frontend change occurred. Only staging was connected. Backup contents and credentials were not displayed or uploaded. `.pgpass` was never read by the agent; libpq used it automatically.

## Final checklist

| Prerequisite | Status | Evidence / limitation |
| --- | --- | --- |
| Staging identity | PASS | Explicit get_project: gngnrmzeghjzqsmzuktl, MFD OAuth Phase 2 Testing, ACTIVE_HEALTHY, eu-central-1, PostgreSQL 17.11.0.003. |
| Source connection mapping | PASS | User-supplied aws-1-eu-central-1.pooler.supabase.com:5432, database postgres, username postgres.gngnrmzeghjzqsmzuktl. Verified authenticated role/database postgres, server 17.11, expected staging MCP resource and writes=false. Host is shared; username/ref and project configuration establish the selected mapping. |
| TLS chain and hostname verification | PASS | libpq verify-full succeeded using the user-downloaded CA at /Users/prasanthnammi/Downloads/prod-ca-2021.crt. No trust-store change or TLS downgrade. |
| PostgreSQL clients / session-mode compatibility | PASS | TLS-enabled pg_dump/pg_restore 17.11; both dumps completed over Session pooler. Official Supabase backup guidance supports session mode. No transaction-mode pooler was used. |
| Read-only source operations | PASS | Explicit read-only transactions for inspection. PostgreSQL 17.11 pg_dump source opens REPEATABLE READ, READ ONLY. No CLI temporary role created. The pooler did not retain the startup read-only option, so that option was not relied on. |
| Pre-export unexpected user data | PASS, scoped | Auth users/sessions, workspaces, MCP clients/grants/proposals, buckets and objects all zero before and after capture. Only the five expected application tables exist in public/MCP. No user payload inspected. Other managed table contents were not exported or certified empty. |
| Data API exposure | PASS — user-confirmed dashboard evidence | Exact allowlist public, graphql_public; automatically exposing new tables disabled. mfd_mcp/auth/mfd_private/mfd_observability excluded. SQL session does not independently return the management setting; recheck after any approved migration. |
| Application write switch | PASS | Stored staging Site runtime MFD_MCP_WRITES=false, MFD_ENV=staging, exact staging Supabase URL. Not a live deployment behavior test. |
| Database write switch/resource | PASS | Post-backup preflight: one correct staging settings row, writes_enabled=false. |
| Storage policy authority | PASS — configuration | postgres ordinary ownership=false; registered supautils.policy_grants authorizes storage.objects and storage.buckets. Both combined checks true. No hosted policy-DDL probe performed. |
| Existing baseline security | PASS, reviewed scope | Workspace/MCP RLS, existing restrictive OAuth policies, ownership, function modes/ACLs and normalized source hashes remain reviewed. User's disabled automatic exposure explains changed postgres public defaults; provider defaults unchanged by this work. Excess application privileges remain for the proposed remediation. |
| Protected backup location | PASS | Outside Git; directory 0700, top-level archives/evidence/scripts 0600. Archives are not encrypted; FileVault status not established. Current application data is empty except non-secret MCP settings. Preserve these files until explicit cleanup approval. |
| Application capture completeness | PASS, defined scope | Both application schemas, all five tables and their data, four functions, policies, constraints, indexes, ownership, ACLs and applicable defaults included. No schema/table filters within public/mfd_mcp. |
| Managed dependency definitions | PASS, definitions only | Separate schema-only Auth/Storage archive restored successfully. All managed table data excluded, including migration records, sessions, signing/OAuth material. |
| Archive integrity | PASS | TOCs readable; complete pg_restore-to-/dev/null reads succeeded; SHA-256 unchanged after verification. |
| Local restore / application comparison | PASS | Fresh isolated PostgreSQL 17.11, private Unix socket, TCP disabled. All 11 comparison sections matched after documented ACL normalization; details below. |
| Complete Supabase database/platform recovery | **NOT VERIFIED / not captured** | Provider-managed data/configuration/secrets/services, role credentials/memberships and other extension schemas are outside this capture. Do not describe these archives as a full platform backup. |
| Migration checksum / atomicity | PASS | Exact requested SHA-256 below; migration unchanged; one outer BEGIN/COMMIT, no workspace backfill or settings-row rewrite, OAuth restrictions and final catalog guard retained. No provider-role privilege changes proposed. |
| Git scope | PASS | Correct staging branch, index empty; no commits/pushes/merge. Only this report changed in tracked/candidate source during this backup pass; tooling remains ignored/outside Git. |
| Local tests | PASS | Fresh complete runner: 32/32 files, including migration/preflight, database/RLS, MCP and application suites. Backup restore verification is additional evidence. |
| Hosted execution authorization | **NOT GRANTED** | Await explicit approval for exact migration checksum and acceptance of application-scoped recovery limitations. |

## Backup artifacts

Restricted directory:

`/Users/prasanthnammi/MFD-Staging-Backups/gngnrmzeghjzqsmzuktl-20261027T200208Z`

| File | Scope | Size | SHA-256 |
| --- | --- | --- | --- |
| application.dump | public + mfd_mcp schema and data, custom format | 27,801 bytes | 8d11b21cce6c791b49a7178e6afaa3e0bf15e5dd25e8eaf35b38ed7399e2bc80 |
| managed-schema-only.dump | auth + storage definitions only, custom format | 219,719 bytes | a402dfec575b60459e711bb8df78e3165e2a1549d1be5371f3d41e1e1c83f55a |

The directory also retains TOCs, original and verified SHA-256 manifests, role names without passwords, source catalog/count fingerprints, post-backup preflight, restore comparison/check results, private logs and local reproduction scripts. Three isolated local rehearsal clusters are retained; all were stopped. Nothing was deleted. Manifests do not make these artifacts tamper-proof against someone controlling the local account; preserve the recorded archive hashes separately with this report.

## Certificate and transport

The supplied certificate identifies Supabase Root 2021 CA, valid 2021-04-28 through 2031-04-26. Certificate SHA-256 fingerprint:

`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

Self-signature/validity inspection passed; trust provenance is the user's dashboard download. Crucially, the actual libpq connection passed chain **and hostname** verification against that certificate. The earlier direct-host DNS and system-trust failures are historical and superseded for this supplied session endpoint.

`PGOPTIONS` startup read-only defaults were not honored by the pooler: the initial identity probe reported off. Subsequent queries used explicit BEGIN TRANSACTION READ ONLY and the capture identity check required transaction_read_only=on. The verified PostgreSQL pg_dump implementation starts its own read-only transaction. No global or hosted role setting was changed.

Official references: [Supabase backup/session pooler guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement), [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore selection](https://www.postgresql.org/docs/17/app-pgrestore.html).

## Restore verification and recovery scope

Both archives restored with --single-transaction and --exit-on-error into a new local database using captured role names recreated as local NOLOGIN compatibility roles, not actual hosted role credentials. Local postgres/service_role compatibility roles have BYPASSRLS to model their source behavior; provider memberships, platform delegation hooks and services are not reproduced. No provider role was assumed on hosted Supabase.

Verified application inventory:

- 2 schemas, 5 tables, 19 columns, 4 functions, 7 application/MCP policies, 14 constraints, 7 indexes and 6 default-ACL entries.
- No non-internal application triggers exist in the captured baseline; restored absence matched.
- Table ownership/RLS/ACLs, columns/defaults, policies, functions/source/security/search_path/ACLs, constraints, indexes, triggers, schema ACLs, default ACLs, settings fingerprint and row counts matched across 11 comparison sections.
- Counts: forma_workspaces=0, clients=0, grants=0, proposals=0, settings=1. The entire settings-row JSON fingerprint matched; writes remained false.
- Restored Auth users=0 and storage objects=0; preserved restrictive storage.objects.mcp_no_direct_access policy exists. No actual Auth login, storage API upload or hosted account-isolation acceptance is implied.

Initial rehearsals exposed a restoration prerequisite, not an archive corruption: deleting PostgreSQL's standard public schema removed its baseline PUBLIC USAGE; retaining it while replaying its duplicate SCHEMA entry caused an already-exists error. The successful procedure retains the standard fresh public schema and excludes **only its duplicate SCHEMA creation TOC entry**, retaining all ACL/default/data/function entries. Exactly one matching TOC entry is required. The archives themselves were not changed.

Two owner-only table ACLs restore as PostgreSQL's implicit owner ACL rather than explicit arrays. The verifier expands a null table ACL to the documented owner-only default and sorts ACL entries; it does not discard grants, grant options, grantors or ownership. All other fields remain compared. Schema ACLs match with the correct baseline. First-attempt diagnostics are retained; final restore-result.json is PASS.

**Recovery classification: PARTIAL overall, verified usable for application-owned database objects/data and captured dependency definitions.** This is meaningful recovery evidence for the empty staging application baseline, not a substitute for a full Supabase platform backup. Auth/Storage operational/migration data, signing keys, OAuth secrets, dashboard settings, role passwords/memberships, other provider/extension schemas and external files were not captured. No required application object was denied during these selected exports; a full unfiltered database export was deliberately not attempted because it would conflict with the existing secret-exclusion boundaries. Empty Auth/Storage tables in the local restore must not be mistaken for a captured managed-service data backup.

## Exact tested local restore procedure

Use only a fresh disposable local cluster/database, never an existing user database or hosted endpoint:

1. Validate archive hashes against this report and manifests. Read each archive fully with pg_restore --file=/dev/null and inspect its TOC locally without printing data.
2. Initialize PostgreSQL 17.11 with local bootstrap role c01_backup_admin, UTF8, rejected host authentication and a mode-0700 private Unix socket. Disable TCP. Recreate captured role names as NOLOGIN local compatibility roles, without passwords; preserve the explicitly documented local BYPASSRLS model.
3. Create a new database from template0 owned by the local postgres compatibility role. Keep its standard public schema and ACL baseline.
4. Restore managed-schema-only.dump using --exit-on-error --single-transaction into this new LOCAL database.
5. Copy application.toc to a new restore list, excluding exactly the entry matching `SCHEMA - public` (the entry's numeric TOC identifiers vary). Do not omit its ACL entries or any application table/data/function/policy entry. Assert exactly one duplicate schema-definition entry was removed.
6. Restore application.dump using --use-list with that list, --exit-on-error and --single-transaction. Compare the 11 captured catalog/data sections using the retained snapshot-query.sql and documented implicit-owner ACL normalization. Check writes=false and the Storage OAuth restriction.
7. Record the result and stop the local server. Preserve all archives/evidence/clusters until authorized cleanup.

The retained capture-staging.py, restore-local.py and postcheck-staging.py record the executed logic. The restore runner uses fresh fixed names and intentionally fails rather than overwriting an existing cluster; another rehearsal requires new disposable directory/socket/database names. Inspect/adapt only local destinations. It is not a hosted restoration or rollback script.

## Final migration approval and post-execution procedure

Migration remains:

`supabase/migrations/20261027173539_staging_mfd_c01_remediation.sql`

SHA-256:

`db296a6263e4596cc64f2a0f678000d4ef25ee0892d818c8782e60b671953da5`

1. Obtain explicit approval for this exact checksum and acceptance of the scoped recovery evidence above. If complete platform recovery is required instead, stop: that prerequisite is not satisfied by these archives.
2. Immediately before execution, refresh staging identity, exact Data API list, disabled automatic exposure, both write switches, delegation and full read-only preflight. Compare baseline drift; verify archive hashes and usable recovery evidence remain available. Persist metadata privately.
3. In the explicitly verified staging SQL session, set mfd.c01.target_ref='gngnrmzeghjzqsmzuktl' and mfd.c01.exposed_schemas='public,graphql_public' only after verification. Execute the complete approved file with its own transaction and all guards. Do not replay installers, use a generic linked db push, selectively skip statements, change provider role privileges or repair migration history implicitly.
4. On error, ROLLBACK and stop. Do not weaken guards, RLS, OAuth restrictions, TLS or ownership boundaries. A post-COMMIT incident requires a reviewed forward repair or separately approved recovery operation; do not restore these archives over a live hosted database automatically.
5. After success, repeat read-only catalog/ACL/policy/bucket/default inspection and advisors. Verify all intended new objects, all nine new storage policies plus the preserved OAuth restriction, private bucket limits/MIME types, restricted application privileges, unchanged provider/global defaults and active resource/settings. Both writes must remain false.
6. Verify actual private/Auth schema rejection through the Data API after creation and record migration provenance through the approved process. Stop before accounts, OAuth/hooks/clients, write enablement, source commit/push, publication or further hosted tests; those are separately scoped.

**Stopped after backup/recovery verification. The application-scoped recovery option is verified and usable; full platform completeness is not claimed. No hosted migration is authorized or executed.**
