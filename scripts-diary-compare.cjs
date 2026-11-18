// Step 3 of MFD 3.0: the side-by-side check. Writes ~/Downloads/mfd-db-compare.sql. Pasted into the Supabase SQL editor
// it installs database/diary/12-read.sql inside one transaction, rebuilds every person's diary from the tables
// (diary.as_envelope) and compares it with the stored document two ways:
//   1. the data readers use, entry by entry (workouts, sets, meals, weigh-ins, routines, water, recovery);
//   2. the AI connector's own answers (training summary, exercises, progress, records, muscle volume, nutrition,
//      saved foods, weight trend), computed once from each and compared.
// It ends with an error that carries the report, which undoes everything (nothing is kept). Read-only in effect.
// Usage: node scripts-diary-compare.cjs
const fs = require('fs'), os = require('os'), path = require('path');
const strip = (sql) => sql.split('\n').filter((l) => !/^\s*(begin|commit);\s*$/i.test(l)).join('\n');
const read = strip(fs.readFileSync(path.join(__dirname, 'database/diary/12-read.sql'), 'utf8'));

const report = `
do $cmp$
declare u uuid; o jsonb; n jsonb; op text; args jsonb; a jsonb; b jsonb; top text; rep text := '';
begin
  create temporary table _d (k int, area text, item text, same int, diff int, example text);

  for u in select user_id from public.forma_workspaces loop
    select payload into o from public.forma_workspaces where user_id = u;
    n := diary.as_envelope(u);

    -- 1. Data, entry by entry (numbers compared as numbers; ids are the old ones).
    insert into _d
    with os as (select s->>'id' id, s from jsonb_array_elements(case when jsonb_typeof(o->'sessions') = 'array' then o->'sessions' else '[]' end) s),
         ns as (select s->>'id' id, s from jsonb_array_elements(n->'sessions') s),
         ox as (select os.id w, x->>'id' id, x from os, jsonb_array_elements(case when jsonb_typeof(s->'sets') = 'array' then s->'sets' else '[]' end) x),
         nx as (select ns.id w, x->>'id' id, x from ns, jsonb_array_elements(s->'sets') x),
         om as (select x->>'id' id, x from jsonb_array_elements(case when jsonb_typeof(o->'meals') = 'array' then o->'meals' else '[]' end) x),
         nm as (select x->>'id' id, x from jsonb_array_elements(n->'meals') x),
         ow as (select x->>'id' id, x from jsonb_array_elements(case when jsonb_typeof(o->'weights') = 'array' then o->'weights' else '[]' end) x),
         nw as (select x->>'id' id, x from jsonb_array_elements(n->'weights') x),
         orr as (select x->>'id' id, x from jsonb_array_elements(case when jsonb_typeof(o->'routines') = 'array' then o->'routines' else '[]' end) x where coalesce(btrim(x->>'name'), '') <> ''),
         nr as (select x->>'id' id, x from jsonb_array_elements(n->'routines') x)
    select 1, 'Training', 'workouts', count(*) filter (where (os.s->>'name', os.s->>'date', diary.num(os.s->'started'), diary.num(os.s->'finished'))
            is not distinct from (ns.s->>'name', ns.s->>'date', diary.num(ns.s->'started'), diary.num(ns.s->'finished'))),
         count(*) filter (where os.id is null or ns.id is null or (os.s->>'name', os.s->>'date', diary.num(os.s->'started'), diary.num(os.s->'finished'))
            is distinct from (ns.s->>'name', ns.s->>'date', diary.num(ns.s->'started'), diary.num(ns.s->'finished'))),
         min(coalesce(os.id, ns.id)) filter (where os.id is null or ns.id is null or (os.s->>'name', os.s->>'date') is distinct from (ns.s->>'name', ns.s->>'date'))
    from os full join ns using (id)
    union all
    select 2, 'Training', 'sets: weight, reps, type, done', count(*) filter (where ox.id is not null and nx.id is not null and
            (diary.num(ox.x->'kg'), diary.num(ox.x->'reps'), coalesce(ox.x->>'type', 'normal'), ox.x->>'done' is distinct from 'false', diary.num(ox.x->'duration_seconds'), diary.num(ox.x->'distance_meters'))
            is not distinct from (diary.num(nx.x->'kg'), diary.num(nx.x->'reps'), nx.x->>'type', (nx.x->>'done')::boolean, diary.num(nx.x->'duration_seconds'), diary.num(nx.x->'distance_meters'))),
         count(*) filter (where ox.id is null or nx.id is null or
            (diary.num(ox.x->'kg'), diary.num(ox.x->'reps'), coalesce(ox.x->>'type', 'normal'), ox.x->>'done' is distinct from 'false', diary.num(ox.x->'duration_seconds'), diary.num(ox.x->'distance_meters'))
            is distinct from (diary.num(nx.x->'kg'), diary.num(nx.x->'reps'), nx.x->>'type', (nx.x->>'done')::boolean, diary.num(nx.x->'duration_seconds'), diary.num(nx.x->'distance_meters'))),
         min(coalesce(ox.w, nx.w) || '/' || coalesce(ox.id, nx.id)) filter (where ox.id is null or nx.id is null or diary.num(ox.x->'kg') is distinct from diary.num(nx.x->'kg') or diary.num(ox.x->'reps') is distinct from diary.num(nx.x->'reps'))
    from ox full join nx using (w, id)
    union all
    select 3, 'Training', 'sets: exercise name', count(*) filter (where btrim(ox.x->>'exercise') = nx.x->>'exercise'),
         count(*) filter (where btrim(ox.x->>'exercise') is distinct from nx.x->>'exercise'),
         min(btrim(ox.x->>'exercise') || ' → ' || coalesce(nx.x->>'exercise', '?')) filter (where btrim(ox.x->>'exercise') is distinct from nx.x->>'exercise')
    from ox join nx using (w, id)
    union all
    select 4, 'Training', 'sets: group, order, notes', count(*) filter (where (diary.num(ox.x->'group'), coalesce(ox.x->>'notes', '')) is not distinct from (diary.num(nx.x->'group'), nx.x->>'notes')),
         count(*) filter (where (diary.num(ox.x->'group'), coalesce(ox.x->>'notes', '')) is distinct from (diary.num(nx.x->'group'), nx.x->>'notes')),
         min(ox.w || '/' || ox.id) filter (where (diary.num(ox.x->'group'), coalesce(ox.x->>'notes', '')) is distinct from (diary.num(nx.x->'group'), nx.x->>'notes'))
    from ox join nx using (w, id)
    union all
    select 5, 'Training', 'routines: name, folder, exercises', count(*) filter (where (orr.x->>'name', orr.x->>'folderId', jsonb_array_length(coalesce(orr.x->'exercises', '[]')))
            is not distinct from (nr.x->>'name', nr.x->>'folderId', jsonb_array_length(nr.x->'exercises'))),
         count(*) filter (where orr.id is null or nr.id is null or (orr.x->>'name', orr.x->>'folderId', jsonb_array_length(coalesce(orr.x->'exercises', '[]')))
            is distinct from (nr.x->>'name', nr.x->>'folderId', jsonb_array_length(nr.x->'exercises'))),
         min(coalesce(orr.id, nr.id)) filter (where orr.id is null or nr.id is null or orr.x->>'name' is distinct from nr.x->>'name')
    from orr full join nr using (id)
    union all
    select 6, 'Nutrition', 'food entries', count(*) filter (where (om.x->>'date', initcap(om.x->>'meal'), om.x->>'name', diary.num(om.x->'amount'), om.x->>'unit', diary.num(om.x->'cal'), diary.num(om.x->'p'), diary.num(om.x->'c'), diary.num(om.x->'f'))
            is not distinct from (nm.x->>'date', nm.x->>'meal', nm.x->>'name', diary.num(nm.x->'amount'), nm.x->>'unit', diary.num(nm.x->'cal'), diary.num(nm.x->'p'), diary.num(nm.x->'c'), diary.num(nm.x->'f'))),
         count(*) filter (where om.id is null or nm.id is null or (om.x->>'date', initcap(om.x->>'meal'), om.x->>'name', diary.num(om.x->'amount'), om.x->>'unit', diary.num(om.x->'cal'), diary.num(om.x->'p'), diary.num(om.x->'c'), diary.num(om.x->'f'))
            is distinct from (nm.x->>'date', nm.x->>'meal', nm.x->>'name', diary.num(nm.x->'amount'), nm.x->>'unit', diary.num(nm.x->'cal'), diary.num(nm.x->'p'), diary.num(nm.x->'c'), diary.num(nm.x->'f'))),
         min(coalesce(om.id, nm.id)) filter (where om.id is null or nm.id is null or (om.x->>'date', om.x->>'name') is distinct from (nm.x->>'date', nm.x->>'name'))
    from om full join nm using (id)
    union all
    select 7, 'Nutrition', 'entry labels (food per amount)', count(*) filter (where (om.x->'labelFood'->>'id', diary.num(om.x->'labelFood'->'cal'), diary.num(om.x->'labelFood'->'basis'))
            is not distinct from (nm.x->'labelFood'->>'id', diary.num(nm.x->'labelFood'->'cal'), diary.num(nm.x->'labelFood'->'basis'))),
         count(*) filter (where (om.x->'labelFood'->>'id', diary.num(om.x->'labelFood'->'cal'), diary.num(om.x->'labelFood'->'basis'))
            is distinct from (nm.x->'labelFood'->>'id', diary.num(nm.x->'labelFood'->'cal'), diary.num(nm.x->'labelFood'->'basis'))),
         min(om.x->'labelFood'->>'name') filter (where (om.x->'labelFood'->>'id', diary.num(om.x->'labelFood'->'cal')) is distinct from (nm.x->'labelFood'->>'id', diary.num(nm.x->'labelFood'->'cal')))
    from om join nm using (id)
    union all
    select 8, 'Nutrition', 'water days', case when (select coalesce(jsonb_object_agg(d, round(diary.num(v))), '{}') from jsonb_each(case when jsonb_typeof(o->'water') = 'object' then o->'water' else '{}' end) e(d, v)
                                                     where diary.num(v) between 1 and 10000) = n->'water' then 1 else 0 end,
         case when (select coalesce(jsonb_object_agg(d, round(diary.num(v))), '{}') from jsonb_each(case when jsonb_typeof(o->'water') = 'object' then o->'water' else '{}' end) e(d, v)
                    where diary.num(v) between 1 and 10000) = n->'water' then 0 else 1 end, null
    union all
    select 9, 'Body', 'weigh-ins', count(*) filter (where (ow.x->>'date', diary.num(ow.x->'kg')) is not distinct from (nw.x->>'date', diary.num(nw.x->'kg'))),
         count(*) filter (where ow.id is null or nw.id is null or (ow.x->>'date', diary.num(ow.x->'kg')) is distinct from (nw.x->>'date', diary.num(nw.x->'kg'))),
         min(coalesce(ow.id, nw.id)) filter (where ow.id is null or nw.id is null or (ow.x->>'date', diary.num(ow.x->'kg')) is distinct from (nw.x->>'date', diary.num(nw.x->'kg')))
    from ow full join nw using (id)
    union all
    select 10, 'Body', 'recovery days (sleep, steps)', count(*) filter (where (diary.num(oc.x->'sleep'), diary.num(oc.x->'steps')) is not distinct from (diary.num(nc.x->'sleep'), diary.num(nc.x->'steps'))),
         count(*) filter (where nc.d is null or (diary.num(oc.x->'sleep'), diary.num(oc.x->'steps')) is distinct from (diary.num(nc.x->'sleep'), diary.num(nc.x->'steps'))),
         min(oc.d) filter (where nc.d is null or (diary.num(oc.x->'sleep'), diary.num(oc.x->'steps')) is distinct from (diary.num(nc.x->'sleep'), diary.num(nc.x->'steps')))
    from (select distinct on (x->>'date') x->>'date' d, x from jsonb_array_elements(case when jsonb_typeof(o->'checkins') = 'array' then o->'checkins' else '[]' end) with ordinality e(x, i)
          where coalesce(x->>'sleep', x->>'steps', x->>'energy', x->>'soreness') is not null or jsonb_typeof(x->'sleepStages') = 'object' order by x->>'date', i) oc
    left join (select x->>'date' d, x from jsonb_array_elements(n->'checkins') x where x->>'id' like 'recovery:%') nc using (d);

    -- 2. The AI connector's answers, from each version.
    select btrim(x->>'exercise') into top from jsonb_array_elements(case when jsonb_typeof(o->'sessions') = 'array' then o->'sessions' else '[]' end) s,
      jsonb_array_elements(case when jsonb_typeof(s->'sets') = 'array' then s->'sets' else '[]' end) x group by 1 order by count(*) desc limit 1;
    for op, args in select * from (values
        ('summarize_training', '{"group":"week"}'::jsonb), ('summarize_training', '{"group":"month"}'), ('list_exercises', '{}'),
        ('exercise_progress', jsonb_build_object('exercise', coalesce(top, 'Bench Press (Barbell)'))), ('personal_records', '{}'), ('muscle_volume', '{}'),
        ('summarize_nutrition', '{"group":"day"}'), ('summarize_nutrition', '{"group":"week"}'), ('list_saved_foods', '{}'), ('weight_trend', '{}')) v(op, args) loop
      args := args || jsonb_build_object('today', current_date);
      begin a := mfd_mcp.analyze(op, args, o); exception when others then a := jsonb_build_object('error', sqlerrm); end;
      begin b := mfd_mcp.analyze(op, args, n); exception when others then b := jsonb_build_object('error', sqlerrm); end;
      -- Daily targets are worked out from the profile in 3.0 (date of birth, latest weigh-in), not stored: own line.
      if op = 'summarize_nutrition' then
        insert into _d values (30, 'Expected', 'daily targets (need date of birth)', case when a->'daily_targets' = b->'daily_targets' then 1 else 0 end,
          case when a->'daily_targets' = b->'daily_targets' then 0 else 1 end, null);
        a := (a - 'daily_targets') || jsonb_build_object('periods', (select coalesce(jsonb_agg(p - 'avg_kcal_vs_target_pct' - 'avg_protein_vs_target_pct'), '[]') from jsonb_array_elements(a->'periods') p));
        b := (b - 'daily_targets') || jsonb_build_object('periods', (select coalesce(jsonb_agg(p - 'avg_kcal_vs_target_pct' - 'avg_protein_vs_target_pct'), '[]') from jsonb_array_elements(b->'periods') p));
      end if;
      insert into _d values (20, 'AI connector', op || coalesce(' ' || (args->>'group'), ''),
        case when a = b then 1 else 0 end, case when a = b then 0 else 1 end, null);
    end loop;
  end loop;

  select string_agg(rpad(area, 13) || rpad(item, 36) || lpad(sum_same::text, 7) || lpad(sum_diff::text, 7) || '  '
           || case when sum_diff = 0 then 'SAME' else 'DIFFERENT' || coalesce(' (e.g. ' || left(ex1, 60) || ')', '') end, chr(10) order by k, item)
    into rep
  from (select min(k) k, area, item, sum(same) sum_same, sum(diff) sum_diff, min(example) ex1 from _d group by area, item) z;
  raise exception '%', 'MFD 3.0 SIDE-BY-SIDE CHECK · nothing was kept (this error undid everything)' || chr(10)
    || (select count(*) from public.forma_workspaces) || ' diaries · counts are entries (or people for the AI connector lines)' || chr(10) || chr(10)
    || rpad('Area', 13) || rpad('What', 36) || lpad('same', 7) || lpad('diff', 7) || chr(10) || rep;
end $cmp$;
`;

const out = `-- MFD 3.0: side-by-side check of the old diary documents and the diary rebuilt from the new tables.
-- Safe: everything runs in one transaction that ends with an error carrying the report; that error undoes everything.
-- Paste all of it into the Supabase SQL editor (project Forma), press Run; the "error" shown is the report.
-- Generated by scripts-diary-compare.cjs.
begin;
${read}
${report}
`;
const file = process.argv[2] || path.join(os.homedir(), 'Downloads', 'mfd-db-compare.sql');
fs.writeFileSync(file, out);
console.log(`${file}: ${(out.length / 1024).toFixed(0)} KB`);
