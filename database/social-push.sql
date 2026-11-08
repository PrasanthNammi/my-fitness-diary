-- Phone notifications for friends (MFD 1.1): a like, a comment, or a chat message tells the recipient's phones.
-- After the row is saved, a trigger queues a small signed request to the MFD connector (/push/social), which
-- checks the recipient's notification settings and sends it. pg_net sends in the background: a slow or failing
-- notification never blocks or undoes the like, comment or message. Own actions on own workouts send nothing.
--
-- What is sent: who did it (display name, username for chats), the workout title, a like/unread count and, for a
-- comment, its first 160 characters. Chat message text is never sent.
--
-- Setup (once per project, by the owner): this file, then the one-off setup that stores the connector address and
-- the shared secret (Vault secret "mfd_social_hook"). Until both exist, the triggers do nothing. Safe to re-run.
do $$ begin
 if exists (select 1 from pg_available_extensions where name='pg_net') then create extension if not exists pg_net; end if;
end $$;

create table if not exists mfd_private.social_push_hook(id boolean primary key default true check(id), url text not null check(url ~ '^https://'));
alter table mfd_private.social_push_hook enable row level security;
revoke all on mfd_private.social_push_hook from public, anon, authenticated;

create or replace function mfd_private.social_push(kind text, recipient uuid, actor uuid, payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare hook text; secret text; who record;
begin
 if recipient is null or actor is null or recipient=actor then return; end if;
 select url into hook from mfd_private.social_push_hook where id;
 if hook is null or to_regclass('vault.decrypted_secrets') is null or to_regproc('net.http_post') is null then return; end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into secret using 'mfd_social_hook';
 if secret is null or length(secret)<32 then return; end if;
 select display_name, username into who from public.mfd_profiles where user_id=actor;
 if not found then return; end if;
 execute 'select net.http_post(url:=$1, body:=$2, headers:=$3, timeout_milliseconds:=5000)'
  using hook, jsonb_build_object('kind',kind,'recipient',recipient,'actor',actor,'actor_name',left(who.display_name,80),'actor_username',who.username)||payload,
   jsonb_build_object('Content-Type','application/json','X-MFD-Hook',secret);
exception when others then
 -- A notification is never worth losing the like, comment or message for.
 raise warning 'social push skipped: %', sqlstate;
end $$;
revoke all on function mfd_private.social_push(text,uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function mfd_private.social_push_reaction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform mfd_private.social_push('like', new.owner_id, new.user_id, jsonb_build_object('owner',new.owner_id,'workout',new.workout_id,
  'title',coalesce((select left(data->>'name',80) from public.mfd_social_workouts where owner_id=new.owner_id and workout_id=new.workout_id),'your workout'),
  'count',(select count(*) from public.mfd_reactions where owner_id=new.owner_id and workout_id=new.workout_id)));
 return null;
end $$;
create or replace function mfd_private.social_push_comment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform mfd_private.social_push('comment', new.owner_id, new.user_id, jsonb_build_object('owner',new.owner_id,'workout',new.workout_id,
  'title',coalesce((select left(data->>'name',80) from public.mfd_social_workouts where owner_id=new.owner_id and workout_id=new.workout_id),'your workout'),
  'text',left(btrim(new.body),160)));
 return null;
end $$;
create or replace function mfd_private.social_push_message() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform mfd_private.social_push('message', new.recipient, new.sender, jsonb_build_object(
  'count',(select count(*) from public.mfd_messages where recipient=new.recipient and sender=new.sender and read_at is null)));
 return null;
end $$;
revoke all on function mfd_private.social_push_reaction() from public, anon, authenticated;
revoke all on function mfd_private.social_push_comment() from public, anon, authenticated;
revoke all on function mfd_private.social_push_message() from public, anon, authenticated;

drop trigger if exists mfd_social_push on public.mfd_reactions;
create trigger mfd_social_push after insert on public.mfd_reactions for each row execute function mfd_private.social_push_reaction();
drop trigger if exists mfd_social_push on public.mfd_comments;
create trigger mfd_social_push after insert on public.mfd_comments for each row execute function mfd_private.social_push_comment();
drop trigger if exists mfd_social_push on public.mfd_messages;
create trigger mfd_social_push after insert on public.mfd_messages for each row execute function mfd_private.social_push_message();
