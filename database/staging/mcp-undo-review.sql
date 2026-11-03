-- Undo review (staging and production): list what an AI app added in the last 24 hours and
-- undo only the entries the user ticks. Replaces undo_entries and the dispatcher; adds the
-- review list. Safe to re-run; keeps connections and data. Run BEFORE deploying the Worker.
begin;
-- AI entries still in the undo window: tagged by an app, added in the last 24 hours.
create or replace function mfd_mcp.recent_ai(v jsonb, conn text) returns boolean language sql stable set search_path='' as $$
 select coalesce(v->'addedBy'->>'connection'=conn and case when coalesce(v->'addedBy'->>'at','') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'
  then (v->'addedBy'->>'at')::timestamptz>now()-interval '24 hours' else false end, false) $$;

-- What an app added in the last 24 hours, for the user's review page (signed-in browser only).
-- unchanged=false means the user edited it in the app; undo keeps those.
create or replace function mfd_mcp.recent_ai_entries(u uuid, conn text) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(x order by x->>'at' desc, x->>'id'),'[]') from (
  select jsonb_strip_nulls(jsonb_build_object('kind',f,'id',v->>'id','at',v->'addedBy'->>'at','date',v->>'date',
    'unchanged',coalesce(v->'addedBy'->>'fp'=mfd_mcp.fingerprint(f,v),false),'name',left(v->>'name',80),'meal',v->>'meal',
    'kg',mfd_mcp.safe_num(v->'kg'),'kcal',round(mfd_mcp.safe_num(v->'cal')),
    'sets',case when f='sessions' and jsonb_typeof(v->'sets')='array' then jsonb_array_length(v->'sets') end,
    'exercises',case when f='routines' and jsonb_typeof(v->'exercises')='array' then jsonb_array_length(v->'exercises') end)) x
  from public.forma_workspaces w, unnest(array['sessions','routines','meals','weights']) f,
   jsonb_array_elements(case when jsonb_typeof(w.payload->f)='array' then w.payload->f else '[]'::jsonb end) v
  where w.user_id=u and mfd_mcp.recent_ai(v,conn) and coalesce(v->>'id','')<>''
  limit 200) t $$;

-- User-side undo (signed-in browser only): remove this app's entries from the last 24 hours
-- that are still exactly as the app added them; with ids, only those selected. Entries the
-- user changed are kept. skipped = selected entries that could not be removed (changed or gone).
drop function if exists mfd_mcp.undo_entries(uuid,text);
create or replace function mfd_mcp.undo_entries(u uuid, conn text, ids text[] default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare doc jsonb; field text; kept jsonb; removed integer := 0; edited integer := 0; dropped integer; changed integer; rev bigint;
begin
 select payload into doc from public.forma_workspaces where user_id=u for update;
 if not found then return jsonb_build_object('removed',0,'kept_edited',0,'skipped',coalesce(cardinality(ids),0)); end if;
 foreach field in array array['sessions','routines','meals','weights'] loop
  if jsonb_typeof(doc->field)='array' then
   -- Never null: an entry without addedBy, time or fingerprint (added before undo existed) is always kept.
   with e as (select v, n, mfd_mcp.recent_ai(v,conn) recent from jsonb_array_elements(doc->field) with ordinality t(v,n)),
    f as (select v, n, recent and coalesce(v->'addedBy'->>'fp'=mfd_mcp.fingerprint(field,v), false) and (ids is null or v->>'id'=any(ids)) drop_it,
     recent and not coalesce(v->'addedBy'->>'fp'=mfd_mcp.fingerprint(field,v), false) edited_one from e)
   select coalesce(jsonb_agg(v order by n) filter (where not drop_it),'[]'), count(*) filter (where drop_it), count(*) filter (where edited_one)
    into kept, dropped, changed from f;
   if dropped>0 then doc := jsonb_set(doc,array[field],kept); end if;
   removed := removed+dropped; edited := edited+changed;
  end if;
 end loop;
 if removed>0 then
  update public.forma_workspaces set payload=doc, revision=revision+1, updated_at=now() where user_id=u returning revision into rev;
 end if;
 return jsonb_build_object('removed',removed,'kept_edited',edited,'skipped',greatest(coalesce(cardinality(ids),0)-removed,0));
end $$;
revoke all on function mfd_mcp.safe_date(text), mfd_mcp.safe_num(jsonb), mfd_mcp.in_range(text,jsonb), mfd_mcp.exercise_group(text), mfd_mcp.fingerprint(text,jsonb),
 mfd_mcp.analyze(text,jsonb,jsonb), mfd_mcp.add_entry(uuid,text,text,jsonb,date), mfd_mcp.recent_ai(jsonb,text), mfd_mcp.recent_ai_entries(uuid,text),
 mfd_mcp.undo_entries(uuid,text,text[]) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION mfd_mcp.dispatch(operation text, args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid := auth.uid(); c text := auth.jwt()->>'client_id';
 doc jsonb; rev bigint; p mfd_mcp.proposals; result jsonb;
 section text; field text; page_size integer; page_offset integer; conn text; ord text; tz text; today date;
begin
 if u is null or not exists (
  select 1 from auth.sessions s
  where s.id::text=auth.jwt()->>'session_id' and s.user_id=u
   and (s.not_after is null or s.not_after>now())
   and exists (
    select 1 from auth.refresh_tokens rt
    where rt.session_id=s.id and rt.user_id=u::text and rt.revoked=false
   )
 ) then raise exception 'Active session required' using errcode='42501'; end if;
 if jsonb_typeof(args) is distinct from 'object' then raise exception 'Invalid arguments' using errcode='22023'; end if;
 if c is null then
  if operation='connections' then
   select coalesce(jsonb_agg(jsonb_build_object('client_id',client_id,'permissions',permissions)),'[]') into result
    from mfd_mcp.grants where user_id=u;
   return result;
  elsif operation='authorization_binding' then
   -- Read-only recovery of metadata omitted by Auth's existing-consent response.
   -- Never return the authorization code, state, scopes, tokens or user identity.
   if (auth.jwt()->>'aud') is distinct from 'authenticated'
      or jsonb_typeof(args->'authorization_id') is distinct from 'string'
      or not (args->>'authorization_id' ~ '^[A-Za-z0-9_-]{1,200}$')
      or exists(select 1 from jsonb_object_keys(args) k where k<>'authorization_id') then
    raise exception 'Invalid authorization binding request' using errcode='42501'; end if;
   select jsonb_build_object('client_id',a.client_id::text,'redirect_uri',a.redirect_uri) into result
    from auth.oauth_authorizations a
    join mfd_mcp.clients cl on cl.client_id=a.client_id::text
    join mfd_mcp.grants g on g.client_id=cl.client_id and g.user_id=u
    where a.authorization_id=args->>'authorization_id' and a.user_id=u
      and a.status::text='approved' and a.expires_at>now() and cardinality(g.permissions)>0;
   if result is null then raise exception 'Authorization binding unavailable' using errcode='42501'; end if;
   return result;
  elsif operation='consent' then
   -- client_id is the connecting AI app's id at the Worker's OAuth server (DCR id or CIMD URL).
   if jsonb_typeof(args->'permissions') is distinct from 'array' or coalesce(args->>'client_id','') !~ '^[[:graph:]]+$' or length(args->>'client_id')>512 then
    raise exception 'Invalid consent' using errcode='22023'; end if;
   tz := coalesce(args->>'timezone','UTC');
   if length(tz)>64 or not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then tz := 'UTC'; end if;
   insert into mfd_mcp.grants(user_id,client_id,permissions,timezone) values(u,args->>'client_id',array(select jsonb_array_elements_text(args->'permissions')),tz)
   on conflict(user_id,client_id) do update set permissions=excluded.permissions, timezone=excluded.timezone;
   return '{}'::jsonb;
  elsif operation='revoke' then
   delete from mfd_mcp.grants where user_id=u and client_id=args->>'client_id';
   delete from mfd_mcp.proposals where user_id=u and client_id=args->>'client_id';
   return '{}'::jsonb;
  elsif operation in ('undo','ai_entries') then
   if coalesce(args->>'client_id','') !~ '^[[:graph:]]+$' or length(args->>'client_id')>512 then raise exception 'Invalid undo' using errcode='22023'; end if;
   if operation='ai_entries' then return mfd_mcp.recent_ai_entries(u,args->>'client_id'); end if;
   -- ids: the entries the user ticked on the review page (required: undo is always explicit).
   if jsonb_typeof(args->'ids') is distinct from 'array' or jsonb_array_length(args->'ids') not between 1 and 200
      or exists(select 1 from jsonb_array_elements(args->'ids') i where jsonb_typeof(i) is distinct from 'string' or length(i#>>'{}') not between 1 and 100) then
    raise exception 'Choose the entries to undo' using errcode='22023'; end if;
   return mfd_mcp.undo_entries(u,args->>'client_id',array(select jsonb_array_elements_text(args->'ids')));
  elsif operation in ('review','approve') then
   if not (select writes_enabled from mfd_mcp.settings where id) then raise exception 'Writes disabled' using errcode='42501'; end if;
   select * into p from mfd_mcp.proposals where id=(args->>'proposal_id')::uuid and user_id=u for update;
   if p.id is null or p.consumed or p.expires_at<=now() then raise exception 'Proposal unavailable' using errcode='PT409'; end if;
   if operation='approve' then
    if not exists(select 1 from public.forma_workspaces where user_id=u and revision=p.revision) then
     raise exception 'Workspace changed' using errcode='PT409'; end if;
    update mfd_mcp.proposals set approved=true where id=p.id;
   end if;
   return to_jsonb(p)-'user_id';
  end if;
  raise exception 'OAuth client required' using errcode='42501';
 end if;
 -- Require dedicated MCP audience (configure the Auth access-token hook).
 if auth.jwt()->>'aud' is distinct from (select resource_uri from mfd_mcp.settings where id) or not exists(select 1 from mfd_mcp.clients where client_id=c) then
  raise exception 'Invalid audience' using errcode='42501'; end if;
 -- Only the Worker holds these tokens; it names the AI app connection it is serving.
 conn := args->>'connection';
 if conn is null or conn !~ '^[[:graph:]]+$' or length(conn)>512 then raise exception 'Connection required' using errcode='42501'; end if;
 section := case when operation in ('propose_water_goal','apply_water_goal') then 'profile'
  when operation in ('summarize_training','list_exercises','exercise_progress','personal_records','muscle_volume') then 'workouts'
  when operation in ('summarize_nutrition','list_saved_foods') then 'nutrition' when operation='weight_trend' then 'progress'
  when operation='log_workout' then 'log_workouts' when operation='create_routine' then 'log_routines' when operation='log_meal' then 'log_nutrition'
  when operation='log_weight' then 'log_progress' else operation end;
 -- Lock the consent row so revocation and a concurrent write serialize.
 select g.timezone into tz from mfd_mcp.grants g where user_id=u and client_id=conn and section=any(permissions) for share;
 if not found then raise exception 'Consent required' using errcode='42501'; end if;
 today := (now() at time zone coalesce(tz,'UTC'))::date;
 if operation in ('propose_water_goal','apply_water_goal') and not (select writes_enabled from mfd_mcp.settings where id) then
  raise exception 'Writes disabled' using errcode='42501'; end if;
 if (args ? 'from' and (jsonb_typeof(args->'from') is distinct from 'string' or mfd_mcp.safe_date(args->>'from') is null))
    or (args ? 'to' and (jsonb_typeof(args->'to') is distinct from 'string' or mfd_mcp.safe_date(args->>'to') is null)) then
  raise exception 'Invalid date range (use YYYY-MM-DD)' using errcode='22023'; end if;
 if args ? 'search' and (jsonb_typeof(args->'search') is distinct from 'string' or length(args->>'search')>80) then
  raise exception 'Invalid search' using errcode='22023'; end if;
 if operation in ('log_workout','create_routine','log_meal','log_weight') then
  -- Add-only: a new entry with a new id, appended atomically; never edits or deletes.
  if not (select writes_enabled from mfd_mcp.settings where id) then
   raise exception 'Adding entries is turned off for this diary' using errcode='22023'; end if;
  return mfd_mcp.add_entry(u,conn,operation,args,today) || jsonb_build_object('today',today);
 end if;
 if operation='apply_water_goal' then
  select * into p from mfd_mcp.proposals where id=(args->>'proposal_id')::uuid and user_id=u and client_id=conn for update;
  if p.id is null or not p.approved or p.consumed or p.expires_at<=now() then
   raise exception 'Explicit approval required' using errcode='42501'; end if;
  update public.forma_workspaces set payload=jsonb_set(payload,'{profile}',
   coalesce(payload->'profile','{}')||jsonb_build_object('waterGoalMl',p.water_goal_ml)),revision=revision+1,updated_at=now()
   where user_id=u and revision=p.revision returning revision into rev;
  if rev is null then raise exception 'Workspace changed; request new approval' using errcode='PT409'; end if;
  update mfd_mcp.proposals set consumed=true where id=p.id;
  return jsonb_build_object('revision',rev);
 end if;
 select payload,revision into doc,rev from public.forma_workspaces where user_id=u;
 if operation='propose_water_goal' then
  if rev is null or (args->>'expected_revision')::bigint is distinct from rev then
   raise exception 'Workspace changed' using errcode='PT409'; end if;
  insert into mfd_mcp.proposals(user_id,client_id,revision,water_goal_ml)
   values(u,conn,rev,(args->>'water_goal_ml')::integer) returning * into p;
  return jsonb_build_object('proposal_id',p.id,'revision',rev,'water_goal_ml',p.water_goal_ml,'expires_at',p.expires_at);
 end if;
 if operation in ('summarize_training','list_exercises','exercise_progress','personal_records','muscle_volume','summarize_nutrition','list_saved_foods','weight_trend') then
  return jsonb_build_object('revision',rev,'today',today,'data',mfd_mcp.analyze(operation,args||jsonb_build_object('today',today),coalesce(doc,'{}')));
 end if;
 if operation='profile' then
  -- Explicit allowlist: never include email, auth metadata, tokens or unknown fields.
  select coalesce(jsonb_object_agg(key,value),'{}') into result from jsonb_each(coalesce(doc->'profile','{}'))
   where key=any(array['name','firstName','lastName','age','sex','height','weight','target','activity','goal','days','waterGoalMl','cal','protein','carbs','fat']);
 else
  field := case operation when 'workouts' then 'sessions' when 'routines' then 'routines'
   when 'nutrition' then 'meals' when 'progress' then 'weights' end;
  if field is null then raise exception 'Unknown operation' using errcode='22023'; end if;
  page_size:=coalesce((args->>'limit')::integer,25); page_offset:=coalesce((args->>'offset')::integer,0);
  if page_size not between 1 and 100 or page_offset not between 0 and 100000 then
   raise exception 'Invalid pagination' using errcode='22023'; end if;
  ord := args->>'order';
  if ord is not null and ord not in ('oldest','newest') then raise exception 'Invalid order' using errcode='22023'; end if;
  -- Without order: stored order (as before). Routines have no date and ignore the range.
  select coalesce(jsonb_agg(value order by rk),'[]') into result from (
   select value, row_number() over (order by
     case when ord='oldest' then value->>'date' end asc nulls last,
     case when ord='newest' then value->>'date' end desc nulls last,
     case when ord='newest' then -n else n end) rk
   from jsonb_array_elements(coalesce(doc->field,'[]')) with ordinality e(value,n)
   where field='routines' or mfd_mcp.in_range(value->>'date',args)
  ) items where rk>page_offset and rk<=page_offset+page_size;
 end if;
 return jsonb_build_object('revision',rev,'today',today,'data',result);
end $function$;
revoke all on function mfd_mcp.dispatch(text,jsonb) from public,anon;
grant execute on function mfd_mcp.dispatch(text,jsonb) to authenticated;
commit;
