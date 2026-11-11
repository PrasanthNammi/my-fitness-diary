-- PROPOSAL ONLY. Not executed against hosted Supabase.
-- Target: gngnrmzeghjzqsmzuktl. Never use supabase db push against another project.
-- Caller must verify the target connection and dashboard exposed schemas independently.
-- Required session assertions (operator assertions, NOT cryptographic project identity):
-- SET mfd.c01.target_ref = 'gngnrmzeghjzqsmzuktl';
-- SET mfd.c01.exposed_schemas = 'public,graphql_public'; -- exact inspected list
-- One atomic transaction; no backfill, account creation, OAuth enablement or cron job.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(714011027);
do $preflight$
declare exposed text;
begin
 if current_user<>'postgres' then raise exception 'C01: expected reviewed postgres owner role'; end if;
 if current_setting('mfd.c01.target_ref',true) is distinct from 'gngnrmzeghjzqsmzuktl' then
  raise exception 'C01: explicit staging target assertion required';
 end if;
 exposed := coalesce(nullif(current_setting('pgrst.db_schemas',true),''),nullif(current_setting('mfd.c01.exposed_schemas',true),''));
 exposed := btrim(exposed);
 if exposed is null or exposed !~ '^[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*)*$' or not ('public'=any(regexp_split_to_array(exposed,'\s*,\s*'))) then
  raise exception 'C01: independently verify exposed API schemas and provide the exact list';
 end if;
 if regexp_split_to_array(exposed,'\s*,\s*') && array['mfd_mcp','mfd_private','mfd_observability','auth'] then
  raise exception 'C01: private schema is exposed; stop for separately approved Data API remediation';
 end if;
 if to_regclass('public.forma_workspaces') is null or to_regclass('mfd_mcp.settings') is null then
  raise exception 'C01: existing workspace/MCP installation required';
 end if;
 if (select count(*) from mfd_mcp.settings)<>1 or not exists(select 1 from mfd_mcp.settings where id and not writes_enabled and resource_uri='https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp') then
  raise exception 'C01: active staging resource/writes precondition failed';
 end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then
  raise exception 'C01: unexpected public schema CREATE privilege; stop for review';
 end if;
 -- Existing reviewed MCP boundary is a prerequisite, not reinstalled here.
 if not exists(select 1 from pg_proc where oid=to_regprocedure('mfd_mcp.dispatch(text,jsonb)') and prosecdef and pg_get_userbyid(proowner)='postgres' and md5(regexp_replace(prosrc,'\s+','','g'))='5746d0b1b36036343df0696e0c5429a4') or
    not exists(select 1 from pg_proc where oid=to_regprocedure('mfd_mcp.access_token_hook(jsonb)') and not prosecdef and md5(regexp_replace(prosrc,'\s+','','g'))='9fde3c29dc02c1313687ce426b5d1237') then
  raise exception 'C01: existing MCP function drift; stop for review';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mfd_mcp' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) then
  raise exception 'C01: existing MCP private ACL/RLS drift';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) then
  raise exception 'C01: unexpected callable public SECURITY DEFINER; stop for inventory review';
 end if;
 -- Per-schema REVOKE cannot remove unexpected globally granted table/sequence rights.
 if exists(select 1 from pg_default_acl d join pg_roles r on r.oid=d.defaclrole cross join lateral aclexplode(d.defaclacl) a
  where r.rolname='postgres' and d.defaclnamespace=0 and d.defaclobjtype in('r','S')
  and (a.grantee=0 or a.grantee in(select oid from pg_roles where rolname in('anon','authenticated')))) then
  raise exception 'C01: global table/sequence defaults require separate review';
 end if;
end $preflight$;

create schema if not exists mfd_private;
create schema if not exists mfd_observability;

-- Narrow application defaults only. Do not alter supabase_admin (provider-managed),
-- or global defaults for any role. In particular, PUBLIC's implicit function
-- EXECUTE cannot be removed per schema. Every MFD function is explicitly revoked
-- and allowlisted below, inside this transaction, before it becomes visible.
-- Future MFD functions MUST use that same transactional create/revoke/grant pattern.
do $defaults$
declare schema_name text;
begin
 foreach schema_name in array array['public','mfd_private','mfd_observability'] loop
  execute format('alter default privileges for role postgres in schema %I revoke all on tables from public,anon,authenticated',schema_name);
  execute format('alter default privileges for role postgres in schema %I revoke all on sequences from public,anon,authenticated',schema_name);
  -- Remove explicit per-schema API grants, NOT the implicit global PUBLIC grant.
  execute format('alter default privileges for role postgres in schema %I revoke execute on functions from public,anon,authenticated',schema_name);
 end loop;
end $defaults$;

-- Reviewed definitions from database/social.sql (no installer replay).
create schema if not exists mfd_private;

create table if not exists public.mfd_profiles(user_id uuid primary key default auth.uid() references auth.users(id),username text not null unique check(username ~ '^[a-z0-9._]{3,24}$'),display_name text not null check(char_length(display_name) between 1 and 80),avatar_path text check(avatar_path is null or split_part(avatar_path,'/',1)=user_id::text),created_at timestamptz not null default now());

create table if not exists public.mfd_friendships(id uuid primary key default gen_random_uuid(),sender uuid not null default auth.uid() references auth.users(id),recipient uuid not null references auth.users(id),status text not null default 'pending' check(status in('pending','accepted')),accepted_at timestamptz,created_at timestamptz not null default now(),check(sender<>recipient));

create unique index if not exists mfd_friend_pair on public.mfd_friendships(least(sender,recipient),greatest(sender,recipient));

create index if not exists mfd_friend_recipient on public.mfd_friendships(recipient);

create index if not exists mfd_friend_sender on public.mfd_friendships(sender);

create table if not exists public.mfd_blocks(owner_id uuid not null default auth.uid() references auth.users(id),target_id uuid not null references auth.users(id),primary key(owner_id,target_id),check(owner_id<>target_id));

create index if not exists mfd_block_target on public.mfd_blocks(target_id);

alter table public.mfd_profiles enable row level security;

alter table public.mfd_friendships enable row level security;

alter table public.mfd_blocks enable row level security;

revoke all on public.mfd_profiles,public.mfd_friendships,public.mfd_blocks from public,anon,authenticated;

grant select on public.mfd_profiles,public.mfd_friendships,public.mfd_blocks to authenticated;

grant insert(username,display_name,avatar_path),update(username,display_name,avatar_path) on public.mfd_profiles to authenticated;

grant insert(recipient),update(status),delete on public.mfd_friendships to authenticated;

grant insert(target_id),delete on public.mfd_blocks to authenticated;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_profiles'::regclass and polname='profiles_read') then
  execute $definition$create policy profiles_read on public.mfd_profiles for select to authenticated using(true)$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_profiles'::regclass and polname='profiles_create') then
  execute $definition$create policy profiles_create on public.mfd_profiles for insert to authenticated with check(user_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_profiles'::regclass and polname='profiles_update') then
  execute $definition$create policy profiles_update on public.mfd_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_blocks'::regclass and polname='blocks_read') then
  execute $definition$create policy blocks_read on public.mfd_blocks for select to authenticated using((select auth.uid()) in(owner_id,target_id))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_blocks'::regclass and polname='blocks_create') then
  execute $definition$create policy blocks_create on public.mfd_blocks for insert to authenticated with check(owner_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_blocks'::regclass and polname='blocks_remove') then
  execute $definition$create policy blocks_remove on public.mfd_blocks for delete to authenticated using(owner_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_friendships'::regclass and polname='friends_read') then
  execute $definition$create policy friends_read on public.mfd_friendships for select to authenticated using((select auth.uid()) in(sender,recipient))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_friendships'::regclass and polname='friends_request') then
  execute $definition$create policy friends_request on public.mfd_friendships for insert to authenticated with check(sender=(select auth.uid()) and status='pending' and accepted_at is null and not exists(select 1 from public.mfd_blocks b where (b.owner_id=sender and b.target_id=recipient) or(b.owner_id=recipient and b.target_id=sender)))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_friendships'::regclass and polname='friends_accept') then
  execute $definition$create policy friends_accept on public.mfd_friendships for update to authenticated using(recipient=(select auth.uid()) and status='pending') with check(recipient=(select auth.uid()) and status='accepted' and not exists(select 1 from public.mfd_blocks b where (b.owner_id=sender and b.target_id=recipient) or(b.owner_id=recipient and b.target_id=sender)))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_friendships'::regclass and polname='friends_remove') then
  execute $definition$create policy friends_remove on public.mfd_friendships for delete to authenticated using((select auth.uid()) in(sender,recipient))$definition$;
 end if;
end $create_policy$;

do $create_function$
begin
 if to_regprocedure('public.mfd_are_friends(uuid,uuid)') is null then
  execute $definition$create function public.mfd_are_friends(a uuid,b uuid) returns boolean language sql stable security invoker set search_path='' as $$select auth.uid() in(a,b) and exists(select 1 from public.mfd_friendships f where f.status='accepted' and ((f.sender=a and f.recipient=b) or(f.sender=b and f.recipient=a))) and not exists(select 1 from public.mfd_blocks k where(k.owner_id=a and k.target_id=b) or(k.owner_id=b and k.target_id=a))$$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('public.mfd_are_friends(uuid,uuid)') and md5(regexp_replace(prosrc,'\s+','','g'))='735e37b902e42619d7e5959820d324c2' and prosecdef=false and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: public.mfd_are_friends(uuid,uuid)';
 end if;
end $create_function$;

revoke all on function public.mfd_are_friends(uuid,uuid) from public,anon;

grant execute on function public.mfd_are_friends(uuid,uuid) to authenticated;

do $create_function$
begin
 if to_regprocedure('mfd_private.friend_accepted()') is null then
  execute $definition$create function mfd_private.friend_accepted() returns trigger language plpgsql security invoker set search_path='' as $$begin new.accepted_at=clock_timestamp();return new;end$$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('mfd_private.friend_accepted()') and md5(regexp_replace(prosrc,'\s+','','g'))='933505a8281ce9d25466e6b30fa6e266' and prosecdef=false and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: mfd_private.friend_accepted()';
 end if;
end $create_function$;

do $create_trigger$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.mfd_friendships'::regclass and tgname='mfd_friend_accepted' and not tgisinternal) then
  execute $definition$create trigger mfd_friend_accepted before update on public.mfd_friendships for each row execute function mfd_private.friend_accepted()$definition$;
 end if;
end $create_trigger$;

create table if not exists public.mfd_social_workouts(owner_id uuid not null references auth.users(id),workout_id text not null,data jsonb not null,started_at timestamptz not null,primary key(owner_id,workout_id));

create index if not exists mfd_social_started on public.mfd_social_workouts(started_at desc);

alter table public.mfd_social_workouts enable row level security;

revoke all on public.mfd_social_workouts from public,anon,authenticated;

grant select on public.mfd_social_workouts to authenticated;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_social_workouts'::regclass and polname='social_workout_read') then
  execute $definition$create policy social_workout_read on public.mfd_social_workouts for select to authenticated using(owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid())))$definition$;
 end if;
end $create_policy$;

do $create_function$
begin
 if to_regprocedure('mfd_private.project_workouts()') is null then
  execute $definition$create function mfd_private.project_workouts() returns trigger language plpgsql security definer set search_path='' as $$declare s jsonb;clean_sets jsonb;begin
 if tg_op='UPDATE' and new.payload->'sessions' is not distinct from old.payload->'sessions' and exists(select 1 from public.mfd_social_workouts where owner_id=new.user_id) then return new;end if;
 delete from public.mfd_social_workouts w where w.owner_id=new.user_id and not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) e where e->>'id'=w.workout_id);
 for s in select value from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) loop
  if s->>'id' is null or jsonb_typeof(s->'started') is distinct from 'number' then continue;end if;
  select coalesce(jsonb_agg(jsonb_build_object('exercise',e->'exercise','group',e->'group','set',e->'set','type',e->'type','kg',e->'kg','reps',e->'reps','duration_seconds',e->'duration_seconds','distance_meters',e->'distance_meters','rpe',e->'rpe','catalogId',e->'catalogId','tracking',e->'tracking','floors',e->'floors','steps',e->'steps','done',true)),'[]'::jsonb) into clean_sets from jsonb_array_elements(coalesce(s->'sets','[]'::jsonb)) e where e->>'done' is distinct from 'false';
  insert into public.mfd_social_workouts(owner_id,workout_id,started_at,data) values(new.user_id,s->>'id',to_timestamp((s->>'started')::numeric/1000),jsonb_build_object('id',s->'id','name',s->'name','date',s->'date','started',s->'started','finished',s->'finished','sets',clean_sets)) on conflict(owner_id,workout_id) do update set data=excluded.data,started_at=excluded.started_at;
 end loop;return new;end$$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('mfd_private.project_workouts()') and md5(regexp_replace(prosrc,'\s+','','g'))='b8dfd17bc019d18ffec9384ea505e3af' and prosecdef=true and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: mfd_private.project_workouts()';
 end if;
end $create_function$;

revoke all on function mfd_private.project_workouts(),mfd_private.friend_accepted() from public,anon,authenticated;

do $create_trigger$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.forma_workspaces'::regclass and tgname='mfd_project_workouts' and not tgisinternal) then
  execute $definition$create trigger mfd_project_workouts after insert or update on public.forma_workspaces for each row execute function mfd_private.project_workouts()$definition$;
 end if;
end $create_trigger$;

create table if not exists public.mfd_messages(id uuid primary key default gen_random_uuid(),sender uuid not null default auth.uid() references auth.users(id),recipient uuid not null references auth.users(id),body text not null check(char_length(btrim(body)) between 1 and 2000),sent_at timestamptz not null default now(),read_at timestamptz,expires_at timestamptz not null default(now()+interval '24 hours'));

create index if not exists mfd_message_recipient on public.mfd_messages(recipient,sent_at);

create index if not exists mfd_message_sender on public.mfd_messages(sender,sent_at);

create index if not exists mfd_message_expiry on public.mfd_messages(expires_at);

alter table public.mfd_messages enable row level security;

revoke all on public.mfd_messages from public,anon,authenticated;

grant select on public.mfd_messages to authenticated;

grant insert(recipient,body),update(read_at) on public.mfd_messages to authenticated;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_messages'::regclass and polname='messages_read') then
  execute $definition$create policy messages_read on public.mfd_messages for select to authenticated using((select auth.uid()) in(sender,recipient) and expires_at>now() and public.mfd_are_friends(sender,recipient))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_messages'::regclass and polname='messages_send') then
  execute $definition$create policy messages_send on public.mfd_messages for insert to authenticated with check(sender=(select auth.uid()) and public.mfd_are_friends(sender,recipient))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_messages'::regclass and polname='messages_mark_read') then
  execute $definition$create policy messages_mark_read on public.mfd_messages for update to authenticated using(recipient=(select auth.uid()) and expires_at>now() and public.mfd_are_friends(sender,recipient)) with check(recipient=(select auth.uid()) and public.mfd_are_friends(sender,recipient))$definition$;
 end if;
end $create_policy$;

do $create_function$
begin
 if to_regprocedure('mfd_private.message_read()') is null then
  execute $definition$create function mfd_private.message_read() returns trigger language plpgsql security invoker set search_path='' as $$begin if old.read_at is null then new.read_at=clock_timestamp();new.expires_at=least(old.expires_at,new.read_at+interval '5 minutes');else new.read_at=old.read_at;new.expires_at=old.expires_at;end if;return new;end$$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('mfd_private.message_read()') and md5(regexp_replace(prosrc,'\s+','','g'))='503d80cc0c50c8cf43e11aa48a6e2efa' and prosecdef=false and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: mfd_private.message_read()';
 end if;
end $create_function$;

revoke all on function mfd_private.message_read() from public,anon,authenticated;

do $create_trigger$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.mfd_messages'::regclass and tgname='mfd_message_read' and not tgisinternal) then
  execute $definition$create trigger mfd_message_read before update on public.mfd_messages for each row execute function mfd_private.message_read()$definition$;
 end if;
end $create_trigger$;

create table if not exists public.mfd_reactions(user_id uuid not null default auth.uid() references auth.users(id),owner_id uuid not null,workout_id text not null,primary key(user_id,owner_id,workout_id),foreign key(owner_id,workout_id) references public.mfd_social_workouts(owner_id,workout_id) on delete cascade);

create index if not exists mfd_reaction_workout on public.mfd_reactions(owner_id,workout_id);

alter table public.mfd_reactions enable row level security;

revoke all on public.mfd_reactions from public,anon,authenticated;

grant select,delete on public.mfd_reactions to authenticated;

grant insert(owner_id,workout_id) on public.mfd_reactions to authenticated;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_reactions'::regclass and polname='reactions_read') then
  execute $definition$create policy reactions_read on public.mfd_reactions for select to authenticated using(owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid())))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_reactions'::regclass and polname='reactions_create') then
  execute $definition$create policy reactions_create on public.mfd_reactions for insert to authenticated with check(user_id=(select auth.uid()) and (owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid()))))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_reactions'::regclass and polname='reactions_remove') then
  execute $definition$create policy reactions_remove on public.mfd_reactions for delete to authenticated using(user_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

-- Reviewed definitions from database/shared-catalogue.sql (no installer replay).
create table if not exists public.mfd_catalogue (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null default auth.uid() references auth.users(id),
 kind text not null check(kind in ('food','exercise')),
 name text not null check(char_length(btrim(name)) between 1 and 150),
 barcode text check(barcode is null or barcode ~ '^[0-9]{8,14}$'),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=50000),
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint exercise_no_barcode check(kind='food' or barcode is null)
);

create unique index if not exists mfd_catalogue_barcode on public.mfd_catalogue(barcode) where barcode is not null;

create index if not exists mfd_catalogue_creator on public.mfd_catalogue(creator_id);

create index if not exists mfd_catalogue_kind on public.mfd_catalogue(kind,archived);

create table if not exists public.mfd_catalogue_reports (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.mfd_catalogue(id),
 reporter_id uuid not null default auth.uid() references auth.users(id),
 field text not null check(char_length(field) between 1 and 80),
 message text not null check(char_length(btrim(message)) between 1 and 2000),
 status text not null default 'open' check(status in ('open','resolved','dismissed')),
 response text not null default '' check(char_length(response)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists mfd_reports_item on public.mfd_catalogue_reports(item_id);

create index if not exists mfd_reports_reporter on public.mfd_catalogue_reports(reporter_id);

create unique index if not exists mfd_reports_open on public.mfd_catalogue_reports(item_id,reporter_id) where status='open';

alter table public.mfd_catalogue enable row level security;

alter table public.mfd_catalogue_reports enable row level security;

revoke all on public.mfd_catalogue,public.mfd_catalogue_reports from public,anon,authenticated;

grant select on public.mfd_catalogue,public.mfd_catalogue_reports to authenticated;

grant insert(kind,name,barcode,data) on public.mfd_catalogue to authenticated;

grant update(name,barcode,data,archived) on public.mfd_catalogue to authenticated;

grant insert(item_id,field,message) on public.mfd_catalogue_reports to authenticated;

grant update(status,response) on public.mfd_catalogue_reports to authenticated;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue'::regclass and polname='catalogue_read') then
  execute $definition$create policy catalogue_read on public.mfd_catalogue for select to authenticated using (kind='food' or creator_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue'::regclass and polname='catalogue_create') then
  execute $definition$create policy catalogue_create on public.mfd_catalogue for insert to authenticated with check(creator_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue'::regclass and polname='catalogue_edit') then
  execute $definition$create policy catalogue_edit on public.mfd_catalogue for update to authenticated using(creator_id=(select auth.uid())) with check(creator_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue_reports'::regclass and polname='reports_read') then
  execute $definition$create policy reports_read on public.mfd_catalogue_reports for select to authenticated using(reporter_id=(select auth.uid()) or exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid())))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue_reports'::regclass and polname='reports_create') then
  execute $definition$create policy reports_create on public.mfd_catalogue_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='open' and response='' and exists(select 1 from public.mfd_catalogue c where c.id=item_id and not c.archived))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue_reports'::regclass and polname='reports_review') then
  execute $definition$create policy reports_review on public.mfd_catalogue_reports for update to authenticated using(exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid()))) with check(exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid())))$definition$;
 end if;
end $create_policy$;

do $create_function$
begin
 if to_regprocedure('public.mfd_catalogue_validate()') is null then
  execute $definition$create function public.mfd_catalogue_validate() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text; v numeric;
begin
 if tg_op='UPDATE' then new.updated_at=clock_timestamp(); end if;
 if tg_table_name='mfd_catalogue' then
  if new.kind='food' then
   foreach k in array array['basis','cal','p','c','f'] loop
    if jsonb_typeof(new.data->k) is distinct from 'number' then raise exception 'Missing numeric %',k; end if;
    v=(new.data->>k)::numeric;
    if v<0 or v>100000 or (k='basis' and v<=0) then raise exception 'Invalid %',k; end if;
   end loop;
   if (new.data->>'unit') is null or (new.data->>'unit') not in ('g','ml','serving') then raise exception 'Invalid reference unit'; end if;
  else
   if (new.data->>'tracking') is null or (new.data->>'tracking') not in ('weight_reps','reps','duration','weight_duration','distance_duration','weight_distance') then raise exception 'Invalid exercise tracking'; end if;
  end if;
 end if;
 return new;
end $$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('public.mfd_catalogue_validate()') and md5(regexp_replace(prosrc,'\s+','','g'))='6e3040aeb5b0ac9fb611bc8b46c38641' and prosecdef=false and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: public.mfd_catalogue_validate()';
 end if;
end $create_function$;

revoke all on function public.mfd_catalogue_validate() from public,anon,authenticated;

do $create_trigger$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.mfd_catalogue'::regclass and tgname='mfd_catalogue_validate' and not tgisinternal) then
  execute $definition$create trigger mfd_catalogue_validate before insert or update on public.mfd_catalogue for each row execute function public.mfd_catalogue_validate()$definition$;
 end if;
end $create_trigger$;

do $create_trigger$
begin
 if not exists(select 1 from pg_trigger where tgrelid='public.mfd_catalogue_reports'::regclass and tgname='mfd_report_updated' and not tgisinternal) then
  execute $definition$create trigger mfd_report_updated before update on public.mfd_catalogue_reports for each row execute function public.mfd_catalogue_validate()$definition$;
 end if;
end $create_trigger$;

-- Reviewed definitions from database/social-photos.sql (no installer replay).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('mfd-avatars','mfd-avatars',false,1048576,array['image/jpeg']),('mfd-workout-photos','mfd-workout-photos',false,2097152,array['image/jpeg']) on conflict(id) do nothing;

create table if not exists public.mfd_workout_photos(owner_id uuid not null default auth.uid(),workout_id text not null,path text not null unique,primary key(owner_id,workout_id),foreign key(owner_id,workout_id) references public.mfd_social_workouts(owner_id,workout_id) on delete cascade,check(split_part(path,'/',1)=owner_id::text));

alter table public.mfd_workout_photos enable row level security;

revoke all on public.mfd_workout_photos from public,anon,authenticated;

grant select,delete on public.mfd_workout_photos to authenticated;

grant insert(workout_id,path),update(path) on public.mfd_workout_photos to authenticated;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_workout_photos'::regclass and polname='workout_photo_read') then
  execute $definition$create policy workout_photo_read on public.mfd_workout_photos for select to authenticated using(owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid())))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_workout_photos'::regclass and polname='workout_photo_create') then
  execute $definition$create policy workout_photo_create on public.mfd_workout_photos for insert to authenticated with check(owner_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_workout_photos'::regclass and polname='workout_photo_update') then
  execute $definition$create policy workout_photo_update on public.mfd_workout_photos for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_workout_photos'::regclass and polname='workout_photo_delete') then
  execute $definition$create policy workout_photo_delete on public.mfd_workout_photos for delete to authenticated using(owner_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='avatar_read') then
  execute $definition$create policy avatar_read on storage.objects for select to authenticated using(bucket_id='mfd-avatars' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.mfd_profiles p where p.avatar_path=name)))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='avatar_insert') then
  execute $definition$create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='mfd-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='avatar_remove') then
  execute $definition$create policy avatar_remove on storage.objects for delete to authenticated using(bucket_id='mfd-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='social_photo_read') then
  execute $definition$create policy social_photo_read on storage.objects for select to authenticated using(bucket_id='mfd-workout-photos' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.mfd_workout_photos p where p.path=name and public.mfd_are_friends(p.owner_id,(select auth.uid())))))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='social_photo_insert') then
  execute $definition$create policy social_photo_insert on storage.objects for insert to authenticated with check(bucket_id='mfd-workout-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='social_photo_remove') then
  execute $definition$create policy social_photo_remove on storage.objects for delete to authenticated using(bucket_id='mfd-workout-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)$definition$;
 end if;
end $create_policy$;

-- Reviewed definitions from database/catalogue-photos.sql (no installer replay).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('catalogue-photos','catalogue-photos',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='catalogue_photo_read') then
  execute $definition$create policy catalogue_photo_read on storage.objects for select to authenticated using(bucket_id='catalogue-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='catalogue_photo_upload') then
  execute $definition$create policy catalogue_photo_upload on storage.objects for insert to authenticated with check(bucket_id='catalogue-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='catalogue_photo_remove') then
  execute $definition$create policy catalogue_photo_remove on storage.objects for delete to authenticated using(bucket_id='catalogue-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)$definition$;
 end if;
end $create_policy$;

-- Reviewed definitions from database/private-photo-metadata.sql (no installer replay).
create table if not exists public.mfd_catalogue_photos (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.mfd_catalogue(id),
 owner_id uuid not null default auth.uid() references auth.users(id),
 path text not null unique check(char_length(path)<300),
 created_at timestamptz not null default now()
);

create index if not exists mfd_photo_item on public.mfd_catalogue_photos(item_id);

create index if not exists mfd_photo_owner on public.mfd_catalogue_photos(owner_id);

alter table public.mfd_catalogue_photos enable row level security;

revoke all on public.mfd_catalogue_photos from public,anon,authenticated;

grant select,delete on public.mfd_catalogue_photos to authenticated;

grant insert(item_id,path) on public.mfd_catalogue_photos to authenticated;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue_photos'::regclass and polname='photo_metadata_read') then
  execute $definition$create policy photo_metadata_read on public.mfd_catalogue_photos for select to authenticated using(owner_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue_photos'::regclass and polname='photo_metadata_create') then
  execute $definition$create policy photo_metadata_create on public.mfd_catalogue_photos for insert to authenticated with check(owner_id=(select auth.uid()) and split_part(path,'/',1)=(select auth.uid())::text and exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid())))$definition$;
 end if;
end $create_policy$;

do $create_policy$
begin
 if not exists(select 1 from pg_policy where polrelid='public.mfd_catalogue_photos'::regclass and polname='photo_metadata_delete') then
  execute $definition$create policy photo_metadata_delete on public.mfd_catalogue_photos for delete to authenticated using(owner_id=(select auth.uid()))$definition$;
 end if;
end $create_policy$;

-- Reviewed definitions from database/sync-observability.sql (no installer replay).
create schema if not exists mfd_observability;

revoke all on schema mfd_observability from public,anon,authenticated;

grant usage on schema mfd_observability to authenticated,service_role;

create table if not exists mfd_observability.sync_totals (
 outcome text primary key check(outcome in ('saved','conflict')),
 total bigint not null default 0,
 seconds_total double precision not null default 0,
 last_at timestamptz
);

alter table mfd_observability.sync_totals enable row level security;

revoke all on mfd_observability.sync_totals from public,anon,authenticated;

grant select on mfd_observability.sync_totals to service_role;

insert into mfd_observability.sync_totals(outcome) values('saved'),('conflict') on conflict do nothing;

do $create_function$
begin
 if to_regprocedure('mfd_observability.record_sync(text,double precision)') is null then
  execute $definition$create function mfd_observability.record_sync(outcome text, elapsed double precision)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.jwt()->>'client_id' is not null then raise exception 'Sign in required' using errcode='42501'; end if;
 if outcome not in ('saved','conflict') or elapsed<0 or elapsed>600 then raise exception 'Invalid metric'; end if;
 update mfd_observability.sync_totals t set total=t.total+1,seconds_total=t.seconds_total+elapsed,last_at=clock_timestamp() where t.outcome=record_sync.outcome;
end $$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('mfd_observability.record_sync(text,double precision)') and md5(regexp_replace(prosrc,'\s+','','g'))='d8a3ef2ebbc2c1c8165257146c4e1ab0' and prosecdef=true and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: mfd_observability.record_sync(text,double precision)';
 end if;
end $create_function$;

revoke all on function mfd_observability.record_sync(text,double precision) from public,anon;

grant execute on function mfd_observability.record_sync(text,double precision) to authenticated;

do $create_function$
begin
 if to_regprocedure('public.forma_save_workspace_v2(jsonb,bigint)') is null then
  execute $definition$create function public.forma_save_workspace_v2(document jsonb,expected_revision bigint)
returns table(saved_revision bigint,saved_at timestamptz,conflict boolean)
language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_revision bigint; v_at timestamptz; started timestamptz:=clock_timestamp();
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if jsonb_typeof(document) is distinct from 'object' or octet_length(document::text)>8000000 then raise exception 'Invalid workspace document' using errcode='22023'; end if;
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid revision' using errcode='22023'; end if;
 if expected_revision=0 then
  insert into public.forma_workspaces(user_id,payload) values(v_user,document) on conflict(user_id) do nothing returning revision,updated_at into v_revision,v_at;
 else
  update public.forma_workspaces set payload=document,revision=revision+1,updated_at=now() where user_id=v_user and revision=expected_revision returning revision,updated_at into v_revision,v_at;
 end if;
 perform mfd_observability.record_sync(case when v_revision is null then 'conflict' else 'saved' end,extract(epoch from clock_timestamp()-started)::double precision);
 return query select v_revision,v_at,v_revision is null;
end $$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('public.forma_save_workspace_v2(jsonb,bigint)') and md5(regexp_replace(prosrc,'\s+','','g'))='a2ea11187dbcea2fa27e411c0d9e2266' and prosecdef=false and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: public.forma_save_workspace_v2(jsonb,bigint)';
 end if;
end $create_function$;

revoke all on function public.forma_save_workspace_v2(jsonb,bigint) from public,anon;

grant execute on function public.forma_save_workspace_v2(jsonb,bigint) to authenticated;

do $create_function$
begin
 if to_regprocedure('public.mfd_prometheus_metrics()') is null then
  execute $definition$create function public.mfd_prometheus_metrics()
returns text language sql security invoker set search_path='' as $$
 select '# TYPE mfd_sync_operations_total counter'||chr(10)||
 coalesce((select string_agg('mfd_sync_operations_total{outcome="'||outcome||'"} '||total,chr(10)) from mfd_observability.sync_totals),'')||chr(10)||
 '# TYPE mfd_sync_duration_seconds_sum counter'||chr(10)||
 coalesce((select 'mfd_sync_duration_seconds_sum '||sum(seconds_total) from mfd_observability.sync_totals),'')||chr(10)||
 '# TYPE mfd_db_transactions_total counter'||chr(10)||
 coalesce((select 'mfd_db_transactions_total{outcome="commit"} '||xact_commit||chr(10)||'mfd_db_transactions_total{outcome="rollback"} '||xact_rollback from pg_catalog.pg_stat_database where datname=current_database()),'')||chr(10)||
 '# TYPE mfd_db_connections gauge'||chr(10)||'mfd_db_connections '||(select count(*) from pg_catalog.pg_stat_activity where datname=current_database())||chr(10)||
 '# TYPE mfd_db_max_connections gauge'||chr(10)||'mfd_db_max_connections '||current_setting('max_connections')||chr(10);
$$$definition$;
 elsif not exists(select 1 from pg_proc where oid=to_regprocedure('public.mfd_prometheus_metrics()') and md5(regexp_replace(prosrc,'\s+','','g'))='3b22daa16f066131d27a11c33d4fc9ef' and prosecdef=false and proconfig=array['search_path=""']) then
  raise exception 'C01: existing function differs: public.mfd_prometheus_metrics()';
 end if;
end $create_function$;

revoke all on function public.mfd_prometheus_metrics() from public,anon,authenticated;

grant execute on function public.mfd_prometheus_metrics() to service_role;

-- Harden private-schema access; existing MCP schema usage is intentionally retained.
revoke all on schema mfd_private from public,anon,authenticated;
revoke all on schema mfd_observability from public,anon;
grant usage on schema mfd_observability to authenticated,service_role;
-- Remove excess table-wide powers without disturbing required browser/column DML.
revoke truncate,references,trigger,maintain on public.forma_workspaces from public,anon,authenticated;

revoke truncate,references,trigger,maintain on public.mfd_profiles,public.mfd_friendships,public.mfd_blocks,public.mfd_social_workouts,public.mfd_messages,public.mfd_reactions,public.mfd_catalogue,public.mfd_catalogue_reports,public.mfd_workout_photos,public.mfd_catalogue_photos from public,anon,authenticated;

-- Restrictive OAuth boundary: explicit allowlist of app tables, not future wildcard writes.
do $oauth_policies$
declare target regclass;
begin
 foreach target in array array['public.mfd_profiles'::regclass,'public.mfd_friendships'::regclass,'public.mfd_blocks'::regclass,'public.mfd_social_workouts'::regclass,'public.mfd_messages'::regclass,'public.mfd_reactions'::regclass,'public.mfd_catalogue'::regclass,'public.mfd_catalogue_reports'::regclass,'public.mfd_workout_photos'::regclass,'public.mfd_catalogue_photos'::regclass] loop
  if not exists(select 1 from pg_policy where polrelid=target and polname='c01_no_oauth_direct') then
   execute format('create policy c01_no_oauth_direct on %s as restrictive for all to authenticated using ((select auth.jwt())->>''client_id'' is null) with check ((select auth.jwt())->>''client_id'' is null)',target);
  end if;
 end loop;
end $oauth_policies$;
-- Do not update/reinsert the current settings row.
alter table mfd_mcp.settings alter column resource_uri set default 'https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp';



-- No cleanup job is installed. Message expiry remains enforced by read policies.
-- Do not execute this file without the companion review, snapshots and target checks.

-- Exact reviewed catalog guard. Extra/changed policies, functions, indexes,
-- columns, constraints, triggers or bucket settings abort rather than being overwritten.
do $catalog_guard$
declare actual jsonb;
begin
 select jsonb_build_object(
'columns',(select jsonb_agg(to_jsonb(t)) from (select n.nspname as schema,c.relname as name,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) as default_value,pg_get_userbyid(c.relowner) as owner,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.oid=any(array['public.forma_workspaces'::regclass,'public.mfd_profiles'::regclass,'public.mfd_friendships'::regclass,'public.mfd_blocks'::regclass,'public.mfd_social_workouts'::regclass,'public.mfd_messages'::regclass,'public.mfd_reactions'::regclass,'public.mfd_catalogue'::regclass,'public.mfd_catalogue_reports'::regclass,'public.mfd_workout_photos'::regclass,'public.mfd_catalogue_photos'::regclass,'mfd_observability.sync_totals'::regclass]) order by n.nspname,c.relname,a.attnum)t),
'policies',(select jsonb_agg(to_jsonb(t)) from (select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' or (schemaname='storage' and tablename='objects') order by schemaname,tablename,policyname)t),
'constraints',(select jsonb_agg(to_jsonb(t)) from(select n.nspname as schema,c.relname as name,x.conname,pg_get_constraintdef(x.oid) as definition from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where (n.nspname='public' and (c.relname='forma_workspaces' or c.relname like 'mfd_%')) or n.nspname='mfd_observability' order by 1,2,3)t),
'indexes',(select jsonb_agg(to_jsonb(t)) from(select schemaname,tablename,indexname,indexdef from pg_indexes where (schemaname='public' and (tablename='forma_workspaces' or tablename like 'mfd_%')) or schemaname='mfd_observability' order by 1,2,3)t),
'functions',(select jsonb_agg(to_jsonb(t)) from(select n.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_function_result(p.oid) as result,md5(regexp_replace(p.prosrc,'\s+','','g')) as body,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('mfd_private','mfd_observability') or (n.nspname='public' and p.proname in('mfd_are_friends','mfd_catalogue_validate','forma_save_workspace_v2','mfd_prometheus_metrics')) order by 1,2,3)t),
 'triggers',(select jsonb_agg(to_jsonb(t)) from(select n.nspname as schema,c.relname as name,t.tgname,pg_get_triggerdef(t.oid) as definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public' and (c.relname='forma_workspaces' or c.relname like 'mfd_%') order by 1,2,3)t),
'buckets',(select jsonb_agg(to_jsonb(t)) from(select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id in('mfd-avatars','mfd-workout-photos','catalogue-photos') order by id)t)
) into actual;
 if md5(actual::text)<>'086a87995f52cf1a0b7e44fb904b7575' then
  raise exception 'C01: catalog/bucket drift; rollback and review; do not overwrite existing definitions';
 end if;
end $catalog_guard$;

notify pgrst,'reload schema';
commit;
