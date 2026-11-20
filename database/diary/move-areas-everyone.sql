-- Database move: food, body and settings out of the stored diary document and into the tables, for everyone whose
-- training is already in the tables. Run after update 6 (database/diary/07, 09, 11, 12, 14, 15).
-- Paste all of it into the Supabase SQL editor (project Forma) and press Run. All or nothing; safe to run again.
-- Per person: diary.move_areas refills the rows from the document, checks they come back exactly, keeps a safety
-- copy (diary.moved_payloads, what = 'areas') and only then takes the parts out of the document. Here, each whole
-- diary is also compared before and after: if any differs at all, everything is undone.
-- Undo for one person: select diary.move_back('<user id>');  (puts training, food, body and settings back)
begin;
do $move$
declare r record; before jsonb; after jsonb; bad text := '';
begin
  for r in select p.user_id from diary.table_people p where not p.areas order by p.user_id loop
    select diary.full_payload(user_id, payload) into before from public.forma_workspaces where user_id = r.user_id;
    perform diary.move_areas(r.user_id);
    select diary.full_payload(user_id, payload) into after from public.forma_workspaces where user_id = r.user_id;
    if after is distinct from before then bad := bad || left(r.user_id::text, 8) || ' '; end if;
  end loop;
  if bad <> '' then raise exception 'Not identical, nothing was changed: %', bad; end if;
end $move$;
select (select count(*) from diary.table_people) as switched_people,
       (select count(*) from diary.table_people where areas) as food_body_settings_moved,
       (select count(*) from public.forma_workspaces f where f.payload ?| diary.table_keys()) as documents_still_holding_moved_parts,
       (select count(*) from diary.moved_payloads where what = 'areas') as safety_copies,
       (select count(*) from diary.fill_problems) as problems_left;
commit;
