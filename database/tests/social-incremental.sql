-- Incremental feed (database/social-incremental.sql), inside a rolled-back transaction:
-- only changed workouts are rewritten, changes and removals are visible to friends only,
-- photo changes mark their workout, and Compare totals respect permissions.
begin;
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true),set_config('test.c',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.a')::uuid),(current_setting('test.b')::uuid),(current_setting('test.c')::uuid);
-- Test state lives in transaction-local settings (no temporary tables: the Supabase SQL editor
-- doesn't keep them between statements).
select set_config('test.sessions',(select jsonb_agg(jsonb_build_object('id','w'||i,'name','Workout '||i,'date',current_date,'started',1700000000000+i*86400000,'finished',1700000000000+i*86400000+3600000,
 'sets',jsonb_build_array(jsonb_build_object('exercise','Bench','type','normal','kg',60,'reps',10,'done',true),jsonb_build_object('exercise','Bench','type','warmup','kg',20,'reps',10,'done',true))) order by i) from generate_series(1,3) i)::text,true);
insert into public.forma_workspaces(user_id,payload) values(current_setting('test.a')::uuid,jsonb_build_object('sessions',current_setting('test.sessions')::jsonb));
select set_config('test.versions',(select jsonb_object_agg(workout_id,ctid::text) from public.mfd_social_workouts where owner_id=current_setting('test.a')::uuid)::text,true);

-- Adding one workout writes one row; the three existing rows are untouched.
update public.forma_workspaces set payload=jsonb_build_object('sessions',current_setting('test.sessions')::jsonb||jsonb_build_array(jsonb_build_object('id','w4','name','New','date',current_date,'started',1700500000000,'sets','[]'::jsonb))) where user_id=current_setting('test.a')::uuid;
do $$declare n int;begin
 select count(*) into n from public.mfd_social_workouts where owner_id=current_setting('test.a')::uuid;if n<>4 then raise exception 'Expected 4 feed rows, got %',n;end if;
 select count(*) into n from public.mfd_social_workouts w where w.owner_id=current_setting('test.a')::uuid and current_setting('test.versions')::jsonb ? w.workout_id and w.ctid::text<>(current_setting('test.versions')::jsonb->>w.workout_id);if n<>0 then raise exception 'Unchanged workouts were rewritten (%)',n;end if;
end$$;

-- Editing one workout rewrites only that one.
update public.forma_workspaces set payload=jsonb_set(payload,'{sessions,0,name}','"Renamed"') where user_id=current_setting('test.a')::uuid;
do $$declare n int;begin
 select count(*) into n from public.mfd_social_workouts w where w.owner_id=current_setting('test.a')::uuid and current_setting('test.versions')::jsonb ? w.workout_id and w.ctid::text<>(current_setting('test.versions')::jsonb->>w.workout_id);if n<>1 then raise exception 'Expected 1 rewritten workout, got %',n;end if;
 select count(*) into n from public.mfd_social_workouts where owner_id=current_setting('test.a')::uuid and data->>'name'='Renamed';if n<>1 then raise exception 'Edit not projected';end if;
end$$;

-- Deleting a workout leaves a removal record.
update public.forma_workspaces set payload=jsonb_set(payload,'{sessions}',(payload->'sessions')-1) where user_id=current_setting('test.a')::uuid;
do $$declare n int;begin
 select count(*) into n from public.mfd_social_removals where kind='workout' and owner_id=current_setting('test.a')::uuid and workout_id='w2';if n<>1 then raise exception 'Workout removal not recorded';end if;
end$$;

-- Friends: A and B; C is a stranger.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
insert into public.mfd_friendships(recipient) values(current_setting('test.b')::uuid);
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
update public.mfd_friendships set status='accepted' where recipient=auth.uid();

-- Reactions carry a time; taking one back leaves a removal record with who reacted.
insert into public.mfd_reactions(owner_id,workout_id) values(current_setting('test.a')::uuid,'w1');
do $$declare n int;begin
 select count(*) into n from public.mfd_reactions where owner_id=current_setting('test.a')::uuid and created_at is not null;if n<>1 then raise exception 'Reaction time missing';end if;
end$$;
delete from public.mfd_reactions where owner_id=current_setting('test.a')::uuid and workout_id='w1';
do $$declare n int;begin
 select count(*) into n from public.mfd_social_removals where kind='reaction' and workout_id='w1' and user_id=auth.uid();if n<>1 then raise exception 'Friend cannot read reaction removal';end if;
 select count(*) into n from public.mfd_social_removals where kind='workout' and workout_id='w2';if n<>1 then raise exception 'Friend cannot read workout removal';end if;
 begin insert into public.mfd_social_removals(kind,owner_id,workout_id) values('workout',current_setting('test.a')::uuid,'w1');raise exception 'Removal records are writable';exception when insufficient_privilege then null;end;
end$$;

-- Compare totals: friend sees A's totals; warm-ups excluded (3 workouts × 60 kg × 10).
do $$declare t record;begin
 select * into t from public.mfd_social_totals(current_setting('test.a')::uuid);
 if t.workouts<>3 or t.volume<>1200 then raise exception 'Friend totals wrong: % workouts, % volume',t.workouts,t.volume;end if;
end$$;

-- A stranger sees no rows, no removals and zero totals.
select set_config('request.jwt.claim.sub',current_setting('test.c'),true);
do $$declare n int;t record;begin
 select count(*) into n from public.mfd_social_removals where owner_id=current_setting('test.a')::uuid;if n<>0 then raise exception 'Stranger read removals';end if;
 select * into t from public.mfd_social_totals(current_setting('test.a')::uuid);if t.workouts<>0 or t.volume<>0 then raise exception 'Stranger read totals';end if;
end$$;

-- A photo change marks its workout as changed.
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
reset role;
select set_config('test.photo_ctid',(select ctid::text from public.mfd_social_workouts where owner_id=current_setting('test.a')::uuid and workout_id='w3'),true);
set local role authenticated;
insert into storage.objects(bucket_id,name) values('mfd-workout-photos',current_setting('test.a')||'/p.jpg');
insert into public.mfd_workout_photos(workout_id,path) values('w3',current_setting('test.a')||'/p.jpg');
reset role;
do $$declare n int;begin
 select count(*) into n from public.mfd_social_workouts w where w.owner_id=current_setting('test.a')::uuid and w.workout_id='w3' and w.ctid::text=current_setting('test.photo_ctid');if n<>0 then raise exception 'Photo did not mark its workout';end if;
end$$;
select 'PASS: only changed workouts rewritten, removals recorded, friend-only change feed, reaction times, photo marks workout, Compare totals respect permissions' as result;
rollback;
