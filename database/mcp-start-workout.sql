-- AI assistant starts a workout (MFD 1.1): the connector tool start_workout.
-- Opens a NEW in-progress workout in the app with the exercises the assistant chose (or one of the user's
-- routines by name). Planned weights/reps arrive as the faded values the app shows for a routine; nothing is
-- ticked or logged. Never replaces a workout that is already running (its sets would be lost): the user
-- finishes or discards it first. Stored in the diary's "active" key, the same shape the app writes.
--
-- Safe to re-run. Apply after mcp-suggest-targets.sql. Leaves mfd_mcp.dispatch untouched: the public entry
-- point routes this operation to mfd_mcp.start_workout, which repeats the dispatcher's checks (live session,
-- connector audience, the connection's consent for "log_routines", writes enabled).
begin;

create or replace function mfd_mcp.start_workout(args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid(); c text := auth.jwt()->>'client_id'; conn text := args->>'connection';
 tz text; today date; doc jsonb; rev bigint; used integer; rid text := args->>'request_id';
 routine jsonb; ex jsonb; st jsonb; i integer; g integer := 0; kg numeric; reps numeric; dur numeric; dist numeric;
 sets jsonb := '[]'; rest jsonb := '{}'; nm text; eid text := gen_random_uuid()::text; cat text; trk text; active jsonb;
 started bigint := (extract(epoch from now())*1000)::bigint; source jsonb; rest_s numeric;
begin
 -- Same session, audience and consent checks as mfd_mcp.dispatch.
 if u is null or not exists (
  select 1 from auth.sessions s
  where s.id::text=auth.jwt()->>'session_id' and s.user_id=u and (s.not_after is null or s.not_after>now())
   and exists (select 1 from auth.refresh_tokens rt where rt.session_id=s.id and rt.user_id=u::text and rt.revoked=false)
 ) then raise exception 'Active session required' using errcode='42501'; end if;
 if auth.jwt()->>'aud' is distinct from (select resource_uri from mfd_mcp.settings where id) or not exists(select 1 from mfd_mcp.clients where client_id=c) then
  raise exception 'Invalid audience' using errcode='42501'; end if;
 if conn is null or conn !~ '^[[:graph:]]+$' or length(conn)>512 then raise exception 'Connection required' using errcode='42501'; end if;
 select g2.timezone into tz from mfd_mcp.grants g2 where user_id=u and client_id=conn and 'log_routines'=any(permissions) for share;
 if not found then raise exception 'Consent required' using errcode='42501'; end if;
 today := (now() at time zone coalesce(tz,'UTC'))::date;
 if not (select writes_enabled from mfd_mcp.settings where id) then
  raise exception 'Adding entries is turned off for this diary' using errcode='22023'; end if;

 -- Input: either a routine name, or 1-30 exercises (not both).
 if args ? 'request_id' and (jsonb_typeof(args->'request_id') is distinct from 'string' or rid !~ '^[A-Za-z0-9_-]+$' or length(rid)>64) then
  raise exception 'Invalid request_id' using errcode='22023'; end if;
 if (args ? 'routine') = (args ? 'exercises') then
  raise exception 'Give either a routine name or a list of exercises' using errcode='22023'; end if;
 if args ? 'name' and (jsonb_typeof(args->'name') is distinct from 'string' or length(args->>'name')>80) then
  raise exception 'Invalid workout name' using errcode='22023'; end if;
 if args ? 'routine' and (jsonb_typeof(args->'routine') is distinct from 'string' or btrim(args->>'routine')='' or length(args->>'routine')>80) then
  raise exception 'Invalid routine name' using errcode='22023'; end if;
 if args ? 'exercises' and (jsonb_typeof(args->'exercises') is distinct from 'array' or jsonb_array_length(args->'exercises') not between 1 and 30) then
  raise exception 'Invalid workout: give 1-30 exercises' using errcode='22023'; end if;

 -- Row lock: concurrent writes, the running-workout check and the daily count serialize.
 select payload into doc from public.forma_workspaces where user_id=u for update;
 if not found then raise exception 'Open the diary app once before starting a workout' using errcode='22023'; end if;
 if jsonb_typeof(doc->'routines') is distinct from 'array' or jsonb_typeof(doc->'sessions') is distinct from 'array' then
  raise exception 'Finish setting up the diary app first' using errcode='22023'; end if;
 if jsonb_typeof(doc->'active')='object' then
  if rid is not null and doc->'active'->'addedBy'->>'connection'=conn and doc->'active'->'addedBy'->>'request'=rid then
   return jsonb_build_object('id',doc->'active'->>'id','duplicate',true,'today',today); end if;
  raise exception 'A workout is already in progress ("%"). Ask the user to finish or discard it in the app first.', coalesce(doc->'active'->>'name','Workout') using errcode='22023';
 end if;

 if args ? 'routine' then
  select r into routine from jsonb_array_elements(doc->'routines') r where lower(btrim(r->>'name'))=lower(btrim(args->>'routine')) limit 1;
  if routine is null then raise exception 'Routine "%" not found; use get_routines and give its exact name', btrim(args->>'routine') using errcode='22023'; end if;
  nm := coalesce(nullif(btrim(coalesce(args->>'name','')),''),routine->>'name');
  -- The routine's own planned sets, exactly as starting it in the app would.
  for ex in select value from jsonb_array_elements(coalesce(routine->'exercises','[]')) loop
   i := 0;
   for st in select value from jsonb_array_elements(coalesce(nullif(ex->'setDetails','[]'::jsonb),
     (select coalesce(jsonb_agg(jsonb_build_object('kg',ex->'kg','reps',ex->'reps')),'[]') from generate_series(1,greatest(1,least(20,coalesce((ex->>'sets')::int,1))))))) loop
    i := i+1;
    sets := sets || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id',eid||':'||g||':'||i,'exercise',coalesce(st->>'exercise',ex->>'name'),'group',g,'set',i,
     'type',coalesce(st->>'type','normal'),'kg',st->'kg','reps',st->'reps','duration_seconds',st->'duration_seconds','distance_meters',st->'distance_meters',
     'tracking',coalesce(st->>'tracking',ex->>'tracking'),'catalogId',coalesce(nullif(ex->>'catalogId',''),nullif(st->>'catalogId','')),'catalogSource',coalesce(ex->>'catalogSource',st->>'catalogSource'),'done',false)));
   end loop;
   rest := rest || jsonb_build_object(g::text,jsonb_build_object('duration',coalesce(mfd_mcp.safe_num(ex->'rest'),90),'end',0));
   g := g+1;
  end loop;
  if g=0 then raise exception 'Routine "%" has no exercises', routine->>'name' using errcode='22023'; end if;
 else
  nm := coalesce(nullif(btrim(coalesce(args->>'name','')),''),'Workout');
  for ex in select value from jsonb_array_elements(args->'exercises') loop
   rest_s := mfd_mcp.safe_num(ex->'rest_seconds');
   if jsonb_typeof(ex) is distinct from 'object' or jsonb_typeof(ex->'exercise') is distinct from 'string' or btrim(ex->>'exercise')='' or length(ex->>'exercise')>80
      or jsonb_typeof(ex->'sets') is distinct from 'array' or jsonb_array_length(ex->'sets') not between 1 and 20
      or (ex ? 'rest_seconds' and (rest_s is null or rest_s not between 0 and 900 or rest_s<>trunc(rest_s))) then
    raise exception 'Invalid exercise %', g+1 using errcode='22023'; end if;
   -- Link to the app's catalogue exercise and reuse how it's tracked: the same name in the user's routines or past
   -- workouts (most recent first). Without that, a reps-only plan leaves the type to the app's catalogue
   -- (Goblet Squat → weight × reps, Push-Up → reps) instead of guessing.
   cat := null; trk := null;
   select x.cat, x.trk into cat, trk from (
    select nullif(e->>'catalogId','') cat, coalesce(nullif(d->>'tracking',''),nullif(e->>'tracking','')) trk, 0 o from jsonb_array_elements(doc->'routines') r, jsonb_array_elements(coalesce(r->'exercises','[]')) e
     left join lateral (select x2 d from jsonb_array_elements(coalesce(e->'setDetails','[]')) x2 limit 1) dd on true
     where lower(btrim(e->>'name'))=lower(btrim(ex->>'exercise'))
    union all
    select nullif(s->>'catalogId',''), nullif(s->>'tracking',''), 1 from (select value w from jsonb_array_elements(doc->'sessions') order by (value->>'started') desc nulls last limit 200) w2, jsonb_array_elements(coalesce(w2.w->'sets','[]')) s
     where lower(btrim(s->>'exercise'))=lower(btrim(ex->>'exercise'))) x
   where x.cat is not null or x.trk is not null order by (x.cat is null), x.o limit 1;
   i := 0;
   for st in select value from jsonb_array_elements(ex->'sets') loop
    i := i+1; kg := mfd_mcp.safe_num(st->'kg'); reps := mfd_mcp.safe_num(st->'reps'); dur := mfd_mcp.safe_num(st->'duration_seconds'); dist := mfd_mcp.safe_num(st->'distance_meters');
    if jsonb_typeof(st) is distinct from 'object' or (kg is null and reps is null and dur is null and dist is null)
       or (st ? 'kg' and kg is null) or (st ? 'reps' and reps is null) or (st ? 'duration_seconds' and dur is null) or (st ? 'distance_meters' and dist is null)
       or coalesce(kg not between 0 and 1000 or reps not between 0 and 1000 or reps<>trunc(reps) or dur not between 0 and 86400 or dur<>trunc(dur) or dist not between 0 and 1000000, false)
       or coalesce(st->>'type','normal') not in ('warmup','normal','failure','dropset') then
     raise exception 'Invalid set % of exercise %', i, g+1 using errcode='22023'; end if;
    sets := sets || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id',eid||':'||g||':'||i,'exercise',btrim(ex->>'exercise'),'group',g,'set',i,
     'type',coalesce(st->>'type','normal'),'kg',kg,'reps',reps,'duration_seconds',dur,'distance_meters',dist,'catalogId',cat,
     'tracking',coalesce(trk,case when dist is not null then 'distance_duration' when dur is not null and kg is not null then 'weight_duration'
       when dur is not null then 'duration' when kg is not null then 'weight_reps' end),'done',false)));
   end loop;
   rest := rest || jsonb_build_object(g::text,jsonb_build_object('duration',coalesce(rest_s,90),'end',0));
   g := g+1;
  end loop;
 end if;
 if length(nm)>80 then nm := left(nm,80); end if;

 delete from mfd_mcp.write_counts where user_id=u and day<today-7;
 insert into mfd_mcp.write_counts as w values(u,conn,today,1)
  on conflict(user_id,connection,day) do update set n=w.n+1 returning n into used;
 if used>30 then raise exception 'Daily limit of 30 new entries for this app reached; try again tomorrow' using errcode='22023'; end if;
 if octet_length(doc::text)>7500000 then raise exception 'Diary is too large to start a workout here' using errcode='22023'; end if;

 active := jsonb_strip_nulls(jsonb_build_object('id',eid,'name',nm,'routineId',routine->>'id','unplanned',routine is null,'date',today::text,'started',started,
  'sets',sets,'rest',rest,
  'addedBy',jsonb_strip_nulls(jsonb_build_object('connection',conn,'at',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'request',rid))));
 update public.forma_workspaces set payload=jsonb_set(payload,'{active}',active), revision=revision+1, updated_at=now()
  where user_id=u returning revision into rev;
 return jsonb_build_object('id',eid,'revision',rev,'today',today,'name',nm,'routine',routine->>'name','exercises',g,
  'note','The workout is open in the app now: the user ticks each set as they do it.');
end $$;
revoke all on function mfd_mcp.start_workout(jsonb) from public,anon;
grant execute on function mfd_mcp.start_workout(jsonb) to authenticated;

-- Route the AI-only operations; everything else still goes to mfd_mcp.dispatch unchanged.
create or replace function public.mfd_mcp(operation text,args jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
 select case operation when 'suggest_workout_targets' then mfd_mcp.suggest(args) when 'start_workout' then mfd_mcp.start_workout(args) else mfd_mcp.dispatch(operation,args) end
$$;
revoke all on function public.mfd_mcp(text,jsonb) from public,anon;
grant execute on function public.mfd_mcp(text,jsonb) to authenticated;
commit;
