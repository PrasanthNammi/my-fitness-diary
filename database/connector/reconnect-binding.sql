-- LOCAL PROPOSAL ONLY: separately approved staging SQL required before candidate Worker.
-- No table, policy, ACL, user, grant or token mutation. Replace only this function body.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$
begin
 if current_user<>'postgres' or current_setting('mfd.c1b.target_ref',true) is distinct from 'gngnrmzeghjzqsmzuktl' then raise exception 'Unverified staging target'; end if;
 if not exists(select 1 from mfd_mcp.settings where id=true and writes_enabled=false and resource_uri='https://mfd-connect-staging.shanustylish777.workers.dev/mcp') then raise exception 'Settings drift'; end if;
 if (select count(*) from mfd_mcp.settings)<>1 then raise exception 'Settings row drift'; end if;
 if not exists(select 1 from pg_proc where oid='mfd_mcp.dispatch(text,jsonb)'::regprocedure and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""'] and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='5746d0b1b36036343df0696e0c5429a4') then raise exception 'Dispatcher baseline drift'; end if;
 -- Preserve the approved invoker-wrapper -> definer-dispatcher call path.
 -- authenticated EXECUTE is required; PUBLIC/anon or other grants are drift.
 if not exists(select 1 from pg_proc where oid='mfd_mcp.dispatch(text,jsonb)'::regprocedure
   and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""']
   and cardinality(proacl)=2 and proacl @> array['postgres=X/postgres','authenticated=X/postgres']::aclitem[])
   or not has_function_privilege('authenticated','mfd_mcp.dispatch(text,jsonb)','EXECUTE')
   or has_function_privilege('anon','mfd_mcp.dispatch(text,jsonb)','EXECUTE') then
  raise exception 'Dispatcher ACL/owner/security drift'; end if;
 if not exists(select 1 from pg_proc where oid='public.mfd_mcp(text,jsonb)'::regprocedure
   and proowner='postgres'::regrole and not prosecdef and proconfig=array['search_path=""']
   and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='c0586b393b1d82332c88f1b1123f57c5'
   and cardinality(proacl)=3 and proacl @> array['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']::aclitem[])
   or not has_function_privilege('authenticated','public.mfd_mcp(text,jsonb)','EXECUTE')
   or has_function_privilege('anon','public.mfd_mcp(text,jsonb)','EXECUTE') then
  raise exception 'Invoker wrapper baseline drift'; end if;
end $guard$;
create or replace function mfd_mcp.dispatch(operation text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 u uuid := auth.uid(); c text := auth.jwt()->>'client_id';
 doc jsonb; rev bigint; p mfd_mcp.proposals; result jsonb;
 section text; field text; page_size integer; page_offset integer;
begin
 if u is null or not exists (
  select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=u
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
   if jsonb_typeof(args->'permissions') is distinct from 'array' or coalesce(args->>'client_id','')='' then
    raise exception 'Invalid consent' using errcode='22023'; end if;
   if not exists(select 1 from mfd_mcp.clients where client_id=args->>'client_id') then raise exception 'Unregistered MCP client' using errcode='42501'; end if;
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
 section := case when operation in ('propose_water_goal','apply_water_goal') then 'profile' else operation end;
 -- Lock the consent row so revocation and a concurrent write serialize.
 perform 1 from mfd_mcp.grants where user_id=u and client_id=c and section=any(permissions) for share;
 if not found then raise exception 'Consent required' using errcode='42501'; end if;
 if operation in ('propose_water_goal','apply_water_goal') and not (select writes_enabled from mfd_mcp.settings where id) then
  raise exception 'Writes disabled' using errcode='42501'; end if;
 if operation='apply_water_goal' then
  select * into p from mfd_mcp.proposals where id=(args->>'proposal_id')::uuid and user_id=u and client_id=c for update;
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
   values(u,c,rev,(args->>'water_goal_ml')::integer) returning * into p;
  return jsonb_build_object('proposal_id',p.id,'revision',rev,'water_goal_ml',p.water_goal_ml,'expires_at',p.expires_at);
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
  select coalesce(jsonb_agg(value),'[]') into result from (
   select value from jsonb_array_elements(coalesce(doc->field,'[]')) with ordinality e(value,n)
   order by n limit page_size offset page_offset
  ) items;
 end if;
 return jsonb_build_object('revision',rev,'data',result);
end $$;
do $verify$
begin
 if (select md5(regexp_replace(prosrc,'[[:space:]]','','g')) from pg_proc where oid='mfd_mcp.dispatch(text,jsonb)'::regprocedure) is distinct from '7d93d522e07936bca67faa53903d4868' then raise exception 'Unexpected dispatcher body'; end if;
 -- Preserve the approved invoker-wrapper -> definer-dispatcher call path.
 -- authenticated EXECUTE is required; PUBLIC/anon or other grants are drift.
 if not exists(select 1 from pg_proc where oid='mfd_mcp.dispatch(text,jsonb)'::regprocedure
   and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=""']
   and cardinality(proacl)=2 and proacl @> array['postgres=X/postgres','authenticated=X/postgres']::aclitem[])
   or not has_function_privilege('authenticated','mfd_mcp.dispatch(text,jsonb)','EXECUTE')
   or has_function_privilege('anon','mfd_mcp.dispatch(text,jsonb)','EXECUTE') then
  raise exception 'Dispatcher ACL/owner/security drift'; end if;
 if not exists(select 1 from pg_proc where oid='public.mfd_mcp(text,jsonb)'::regprocedure
   and proowner='postgres'::regrole and not prosecdef and proconfig=array['search_path=""']
   and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='c0586b393b1d82332c88f1b1123f57c5'
   and cardinality(proacl)=3 and proacl @> array['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']::aclitem[])
   or not has_function_privilege('authenticated','public.mfd_mcp(text,jsonb)','EXECUTE')
   or has_function_privilege('anon','public.mfd_mcp(text,jsonb)','EXECUTE') then
  raise exception 'Invoker wrapper baseline drift'; end if;
end $verify$;
commit;
