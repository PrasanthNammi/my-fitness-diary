-- PROPOSAL ONLY. Execute only under consolidated hosted approval after native registration.
-- Same-session assertions come from fresh independent staging/runtime/dashboard evidence.
-- client_id is the provider-assigned PUBLIC native ChatGPT ID, never a Google ID.
begin;
set transaction isolation level read committed;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('mfd-c1b-client-allowlist',0));
do $allowlist$
declare
 approved jsonb;
 ids uuid[];
 chosen uuid;
begin
 if current_user<>'postgres'
 or current_setting('mfd.c1b.target_ref',true) is distinct from 'gngnrmzeghjzqsmzuktl'
 or current_setting('mfd.c1b.worker_writes',true) is distinct from 'false'
 or current_setting('mfd.c1b.oauth_ready',true) is distinct from 'true' then
  raise exception 'C1B client: unverified target/runtime/OAuth assertions';
 end if;
 chosen:=current_setting('mfd.c1b.client_id',true)::uuid;
 if chosen is null then raise exception 'C1B client: assigned native ID required'; end if;
 approved:=current_setting('mfd.c1b.approved_user_ids',true)::jsonb;
 if approved is null or jsonb_typeof(approved)<>'array' then raise exception 'C1B client: expected two approved users'; end if;
 if jsonb_array_length(approved)<>2 or exists(select 1 from jsonb_array_elements(approved) v where jsonb_typeof(v)<>'string') then raise exception 'C1B client: expected two approved users'; end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(approved);
 if ids[1]=ids[2] then raise exception 'C1B client: duplicate approved users'; end if;
 lock table mfd_mcp.clients in exclusive mode;
 lock table mfd_mcp.settings,mfd_mcp.grants,mfd_mcp.proposals,auth.users,auth.identities,auth.sessions,auth.oauth_clients,auth.oauth_authorizations,auth.oauth_consents in share mode;
 if (select count(*) from mfd_mcp.settings)<>1 or not exists(select 1 from mfd_mcp.settings where id=true and writes_enabled=false and resource_uri='https://mfd-connect-staging.shanustylish777.workers.dev/mcp') then raise exception 'C1B client: settings drift'; end if;
 if (select count(*) from auth.users)<>2 or exists(select 1 from auth.users where not(id=any(ids)) or email_confirmed_at is null or is_anonymous is distinct from false)
 or (select count(*) from auth.identities)<>2 or exists(select 1 from auth.identities where provider<>'email' or not(user_id=any(ids)))
 or exists(select 1 from auth.users u where (select count(*) from auth.identities i where i.user_id=u.id and i.provider='email')<>1) then raise exception 'C1B client: approved user baseline drift'; end if;
 if (select count(*) from auth.oauth_clients)<>1 or not exists(select 1 from auth.oauth_clients where id=chosen and deleted_at is null and client_type::text='public' and token_endpoint_auth_method='none' and client_name='MFD Staging — ChatGPT' and redirect_uris='https://chatgpt.com/connector/oauth/Xm83tVWz4VJh') then raise exception 'C1B client: native public registration mismatch'; end if;
 if exists(select 1 from auth.sessions) or exists(select 1 from auth.oauth_authorizations) or exists(select 1 from auth.oauth_consents) or exists(select 1 from mfd_mcp.clients) or exists(select 1 from mfd_mcp.grants) or exists(select 1 from mfd_mcp.proposals) then raise exception 'C1B client: lifecycle/local inventory not empty'; end if;
 insert into mfd_mcp.clients(client_id) values(chosen::text);
 if (select count(*) from mfd_mcp.clients)<>1 or not exists(select 1 from mfd_mcp.clients where client_id=chosen::text) then raise exception 'C1B client: final registry mismatch'; end if;
end $allowlist$;
commit;
