#!/usr/bin/env bash
# Load test of the diary database (not part of CI; needs Docker). Synthetic people only, never production data.
#   database/load/run.sh setup [people]   a database like production (Postgres 17, JIT off, max 60 connections,
#                                         CPU and memory limited like a small Supabase instance), filled and switched
#   database/load/run.sh bench            every scenario, as many phones at once; prints speed and waiting times
#   database/load/run.sh stop
# CPUS / MEM / SECS / CLIENTS change the limits, the length of each run and the phones at once.
set -euo pipefail
cd "$(dirname "$0")/../.."
DBC=mfd-load; CPUS=${CPUS:-1}; MEM=${MEM:-1g}; SECS=${SECS:-30}; CLIENTS=${CLIENTS:-10}
run_sql(){ docker exec -i $DBC psql -U postgres -X -v ON_ERROR_STOP=1 -q -At "$@"; }

setup(){
  local people=${1:-100}
  docker run -d --rm --name $DBC --cpus="$CPUS" --memory="$MEM" -e POSTGRES_PASSWORD=test postgres:17 \
    -c jit=off -c max_connections=60 -c shared_buffers=128MB -c work_mem=4MB >/dev/null
  until docker exec $DBC pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
  run_sql < database/tests/supabase-stubs.sql >/dev/null
  run_sql -c "create or replace function auth.jwt() returns jsonb language sql stable as \$\$select coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb\$\$;
    create role supabase_auth_admin; create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table auth.refresh_tokens(id bigserial primary key,session_id uuid,user_id varchar(255),revoked boolean);" >/dev/null
  for f in schema shared-catalogue catalogue-photos social social-photos private-exercises private-photo-metadata sync-observability; do grep -v "create extension if not exists pg_cron" database/$f.sql | run_sql >/dev/null; done
  for f in social-incremental social-comments workspace-delta social-push social-push-friends; do run_sql < database/$f.sql >/dev/null 2>&1; done
  run_sql -c "create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;" >/dev/null
  run_sql < database/production/mcp-production.sql >/dev/null 2>&1
  for f in mcp-suggest-targets mcp-start-workout mcp-recovery mcp-ai-logging mcp-routine-edit; do run_sql < database/$f.sql >/dev/null 2>&1; done
  for f in diary/01-foundation diary/02-library diary/03-training diary/04-catalogue diary/05-fill-training diary/06-nutrition diary/07-fill-nutrition diary/08-body \
           diary/09-fill-body diary/10-account diary/11-fill-account diary/12-read mcp-read-tables diary/13-save-rows diary/14-apply-training diary/15-tables-switch \
           diary/16-everyone-3 mcp-routine-folders; do
    run_sql < database/$f.sql >/dev/null 2>&1 || { echo "install $f failed"; run_sql < database/$f.sql 2>&1 | grep -v NOTICE | tail -3; exit 1; }
  done
  local t0=$SECONDS
  node database/load/seed.cjs "$people" | run_sql >/dev/null
  echo "filled $people people in $((SECONDS - t0)) s"; t0=$SECONDS
  run_sql -c "do \$\$declare u uuid; begin for u in select id from lt_people order by n loop perform diary.move_to_tables(u); perform diary.move_areas(u); end loop; end\$\$;" >/dev/null
  echo "moved everyone to the tables in $((SECONDS - t0)) s"
  # Per person: a running-workout template (their latest workout, sets not done) and a routine to edit.
  run_sql -c "alter table lt_people add column act jsonb, add column routine jsonb;
    update lt_people p set act = (select w || jsonb_build_object('id', 'act-' || p.n, 'finished', null, 'started', (extract(epoch from now()) * 1000)::bigint,
        'sets', (select jsonb_agg(s || '{\"done\": false}') from jsonb_array_elements(w->'sets') s))
      from (select diary.workout_json(x) w from diary.workouts x where x.user_id = p.id and x.ended_at is not null order by x.started_at desc limit 1) z),
      routine = diary.plans_doc(p.id)->'routines'->0;
    analyze;" >/dev/null
  run_sql -c "select count(*) || ' people, ' || (select count(*) from diary.workouts) || ' workouts, ' || (select count(*) from diary.workout_sets) || ' sets, ' ||
    (select count(*) from diary.food_entries) || ' food entries; database ' || pg_size_pretty(pg_database_size(current_database())) ||
    ', diary tables ' || (select pg_size_pretty(sum(pg_total_relation_size(c.oid))) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'diary') from lt_people"
}

# One scenario: name, phones at once, person range (lo hi), script@weight...
bench_one(){
  local name=$1 clients=$2 lo=$3 hi=$4; shift 4
  local files=(); for f in "$@"; do files+=(-f "/load/${f%@*}.pgb@${f#*@}"); done
  docker exec $DBC sh -c "rm -f /tmp/lt.*"
  local out; out=$(docker exec $DBC pgbench -U postgres -n -c "$clients" -j "$(( clients < 4 ? clients : 4 ))" -T "$SECS" -D lo="$lo" -D hi="$hi" -l --log-prefix=/tmp/lt "${files[@]}" postgres 2>&1) || { echo "$name failed"; echo "$out" | tail -5; return; }
  local tps; tps=$(echo "$out" | grep -o 'tps = [0-9.]*' | head -1 | cut -d' ' -f3)
  local fails; fails=$(echo "$out" | grep -o 'number of failed transactions: [0-9]*' | head -1 | grep -o '[0-9]*$' || echo 0)
  docker exec $DBC sh -c "cat /tmp/lt.*" | awk '{print $3/1000}' | sort -n | awk -v name="$name" -v c="$clients" -v tps="$tps" -v f="${fails:-0}" '{ms[NR]=$1} END {n=NR; printf "%-34s %3d phones  %7.1f per s  p50 %6.0f ms  p95 %6.0f ms  p99 %6.0f ms  max %6.0f ms  failed %s\n", name, c, tps, ms[int(n*0.5)+1], ms[int(n*0.95)+1], ms[int(n*0.99)+1], ms[n], f}'
}

bench(){
  docker cp database/load/. $DBC:/load >/dev/null
  local n; n=$(run_sql -c "select count(*) from lt_people"); local xlo; xlo=$(run_sql -c "select min(n) from lt_people where size = 'extreme'")
  echo "== One kind of action at a time (everyone, $CLIENTS phones at once, ${SECS} s each)"
  for s in tick meal finish routine pull full ai stale; do bench_one "$s" "$CLIENTS" 1 "$n" "$s@1"; done
  echo "== A realistic mix (60% ticks, 15% checks, 10% meals, 5% finishes, 5% routines, 3% full downloads, 2% AI reads)"
  for c in 1 5 10 20 40 55; do bench_one "mix" "$c" 1 "$n" tick@60 pull@15 meal@10 finish@5 routine@5 full@3 ai@2; done
  echo "== Edge: only the biggest diaries (1100 workouts)"
  for s in tick finish pull full ai; do bench_one "extreme $s" 5 "$xlo" "$n" "$s@1"; done
  echo "== Edge: 10 phones of ONE person at once (conflicts expected and fine)"
  bench_one "one person, 10 phones" 10 1 1 tick@1
}

case "${1:-}" in
  setup) setup "${2:-100}";;
  bench) bench;;
  stop) docker stop $DBC >/dev/null;;
  *) echo "usage: $0 setup [people] | bench | stop"; exit 1;;
esac
