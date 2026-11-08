-- AI workout suggestions (MFD 1.0): the connector tool suggest_workout_targets.
-- The assistant only PROPOSES target sets for one of the user's routines. It never changes routines or
-- logged workouts. The app shows the suggestion; the user may Use it, which only fills faded values that
-- become real when a set is ticked. Stored in the diary under "aiSuggestions" (the app's compat layer).
--
-- Safe to re-run. Apply after mcp-production.sql (production) / the staging connector SQL.
-- Leaves mfd_mcp.dispatch untouched: the public entry point routes only this one operation to
-- mfd_mcp.suggest, which repeats the dispatcher's checks (live session, connector audience, the
-- connection's consent for "log_routines", writes enabled) before validating and appending.
begin;

create or replace function mfd_mcp.suggest(args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid(); c text := auth.jwt()->>'client_id'; conn text := args->>'connection';
 tz text; today date; doc jsonb; rev bigint; used integer; rid text := args->>'request_id'; existing text;
 routine jsonb; ex jsonb; st jsonb; i integer; g integer := 0; kg numeric; reps numeric; dur numeric; dist numeric;
 exercises jsonb := '[]'; sets jsonb; entry jsonb; eid text := gen_random_uuid()::text; kept jsonb;
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

 -- Input
 if jsonb_typeof(args->'routine') is distinct from 'string' or btrim(args->>'routine')='' or length(args->>'routine')>80
    or jsonb_typeof(args->'exercises') is distinct from 'array' or jsonb_array_length(args->'exercises') not between 1 and 30
    or (args ? 'note' and (jsonb_typeof(args->'note') is distinct from 'string' or length(args->>'note')>300)) then
  raise exception 'Invalid suggestion: give a routine name and 1-30 exercises' using errcode='22023'; end if;
 if args ? 'request_id' and (jsonb_typeof(args->'request_id') is distinct from 'string' or rid !~ '^[A-Za-z0-9_-]+$' or length(rid)>64) then
  raise exception 'Invalid request_id' using errcode='22023'; end if;
 for ex in select value from jsonb_array_elements(args->'exercises') loop
  if jsonb_typeof(ex) is distinct from 'object' or jsonb_typeof(ex->'exercise') is distinct from 'string' or btrim(ex->>'exercise')='' or length(ex->>'exercise')>80
     or (ex ? 'reason' and (jsonb_typeof(ex->'reason') is distinct from 'string' or length(ex->>'reason')>300))
     or jsonb_typeof(ex->'sets') is distinct from 'array' or jsonb_array_length(ex->'sets') not between 1 and 20 then
   raise exception 'Invalid exercise %', g+1 using errcode='22023'; end if;
  sets := '[]'; i := 0;
  for st in select value from jsonb_array_elements(ex->'sets') loop
   i := i+1; kg := mfd_mcp.safe_num(st->'kg'); reps := mfd_mcp.safe_num(st->'reps'); dur := mfd_mcp.safe_num(st->'duration_seconds'); dist := mfd_mcp.safe_num(st->'distance_meters');
   if jsonb_typeof(st) is distinct from 'object' or (kg is null and reps is null and dur is null and dist is null)
      or (st ? 'kg' and kg is null) or (st ? 'reps' and reps is null) or (st ? 'duration_seconds' and dur is null) or (st ? 'distance_meters' and dist is null)
      or coalesce(kg not between 0 and 1000 or reps not between 0 and 1000 or reps<>trunc(reps) or dur not between 0 and 86400 or dur<>trunc(dur) or dist not between 0 and 1000000, false)
      or coalesce(st->>'type','normal') not in ('warmup','normal','failure','dropset') then
    raise exception 'Invalid set % of exercise %', i, g+1 using errcode='22023'; end if;
   sets := sets || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('type',nullif(coalesce(st->>'type','normal'),'normal'),'kg',kg,'reps',reps,'duration_seconds',dur,'distance_meters',dist)));
  end loop;
  exercises := exercises || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('exercise',btrim(ex->>'exercise'),'reason',nullif(btrim(coalesce(ex->>'reason','')),''),'sets',sets)));
  g := g+1;
 end loop;

 -- Row lock: concurrent writes, the duplicate check and the daily count serialize.
 select payload into doc from public.forma_workspaces where user_id=u for update;
 if not found then raise exception 'Open the diary app once before adding suggestions' using errcode='22023'; end if;
 if jsonb_typeof(doc->'routines') is distinct from 'array' then raise exception 'Finish setting up the diary app first' using errcode='22023'; end if;
 select r into routine from jsonb_array_elements(doc->'routines') r where lower(btrim(r->>'name'))=lower(btrim(args->>'routine')) limit 1;
 if routine is null then raise exception 'Routine "%" not found; use get_routines and give its exact name', btrim(args->>'routine') using errcode='22023'; end if;
 if rid is not null then
  select e->>'id' into existing from jsonb_array_elements(coalesce(doc->'aiSuggestions','[]')) e
   where e->'addedBy'->>'connection'=conn and e->'addedBy'->>'request'=rid limit 1;
  if existing is not null then return jsonb_build_object('id',existing,'duplicate',true,'today',today); end if;
 end if;
 delete from mfd_mcp.write_counts where user_id=u and day<today-7;
 insert into mfd_mcp.write_counts as w values(u,conn,today,1)
  on conflict(user_id,connection,day) do update set n=w.n+1 returning n into used;
 if used>30 then raise exception 'Daily limit of 30 new entries for this app reached; try again tomorrow' using errcode='22023'; end if;
 if octet_length(doc::text)>7500000 then raise exception 'Diary is too large to add suggestions here' using errcode='22023'; end if;

 entry := jsonb_strip_nulls(jsonb_build_object('id',eid,'routineId',routine->>'id','routineName',routine->>'name',
  'createdAt',(extract(epoch from now())*1000)::bigint,'status','pending','note',nullif(btrim(coalesce(args->>'note','')),''),'exercises',exercises,
  'addedBy',jsonb_strip_nulls(jsonb_build_object('connection',conn,'at',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'request',rid))));
 -- Keep the newest 30 (older ones have expired long before).
 select coalesce(jsonb_agg(v order by n),'[]') into kept from (
  select v, n from jsonb_array_elements(coalesce(doc->'aiSuggestions','[]') || jsonb_build_array(entry)) with ordinality t(v,n)
  order by n desc limit 30) x;
 update public.forma_workspaces set payload=jsonb_set(payload,'{aiSuggestions}',kept), revision=revision+1, updated_at=now()
  where user_id=u returning revision into rev;
 return jsonb_build_object('id',eid,'revision',rev,'today',today,'routine',routine->>'name','exercises',jsonb_array_length(exercises));
end $$;
revoke all on function mfd_mcp.suggest(jsonb) from public,anon;
grant execute on function mfd_mcp.suggest(jsonb) to authenticated;

-- Route only the new operation; everything else still goes to mfd_mcp.dispatch unchanged.
create or replace function public.mfd_mcp(operation text,args jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
 select case when operation='suggest_workout_targets' then mfd_mcp.suggest(args) else mfd_mcp.dispatch(operation,args) end
$$;
revoke all on function public.mfd_mcp(text,jsonb) from public,anon;
grant execute on function public.mfd_mcp(text,jsonb) to authenticated;
commit;
