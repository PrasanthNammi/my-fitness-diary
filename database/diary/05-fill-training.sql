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
  create temporary table if not exists _w (w jsonb, running boolean) on commit drop;
  truncate _w;
  insert into _w
    select s, false from jsonb_array_elements(case when jsonb_typeof(doc->'sessions') = 'array' then doc->'sessions' else '[]' end) s
    where coalesce(s->>'id', '') <> '' and (only_workouts is null or s->>'id' = any(only_workouts));
  if jsonb_typeof(doc->'active') = 'object' and coalesce(doc->'active'->>'id', '') <> '' and (only_workouts is null or doc->'active'->>'id' = any(only_workouts)) then
    insert into _w values (doc->'active', true);
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
    diary.within(diary.num(x->'mfdSuggested'->'kg'), 0, 1000), diary.within(round(diary.num(x->'mfdSuggested'->'reps')), 0, 1000)::int,
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
