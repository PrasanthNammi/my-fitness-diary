-- Delta sync server behaviour (database/workspace-delta.sql), in a rolled-back transaction.
begin;
select set_config('test.a',gen_random_uuid()::text,true),set_config('test.b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.a')::uuid),(current_setting('test.b')::uuid);
-- Test state lives in transaction-local settings (no temporary objects: the Supabase SQL editor
-- doesn't keep them between statements).
select set_config('test.base',(jsonb_build_object('profile',jsonb_build_object('name','A'),'meals','[]'::jsonb,'weights','[]'::jsonb,'checkins','[]'::jsonb,'chat','[]'::jsonb,'routines','[]'::jsonb,
 'sessions',jsonb_build_array(jsonb_build_object('id','w1','name','Upper','started',1,'sets',jsonb_build_array(jsonb_build_object('id','s1','exercise','Bench','kg',60,'reps',8,'rpe',null,'floors',null,'steps',null,'done',true))),
  jsonb_build_object('id','w2','name','Lower','started',2,'hevyRows',jsonb_build_array(jsonb_build_object('title','Lower','weight_kg','100')),'sets','[]'::jsonb))))::text,true);

-- Insert: stored compact, raw rows moved, revision 1, no change record for the first revision.
insert into public.forma_workspaces(user_id,payload) values(current_setting('test.a')::uuid,current_setting('test.base')::jsonb);
do $$declare p jsonb;n int;begin
 select payload into p from public.forma_workspaces where user_id=current_setting('test.a')::uuid;
 if p->'sessions'->0->'sets'->0 ? 'rpe' or p->'sessions'->0->'sets'->0 ? 'floors' then raise exception 'Null fields not compacted';end if;
 if (p->'sessions'->0->'sets'->0->>'kg')::numeric<>60 then raise exception 'Compaction changed real data';end if;
 if p->'sessions'->1 ? 'hevyRows' then raise exception 'Import rows still in the diary';end if;
 select count(*) into n from public.forma_import_rows where user_id=current_setting('test.a')::uuid and session_id='w2' and rows->0->>'weight_kg'='100';if n<>1 then raise exception 'Import rows not stored';end if;
 select count(*) into n from public.forma_workspace_changes where user_id=current_setting('test.a')::uuid;if n<>0 then raise exception 'First revision should not log';end if;
end$$;

-- A connector-style write (jsonb_set + revision+1) and a writer that forgets the revision both log.
select set_config('test.snap',(select payload::text from public.forma_workspaces where user_id=current_setting('test.a')::uuid),true);
update public.forma_workspaces set payload=jsonb_set(payload,'{meals}',payload->'meals'||jsonb_build_array(jsonb_build_object('id','m1','name','Oats','kcal',300))),revision=revision+1 where user_id=current_setting('test.a')::uuid;
update public.forma_workspaces set payload=jsonb_set(payload,'{profile,name}','"Renamed"') where user_id=current_setting('test.a')::uuid;
do $$declare r bigint;p jsonb;n int;rebuilt jsonb;begin
 select revision,payload into r,p from public.forma_workspaces where user_id=current_setting('test.a')::uuid;
 if r<>3 then raise exception 'Revision not raised for a writer that forgot (got %)',r;end if;
 select count(*) into n from public.forma_workspace_changes where user_id=current_setting('test.a')::uuid and revision in(2,3);if n<>2 then raise exception 'Missing change records';end if;
 rebuilt:=current_setting('test.snap')::jsonb;
 for n in 2..3 loop select mfd_private.workspace_apply(rebuilt,ops) into rebuilt from public.forma_workspace_changes where user_id=current_setting('test.a')::uuid and revision=n;end loop;
 if rebuilt<>p then raise exception 'Change records do not rebuild the diary';end if;
end$$;

-- The owner's phone: pull, patch, conflicts, validation.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
do $$declare j jsonb;r record;n int;begin
 j:=public.forma_workspace_pull(3);if j<>'{"revision":3}'::jsonb then raise exception 'Up to date should return only the revision: %',j;end if;
 j:=public.forma_workspace_pull(1);if jsonb_array_length(j->'changes')<>2 or j ? 'full' then raise exception 'Pull should return 2 changes: %',j;end if;
 j:=public.forma_workspace_pull(0);if j->>'full'<>'true' then raise exception 'Revision 0 needs a full copy';end if;
 j:=public.forma_workspace_pull(99);if j->>'full'<>'true' then raise exception 'Future revision needs a full copy';end if;
 j:=public.forma_workspace_pull(null);if j->>'full'<>'true' then raise exception 'Unknown revision needs a full copy';end if;

 -- Patch: one meal added; only the change travels.
 select * into r from public.forma_save_workspace_patch('[{"k":"meals","i":"m2","v":{"id":"m2","name":"Rice","kcal":400}}]',3);
 if r.conflict or r.saved_revision<>4 or r.adjusted then raise exception 'Patch save failed: %',row_to_json(r);end if;
 -- Stale revision: conflict, nothing written.
 select * into r from public.forma_save_workspace_patch('[{"k":"meals","i":"m3","v":{"id":"m3"}}]',3);
 if not r.conflict or r.saved_revision is not null then raise exception 'Stale patch not refused';end if;
 select count(*) into n from public.forma_workspaces where payload->'meals' @> '[{"id":"m3"}]';if n<>0 then raise exception 'Conflicting patch was written';end if;
 -- Invalid change: refused with 22023, nothing written.
 begin perform public.forma_save_workspace_patch('[{"k":"meals","i":"missing","d":true}]',4);raise exception 'Invalid change accepted';exception when sqlstate '22023' then null;end;
 -- A change that would break the diary's shape is refused.
 begin perform public.forma_save_workspace_patch('[{"k":"sessions","d":true}]',4);raise exception 'Broken diary accepted';exception when sqlstate '22023' then null;end;
 select revision into n from public.forma_workspaces;if n<>4 then raise exception 'Refused patches changed the revision';end if;
 -- A non-compact patch is stored compact and reported as adjusted (the phone then refreshes in full).
 select * into r from public.forma_save_workspace_patch('[{"k":"sessions","i":"w1","v":{"id":"w1","name":"Upper","started":1,"sets":[{"id":"s1","exercise":"Bench","kg":62.5,"reps":8,"rpe":null}]}}]',4);
 if not r.adjusted or r.saved_revision<>5 then raise exception 'Adjusted flag missing: %',row_to_json(r);end if;
 -- Import rows: own rows only, readable by the owner.
 perform public.forma_put_import_rows('{"w9":[{"title":"Push"}]}');
 select count(*) into n from public.forma_import_rows where session_id in('w2','w9');if n<>2 then raise exception 'Owner cannot read own import rows';end if;
 -- Rows survive when the workout is later saved without them (they are never deleted by saves).
 perform public.forma_save_workspace_patch('[{"k":"sessions","i":"w2","d":true}]',5);
 select count(*) into n from public.forma_import_rows where session_id='w2';if n<>1 then raise exception 'Import rows deleted with the workout';end if;
end$$;

-- Another account sees none of it, and can't write it.
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
do $$declare n int;j jsonb;begin
 select count(*) into n from public.forma_workspace_changes;if n<>0 then raise exception 'Other account read change records';end if;
 select count(*) into n from public.forma_import_rows;if n<>0 then raise exception 'Other account read import rows';end if;
 j:=public.forma_workspace_pull(1);if j->>'full'<>'true' or (j->>'revision')::int<>0 then raise exception 'Other account pulled someone else: %',j;end if;
 begin insert into public.forma_workspace_changes(user_id,revision,ops) values(current_setting('test.a')::uuid,99,'[]');raise exception 'Change records writable';exception when insufficient_privilege then null;end;
 begin insert into public.forma_import_rows(user_id,session_id,rows) values(current_setting('test.a')::uuid,'x','[]');raise exception 'Import rows writable';exception when insufficient_privilege then null;end;
end$$;

-- History gaps: a missing change record forces a full copy.
reset role;
delete from public.forma_workspace_changes where user_id=current_setting('test.a')::uuid and revision=4;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
do $$declare j jsonb;begin j:=public.forma_workspace_pull(2);if j->>'full'<>'true' then raise exception 'Gap not detected: %',j;end if;
 j:=public.forma_workspace_pull(4);if jsonb_array_length(j->'changes')<>2 then raise exception 'History after the gap should still work: %',j;end if;end$$;

-- The Friends feed copy keeps working with compact diaries.
reset role;
do $$declare n int;begin select count(*) into n from public.mfd_social_workouts where owner_id=current_setting('test.a')::uuid and workout_id='w1' and data->'sets'->0->>'kg'='62.5';if n<>1 then raise exception 'Feed copy not updated';end if;end$$;
select 'PASS: compact storage, import rows moved and kept, revision always raised, change records rebuild the diary, pull up-to-date/changes/full/gaps, patch CAS/validation/adjusted, owner-only access, feed copy intact' as result;
rollback;
