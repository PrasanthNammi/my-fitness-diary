-- Fix for undo (staging/production): AI entries added before undo existed, or with an
-- unreadable time, are always kept. Replaces only mfd_mcp.undo_entries; safe to re-run.
begin;
create or replace function mfd_mcp.undo_entries(u uuid, conn text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare doc jsonb; field text; kept jsonb; removed integer := 0; edited integer := 0; dropped integer; changed integer; rev bigint;
begin
 select payload into doc from public.forma_workspaces where user_id=u for update;
 if not found then return jsonb_build_object('removed',0,'kept_edited',0); end if;
 foreach field in array array['sessions','routines','meals','weights'] loop
  if jsonb_typeof(doc->field)='array' then
   -- Never null: an entry without addedBy, time or fingerprint (added before undo existed) is always kept.
   with e as (select v, n, coalesce(v->'addedBy'->>'connection'=conn and case when coalesce(v->'addedBy'->>'at','') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$'
       then (v->'addedBy'->>'at')::timestamptz>now()-interval '24 hours' else false end, false) recent from jsonb_array_elements(doc->field) with ordinality t(v,n)),
    f as (select v, n, recent and coalesce(v->'addedBy'->>'fp'=mfd_mcp.fingerprint(field,v), false) drop_it, recent from e)
   select coalesce(jsonb_agg(v order by n) filter (where not drop_it),'[]'), count(*) filter (where drop_it), count(*) filter (where recent and not drop_it)
    into kept, dropped, changed from f;
   if dropped>0 then doc := jsonb_set(doc,array[field],kept); end if;
   removed := removed+dropped; edited := edited+changed;
  end if;
 end loop;
 if removed>0 then
  update public.forma_workspaces set payload=doc, revision=revision+1, updated_at=now() where user_id=u returning revision into rev;
 end if;
 return jsonb_build_object('removed',removed,'kept_edited',edited);
end $$;
revoke all on function mfd_mcp.undo_entries(uuid,text) from public,anon,authenticated;
commit;
