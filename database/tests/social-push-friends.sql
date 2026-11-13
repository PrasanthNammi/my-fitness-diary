-- Friend-request notifications (database/social-push-friends.sql), inside a rolled-back transaction, with the same
-- pg_net and Vault stand-ins as social-push.sql. Checks: a request queues one signed request to the recipient with
-- the sender's names; accepting queues one to the sender; nothing else changes the friendship; a failing sender
-- never blocks the request or the acceptance.
begin;
create schema if not exists net; create schema if not exists vault;
create table if not exists net.calls(url text, body jsonb, headers jsonb);
create table if not exists vault.decrypted_secrets(name text, decrypted_secret text);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
 language plpgsql as $$begin if url like '%fail%' then raise exception 'network down'; end if; insert into net.calls values(url,body,headers); return 1; end$$;
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true),set_config('test.c',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.a')::uuid),(current_setting('test.b')::uuid),(current_setting('test.c')::uuid);
insert into public.mfd_profiles(user_id,username,display_name) values(current_setting('test.a')::uuid,'alice.f','Alice'),(current_setting('test.b')::uuid,'riya.f','Riya'),(current_setting('test.c')::uuid,'ben.f','Ben');
insert into mfd_private.social_push_hook(url) values('https://connect.invalid/push/social') on conflict (id) do update set url=excluded.url;
insert into vault.decrypted_secrets values('mfd_social_hook',repeat('s',48));
delete from net.calls;

-- 1. Riya asks Alice: one request to Alice, with Riya's names.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
insert into public.mfd_friendships(recipient) values(current_setting('test.a')::uuid);
reset role;
do $$declare c record;begin
 if (select count(*) from net.calls)<>1 then raise exception 'Expected 1 request notification, got %',(select count(*) from net.calls); end if;
 select * into c from net.calls;
 if c.body->>'kind'<>'request' or (c.body->>'recipient')::uuid<>current_setting('test.a')::uuid or c.body->>'actor_name'<>'Riya' or c.body->>'actor_username'<>'riya.f'
    or c.headers->>'X-MFD-Hook'<>repeat('s',48) then raise exception 'Wrong request payload: %',c.body; end if;
end$$;
delete from net.calls;

-- 2. Alice accepts: one notification to Riya, with Alice's names.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
update public.mfd_friendships set status='accepted' where sender=current_setting('test.b')::uuid;
reset role;
do $$declare c record;begin
 if (select count(*) from net.calls)<>1 then raise exception 'Expected 1 accepted notification'; end if;
 select * into c from net.calls;
 if c.body->>'kind'<>'accepted' or (c.body->>'recipient')::uuid<>current_setting('test.b')::uuid or c.body->>'actor_username'<>'alice.f' then raise exception 'Wrong accepted payload: %',c.body; end if;
 if (select status from public.mfd_friendships where sender=current_setting('test.b')::uuid)<>'accepted' then raise exception 'Not accepted'; end if;
end$$;
delete from net.calls;

-- 3. A failing sender never blocks a request.
update mfd_private.social_push_hook set url='https://fail.invalid/push/social';
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.c'),true);
insert into public.mfd_friendships(recipient) values(current_setting('test.a')::uuid);
reset role;
do $$begin
 if (select count(*) from net.calls)<>0 then raise exception 'Should not have sent'; end if;
 if not exists(select 1 from public.mfd_friendships where sender=current_setting('test.c')::uuid and status='pending') then raise exception 'Request lost when the sender failed'; end if;
 if has_function_privilege('authenticated','mfd_private.social_push_friendship()','execute') then raise exception 'Trigger function exposed'; end if;
end$$;
select 'PASS friend-request notifications: a request tells the recipient, accepting tells the sender, both with names and the signed secret; a failing sender never blocks them; function private';
rollback;
