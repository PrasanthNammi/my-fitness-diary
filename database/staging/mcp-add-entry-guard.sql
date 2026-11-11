-- Update only mfd_mcp.add_entry: refuse to add to a workspace the app cannot load.
-- Safe to re-run; does not touch connections (grants) or data.
begin;
create or replace function mfd_mcp.add_entry(u uuid, conn text, operation text, args jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare field text; doc jsonb; entry jsonb; eid text := gen_random_uuid()::text; d date := mfd_mcp.safe_date(args->>'date');
 rid text := args->>'request_id'; existing text; used integer; rev bigint; sets jsonb := '[]'; g integer := 0; i integer;
 ex jsonb; st jsonb; kg numeric; reps numeric; dur numeric; dist numeric; rpe numeric; started bigint; nm text;
 amount numeric; kcal numeric; pr numeric; cb numeric; ft numeric; routine_exercises jsonb := '[]';
begin
 field := case operation when 'log_workout' then 'sessions' when 'create_routine' then 'routines' when 'log_meal' then 'meals' when 'log_weight' then 'weights' end;
 if field is null then raise exception 'Unknown operation' using errcode='22023'; end if;
 if operation<>'create_routine' and (d is null or d<date '2000-01-01' or d>current_date+1) then raise exception 'Invalid date (YYYY-MM-DD, not in the future)' using errcode='22023'; end if;
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
 delete from mfd_mcp.write_counts where user_id=u and day<current_date-7;
 insert into mfd_mcp.write_counts as w values(u,conn,current_date,1)
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
  nm := btrim(coalesce(args->>'name','')); amount := mfd_mcp.safe_num(args->'amount'); kcal := mfd_mcp.safe_num(args->'kcal');
  pr := coalesce(mfd_mcp.safe_num(args->'protein'),0); cb := coalesce(mfd_mcp.safe_num(args->'carbs'),0); ft := coalesce(mfd_mcp.safe_num(args->'fat'),0);
  if nm='' or length(nm)>120 or coalesce(args->>'meal','') not in ('breakfast','lunch','dinner','snack') or coalesce(args->>'unit','') not in ('g','ml','serving')
     or coalesce(amount not between 0.01 and 10000 or kcal not between 0 and 10000, true)
     or pr not between 0 and 1000 or cb not between 0 and 1000 or ft not between 0 and 1000
     or (args ? 'protein' and mfd_mcp.safe_num(args->'protein') is null) or (args ? 'carbs' and mfd_mcp.safe_num(args->'carbs') is null)
     or (args ? 'fat' and mfd_mcp.safe_num(args->'fat') is null) then
   raise exception 'Invalid meal' using errcode='22023'; end if;
  entry := jsonb_build_object('id',eid,'date',d::text,'name',nm,'meal',initcap(args->>'meal'),'amount',amount,'unit',args->>'unit',
   'cal',kcal,'p',pr,'c',cb,'f',ft,'labelFood',jsonb_build_object('id','mcp-'||eid,'name',nm,'basis',amount,'unit',args->>'unit','cal',kcal,'p',pr,'c',cb,'f',ft));
 else
  kg := mfd_mcp.safe_num(args->'kg');
  if coalesce(kg not between 20 and 400, true) then raise exception 'Invalid weight (20-400 kg)' using errcode='22023'; end if;
  entry := jsonb_build_object('id',eid,'date',d::text,'kg',kg);
 end if;
 entry := entry || jsonb_build_object('addedBy',jsonb_strip_nulls(jsonb_build_object('connection',conn,'at',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'request',rid)));
 update public.forma_workspaces set payload=jsonb_set(payload,array[field],coalesce(payload->field,'[]'::jsonb)||jsonb_build_array(entry)),
  revision=revision+1, updated_at=now() where user_id=u returning revision into rev;
 return jsonb_build_object('id',eid,'revision',rev,'added',entry-'addedBy');
end $$;
revoke all on function mfd_mcp.safe_date(text), mfd_mcp.safe_num(jsonb), mfd_mcp.in_range(text,jsonb),
 mfd_mcp.analyze(text,jsonb,jsonb), mfd_mcp.add_entry(uuid,text,text,jsonb) from public,anon,authenticated;
commit;
