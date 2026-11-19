-- Database move, step 2b (wiring): per person, training lives in the tables instead of the stored diary document.
--
-- For a person in diary.table_people:
--   * the stored document (public.forma_workspaces.payload) keeps everything except training, plus "$training" (which
--     training lists the diary has); diary.workspace_doc(u, payload) is the whole diary as the app knows it;
--   * the app saves with public.forma_save_changes(ops, expected_revision): training operations go straight to the
--     tables (diary.apply_training_ops), the rest to the document, in one transaction, same answers as before;
--   * the app downloads in full with public.forma_workspace_full(); downloads of changes (forma_workspace_pull) get
--     the training operations too, from the change log;
--   * any other writer of the document (the AI connector, an older save) goes through diary.split_training (a trigger):
--       - a writer that loaded the whole diary (diary.full_payload) and writes it back: the training differences
--         are worked out and applied to the tables;
--       - a writer that changed the stored document in place ("append this workout", "set the running workout"):
--         those items are added or replaced;
--     training never lands in the stored document, and the change log gets the training operations;
--   * the Friends feed copies are made from the tables.
-- Everyone else works exactly as before (forma_save_changes passes their saves to forma_save_workspace_patch).
--
-- diary.move_to_tables(u) switches a person on: it refills their training, checks it comes back exactly, and only
-- then moves training out of the document (phones see no change). diary.move_back(u) undoes it.
-- Run after 14-apply-training.sql and the connector files. Safe to re-run.
begin;

-- The whole diary as its writers expect it (the stored document for everyone not switched).
create or replace function diary.full_payload(u uuid, stored jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when diary.in_tables(u) then diary.workspace_doc(u, stored) else stored end
$$;
revoke all on function diary.full_payload(uuid, jsonb) from public, anon, authenticated;

-- ── The Friends feed from the tables (same copy as mfd_private.project_workouts makes from the document) ──
create or replace function diary.project_feed(u uuid, ids text[]) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.mfd_social_workouts s where s.owner_id = u and (ids is null or s.workout_id = any (ids))
    and not exists (select 1 from diary.workouts w where w.user_id = u and w.legacy_id = s.workout_id and w.deleted_at is null and w.ended_at is not null);
  insert into public.mfd_social_workouts (owner_id, workout_id, started_at, data)
  select u, w.legacy_id, w.started_at, diary.feed_copy(w) from diary.workouts w
  where w.user_id = u and w.deleted_at is null and w.ended_at is not null and (ids is null or w.legacy_id = any (ids))
  on conflict (owner_id, workout_id) do update set data = excluded.data, started_at = excluded.started_at, updated_at = now()
    where public.mfd_social_workouts.data is distinct from excluded.data or public.mfd_social_workouts.started_at is distinct from excluded.started_at;
end $$;
revoke all on function diary.project_feed(uuid, text[]) from public, anon, authenticated;

-- Training operations as stored (compact, like the document would keep them), for the change log.
create or replace function diary.compact_ops(ops jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(case
      when not op ? 'v' or jsonb_typeof(op->'v') = 'null' then op
      when op ? 'i' then op || jsonb_build_object('v', (mfd_private.workspace_compact(jsonb_build_object(op->>'k', jsonb_build_array(op->'v')))).document->(op->>'k')->0)
      when op->>'k' = 'active' then op || jsonb_build_object('v', (mfd_private.workspace_compact(jsonb_build_object('active', op->'v'))).document->'active')
      else op || jsonb_build_object('v', (mfd_private.workspace_compact(jsonb_build_object(op->>'k', op->'v'))).document->(op->>'k')) end order by n), '[]')
  from jsonb_array_elements(ops) with ordinality t(op, n)
$$;

-- The training operations of the current save, handed from the save to the change log (same transaction).
create or replace function diary.stash_training_ops(ops jsonb) returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('diary.training_ops', (coalesce(nullif(current_setting('diary.training_ops', true), ''), '[]')::jsonb || coalesce(ops, '[]'))::text, true);
end $$;

-- What a phone applies to go from the old to the new diary: for a switched person, the document's own changes
-- (not training, not "$training") followed by the training operations of this save.
create or replace function diary.change_ops(u uuid, old_doc jsonb, new_doc jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ops jsonb := mfd_private.workspace_diff(old_doc, new_doc); t jsonb;
begin
  if not diary.in_tables(u) then return ops; end if;
  t := coalesce(nullif(current_setting('diary.training_ops', true), '')::jsonb, '[]');
  perform set_config('diary.training_ops', '', true);
  return coalesce((select jsonb_agg(op order by n) from jsonb_array_elements(ops) with ordinality x(op, n)
                   where not (op->>'k' = any (diary.training_keys()) or op->>'k' = '$training')), '[]') || t;
end $$;
revoke all on function diary.change_ops(uuid, jsonb, jsonb) from public, anon, authenticated;

-- Every write of a switched person's document: training goes to the tables, never into the document.
create or replace function diary.split_training() returns trigger language plpgsql security definer set search_path = '' as $$
declare keys text[]; old_doc jsonb; ops jsonb := '[]'; present jsonb; k text; item jsonb; before jsonb; after jsonb;
begin
  if tg_op <> 'UPDATE' or not diary.in_tables(new.user_id) then return new; end if;
  select array_agg(x) into keys from unnest(diary.training_keys()) x where new.payload ? x;
  if keys is null then return new; end if;
  present := coalesce(old.payload->'$training', '[]');
  if new.payload ? '$training' then
    -- Changed in place: the items given are added or replaced (and the running workout set).
    foreach k in array keys loop
      if k = 'active' then ops := ops || jsonb_build_array(jsonb_build_object('k', 'active', 'v', new.payload->'active'));
      elsif jsonb_typeof(new.payload->k) = 'array' then
        if not present ? k then ops := ops || jsonb_build_array(jsonb_build_object('k', k, 'v', '[]'::jsonb)); end if;
        for item in select value from jsonb_array_elements(new.payload->k) loop
          ops := ops || jsonb_build_array(jsonb_build_object('k', k, 'i', item->'id', 'v', item));
        end loop;
      end if;
    end loop;
    present := diary.apply_training_ops(new.user_id, ops, present);
    perform diary.stash_training_ops(diary.compact_ops(ops));
  else
    -- The whole diary written back: apply what differs from the tables.
    old_doc := diary.workspace_doc(new.user_id, old.payload);
    select coalesce(jsonb_object_agg(x, old_doc->x), '{}') into before from unnest(diary.training_keys()) x where old_doc ? x;
    select coalesce(jsonb_object_agg(x, new.payload->x), '{}') into after from unnest(diary.training_keys()) x where new.payload ? x;
    ops := mfd_private.workspace_diff(before, after);
    present := diary.apply_training_ops(new.user_id, ops, present);
    -- The log gets what the tables now hold (compact), exactly.
    old_doc := diary.workspace_doc(new.user_id, jsonb_build_object('$training', present));
    perform diary.stash_training_ops(mfd_private.workspace_diff(before, old_doc - '$training'));
  end if;
  new.payload := (new.payload - diary.training_keys()) || jsonb_build_object('$training', present);
  if new.revision <= old.revision and coalesce(nullif(current_setting('diary.training_ops', true), ''), '[]') <> '[]' then new.revision := old.revision + 1; end if;
  return new;
end $$;
revoke all on function diary.split_training() from public, anon, authenticated;
-- BEFORE triggers run in name order: this one first, then forma_workspace_before_write (compaction, revision).
drop trigger if exists diary_0_split on public.forma_workspaces;
create trigger diary_0_split before update on public.forma_workspaces for each row execute function diary.split_training();

-- ── The app's save and full download ──
create or replace function public.forma_save_changes(ops jsonb, expected_revision bigint)
returns table(saved_revision bigint, conflict boolean, adjusted boolean) language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); cur bigint; stored jsonb; t_ops jsonb; o_ops jsonb; present jsonb; logged jsonb; next jsonb; rev bigint; after jsonb;
  started timestamptz := clock_timestamp();
begin
  if v_user is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if not diary.in_tables(v_user) then return query select * from public.forma_save_workspace_patch(ops, expected_revision); return; end if;
  if jsonb_typeof(ops) is distinct from 'array' or octet_length(ops::text) > 8000000 then raise exception 'Invalid changes' using errcode = '22023'; end if;
  if expected_revision is null or expected_revision < 1 then raise exception 'Invalid revision' using errcode = '22023'; end if;
  select revision, payload into cur, stored from public.forma_workspaces where user_id = v_user for update;
  if cur is null or cur <> expected_revision then
    perform mfd_observability.record_sync('conflict', extract(epoch from clock_timestamp() - started)::double precision);
    return query select null::bigint, true, false; return;
  end if;
  select coalesce(jsonb_agg(op order by n) filter (where op->>'k' = any (diary.training_keys())), '[]'),
         coalesce(jsonb_agg(op order by n) filter (where not op->>'k' = any (diary.training_keys()) and op->>'k' <> '$training'), '[]')
    into t_ops, o_ops from jsonb_array_elements(ops) with ordinality x(op, n);
  present := diary.apply_training_ops(v_user, t_ops, coalesce(stored->'$training', '[]'));
  next := mfd_private.workspace_apply(stored - '$training', o_ops);
  if jsonb_typeof(next->'profile') is distinct from 'object' or exists (select 1 from unnest(array['meals', 'weights', 'checkins', 'chat']) l where jsonb_typeof(next->l) is distinct from 'array')
     or not (present ? 'sessions' and present ? 'routines') then
    raise exception 'Invalid workspace document' using errcode = '22023'; end if;
  logged := diary.compact_ops(t_ops);
  perform diary.stash_training_ops(logged);
  update public.forma_workspaces set payload = next || jsonb_build_object('$training', present), revision = revision + 1, updated_at = now()
    where user_id = v_user returning revision, payload into rev, after;
  perform mfd_observability.record_sync('saved', extract(epoch from clock_timestamp() - started)::double precision);
  return query select rev, false, (after - '$training') is distinct from next or logged is distinct from t_ops;
end $$;
revoke all on function public.forma_save_changes(jsonb, bigint) from public, anon;
grant execute on function public.forma_save_changes(jsonb, bigint) to authenticated;

create or replace function public.forma_workspace_full() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select payload, revision, updated_at into r from public.forma_workspaces where user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('payload', diary.full_payload(auth.uid(), r.payload), 'revision', r.revision, 'updated_at', r.updated_at);
end $$;
revoke all on function public.forma_workspace_full() from public, anon;
grant execute on function public.forma_workspace_full() to authenticated;

-- ── Switching a person on and off ──
-- A safety copy of each person's diary exactly as it was when they were switched on (kept until removed by hand,
-- e.g. a few weeks later): a switch can always be undone from it, even if something unexpected happened since.
create table if not exists diary.moved_payloads (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  revision   bigint not null,
  moved_at   timestamptz not null default now()
);
alter table diary.moved_payloads enable row level security;
revoke all on diary.moved_payloads from public, anon, authenticated;

create or replace function diary.move_to_tables(u uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare stored jsonb; t jsonb; k text; present jsonb := '[]'; bad text[] := '{}';
begin
  if diary.in_tables(u) then return jsonb_build_object('already', true); end if;
  select payload into stored from public.forma_workspaces where user_id = u for update;
  if stored is null then raise exception 'No diary for %', u; end if;
  perform diary.fill_training(u);
  t := diary.training_json(u);
  foreach k in array diary.training_keys() loop
    if stored ? k then
      present := present || to_jsonb(k);
      if (stored->k) is distinct from (t->k) and not (k = 'active' and jsonb_typeof(stored->k) = 'null' and t->k = 'null'::jsonb) then bad := bad || k; end if;
    end if;
  end loop;
  if cardinality(bad) > 0 then raise exception 'Not moved: % would not come back exactly (%)', u, array_to_string(bad, ', '); end if;
  insert into diary.moved_payloads (user_id, payload, revision) select u, payload, revision from public.forma_workspaces where user_id = u
    on conflict (user_id) do update set payload = excluded.payload, revision = excluded.revision, moved_at = now();
  insert into diary.table_people (user_id) values (u);
  update public.forma_workspaces set payload = (payload - diary.training_keys()) || jsonb_build_object('$training', present) where user_id = u;
  return jsonb_build_object('moved', true, 'training', present);
end $$;
revoke all on function diary.move_to_tables(uuid) from public, anon, authenticated;

create or replace function diary.move_back(u uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare whole jsonb;
begin
  if not diary.in_tables(u) then return jsonb_build_object('already', true); end if;
  select diary.workspace_doc(u, payload) into whole from public.forma_workspaces where user_id = u for update;
  delete from diary.table_people where user_id = u;
  update public.forma_workspaces set payload = whole where user_id = u;
  return jsonb_build_object('moved_back', true);
end $$;
revoke all on function diary.move_back(uuid) from public, anon, authenticated;

-- ── Existing code, changed in place (each line must be found exactly once, else nothing is applied) ──
do $patch$
declare fname text; fn regprocedure; old text; new text; def text; n int;
begin
  for fname, old, new in select * from (values
    -- The change log: switched people's training operations come from the save, not from the document.
    ('mfd_private.workspace_log_change()', 'mfd_private.workspace_diff(old.payload,new.payload)', 'diary.change_ops(new.user_id,old.payload,new.payload)'),
    -- Downloads of changes: a switched diary's document is small, so don't compare the changes' size with it.
    ('public.forma_workspace_pull(bigint)', 'select revision,pg_column_size(payload) into cur,size_doc',
     'select revision,case when diary.in_tables(user_id) then 2147483647 else pg_column_size(payload) end into cur,size_doc'),
    -- The Friends feed copy from the document: not for switched people (theirs comes from the tables).
    ('mfd_private.project_workouts()', 'begin
 if tg_op=''UPDATE'' and new.payload->''sessions'' is not distinct from old.payload->''sessions''',
     'begin
 if diary.in_tables(new.user_id) then return new;end if;
 if tg_op=''UPDATE'' and new.payload->''sessions'' is not distinct from old.payload->''sessions'''),
    -- The AI connector loads the whole diary.
    ('mfd_mcp.add_entry(uuid,text,text,jsonb,date)', 'select payload into doc from public.forma_workspaces where user_id=u for update;',
     'select diary.full_payload(user_id,payload) into doc from public.forma_workspaces where user_id=u for update;'),
    ('mfd_mcp.ai_doc(uuid)', 'select payload into doc from public.forma_workspaces where user_id=u for update;',
     'select diary.full_payload(user_id,payload) into doc from public.forma_workspaces where user_id=u for update;'),
    ('mfd_mcp.create_routine_in(jsonb)', 'select payload into doc from public.forma_workspaces where user_id=w.u;',
     'select diary.full_payload(user_id,payload) into doc from public.forma_workspaces where user_id=w.u;'),
    ('mfd_mcp.start_workout(jsonb)', 'select payload into doc from public.forma_workspaces where user_id=u for update;',
     'select diary.full_payload(user_id,payload) into doc from public.forma_workspaces where user_id=u for update;'),
    ('mfd_mcp.suggest(jsonb)', 'select payload into doc from public.forma_workspaces where user_id=u for update;',
     'select diary.full_payload(user_id,payload) into doc from public.forma_workspaces where user_id=u for update;'),
    ('mfd_mcp.undo_entries(uuid,text,text[])', 'select payload into doc from public.forma_workspaces where user_id=u for update;',
     'select diary.full_payload(user_id,payload) into doc from public.forma_workspaces where user_id=u for update;')
  ) v(fn, old, new) loop
    -- (a database without the AI connector or the Friends feed, e.g. a test server: nothing to change there)
    fn := to_regprocedure(fname);
    if fn is null then continue; end if;
    def := pg_get_functiondef(fn);
    if position(new in def) > 0 then continue; end if;          -- already changed (re-run)
    n := (length(def) - length(replace(def, old, ''))) / length(old);
    if n <> 1 then raise exception '% : expected the line once, found it % times; nothing was changed', fn, n; end if;
    execute replace(def, old, new);
  end loop;
end $patch$;
commit;
