-- AI routines, after testing (2026-11-19).
--
-- 1. The right columns. create_routine used to guess how each exercise is tracked from the numbers the assistant
--    filled in: a plan with only reps made Chest Press a reps-only exercise (no KG column), and "10 minutes" made
--    Treadmill time-only (no km). Now a routine takes the type the person actually uses for that exercise
--    (mfd_mcp.known_tracking: the type in most of their recent sets, else one of their own routines); when it isn't
--    known the type is left out and the app uses its exercise library's type, as for any exercise added by hand.
--    start_workout does the same. log_workout is unchanged: a logged workout keeps the columns of the values logged.
-- 2. edit_routine (permission "log_routines"): rename a routine, add exercises to it, and change how many working
--    and warm-up sets an exercise has (new sets copy the last one; a new warm-up starts without a weight). It never
--    removes exercises and never changes weights or reps. The change is listed in the diary's "aiChanges" as
--    "routine_edit", with what is needed to undo it in the app; it counts towards the 30-a-day limit.
--
-- add_entry, start_workout and the router public.mfd_mcp are changed in place (one expression each, the same way as
-- mcp-read-tables.sql): if an expected line isn't found exactly once, nothing is applied. Safe to re-run.
-- Apply after mcp-full-nutrients.sql, mcp-start-workout.sql and mcp-ai-logging.sql.
begin;

-- How this person tracks an exercise (by name, any case): the type used in most of their sets in the last 200
-- workouts (the most recent wins a tie), else the type in one of their own routines (not ones an assistant made);
-- null when unknown.
create or replace function mfd_mcp.known_tracking(doc jsonb, name text) returns text language sql stable set search_path='' as $$
 with kinds(k) as (values ('weight_reps'),('reps'),('duration'),('weight_duration'),('distance_duration'),('weight_distance')),
 recent as (
  select value w, mfd_mcp.safe_num(value->'started') t from jsonb_array_elements(case when jsonb_typeof(doc->'sessions')='array' then doc->'sessions' else '[]' end)
  where jsonb_typeof(value)='object' order by 2 desc nulls last limit 200),
 used as (
  select s->>'tracking' k, count(*) n, max(t) last from recent, jsonb_array_elements(case when jsonb_typeof(w->'sets')='array' then w->'sets' else '[]' end) s
  where jsonb_typeof(s)='object' and lower(btrim(s->>'exercise'))=lower(btrim(name)) and s->>'tracking' in (select k from kinds) group by 1),
 planned as (
  select coalesce(d->>'tracking',e->>'tracking') k from jsonb_array_elements(case when jsonb_typeof(doc->'routines')='array' then doc->'routines' else '[]' end) r,
   jsonb_array_elements(case when jsonb_typeof(r->'exercises')='array' then r->'exercises' else '[]' end) e
   left join lateral (select x d from jsonb_array_elements(case when jsonb_typeof(e->'setDetails')='array' then e->'setDetails' else '[]' end) x limit 1) dd on true
  where r->'addedBy' is null and lower(btrim(e->>'name'))=lower(btrim(name)))
 select coalesce((select k from used order by n desc, last desc nulls last limit 1), (select k from planned where k in (select k from kinds) limit 1)) $$;
revoke all on function mfd_mcp.known_tracking(jsonb,text) from public,anon,authenticated;

-- The first n sets of `l`; more are copies of its last set (or of `tmpl` when it has none), without id or done state.
create or replace function mfd_mcp.resize_sets(l jsonb, n int, tmpl jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(case when k<=jsonb_array_length(l) then l->(k-1)
  else coalesce(l->-1,tmpl)-'id'-'done'-'mfdDoneAt'||jsonb_build_object('id',gen_random_uuid()::text) end order by k),'[]')
 from generate_series(1,n) k $$;
revoke all on function mfd_mcp.resize_sets(jsonb,int,jsonb) from public,anon,authenticated;

create or replace function mfd_mcp.edit_routine(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w record; doc jsonb; was jsonb; routine jsonb; pos int; exs jsonb; rev bigint; id text := gen_random_uuid()::text; rid text := args->>'request_id';
 nm text := btrim(coalesce(args->>'routine','')); new_name text; ex jsonb; st jsonb; c jsonb; g int; i int; idx int;
 kg numeric; reps numeric; dur numeric; dist numeric; rest_s numeric; nwork numeric; nwarm numeric;
 sets jsonb; details jsonb; warm jsonb; work jsonb; after jsonb; trk text; ex_name text;
 renamed_from text; set_changes jsonb := '[]'; added jsonb := '[]';
begin
 select * into w from mfd_mcp.ai_writer('log_routines', args);
 if nm='' or length(nm)>80 then raise exception 'routine: the exact name from get_routines' using errcode='22023'; end if;
 if not (args ? 'new_name' or args ? 'add_exercises' or args ? 'sets') then
  raise exception 'Give new_name, add_exercises and/or sets' using errcode='22023'; end if;
 doc := mfd_mcp.ai_doc(w.u);
 was := mfd_mcp.ai_repeat(doc, w.conn, rid);
 if was is not null then return jsonb_build_object('id',was->>'id','duplicate',true); end if;
 select e, n::int-1 into routine, pos from jsonb_array_elements(doc->'routines') with ordinality x(e,n) where lower(btrim(e->>'name'))=lower(nm) order by n limit 1;
 if routine is null then raise exception 'No routine called "%"; use the exact name from get_routines', nm using errcode='22023'; end if;
 exs := case when jsonb_typeof(routine->'exercises')='array' then routine->'exercises' else '[]' end;

 -- Rename.
 if args ? 'new_name' then
  new_name := btrim(coalesce(args->>'new_name',''));
  if jsonb_typeof(args->'new_name') is distinct from 'string' or new_name='' or length(new_name)>80 then
   raise exception 'new_name must be 1 to 80 characters' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(doc->'routines') e where e->>'id' is distinct from routine->>'id' and lower(btrim(e->>'name'))=lower(new_name)) then
   raise exception 'A routine named "%" already exists. Choose another name.', new_name using errcode='22023'; end if;
  if new_name is distinct from routine->>'name' then renamed_from := routine->>'name'; routine := routine||jsonb_build_object('name',new_name); end if;
 end if;

 -- Number of working and warm-up sets of exercises already in the routine.
 if args ? 'sets' then
  if jsonb_typeof(args->'sets') is distinct from 'array' or jsonb_array_length(args->'sets') not between 1 and 30 then
   raise exception 'sets: a list of {exercise, working_sets, warmup_sets}' using errcode='22023'; end if;
  for c in select value from jsonb_array_elements(args->'sets') loop
   nwork := mfd_mcp.safe_num(c->'working_sets'); nwarm := mfd_mcp.safe_num(c->'warmup_sets');
   if jsonb_typeof(c) is distinct from 'object' or coalesce(btrim(c->>'exercise'),'')='' or not (c ? 'working_sets' or c ? 'warmup_sets')
      or (c ? 'working_sets' and (nwork is null or nwork<>trunc(nwork) or nwork not between 1 and 20))
      or (c ? 'warmup_sets' and (nwarm is null or nwarm<>trunc(nwarm) or nwarm not between 0 and 10)) then
    raise exception 'Each sets item: exercise, and working_sets (1-20) and/or warmup_sets (0-10)' using errcode='22023'; end if;
   idx := null;
   select n::int-1 into idx from jsonb_array_elements(exs) with ordinality x(e,n) where lower(btrim(e->>'name'))=lower(btrim(c->>'exercise')) order by n limit 1;
   if idx is null then raise exception 'No exercise "%" in routine "%"; use the names from get_routines', btrim(c->>'exercise'), routine->>'name' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(set_changes) s where (s->>'index')::int=idx) then
    raise exception '"%" is listed twice in sets', btrim(c->>'exercise') using errcode='22023'; end if;
   ex := exs->idx;
   -- Sets as the app reads them (a routine saved without per-set details has sets x reps at one weight).
   details := case when jsonb_typeof(ex->'setDetails')='array' and jsonb_array_length(ex->'setDetails')>0 then ex->'setDetails'
    else (select jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'kg',coalesce(ex->'kg','0'),'reps',coalesce(ex->'reps','10'),'type','normal'))
          from generate_series(1,greatest(1,coalesce(mfd_mcp.safe_num(ex->'sets'),1)::int))) end;
   select coalesce(jsonb_agg(s order by n) filter (where s->>'type'='warmup'),'[]'), coalesce(jsonb_agg(s order by n) filter (where s->>'type' is distinct from 'warmup'),'[]')
    into warm, work from jsonb_array_elements(details) with ordinality x(s,n);
   if c ? 'working_sets' then work := mfd_mcp.resize_sets(work, nwork::int, jsonb_build_object('type','normal','exercise',ex->>'name')); end if;
   -- A new warm-up repeats the first working set's reps, without a weight (the person picks it).
   if c ? 'warmup_sets' then warm := mfd_mcp.resize_sets(warm, nwarm::int, coalesce(work->0,'{}')-'kg'||jsonb_build_object('type','warmup')); end if;
   select jsonb_agg(s||jsonb_build_object('set',n) order by n) into after from jsonb_array_elements(warm||work) with ordinality x(s,n);
   if after is distinct from (select jsonb_agg(s||jsonb_build_object('set',n) order by n) from jsonb_array_elements(details) with ordinality x(s,n)) then
    set_changes := set_changes||jsonb_build_array(jsonb_build_object('index',idx,'exercise',ex->>'name','before',details,'after',jsonb_array_length(after)));
    exs := jsonb_set(exs, array[idx::text], ex||jsonb_build_object('setDetails',after,'sets',jsonb_array_length(after)));
   end if;
  end loop;
 end if;

 -- New exercises at the end, built like create_routine's.
 if args ? 'add_exercises' then
  if jsonb_typeof(args->'add_exercises') is distinct from 'array' or jsonb_array_length(args->'add_exercises') not between 1 and 10 then
   raise exception 'add_exercises: 1 to 10 exercises' using errcode='22023'; end if;
  if jsonb_array_length(exs)+jsonb_array_length(args->'add_exercises')>30 then raise exception 'A routine has at most 30 exercises' using errcode='22023'; end if;
  g := jsonb_array_length(exs);
  for ex in select value from jsonb_array_elements(args->'add_exercises') loop
   rest_s := mfd_mcp.safe_num(ex->'rest_seconds'); ex_name := btrim(coalesce(ex->>'exercise',''));
   if jsonb_typeof(ex) is distinct from 'object' or jsonb_typeof(ex->'exercise') is distinct from 'string' or ex_name='' or length(ex_name)>80
      or jsonb_typeof(ex->'sets') is distinct from 'array' or jsonb_array_length(ex->'sets') not between 1 and 20
      or (ex ? 'rest_seconds' and (rest_s is null or rest_s<>trunc(rest_s) or rest_s not between 0 and 900)) or length(coalesce(ex->>'notes',''))>300 then
    raise exception 'Invalid exercise % in add_exercises', g-jsonb_array_length(routine->'exercises')+1 using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(exs) e where lower(btrim(e->>'name'))=lower(ex_name)) then
    raise exception '"%" is already in routine "%"; change its sets instead', ex_name, routine->>'name' using errcode='22023'; end if;
   trk := mfd_mcp.known_tracking(doc, ex_name); sets := '[]'; i := 0;
   for st in select value from jsonb_array_elements(ex->'sets') loop
    i := i+1; kg := mfd_mcp.safe_num(st->'kg'); reps := mfd_mcp.safe_num(st->'reps'); dur := mfd_mcp.safe_num(st->'duration_seconds'); dist := mfd_mcp.safe_num(st->'distance_meters');
    if jsonb_typeof(st) is distinct from 'object' or (kg is null and reps is null and dur is null and dist is null)
       or (st ? 'kg' and kg is null) or (st ? 'reps' and reps is null) or (st ? 'duration_seconds' and dur is null) or (st ? 'distance_meters' and dist is null)
       or coalesce(kg not between 0 and 1000 or reps not between 0 and 1000 or reps<>trunc(reps) or dur not between 0 and 86400 or dur<>trunc(dur) or dist not between 0 and 1000000, false)
       or coalesce(st->>'type','normal') not in ('warmup','normal','failure','dropset') then
     raise exception 'Invalid set % of "%"', i, ex_name using errcode='22023'; end if;
    sets := sets||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id',gen_random_uuid()::text,'exercise',ex_name,'group',g,'set',i,'type',coalesce(st->>'type','normal'),
     'kg',kg,'reps',reps,'duration_seconds',dur,'distance_meters',dist,'tracking',trk,'done',false)));
   end loop;
   exs := exs||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('name',ex_name,'sets',i,'reps',coalesce((sets->-1->>'reps')::numeric,0),'kg',coalesce((sets->-1->>'kg')::numeric,0),
    'rest',coalesce(rest_s,90),'notes',nullif(btrim(coalesce(ex->>'notes','')),''),'setDetails',sets)));
   added := added||to_jsonb(ex_name); g := g+1;
  end loop;
 end if;

 if renamed_from is null and set_changes='[]' and added='[]' then
  return jsonb_build_object('routine',routine->>'name','unchanged',true); end if;
 perform mfd_mcp.ai_count(w.u, w.conn, w.today);
 routine := routine||jsonb_build_object('exercises',exs,'updatedAt',(extract(epoch from now())*1000)::bigint);
 doc := jsonb_set(doc, array['routines',pos::text], routine);
 rev := mfd_mcp.ai_save(w.u, doc, jsonb_strip_nulls(jsonb_build_object('id',id,'kind','routine_edit','routineId',routine->>'id','name',routine->>'name',
  'renamedFrom',renamed_from,'sets',nullif(set_changes,'[]'),'added',nullif(jsonb_array_length(added),0),'addedNames',nullif(added,'[]'),
  'count',jsonb_array_length(exs),
  'addedBy',mfd_mcp.ai_by(w.conn,rid))));
 return jsonb_strip_nulls(jsonb_build_object('id',id,'revision',rev,'routine',routine->>'name','renamed_from',renamed_from,
  'sets_changed',(select nullif(jsonb_agg(jsonb_build_object('exercise',s->>'exercise','sets',s->'after')),'[]') from jsonb_array_elements(set_changes) s),
  'exercises_added',nullif(added,'[]'),'note','Saved. The user can undo it in the app (AI assistants).'));
end $$;
revoke all on function mfd_mcp.edit_routine(jsonb) from public,anon;
grant execute on function mfd_mcp.edit_routine(jsonb) to authenticated;

do $patch$
declare fn regprocedure; old text; new text; def text; n int;
begin
 for fn, old, new in select * from (values
  -- create_routine: the person's type for the exercise, else none (the app's library decides).
  ('mfd_mcp.add_entry(uuid,text,text,jsonb,date)'::regprocedure,
   $o$'tracking',case when dist is not null then 'distance_duration'$o$,
   $n$'tracking',case when operation='create_routine' then mfd_mcp.known_tracking(doc,btrim(ex->>'exercise')) when dist is not null then 'distance_duration'$n$),
  ('mfd_mcp.start_workout(jsonb)'::regprocedure,
   $o$'tracking',coalesce(trk,case when dist is not null then 'distance_duration' when dur is not null and kg is not null then 'weight_duration'
       when dur is not null then 'duration' when kg is not null then 'weight_reps' end)$o$,
   $n$'tracking',mfd_mcp.known_tracking(doc,btrim(ex->>'exercise'))$n$),
  ('public.mfd_mcp(text,jsonb)'::regprocedure,
   $o$  when operation='move_routine' then mfd_mcp.move_routine(args)$o$,
   $n$  when operation='move_routine' then mfd_mcp.move_routine(args)
  when operation='edit_routine' then mfd_mcp.edit_routine(args)$n$)
 ) v(fn, old, new) loop
  def := pg_get_functiondef(fn);
  if position(new in def) > 0 then continue; end if;          -- already changed (re-run)
  n := (length(def) - length(replace(def, old, ''))) / length(old);
  if n <> 1 then raise exception '% : expected the line once, found it % times; nothing was changed', fn, n; end if;
  execute replace(def, old, new);
 end loop;
end $patch$;

commit;
