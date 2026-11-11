-- Reviewed offline change set. Apply ONLY to a disposable/staging database first.
-- Never expose mfd_mcp in PostgREST's exposed schemas.
begin;
create schema mfd_mcp;
revoke all on schema mfd_mcp from public;
grant usage on schema mfd_mcp to authenticated;
create table mfd_mcp.clients(client_id text primary key);
create table mfd_mcp.settings(
 id boolean primary key default true check(id), writes_enabled boolean not null default false,
 resource_uri text not null default 'https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp'
);
insert into mfd_mcp.settings(id,writes_enabled) values(true,false);

create table mfd_mcp.grants (
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id text not null,
 permissions text[] not null check (permissions <@ array['workouts','routines','nutrition','progress','profile']),
 primary key(user_id,client_id)
);
create table mfd_mcp.proposals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id text not null,
 revision bigint not null,
 water_goal_ml integer not null check(water_goal_ml between 250 and 10000),
 expires_at timestamptz not null default (now()+interval '10 minutes'),
 approved boolean not null default false,
 consumed boolean not null default false
);
-- The user-id index supports expiry/revocation cleanup and auth.users cascades.
create index proposals_user_id_idx on mfd_mcp.proposals(user_id);
create index proposals_client_user_idx on mfd_mcp.proposals(user_id,client_id) where not consumed;
alter table mfd_mcp.grants enable row level security;
alter table mfd_mcp.proposals enable row level security;
alter table mfd_mcp.clients enable row level security;
alter table mfd_mcp.settings enable row level security;
revoke all on all tables in schema mfd_mcp from public,anon,authenticated;

-- Restrictive policy also covers the existing SECURITY INVOKER save RPC.
-- Ordinary browser sessions retain every existing workspace capability.
create policy mcp_no_direct_workspace on public.forma_workspaces as restrictive
 for all to authenticated
 using ((select auth.jwt())->>'client_id' is null)
 with check ((select auth.jwt())->>'client_id' is null);

-- OAuth must not inherit unrelated social/catalogue/photo access either.
-- Existing SECURITY DEFINER RPCs require a separate inventory before enabling
-- OAuth in any environment; see docs/MCP.md.
do $$ declare t record; begin
 for t in select schemaname,tablename,rowsecurity from pg_tables where
  (schemaname='public' and tablename<>'forma_workspaces') or (schemaname='storage' and tablename='objects')
 loop
  if not t.rowsecurity then raise exception 'Enable and review RLS on %.% before installing MCP',t.schemaname,t.tablename; end if;
  execute format('create policy mcp_no_direct_access on %I.%I as restrictive for all to authenticated using ((select auth.jwt())->>''client_id'' is null) with check ((select auth.jwt())->>''client_id'' is null)',t.schemaname,t.tablename);
 end loop;
end $$;

-- Sole privileged entry point: fixed operations, server-derived owner, live session,
-- explicit consent; no arbitrary SQL, document replacement, or owner parameters.
create function mfd_mcp.dispatch(operation text, args jsonb default '{}') returns jsonb
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
revoke all on function mfd_mcp.dispatch(text,jsonb) from public,anon;
grant execute on function mfd_mcp.dispatch(text,jsonb) to authenticated;
create function public.mfd_mcp(operation text,args jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$ select mfd_mcp.dispatch(operation,args) $$;
revoke all on function public.mfd_mcp(text,jsonb) from public,anon;
grant execute on function public.mfd_mcp(text,jsonb) to authenticated;

-- Configure this as the Custom Access Token hook in a NON-production project.
-- Compose with an existing hook instead of replacing it when one is configured.
create function mfd_mcp.access_token_hook(event jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare claims jsonb := event->'claims';
begin
 if exists(select 1 from mfd_mcp.clients where client_id=coalesce(event->>'client_id',claims->>'client_id')) then
  claims:=jsonb_set(claims,'{aud}',to_jsonb((select resource_uri from mfd_mcp.settings where id)));
 end if;
 return jsonb_set(event,'{claims}',claims);
end $$;
grant usage on schema mfd_mcp to supabase_auth_admin;
grant select on mfd_mcp.clients to supabase_auth_admin;
grant select on mfd_mcp.settings to supabase_auth_admin;
create policy auth_hook_clients on mfd_mcp.clients for select to supabase_auth_admin using(true);
create policy auth_hook_settings on mfd_mcp.settings for select to supabase_auth_admin using(true);
revoke all on function mfd_mcp.access_token_hook(jsonb) from public,anon,authenticated;
grant execute on function mfd_mcp.access_token_hook(jsonb) to supabase_auth_admin;
commit;
