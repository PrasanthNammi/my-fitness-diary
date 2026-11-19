-- MFD 3.0 database, part 5: fill the training tables from the old envelope (public.forma_workspaces.payload) and
-- keep them filled. Until the app writes the tables itself (step 3), the envelope stays the source of truth and the
-- tables follow it: every save changes exactly the rows that changed, so sync numbers only move for real changes.
--
--   diary.fill_training(user, only_workouts)   copies one person's folders, routines, own exercises, workouts and
--                                              the running workout. only_workouts = the old ids of the workouts to
--                                              redo (null = all).
--   trigger on forma_workspaces                after every save, redoes only what changed in that save.
--
-- Old → new: ids become fixed uuids (diary.legacy_uuid), so filling again never duplicates anything. A set's
-- exercise is the built-in one when its catalogId is a library id, otherwise the person's own exercise with that
-- name (one per name). Values outside the new limits are left empty and counted in diary.fill_problems.
--
-- Run after 04-catalogue.sql. Safe to re-run.
begin;

-- A number from the old JSON: a JSON number, or a number written as text in older entries.
create or replace function diary.num(j jsonb) returns numeric language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric
              when jsonb_typeof(j) = 'string' and j #>> '{}' ~ '^\s*-?\d{1,9}(\.\d{1,6})?\s*$' then trim(j #>> '{}')::numeric end
$$;
-- The number if it's within [lo, hi], else empty.
create or replace function diary.within(n numeric, lo numeric, hi numeric) returns numeric language sql immutable set search_path = '' as $$
  select case when n between lo and hi then n end
$$;
-- A diary day from 'YYYY-MM-DD' text, else empty (never an error).
create or replace function diary.day(t text) returns date language plpgsql immutable set search_path = '' as $$
begin
  if t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return t::date;
exception when others then return null;
end $$;
-- Epoch milliseconds → a moment.
create or replace function diary.ms(j jsonb) returns timestamptz language sql immutable set search_path = '' as $$
  select case when diary.num(j) between 946684800000 and 4102444800000 then to_timestamp(diary.num(j) / 1000) end
$$;

-- ── Building items in the app's shape from the rows (also used by 12-read.sql) ──
create or replace function diary.epoch_ms(t timestamptz) returns bigint language sql immutable set search_path = '' as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

-- An assistant's mark as the old document stored it: {connection, at, request}.
create or replace function diary.added_by(action_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('connection', a.connection, 'at', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'request', a.request_id))
  from diary.ai_actions a where a.id = action_id
$$;

-- ── Exact round trip (step to the tables becoming the original, 2026-11-19) ──
-- Each training row has "extra": what its item held that the columns don't rebuild exactly (word for word), the
-- details the columns would add but the item didn't have ("$absent"), and the item's place in its list ("$pos").
-- diary.extra_of(original, built) works it out; diary.with_extra(built, extra) puts it back.
create or replace function diary.extra_of(orig jsonb, built jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select nullif(coalesce((select jsonb_object_agg(k, orig->k) from jsonb_object_keys(orig) k where built->k is distinct from orig->k), '{}'::jsonb)
    || coalesce((select case when count(*) > 0 then jsonb_build_object('$absent', jsonb_agg(k order by k)) end from jsonb_object_keys(built) k where not orig ? k), '{}'::jsonb), '{}'::jsonb)
$$;
create or replace function diary.with_extra(built jsonb, extra jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select case when extra is null then built
    else (built - coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(extra->'$absent') = 'array' then extra->'$absent' else '[]' end)), '{}'::text[]))
      || (extra - '$absent' - '$pos') end
$$;
-- The place an item had in its list (rows without one go last, in their natural order).
create or replace function diary.pos(extra jsonb) returns int language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(extra->'$pos') = 'number' then (extra->>'$pos')::int end
$$;

-- One set as the columns hold it.
create or replace function diary.set_base(s diary.workout_sets, we diary.workout_exercises, e diary.exercises, w diary.workouts) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', case when starts_with(s.legacy_id, w.legacy_id || ':') then substr(s.legacy_id, length(w.legacy_id) + 2) else s.id::text end,
    'exercise', e.name, 'catalogId', coalesce(e.source_ref, e.legacy_id, e.id::text),
    'catalogSource', case when e.user_id is null then 'MFD' else 'Custom' end, 'tracking', coalesce(we.tracking, e.tracking),
    'type', case s.set_type when 'drop' then 'dropset' else s.set_type end,
    -- the old group number is kept in the exercise's old id ("workout:group")
    'group', coalesce(case when we.legacy_id ~ ':\d+$' then substring(we.legacy_id from ':(\d+)$')::int end, we.position),
    'set', s.position + 1, 'kg', trim_scale(s.weight_kg), 'reps', s.reps, 'duration_seconds', s.duration_s, 'distance_meters', trim_scale(s.distance_m),
    'floors', s.floors, 'steps', s.steps, 'rpe', trim_scale(s.rpe), 'done', s.completed_at is not null,
    'mfdDoneAt', case when s.completed_at is distinct from w.ended_at then diary.epoch_ms(s.completed_at) end,
    'mfdSuggested', case when trim_scale(s.planned_weight_kg) is not null or s.planned_reps is not null
                      then jsonb_strip_nulls(jsonb_build_object('weightKg', trim_scale(s.planned_weight_kg), 'reps', s.planned_reps)) end,
    'mfdAi', case when s.planned_by_ai then true end,
    'superset_id', we.superset_group::text, 'notes', coalesce(we.notes, '')))
$$;

-- One workout as the columns hold it, without its sets.
create or replace function diary.workout_base(w diary.workouts) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', coalesce(w.legacy_id, w.id::text), 'name', w.name, 'date', w.local_date::text,
    'started', diary.epoch_ms(w.started_at), 'finished', diary.epoch_ms(w.ended_at),
    'routineId', (select coalesce(r.legacy_id, r.id::text) from diary.routines r where r.id = w.routine_id),
    'source', case when w.source = 'hevy_import' then 'hevy' end, 'importKey', w.import_key, 'importTimezone', w.time_zone, 'notes', w.notes,
    'addedBy', diary.added_by(w.ai_action_id),
    'heartRate', (select jsonb_build_object('interval', h.interval_s, 'bpm', to_jsonb(h.bpm), 'avg', h.avg_bpm, 'max', h.max_bpm,
                    'source', case h.source when 'watch' then 'watch' else 'health' end)
                  from diary.workout_heart_rate h where h.workout_id = w.id and h.deleted_at is null)))
$$;

-- Plans as the columns hold them, without their children.
create or replace function diary.routine_set_base(rs diary.routine_sets) returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('type', case rs.set_type when 'drop' then 'dropset' else rs.set_type end,
    'kg', trim_scale(rs.target_weight_kg), 'reps', rs.target_reps, 'duration_seconds', rs.target_duration_s, 'distance_meters', trim_scale(rs.target_distance_m)))
$$;
create or replace function diary.routine_exercise_base(re diary.routine_exercises, e diary.exercises) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name', e.name, 'catalogId', coalesce(e.source_ref, e.legacy_id, e.id::text),
    'catalogSource', case when e.user_id is null then 'MFD' else 'Custom' end,
    'rest', re.rest_s, 'notes', coalesce(re.notes, ''), 'superset_id', re.superset_group::text,
    'sets', (select count(*) from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null),
    'reps', (select rs.target_reps from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null and rs.set_type <> 'warmup' order by rs.position limit 1),
    'kg', (select trim_scale(rs.target_weight_kg) from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null and rs.set_type <> 'warmup' order by rs.position limit 1)))
$$;
create or replace function diary.routine_base(r diary.routines) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('id', coalesce(r.legacy_id, r.id::text), 'name', r.name,
    'folderId', (select coalesce(f.legacy_id, f.id::text) from diary.routine_folders f where f.id = r.folder_id),
    'addedBy', diary.added_by(r.ai_action_id)))
$$;
create or replace function diary.folder_base(f diary.routine_folders) returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', coalesce(f.legacy_id, f.id::text), 'name', f.name)
$$;
create or replace function diary.own_exercise_base(e diary.exercises) returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'tracking', e.tracking, 'source', 'custom')
$$;

-- Values that didn't fit, per person (for the check after filling; nothing is silently lost without a count).
create table if not exists diary.fill_problems (
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null,
  legacy_id text not null,
  detail   text not null,
  noted_at timestamptz not null default now(),
  primary key (user_id, kind, legacy_id, detail)
);
alter table diary.fill_problems enable row level security;
revoke all on diary.fill_problems from public, anon, authenticated;

-- A parent's extra and its list of children (sets, exercises, planned sets): a list rebuilt from rows needs nothing;
-- anything else (missing, not a list, or an empty list that rows can't stand for) is kept as it was.
create or replace function diary.children_extra(extra jsonb, orig jsonb, k text, empty_ok boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(orig->k) = 'array' and (empty_ok or jsonb_array_length(orig->k) > 0) then extra
    when orig ? k then extra || jsonb_build_object(k, orig->k)
    else extra || jsonb_build_object('$absent', coalesce(extra->'$absent', '[]'::jsonb) || to_jsonb(k)) end
$$;

-- What each item held that the columns don't rebuild exactly, and its place in its list ("extra", 03-training.sql),
-- so the tables give back exactly what the app stored. Only rows whose extra really changes are written.
create or replace function diary.fill_training_extras(u uuid, doc jsonb, only_workouts text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Workouts (in _w from fill_training) and their sets.
  with c as (
    select t.id, nullif(diary.children_extra(coalesce(diary.extra_of(_w.w - 'sets', diary.workout_base(t)), '{}'), _w.w, 'sets', true)
             || case when _w.pos is not null then jsonb_build_object('$pos', _w.pos) else '{}' end, '{}'::jsonb) extra
    from _w join diary.workouts t on t.id = diary.legacy_uuid(u, 'workout', _w.w->>'id'))
  update diary.workouts t set extra = c.extra from c where t.id = c.id and t.extra is distinct from c.extra;

  with c as (
    select t.id, coalesce(diary.extra_of(e.x, diary.set_base(t, we, ex, wo)), '{}') || jsonb_build_object('$pos', (e.n - 1)::int) extra
    from _w cross join lateral jsonb_array_elements(case when jsonb_typeof(_w.w->'sets') = 'array' then _w.w->'sets' else '[]' end) with ordinality e(x, n)
    join diary.workout_sets t on t.id = diary.legacy_uuid(u, 'workout_set', (_w.w->>'id') || ':' || coalesce(nullif(e.x->>'id', ''), e.n::text))
    join diary.workout_exercises we on we.id = t.workout_exercise_id
    join diary.exercises ex on ex.id = we.exercise_id
    join diary.workouts wo on wo.id = we.workout_id)
  update diary.workout_sets t set extra = c.extra from c where t.id = c.id and t.extra is distinct from c.extra;

  if only_workouts is not null then return; end if;

  -- Folders.
  with c as (
    select t.id, diary.extra_of(f, diary.folder_base(t)) extra
    from jsonb_array_elements(case when jsonb_typeof(doc->'folders') = 'array' then doc->'folders' else '[]' end) f
    join diary.routine_folders t on t.id = diary.legacy_uuid(u, 'folder', f->>'id'))
  update diary.routine_folders t set extra = c.extra from c where t.id = c.id and t.extra is distinct from c.extra;

  -- Routines, their exercises and planned sets.
  with c as (
    select t.id, nullif(diary.children_extra(coalesce(diary.extra_of(r - 'exercises', diary.routine_base(t)), '{}'), r, 'exercises', true), '{}'::jsonb) extra
    from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) r
    join diary.routines t on t.id = diary.legacy_uuid(u, 'routine', r->>'id'))
  update diary.routines t set extra = c.extra from c where t.id = c.id and t.extra is distinct from c.extra;

  -- (planned sets made from "N sets of reps × kg" aren't per-set details: an empty or missing list stays as it was)
  with c as (
    select t.id, nullif(diary.children_extra(coalesce(diary.extra_of(e - 'setDetails', diary.routine_exercise_base(t, ex)), '{}'), e, 'setDetails', false), '{}'::jsonb) extra
    from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) rt(r)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r->'exercises') = 'array' then r->'exercises' else '[]' end) with ordinality a(e, n)
    join diary.routine_exercises t on t.id = diary.legacy_uuid(u, 'routine_exercise', (r->>'id') || ':' || (n - 1))
    join diary.exercises ex on ex.id = t.exercise_id)
  update diary.routine_exercises t set extra = c.extra from c where t.id = c.id and t.extra is distinct from c.extra;

  with c as (
    select t.id, diary.extra_of(d, diary.routine_set_base(t)) extra
    from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) rt(r)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r->'exercises') = 'array' then r->'exercises' else '[]' end) with ordinality a(e, n)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e->'setDetails') = 'array' then e->'setDetails' else '[]' end) with ordinality s(d, k)
    join diary.routine_sets t on t.id = diary.legacy_uuid(u, 'routine_set', (r->>'id') || ':' || (n - 1) || ':' || (k - 1)))
  update diary.routine_sets t set extra = c.extra from c where t.id = c.id and t.extra is distinct from c.extra;

  -- Own exercises: the ones listed in "My exercises" keep their place; the others are marked as not listed.
  with src as (
    select distinct on (lower(btrim(e->>'name'))) diary.legacy_uuid(u, 'exercise', lower(btrim(e->>'name'))) id, e o, (n - 1)::int pos
    from jsonb_array_elements(case when jsonb_typeof(doc->'mfdExercises') = 'array' then doc->'mfdExercises' else '[]' end) with ordinality a(e, n)
    where coalesce(btrim(e->>'name'), '') <> '' order by lower(btrim(e->>'name')), n),
  c as (
    select t.id, coalesce(diary.extra_of(src.o, diary.own_exercise_base(t)), '{}') || jsonb_build_object('$pos', src.pos) extra
    from src join diary.exercises t on t.id = src.id and t.user_id = u
    union all
    select t.id, '{"$pos": null}'::jsonb from diary.exercises t where t.user_id = u and t.deleted_at is null and t.id not in (select id from src))
  update diary.exercises t set extra = c.extra from c where t.id = c.id and t.extra is distinct from c.extra;
end $$;
revoke all on function diary.fill_training_extras(uuid, jsonb, text[]) from public, anon, authenticated;

create or replace function diary.fill_training(u uuid, only_workouts text[] default null) returns void
language plpgsql security definer set search_path = '' as $$
declare doc jsonb; now_ts timestamptz := now();
begin
  select payload into doc from public.forma_workspaces where user_id = u;
  if doc is null then return; end if;

  -- ── Every exercise the diary refers to: built-in by library id, otherwise the person's own (one per name) ──
  create temporary table if not exists _refs (ref text, name text, tracking text) on commit drop;
  truncate _refs;
  insert into _refs
    select x->>'catalogId', btrim(coalesce(x->>'exercise', x->>'name')), x->>'tracking'
    from jsonb_array_elements(case when jsonb_typeof(doc->'sessions') = 'array' then doc->'sessions' else '[]' end) s,
         jsonb_array_elements(case when jsonb_typeof(s->'sets') = 'array' then s->'sets' else '[]' end) x
    where only_workouts is null or s->>'id' = any(only_workouts)
    union all
    select x->>'catalogId', btrim(coalesce(x->>'exercise', x->>'name')), x->>'tracking'
    from jsonb_array_elements(case when jsonb_typeof(doc->'active'->'sets') = 'array' then doc->'active'->'sets' else '[]' end) x
    union all
    select r->>'catalogId', btrim(r->>'name'), coalesce(r->>'tracking', r->'setDetails'->0->>'tracking')
    from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) rt,
         jsonb_array_elements(case when jsonb_typeof(rt->'exercises') = 'array' then rt->'exercises' else '[]' end) r
    where only_workouts is null
    union all
    -- Exercises the person made themselves are kept even when unused (auto-made "history" ones only when used).
    select e->>'id', btrim(e->>'name'), e->>'tracking'
    from jsonb_array_elements(case when jsonb_typeof(doc->'mfdExercises') = 'array' then doc->'mfdExercises' else '[]' end) e
    where e->>'id' like 'custom:%';

  -- Own exercises: names from the person's own list when it has one for that id.
  -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.exercises t
  using (
  select distinct on (lower(nm))
    diary.legacy_uuid(u, 'exercise', lower(nm)), u, 'custom', left(nm, 120),
    case when trk in ('weight_reps', 'reps', 'weighted_bodyweight', 'assisted_bodyweight', 'time', 'weight_time', 'distance_time', 'weight_distance', 'floors_time', 'steps_time') then trk else 'weight_reps' end,
    ref
  from (
    select r.ref, coalesce(nullif(btrim(own->>'name'), ''), r.name, 'Exercise') nm, coalesce(own->>'tracking', r.tracking) trk
    from _refs r
    left join lateral (select e from jsonb_array_elements(case when jsonb_typeof(doc->'mfdExercises') = 'array' then doc->'mfdExercises' else '[]' end) e where e->>'id' = r.ref limit 1) o(own) on true
    where not exists (select 1 from diary.exercises b where b.user_id is null and b.source = 'mfd' and b.source_ref = r.ref)
  ) x
  order by lower(nm), ref
  ) s(id, user_id, source, name, tracking, legacy_id)
  on t.id = s.id
  when not matched then insert (id, user_id, source, name, tracking, legacy_id) values (s.id, s.user_id, s.source, s.name, s.tracking, s.legacy_id);

  -- ── Folders (whole list) ──
  if only_workouts is null then
    -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.routine_folders t
  using (
    select diary.legacy_uuid(u, 'folder', f->>'id'), u, left(btrim(f->>'name'), 40), (n - 1)::int, f->>'id'
    from jsonb_array_elements(case when jsonb_typeof(doc->'folders') = 'array' then doc->'folders' else '[]' end) with ordinality a(f, n)
    where coalesce(btrim(f->>'name'), '') <> ''
  ) s(id, user_id, name, position, legacy_id)
  on t.id = s.id
  when matched and (t.name, t.position, t.deleted_at)
      is distinct from (s.name, s.position, null::timestamptz)
    then update set name = s.name, position = s.position, deleted_at = null
  when not matched then insert (id, user_id, name, position, legacy_id) values (s.id, s.user_id, s.name, s.position, s.legacy_id);
    update diary.routine_folders set deleted_at = now_ts
      where user_id = u and deleted_at is null and legacy_id is not null
        and legacy_id not in (select f->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'folders') = 'array' then doc->'folders' else '[]' end) f);

    -- ── Routines, their exercises and planned sets ──
    -- Routines an assistant created: their ai_actions rows first, so the link below has something to point to.
    perform diary.note_ai(u, 'create_routine', (select jsonb_agg(jsonb_build_object('key', r->>'id', 'by', r->'addedBy'))
      from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) r where r ? 'addedBy'));
    -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
    merge into diary.routines t
  using (
    select diary.legacy_uuid(u, 'routine', r->>'id'), u,
      case when exists (select 1 from diary.routine_folders f where f.id = diary.legacy_uuid(u, 'folder', r->>'folderId') and f.deleted_at is null) then diary.legacy_uuid(u, 'folder', r->>'folderId') end,
      left(btrim(r->>'name'), 80), (n - 1)::int,
      case when r ? 'addedBy' then diary.legacy_uuid(u, 'ai_action', 'create_routine:' || (r->>'id')) end, r->>'id'
    from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) with ordinality a(r, n)
    where coalesce(btrim(r->>'name'), '') <> ''
  ) s(id, user_id, folder_id, name, position, ai_action_id, legacy_id)
  on t.id = s.id
  when matched and (t.folder_id, t.name, t.position, t.ai_action_id, t.deleted_at)
      is distinct from (s.folder_id, s.name, s.position, s.ai_action_id, null::timestamptz)
    then update set folder_id = s.folder_id, name = s.name, position = s.position, ai_action_id = s.ai_action_id, deleted_at = null
  when not matched then insert (id, user_id, folder_id, name, position, ai_action_id, legacy_id) values (s.id, s.user_id, s.folder_id, s.name, s.position, s.ai_action_id, s.legacy_id);
    update diary.routines set deleted_at = now_ts
      where user_id = u and deleted_at is null and legacy_id is not null
        and legacy_id not in (select r->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) r);

    -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.routine_exercises t
  using (
    select diary.legacy_uuid(u, 'routine_exercise', (r->>'id') || ':' || (n - 1)), u, diary.legacy_uuid(u, 'routine', r->>'id'),
      coalesce((select b.id from diary.exercises b where b.user_id is null and b.source = 'mfd' and b.source_ref = e->>'catalogId'),
               diary.legacy_uuid(u, 'exercise', lower(coalesce(nullif(btrim(own->>'name'), ''), btrim(e->>'name'), 'Exercise')))),
      (n - 1)::int, coalesce(diary.within(round(diary.num(e->'rest')), 0, 900), 90)::int,
      case when nullif(e->>'superset_id', '') is not null then dense_rank() over (partition by r->>'id' order by (e->>'superset_id')) - 1 end,
      nullif(left(btrim(coalesce(e->>'notes', '')), 300), ''), (r->>'id') || ':' || (n - 1)
    from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) rt(r),
         jsonb_array_elements(case when jsonb_typeof(r->'exercises') = 'array' then r->'exercises' else '[]' end) with ordinality a(e, n)
         left join lateral (select x from jsonb_array_elements(case when jsonb_typeof(doc->'mfdExercises') = 'array' then doc->'mfdExercises' else '[]' end) x where x->>'id' = e->>'catalogId' limit 1) o(own) on true
    where coalesce(btrim(r->>'name'), '') <> ''
  ) s(id, user_id, routine_id, exercise_id, position, rest_s, superset_group, notes, legacy_id)
  on t.id = s.id
  when matched and (t.routine_id, t.exercise_id, t.position, t.rest_s, t.superset_group, t.notes, t.deleted_at)
      is distinct from (s.routine_id, s.exercise_id, s.position, s.rest_s, s.superset_group, s.notes, null::timestamptz)
    then update set exercise_id = s.exercise_id, position = s.position, rest_s = s.rest_s, superset_group = s.superset_group, notes = s.notes, deleted_at = null
  when not matched then insert (id, user_id, routine_id, exercise_id, position, rest_s, superset_group, notes, legacy_id) values (s.id, s.user_id, s.routine_id, s.exercise_id, s.position, s.rest_s, s.superset_group, s.notes, s.legacy_id);
    update diary.routine_exercises x set deleted_at = now_ts
      where x.user_id = u and x.deleted_at is null and x.legacy_id is not null and x.legacy_id not in (
        select (r->>'id') || ':' || (n - 1) from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) rt(r),
          jsonb_array_elements(case when jsonb_typeof(r->'exercises') = 'array' then r->'exercises' else '[]' end) with ordinality a(e, n));

    -- Planned sets: the routine's per-set details, or "N sets of reps × kg" from older routines.
    -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.routine_sets t
  using (
    select diary.legacy_uuid(u, 'routine_set', rex || ':' || (k - 1)), u, diary.legacy_uuid(u, 'routine_exercise', rex), (k - 1)::int,
      case d->>'type' when 'warmup' then 'warmup' when 'failure' then 'failure' when 'dropset' then 'drop' when 'drop' then 'drop' else 'normal' end,
      diary.within(diary.num(d->'kg'), 0, 1000), diary.within(round(diary.num(d->'reps')), 0, 1000)::int,
      diary.within(round(diary.num(d->'duration_seconds')), 0, 86400)::int, diary.within(diary.num(d->'distance_meters'), 0, 1000000),
      rex || ':' || (k - 1)
    from (
      select (r->>'id') || ':' || (n - 1) rex,
        case when jsonb_typeof(e->'setDetails') = 'array' and jsonb_array_length(e->'setDetails') > 0 then e->'setDetails'
             -- (i makes the aggregate belong to this sub-query, not to the outer one)
             else (select coalesce(jsonb_agg(jsonb_build_object('kg', e->'kg', 'reps', e->'reps', 'i', i)), '[]') from generate_series(1, least(coalesce(diary.num(e->'sets'), 0), 50)::int) i) end details
      from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) rt(r),
           jsonb_array_elements(case when jsonb_typeof(r->'exercises') = 'array' then r->'exercises' else '[]' end) with ordinality a(e, n)
      where coalesce(btrim(r->>'name'), '') <> ''
    ) p, jsonb_array_elements(p.details) with ordinality s(d, k)
  ) s(id, user_id, routine_exercise_id, position, set_type, target_weight_kg, target_reps, target_duration_s, target_distance_m, legacy_id)
  on t.id = s.id
  when matched and (t.routine_exercise_id, t.position, t.set_type, t.target_weight_kg, t.target_reps, t.target_duration_s, t.target_distance_m, t.deleted_at)
      is distinct from (s.routine_exercise_id, s.position, s.set_type, s.target_weight_kg, s.target_reps, s.target_duration_s, s.target_distance_m, null::timestamptz)
    then update set set_type = s.set_type, target_weight_kg = s.target_weight_kg, target_reps = s.target_reps, target_duration_s = s.target_duration_s, target_distance_m = s.target_distance_m, deleted_at = null
  when not matched then insert (id, user_id, routine_exercise_id, position, set_type, target_weight_kg, target_reps, target_duration_s, target_distance_m, legacy_id) values (s.id, s.user_id, s.routine_exercise_id, s.position, s.set_type, s.target_weight_kg, s.target_reps, s.target_duration_s, s.target_distance_m, s.legacy_id);
    update diary.routine_sets x set deleted_at = now_ts
      where x.user_id = u and x.deleted_at is null and x.legacy_id is not null and x.legacy_id not in (
        select p.rex || ':' || (k - 1)
        from (
          select (r->>'id') || ':' || (n - 1) rex,
            case when jsonb_typeof(e->'setDetails') = 'array' and jsonb_array_length(e->'setDetails') > 0 then jsonb_array_length(e->'setDetails')
                 else least(coalesce(diary.num(e->'sets'), 0), 50)::int end cnt
          from jsonb_array_elements(case when jsonb_typeof(doc->'routines') = 'array' then doc->'routines' else '[]' end) rt(r),
               jsonb_array_elements(case when jsonb_typeof(r->'exercises') = 'array' then r->'exercises' else '[]' end) with ordinality a(e, n)
          where coalesce(btrim(r->>'name'), '') <> ''
        ) p, generate_series(1, greatest(p.cnt, 0)) k);
  end if;

  -- ── Workouts: finished ones, plus the running one ("active") ──
  drop table if exists _w;
  create temporary table _w (w jsonb, running boolean, pos int) on commit drop;
  insert into _w
    select s, false, (n - 1)::int from jsonb_array_elements(case when jsonb_typeof(doc->'sessions') = 'array' then doc->'sessions' else '[]' end) with ordinality a(s, n)
    where coalesce(s->>'id', '') <> '' and (only_workouts is null or s->>'id' = any(only_workouts));
  if jsonb_typeof(doc->'active') = 'object' and coalesce(doc->'active'->>'id', '') <> '' and (only_workouts is null or doc->'active'->>'id' = any(only_workouts)) then
    insert into _w values (doc->'active', true, null);
  end if;

  perform diary.note_ai(u, 'log_workout', (select jsonb_agg(jsonb_build_object('key', w->>'id', 'by', w->'addedBy')) from _w where w ? 'addedBy'));
  -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.workouts t
  using (
  select diary.legacy_uuid(u, 'workout', w->>'id'), u,
    case when exists (select 1 from diary.routines r where r.id = diary.legacy_uuid(u, 'routine', w->>'routineId') and r.deleted_at is null) then diary.legacy_uuid(u, 'routine', w->>'routineId') end,
    left(coalesce(nullif(btrim(w->>'name'), ''), 'Workout'), 80),
    coalesce(diary.day(w->>'date'), (coalesce(diary.ms(w->'started'), now_ts))::date),
    coalesce(diary.ms(w->'started'), coalesce(diary.day(w->>'date'), now_ts::date)::timestamptz + interval '12 hours'),
    case when running then null else greatest(coalesce(diary.ms(w->'finished'), diary.ms(w->'started'), coalesce(diary.day(w->>'date'), now_ts::date)::timestamptz + interval '12 hours'), coalesce(diary.ms(w->'started'), coalesce(diary.day(w->>'date'), now_ts::date)::timestamptz + interval '12 hours')) end,
    nullif(left(w->>'importTimezone', 64), ''),
    case when w->>'source' = 'hevy' or w ? 'importKey' then 'hevy_import' when w ? 'addedBy' then 'ai' else 'app' end,
    nullif(left(w->>'importKey', 200), ''), nullif(left(btrim(coalesce(w->>'notes', '')), 2000), ''),
    case when w ? 'addedBy' then diary.legacy_uuid(u, 'ai_action', 'log_workout:' || (w->>'id')) end, w->>'id'
  from _w
  ) s(id, user_id, routine_id, name, local_date, started_at, ended_at, time_zone, source, import_key, notes, ai_action_id, legacy_id)
  on t.id = s.id
  when matched and (t.routine_id, t.name, t.local_date, t.started_at, t.ended_at, t.time_zone, t.source, t.import_key, t.notes, t.ai_action_id, t.deleted_at)
      is distinct from (s.routine_id, s.name, s.local_date, s.started_at, s.ended_at, s.time_zone, s.source, s.import_key, s.notes, s.ai_action_id, null::timestamptz)
    then update set routine_id = s.routine_id, name = s.name, local_date = s.local_date, started_at = s.started_at, ended_at = s.ended_at, time_zone = s.time_zone, source = s.source, import_key = s.import_key, notes = s.notes, ai_action_id = s.ai_action_id, deleted_at = null
  when not matched then insert (id, user_id, routine_id, name, local_date, started_at, ended_at, time_zone, source, import_key, notes, ai_action_id, legacy_id) values (s.id, s.user_id, s.routine_id, s.name, s.local_date, s.started_at, s.ended_at, s.time_zone, s.source, s.import_key, s.notes, s.ai_action_id, s.legacy_id);

  -- Workouts no longer in the envelope (deleted, or the running one finished under a new id).
  update diary.workouts set deleted_at = now_ts
    where user_id = u and deleted_at is null and legacy_id is not null
      and (only_workouts is null or legacy_id = any(only_workouts))
      and legacy_id not in (select w->>'id' from _w);

  -- One workout exercise per group of sets ("group" in the old sets), in group order.
  create temporary table if not exists _g (wid uuid, wlegacy text, running boolean, grp int, pos int, first jsonb, rest jsonb, superset text) on commit drop;
  truncate _g;
  insert into _g
    select diary.legacy_uuid(u, 'workout', w->>'id'), w->>'id', running, g.grp, (dense_rank() over (partition by w->>'id' order by g.grp) - 1)::int, g.first,
      w->'rest'->(g.grp::text), g.first->>'superset_id'
    from _w, lateral (
      select coalesce(diary.num(x->'group'), 0)::int grp, (array_agg(x order by coalesce(diary.num(x->'set'), n)))[1] first
      from jsonb_array_elements(case when jsonb_typeof(w->'sets') = 'array' then w->'sets' else '[]' end) with ordinality e(x, n)
      group by 1) g;

  -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.workout_exercises t
  using (
  select diary.legacy_uuid(u, 'workout_exercise', wlegacy || ':' || grp), u, wid,
    coalesce((select b.id from diary.exercises b where b.user_id is null and b.source = 'mfd' and b.source_ref = first->>'catalogId'),
             diary.legacy_uuid(u, 'exercise', lower(coalesce(nullif(btrim(own->>'name'), ''), btrim(first->>'exercise'), 'Exercise')))),
    pos, coalesce(diary.within(round(diary.num(rest->'duration')), 0, 900), 90)::int,
    case when nullif(superset, '') is not null then dense_rank() over (partition by wid order by superset) - 1 end,
    nullif(left(btrim(coalesce(first->>'notes', '')), 300), ''),
    case when running then diary.ms(rest->'end') end,
    case when first->>'tracking' in ('weight_reps', 'reps', 'weighted_bodyweight', 'assisted_bodyweight', 'time', 'weight_time', 'distance_time', 'weight_distance', 'floors_time', 'steps_time', 'duration', 'distance_duration') then first->>'tracking' end, wlegacy || ':' || grp
  from _g left join lateral (select x from jsonb_array_elements(case when jsonb_typeof(doc->'mfdExercises') = 'array' then doc->'mfdExercises' else '[]' end) x where x->>'id' = first->>'catalogId' limit 1) o(own) on true
  ) s(id, user_id, workout_id, exercise_id, position, rest_s, superset_group, notes, rest_ends_at, tracking, legacy_id)
  on t.id = s.id
  when matched and (t.workout_id, t.exercise_id, t.position, t.rest_s, t.superset_group, t.notes, t.rest_ends_at, t.tracking, t.deleted_at)
      is distinct from (s.workout_id, s.exercise_id, s.position, s.rest_s, s.superset_group, s.notes, s.rest_ends_at, s.tracking, null::timestamptz)
    then update set exercise_id = s.exercise_id, position = s.position, rest_s = s.rest_s, superset_group = s.superset_group, notes = s.notes, rest_ends_at = s.rest_ends_at, tracking = s.tracking, deleted_at = null
  when not matched then insert (id, user_id, workout_id, exercise_id, position, rest_s, superset_group, notes, rest_ends_at, tracking, legacy_id) values (s.id, s.user_id, s.workout_id, s.exercise_id, s.position, s.rest_s, s.superset_group, s.notes, s.rest_ends_at, s.tracking, s.legacy_id);
  update diary.workout_exercises x set deleted_at = now_ts
    where x.user_id = u and x.deleted_at is null and x.legacy_id is not null
      and split_part(x.legacy_id, ':', 1) in (select w->>'id' from _w)
      and x.legacy_id not in (select wlegacy || ':' || grp from _g);

  -- Sets. A ticked set is completed when it was ticked (mfdDoneAt), or at the workout's end for older entries.
  -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.workout_sets t
  using (
  select diary.legacy_uuid(u, 'workout_set', (w->>'id') || ':' || coalesce(nullif(x->>'id', ''), n::text)), u,
    diary.legacy_uuid(u, 'workout_exercise', (w->>'id') || ':' || coalesce(diary.num(x->'group'), 0)::int),
    (row_number() over (partition by w->>'id', coalesce(diary.num(x->'group'), 0)::int order by coalesce(diary.num(x->'set'), n), n) - 1)::int,
    case x->>'type' when 'warmup' then 'warmup' when 'failure' then 'failure' when 'dropset' then 'drop' when 'drop' then 'drop' else 'normal' end,
    diary.within(diary.num(x->'kg'), 0, 1000), diary.within(round(diary.num(x->'reps')), 0, 1000)::int,
    diary.within(round(diary.num(x->'duration_seconds')), 0, 86400)::int, diary.within(diary.num(x->'distance_meters'), 0, 1000000),
    diary.within(round(diary.num(x->'floors')), 0, 10000)::int, diary.within(round(diary.num(x->'steps')), 0, 1000000)::int,
    diary.within(diary.num(x->'rpe'), 1, 10),
    -- the app stores the target weight as weightKg (older entries: kg)
    diary.within(diary.num(coalesce(x->'mfdSuggested'->'weightKg', x->'mfdSuggested'->'kg')), 0, 1000), diary.within(round(diary.num(x->'mfdSuggested'->'reps')), 0, 1000)::int,
    coalesce((x->>'mfdAi')::boolean, false),
    case when x->>'done' = 'false' or (running and x->>'done' is distinct from 'true') then null
         else coalesce(diary.ms(x->'mfdDoneAt'), diary.ms(w->'finished'), diary.ms(w->'started'), coalesce(diary.day(w->>'date'), now_ts::date)::timestamptz + interval '12 hours') end,
    (w->>'id') || ':' || coalesce(nullif(x->>'id', ''), n::text)
  from _w, jsonb_array_elements(case when jsonb_typeof(w->'sets') = 'array' then w->'sets' else '[]' end) with ordinality e(x, n)
  ) s(id, user_id, workout_exercise_id, position, set_type, weight_kg, reps, duration_s, distance_m, floors, steps, rpe, planned_weight_kg, planned_reps, planned_by_ai, completed_at, legacy_id)
  on t.id = s.id
  when matched and (t.workout_exercise_id, t.position, t.set_type, t.weight_kg, t.reps, t.duration_s, t.distance_m, t.floors, t.steps, t.rpe, t.planned_weight_kg, t.planned_reps, t.planned_by_ai, t.completed_at, t.deleted_at)
      is distinct from (s.workout_exercise_id, s.position, s.set_type, s.weight_kg, s.reps, s.duration_s, s.distance_m, s.floors, s.steps, s.rpe, s.planned_weight_kg, s.planned_reps, s.planned_by_ai, s.completed_at, null::timestamptz)
    then update set workout_exercise_id = s.workout_exercise_id, position = s.position, set_type = s.set_type, weight_kg = s.weight_kg, reps = s.reps, duration_s = s.duration_s, distance_m = s.distance_m, floors = s.floors, steps = s.steps, rpe = s.rpe, planned_weight_kg = s.planned_weight_kg, planned_reps = s.planned_reps, planned_by_ai = s.planned_by_ai, completed_at = s.completed_at, deleted_at = null
  when not matched then insert (id, user_id, workout_exercise_id, position, set_type, weight_kg, reps, duration_s, distance_m, floors, steps, rpe, planned_weight_kg, planned_reps, planned_by_ai, completed_at, legacy_id) values (s.id, s.user_id, s.workout_exercise_id, s.position, s.set_type, s.weight_kg, s.reps, s.duration_s, s.distance_m, s.floors, s.steps, s.rpe, s.planned_weight_kg, s.planned_reps, s.planned_by_ai, s.completed_at, s.legacy_id);
  update diary.workout_sets x set deleted_at = now_ts
    where x.user_id = u and x.deleted_at is null and x.legacy_id is not null
      and split_part(x.legacy_id, ':', 1) in (select w->>'id' from _w)
      and x.legacy_id not in (select (w->>'id') || ':' || coalesce(nullif(x2->>'id', ''), n::text)
        from _w, jsonb_array_elements(case when jsonb_typeof(w->'sets') = 'array' then w->'sets' else '[]' end) with ordinality e(x2, n));

  -- Values the new rules refused: counted, so the check can show them (the old envelope still has the originals).
  insert into diary.fill_problems (user_id, kind, legacy_id, detail)
  select u, 'workout_set', (w->>'id') || ':' || coalesce(nullif(x->>'id', ''), n::text), k
  from _w, jsonb_array_elements(case when jsonb_typeof(w->'sets') = 'array' then w->'sets' else '[]' end) with ordinality e(x, n),
    lateral (values ('kg', diary.num(x->'kg'), 0, 1000), ('reps', diary.num(x->'reps'), 0, 1000), ('duration_seconds', diary.num(x->'duration_seconds'), 0, 86400),
                    ('distance_meters', diary.num(x->'distance_meters'), 0, 1000000), ('rpe', diary.num(x->'rpe'), 1, 10)) v(k, val, lo, hi)
  where v.val is not null and v.val not between v.lo and v.hi
  on conflict do nothing;

  -- Heart rate recorded with a workout.
  -- MERGE runs the stamp trigger only for rows that are really added or changed, so sync numbers stay exact.
  merge into diary.workout_heart_rate t
  using (
  select diary.legacy_uuid(u, 'workout', w->>'id'), u, case when w->'heartRate'->>'source' = 'watch' then 'watch' else 'health_connect' end,
    coalesce(diary.within(diary.num(w->'heartRate'->'interval'), 1, 300), 15)::smallint,
    (select array_agg(least(greatest(coalesce(diary.num(b), 0), 0), 250)::smallint order by i) from jsonb_array_elements(w->'heartRate'->'bpm') with ordinality h(b, i)),
    diary.within(round(diary.num(w->'heartRate'->'avg')), 30, 250)::smallint, diary.within(round(diary.num(w->'heartRate'->'max')), 30, 250)::smallint
  from _w where jsonb_typeof(w->'heartRate') = 'object' and jsonb_typeof(w->'heartRate'->'bpm') = 'array' and jsonb_array_length(w->'heartRate'->'bpm') between 1 and 5000
  ) s(workout_id, user_id, source, interval_s, bpm, avg_bpm, max_bpm)
  on t.workout_id = s.workout_id
  when matched and (t.source, t.interval_s, t.bpm, t.avg_bpm, t.max_bpm, t.deleted_at)
      is distinct from (s.source, s.interval_s, s.bpm, s.avg_bpm, s.max_bpm, null::timestamptz)
    then update set source = s.source, interval_s = s.interval_s, bpm = s.bpm, avg_bpm = s.avg_bpm, max_bpm = s.max_bpm, deleted_at = null
  when not matched then insert (workout_id, user_id, source, interval_s, bpm, avg_bpm, max_bpm) values (s.workout_id, s.user_id, s.source, s.interval_s, s.bpm, s.avg_bpm, s.max_bpm);

  perform diary.fill_training_extras(u, doc, only_workouts);
end $$;
revoke all on function diary.fill_training(uuid, text[]) from public, anon, authenticated;

-- After every save of the envelope: redo only the workouts that changed (plus plans and the running workout when
-- those changed). Comparing old and new per workout keeps a save that ticks one set from touching 400 workouts.
create or replace function diary.follow_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
declare changed text[];
begin
  -- Filling the tables must never stop the app's save: any error is written down and the save goes through.
  begin
  if tg_op = 'INSERT' then perform diary.fill_training(new.user_id); return null; end if;
  if new.payload is not distinct from old.payload then return null; end if;
  -- Fast exit: food, weight, settings… nothing in training changed.
  if (old.payload->'sessions', old.payload->'active', old.payload->'folders', old.payload->'routines', old.payload->'mfdExercises')
     is not distinct from (new.payload->'sessions', new.payload->'active', new.payload->'folders', new.payload->'routines', new.payload->'mfdExercises') then
    return null;
  end if;
  if (old.payload->'folders', old.payload->'routines', old.payload->'mfdExercises') is distinct from (new.payload->'folders', new.payload->'routines', new.payload->'mfdExercises') then
    perform diary.fill_training(new.user_id);           -- plans changed: redo everything (small diaries of plans)
    return null;
  end if;
  select array_agg(id) into changed from (
    select coalesce(n.s->>'id', o.s->>'id') id
    from (select s from jsonb_array_elements(case when jsonb_typeof(new.payload->'sessions') = 'array' then new.payload->'sessions' else '[]' end) s) n
    full join (select s from jsonb_array_elements(case when jsonb_typeof(old.payload->'sessions') = 'array' then old.payload->'sessions' else '[]' end) s) o on n.s->>'id' = o.s->>'id'
    where n.s is distinct from o.s
    union
    select x->>'id' from (values (old.payload->'active'), (new.payload->'active')) a(x)
    where (old.payload->'active') is distinct from (new.payload->'active') and jsonb_typeof(x) = 'object' and x->>'id' is not null
  ) c where id is not null;
  if changed is not null then perform diary.fill_training(new.user_id, changed); end if;
  exception when others then
    insert into diary.fill_problems (user_id, kind, legacy_id, detail)
    values (new.user_id, 'error', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'), left(sqlerrm, 500)) on conflict do nothing;
  end;
  return null;
end $$;
revoke all on function diary.follow_workspace() from public, anon, authenticated;

-- Triggers on one event run in name order: diary_1_training, diary_2_nutrition, diary_3_body, diary_4_account.
drop trigger if exists follow_workspace on public.forma_workspaces;
drop trigger if exists diary_1_training on public.forma_workspaces;
create trigger diary_1_training after insert or update of payload on public.forma_workspaces
  for each row execute function diary.follow_workspace();

commit;
