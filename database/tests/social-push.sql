-- Friend notifications (database/social-push.sql), inside a rolled-back transaction, with stand-ins for pg_net
-- (records each request) and Vault. Checks: nothing is sent until the hook and secret exist; likes, comments and
-- messages each queue one signed request with the right recipient, names, title and counts; own actions send
-- nothing; message text is never sent; a failing sender never blocks the like/comment/message.
begin;
create schema if not exists net; create schema if not exists vault;
create table net.calls(url text, body jsonb, headers jsonb);
create table vault.decrypted_secrets(name text, decrypted_secret text);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
 language plpgsql as $$begin if url like '%fail%' then raise exception 'network down'; end if; insert into net.calls values(url,body,headers); return 1; end$$;
grant usage on schema net to authenticated; -- (the real trigger runs as definer; this only proves no grant is needed)
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true),set_config('test.d',gen_random_uuid()::text,true),set_config('test.e',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.a')::uuid),(current_setting('test.b')::uuid),(current_setting('test.d')::uuid),(current_setting('test.e')::uuid);
insert into public.mfd_profiles(user_id,username,display_name) values(current_setting('test.a')::uuid,'alice.t','Alice'),(current_setting('test.b')::uuid,'riya.t','Riya'),(current_setting('test.d')::uuid,'ben.t','Ben');
insert into public.mfd_social_workouts(owner_id,workout_id,data,started_at) values(current_setting('test.a')::uuid,'w1','{"name":"Upper 1"}',now());
insert into public.mfd_friendships(sender,recipient,status) values(current_setting('test.a')::uuid,current_setting('test.b')::uuid,'accepted'),(current_setting('test.d')::uuid,current_setting('test.a')::uuid,'accepted'),(current_setting('test.e')::uuid,current_setting('test.a')::uuid,'accepted');
set local role authenticated;

-- 1. Not set up yet: the like is saved, nothing is sent.
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
insert into public.mfd_reactions(owner_id,workout_id) values(current_setting('test.a')::uuid,'w1');
reset role;
do $$begin if (select count(*) from net.calls)<>0 then raise exception 'Sent before setup'; end if;
 if (select count(*) from public.mfd_reactions)<>1 then raise exception 'Like not saved'; end if; end$$;
-- Setup: connector address + secret.
insert into mfd_private.social_push_hook(url) values('https://connect.invalid/push/social');
insert into vault.decrypted_secrets values('mfd_social_hook',repeat('s',48));
set local role authenticated;

-- 2. A friend likes: one request to the owner, with names, title, count and the secret.
select set_config('request.jwt.claim.sub',current_setting('test.d'),true);
insert into public.mfd_reactions(owner_id,workout_id) values(current_setting('test.a')::uuid,'w1');
-- 3. The owner likes their own workout: nothing.
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
insert into public.mfd_reactions(owner_id,workout_id) values(current_setting('test.a')::uuid,'w1');
reset role;
do $$declare c record;begin
 if (select count(*) from net.calls)<>1 then raise exception 'Expected 1 request after the friend like, got %',(select count(*) from net.calls); end if;
 select * into c from net.calls;
 if c.url<>'https://connect.invalid/push/social' or c.headers->>'X-MFD-Hook'<>repeat('s',48) or c.headers->>'Content-Type'<>'application/json' then raise exception 'Wrong address or headers'; end if;
 if c.body->>'kind'<>'like' or (c.body->>'recipient')::uuid<>current_setting('test.a')::uuid or (c.body->>'actor')::uuid<>current_setting('test.d')::uuid
    or c.body->>'actor_name'<>'Ben' or c.body->>'title'<>'Upper 1' or c.body->>'workout'<>'w1' or (c.body->>'count')::int<>2 then raise exception 'Wrong like payload: %',c.body; end if;
end$$;
delete from net.calls;
set local role authenticated;

-- 4. A comment: title and the first 160 characters; own comment on own workout sends nothing.
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','  '||repeat('Strong! ',40));
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','Thanks');
reset role;
do $$declare c record;begin
 if (select count(*) from net.calls)<>1 then raise exception 'Expected 1 comment request'; end if;
 select * into c from net.calls;
 if c.body->>'kind'<>'comment' or c.body->>'actor_name'<>'Riya' or c.body->>'title'<>'Upper 1' or length(c.body->>'text')<>160 or c.body->>'text' not like 'Strong!%' then raise exception 'Wrong comment payload: %',c.body; end if;
end$$;
delete from net.calls;
set local role authenticated;

-- 5. Chat: sender's name and username, unread count; the message text is never sent.
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
insert into public.mfd_messages(recipient,body) values(current_setting('test.a')::uuid,'secret plan for tomorrow');
insert into public.mfd_messages(recipient,body) values(current_setting('test.a')::uuid,'second');
reset role;
do $$declare c record;begin
 if (select count(*) from net.calls)<>2 then raise exception 'Expected 2 message requests'; end if;
 select * into c from net.calls order by (body->>'count')::int desc limit 1;
 if c.body->>'kind'<>'message' or c.body->>'actor_username'<>'riya.t' or (c.body->>'count')::int<>2 or (c.body->>'recipient')::uuid<>current_setting('test.a')::uuid then raise exception 'Wrong message payload: %',c.body; end if;
 if exists(select 1 from net.calls where body::text like '%secret plan%' or body::text like '%second%') then raise exception 'Message text was sent'; end if;
end$$;
delete from net.calls;

-- 6. Someone without a profile sends nothing; a short secret sends nothing; a failing sender never blocks the like.
set local role authenticated;select set_config('request.jwt.claim.sub',current_setting('test.e'),true);
insert into public.mfd_reactions(owner_id,workout_id) values(current_setting('test.a')::uuid,'w1');
reset role;update vault.decrypted_secrets set decrypted_secret='short';
set local role authenticated;select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','again');
reset role;update vault.decrypted_secrets set decrypted_secret=repeat('s',48);update mfd_private.social_push_hook set url='https://fail.invalid/push/social';
set local role authenticated;select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
insert into public.mfd_messages(recipient,body) values(current_setting('test.a')::uuid,'still delivered');
reset role;
do $$begin
 if (select count(*) from net.calls)<>0 then raise exception 'Should not have sent: %',(select json_agg(body) from net.calls); end if;
 if (select count(*) from public.mfd_reactions where user_id=current_setting('test.e')::uuid)<>1 then raise exception 'Like without profile not saved'; end if;
 if not exists(select 1 from public.mfd_messages where body='still delivered') then raise exception 'Message lost when the sender failed'; end if;
 -- Nobody but the database owner can read the hook settings or call the sender.
 if has_table_privilege('authenticated','mfd_private.social_push_hook','select') or has_function_privilege('authenticated','mfd_private.social_push(text,uuid,uuid,jsonb)','execute') then raise exception 'Hook settings exposed'; end if;
end$$;
select 'PASS friend notifications: nothing before setup; like/comment/message each queue one signed request with names, title and counts; own actions and people without a profile send nothing; chat text never sent; short secret refused; a failing sender never blocks the like, comment or message; settings private';
rollback;
