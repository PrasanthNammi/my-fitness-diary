-- Delete my account (Settings → Account → Delete account): the signed-in person removes their MFD account and
-- everything in it, in one step (all or nothing). GDPR Art. 17; docs/PRIVACY.md.
--
-- Removed: the account; the diary (old document and every diary table, including Cycle & Health), AI connections and
-- their pending changes; the social profile, friendships (both directions), messages (both directions), likes and
-- comments they made or received, shared workouts and workout photos, blocks (both directions), catalogue reports and
-- catalogue photos; any rows for them in the old in-database safety copies. Photo FILES are deleted by the app first
-- (storage lets each person remove their own; direct deletes in SQL are blocked by Supabase).
-- Kept, without a name: foods and exercises they added to the SHARED catalogue (others may use them); who added them
-- is erased (creator_id becomes null).
--
-- Safe to re-run. Apply after social*.sql, shared-catalogue.sql, catalogue-photos.sql and the diary files.
begin;

alter table public.mfd_catalogue alter column creator_id drop not null;

create or replace function public.mfd_delete_account(confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t text; col text;
begin
  if u is null or coalesce(auth.jwt()->>'role', '') <> 'authenticated' then raise exception 'Sign in first' using errcode = '42501'; end if;
  if confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm' using errcode = '22023'; end if;

  -- Social: everything they did or received, both directions.
  delete from public.mfd_reactions where user_id = u or owner_id = u;
  delete from public.mfd_comments where user_id = u or owner_id = u;
  delete from public.mfd_workout_photos where owner_id = u;
  delete from public.mfd_social_workouts where owner_id = u;
  delete from public.mfd_messages where sender = u or recipient = u;
  delete from public.mfd_friendships where sender = u or recipient = u;
  delete from public.mfd_blocks where owner_id = u or target_id = u;
  delete from public.mfd_profiles where user_id = u;
  -- (removing workouts and likes logs "removals" for friends' feeds: cleared last)
  delete from public.mfd_social_removals r where r.owner_id = u or (to_jsonb(r) ->> 'user_id')::uuid = u;
  -- Shared catalogue: their reports and photos go; what they added stays for others, without their name.
  delete from public.mfd_catalogue_reports where reporter_id = u;
  delete from public.mfd_catalogue_photos where owner_id = u;
  update public.mfd_catalogue set creator_id = null where creator_id = u;
  -- AI connector leftovers without a link to the account.
  delete from mfd_mcp.pending_changes where user_id = u;
  -- Old in-database safety copies, if any are still there.
  for t, col in select n.nspname || '.' || c.relname, a.attname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid and a.attname in ('user_id', 'owner_id', 'sender', 'recipient') and not a.attisdropped
           where n.nspname = 'mfd_private' and c.relkind = 'r' and (c.relname like 'backup\_%' or c.relname = 'workspaces_before_compaction') loop
    execute format('delete from %s where %I = $1', t, col) using u;
  end loop;
  -- The account; the diary, diary tables, AI grants and the rest follow (on delete cascade).
  delete from auth.users where id = u;
  return jsonb_build_object('deleted', true);
end $$;
revoke all on function public.mfd_delete_account(text) from public, anon;
grant execute on function public.mfd_delete_account(text) to authenticated;

commit;
