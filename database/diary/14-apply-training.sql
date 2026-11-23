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

-- ── Food, body and account (database move, step 2c) ──
-- The rest of the diary: food (meals, products = My foods, foodFavorites, water), body (weights, checkins) and
-- account (profile, mfdSettings, aiSuggestions, aiChanges). Their facts live in the tables as usual
-- (06–11-*.sql). What the app stored that the tables don't rebuild exactly is kept per part as an "exact patch"
-- (diary.doc_patches: the change operations that turn the rebuilt part into the stored one), so the part comes
-- back exactly, whatever its shape. A change to any of these parts redoes the (small) food, body and account rows
-- and refreshes the patches.
create or replace function diary.area_keys() returns text[] language sql immutable set search_path = '' as $$
  select array['meals', 'products', 'foodFavorites', 'water', 'weights', 'checkins', 'profile', 'mfdSettings', 'aiSuggestions', 'aiChanges']
$$;
-- Everything that lives in the tables (the "$training" list in the stored document names which of these a diary has).
create or replace function diary.table_keys() returns text[] language sql immutable set search_path = '' as $$
  select array['sessions', 'active', 'folders', 'routines', 'mfdExercises', 'meals', 'products', 'foodFavorites', 'water', 'weights', 'checkins',
               'profile', 'mfdSettings', 'aiSuggestions', 'aiChanges']
$$;

create table if not exists diary.doc_patches (
  user_id uuid not null references auth.users(id) on delete cascade,
  part    text not null,
  ops     jsonb not null check (jsonb_typeof(ops) = 'array'),
  primary key (user_id, part)
);
alter table diary.doc_patches enable row level security;
revoke all on diary.doc_patches from public, anon, authenticated;

-- The parts `keys` exactly as the app stored them: rebuilt from the tables, then each part's patch.
create or replace function diary.area_values(u uuid, keys text[]) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := '{}'; k text; one jsonb; fix jsonb;
begin
  foreach k in array coalesce(keys, '{}') loop
    -- (each part on its own, exactly as in diary.area_json)
    one := jsonb_strip_nulls(jsonb_build_object(k, diary.area_part(u, k)));
    select p.ops into fix from diary.doc_patches p where p.user_id = u and p.part = k;
    if fix is not null then one := mfd_private.workspace_apply(one, fix); end if;
    out := out || one;
    fix := null;
  end loop;
  return out;
end $$;
revoke all on function diary.area_values(uuid, text[]) from public, anon, authenticated;

-- Which parts a change needs: each copy (fill_nutrition, fill_body, fill_account) reads all the parts of its area,
-- food also reads the settings, and the rebuilt profile shows the latest weigh-in.
create or replace function diary.area_needs(touched text[]) returns text[] language sql immutable set search_path = '' as $$
  select array(select distinct x from unnest(
    case when touched && array['meals', 'products', 'foodFavorites', 'water', 'mfdSettings'] then array['meals', 'products', 'foodFavorites', 'water', 'mfdSettings'] else '{}' end
    || case when touched && array['weights', 'checkins'] then array['weights', 'checkins', 'profile'] else '{}' end
    || case when touched && array['profile', 'mfdSettings', 'aiSuggestions', 'aiChanges'] then array['profile', 'mfdSettings', 'aiSuggestions', 'aiChanges'] else '{}' end) x)
$$;

-- Makes the parts in `parts` (all food, body and account parts when null) exactly as in `doc` (a part `doc` lacks is
-- emptied): the rows of their areas are redone from it and their patches refreshed. `doc` must hold every present
-- part of diary.area_needs(parts). only_entries: the meals that changed ('{}' none, null all).
drop function if exists diary.set_areas(uuid, jsonb);
create or replace function diary.set_areas(u uuid, doc jsonb, parts text[] default null, only_entries text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare need text[] := case when parts is null then diary.area_keys() else diary.area_needs(parts) end;
  redo text[] := coalesce(parts, diary.area_keys()); k text; fix jsonb; built jsonb;
begin
  -- Only the areas whose parts changed are copied again; need also has parts that are only rebuilt and checked
  -- (the profile, which shows the latest weigh-in).
  if redo && array['meals', 'products', 'foodFavorites', 'water', 'mfdSettings'] then perform diary.fill_nutrition(u, only_entries, doc); end if;
  if redo && array['weights', 'checkins'] then perform diary.fill_body(u, doc); end if;
  if redo && array['profile', 'mfdSettings', 'aiSuggestions', 'aiChanges'] then perform diary.fill_account(u, doc); end if;
  foreach k in array need loop
    built := jsonb_strip_nulls(jsonb_build_object(k, diary.area_part(u, k)));
    fix := case when doc ? k then mfd_private.workspace_diff(built, jsonb_build_object(k, doc->k)) end;
    if fix is null or fix = '[]'::jsonb then delete from diary.doc_patches where user_id = u and part = k;
    else insert into diary.doc_patches (user_id, part, ops) values (u, k, fix) on conflict (user_id, part) do update set ops = excluded.ops; end if;
  end loop;
end $$;
revoke all on function diary.set_areas(uuid, jsonb, text[], text[]) from public, anon, authenticated;

-- Applies the food, body and account operations in `ops` (the document's own rules and refusals); returns the new
-- "$training" list. Only the areas the operations touch are rebuilt and redone (a meal: food only, that entry only).
create or replace function diary.apply_area_ops(u uuid, ops jsonb, present jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a_ops jsonb; keys text[] := array(select jsonb_array_elements_text(coalesce(present, '[]'))); doc jsonb; touched text[]; need text[]; entries text[];
begin
  select coalesce(jsonb_agg(e order by n), '[]') into a_ops from jsonb_array_elements(ops) with ordinality t(e, n) where e->>'k' = any (diary.area_keys());
  if a_ops = '[]'::jsonb then return present; end if;
  touched := array(select distinct e->>'k' from jsonb_array_elements(a_ops) e);
  need := diary.area_needs(touched);
  doc := diary.area_values(u, array(select x from unnest(keys) x where x = any (need)));
  doc := mfd_private.workspace_apply(doc, a_ops);
  -- The same shape rules as a whole saved diary.
  if (doc ? 'profile' and jsonb_typeof(doc->'profile') is distinct from 'object')
     or exists (select 1 from unnest(array['meals', 'weights', 'checkins']) l2 where doc ? l2 and jsonb_typeof(doc->l2) is distinct from 'array') then
    raise exception 'Invalid workspace document' using errcode = '22023'; end if;
  -- Meals changed one by one: only those entries are copied again.
  entries := case when not 'meals' = any (touched) then '{}'
                  when exists (select 1 from jsonb_array_elements(a_ops) e where e->>'k' = 'meals' and not (e ? 'i' or e ? 'o')) then null
                  else array(select distinct e->>'i' from jsonb_array_elements(a_ops) e where e->>'k' = 'meals' and e ? 'i') end;
  perform diary.set_areas(u, doc, touched, entries);
  return to_jsonb(array(select x from unnest(keys) x where not x = any (need))
                  || array(select x from jsonb_object_keys(doc) x where x = any (need)));
end $$;
revoke all on function diary.apply_area_ops(uuid, jsonb, jsonb) from public, anon, authenticated;

-- Every moved part: training first, then food, body and account.
create or replace function diary.apply_table_ops(u uuid, ops jsonb, present jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return diary.apply_area_ops(u, ops, diary.apply_training_ops(u, ops, present));
end $$;
revoke all on function diary.apply_table_ops(uuid, jsonb, jsonb) from public, anon, authenticated;

-- The whole diary as the app knows it, for a person whose training (and food, body, account) lives in the tables:
-- the stored document (app state) plus every moved part listed in its "$training" list.
create or replace function diary.workspace_doc(u uuid, stored jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare keys text[] := array(select jsonb_array_elements_text(case when jsonb_typeof(stored->'$training') = 'array' then stored->'$training' else '[]' end));
  t jsonb; out jsonb := stored - '$training';
begin
  if keys && diary.training_keys() then
    t := diary.training_json(u);
    out := out || coalesce((select jsonb_object_agg(k, t->k) from unnest(keys) k where k = any (diary.training_keys())), '{}');
  end if;
  if keys && diary.area_keys() then out := out || diary.area_values(u, array(select k from unnest(keys) k where k = any (diary.area_keys()))); end if;
  return out;
end $$;
revoke all on function diary.workspace_doc(uuid, jsonb) from public, anon, authenticated;

-- The current plans and "My exercises" (small lists) as the app knows them.
-- (built on its own, exactly as in diary.training_json: rebuilding every workout just for these was what made each
-- save during a workout take seconds)
create or replace function diary.plans_doc(u uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'folders', coalesce((select jsonb_agg(diary.with_extra(diary.folder_base(f), f.extra) order by f.position, f.id)
                         from diary.routine_folders f where f.user_id = u and f.deleted_at is null), '[]'),
    'routines', coalesce((select jsonb_agg(diary.routine_json(r) order by r.position, r.id)
                          from diary.routines r where r.user_id = u and r.deleted_at is null), '[]'),
    'mfdExercises', coalesce((select jsonb_agg(diary.with_extra(diary.own_exercise_base(e), e.extra) order by diary.pos(e.extra), e.name)
                              from diary.exercises e where e.user_id = u and e.deleted_at is null and e.archived_at is null
                                and jsonb_typeof(e.extra->'$pos') = 'number'), '[]'))
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
  run_id text; p int; own jsonb; touched text[] := '{}'; all_feed boolean := false;
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
        touched := touched || wid;
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
        touched := touched || wid;
      else raise exception 'Invalid change' using errcode = '22023'; end if;
    elsif op->'d' = 'true'::jsonb then
      keys := array_remove(keys, k);
      perform diary.fill_training(u, null, jsonb_build_object('sessions', '[]'::jsonb, 'mfdExercises', own), false);
      all_feed := true;
    elsif op ? 'v' then
      if not k = any (keys) then keys := keys || k; end if;
      select * into c from mfd_private.workspace_compact(jsonb_build_object('sessions', op->'v'));
      if c.imports <> '{}'::jsonb then
        insert into public.forma_import_rows (user_id, session_id, rows) select u, key, value from jsonb_each(c.imports)
          on conflict (user_id, session_id) do update set rows = excluded.rows, stored_at = now();
      end if;
      -- The whole list: every workout redone (the running one is kept).
      perform diary.fill_training(u, null, jsonb_build_object('sessions', c.document->'sessions', 'active', (select diary.training_json(u)->'active'), 'mfdExercises', own), false);
      all_feed := true;
    else raise exception 'Invalid change' using errcode = '22023'; end if;
  end loop;
  -- The Friends feed copies of the workouts this changed (from the tables; defined in 15-tables-switch.sql).
  if (all_feed or cardinality(touched) > 0) and to_regprocedure('diary.project_feed(uuid,text[])') is not null then
    perform diary.project_feed(u, case when all_feed then null else touched end);
  end if;
  return to_jsonb(keys);
end $$;
revoke all on function diary.apply_training_ops(uuid, jsonb, jsonb) from public, anon, authenticated;
commit;
