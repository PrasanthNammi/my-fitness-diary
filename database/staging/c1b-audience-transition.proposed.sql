-- PROPOSAL ONLY. Separate explicit hosted approval required. Not a CLI migration.
-- Verify project/host externally; session assertions are not project identification.
-- Same session must set mfd.c1b.target_ref and mfd.c1b.exposed_schemas from verified evidence.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('mfd-c1b-audience-transition',0));
do $transition$
declare
 old_resource constant text := 'https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp';
 new_resource constant text := 'https://mfd-connect-staging.shanustylish777.workers.dev/mcp';
 active_resource text;
 existing_default text;
begin
 if current_user <> 'postgres' or current_setting('mfd.c1b.target_ref',true) is distinct from 'gngnrmzeghjzqsmzuktl'
 or current_setting('mfd.c1b.exposed_schemas',true) is distinct from 'public,graphql_public' then
  raise exception 'C1B: unverified role, target or exposure assertion';
 end if;
 lock table mfd_mcp.settings in exclusive mode;
 -- Empty-client transition only: do not silently migrate existing consent/tokens.
 lock table mfd_mcp.clients,mfd_mcp.grants,mfd_mcp.proposals in share mode;
 if exists(select 1 from mfd_mcp.clients) or exists(select 1 from mfd_mcp.grants) or exists(select 1 from mfd_mcp.proposals) then
  raise exception 'C1B: client/grant/proposal inventory changed; review lifecycle first';
 end if;
 if (select count(*) from mfd_mcp.settings) <> 1
 or not exists(select 1 from mfd_mcp.settings where id=true and writes_enabled=false) then
  raise exception 'C1B: settings identity/count/write switch drift';
 end if;
 select resource_uri into active_resource from mfd_mcp.settings where id=true;
 select pg_get_expr(d.adbin,d.adrelid) into existing_default from pg_attrdef d
 join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
 where d.adrelid='mfd_mcp.settings'::regclass and a.attname='resource_uri';
 if active_resource not in(old_resource,new_resource)
 or existing_default is distinct from format('%L::text',active_resource) then
  raise exception 'C1B: unexpected resource/default; no overwrite';
 end if;
 if active_resource=old_resource then
  update mfd_mcp.settings set resource_uri=new_resource where id=true and writes_enabled=false and resource_uri=old_resource;
  if not found then raise exception 'C1B: compare-and-set failed'; end if;
  execute format('alter table mfd_mcp.settings alter column resource_uri set default %L',new_resource);
 end if;
 if not exists(select 1 from mfd_mcp.settings where id=true and writes_enabled=false and resource_uri=new_resource)
 or (select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='mfd_mcp.settings'::regclass and a.attname='resource_uri') is distinct from format('%L::text',new_resource) then
  raise exception 'C1B: final audience assertion failed';
 end if;
end $transition$;
notify pgrst,'reload schema';
commit;
