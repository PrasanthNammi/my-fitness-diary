-- Foods remain shared; custom exercises are creator-only, including archived rows.
alter policy catalogue_read on public.mfd_catalogue to authenticated
 using (kind='food' or creator_id=(select auth.uid()));

-- Keep shared workout snapshots consistent with the new tracking fields.
create or replace function mfd_private.project_workouts() returns trigger language plpgsql security definer set search_path='' as $$declare s jsonb;clean_sets jsonb;begin
 if tg_op='UPDATE' and new.payload->'sessions' is not distinct from old.payload->'sessions' and exists(select 1 from public.mfd_social_workouts where owner_id=new.user_id) then return new;end if;
 delete from public.mfd_social_workouts w where w.owner_id=new.user_id and not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) e where e->>'id'=w.workout_id);
 for s in select value from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) loop
  if s->>'id' is null or jsonb_typeof(s->'started') is distinct from 'number' then continue;end if;
  select coalesce(jsonb_agg(jsonb_build_object('exercise',e->'exercise','group',e->'group','set',e->'set','type',e->'type','kg',e->'kg','reps',e->'reps','duration_seconds',e->'duration_seconds','distance_meters',e->'distance_meters','rpe',e->'rpe','catalogId',e->'catalogId','tracking',e->'tracking','floors',e->'floors','steps',e->'steps','done',true)),'[]'::jsonb) into clean_sets from jsonb_array_elements(coalesce(s->'sets','[]'::jsonb)) e where e->>'done' is distinct from 'false';
  insert into public.mfd_social_workouts(owner_id,workout_id,started_at,data) values(new.user_id,s->>'id',to_timestamp((s->>'started')::numeric/1000),jsonb_build_object('id',s->'id','name',s->'name','date',s->'date','started',s->'started','finished',s->'finished','sets',clean_sets)) on conflict(owner_id,workout_id) do update set data=excluded.data,started_at=excluded.started_at;
 end loop;return new;end$$;
