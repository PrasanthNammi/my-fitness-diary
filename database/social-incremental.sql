-- Incremental Friends feed. Safe to re-run; the current app keeps working before and after.
-- 1. The feed copy of a workout is rewritten only when that workout changed (it used to rewrite
--    every workout of the account on each change).
-- 2. Feed workouts and reactions carry a server time of their last change, and removals leave a
--    short-lived record, so the app can download only what changed since its last check.
-- 3. Adding, replacing or removing a workout photo marks that workout as changed.
-- 4. Compare totals come from the server instead of downloading a friend's whole history.

alter table public.mfd_social_workouts add column if not exists updated_at timestamptz not null default now();
create index if not exists mfd_social_updated on public.mfd_social_workouts(updated_at);
alter table public.mfd_reactions add column if not exists created_at timestamptz not null default now();
create index if not exists mfd_reaction_created on public.mfd_reactions(created_at);

create or replace function mfd_private.project_workouts() returns trigger language plpgsql security definer set search_path='' as $$declare s jsonb;clean_sets jsonb;begin
 if tg_op='UPDATE' and new.payload->'sessions' is not distinct from old.payload->'sessions' and exists(select 1 from public.mfd_social_workouts where owner_id=new.user_id) then return new;end if;
 delete from public.mfd_social_workouts w where w.owner_id=new.user_id and not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) e where e->>'id'=w.workout_id);
 for s in select value from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) loop
  if s->>'id' is null or jsonb_typeof(s->'started') is distinct from 'number' then continue;end if;
  select coalesce(jsonb_agg(jsonb_build_object('exercise',e->'exercise','group',e->'group','set',e->'set','type',e->'type','kg',e->'kg','reps',e->'reps','duration_seconds',e->'duration_seconds','distance_meters',e->'distance_meters','rpe',e->'rpe','catalogId',e->'catalogId','tracking',e->'tracking','floors',e->'floors','steps',e->'steps','done',true)),'[]'::jsonb) into clean_sets from jsonb_array_elements(coalesce(s->'sets','[]'::jsonb)) e where e->>'done' is distinct from 'false';
  insert into public.mfd_social_workouts(owner_id,workout_id,started_at,data) values(new.user_id,s->>'id',to_timestamp((s->>'started')::numeric/1000),jsonb_build_object('id',s->'id','name',s->'name','date',s->'date','started',s->'started','finished',s->'finished','sets',clean_sets))
   on conflict(owner_id,workout_id) do update set data=excluded.data,started_at=excluded.started_at,updated_at=now()
   where public.mfd_social_workouts.data is distinct from excluded.data or public.mfd_social_workouts.started_at is distinct from excluded.started_at;
 end loop;return new;end$$;

-- Removal records: what disappeared, readable by the same people who could read the original.
create table if not exists public.mfd_social_removals(
 kind text not null check(kind in('workout','reaction')),
 owner_id uuid not null,
 workout_id text not null,
 user_id uuid,
 removed_at timestamptz not null default now());
create index if not exists mfd_social_removed on public.mfd_social_removals(removed_at);
alter table public.mfd_social_removals enable row level security;
revoke all on public.mfd_social_removals from anon,authenticated;
grant select on public.mfd_social_removals to authenticated;
drop policy if exists social_removals_read on public.mfd_social_removals;
create policy social_removals_read on public.mfd_social_removals for select to authenticated using(owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid())));

create or replace function mfd_private.record_social_removal() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='mfd_social_workouts' then insert into public.mfd_social_removals(kind,owner_id,workout_id) values('workout',old.owner_id,old.workout_id);
 else insert into public.mfd_social_removals(kind,owner_id,workout_id,user_id) values('reaction',old.owner_id,old.workout_id,old.user_id);end if;
 return old;end$$;
drop trigger if exists mfd_social_workout_removed on public.mfd_social_workouts;
create trigger mfd_social_workout_removed after delete on public.mfd_social_workouts for each row execute function mfd_private.record_social_removal();
drop trigger if exists mfd_reaction_removed on public.mfd_reactions;
create trigger mfd_reaction_removed after delete on public.mfd_reactions for each row execute function mfd_private.record_social_removal();

-- A photo change marks its workout as changed, so photos arrive through the same check.
create or replace function mfd_private.touch_social_workout() returns trigger language plpgsql security definer set search_path='' as $$declare r record;begin
 r:=coalesce(new,old);
 update public.mfd_social_workouts set updated_at=now() where owner_id=r.owner_id and workout_id=r.workout_id;
 return null;end$$;
drop trigger if exists mfd_workout_photo_touch on public.mfd_workout_photos;
create trigger mfd_workout_photo_touch after insert or update or delete on public.mfd_workout_photos for each row execute function mfd_private.touch_social_workout();
revoke all on function mfd_private.record_social_removal(),mfd_private.touch_social_workout() from public,anon,authenticated;

-- Removal records are only needed until every phone has caught up; phones away longer reload fully.
select cron.schedule('mfd-social-removals-cleanup','17 3 * * *',$$delete from public.mfd_social_removals where removed_at<now()-interval '30 days'$$);

-- Totals for Compare, computed under the caller's own permissions (friends and self only).
create or replace function public.mfd_social_totals(owner uuid) returns table(workouts bigint,volume numeric) language sql stable security invoker set search_path='' as $$
 select count(*),coalesce(sum((select sum((x->>'kg')::numeric*(x->>'reps')::numeric) from jsonb_array_elements(w.data->'sets') x
   where x->>'type' is distinct from 'warmup' and jsonb_typeof(x->'kg')='number' and jsonb_typeof(x->'reps')='number')),0)
 from public.mfd_social_workouts w where w.owner_id=owner$$;
revoke all on function public.mfd_social_totals(uuid) from public,anon;
grant execute on function public.mfd_social_totals(uuid) to authenticated;
