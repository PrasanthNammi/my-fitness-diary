-- Comments (database/social-comments.sql), inside a rolled-back transaction: only the owner and friends
-- read and write, blocked people's comments are hidden, length limits, author/owner delete, removal records.
begin;
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true),set_config('test.c',gen_random_uuid()::text,true),set_config('test.d',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.a')::uuid),(current_setting('test.b')::uuid),(current_setting('test.c')::uuid),(current_setting('test.d')::uuid);
-- a owns a workout; b and d are a's friends; c is a stranger.
insert into public.mfd_social_workouts(owner_id,workout_id,data,started_at) values(current_setting('test.a')::uuid,'w1','{"name":"Push"}',now());
insert into public.mfd_friendships(sender,recipient,status) values(current_setting('test.a')::uuid,current_setting('test.b')::uuid,'accepted'),(current_setting('test.d')::uuid,current_setting('test.a')::uuid,'accepted');
set local role authenticated;

-- A friend comments; the owner comments too.
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','Strong session');
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','Thanks!');
do $$declare n int;begin select count(*) into n from public.mfd_comments;if n<>2 then raise exception 'Owner should read 2 comments, got %',n;end if;end$$;

-- A stranger can neither read nor write.
select set_config('request.jwt.claim.sub',current_setting('test.c'),true);
do $$declare n int;begin select count(*) into n from public.mfd_comments;if n<>0 then raise exception 'Stranger read % comments',n;end if;
 begin insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','hi');raise exception 'Stranger could comment';exception when insufficient_privilege then null;end;end$$;

-- Nobody can comment as someone else, or with an empty or too long text.
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
do $$begin
 begin insert into public.mfd_comments(owner_id,workout_id,body,user_id) values(current_setting('test.a')::uuid,'w1','x',current_setting('test.d')::uuid);raise exception 'Could set the author';exception when insufficient_privilege then null;end;
 begin insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','   ');raise exception 'Empty comment accepted';exception when check_violation then null;end;
 begin insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1',repeat('x',501));raise exception 'Too long comment accepted';exception when check_violation then null;end;
end$$;

-- Another friend of the owner reads both; after blocking b, b's comment is hidden from d.
select set_config('request.jwt.claim.sub',current_setting('test.d'),true);
do $$declare n int;begin select count(*) into n from public.mfd_comments;if n<>2 then raise exception 'Friend should read 2, got %',n;end if;end$$;
insert into public.mfd_blocks(target_id) values(current_setting('test.b')::uuid);
do $$declare n int;begin select count(*) into n from public.mfd_comments;if n<>1 then raise exception 'Blocked author still visible (% rows)',n;end if;end$$;
-- d can't delete someone else's comment on someone else's workout.
delete from public.mfd_comments where body='Thanks!';
do $$declare n int;begin select count(*) into n from public.mfd_comments where body='Thanks!';if n<>1 then raise exception 'Friend deleted the owner''s comment';end if;end$$;

-- The author deletes their own; the owner deletes a friend's on their workout. Each leaves a removal record.
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
insert into public.mfd_comments(owner_id,workout_id,body) values(current_setting('test.a')::uuid,'w1','mine');
delete from public.mfd_comments where body='mine';
delete from public.mfd_comments where body='Strong session';
do $$declare n int;begin
 select count(*) into n from public.mfd_comments;if n<>1 then raise exception 'Expected 1 comment left, got %',n;end if;
 select count(*) into n from public.mfd_social_removals where kind='comment' and comment_id is not null and owner_id=current_setting('test.a')::uuid;if n<>2 then raise exception 'Expected 2 comment removal records, got %',n;end if;
end$$;
-- The friend sees those removal records; the stranger doesn't.
select set_config('request.jwt.claim.sub',current_setting('test.d'),true);
do $$declare n int;begin select count(*) into n from public.mfd_social_removals where kind='comment';if n<>2 then raise exception 'Friend should see 2 removals, got %',n;end if;end$$;
select set_config('request.jwt.claim.sub',current_setting('test.c'),true);
do $$declare n int;begin select count(*) into n from public.mfd_social_removals where kind='comment';if n<>0 then raise exception 'Stranger sees removals';end if;end$$;

-- Removing the workout removes its comments too.
reset role;
delete from public.mfd_social_workouts where owner_id=current_setting('test.a')::uuid and workout_id='w1';
do $$declare n int;begin select count(*) into n from public.mfd_comments;if n<>0 then raise exception 'Comments outlived their workout';end if;end$$;
select 'PASS social comments: owner and friends read and write, strangers neither, author fixed, length limits, blocked authors hidden, author/owner delete, removal records for friends only, comments go with their workout';
rollback;
