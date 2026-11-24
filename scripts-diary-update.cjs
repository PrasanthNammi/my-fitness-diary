// Writes ~/Downloads/mfd-db-update-<n>.sql: fixes found by the side-by-side check (2026-11-18), for the database
// installed on 2026-11-17. One transaction (all or nothing), safe to run again. Update 1:
//   03-training.sql   routine names may repeat (the app allows it; a one-name rule refused a save that swapped two
//                     names) and each exercise in a workout keeps the tracking it was logged with;
//   05-fill-training  fills that tracking;
//   06-nutrition.sql  food entries keep their values exactly (no rounding to 0.01);
//   12-read.sql       reading the diary back from the tables (new; used by the check and, later, the readers).
// Update 2: 06-nutrition.sql again, food labels keep their values exactly (salt 0.125 was stored as 0.13).
// Update 3: 11-fill-account.sql, the date of birth (MFD 3.0 pop-up) is copied into user_profiles.birth_date.
// Update 4: database/mcp-read-tables.sql, MFD 3.0 per person (diary.mfd3_people, mfd3_enabled, connector reads).
// Then every diary is copied again (only rows that change are written) and a short report is shown.
// Update 5: the database move for training (02, 03, 05, 12, 13, 14, 15), then a check that every diary's training
// comes back exactly (the whole update is undone otherwise).
// Update 6: the database move for food, body and settings (07, 09, 11, 12, 14, 15), then a check that every diary's
// food, body and settings come back exactly (undone otherwise). Moving people is a separate file (mfd-move-areas.sql).
// Update 7: 14-apply-training, saves during a workout no longer rebuild every workout (plans read on their own).
// Update 8: 05, 07, 09, each save's scratch tables are measured (analyze) so saves don't read every person's rows.
// Update 9: 12, 14, 15, workouts rebuilt in one pass, saves redo only the areas (and meals) they change, 25 MB saves.
// Update 10: Cycle & Health (17-cycle, with 12 and 14 that read and save it, and database/mcp-cycle.sql for the AI
// permission). Every diary must come back exactly as before (checked against a fingerprint taken first; undone otherwise).
// Update 11: database/account-delete.sql (Delete account) and the 8 Nov safety copies dropped.
// Usage: node scripts-diary-update.cjs [update number, default 10] [out-file]
const fs = require('fs'), os = require('os'), path = require('path');
const strip = (sql) => sql.split('\n').filter((l) => !/^\s*(begin|commit);\s*$/i.test(l)).join('\n');
const part = (f) => strip(fs.readFileSync(path.join(__dirname, f.includes('/') ? f : 'database/diary/' + f + '.sql'), 'utf8'));

const updates = {
  1: { title: 'update 1 (2026-11-18): routine names may repeat, tracking as logged, food entries exact', parts: ['03-training', '05-fill-training', '06-nutrition', '12-read'],
       fills: ['fill_training', 'fill_nutrition'],
       after: `-- The two notes from the refused routine-name swap (2026-11-18 06:50) are resolved by this update.
delete from diary.fill_problems where kind = 'error' and detail like '%routines_name%';
select (select count(*) from diary.workout_exercises where tracking is not null) as exercises_with_tracking,
       (select count(*) from diary.food_entries where deleted_at is null) as food_entries,
       (select count(*) from diary.fill_problems) as problems_left;` },
  2: { title: 'update 2 (2026-11-18): food labels keep their values exactly', parts: ['06-nutrition'], fills: ['fill_nutrition'],
       after: `select (select count(*) from diary.foods where user_id is not null and deleted_at is null) as foods,
       (select count(*) from diary.foods where salt_g <> round(salt_g, 2) or fat_g <> round(fat_g, 2) or sugars_g <> round(sugars_g, 2)) as labels_with_more_than_2_decimals,
       (select count(*) from diary.fill_problems) as problems_left;` },
  3: { title: 'update 3 (2026-11-18): the date of birth from MFD 3.0\'s pop-up is copied into the profile', parts: ['11-fill-account'], fills: ['fill_account'],
       after: `select (select count(*) from diary.user_profiles) as profiles, (select count(*) from diary.user_profiles where birth_date is not null) as with_birth_date,
       (select count(*) from diary.fill_problems) as problems_left;` },
  4: { title: 'update 4 (2026-11-18): MFD 3.0 switched on per person (empty list = nobody; the AI connector reads the tables for people on the list)',
       parts: ['database/mcp-read-tables.sql'], fills: [],
       after: `select (select count(*) from diary.mfd3_people) as people_with_3_0,
       (select count(*) from pg_proc where proname = 'mfd3_enabled') as app_check_installed,
       (select count(*) from pg_proc p where p.proname in ('dispatch', 'recovery', 'routines_out') and pg_get_functiondef(p.oid) like '%mfd_mcp.read_doc(%') as connector_reads_switched;` },
  5: { title: 'update 5 (2026-11-20): the database move, training (step 2a exact round trip + step 2b per-person switch; nobody switched yet)',
       parts: ['02-library', '03-training', '05-fill-training', '12-read', '13-save-rows', '14-apply-training', '15-tables-switch'], fills: ['fill_training'],
       after: `-- Every diary's training must come back exactly from the tables; otherwise this whole update is undone.
do $exact$ declare r record; k text; bad text := ''; begin
  for r in select f.user_id, f.payload p, diary.training_json(f.user_id) t from public.forma_workspaces f loop
    foreach k in array diary.training_keys() loop
      if r.p ? k and (r.p->k) is distinct from (r.t->k) and not (k = 'active' and r.p->k = 'null'::jsonb and r.t->k = 'null'::jsonb) then
        bad := bad || left(r.user_id::text, 8) || ':' || k || ' '; end if;
    end loop;
  end loop;
  if bad <> '' then raise exception 'Not exact, nothing was changed: %', bad; end if;
end $exact$;
select (select count(*) from public.forma_workspaces) as diaries, 'ALL EXACT' as training,
       (select count(*) from pg_proc where proname in ('forma_save_changes', 'forma_workspace_full')) as app_calls_installed,
       (select count(*) from diary.table_people) as switched_people,
       (select count(*) from diary.fill_problems) as problems_left;` },
  6: { title: 'update 6 (2026-11-20): the database move, food, body and settings (installed and checked; nobody moved yet; new accounts start in the tables)',
       parts: ['07-fill-nutrition', '09-fill-body', '11-fill-account', '12-read', '14-apply-training', '15-tables-switch'], fills: [],
       after: `-- Every diary's food, body and settings must come back exactly from the tables (with their small patches);
-- otherwise this whole update is undone. (Rows refilled from each stored diary; nothing is moved yet.)
do $exact$ declare r record; keys text[]; doc jsonb; bad text := ''; begin
  for r in select user_id, payload p from public.forma_workspaces loop
    select array_agg(k) into keys from unnest(diary.area_keys()) k where r.p ? k;
    select coalesce(jsonb_object_agg(k, r.p->k), '{}') into doc from unnest(coalesce(keys, '{}')) k;
    perform diary.set_areas(r.user_id, doc);
    if diary.area_values(r.user_id, keys) is distinct from doc then bad := bad || left(r.user_id::text, 8) || ' '; end if;
  end loop;
  if bad <> '' then raise exception 'Not exact, nothing was changed: %', bad; end if;
end $exact$;
select (select count(*) from public.forma_workspaces) as diaries, 'ALL EXACT' as food_body_settings,
       (select count(*) from diary.doc_patches) as small_patches,
       (select count(*) from pg_proc p where p.oid in (to_regprocedure('mfd_mcp.suggest(jsonb)'), to_regprocedure('mfd_mcp.dispatch(text,jsonb)'),
          to_regprocedure('mfd_mcp.change_settings(jsonb)'), to_regprocedure('mfd_mcp.recent_ai_entries(uuid,text)')) and pg_get_functiondef(p.oid) like '%diary.full_payload(%') as ai_writers_changed,
       (select count(*) from pg_trigger where tgname = 'diary_9_switch_new') as new_accounts_switch,
       (select count(*) from diary.table_people where areas) as moved_people,
       (select count(*) from diary.fill_problems) as problems_left;` },
  7: { title: 'update 7 (2026-11-23): fast saves during a workout (plans read on their own, not via a rebuild of every workout)',
       parts: ['14-apply-training'], fills: [],
       after: `-- The plans built the fast way must be exactly the plans of the full rebuild, for every diary; otherwise undone.
do $same$ declare r record; bad text := ''; begin
  for r in select user_id from public.forma_workspaces loop
    if diary.plans_doc(r.user_id) is distinct from (select jsonb_build_object('folders', t->'folders', 'routines', t->'routines', 'mfdExercises', t->'mfdExercises')
                                                   from (select diary.training_json(r.user_id) t) x) then bad := bad || left(r.user_id::text, 8) || ' '; end if;
  end loop;
  if bad <> '' then raise exception 'Not identical, nothing was changed: %', bad; end if;
end $same$;
select (select count(*) from public.forma_workspaces) as diaries, 'IDENTICAL' as plans,
       (select count(*) from pg_proc where proname = 'plans_doc' and prosrc not like '%training_json%') as fast_plans_installed,
       (select count(*) from diary.fill_problems) as problems_left;` },
  8: { title: 'update 8 (2026-11-23): saves stay fast as the number of people grows (scratch tables measured before use)',
       parts: ['05-fill-training', '07-fill-nutrition', '09-fill-body'], fills: [],
       after: `select (select count(*) from public.forma_workspaces) as diaries,
       (select count(*) from pg_proc where proname in ('fill_training', 'fill_nutrition', 'fill_body') and prosrc like '%analyze _%') as fills_measuring_their_scratch_tables,
       (select count(*) from diary.fill_problems) as problems_left;` },
  9: { title: 'update 9 (2026-11-23): faster full downloads, AI reads and meal saves; diaries in the tables may be up to 25 MB',
       parts: ['12-read', '14-apply-training', '15-tables-switch'], fills: [],
       after: `-- Every diary must rebuild exactly as before (workouts built in one pass = built one by one); otherwise undone.
do $same$ declare r record; bad text := ''; begin
  for r in select user_id, payload from public.forma_workspaces loop
    if diary.sessions_json(r.user_id) is distinct from (select coalesce(jsonb_agg(diary.workout_json(w) order by diary.pos(w.extra), w.started_at, w.id), '[]')
         from diary.workouts w where w.user_id = r.user_id and w.deleted_at is null and w.ended_at is not null)
       or diary.full_payload(r.user_id, r.payload) is null then bad := bad || left(r.user_id::text, 8) || ' '; end if;
  end loop;
  if bad <> '' then raise exception 'Not identical, nothing was changed: %', bad; end if;
end $same$;
select (select count(*) from public.forma_workspaces) as diaries, 'IDENTICAL' as rebuilt,
       (select count(*) from pg_proc where proname in ('sessions_json', 'area_part', 'area_needs')) as new_parts,
       (select count(*) from pg_proc p where p.proname in ('forma_save_workspace_v2', 'forma_save_workspace') and pg_get_functiondef(p.oid) like '%17000000%') as bigger_saves,
       (select count(*) from diary.fill_problems) as problems_left;` },
  10: { title: 'update 10 (2026-11-23): Cycle & Health (private tables, saves and reads, and the AI permission "cycle"); every diary stays exactly the same',
       before: `-- A fingerprint of every diary before the update (a real table: the SQL editor may drop temporary ones).
drop table if exists diary._update10_before;
create table diary._update10_before as select user_id, md5(diary.full_payload(user_id, payload)::text) h, md5(diary.as_envelope(user_id)::text) e from public.forma_workspaces;`,
       parts: ['12-read', '14-apply-training', '17-cycle', 'database/mcp-cycle.sql'], fills: [],
       after: `-- Every diary (and the AI connector's view of it) must be exactly as before; otherwise the whole update is undone.
do $same$ declare bad text; begin
  select string_agg(left(b.user_id::text, 8), ' ') into bad from diary._update10_before b join public.forma_workspaces w using (user_id)
    where md5(diary.full_payload(w.user_id, w.payload)::text) is distinct from b.h or md5(diary.as_envelope(w.user_id)::text) is distinct from b.e;
  if bad is not null then raise exception 'Not identical, nothing was changed: %', bad; end if;
end $same$;
-- The scratch table goes before the report: the Supabase SQL editor may run the last query again to show its result,
-- so the report must only read permanent things (update 10's report failed this way on 2026-11-24, after applying).
drop table diary._update10_before;
select (select count(*) from public.forma_workspaces) as diaries, 'IDENTICAL' as rebuilt,
       (select count(*) from information_schema.tables where table_schema = 'diary' and table_name in ('cycle_settings', 'cycle_days', 'medications', 'medication_doses', 'lab_results', 'health_conditions')) as cycle_tables,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'diary' and c.relrowsecurity and c.relname in ('cycle_settings', 'cycle_days', 'medications', 'medication_doses', 'lab_results', 'health_conditions')) as with_row_security,
       (select count(*) from pg_proc where proname = 'mfd_mcp' and pg_get_functiondef(oid) like '%mfd_mcp.cycle(args)%') as ai_router_has_cycle,
       (select count(*) from diary.fill_problems) as problems_left;` },
  11: { title: 'update 11 (2026-11-24): Delete account (Settings → Account), and the old safety copies from 8 Nov are removed',
       parts: ['database/account-delete.sql'], fills: [],
       after: `-- The old safety copies from the 8 Nov compaction (every diary is verified in the new tables; nightly encrypted
-- backups exist). The 20 Nov move copies (diary.moved_payloads) stay until they are 30 days old.
do $old$ declare t text; begin
  for t in select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'mfd_private' and c.relkind = 'r' and (c.relname like 'backup\\_20261108\\_%' or c.relname = 'workspaces_before_compaction') loop
    execute 'drop table ' || t;
  end loop;
end $old$;
select (select count(*) from pg_proc where proname = 'mfd_delete_account') as delete_account_installed,
       (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'mfd_catalogue' and column_name = 'creator_id') as shared_items_can_be_anonymous,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'mfd_private' and (c.relname like 'backup\\_20261108\\_%' or c.relname = 'workspaces_before_compaction')) as old_copies_left,
       (select count(*) from public.forma_workspaces) as diaries;` },
  12: { title: 'update 12 (2026-11-25): Cycle & Health "Right now" (estimates paused on hormonal contraception, in pregnancy or while breastfeeding); every diary stays exactly the same',
       before: `-- A fingerprint of every diary before the update (a real table: the SQL editor may drop temporary ones).
drop table if exists diary._update12_before;
create table diary._update12_before as select user_id, md5(diary.full_payload(user_id, payload)::text) h, md5(diary.as_envelope(user_id)::text) e from public.forma_workspaces;`,
       parts: ['17-cycle'], fills: [],
       after: `-- Every diary (and the AI connector's view of it) must be exactly as before; otherwise the whole update is undone.
do $same$ declare bad text; begin
  select string_agg(left(b.user_id::text, 8), ' ') into bad from diary._update12_before b join public.forma_workspaces w using (user_id)
    where md5(diary.full_payload(w.user_id, w.payload)::text) is distinct from b.h or md5(diary.as_envelope(w.user_id)::text) is distinct from b.e;
  if bad is not null then raise exception 'Not identical, nothing was changed: %', bad; end if;
end $same$;
-- The scratch table goes before the report (the SQL editor may run the last query again to show it).
drop table diary._update12_before;
select (select count(*) from public.forma_workspaces) as diaries, 'IDENTICAL' as rebuilt,
       (select count(*) from information_schema.columns where table_schema = 'diary' and table_name = 'cycle_settings' and column_name in ('pause', 'pause_since', 'pause_until')) as pause_columns,
       (select count(*) from pg_proc where proname = 'cycle_part' and pg_get_functiondef(oid) like '%pauseSince%') as reads_pause,
       (select count(*) from diary.fill_problems) as problems_left;` },
};
const n = Number(process.argv[2] || 10), u = updates[n];
if (!u) throw new Error('Unknown update ' + n);
const out = `-- MFD 3.0 database, ${u.title}. Paste all of it into the Supabase SQL editor (project Forma) and press Run.
-- All or nothing; safe to run again; the app keeps working throughout.
-- Generated by scripts-diary-update.cjs from ${u.parts.map((f) => (f.includes('/') ? f : 'database/diary/' + f + '.sql')).join(', ')}.
begin;
${u.before ?? ''}
${u.parts.map(part).join('\n')}
-- Copy every diary again so the fixes take effect (MERGE writes only rows that change).
do $fill$ declare u uuid; begin
  for u in select user_id from public.forma_workspaces loop
    ${u.fills.map((f) => `perform diary.${f}(u);`).join(' ') || 'null;'}
  end loop;
end $fill$;
${u.after}
commit;
`;
const file = process.argv[3] || path.join(os.homedir(), 'Downloads', `mfd-db-update-${n}.sql`);
fs.writeFileSync(file, out);
console.log(`${file}: ${(out.length / 1024).toFixed(0)} KB`);
