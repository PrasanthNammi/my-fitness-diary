-- MFD 3.0 step 4: the AI connector's read tools can read the diary from the new tables.
--
-- Each read tool loads the person's diary once (the old JSON document) and works from it. This file puts a switch in
-- front of those three loads (the dispatcher's read operations, recovery, and the folder names on routines):
--   * people in diary.read_from_tables get their diary rebuilt from the tables (diary.as_envelope, 12-read.sql);
--   * everyone else gets the stored document, exactly as before.
-- Nobody is switched on by this file, so after running it the connector answers exactly as it does today.
-- Writes (logging meals, workouts, settings…) are not touched; they move in a later step.
--
-- The three loads are changed in place: each function's installed text is read, the one line is replaced, and the
-- function is recreated. If a line isn't found exactly once, nothing is applied (the whole file is one transaction).
-- Run after database/diary/12-read.sql and the connector files. Safe to re-run.
begin;

-- Who reads from the tables (switched on per person; empty = everyone reads the stored document).
create table if not exists diary.read_from_tables (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table diary.read_from_tables enable row level security;
revoke all on diary.read_from_tables from public, anon, authenticated;

-- The diary a read tool works from: rebuilt from the tables when switched on, otherwise the stored document.
-- Only ever for the signed-in person.
create or replace function mfd_mcp.read_doc(u uuid, stored jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if u is distinct from auth.uid() then raise exception 'Not allowed' using errcode = '42501'; end if;
  if exists (select 1 from diary.read_from_tables r where r.user_id = u) then return diary.as_envelope(u); end if;
  return stored;
end $$;
revoke all on function mfd_mcp.read_doc(uuid, jsonb) from public, anon, authenticated;

do $patch$
declare fn regprocedure; old text; new text; def text; n int;
begin
  for fn, old, new in select * from (values
    ('mfd_mcp.dispatch(text,jsonb)'::regprocedure,
     'select payload,revision into doc,rev from public.forma_workspaces where user_id=u;',
     'select mfd_mcp.read_doc(u,payload),revision into doc,rev from public.forma_workspaces where user_id=u;'),
    ('mfd_mcp.recovery(jsonb)'::regprocedure,
     'select payload,revision into doc,rev from public.forma_workspaces where user_id=u;',
     'select mfd_mcp.read_doc(u,payload),revision into doc,rev from public.forma_workspaces where user_id=u;'),
    ('mfd_mcp.routines_out(jsonb)'::regprocedure,
     'select case when jsonb_typeof(payload->''folders'')=''array'' then payload->''folders'' else ''[]'' end into folders from public.forma_workspaces where user_id=auth.uid();',
     'select case when jsonb_typeof(d->''folders'')=''array'' then d->''folders'' else ''[]'' end into folders from (select mfd_mcp.read_doc(user_id,payload) d from public.forma_workspaces where user_id=auth.uid()) w;')
  ) v(fn, old, new) loop
    def := pg_get_functiondef(fn);
    if position(new in def) > 0 then continue; end if;          -- already switched (re-run)
    n := (length(def) - length(replace(def, old, ''))) / length(old);
    if n <> 1 then raise exception '% : expected the diary load once, found it % times; nothing was changed', fn, n; end if;
    execute replace(def, old, new);
  end loop;
end $patch$;

commit;
