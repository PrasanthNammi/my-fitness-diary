-- Full nutrition from ChatGPT and Claude: log_meal also stores fibre, sugars, saturated fat and salt (from the
-- label, for the amount eaten), and saved foods carry theirs over. summarize_nutrition and list_saved_foods report
-- them. A value the label doesn't show stays unknown ("–" in the app), unlike a real 0.
--
-- Replaces mfd_mcp.analyze and mfd_mcp.add_entry with their current versions from database/mcp-connector-v2.sql
-- (tests/mcp-full-nutrients.cjs checks they are identical). Same arguments, same permissions; no diary data changes.
-- Safe to re-run. One transaction: on any error nothing is applied.
begin;

create or replace function mfd_mcp.analyze(operation text, args jsonb, doc jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare grp text := args->>'group'; ex text; result jsonb; today date := coalesce(mfd_mcp.safe_date(args->>'today'),current_date);
begin
 if operation='summarize_training' then
  grp := coalesce(grp,'week'); if grp not in ('week','month') then raise exception 'Invalid group' using errcode='22023'; end if;
  with s as (select v, to_char(date_trunc(grp,mfd_mcp.safe_date(v->>'date')),'YYYY-MM-DD') period
     from jsonb_array_elements(coalesce(doc->'sessions','[]')) v
     where mfd_mcp.safe_date(v->>'date') is not null and mfd_mcp.in_range(v->>'date',args)),
   sess as (select period, count(*) sessions, sum(case when mfd_mcp.safe_num(v->'finished')>mfd_mcp.safe_num(v->'started')
     then (mfd_mcp.safe_num(v->'finished')-mfd_mcp.safe_num(v->'started'))/60000 end) minutes from s group by period),
   work as (select period, count(*) sets, sum(coalesce(mfd_mcp.safe_num(x->'reps'),0)) reps,
     sum(coalesce(mfd_mcp.safe_num(x->'kg'),0)*coalesce(mfd_mcp.safe_num(x->'reps'),0)) volume
     from s, jsonb_array_elements(coalesce(s.v->'sets','[]')) x
     where coalesce(x->>'type','normal')<>'warmup' and coalesce(x->>'done','true')<>'false' group by period),
   recent as (select * from sess order by period desc limit 400)
  select jsonb_build_object('group',grp,'periods',coalesce(jsonb_agg(jsonb_build_object('period',r.period,'sessions',r.sessions,
    'working_sets',coalesce(w.sets,0),'reps',coalesce(w.reps,0),'volume_kg',round(coalesce(w.volume,0),1),'minutes',round(coalesce(r.minutes,0))) order by r.period),'[]'))
   into result from recent r left join work w using(period);
 elsif operation='list_exercises' then
  select coalesce(jsonb_agg(jsonb_build_object('exercise',exercise_name,'muscle_group',mfd_mcp.exercise_group(exercise_name),'sessions',ns,'sets',nsets,'last_date',last) order by ns desc, exercise_name),'[]') into result from (
   select btrim(x->>'exercise') exercise_name, count(distinct v->>'id') ns, count(*) nsets, max(v->>'date') last
   from jsonb_array_elements(coalesce(doc->'sessions','[]')) v, jsonb_array_elements(coalesce(v->'sets','[]')) x
   where mfd_mcp.in_range(v->>'date',args) and coalesce(x->>'type','normal')<>'warmup' and coalesce(btrim(x->>'exercise'),'')<>''
   group by 1 order by 2 desc, 1 limit 300) t;
 elsif operation='exercise_progress' then
  ex := lower(btrim(coalesce(args->>'exercise','')));
  if ex='' or length(ex)>120 then raise exception 'Exercise name required' using errcode='22023'; end if;
  with q as (select v->>'id' id, v->>'date' d, v->>'name' workout, coalesce(mfd_mcp.safe_num(x->'kg'),0) kg, coalesce(mfd_mcp.safe_num(x->'reps'),0) reps
     from jsonb_array_elements(coalesce(doc->'sessions','[]')) v, jsonb_array_elements(coalesce(v->'sets','[]')) x
     where lower(btrim(x->>'exercise'))=ex and coalesce(x->>'type','normal')<>'warmup' and coalesce(x->>'done','true')<>'false' and mfd_mcp.in_range(v->>'date',args)),
   per as (select id, d, workout, count(*) n, sum(reps) reps, round(sum(kg*reps),1) volume, max(kg) top_kg,
     round(max(case when reps between 1 and 12 and kg>0 then kg*(1+reps/30.0) end),1) e1rm from q group by id, d, workout),
   top as (select per.id, min(q.reps) min_top_reps, count(*) top_sets from per join q on q.id=per.id and q.kg=per.top_kg group by per.id),
   ranked as (select per.*, top.min_top_reps, top.top_sets, row_number() over (order by d desc nulls last, id) rn from per join top using(id)),
   last2 as (select * from ranked where rn<=2)
  select jsonb_build_object('exercise',args->>'exercise',
    'sessions',(select coalesce(jsonb_agg(jsonb_build_object('date',d,'workout',workout,'sets',n,'reps',reps,'volume_kg',volume,'top_kg',top_kg,'est_1rm_kg',e1rm) order by d),'[]') from ranked where rn<=200),
    -- Double progression: every top-weight set at 10+ reps -> add weight; otherwise add reps first.
    'suggestion',(select case
      when l.top_kg is null or l.top_kg=0 then null
      when l.min_top_reps>=10 then jsonb_build_object('next_kg',l.top_kg+case when l.top_kg>=20 then 2.5 else 1 end,
       'reason','Every set at '||l.top_kg||' kg reached '||l.min_top_reps||'+ reps last time; add a little weight.')
      when p.top_kg=l.top_kg and p.min_top_reps>=l.min_top_reps then jsonb_build_object('next_kg',l.top_kg,
       'reason','Reps at '||l.top_kg||' kg did not increase over the last two sessions; stay at this weight and aim for one more rep per set. If it stalls a third time, consider a lighter week.')
      else jsonb_build_object('next_kg',l.top_kg,'reason','Stay at '||l.top_kg||' kg and aim for one more rep per set; add weight once every set reaches 10 reps.') end
     from (select * from last2 where rn=1) l left join (select * from last2 where rn=2) p on true))
   into result;
 elsif operation='personal_records' then
  with q as (select v->>'date' d, btrim(x->>'exercise') name, coalesce(mfd_mcp.safe_num(x->'kg'),0) kg, coalesce(mfd_mcp.safe_num(x->'reps'),0) reps
     from jsonb_array_elements(coalesce(doc->'sessions','[]')) v, jsonb_array_elements(coalesce(v->'sets','[]')) x
     where mfd_mcp.safe_date(v->>'date') is not null and coalesce(x->>'type','normal')<>'warmup' and coalesce(x->>'done','true')<>'false'
      and coalesce(btrim(x->>'exercise'),'')<>'' and mfd_mcp.in_range(v->>'date',args)),
   e as (select lower(name) k, min(name) name, count(distinct d) days from q group by 1),
   heavy as (select distinct on (lower(name)) lower(name) k, kg, reps, d from q where kg>0 order by lower(name), kg desc, reps desc, d),
   best as (select distinct on (lower(name)) lower(name) k, round(kg*(1+reps/30.0),1) e1rm, kg, reps, d from q where kg>0 and reps between 1 and 12
     order by lower(name), kg*(1+reps/30.0) desc, d)
  select jsonb_build_object('records',coalesce(jsonb_agg(jsonb_build_object('exercise',e.name,'sessions',e.days,
     'heaviest',case when h.k is not null then jsonb_build_object('kg',h.kg,'reps',h.reps,'date',h.d) end,
     'best_est_1rm',case when b.k is not null then jsonb_build_object('kg',b.e1rm,'set',b.kg||' kg x '||b.reps,'date',b.d) end,
     'new_in_last_30_days',coalesce(greatest(h.d,b.d)>=(today-30)::text,false)) order by e.days desc, e.name),'[]')) into result
   from (select * from e order by days desc, name limit 150) e left join heavy h using(k) left join best b using(k);
 elsif operation='muscle_volume' then
  -- Working sets per broad muscle group (the app's catalogue groups), per ISO week.
  with q as (select to_char(date_trunc('week',mfd_mcp.safe_date(v->>'date')),'YYYY-MM-DD') week, btrim(x->>'exercise') name
     from jsonb_array_elements(coalesce(doc->'sessions','[]')) v, jsonb_array_elements(coalesce(v->'sets','[]')) x
     where mfd_mcp.safe_date(v->>'date') is not null and coalesce(x->>'type','normal')<>'warmup' and coalesce(x->>'done','true')<>'false'
      and coalesce(btrim(x->>'exercise'),'')<>'' and mfd_mcp.in_range(v->>'date',args)),
   g as (select week, name, mfd_mcp.exercise_group(name) mg from q),
   weeks as (select week, jsonb_object_agg(mg, n) groups from (select week, mg, count(*) n from g where mg is not null group by 1,2) t group by week order by week desc limit 104)
  select jsonb_build_object('groups',array['Chest','Back','Shoulders','Arms','Legs','Core'],
    'totals',(select coalesce(jsonb_object_agg(mg,n),'{}') from (select mg, count(*) n from g where mg is not null group by 1) t),
    'weeks',(select coalesce(jsonb_agg(jsonb_build_object('week',week,'working_sets',groups) order by week),'[]') from weeks),
    'unclassified',(select coalesce(jsonb_agg(jsonb_build_object('exercise',name,'sets',n) order by n desc),'[]') from
      (select min(name) name, count(*) n from g where mg is null group by lower(name) order by 2 desc limit 30) t)) into result;
 elsif operation='summarize_nutrition' then
  grp := coalesce(grp,'day'); if grp not in ('day','week','month') then raise exception 'Invalid group' using errcode='22023'; end if;
  with m as (select v->>'date' d, coalesce(mfd_mcp.safe_num(v->'cal'),0) kcal, coalesce(mfd_mcp.safe_num(v->'p'),0) p,
     coalesce(mfd_mcp.safe_num(v->'c'),0) c, coalesce(mfd_mcp.safe_num(v->'f'),0) f,
     -- Label extras: null when an entry has no value (not on the label), so totals count known values only.
     mfd_mcp.safe_num(v->'fiber') fib, mfd_mcp.safe_num(v->'sugar') sug, mfd_mcp.safe_num(v->'saturates') sat, mfd_mcp.safe_num(v->'salt') salt
     from jsonb_array_elements(coalesce(doc->'meals','[]')) v where mfd_mcp.safe_date(v->>'date') is not null and mfd_mcp.in_range(v->>'date',args)),
   days as (select d, sum(kcal) kcal, sum(p) p, sum(c) c, sum(f) f, sum(fib) fib, sum(sug) sug, sum(sat) sat, sum(salt) salt from m group by d),
   per as (select to_char(date_trunc(grp,mfd_mcp.safe_date(d)),'YYYY-MM-DD') period, count(*) n, sum(kcal) kcal, sum(p) p, sum(c) c, sum(f) f,
     sum(fib) fib, sum(sug) sug, sum(sat) sat, sum(salt) salt
     from days group by 1 order by 1 desc limit 400),
   t as (select mfd_mcp.safe_num(doc->'profile'->'cal') tk, mfd_mcp.safe_num(doc->'profile'->'protein') tp,
     mfd_mcp.safe_num(doc->'profile'->'carbs') tc, mfd_mcp.safe_num(doc->'profile'->'fat') tf)
  select jsonb_build_object('group',grp,
    'daily_targets',(select jsonb_strip_nulls(jsonb_build_object('kcal',tk,'protein_g',tp,'carbs_g',tc,'fat_g',tf)) from t),
    'periods',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('period',period,'days_logged',n,
    'kcal',round(kcal),'protein_g',round(p,1),'carbs_g',round(c,1),'fat_g',round(f,1),
    'fibre_g',round(fib,1),'sugars_g',round(sug,1),'saturated_fat_g',round(sat,1),'salt_g',round(salt,2),
    'avg_kcal_per_day',round(kcal/n),'avg_protein_g_per_day',round(p/n,1),'avg_fibre_g_per_day',round(fib/n,1),
    'avg_kcal_vs_target_pct',round(100*kcal/n/nullif(tk,0)),'avg_protein_vs_target_pct',round(100*p/n/nullif(tp,0)))) order by period),'[]'))
   into result from per, t;
 elsif operation='list_saved_foods' then
  -- The user's own foods plus foods already used in the diary, with values per basis amount.
  with f as (select v->>'id' id, v, 1 src, null::text d from jsonb_array_elements(coalesce(doc->'products','[]')) v
     union all select v->'labelFood'->>'id', v->'labelFood', 2, v->>'date' from jsonb_array_elements(coalesce(doc->'meals','[]')) v where jsonb_typeof(v->'labelFood')='object'),
   u as (select id, (array_agg(v order by src, d desc nulls last))[1] v, count(d) times, max(d) last from f
     where coalesce(id,'')<>'' and coalesce(btrim(v->>'name'),'')<>'' and mfd_mcp.safe_num(v->'basis')>0 and mfd_mcp.safe_num(v->'cal') is not null group by id)
  select coalesce(jsonb_agg(j order by times desc, last desc nulls last),'[]') into result from (
   select jsonb_strip_nulls(jsonb_build_object('food_id',id,'name',v->>'name','brand',nullif(v->>'brand',''),'per_amount',mfd_mcp.safe_num(v->'basis'),'unit',coalesce(v->>'unit','g'),
     'kcal',mfd_mcp.safe_num(v->'cal'),'protein_g',mfd_mcp.safe_num(v->'p'),'carbs_g',mfd_mcp.safe_num(v->'c'),'fat_g',mfd_mcp.safe_num(v->'f'),
     'fibre_g',mfd_mcp.safe_num(v->'fiber'),'sugars_g',mfd_mcp.safe_num(v->'sugar'),'saturated_fat_g',mfd_mcp.safe_num(v->'saturates'),'salt_g',mfd_mcp.safe_num(v->'salt'),
     'times_logged',times,'last_logged',last)) j, times, last
   from u where args->>'search' is null or v->>'name' ilike '%'||replace(replace(args->>'search','%',''),'_','')||'%' or v->>'brand' ilike '%'||replace(replace(args->>'search','%',''),'_','')||'%'
   order by times desc, last desc nulls last limit 50) t;
 elsif operation='weight_trend' then
  with w as (select v->>'date' d, mfd_mcp.safe_num(v->'kg') kg from jsonb_array_elements(coalesce(doc->'weights','[]')) v
     where mfd_mcp.safe_date(v->>'date') is not null and mfd_mcp.safe_num(v->'kg') is not null and mfd_mcp.in_range(v->>'date',args)),
   weekly as (select to_char(date_trunc('week',mfd_mcp.safe_date(d)),'YYYY-MM-DD') week, round(avg(kg),2) kg, count(*) n from w group by 1 order by 1 desc limit 260)
  select jsonb_build_object('entries',(select count(*) from w),
    'first',(select jsonb_build_object('date',d,'kg',kg) from w order by d, kg limit 1),
    'last',(select jsonb_build_object('date',d,'kg',kg) from w order by d desc, kg limit 1),
    'change_kg',(select round((select kg from w order by d desc limit 1)-(select kg from w order by d limit 1),2)),
    'min_kg',(select min(kg) from w),'max_kg',(select max(kg) from w),'avg_kg',(select round(avg(kg),2) from w),
    'weekly',(select coalesce(jsonb_agg(jsonb_build_object('week',week,'avg_kg',kg,'entries',n) order by week),'[]') from weekly)) into result;
 else raise exception 'Unknown operation' using errcode='22023';
 end if;
 return result;
end $$;

create or replace function mfd_mcp.add_entry(u uuid, conn text, operation text, args jsonb, today date) returns jsonb
language plpgsql volatile set search_path='' as $$
declare field text; doc jsonb; entry jsonb; eid text := gen_random_uuid()::text; d date := mfd_mcp.safe_date(args->>'date');
 rid text := args->>'request_id'; existing text; used integer; rev bigint; sets jsonb := '[]'; g integer := 0; i integer;
 ex jsonb; st jsonb; kg numeric; reps numeric; dur numeric; dist numeric; rpe numeric; started bigint; nm text;
 amount numeric; kcal numeric; pr numeric; cb numeric; ft numeric; routine_exercises jsonb := '[]'; food jsonb; factor numeric; slot text;
 -- Label extras in the diary's own keys (sugar, saturates, fiber, salt); absent = not on the label, unlike a real 0.
 extras jsonb := '{}'; xk text; xv numeric;
begin
 field := case operation when 'log_workout' then 'sessions' when 'create_routine' then 'routines' when 'log_meal' then 'meals' when 'log_weight' then 'weights' end;
 if field is null then raise exception 'Unknown operation' using errcode='22023'; end if;
 if operation<>'create_routine' and (d is null or d<date '2000-01-01') then raise exception 'Invalid date (YYYY-MM-DD)' using errcode='22023'; end if;
 -- Meals may be planned up to two days ahead; workouts and weigh-ins only record the past.
 if operation='log_meal' and d>today+2 then
  raise exception 'Meals can be planned up to 2 days ahead (today is %)', to_char(today,'FMDD Mon YYYY') using errcode='22023'; end if;
 if operation in ('log_workout','log_weight') and d>today then
  raise exception 'Workouts and weigh-ins cannot be in the future (today is %)', to_char(today,'FMDD Mon YYYY') using errcode='22023'; end if;
 if args ? 'request_id' and (jsonb_typeof(args->'request_id') is distinct from 'string' or rid !~ '^[A-Za-z0-9_-]+$' or length(rid)>64) then
  raise exception 'Invalid request_id' using errcode='22023'; end if;
 -- Row lock first: concurrent adds, the duplicate check and the daily count serialize.
 select payload into doc from public.forma_workspaces where user_id=u for update;
 if not found then raise exception 'Open the diary app once before adding entries' using errcode='22023'; end if;
 -- Same shape the app's validBackup() requires; never add to a workspace the app cannot load.
 if jsonb_typeof(doc->'profile') is distinct from 'object'
    or exists (select 1 from unnest(array['meals','weights','sessions','routines','checkins','chat']) k where jsonb_typeof(doc->k) is distinct from 'array')
    or exists (select 1 from unnest(array['cal','protein','carbs','fat','days']) k where jsonb_typeof(doc->'profile'->k) is distinct from 'number' or (doc->'profile'->>k)::numeric<=0) then
  raise exception 'Finish setting up the diary app before adding entries' using errcode='22023'; end if;
 if rid is not null then
  select e->>'id' into existing from jsonb_array_elements(coalesce(doc->field,'[]')) e
   where e->'addedBy'->>'connection'=conn and e->'addedBy'->>'request'=rid limit 1;
  if existing is not null then return jsonb_build_object('id',existing,'duplicate',true); end if;
 end if;
 -- Days before yesterday: only empty slots. Yesterday, today and planned meals stay open.
 if operation='log_meal' then
  slot := initcap(coalesce(args->>'meal',''));
  if d<today-1 and exists(select 1 from jsonb_array_elements(doc->'meals') e where e->>'date'=d::text and e->>'meal'=slot) then
   raise exception 'You already have % logged on %. Older days can only be filled when empty; change it in the app if needed.', lower(slot), to_char(d,'FMDD Mon YYYY') using errcode='22023'; end if;
 elsif operation='log_workout' and d<today-1 and exists(select 1 from jsonb_array_elements(doc->'sessions') e where e->>'date'=d::text) then
  raise exception 'You already have a workout logged on %. Older days can only be filled when empty; change it in the app if needed.', to_char(d,'FMDD Mon YYYY') using errcode='22023';
 elsif operation='log_weight' and d<today-1 and exists(select 1 from jsonb_array_elements(doc->'weights') e where e->>'date'=d::text) then
  raise exception 'You already have a weigh-in on %. Older days can only be filled when empty; change it in the app if needed.', to_char(d,'FMDD Mon YYYY') using errcode='22023';
 elsif operation='create_routine' and exists(select 1 from jsonb_array_elements(doc->'routines') e where lower(btrim(e->>'name'))=lower(btrim(coalesce(args->>'name','')))) then
  raise exception 'A routine named "%" already exists. Choose another name, or change it in the app.', btrim(args->>'name') using errcode='22023';
 end if;
 delete from mfd_mcp.write_counts where user_id=u and day<today-7;
 insert into mfd_mcp.write_counts as w values(u,conn,today,1)
  on conflict(user_id,connection,day) do update set n=w.n+1 returning n into used;
 if used>30 then raise exception 'Daily limit of 30 new entries for this app reached; try again tomorrow' using errcode='22023'; end if;
 if octet_length(doc::text)>7500000 then raise exception 'Diary is too large to add entries here' using errcode='22023'; end if;
 if operation in ('log_workout','create_routine') then
  -- Same validated set rows for a completed workout and a routine plan.
  nm := coalesce(nullif(btrim(args->>'name'),''),'Workout');
  if (operation='create_routine' and coalesce(btrim(args->>'name'),'')='') or length(nm)>80 or jsonb_typeof(args->'exercises') is distinct from 'array' or jsonb_array_length(args->'exercises') not between 1 and 30
     or (args ? 'duration_minutes' and coalesce(mfd_mcp.safe_num(args->'duration_minutes'),0) not between 1 and 600) then
   raise exception 'Invalid workout' using errcode='22023'; end if;
  for ex in select value from jsonb_array_elements(args->'exercises') loop
   if jsonb_typeof(ex) is distinct from 'object' or coalesce(btrim(ex->>'exercise'),'')='' or length(ex->>'exercise')>80
      or jsonb_typeof(ex->'sets') is distinct from 'array' or jsonb_array_length(ex->'sets') not between 1 and 50
      or (operation='create_routine' and (jsonb_array_length(ex->'sets')>20 or coalesce(mfd_mcp.safe_num(ex->'rest_seconds') not between 0 and 900, false)
        or (ex ? 'rest_seconds' and mfd_mcp.safe_num(ex->'rest_seconds') is null) or length(coalesce(ex->>'notes',''))>300)) then
    raise exception 'Invalid exercise %', g+1 using errcode='22023'; end if;
   i := 0;
   for st in select value from jsonb_array_elements(ex->'sets') loop
    i := i+1; kg := mfd_mcp.safe_num(st->'kg'); reps := mfd_mcp.safe_num(st->'reps'); dur := mfd_mcp.safe_num(st->'duration_seconds');
    dist := mfd_mcp.safe_num(st->'distance_meters'); rpe := mfd_mcp.safe_num(st->'rpe');
    if jsonb_typeof(st) is distinct from 'object' or (kg is null and reps is null and dur is null and dist is null)
       or coalesce(kg not between 0 and 1000 or reps not between 0 and 1000 or reps<>trunc(reps) or dur not between 0 and 86400
         or dur<>trunc(dur) or dist not between 0 and 1000000 or rpe not between 1 and 10, false)
       or coalesce(st->>'type','normal') not in ('warmup','normal','failure','dropset') then
     raise exception 'Invalid set % of exercise %', i, g+1 using errcode='22023'; end if;
    sets := sets || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id',eid||':'||g||':'||i,'exercise',btrim(ex->>'exercise'),
     'group',g,'set',i,'type',coalesce(st->>'type','normal'),'notes',case when operation='create_routine' then nullif(btrim(coalesce(ex->>'notes','')),'') end,'kg',kg,'reps',reps,'duration_seconds',dur,'distance_meters',dist,'rpe',rpe,
     'tracking',case when dist is not null then 'distance_duration' when dur is not null and kg is not null then 'weight_duration'
       when dur is not null then 'duration' when kg is not null then 'weight_reps' else 'reps' end,'done',operation='log_workout')));
   end loop;
   if operation='create_routine' then
    -- App routine format: summary fields plus per-set setDetails for this exercise.
    routine_exercises := routine_exercises || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('name',btrim(ex->>'exercise'),
     'sets',i,'reps',coalesce((sets->-1->>'reps')::numeric,0),'kg',coalesce((sets->-1->>'kg')::numeric,0),'rest',coalesce(mfd_mcp.safe_num(ex->'rest_seconds'),90),
     'notes',nullif(btrim(coalesce(ex->>'notes','')),''),'setDetails',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(sets) x where (x->>'group')::int=g))));
   end if;
   g := g+1;
  end loop;
  if operation='create_routine' then
   entry := jsonb_build_object('id',eid,'name',nm,'folderId',null,'createdAt',(extract(epoch from now())*1000)::bigint,
    'updatedAt',(extract(epoch from now())*1000)::bigint,'exercises',routine_exercises);
  else
  started := (extract(epoch from (d+time '12:00'))*1000)::bigint;
  entry := jsonb_build_object('id',eid,'name',nm,'date',d::text,'started',started,
   'finished',started+(coalesce(mfd_mcp.safe_num(args->'duration_minutes'),0)*60000)::bigint,'routineId',null,'sets',sets);
  end if;
 elsif operation='log_meal' then
  amount := mfd_mcp.safe_num(args->'amount');
  if args ? 'food_id' then
   -- A saved food: its own values scaled to the amount, so nothing is estimated.
   if jsonb_typeof(args->'food_id') is distinct from 'string' or length(args->>'food_id')>200 then raise exception 'Invalid food_id' using errcode='22023'; end if;
   select v into food from (select v, 1 o from jsonb_array_elements(doc->'products') v where v->>'id'=args->>'food_id'
     union all select v->'labelFood', 2 from jsonb_array_elements(doc->'meals') v where v->'labelFood'->>'id'=args->>'food_id' order by o limit 1) t;
   if food is null or coalesce(mfd_mcp.safe_num(food->'basis'),0)<=0 or mfd_mcp.safe_num(food->'cal') is null then
    raise exception 'Saved food not found; use list_saved_foods' using errcode='22023'; end if;
   if coalesce(args->>'unit','') is distinct from coalesce(food->>'unit','g') then
    raise exception 'Use the food''s unit (%) for the amount', coalesce(food->>'unit','g') using errcode='22023'; end if;
   if args ? 'kcal' or args ? 'protein' or args ? 'carbs' or args ? 'fat' or args ? 'fibre' or args ? 'sugars' or args ? 'saturated_fat' or args ? 'salt' then
    raise exception 'Leave out kcal and nutrients when using food_id; they come from the saved food' using errcode='22023'; end if;
   factor := amount/mfd_mcp.safe_num(food->'basis');
   nm := coalesce(nullif(btrim(args->>'name'),''),food->>'name');
   kcal := round(mfd_mcp.safe_num(food->'cal')*factor,1); pr := round(coalesce(mfd_mcp.safe_num(food->'p'),0)*factor,1);
   cb := round(coalesce(mfd_mcp.safe_num(food->'c'),0)*factor,1); ft := round(coalesce(mfd_mcp.safe_num(food->'f'),0)*factor,1);
   -- The saved food's fibre, sugars, saturated fat and salt too, for the amount eaten.
   foreach xk in array array['sugar','saturates','fiber','salt'] loop
    xv := mfd_mcp.safe_num(food->xk);
    if xv is not null and xv>=0 then extras := extras||jsonb_build_object(xk,round(xv*factor,2)); end if;
   end loop;
  else
   nm := btrim(coalesce(args->>'name','')); kcal := mfd_mcp.safe_num(args->'kcal');
   pr := coalesce(mfd_mcp.safe_num(args->'protein'),0); cb := coalesce(mfd_mcp.safe_num(args->'carbs'),0); ft := coalesce(mfd_mcp.safe_num(args->'fat'),0);
   if kcal is null or nm='' then raise exception 'name and kcal are required unless you use a saved food (food_id)' using errcode='22023'; end if;
   -- Optional label values for the amount eaten: fibre, sugars, saturated fat (g) and salt (g).
   for xk, xv in select k, mfd_mcp.safe_num(args->a) from (values ('fibre','fiber'),('sugars','sugar'),('saturated_fat','saturates'),('salt','salt')) t(a,k) where args ? a loop
    if xv is null or xv not between 0 and 1000 then raise exception 'Invalid % (grams for the amount eaten, 0-1000)', case xk when 'fiber' then 'fibre' when 'sugar' then 'sugars' when 'saturates' then 'saturated_fat' else xk end using errcode='22023'; end if;
    extras := extras||jsonb_build_object(xk,xv);
   end loop;
  end if;
  if nm='' or length(nm)>120 or coalesce(args->>'meal','') not in ('breakfast','lunch','dinner','snack') or coalesce(args->>'unit','') not in ('g','ml','serving')
     or coalesce(amount not between 0.01 and 10000 or kcal not between 0 and 10000, true)
     or pr not between 0 and 1000 or cb not between 0 and 1000 or ft not between 0 and 1000
     or (args ? 'protein' and mfd_mcp.safe_num(args->'protein') is null) or (args ? 'carbs' and mfd_mcp.safe_num(args->'carbs') is null)
     or (args ? 'fat' and mfd_mcp.safe_num(args->'fat') is null) then
   raise exception 'Invalid meal' using errcode='22023'; end if;
  entry := jsonb_build_object('id',eid,'date',d::text,'name',nm,'meal',slot,'amount',amount,'unit',args->>'unit','cal',kcal,'p',pr,'c',cb,'f',ft)||extras||jsonb_build_object(
   'labelFood',coalesce(food,jsonb_build_object('id','mcp-'||eid,'name',nm,'basis',amount,'unit',args->>'unit','cal',kcal,'p',pr,'c',cb,'f',ft)||extras));
 else
  kg := mfd_mcp.safe_num(args->'kg');
  if coalesce(kg not between 20 and 400, true) then raise exception 'Invalid weight (20-400 kg)' using errcode='22023'; end if;
  entry := jsonb_build_object('id',eid,'date',d::text,'kg',kg);
 end if;
 entry := entry || jsonb_build_object('addedBy',jsonb_strip_nulls(jsonb_build_object('connection',conn,'at',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'request',rid,'fp',mfd_mcp.fingerprint(field,entry))));
 update public.forma_workspaces set payload=jsonb_set(payload,array[field],coalesce(payload->field,'[]'::jsonb)||jsonb_build_array(entry)),
  revision=revision+1, updated_at=now() where user_id=u returning revision into rev;
 return jsonb_build_object('id',eid,'revision',rev,'added',entry-'addedBy');
end $$;

revoke all on function mfd_mcp.analyze(text,jsonb,jsonb), mfd_mcp.add_entry(uuid,text,text,jsonb,date) from public,anon,authenticated;

commit;
