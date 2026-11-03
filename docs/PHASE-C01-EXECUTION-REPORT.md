# Phase C.0.1 — Approved staging migration execution

Date: 2026-10-27 (Europe/Berlin). **Migration committed successfully once; post-migration verification passed.** Completed at approximately 21:18:50 CET (20:18:50 UTC). Work stopped at C.0.1; Phase C.1 has not begun.

Only project `gngnrmzeghjzqsmzuktl` was queried or modified. No production connection, hosted user/client creation, OAuth activation, MCP write enablement, Site publication, deployment, frontend change, commit, push, merge or paid resource occurred. No backup was deleted or restored over hosted state.

## Authorization and provenance

- Project: MFD OAuth Phase 2 Testing, eu-central-1, ACTIVE_HEALTHY, PostgreSQL 17.11.0.003.
- Branch: `staging/mfd-oauth-testing`; repository HEAD `af8e4149cf3bee6de3c90e14bfb74dea92d556e9`. Existing uncommitted B/B.1/C.0.1 work remains; index empty. No new source commit was created.
- Exact approved file: `supabase/migrations/20261027173539_staging_mfd_c01_remediation.sql`.
- **SHA-256: `db296a6263e4596cc64f2a0f678000d4ef25ee0892d818c8782e60b671953da5`.** File remained unchanged.
- User explicitly authorized execution conditional on all safety gates and accepted the documented application-scoped recovery limitations. Immediately before execution, the user reconfirmed the saved/current exact Data API allowlist and disabled automatic exposure.
- Execution used PostgreSQL 17.11 psql through the supplied Session pooler with verify-full and the dashboard-downloaded CA. Credentials were handled automatically by libpq; `.pgpass` contents were not read/displayed by the agent.
- The runner checked the approved bytes/checksum immediately before sending them unchanged, preceded only by the two reviewed session assertions. One outer BEGIN/COMMIT, every guard and the final catalog assertion were retained. Exit status 0 and final COMMIT command were confirmed. **Attempts: 1; no retry or modified SQL.**
- This direct SQL execution did not insert or repair Supabase migration-history entries. This report, exact checksum and private execution evidence document provenance; no generic db push or installer replay occurred.

## Final preflight results

| Gate | Result | Evidence |
| --- | --- | --- |
| Project/host mapping | PASS | Connected only through aws-1-eu-central-1.pooler.supabase.com:5432, database postgres, username postgres.gngnrmzeghjzqsmzuktl; authenticated database/role postgres, expected staging resource. Independent project metadata matched exact ref and database host. |
| TLS / execution role | PASS | verify-full chain/hostname verification; postgres non-superuser, no supabase_admin membership. Required database/schema/Auth reference/bucket DML authority established. |
| Exact file/checksum | PASS | Matched required hash; correct branch; source bytes unchanged. |
| Backup integrity/recovery acceptance | PASS | Both archives read-checked, exact preserved hashes matched and prior actual local restore result PASS. User accepted partial platform scope. |
| Data API configuration | PASS — current user dashboard evidence | Exactly public and graphql_public; no other exposed schemas; automatic exposure disabled and saved. SQL session does not independently expose the complete dashboard setting. |
| Private/Auth schema exclusion | PASS | Excluded by the complete user-confirmed allowlist; fresh post-creation REST rejection verified below. |
| Both write switches | PASS | Site runtime revision 1 MFD_MCP_WRITES=false and database writes_enabled=false, correct staging resource. |
| Storage delegated policy authority | PASS | Existing registered supautils.policy_grants permits postgres on objects and buckets; ownership remains supabase_storage_admin. No new delegation or role assumption. |
| Catalog/security baseline drift | PASS | All 11 application catalog/data snapshot sections and reviewed preflight tables/columns/policies/indexes/schemas/functions/default ACLs/settings/buckets matched the verified backup baseline, with array ordering canonicalized only. No unexpected objects/security drift. |
| Existing function definitions/ownership/ACLs | PASS | Baseline hashes/modes/search_path/ownership/ACLs matched captured source; full migration prerequisites retained. |
| Execution decision | PASS | All required gates passed before the sole attempt. |

## Database changes applied

The exact reviewed migration added:

- Schemas `mfd_private` and `mfd_observability`.
- Ten public application tables: mfd_profiles, mfd_friendships, mfd_blocks, mfd_social_workouts, mfd_messages, mfd_reactions, mfd_catalogue, mfd_catalogue_reports, mfd_workout_photos and mfd_catalogue_photos; plus mfd_observability.sync_totals.
- Eight functions, including forma_save_workspace_v2, the fixed metrics helpers, private trigger functions, friendship helper and catalogue validation. Five triggers and seventeen named indexes plus fourteen constraint indexes.
- Thirty-nine ordinary application/storage policies and ten restrictive OAuth policies. Nine new storage policies were added while preserving the existing restrictive storage OAuth policy.
- Three private buckets with exact reviewed limits/MIME types and two aggregate-counter seed rows. No users, workspace data, clients, grants or proposals were seeded.
- Explicit application-function EXECUTE restrictions and grants, new-table RLS, required DML/column grants, removal of authenticated/PUBLIC/anon TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on application tables, and scoped postgres application-schema default restrictions.
- The staging MCP resource column **default** was corrected. The active settings row/resource/write switch was not changed. No workspace backfill or existing payload rewrite occurred.

No global default privileges or provider-role defaults were changed. Existing MCP dispatcher/hook and old save function were prerequisites and were not replaced. No scheduled cleanup job or extension was installed.

## Post-migration verification

| Check | Result | Evidence |
| --- | --- | --- |
| Exact final catalog readback | PASS | Independent read-only digest `086a87995f52cf1a0b7e44fb904b7575`, identical to the approved final assertion. Scoped inventory: 61 columns, 54 constraints, 32 indexes, 55 policies, 8 new functions, 5 triggers, 3 buckets. |
| Schema/table ownership and RLS | PASS | Two new schemas; 16 total application/MCP tables including existing four MCP tables/workspace. Every table postgres-owned with RLS enabled. |
| Least privilege | PASS | Zero public application tables grant authenticated TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. No direct anon/authenticated table access in MCP/private/observability schemas. Required function/column access remains in the verified catalog. |
| OAuth restrictions | PASS | Ten new restrictive table policies with USING/WITH CHECK; existing workspace restriction retained; existing storage mcp_no_direct_access retained as restrictive. No restrictive policy was removed. |
| Storage policies | PASS | Exactly ten storage.objects policies: nine approved additions plus the existing restrictive OAuth policy. Exact roles, commands and predicates match the final catalog. |
| Bucket privacy/configuration | PASS | All three private; mfd-avatars JPEG 1 MiB; mfd-workout-photos JPEG 2 MiB; catalogue-photos JPEG/PNG/WebP 2 MiB. Exact settings included in verified digest. |
| Private/Auth Data API rejection | PASS | After creation, mfd_mcp, mfd_private, mfd_observability and auth each returned HTTP 406/PGRST106 to zero-row Accept-Profile probes. Nonexistent control also rejected. No user session or write used. |
| Active staging settings/write switch | PASS | Complete settings-row data unchanged; correct staging /mcp resource; DB writes=false. Stored Worker/application runtime re-read as false, revision unchanged. |
| Provider-managed privileges | PASS, scoped metadata | Before/after role attributes, role memberships, provider/out-of-scope defaults, Storage table ownership/ACL/RLS and delegation metadata identical. No global default-ACL rows exist; source baseline also had none. Managed role privileges were not changed by SQL. |
| Existing data preservation | PASS | Workspace count remains 0; settings row unchanged; Auth users/sessions, native OAuth clients, MCP clients/grants/proposals all remain 0. No hosted account data or mutation test was introduced. |
| Backup preservation | PASS | Both archive hashes unchanged; backup and private evidence retained. No hosted restore invoked. |
| Security advisor | PASS with INFO findings | No WARN/ERROR in response; three intentional no-policy private-table INFO findings detailed below. |
| Performance advisor | PASS with INFO findings | No WARN/ERROR in response; 16 unused-index INFO findings in empty/new staging database. No indexes removed. |
| Local regressions | PASS | Fresh 32/32 local files passed, including database/RLS, MCP security and migration/preflight suites. |
| Hosted OAuth/account-isolation behavior | NOT VERIFIED — out of phase | No accounts, tokens, consent flows, RPC write probes or live OAuth integration tested. |
| Full platform recovery | NOT VERIFIED / outside accepted scope | Application backup/local restore is verified; provider-managed operational data/configuration/secrets are excluded as accepted by the user. |

### Security and performance findings

The security advisor reports [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for mfd_mcp.grants, mfd_mcp.proposals and mfd_observability.sync_totals. All three have RLS and no direct client table privileges. Their access is through reviewed dispatcher/helper/service paths. This is intentional deny-by-default behavior, not justification to add broad client policies. Advisor level is INFO, not a complete security certification.

The performance advisor reports [16 unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): the two MCP proposal indexes; friendship recipient/sender; block target; social started; message recipient/sender/expiry; reaction workout; catalogue creator/kind; report item/reporter; catalogue-photo item/owner. Empty/new tables have no representative workload. Keep the indexes; evaluate later with real staging workload rather than removing them to clear an INFO notice.

No confirmed authorization defect or WARN/ERROR was reported by these checks. Local Alice/Bob isolation tests pass, but do not replace future approved hosted account-isolation and token-lifecycle acceptance.

### Local test results

All 32 files passed:

```text
app-cache, app-update-safety, auth-security, barcode-compatibility,
bridge-performance, catalogue, database-rls, day-selection,
exercise-replacement, food-actions, food-summary,
hosting-dependency-compatibility, image-safety, legacy-events,
mcp-database, mcp-server, metrics-endpoint, muscle-stats,
nutrition-preferences, routine-overview, security, server-security,
set-logging, social-refresh, staging-artifacts, staging-isolation,
staging-remediation, store-performance, sync-performance,
workout-clock, workout-limit, workspace-merge
```

These are the existing .cjs local suites, using synthetic fixtures. No frontend/Worker deployment or production build change was made. Earlier build/type/lint results were not relabeled as new execution-phase checks.

## Evidence, rollback and remaining risks

Private execution evidence:

`/Users/prasanthnammi/MFD-Staging-Backups/gngnrmzeghjzqsmzuktl-20261027T200208Z/execution-20261027T201547Z`

Contains pre/post read-only metadata, baseline/provider comparisons, exact execution result/output, advisor responses, local regression results, runners and an execution SHA-256 manifest. Evidence files are 0600 in a 0700 directory. Archive checksums and scope remain in [the recovery report](PHASE-C01-EXECUTION-READINESS.md). Backup contents/credentials were not posted or committed.

No rollback was required: the migration committed, final assertion passed and post-verification succeeded. No automatic retry or compensating DDL occurred. Since COMMIT completed, any later incident requires a separately reviewed forward repair or expressly approved scoped recovery; this report does not authorize overwriting a hosted database. Verified application backup and all local clusters remain retained. Full-platform recovery and at-rest encryption/FileVault status remain outside the verified backup scope.

Other limits remain: no native OAuth activation/hook/client/signing/redirect acceptance; no hosted Alice/Bob/API/storage/concurrency tests; no physical cleanup/backfill installed; no deployment/private Site MCP transport acceptance. Global PUBLIC EXECUTE defaults remain unchanged, so future MFD functions still require transactional explicit revocation/grants and tests. The previously accepted development-only dependency advisory is not remediated by this database phase.

## Phase C.1 readiness and stop boundary

**The staging database remediation is complete and ready for separately approved Phase C.1 planning/integration work.** This is not OAuth or production-readiness sign-off. Private Site transport, hosted Auth settings and the exact next account/client/callback/hook/token-lifecycle test scope still require review and explicit authorization. The Site remains unpublished by this work; no Auth/OAuth configuration was changed.

Stop here. Do not enable OAuth, register clients, create users, enable either write switch, publish, deploy, commit, push or proceed to C.1 without the user's explicit next approval.
