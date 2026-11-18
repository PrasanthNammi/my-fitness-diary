-- MFD 3.0 database, part 12: reading the diary back from the tables.
--
--   diary.as_envelope(person)   the person's diary rebuilt from the tables in the shape the app, the connector and the
--                               Friends feed read today (the old JSON document). Readers can switch to the tables one
--                               by one without changing how they read. Ids are the old ones where an entry has one.
--   diary.changes_since(n)      every row of the caller's that changed after sync number n, per table, and the
--                               newest number, so a phone only downloads what changed.
--
-- What the old document held but the tables deliberately don't (device-only or leftovers of the old format) is left
-- out: the coach chat, AI coach settings, hidden AI items, folder open/closed, import bookkeeping on sets
-- (legacyCatalogId, sourceSetIndex), the 'Hevy' label on a few imported sets, a rest timer's saved end.
--
-- Run after 11-fill-account.sql. Safe to re-run. Changes no data.
begin;

create or replace function diary.epoch_ms(t timestamptz) returns bigint language sql immutable set search_path = '' as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

-- An assistant's mark as the old document stored it: {connection, at, request}.
create or replace function diary.added_by(action_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('connection', a.connection, 'at', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'request', a.request_id))
  from diary.ai_actions a where a.id = action_id
$$;

-- A food label in the old shape (per basis amount).
create or replace function diary.label_json(f diary.foods) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('id', coalesce(f.legacy_id, f.id::text), 'name', f.name, 'brand', f.brand, 'barcode', f.barcode,
    'basis', f.basis_amount, 'unit', f.basis_unit, 'servingSize', f.serving_size, 'servingLabel', f.serving_label,
    'cal', f.kcal, 'p', f.protein_g, 'c', f.carbs_g, 'f', f.fat_g, 'fiber', f.fibre_g, 'sugar', f.sugars_g, 'saturates', f.saturated_fat_g,
    'salt', f.salt_g, 'ingredients', f.ingredients, 'notes', f.notes, 'source', f.source))
$$;

-- One workout (finished or running) in the old shape.
create or replace function diary.workout_json(w diary.workouts) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', coalesce(w.legacy_id, w.id::text), 'name', w.name, 'date', w.local_date::text,
    'started', diary.epoch_ms(w.started_at), 'finished', diary.epoch_ms(w.ended_at),
    'routineId', (select coalesce(r.legacy_id, r.id::text) from diary.routines r where r.id = w.routine_id),
    'source', case when w.source = 'hevy_import' then 'hevy' end, 'importKey', w.import_key, 'importTimezone', w.time_zone, 'notes', w.notes,
    'addedBy', diary.added_by(w.ai_action_id),
    'heartRate', (select jsonb_build_object('interval', h.interval_s, 'bpm', to_jsonb(h.bpm), 'avg', h.avg_bpm, 'max', h.max_bpm,
                    'source', case h.source when 'watch' then 'watch' else 'health' end)
                  from diary.workout_heart_rate h where h.workout_id = w.id and h.deleted_at is null),
    'sets', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', case when starts_with(s.legacy_id, w.legacy_id || ':') then substr(s.legacy_id, length(w.legacy_id) + 2) else s.id::text end,
        'exercise', e.name, 'catalogId', coalesce(e.source_ref, e.legacy_id, e.id::text),
        'catalogSource', case when e.user_id is null then 'MFD' else 'Custom' end, 'tracking', e.tracking,
        'type', case s.set_type when 'drop' then 'dropset' else s.set_type end,
        -- the old group number is kept in the exercise's old id ("workout:group")
        'group', coalesce(case when we.legacy_id ~ ':\d+$' then substring(we.legacy_id from ':(\d+)$')::int end, we.position),
        'set', s.position + 1, 'kg', s.weight_kg, 'reps', s.reps, 'duration_seconds', s.duration_s, 'distance_meters', s.distance_m,
        'floors', s.floors, 'steps', s.steps, 'rpe', s.rpe, 'done', s.completed_at is not null,
        'mfdDoneAt', case when s.completed_at is distinct from w.ended_at then diary.epoch_ms(s.completed_at) end,
        'mfdSuggested', case when s.planned_weight_kg is not null or s.planned_reps is not null
                          then jsonb_strip_nulls(jsonb_build_object('kg', s.planned_weight_kg, 'reps', s.planned_reps)) end,
        'mfdAi', case when s.planned_by_ai then true end,
        'superset_id', we.superset_group::text, 'notes', coalesce(we.notes, '')))
        order by we.position, s.position)
      from diary.workout_exercises we
      join diary.workout_sets s on s.workout_exercise_id = we.id and s.deleted_at is null
      join diary.exercises e on e.id = we.exercise_id
      where we.workout_id = w.id and we.deleted_at is null), '[]')))
$$;

create or replace function diary.as_envelope(u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(diary.workout_json(w) order by w.started_at, w.id)
                          from diary.workouts w where w.user_id = u and w.deleted_at is null and w.ended_at is not null), '[]'),
    'active', (select diary.workout_json(w) from diary.workouts w where w.user_id = u and w.deleted_at is null and w.ended_at is null limit 1),
    'folders', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(f.legacy_id, f.id::text), 'name', f.name) order by f.position, f.id)
                         from diary.routine_folders f where f.user_id = u and f.deleted_at is null), '[]'),
    'routines', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(r.legacy_id, r.id::text), 'name', r.name,
        'folderId', (select coalesce(f.legacy_id, f.id::text) from diary.routine_folders f where f.id = r.folder_id),
        'addedBy', diary.added_by(r.ai_action_id),
        'exercises', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'name', e.name, 'catalogId', coalesce(e.source_ref, e.legacy_id, e.id::text),
            'catalogSource', case when e.user_id is null then 'MFD' else 'Custom' end,
            'rest', re.rest_s, 'notes', coalesce(re.notes, ''), 'superset_id', re.superset_group::text,
            'sets', (select count(*) from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null),
            'reps', (select rs.target_reps from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null and rs.set_type <> 'warmup' order by rs.position limit 1),
            'kg', (select rs.target_weight_kg from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null and rs.set_type <> 'warmup' order by rs.position limit 1),
            'setDetails', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', case rs.set_type when 'drop' then 'dropset' else rs.set_type end,
                              'kg', rs.target_weight_kg, 'reps', rs.target_reps, 'duration_seconds', rs.target_duration_s, 'distance_meters', rs.target_distance_m))
                              order by rs.position)
                           from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null)))
            order by re.position)
          from diary.routine_exercises re join diary.exercises e on e.id = re.exercise_id
          where re.routine_id = r.id and re.deleted_at is null), '[]')))
        order by r.position, r.id)
      from diary.routines r where r.user_id = u and r.deleted_at is null), '[]'),
    'mfdExercises', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(e.legacy_id, e.id::text), 'name', e.name, 'tracking', e.tracking, 'source', 'custom')
                                order by e.name)
                              from diary.exercises e where e.user_id = u and e.deleted_at is null and e.archived_at is null), '[]'),
    'meals', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(m.legacy_id, m.id::text), 'date', m.local_date::text, 'meal', initcap(m.meal), 'name', m.name,
        'amount', m.amount, 'unit', m.unit, 'cal', m.kcal, 'p', m.protein_g, 'c', m.carbs_g, 'f', m.fat_g,
        'fiber', m.fibre_g, 'sugar', m.sugars_g, 'saturates', m.saturated_fat_g, 'salt', m.salt_g,
        'labelFood', (select diary.label_json(f) from diary.foods f where f.id = m.food_id),
        'addedBy', diary.added_by(m.ai_action_id)))
        order by m.local_date, m.created_at, m.id)
      from diary.food_entries m where m.user_id = u and m.deleted_at is null), '[]'),
    'products', coalesce((select jsonb_agg(diary.label_json(f) order by f.name)
                          from diary.foods f where f.user_id = u and f.in_my_foods and f.deleted_at is null), '[]'),
    'foodFavorites', coalesce((select jsonb_agg(coalesce(f.legacy_id, f.id::text) order by ff.created_at)
                               from diary.favourite_foods ff join diary.foods f on f.id = ff.food_id
                               where ff.user_id = u and ff.deleted_at is null), '[]'),
    'water', coalesce((select jsonb_object_agg(d, ml) from (select local_date::text d, sum(ml) ml from diary.water_logs
                        where user_id = u and deleted_at is null group by 1) z), '{}'),
    'weights', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(x.legacy_id, x.id::text), 'date', x.local_date::text, 'kg', x.weight_kg, 'bodyFat', x.body_fat_pct,
        'source', case when x.source = 'health_connect' then 'health' end, 'addedBy', diary.added_by(x.ai_action_id)))
        order by x.local_date)
      from diary.weigh_ins x where x.user_id = u and x.deleted_at is null), '[]'),
    -- Recovery days and measurements are separate tables; the old document had one list of check-ins.
    'checkins', coalesce((select jsonb_agg(c order by c->>'date', c->>'id') from (
        select jsonb_strip_nulls(jsonb_build_object('id', 'recovery:' || r.local_date, 'date', r.local_date::text,
          'sleep', r.sleep_h, 'sleepSource', case when r.sleep_source = 'health_connect' then 'health' end, 'steps', r.steps,
          'restingHr', r.resting_hr, 'hrv', r.hrv_ms, 'energy', r.energy, 'soreness', r.soreness, 'note', coalesce(r.note, ''),
          'sleepStages', (select jsonb_build_object('deep', n.deep_min, 'light', n.light_min, 'rem', n.rem_min, 'awake', n.awake_min,
                            'start', diary.epoch_ms(n.started_at), 'end', diary.epoch_ms(n.ended_at))
                          from diary.sleep_nights n where n.user_id = u and n.local_date = r.local_date and n.deleted_at is null))) c
        from diary.recovery_days r where r.user_id = u and r.deleted_at is null
        union all
        select jsonb_strip_nulls(jsonb_object_agg(site, cm) || jsonb_build_object('id', split_part(legacy_id, ':', 1), 'date', min(local_date)::text,
          'note', '', 'addedBy', diary.added_by(min(ai_action_id::text)::uuid)))
        from diary.body_measurements where user_id = u and deleted_at is null group by split_part(legacy_id, ':', 1)) z), '[]'),
    'profile', (select jsonb_strip_nulls(jsonb_build_object(
        'firstName', p.first_name, 'lastName', p.last_name, 'name', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
        'birthDate', p.birth_date::text, 'age', case when p.birth_date is not null then extract(year from age(p.birth_date))::int end,
        'sex', p.sex, 'height', p.height_cm, 'activity', p.activity_level,
        'weight', (select x.weight_kg from diary.weigh_ins x where x.user_id = u and x.deleted_at is null order by x.local_date desc limit 1),
        'goal', g.goal, 'target', g.target_weight_kg, 'days', g.training_days_per_week, 'waterGoalMl', g.water_goal_ml,
        'experience', p.experience, 'equipment', p.equipment, 'limitations', p.limitations, 'diet', p.diet, 'onboarded', p.onboarded))
      from diary.user_profiles p left join diary.user_goals g on g.user_id = p.user_id where p.user_id = u and p.deleted_at is null),
    'mfdSettings', (select jsonb_strip_nulls(jsonb_build_object('weightUnit', s.weight_unit, 'energyUnit', s.energy_unit, 'lengthUnit', s.length_unit,
        'weekStart', s.week_start, 'defaultRestSec', s.default_rest_s, 'keepAwake', s.keep_awake, 'vibrate', s.vibrate, 'plates', s.plate_set,
        'healthWeightSkip', case when cardinality(s.health_weight_skip) > 0 then to_jsonb(s.health_weight_skip) end))
      from diary.user_settings s where s.user_id = u and s.deleted_at is null),
    'aiSuggestions', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', coalesce(a.legacy_id, a.id::text),
        'routineId', (select coalesce(r.legacy_id, r.id::text) from diary.routines r where r.id = a.routine_id), 'routineName', a.routine_name,
        'status', a.status, 'exercises', a.details->'exercises', 'usedExercises', a.details->'used_exercises', 'note', a.details->'note',
        'createdAt', diary.epoch_ms(a.created_at), 'usedAt', diary.epoch_ms(a.used_at), 'addedBy', diary.added_by(a.ai_action_id)))
        order by a.created_at)
      from diary.ai_suggestions a where a.user_id = u and a.deleted_at is null), '[]'),
    'aiChanges', coalesce((select jsonb_agg(a.details || jsonb_build_object('id', coalesce(a.legacy_id, a.id::text),
        'kind', case a.action when 'log_water' then 'water' when 'change_settings' then 'settings' when 'create_folder' then 'folder' else 'move' end,
        'addedBy', diary.added_by(a.id)) order by a.created_at)
      from diary.ai_actions a where a.user_id = u and a.undone_at is null and a.deleted_at is null
        and a.action in ('log_water', 'change_settings', 'create_folder', 'move_routine')), '[]')))
$$;
revoke all on function diary.as_envelope(uuid) from public, anon, authenticated;

-- Everything of mine that changed after sync number n (each table's rows as JSON), and the newest number.
create or replace function diary.changes_since(n bigint) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare u uuid := auth.uid(); t text; out jsonb := '{}'; rows jsonb;
begin
  if u is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  foreach t in array array['ai_actions', 'routine_folders', 'routines', 'routine_exercises', 'routine_sets', 'workouts', 'workout_exercises',
      'workout_sets', 'workout_heart_rate', 'foods', 'favourite_foods', 'food_entries', 'water_logs', 'weigh_ins', 'body_measurements',
      'recovery_days', 'sleep_nights', 'user_profiles', 'user_goals', 'user_settings', 'ai_suggestions', 'exercises'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.version), ''[]'') from diary.%I x where x.user_id = $1 and x.version > $2', t)
      into rows using u, n;
    if jsonb_array_length(rows) > 0 then out := out || jsonb_build_object(t, rows); end if;
  end loop;
  return jsonb_build_object('version', coalesce((select last_version from diary.sync_counters where user_id = u), 0), 'changes', out);
end $$;
revoke all on function diary.changes_since(bigint) from public, anon;
grant execute on function diary.changes_since(bigint) to authenticated;

commit;
