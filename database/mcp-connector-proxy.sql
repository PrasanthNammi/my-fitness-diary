-- MCP connector proxy: the Worker is the OAuth server for AI apps and the only Supabase OAuth
-- client. Section grants are keyed by the AI app's client id ("connection"), which the Worker
-- passes with every data operation. Also adds analysis operations and add-only writes
-- (log_workout/create_routine/log_meal/log_weight), gated by separate consent and settings.writes_enabled.
-- Forward change on top of the installed MCP dispatcher (staging body 2e64d4e8…); apply to the
-- sandbox first. Rollback: reinstall the previous dispatcher body.
begin;

-- Helpers run only inside the dispatcher (as its owner); no client role may execute them.
create or replace function mfd_mcp.safe_date(t text) returns date language plpgsql immutable set search_path='' as $$
begin
 if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
 return t::date;
exception when others then return null;
end $$;
create or replace function mfd_mcp.safe_num(j jsonb) returns numeric language sql immutable set search_path='' as $$
 select case when jsonb_typeof(j)='number' then (j#>>'{}')::numeric end $$;
-- No range given: everything (even undated). With a range: only valid dates inside it.
create or replace function mfd_mcp.in_range(d text, args jsonb) returns boolean language sql immutable set search_path='' as $$
 select (args->>'from' is null and args->>'to' is null) or (mfd_mcp.safe_date(d) is not null
  and (args->>'from' is null or d>=args->>'from') and (args->>'to' is null or d<=args->>'to')) $$;

create or replace function mfd_mcp.analyze(operation text, args jsonb, doc jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare grp text := args->>'group'; ex text; result jsonb;
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
  select coalesce(jsonb_agg(jsonb_build_object('exercise',exercise_name,'sessions',ns,'sets',nsets,'last_date',last) order by ns desc, exercise_name),'[]') into result from (
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
   per as (select d, jsonb_build_object('date',d,'workout',workout,'sets',count(*),'reps',sum(reps),'volume_kg',round(sum(kg*reps),1),'top_kg',max(kg),
     'est_1rm_kg',round(max(case when reps between 1 and 12 and kg>0 then kg*(1+reps/30.0) end),1)) j
     from q group by id, d, workout order by d desc nulls last limit 200)
  select jsonb_build_object('exercise',args->>'exercise','sessions',coalesce(jsonb_agg(j order by d),'[]')) into result from per;
 elsif operation='summarize_nutrition' then
  grp := coalesce(grp,'day'); if grp not in ('day','week','month') then raise exception 'Invalid group' using errcode='22023'; end if;
  with m as (select v->>'date' d, coalesce(mfd_mcp.safe_num(v->'cal'),0) kcal, coalesce(mfd_mcp.safe_num(v->'p'),0) p,
     coalesce(mfd_mcp.safe_num(v->'c'),0) c, coalesce(mfd_mcp.safe_num(v->'f'),0) f
     from jsonb_array_elements(coalesce(doc->'meals','[]')) v where mfd_mcp.safe_date(v->>'date') is not null and mfd_mcp.in_range(v->>'date',args)),
   days as (select d, sum(kcal) kcal, sum(p) p, sum(c) c, sum(f) f from m group by d),
   per as (select to_char(date_trunc(grp,mfd_mcp.safe_date(d)),'YYYY-MM-DD') period, count(*) n, sum(kcal) kcal, sum(p) p, sum(c) c, sum(f) f
     from days group by 1 order by 1 desc limit 400)
  select jsonb_build_object('group',grp,'periods',coalesce(jsonb_agg(jsonb_build_object('period',period,'days_logged',n,
    'kcal',round(kcal),'protein_g',round(p,1),'carbs_g',round(c,1),'fat_g',round(f,1),
    'avg_kcal_per_day',round(kcal/n),'avg_protein_g_per_day',round(p/n,1)) order by period),'[]')) into result from per;
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

create table if not exists mfd_mcp.write_counts (
 user_id uuid not null references auth.users(id) on delete cascade, connection text not null, day date not null, n integer not null,
 primary key(user_id,connection,day));
alter table mfd_mcp.write_counts enable row level security;
revoke all on mfd_mcp.write_counts from public,anon,authenticated;

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
alter table mfd_mcp.grants drop constraint grants_permissions_check;
alter table mfd_mcp.grants add constraint grants_permissions_check check (permissions <@ array['workouts','routines','nutrition','progress','profile','log_workouts','log_routines','log_nutrition','log_progress']);

CREATE OR REPLACE FUNCTION mfd_mcp.dispatch(operation text, args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid := auth.uid(); c text := auth.jwt()->>'client_id';
 doc jsonb; rev bigint; p mfd_mcp.proposals; result jsonb;
 section text; field text; page_size integer; page_offset integer; conn text; ord text;
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
   insert into mfd_mcp.grants values(u,args->>'client_id',array(select jsonb_array_elements_text(args->'permissions')))
   on conflict(user_id,client_id) do update set permissions=excluded.permissions;
   return '{}'::jsonb;
  elsif operation='revoke' then
   delete from mfd_mcp.grants where user_id=u and client_id=args->>'client_id';
   delete from mfd_mcp.proposals where user_id=u and client_id=args->>'client_id';
   return '{}'::jsonb;
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
  when operation in ('summarize_training','list_exercises','exercise_progress') then 'workouts'
  when operation='summarize_nutrition' then 'nutrition' when operation='weight_trend' then 'progress'
  when operation='log_workout' then 'log_workouts' when operation='create_routine' then 'log_routines' when operation='log_meal' then 'log_nutrition'
  when operation='log_weight' then 'log_progress' else operation end;
 -- Lock the consent row so revocation and a concurrent write serialize.
 perform 1 from mfd_mcp.grants where user_id=u and client_id=conn and section=any(permissions) for share;
 if not found then raise exception 'Consent required' using errcode='42501'; end if;
 if operation in ('propose_water_goal','apply_water_goal') and not (select writes_enabled from mfd_mcp.settings where id) then
  raise exception 'Writes disabled' using errcode='42501'; end if;
 if (args ? 'from' and (jsonb_typeof(args->'from') is distinct from 'string' or mfd_mcp.safe_date(args->>'from') is null))
    or (args ? 'to' and (jsonb_typeof(args->'to') is distinct from 'string' or mfd_mcp.safe_date(args->>'to') is null)) then
  raise exception 'Invalid date range (use YYYY-MM-DD)' using errcode='22023'; end if;
 if operation in ('log_workout','create_routine','log_meal','log_weight') then
  -- Add-only: a new entry with a new id, appended atomically; never edits or deletes.
  if not (select writes_enabled from mfd_mcp.settings where id) then
   raise exception 'Adding entries is turned off for this diary' using errcode='22023'; end if;
  return mfd_mcp.add_entry(u,conn,operation,args);
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
 if operation in ('summarize_training','list_exercises','exercise_progress','summarize_nutrition','weight_trend') then
  return jsonb_build_object('revision',rev,'data',mfd_mcp.analyze(operation,args,coalesce(doc,'{}')));
 end if;
 if operation='profile' then
  -- Explicit allowlist: never include email, auth metadata, tokens or unknown fields.
  select coalesce(jsonb_object_agg(key,value),'{}') into result from jsonb_each(coalesce(doc->'profile','{}'))
   where key=any(array['name','firstName','lastName','age','sex','height','weight','target','activity','goal','days','waterGoalMl']);
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
 return jsonb_build_object('revision',rev,'data',result);
end $function$;
revoke all on function mfd_mcp.dispatch(text,jsonb) from public,anon;
grant execute on function mfd_mcp.dispatch(text,jsonb) to authenticated;
-- Old direct-client grants are keyed by Supabase client ids and no longer match any connection.
delete from mfd_mcp.proposals;
delete from mfd_mcp.grants;
commit;
