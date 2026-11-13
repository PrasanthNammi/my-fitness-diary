-- Phone notifications for friend requests (MFD 2.0), alongside likes, comments and messages (social-push.sql):
-- "Riya sent you a friend request" to the recipient when a request is made, and "Riya accepted your friend request"
-- to the sender when it is accepted. Same signed request to the connector (/push/social), same rules: sent in the
-- background, never blocks or undoes the request, nothing for own actions. Only names are sent.
--
-- Apply after social-push.sql. Safe to re-run.
begin;

create or replace function mfd_private.social_push_friendship() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' and new.status='pending' then
  perform mfd_private.social_push('request', new.recipient, new.sender, '{}'::jsonb);
 elsif tg_op='UPDATE' and old.status='pending' and new.status='accepted' then
  perform mfd_private.social_push('accepted', new.sender, new.recipient, '{}'::jsonb);
 end if;
 return null;
end $$;
revoke all on function mfd_private.social_push_friendship() from public, anon, authenticated;

drop trigger if exists mfd_social_push on public.mfd_friendships;
create trigger mfd_social_push after insert or update of status on public.mfd_friendships for each row execute function mfd_private.social_push_friendship();
commit;
