-- Comments on Friends workouts. Run after social-incremental.sql. Safe to re-run; the current app keeps
-- working before and after (it doesn't use comments).
-- Who can read: the workout's owner and the owner's friends (like reactions), minus anyone either side blocked.
-- Who can write: the owner and the owner's friends, as themselves, 1–500 characters.
-- Who can delete: the comment's author, and the workout's owner.
-- Deleting leaves a removal record, so phones download only what changed (same as reactions).

create table if not exists public.mfd_comments(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null,
 workout_id text not null,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 500),
 created_at timestamptz not null default now(),
 foreign key(owner_id,workout_id) references public.mfd_social_workouts(owner_id,workout_id) on delete cascade);
create index if not exists mfd_comment_workout on public.mfd_comments(owner_id,workout_id,created_at);
create index if not exists mfd_comment_created on public.mfd_comments(created_at);
create index if not exists mfd_comment_author on public.mfd_comments(user_id);
alter table public.mfd_comments enable row level security;
revoke all on public.mfd_comments from anon,authenticated;
grant select,delete on public.mfd_comments to authenticated;
grant insert(owner_id,workout_id,body) on public.mfd_comments to authenticated;

drop policy if exists comments_read on public.mfd_comments;
create policy comments_read on public.mfd_comments for select to authenticated using(
 (owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid())))
 and not exists(select 1 from public.mfd_blocks b where (b.owner_id=(select auth.uid()) and b.target_id=mfd_comments.user_id) or (b.owner_id=mfd_comments.user_id and b.target_id=(select auth.uid()))));
drop policy if exists comments_create on public.mfd_comments;
create policy comments_create on public.mfd_comments for insert to authenticated with check(
 user_id=(select auth.uid()) and (owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid()))));
drop policy if exists comments_remove on public.mfd_comments;
create policy comments_remove on public.mfd_comments for delete to authenticated using(user_id=(select auth.uid()) or owner_id=(select auth.uid()));

-- Removal records learn a third kind.
alter table public.mfd_social_removals add column if not exists comment_id uuid;
alter table public.mfd_social_removals drop constraint if exists mfd_social_removals_kind_check;
alter table public.mfd_social_removals add constraint mfd_social_removals_kind_check check(kind in('workout','reaction','comment'));

create or replace function mfd_private.record_social_removal() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='mfd_social_workouts' then insert into public.mfd_social_removals(kind,owner_id,workout_id) values('workout',old.owner_id,old.workout_id);
 elsif tg_table_name='mfd_reactions' then insert into public.mfd_social_removals(kind,owner_id,workout_id,user_id) values('reaction',old.owner_id,old.workout_id,old.user_id);
 else insert into public.mfd_social_removals(kind,owner_id,workout_id,user_id,comment_id) values('comment',old.owner_id,old.workout_id,old.user_id,old.id);end if;
 return old;end$$;
revoke all on function mfd_private.record_social_removal() from public,anon,authenticated;
drop trigger if exists mfd_comment_removed on public.mfd_comments;
create trigger mfd_comment_removed after delete on public.mfd_comments for each row execute function mfd_private.record_social_removal();
