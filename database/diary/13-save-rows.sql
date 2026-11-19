-- MFD database move, step 1: saving rows straight into the tables (training first).
--
--   public.diary_save(changes)   the app sends only the rows that changed; one call, all or nothing.
--
-- changes = {"rows": [ {"table": "workout_sets", "id": "<uuid>", "seen": 41, "row": {"reps": 8, "weight_kg": 82.5}},
--                      {"table": "workout_sets", "id": "<uuid>", "seen": 42, "delete": true}, … ]}
--   * "seen": the row's version the phone last had (null/absent for a new row).
--   * "row": only the fields that changed (a new row needs its required fields). Unknown fields are refused; the
--     bookkeeping fields (id, user_id, version, created_at, updated_at, deleted_at) are never taken from the phone.
--   * "delete": marks the row deleted (deleted_at), which passes on to its children so other phones hear about it.
--
-- Clashes: if any row changed on the server after the version the phone saw (another phone, an AI assistant), or
-- was deleted, NOTHING from the batch is saved; the answer lists those rows as they are now, so the app can merge
-- and send again. Otherwise every row is saved and the answer gives each one's new version and the newest sync
-- number (the same numbers diary.changes_since uses for downloads).
--
-- Runs as the signed-in person (security invoker): row-level security means only their own rows can be read or
-- written, whatever the phone sends. Parents are written before children (a new set can come with its new workout).
-- Nobody uses this yet: the app switches to it per person in step 2. Run after 12-read.sql. Safe to re-run.
begin;

-- The tables the app may write directly, parents first.
create or replace function diary.save_tables() returns text[] language sql immutable set search_path = '' as $$
  select array['routine_folders', 'routines', 'routine_exercises', 'routine_sets', 'workouts', 'workout_exercises', 'workout_sets', 'workout_heart_rate']
$$;

create or replace function public.diary_save(changes jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  u uuid := auth.uid(); c jsonb; t text; rid uuid; seen bigint; cur record; cols text[]; bad text; clashes jsonb := '[]'; saved jsonb := '[]';
  n int; v bigint; keys text[];
  never constant text[] := array['id', 'user_id', 'version', 'created_at', 'updated_at', 'deleted_at'];
begin
  if u is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(changes->'rows') is distinct from 'array' then raise exception 'changes.rows must be a list' using errcode = '22023'; end if;
  n := jsonb_array_length(changes->'rows');
  if n = 0 then return jsonb_build_object('saved', '[]'::jsonb, 'version', coalesce((select last_version from diary.sync_counters where user_id = u), 0)); end if;
  if n > 2000 or octet_length(changes::text) > 5000000 then raise exception 'Too many changes in one save (at most 2000 rows)' using errcode = '22023'; end if;

  -- 1. Check everything first (and lock the rows), so nothing is written when anything clashes.
  for c in select value from jsonb_array_elements(changes->'rows') loop
    t := c->>'table';
    if t is null or not t = any (diary.save_tables()) then raise exception 'Unknown table %', coalesce(t, '(none)') using errcode = '22023'; end if;
    begin rid := (c->>'id')::uuid; exception when others then rid := null; end;
    if rid is null then raise exception 'Each change needs a uuid "id" (%)', t using errcode = '22023'; end if;
    if c ? 'seen' and jsonb_typeof(c->'seen') not in ('number', 'null') then raise exception 'seen must be a number' using errcode = '22023'; end if;
    seen := (c->>'seen')::bigint;
    if coalesce((c->>'delete')::boolean, false) is false then
      if jsonb_typeof(c->'row') is distinct from 'object' then raise exception 'Change % of % needs "row" or "delete"', rid, t using errcode = '22023'; end if;
      select array_agg(a.attname::text) into cols from pg_attribute a
      where a.attrelid = ('diary.' || t)::regclass and a.attnum > 0 and not a.attisdropped and not a.attname = any (never);
      select k into bad from jsonb_object_keys(c->'row') k where not k = any (cols) limit 1;
      if bad is not null then raise exception 'Unknown or protected field "%" for %', bad, t using errcode = '22023'; end if;
    end if;
    execute format('select version, deleted_at from diary.%I where %I = $1 for update', t, case when t = 'workout_heart_rate' then 'workout_id' else 'id' end) into cur using rid;
    if cur.version is not null then                                -- the row exists (version is never empty)
      -- Changed since the phone saw it, deleted meanwhile, or the phone thinks it's new: a clash.
      if seen is null or cur.version > seen or cur.deleted_at is not null then
        execute format('select to_jsonb(x) from diary.%I x where %I = $1', t, case when t = 'workout_heart_rate' then 'workout_id' else 'id' end) into c using rid;
        clashes := clashes || jsonb_build_array(jsonb_build_object('table', t, 'id', rid, 'now', c));
      end if;
    end if;
  end loop;
  if jsonb_array_length(clashes) > 0 then
    return jsonb_build_object('saved', '[]'::jsonb, 'clashes', clashes, 'version', coalesce((select last_version from diary.sync_counters where user_id = u), 0));
  end if;

  -- 2. Write, parents first (by the order of diary.save_tables, then as sent).
  for c, t in select value, value->>'table' from jsonb_array_elements(changes->'rows') with ordinality e(value, i)
              order by array_position(diary.save_tables(), value->>'table'), i loop
    rid := (c->>'id')::uuid;
    if t = 'workout_heart_rate' then
      if coalesce((c->>'delete')::boolean, false) then
        execute 'update diary.workout_heart_rate set deleted_at = now() where workout_id = $1 and deleted_at is null returning version' into v using rid;
      else
        select array_agg(k) into keys from jsonb_object_keys(c->'row') k where k <> 'workout_id';
        if exists (select 1 from diary.workout_heart_rate where workout_id = rid) then
          if keys is not null then
            execute format('update diary.workout_heart_rate t set (%s) = (select %s from jsonb_populate_record(null::diary.workout_heart_rate, $2) r) where t.workout_id = $1 returning version',
              array_to_string(array(select quote_ident(k) from unnest(keys) k), ', '), array_to_string(array(select 'r.' || quote_ident(k) from unnest(keys) k), ', ')) into v using rid, c->'row';
          end if;
        else
          execute format('insert into diary.workout_heart_rate (workout_id, user_id%s) select $1, $3%s from jsonb_populate_record(null::diary.workout_heart_rate, $2) r returning version',
            coalesce(', ' || array_to_string(array(select quote_ident(k) from unnest(keys) k), ', '), ''),
            coalesce(', ' || array_to_string(array(select 'r.' || quote_ident(k) from unnest(keys) k), ', '), '')) into v using rid, c->'row', u;
        end if;
      end if;
    elsif coalesce((c->>'delete')::boolean, false) then
      execute format('update diary.%I set deleted_at = now() where id = $1 and deleted_at is null returning version', t) into v using rid;
    else
      select array_agg(k) into keys from jsonb_object_keys(c->'row') k;
      execute format('select 1 from diary.%I where id = $1', t) into n using rid;
      if n is not null then
        if keys is not null then
          execute format('update diary.%I t set (%s) = (select %s from jsonb_populate_record(null::diary.%I, $2) r) where t.id = $1 returning version', t,
            array_to_string(array(select quote_ident(k) from unnest(keys) k), ', '), array_to_string(array(select 'r.' || quote_ident(k) from unnest(keys) k), ', '), t)
            into v using rid, c->'row';
        end if;
      else
        execute format('insert into diary.%I (id, user_id%s) select $1, $3%s from jsonb_populate_record(null::diary.%I, $2) r returning version', t,
          coalesce(', ' || array_to_string(array(select quote_ident(k) from unnest(keys) k), ', '), ''),
          coalesce(', ' || array_to_string(array(select 'r.' || quote_ident(k) from unnest(keys) k), ', '), ''), t) into v using rid, c->'row', u;
      end if;
      n := null;
    end if;
    saved := saved || jsonb_build_array(jsonb_build_object('table', t, 'id', rid, 'version', v));
    v := null;
  end loop;
  return jsonb_build_object('saved', saved, 'version', coalesce((select last_version from diary.sync_counters where user_id = u), 0));
end $$;
revoke all on function public.diary_save(jsonb) from public, anon;
grant execute on function public.diary_save(jsonb) to authenticated;
grant usage on schema diary to authenticated;
commit;
