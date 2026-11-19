#!/usr/bin/env bash
# Database tests, locally and in CI: Postgres 17 + PostgREST 12 in Docker with Supabase stand-ins.
# Loads the schema as production has it, then the new SQL, then runs every SQL test, the
# JavaScript/SQL equivalence proof, the sync engine end to end, and a compaction rehearsal.
set -euo pipefail
cd "$(dirname "$0")/../.."
DBC=mfd-test-db RESTC=mfd-test-rest NET=mfd-test
docker rm -f $DBC $RESTC >/dev/null 2>&1 || true
docker network create $NET >/dev/null 2>&1 || true
docker run -d --name $DBC --network $NET -e POSTGRES_PASSWORD=test postgres:17 >/dev/null
until docker exec $DBC pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
run_sql(){ docker exec -i $DBC psql -U postgres -X -v ON_ERROR_STOP=1 -q -At "$@"; }
run_sql < database/tests/supabase-stubs.sql >/dev/null
for f in schema shared-catalogue catalogue-photos social social-photos private-exercises private-photo-metadata sync-observability; do grep -v "create extension if not exists pg_cron" database/$f.sql | run_sql >/dev/null; done
# Production-shaped diaries written before the new SQL, to rehearse the compaction migration.
node tests/fixtures/prod-shape-seed.cjs | run_sql >/dev/null
for f in social-incremental social-comments workspace-delta social-push social-push-friends; do run_sql < database/$f.sql >/dev/null 2>&1 || { run_sql < database/$f.sql; exit 1; }; done
# Weekly encrypted backup (needs pgcrypto in the "extensions" schema, as on Supabase).
run_sql -c "create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;" >/dev/null
run_sql < database/backup/backup.sql >/dev/null
docker run -d --name $RESTC --network $NET -p 127.0.0.1:54330:3000 -e PGRST_DB_URI=postgres://authenticator:test@$DBC:5432/postgres -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=local-test-secret-local-test-secret-123 postgrest/postgrest:v12.2.3 >/dev/null
# Compaction migration: verified, and repeatable.
run_sql < database/workspace-compact-migration.sql 2>&1 | grep -o "Compaction verified.*"
run_sql < database/workspace-compact-migration.sql 2>&1 | grep -o "Compaction verified.*" >/dev/null
for t in database/tests/*.sql; do case "$t" in *supabase-stubs.sql) continue;; esac; out=$(run_sql < "$t" 2>&1) || { echo "$t"; echo "$out"; exit 1; }; echo "$out" | grep -o "PASS.*"; done
until curl -sf http://127.0.0.1:54330/ >/dev/null; do sleep 1; done
export MFD_TEST_DOCKER=$DBC MFD_TEST_REST=http://127.0.0.1:54330
node tests/workspace-ops-equivalence.cjs
node tests/delta-sync-e2e.cjs
[ "${KEEP:-}" = 1 ] || docker rm -f $DBC $RESTC >/dev/null
