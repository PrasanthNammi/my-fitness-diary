-- AI routines with the same name in different folders (2026-11-23).
--
-- The app lets two folders each have an "Upper 1". The AI tools that act on an existing routine by name (edit_routine,
-- suggest_workout_targets, start_workout, move_routine) took the first one with that name, so asking for the
-- "Upper 1" in the second folder changed the one in the first. Now:
--   * they take an optional in_folder (the folder the routine is in, as get_routines shows it);
--   * when the name is in more than one folder and no in_folder is given, nothing is changed and the answer lists
--     the folders, so the assistant asks the user instead of guessing;
--   * a name that is in one place only works exactly as before.
-- The four lookups are changed in place (each line must be found exactly once, else nothing is applied), as in
-- 15-tables-switch.sql. Apply after mcp-ai-logging.sql, mcp-suggest-targets.sql, mcp-start-workout.sql and
-- mcp-routine-edit.sql. Safe to re-run.
begin;

-- The routine called `name` (any case), in folder `in_folder` when given: {"r": routine, "pos": its place} or null.
create or replace function mfd_mcp.find_routine(doc jsonb, name text, in_folder text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare nm text := lower(btrim(coalesce(name, ''))); fd text := nullif(btrim(coalesce(in_folder, '')), '');
  routines jsonb := case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end;
  folders jsonb := case when jsonb_typeof(doc->'folders') = 'array' then doc->'folders' else '[]' end;
  hits jsonb; fids jsonb;
begin
  if length(fd) > 80 then raise exception 'in_folder: a folder name from get_routines' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('r', e, 'pos', x.n - 1) order by x.n), '[]') into hits
    from jsonb_array_elements(routines) with ordinality x(e, n) where jsonb_typeof(e) = 'object' and lower(btrim(e->>'name')) = nm;
  if fd is not null then
    select coalesce(jsonb_agg(f->'id'), '[]') into fids from jsonb_array_elements(folders) f where lower(btrim(f->>'name')) = lower(fd);
    if fids = '[]'::jsonb then raise exception 'No folder called "%"; use a folder name from get_routines', fd using errcode = '22023'; end if;
    select coalesce(jsonb_agg(h order by (h->>'pos')::int), '[]') into hits from jsonb_array_elements(hits) h where fids @> jsonb_build_array(h->'r'->'folderId');
    if hits = '[]'::jsonb then raise exception 'No routine called "%" in folder "%"; use the names from get_routines', btrim(name), fd using errcode = '22023'; end if;
  elsif jsonb_array_length(hits) > 1 then
    raise exception 'There are % routines called "%" (%). Send in_folder with the folder name from get_routines, or ask the user which one.',
      jsonb_array_length(hits), btrim(name),
      (select string_agg(coalesce('in folder "' || (select f->>'name' from jsonb_array_elements(folders) f where f->'id' = h->'r'->'folderId' limit 1) || '"', 'not in a folder'), ', ' order by (h->>'pos')::int)
         from jsonb_array_elements(hits) h) using errcode = '22023';
  end if;
  return hits->0;
end $$;
revoke all on function mfd_mcp.find_routine(jsonb, text, text) from public, anon, authenticated;

do $patch$
declare fname text; fn regprocedure; old text; new text; def text; n int;
begin
  for fname, old, new in select * from (values
    ('mfd_mcp.edit_routine(jsonb)',
     $a$select e, n::int-1 into routine, pos from jsonb_array_elements(doc->'routines') with ordinality x(e,n) where lower(btrim(e->>'name'))=lower(nm) order by n limit 1;$a$,
     $a$select h->'r', (h->>'pos')::int into routine, pos from (select mfd_mcp.find_routine(doc, nm, args->>'in_folder') h) z;$a$),
    ('mfd_mcp.move_routine(jsonb)',
     $a$select e into routine from jsonb_array_elements(doc->'routines') e where lower(btrim(e->>'name'))=lower(btrim(args->>'routine')) limit 1;$a$,
     $a$routine := mfd_mcp.find_routine(doc, args->>'routine', args->>'in_folder')->'r';$a$),
    ('mfd_mcp.suggest(jsonb)',
     $a$select r into routine from jsonb_array_elements(doc->'routines') r where lower(btrim(r->>'name'))=lower(btrim(args->>'routine')) limit 1;$a$,
     $a$routine := mfd_mcp.find_routine(doc, args->>'routine', args->>'in_folder')->'r';$a$),
    ('mfd_mcp.start_workout(jsonb)',
     $a$select r into routine from jsonb_array_elements(doc->'routines') r where lower(btrim(r->>'name'))=lower(btrim(args->>'routine')) limit 1;$a$,
     $a$routine := mfd_mcp.find_routine(doc, args->>'routine', args->>'in_folder')->'r';$a$)
  ) v(fn, old, new) loop
    fn := to_regprocedure(fname);
    if fn is null then raise exception '% is missing; nothing was changed', fname; end if;
    def := pg_get_functiondef(fn);
    if position(new in def) > 0 then continue; end if;          -- already changed (re-run)
    n := (length(def) - length(replace(def, old, ''))) / length(old);
    if n <> 1 then raise exception '% : expected the line once, found it % times; nothing was changed', fname, n; end if;
    execute replace(def, old, new);
  end loop;
end $patch$;
commit;
