-- Database move, step 2b (core): the app's training changes go straight into the tables.
--
-- The app sends its changes as operations on its diary (database/DELTA_SYNC.md): set a whole list or value
-- {"k":key,"v":…}, remove it {"k":key,"d":true}, add/replace one item {"k":key,"i":id,"v":item}, remove one item
-- {"k":key,"i":id,"d":true}, or reorder a list {"k":key,"o":[ids]}. For a person whose training lives in the tables,
-- the training keys (sessions, active, folders, routines, mfdExercises) are applied here instead of to the stored
-- document, touching only what the operation names:
--   * one workout: only that workout's rows (and its place in the list);
--   * the running workout: only its rows;
--   * folders, routines, "My exercises": the plans (small), redone from the changed lists.
-- The result is exactly what mfd_private.workspace_apply would make of the document (the same rules and the same
-- refusals), which tests/diary-apply-training.cjs checks on thousands of random changes.
--
-- Which training keys a diary has at all is kept in the stored document as "$training" (a list of keys), so a
-- diary without e.g. "mfdExercises" comes back without it. diary.workspace_doc(u) is the whole diary as the app
-- knows it: the stored document plus the training from the tables.
--
-- Nothing calls this yet: step 2b wires it into saving and downloading, per person. Run after 13-save-rows.sql.
-- Safe to re-run.
begin;

create or replace function diary.training_keys() returns text[] language sql immutable set search_path = '' as $$
  select array['sessions', 'active', 'folders', 'routines', 'mfdExercises']
$$;

-- The whole diary as the app knows it, for a person whose training lives in the tables.
create or replace function diary.workspace_doc(u uuid, stored jsonb) returns jsonb language sql stable set search_path = '' as $$
  select (stored - '$training') || coalesce((select jsonb_object_agg(k, t->k)
    from jsonb_array_elements_text(case when jsonb_typeof(stored->'$training') = 'array' then stored->'$training' else '[]' end) k,
         (select diary.training_json(u) t) x), '{}')
$$;
revoke all on function diary.workspace_doc(uuid, jsonb) from public, anon, authenticated;

-- The current plans and "My exercises" (small lists) as the app knows them.
create or replace function diary.plans_doc(u uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('folders', t->'folders', 'routines', t->'routines', 'mfdExercises', t->'mfdExercises') from (select diary.training_json(u) t) x
$$;

-- One workout's place in the list.
create or replace function diary.set_workout_pos(u uuid, legacy text, p int) returns void language sql security definer set search_path = '' as $$
  update diary.workouts set extra = coalesce(extra, '{}') || jsonb_build_object('$pos', p)
  where id = diary.legacy_uuid(u, 'workout', legacy) and diary.pos(extra) is distinct from p
$$;

-- Applies the training operations in `ops` for person u; `present` is the stored "$training" list. Returns the new
-- "$training" list. Raises the same errors as mfd_private.workspace_apply for operations that don't fit.
create or replace function diary.apply_training_ops(u uuid, ops jsonb, present jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare op jsonb; k text; wid text; keys text[] := array(select jsonb_array_elements_text(coalesce(present, '[]'))); doc jsonb; c record;
  run_id text; p int; own jsonb;
begin
  for op in select e from jsonb_array_elements(ops) with ordinality t(e, n) where e->>'k' = any (diary.training_keys()) order by n loop
    k := op->>'k';
    if (op ? 'i' or op ? 'o') and not k = any (keys) then raise exception 'Not a list: %', k using errcode = '22023'; end if;
    if (op ? 'i' or op ? 'o') and k = 'active' then raise exception 'Not a list: %', k using errcode = '22023'; end if;

    if k in ('folders', 'routines', 'mfdExercises') then
      -- Plans: apply the operation to the current lists (the document's own rules), then redo the plans.
      doc := diary.plans_doc(u);
      for c in select unnest(diary.training_keys()) kk loop
        if c.kk in ('folders', 'routines', 'mfdExercises') and not c.kk = any (keys) then doc := doc - c.kk; end if;
      end loop;
      doc := mfd_private.workspace_apply(doc, jsonb_build_array(op));
      -- (stored compact, as the document would be: empty set fields in routines dropped)
      select * into c from mfd_private.workspace_compact(doc); doc := c.document;
      if op->'d' = 'true'::jsonb and not op ? 'i' then keys := array_remove(keys, k);
      elsif not k = any (keys) then keys := keys || k; end if;
      perform diary.fill_training(u, '{}', jsonb_build_object('folders', coalesce(doc->'folders', '[]'), 'routines', coalesce(doc->'routines', '[]'),
        'mfdExercises', coalesce(doc->'mfdExercises', '[]')), true);
      continue;
    end if;

    own := diary.plans_doc(u)->'mfdExercises';
    run_id := (select w.legacy_id from diary.workouts w where w.user_id = u and w.ended_at is null and w.deleted_at is null limit 1);

    if k = 'active' then
      -- The running workout: replaced or removed as a whole (only its rows change).
      if op->'d' = 'true'::jsonb then keys := array_remove(keys, k); doc := null;
      elsif op ? 'v' then if not k = any (keys) then keys := keys || k; end if; doc := op->'v';
      else raise exception 'Invalid change' using errcode = '22023'; end if;
      select * into c from mfd_private.workspace_compact(jsonb_build_object('active', doc));
      doc := c.document->'active';
      perform diary.fill_training(u, array_remove(array[run_id, case when jsonb_typeof(doc) = 'object' then doc->>'id' end], null),
        jsonb_build_object('active', doc, 'mfdExercises', own), false);
      continue;
    end if;

    -- Finished workouts.
    if op ? 'o' then
      if jsonb_typeof(op->'o') is distinct from 'array'
         or jsonb_array_length(op->'o') <> (select count(*) from diary.workouts w where w.user_id = u and w.deleted_at is null and w.ended_at is not null)
         or exists (select 1 from jsonb_array_elements_text(op->'o') x where not exists (select 1 from diary.workouts w where w.user_id = u and w.deleted_at is null and w.ended_at is not null and w.legacy_id = x))
         or (select count(distinct x) from jsonb_array_elements(op->'o') x) <> jsonb_array_length(op->'o') then
        raise exception 'Order does not match %', k using errcode = '22023'; end if;
      perform diary.set_workout_pos(u, x, (n - 1)::int) from jsonb_array_elements_text(op->'o') with ordinality o(x, n);
    elsif op ? 'i' then
      wid := op->>'i';
      if op->'d' = 'true'::jsonb then
        if not exists (select 1 from diary.workouts w where w.user_id = u and w.legacy_id = wid and w.deleted_at is null and w.ended_at is not null) then
          raise exception 'Missing item in %', k using errcode = '22023'; end if;
        perform diary.fill_training(u, array[wid], jsonb_build_object('sessions', '[]'::jsonb, 'mfdExercises', own), false);
      elsif op ? 'v' then
        if jsonb_typeof(op->'v') is distinct from 'object' or (op->'v'->'id') is distinct from (op->'i') then
          raise exception 'Item id mismatch in %', k using errcode = '22023'; end if;
        -- Kept in its place when it exists, else added at the end.
        p := (select diary.pos(w.extra) from diary.workouts w where w.user_id = u and w.legacy_id = wid and w.deleted_at is null and w.ended_at is not null);
        if p is null then
          p := coalesce((select max(diary.pos(w.extra)) + 1 from diary.workouts w where w.user_id = u and w.deleted_at is null and w.ended_at is not null), 0);
        end if;
        select * into c from mfd_private.workspace_compact(jsonb_build_object('sessions', jsonb_build_array(op->'v')));
        if c.imports <> '{}'::jsonb then
          insert into public.forma_import_rows (user_id, session_id, rows) select u, key, value from jsonb_each(c.imports)
            on conflict (user_id, session_id) do update set rows = excluded.rows, stored_at = now();
        end if;
        perform diary.fill_training(u, array[wid], jsonb_build_object('sessions', c.document->'sessions', 'mfdExercises', own), false);
        perform diary.set_workout_pos(u, wid, p);
      else raise exception 'Invalid change' using errcode = '22023'; end if;
    elsif op->'d' = 'true'::jsonb then
      keys := array_remove(keys, k);
      perform diary.fill_training(u, null, jsonb_build_object('sessions', '[]'::jsonb, 'mfdExercises', own), false);
    elsif op ? 'v' then
      if not k = any (keys) then keys := keys || k; end if;
      select * into c from mfd_private.workspace_compact(jsonb_build_object('sessions', op->'v'));
      if c.imports <> '{}'::jsonb then
        insert into public.forma_import_rows (user_id, session_id, rows) select u, key, value from jsonb_each(c.imports)
          on conflict (user_id, session_id) do update set rows = excluded.rows, stored_at = now();
      end if;
      -- The whole list: every workout redone (the running one is kept).
      perform diary.fill_training(u, null, jsonb_build_object('sessions', c.document->'sessions', 'active', (select diary.training_json(u)->'active'), 'mfdExercises', own), false);
    else raise exception 'Invalid change' using errcode = '22023'; end if;
  end loop;
  return to_jsonb(keys);
end $$;
revoke all on function diary.apply_training_ops(uuid, jsonb, jsonb) from public, anon, authenticated;
commit;
