-- LOCAL PROPOSAL ONLY. Separate explicit approval required for hosted recovery.
-- Never run automatically after forward execution. Operator assertions are not
-- cryptographic project identity or queries of hosted runtime/Auth settings.
-- Required same-session assertions: target_ref, exposed_schemas,
-- worker_writes='false', oauth_server_disabled='true', approved_user_ids=JSON UUID array.
begin;
set transaction isolation level read committed;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('mfd-c1b-audience-transition',0));
do $rollback$
declare
 expected_resource constant text := 'https://mfd-connect-staging.shanustylish777.workers.dev/mcp';
 restored_resource constant text := 'https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp';
 approved jsonb;
 approved_ids uuid[];
 existing_default text;
 target regclass;
begin
 if current_user <> 'postgres'
 or current_setting('mfd.c1b.target_ref',true) is distinct from 'gngnrmzeghjzqsmzuktl'
 or current_setting('mfd.c1b.exposed_schemas',true) is distinct from 'public,graphql_public'
 or current_setting('mfd.c1b.worker_writes',true) is distinct from 'false'
 or current_setting('mfd.c1b.oauth_server_disabled',true) is distinct from 'true' then
  raise exception 'C1B rollback: unverified role/target/exposure/runtime assertions';
 end if;
 approved := current_setting('mfd.c1b.approved_user_ids',true)::jsonb;
 if approved is null or jsonb_typeof(approved)<>'array' then
  raise exception 'C1B rollback: expected two approved user IDs';
 end if;
 if jsonb_array_length(approved)<>2 or exists(select 1 from jsonb_array_elements(approved) v where jsonb_typeof(v)<>'string') then
  raise exception 'C1B rollback: expected two approved user IDs';
 end if;
 select array_agg(value::uuid order by value::uuid) into approved_ids from jsonb_array_elements_text(approved);
 if approved_ids[1]=approved_ids[2] then raise exception 'C1B rollback: duplicate approved user IDs'; end if;
 -- Verify existing lock/read authority; never grant permissions to force recovery.
 foreach target in array array['mfd_mcp.settings'::regclass,'mfd_mcp.clients'::regclass,
  'mfd_mcp.grants'::regclass,'mfd_mcp.proposals'::regclass,'auth.users'::regclass,
  'auth.identities'::regclass,'auth.sessions'::regclass,'auth.oauth_clients'::regclass,
  'auth.oauth_authorizations'::regclass,'auth.oauth_consents'::regclass] loop
  if not has_table_privilege(current_user,target,'SELECT')
  or not has_table_privilege(current_user,target,'UPDATE,DELETE,TRUNCATE,MAINTAIN') then
   raise exception 'C1B rollback: required read/lock authority missing for %',target;
  end if;
 end loop;
 lock table mfd_mcp.settings in exclusive mode;
 lock table mfd_mcp.clients,mfd_mcp.grants,mfd_mcp.proposals,
  auth.users,auth.identities,auth.sessions,auth.oauth_clients,
  auth.oauth_authorizations,auth.oauth_consents in share mode;
 if (select count(*) from auth.users)<>2
 or exists(select 1 from auth.users where not(id=any(approved_ids)) or email_confirmed_at is null or is_anonymous is distinct from false)
 or (select count(*) from auth.identities)<>2
 or exists(select 1 from auth.identities where provider<>'email' or not(user_id=any(approved_ids)))
 or exists(select 1 from auth.users u where (select count(*) from auth.identities i where i.user_id=u.id and i.provider='email')<>1) then
  raise exception 'C1B rollback: approved Auth baseline drift';
 end if;
 if exists(select 1 from auth.sessions) or exists(select 1 from auth.oauth_clients)
 or exists(select 1 from auth.oauth_authorizations) or exists(select 1 from auth.oauth_consents)
 or exists(select 1 from mfd_mcp.clients) or exists(select 1 from mfd_mcp.grants)
 or exists(select 1 from mfd_mcp.proposals) then
  raise exception 'C1B rollback: OAuth/client/grant/session state is not empty';
 end if;
 if (select count(*) from mfd_mcp.settings)<>1
 or not exists(select 1 from mfd_mcp.settings where id=true and writes_enabled=false and resource_uri=expected_resource) then
  raise exception 'C1B rollback: unexpected current audience/row/write switch';
 end if;
 select pg_get_expr(d.adbin,d.adrelid) into existing_default from pg_attrdef d
 join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
 where d.adrelid='mfd_mcp.settings'::regclass and a.attname='resource_uri';
 if existing_default is distinct from format('%L::text',expected_resource) then
  raise exception 'C1B rollback: current column default drift';
 end if;
 update mfd_mcp.settings set resource_uri=restored_resource
 where id=true and writes_enabled=false and resource_uri=expected_resource;
 if not found then raise exception 'C1B rollback: compare-and-swap failed'; end if;
 execute format('alter table mfd_mcp.settings alter column resource_uri set default %L',restored_resource);
 if not exists(select 1 from mfd_mcp.settings where id=true and writes_enabled=false and resource_uri=restored_resource)
 or (select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid='mfd_mcp.settings'::regclass and a.attname='resource_uri') is distinct from format('%L::text',restored_resource) then
  raise exception 'C1B rollback: final restored-state assertion failed';
 end if;
end $rollback$;
notify pgrst,'reload schema';
commit;
