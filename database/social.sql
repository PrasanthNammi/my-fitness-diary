create schema if not exists mfd_private;
create table public.mfd_profiles(user_id uuid primary key default auth.uid() references auth.users(id),username text not null unique check(username ~ '^[a-z0-9._]{3,24}$'),display_name text not null check(char_length(display_name) between 1 and 80),avatar_path text check(avatar_path is null or split_part(avatar_path,'/',1)=user_id::text));
create table public.mfd_friendships(id uuid primary key default gen_random_uuid(),sender uuid not null default auth.uid() references auth.users(id),recipient uuid not null references auth.users(id),status text not null default 'pending' check(status in('pending','accepted')),accepted_at timestamptz,created_at timestamptz not null default now(),check(sender<>recipient));
create unique index mfd_friend_pair on public.mfd_friendships(least(sender,recipient),greatest(sender,recipient));
create index mfd_friend_recipient on public.mfd_friendships(recipient);
create index mfd_friend_sender on public.mfd_friendships(sender);
create table public.mfd_blocks(owner_id uuid not null default auth.uid() references auth.users(id),target_id uuid not null references auth.users(id),primary key(owner_id,target_id),check(owner_id<>target_id));
create index mfd_block_target on public.mfd_blocks(target_id);
alter table public.mfd_profiles enable row level security;alter table public.mfd_friendships enable row level security;alter table public.mfd_blocks enable row level security;
revoke all on public.mfd_profiles,public.mfd_friendships,public.mfd_blocks from anon,authenticated;
grant select on public.mfd_profiles,public.mfd_friendships,public.mfd_blocks to authenticated;
grant insert(username,display_name,avatar_path),update(username,display_name,avatar_path) on public.mfd_profiles to authenticated;
grant insert(recipient),update(status),delete on public.mfd_friendships to authenticated;
grant insert(target_id),delete on public.mfd_blocks to authenticated;
create policy profiles_read on public.mfd_profiles for select to authenticated using(true);
create policy profiles_create on public.mfd_profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy profiles_update on public.mfd_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy blocks_read on public.mfd_blocks for select to authenticated using((select auth.uid()) in(owner_id,target_id));
create policy blocks_create on public.mfd_blocks for insert to authenticated with check(owner_id=(select auth.uid()));
create policy blocks_remove on public.mfd_blocks for delete to authenticated using(owner_id=(select auth.uid()));
create policy friends_read on public.mfd_friendships for select to authenticated using((select auth.uid()) in(sender,recipient));
create policy friends_request on public.mfd_friendships for insert to authenticated with check(sender=(select auth.uid()) and status='pending' and accepted_at is null and not exists(select 1 from public.mfd_blocks b where (b.owner_id=sender and b.target_id=recipient) or(b.owner_id=recipient and b.target_id=sender)));
create policy friends_accept on public.mfd_friendships for update to authenticated using(recipient=(select auth.uid()) and status='pending') with check(recipient=(select auth.uid()) and status='accepted' and not exists(select 1 from public.mfd_blocks b where (b.owner_id=sender and b.target_id=recipient) or(b.owner_id=recipient and b.target_id=sender)));
create policy friends_remove on public.mfd_friendships for delete to authenticated using((select auth.uid()) in(sender,recipient));
create function public.mfd_are_friends(a uuid,b uuid) returns boolean language sql stable security invoker set search_path='' as $$select auth.uid() in(a,b) and exists(select 1 from public.mfd_friendships f where f.status='accepted' and ((f.sender=a and f.recipient=b) or(f.sender=b and f.recipient=a))) and not exists(select 1 from public.mfd_blocks k where(k.owner_id=a and k.target_id=b) or(k.owner_id=b and k.target_id=a))$$;
revoke all on function public.mfd_are_friends(uuid,uuid) from public,anon;grant execute on function public.mfd_are_friends(uuid,uuid) to authenticated;
create function mfd_private.friend_accepted() returns trigger language plpgsql security invoker set search_path='' as $$begin new.accepted_at=clock_timestamp();return new;end$$;
create trigger mfd_friend_accepted before update on public.mfd_friendships for each row execute function mfd_private.friend_accepted();
create table public.mfd_social_workouts(owner_id uuid not null references auth.users(id),workout_id text not null,data jsonb not null,started_at timestamptz not null,primary key(owner_id,workout_id));
create index mfd_social_started on public.mfd_social_workouts(started_at desc);
alter table public.mfd_social_workouts enable row level security;revoke all on public.mfd_social_workouts from anon,authenticated;grant select on public.mfd_social_workouts to authenticated;
create policy social_workout_read on public.mfd_social_workouts for select to authenticated using(owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid())));
-- Trusted trigger projection: never publishes meals, body data, raw imports or notes.
create function mfd_private.project_workouts() returns trigger language plpgsql security definer set search_path='' as $$declare s jsonb;clean_sets jsonb;begin
 if tg_op='UPDATE' and new.payload->'sessions' is not distinct from old.payload->'sessions' and exists(select 1 from public.mfd_social_workouts where owner_id=new.user_id) then return new;end if;
 delete from public.mfd_social_workouts w where w.owner_id=new.user_id and not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) e where e->>'id'=w.workout_id);
 for s in select value from jsonb_array_elements(coalesce(new.payload->'sessions','[]'::jsonb)) loop
  if s->>'id' is null or jsonb_typeof(s->'started') is distinct from 'number' then continue;end if;
  select coalesce(jsonb_agg(jsonb_build_object('exercise',e->'exercise','group',e->'group','set',e->'set','type',e->'type','kg',e->'kg','reps',e->'reps','duration_seconds',e->'duration_seconds','distance_meters',e->'distance_meters','rpe',e->'rpe','done',true)),'[]'::jsonb) into clean_sets from jsonb_array_elements(coalesce(s->'sets','[]'::jsonb)) e where e->>'done' is distinct from 'false';
  insert into public.mfd_social_workouts(owner_id,workout_id,started_at,data) values(new.user_id,s->>'id',to_timestamp((s->>'started')::numeric/1000),jsonb_build_object('id',s->'id','name',s->'name','date',s->'date','started',s->'started','finished',s->'finished','sets',clean_sets)) on conflict(owner_id,workout_id) do update set data=excluded.data,started_at=excluded.started_at;
 end loop;return new;end$$;
revoke all on function mfd_private.project_workouts(),mfd_private.friend_accepted() from public,anon,authenticated;
create trigger mfd_project_workouts after insert or update on public.forma_workspaces for each row execute function mfd_private.project_workouts();
-- Backfill safely through the same projection, with no change to private payloads.
update public.forma_workspaces set payload=payload;
create table public.mfd_messages(id uuid primary key default gen_random_uuid(),sender uuid not null default auth.uid() references auth.users(id),recipient uuid not null references auth.users(id),body text not null check(char_length(btrim(body)) between 1 and 2000),sent_at timestamptz not null default now(),read_at timestamptz,expires_at timestamptz not null default(now()+interval '24 hours'));
create index mfd_message_recipient on public.mfd_messages(recipient,sent_at);create index mfd_message_sender on public.mfd_messages(sender,sent_at);create index mfd_message_expiry on public.mfd_messages(expires_at);
alter table public.mfd_messages enable row level security;revoke all on public.mfd_messages from anon,authenticated;grant select on public.mfd_messages to authenticated;grant insert(recipient,body),update(read_at) on public.mfd_messages to authenticated;
create policy messages_read on public.mfd_messages for select to authenticated using((select auth.uid()) in(sender,recipient) and expires_at>now() and public.mfd_are_friends(sender,recipient));
create policy messages_send on public.mfd_messages for insert to authenticated with check(sender=(select auth.uid()) and public.mfd_are_friends(sender,recipient));
create policy messages_mark_read on public.mfd_messages for update to authenticated using(recipient=(select auth.uid()) and expires_at>now() and public.mfd_are_friends(sender,recipient)) with check(recipient=(select auth.uid()) and public.mfd_are_friends(sender,recipient));
create function mfd_private.message_read() returns trigger language plpgsql security invoker set search_path='' as $$begin if old.read_at is null then new.read_at=clock_timestamp();new.expires_at=least(old.expires_at,new.read_at+interval '5 minutes');else new.read_at=old.read_at;new.expires_at=old.expires_at;end if;return new;end$$;
revoke all on function mfd_private.message_read() from public,anon,authenticated;
create trigger mfd_message_read before update on public.mfd_messages for each row execute function mfd_private.message_read();
create extension if not exists pg_cron;
select cron.schedule('mfd-expire-messages','* * * * *',$$delete from public.mfd_messages where expires_at<=now()$$);
create table public.mfd_reactions(user_id uuid not null default auth.uid() references auth.users(id),owner_id uuid not null,workout_id text not null,primary key(user_id,owner_id,workout_id),foreign key(owner_id,workout_id) references public.mfd_social_workouts(owner_id,workout_id) on delete cascade);
create index mfd_reaction_workout on public.mfd_reactions(owner_id,workout_id);
alter table public.mfd_reactions enable row level security;revoke all on public.mfd_reactions from anon,authenticated;grant select,delete on public.mfd_reactions to authenticated;grant insert(owner_id,workout_id) on public.mfd_reactions to authenticated;
create policy reactions_read on public.mfd_reactions for select to authenticated using(owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid())));
create policy reactions_create on public.mfd_reactions for insert to authenticated with check(user_id=(select auth.uid()) and (owner_id=(select auth.uid()) or public.mfd_are_friends(owner_id,(select auth.uid()))));
create policy reactions_remove on public.mfd_reactions for delete to authenticated using(user_id=(select auth.uid()));

-- Profile cutoff for newly shared feed items (applied separately during migration).
alter table public.mfd_profiles add column if not exists created_at timestamptz not null default now();
