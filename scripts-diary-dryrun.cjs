// Writes a dry-run script for the MFD 3.0 database (database/diary/01–11) to ~/Downloads/mfd-db-dry-run.sql.
// Pasted into the Supabase SQL editor it builds every table, fills them from every real diary, compares old and new
// (counts and totals per area), and then ends with an error that carries the report. The error undoes everything,
// so nothing stays in the database. To keep it small enough for the editor, the exercise library is loaded with only
// what linking needs (id, name, tracking); the full library comes with the real install.
// Usage: node scripts-diary-dryrun.cjs
const fs = require('fs'), os = require('os'), path = require('path');
const q = (v) => (v == null ? 'null' : "'" + String(v).replace(/'/g, "''") + "'");
const strip = (sql) => sql.split('\n').filter((l) => !/^\s*(begin|commit);\s*$/i.test(l)).join('\n');
const part = (f) => strip(fs.readFileSync(`database/diary/${f}.sql`, 'utf8'));
const cat = JSON.parse(fs.readFileSync('public/catalogue/mfd_exercises.json', 'utf8'));

const lite = `-- Exercise library, linking fields only (dry run).
insert into diary.exercises (id, source, source_ref, name, tracking) values
${cat.exercises.map((e) => `(md5('mfd:' || ${q(e.id)})::uuid, 'mfd', ${q(e.id)}, ${q(e.name)}, ${q(e.tracking)})`).join(',\n')}
on conflict do nothing;`;

const report = `
-- ── Fill every diary, compare old and new, report, and undo everything ──
do $dry$
declare u uuid; t0 timestamptz; ms numeric; slowest numeric := 0; total numeric := 0; n int := 0; rep text;
begin
  t0 := clock_timestamp();
  for u in select user_id from public.forma_workspaces loop
    t0 := clock_timestamp();
    perform diary.fill_training(u); perform diary.fill_nutrition(u); perform diary.fill_body(u); perform diary.fill_account(u);
    ms := extract(epoch from clock_timestamp() - t0) * 1000; slowest := greatest(slowest, ms); total := total + ms; n := n + 1;
  end loop;

  create temporary table _r (k int, area text, item text, old_value numeric, new_value numeric);
  insert into _r
  with w as (select payload p from public.forma_workspaces),
  sess as (select s from w, jsonb_array_elements(case when jsonb_typeof(p->'sessions') = 'array' then p->'sessions' else '[]' end) s
           union all select p->'active' from w where jsonb_typeof(p->'active') = 'object'),
  sets as (select x from sess, jsonb_array_elements(case when jsonb_typeof(s->'sets') = 'array' then s->'sets' else '[]' end) x),
  meals as (select x from w, jsonb_array_elements(case when jsonb_typeof(p->'meals') = 'array' then p->'meals' else '[]' end) x),
  wts as (select x from w, jsonb_array_elements(case when jsonb_typeof(p->'weights') = 'array' then p->'weights' else '[]' end) x),
  cis as (select x from w, jsonb_array_elements(case when jsonb_typeof(p->'checkins') = 'array' then p->'checkins' else '[]' end) x)
  select 1, 'Training', 'workouts', (select count(*) from sess), (select count(*) from diary.workouts where deleted_at is null)
  union all select 2, 'Training', 'sets', (select count(*) from sets), (select count(*) from diary.workout_sets where deleted_at is null)
  union all select 3, 'Training', 'ticked sets', (select count(*) from sets where x->>'done' is distinct from 'false'), (select count(*) from diary.workout_sets where deleted_at is null and completed_at is not null)
  union all select 4, 'Training', 'reps (total)', (select coalesce(sum(round(diary.within(diary.num(x->'reps'), 0, 1000))), 0) from sets), (select coalesce(sum(reps), 0) from diary.workout_sets where deleted_at is null)
  union all select 5, 'Training', 'volume kg×reps', (select round(coalesce(sum(round(diary.within(diary.num(x->'kg'), 0, 1000), 2) * round(diary.within(diary.num(x->'reps'), 0, 1000))), 0)) from sets), (select round(coalesce(sum(weight_kg * reps), 0)) from diary.workout_sets where deleted_at is null)
  union all select 6, 'Training', 'routines', (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'routines') = 'array' then p->'routines' else '[]' end) r where coalesce(btrim(r->>'name'), '') <> ''), (select count(*) from diary.routines where deleted_at is null)
  union all select 7, 'Training', 'folders', (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'folders') = 'array' then p->'folders' else '[]' end) f), (select count(*) from diary.routine_folders where deleted_at is null)
  union all select 8, 'Training', 'sets on a built-in exercise', (select count(*) from sets where exists (select 1 from diary.exercises e where e.user_id is null and e.source_ref = x->>'catalogId')),
    (select count(*) from diary.workout_sets s join diary.workout_exercises we on we.id = s.workout_exercise_id join diary.exercises e on e.id = we.exercise_id where s.deleted_at is null and e.user_id is null)
  union all select 9, 'Training', 'heart-rate recordings', (select count(*) from sess where jsonb_typeof(s->'heartRate') = 'object'), (select count(*) from diary.workout_heart_rate where deleted_at is null)
  union all select 10, 'Nutrition', 'food entries', (select count(*) from meals), (select count(*) from diary.food_entries where deleted_at is null)
  union all select 11, 'Nutrition', 'kcal (total)', (select round(coalesce(sum(diary.within(diary.num(x->'cal'), 0, 100000)), 0)) from meals), (select round(coalesce(sum(kcal), 0)) from diary.food_entries where deleted_at is null)
  union all select 12, 'Nutrition', 'protein g (total)', (select round(coalesce(sum(diary.within(diary.num(x->'p'), 0, 10000)), 0)) from meals), (select round(coalesce(sum(protein_g), 0)) from diary.food_entries where deleted_at is null)
  union all select 13, 'Nutrition', 'foods (distinct labels)', (select count(distinct x->'labelFood'->>'id') from meals), (select count(*) from diary.foods f where f.user_id is not null and exists (select 1 from diary.food_entries e where e.food_id = f.id))
  union all select 14, 'Nutrition', 'water ml (total)', (select coalesce(sum(round(diary.within(diary.num(v), 1, 10000))), 0) from w, jsonb_each(case when jsonb_typeof(p->'water') = 'object' then p->'water' else '{}' end) e(d, v) where diary.day(d) is not null), (select coalesce(sum(ml), 0) from diary.water_logs where deleted_at is null)
  union all select 15, 'Body', 'weigh-ins (days)', (select count(*) from (select distinct p, x->>'date' from w, jsonb_array_elements(case when jsonb_typeof(p->'weights') = 'array' then p->'weights' else '[]' end) x) z), (select count(*) from diary.weigh_ins where deleted_at is null)
  union all select 16, 'Body', 'recovery days', (select count(*) from (select distinct x->>'date' d, md5(x::text) from cis where coalesce(x->>'sleep', x->>'steps', x->>'energy', x->>'soreness', x->>'restingHr', x->>'hrv') is not null or jsonb_typeof(x->'sleepStages') = 'object' or nullif(btrim(coalesce(x->>'note', '')), '') is not null) z),
    (select count(*) from diary.recovery_days where deleted_at is null)
  union all select 17, 'Body', 'sleep hours (total)', (select round(coalesce(sum(diary.within(diary.num(x->'sleep'), 0, 24)), 0), 1) from cis), (select round(coalesce(sum(sleep_h), 0), 1) from diary.recovery_days where deleted_at is null)
  union all select 18, 'Body', 'measurements', (select count(*) from cis, unnest(array['waist', 'chest', 'hips', 'arms']) k where diary.num(x->k) is not null), (select count(*) from diary.body_measurements where deleted_at is null)
  union all select 19, 'Account', 'profiles', (select count(*) from w where diary.within(diary.num(p->'profile'->'height'), 100, 250) is not null), (select count(*) from diary.user_profiles)
  union all select 20, 'Account', 'settings', (select count(*) from w), (select count(*) from diary.user_settings)
  union all select 21, 'AI', 'entries added by an assistant', (select count(*) from meals where x ? 'addedBy') + (select count(*) from wts where x ? 'addedBy') + (select count(*) from sess where s ? 'addedBy')
      + (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'routines') = 'array' then p->'routines' else '[]' end) r where r ? 'addedBy'),
    (select count(*) from diary.food_entries where ai_action_id is not null) + (select count(*) from diary.weigh_ins where ai_action_id is not null) + (select count(*) from diary.workouts where ai_action_id is not null) + (select count(*) from diary.routines where ai_action_id is not null)
  union all select 22, 'AI', 'workout suggestions', (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'aiSuggestions') = 'array' then p->'aiSuggestions' else '[]' end) x), (select count(*) from diary.ai_suggestions where deleted_at is null);

  select 'MFD 3.0 DATABASE DRY RUN · nothing was kept (this error undid everything)' || chr(10)
    || n || ' diaries filled in ' || round(total / 1000, 1) || ' s (slowest ' || round(slowest / 1000, 1) || ' s)' || chr(10) || chr(10)
    || string_agg(rpad(area, 10) || rpad(item, 30) || lpad(old_value::text, 12) || lpad(new_value::text, 12) || '  ' || case when old_value = new_value then 'OK' else 'DIFFERENT' end, chr(10) order by k)
    || chr(10) || chr(10) || 'Values left out by the new rules: '
    || coalesce((select string_agg(kind || '/' || detail || ' ×' || c, ', ') from (select kind, detail, count(*) c from diary.fill_problems group by 1, 2) z), 'none')
  into rep from _r;
  raise exception '%', rep;
end $dry$;
`;

const out = `-- MFD 3.0 database: DRY RUN on the real diaries. Safe: everything below runs in one transaction that ends with an
-- error carrying the report, and that error undoes everything (no table, row or trigger is left behind).
-- Paste all of it into the Supabase SQL editor (project Forma) and press Run; the "error" shown is the report.
-- Generated by scripts-diary-dryrun.cjs from database/diary/01–11.
begin;
${part('01-foundation')}
${part('02-library')}
${lite}
${part('03-training')}
${part('05-fill-training')}
${part('06-nutrition')}
${part('07-fill-nutrition')}
${part('08-body')}
${part('09-fill-body')}
${part('10-account')}
${part('11-fill-account')}
${report}
`;
const file = path.join(os.homedir(), 'Downloads', 'mfd-db-dry-run.sql');
fs.writeFileSync(file, out);
console.log(`${file}: ${(out.length / 1024).toFixed(0)} KB`);
