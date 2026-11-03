-- PROPOSAL ONLY. Exactly two synthetic owner-bound workspace INSERTs, if explicitly approved.
-- Real approved UUIDs are same-session private assertions, never source constants.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $fixtures$
declare a uuid; b uuid;
begin
 if current_user<>'postgres' or current_setting('mfd.c1b.target_ref',true) is distinct from 'gngnrmzeghjzqsmzuktl' or current_setting('mfd.c1b.worker_writes',true) is distinct from 'false' then raise exception 'C1B fixtures: unverified staging/runtime assertions'; end if;
 a:=current_setting('mfd.c1b.primary_user_id',true)::uuid;b:=current_setting('mfd.c1b.secondary_user_id',true)::uuid;
 if a is null or b is null or a=b then raise exception 'C1B fixtures: two distinct approved users required'; end if;
 lock table public.forma_workspaces in exclusive mode;
 lock table auth.users,mfd_mcp.settings in share mode;
 if (select count(*) from auth.users)<>2 or exists(select 1 from auth.users where id not in(a,b) or email_confirmed_at is null or is_anonymous is distinct from false) then raise exception 'C1B fixtures: approved user drift'; end if;
 if (select count(*) from mfd_mcp.settings)<>1 or not exists(select 1 from mfd_mcp.settings where id=true and writes_enabled=false and resource_uri='https://mfd-connect-staging.shanustylish777.workers.dev/mcp') then raise exception 'C1B fixtures: settings drift'; end if;
 if exists(select 1 from public.forma_workspaces) then raise exception 'C1B fixtures: workspaces not empty'; end if;
 insert into public.forma_workspaces(user_id,payload,revision) values(a,'{"profile":{"name":"MFD STAGING A"}}'::jsonb,1),(b,'{"profile":{"name":"MFD STAGING B"}}'::jsonb,1);
 if (select count(*) from public.forma_workspaces)<>2 or not exists(select 1 from public.forma_workspaces where user_id=a and payload='{"profile":{"name":"MFD STAGING A"}}'::jsonb and revision=1) or not exists(select 1 from public.forma_workspaces where user_id=b and payload='{"profile":{"name":"MFD STAGING B"}}'::jsonb and revision=1) then raise exception 'C1B fixtures: postcondition failed'; end if;
end $fixtures$;
commit;
