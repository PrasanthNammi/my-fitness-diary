-- MFD 3.0 database, part 12: reading the diary back from the tables.
--
--   diary.as_envelope(person)   the person's diary rebuilt from the tables in the shape the app, the connector and the
--                               Friends feed read today (the old JSON document). Readers can switch to the tables one
--                               by one without changing how they read. Ids are the old ones where an entry has one.
--   diary.feed_copy(workout)    a workout as the Friends feed shows it (mfd_social_workouts.data): only ticked sets.
--   diary.changes_since(n)      every row of the caller's that changed after sync number n, per table, and the
--                               newest number, so a phone only downloads what changed.
--
-- Numbers come back without trailing zeros (80.00 kg as 80), as the old document stored them.
-- What the old document held but the tables deliberately don't (device-only or leftovers of the old format) is left
-- out: the coach chat, AI coach settings, hidden AI items, folder open/closed, import bookkeeping on sets
-- (legacyCatalogId, sourceSetIndex), the 'Hevy' label on a few imported sets, a rest timer's saved end.
--
-- The per-item builders (diary.set_base, workout_base, …) and diary.extra_of/with_extra are in 05-fill-training.sql.
-- Run after 11-fill-account.sql. Safe to re-run. Changes no data.
begin;

-- A food label in the old shape (per basis amount).
create or replace function diary.label_json(f diary.foods) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('id', coalesce(f.legacy_id, f.id::text), 'name', f.name, 'brand', f.brand, 'barcode', f.barcode,
    'basis', trim_scale(f.basis_amount), 'unit', f.basis_unit, 'servingSize', trim_scale(f.serving_size), 'servingLabel', f.serving_label,
    'cal', trim_scale(f.kcal), 'p', trim_scale(f.protein_g), 'c', trim_scale(f.carbs_g), 'f', trim_scale(f.fat_g), 'fiber', trim_scale(f.fibre_g), 'sugar', trim_scale(f.sugars_g), 'saturates', trim_scale(f.saturated_fat_g),
    'salt', trim_scale(f.salt_g), 'ingredients', f.ingredients, 'notes', f.notes, 'source', f.source))
$$;

-- One workout (finished or running) exactly as the app stored it.
create or replace function diary.workout_json(w diary.workouts) returns jsonb language sql stable set search_path = '' as $$
  select diary.with_extra(diary.workout_base(w) || jsonb_build_object('sets', coalesce((
      select jsonb_agg(diary.with_extra(diary.set_base(s, we, e, w), s.extra) order by diary.pos(s.extra), we.position, s.position)
      from diary.workout_exercises we
      join diary.workout_sets s on s.workout_exercise_id = we.id and s.deleted_at is null
      join diary.exercises e on e.id = we.exercise_id
      where we.workout_id = w.id and we.deleted_at is null), '[]')), w.extra)
$$;

-- Plans exactly as the app stored them (the builders without children are in 05-fill-training.sql).
create or replace function diary.routine_exercise_json(re diary.routine_exercises, e diary.exercises) returns jsonb language sql stable set search_path = '' as $$
  select diary.with_extra(diary.routine_exercise_base(re, e) || jsonb_build_object('setDetails', coalesce((
      select jsonb_agg(diary.with_extra(diary.routine_set_base(rs), rs.extra) order by rs.position)
      from diary.routine_sets rs where rs.routine_exercise_id = re.id and rs.deleted_at is null), '[]')), re.extra)
$$;
create or replace function diary.routine_json(r diary.routines) returns jsonb language sql stable set search_path = '' as $$
  select diary.with_extra(diary.routine_base(r) || jsonb_build_object('exercises', coalesce((
      select jsonb_agg(diary.routine_exercise_json(re, e) order by re.position)
      from diary.routine_exercises re join diary.exercises e on e.id = re.exercise_id
      where re.routine_id = r.id and re.deleted_at is null), '[]')), r.extra)
$$;

-- Daily targets, the app's formula (frontend/domain/nutrition.ts, also mfd_mcp.targets): Mifflin-St Jeor BMR ×
-- activity, adjusted for the goal, never under 1,500 kcal (men) / 1,200 (women); protein per kg, fat as a share.
-- From MFD 3.0 the weight is the latest weigh-in and the age comes from the date of birth.
create or replace function diary.targets(sex text, kg numeric, cm numeric, age numeric, activity text, goal text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare bmr numeric := 10 * kg + 6.25 * cm - 5 * age + case when sex = 'female' then -161 else 5 end;
  factor numeric := case activity when 'sedentary' then 1.2 when 'light' then 1.375 when 'very' then 1.725 when 'extra' then 1.9 else 1.55 end;
  adj numeric := case goal when 'lose' then -0.2 when 'gain' then 0.1 when 'recomp' then -0.1 else 0 end;
  ppk numeric := case goal when 'maintain' then 1.6 when 'gain' then 1.8 else 2.0 end;
  share numeric := case goal when 'maintain' then 0.3 else 0.25 end;
  kcal numeric; p numeric; f numeric;
begin
  kcal := round(greatest(bmr * factor * (1 + adj), case when sex = 'female' then 1200 else 1500 end) / 10) * 10;
  p := round(kg * ppk); f := round(kcal * share / 9);
  return jsonb_build_object('cal', kcal, 'protein', p, 'carbs', greatest(0, round((kcal - p * 4 - f * 9) / 4)), 'fat', f);
end $$;

-- The Friends feed's copy of a workout, built from the tables exactly as mfd_private.project_workouts builds it from
-- the stored document (social-incremental.sql): the workout's facts and its ticked sets.
create or replace function diary.feed_copy(w diary.workouts) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', j->'id', 'name', j->'name', 'date', j->'date', 'started', j->'started', 'finished', j->'finished',
    'sets', coalesce((select jsonb_agg(jsonb_build_object('exercise', e->'exercise', 'group', e->'group', 'set', e->'set', 'type', e->'type',
        'kg', e->'kg', 'reps', e->'reps', 'duration_seconds', e->'duration_seconds', 'distance_meters', e->'distance_meters', 'rpe', e->'rpe',
        'catalogId', e->'catalogId', 'tracking', e->'tracking', 'floors', e->'floors', 'steps', e->'steps', 'done', true))
      from jsonb_array_elements(j->'sets') e where (e->>'done')::boolean), '[]'))
  from (select diary.workout_json(w) j) z
$$;
revoke all on function diary.feed_copy(diary.workouts) from public, anon, authenticated;


-- A person's training (finished workouts, the running one, folders, routines, own exercises) exactly as the app
-- stored it. Lists keep the app's order; items made without one (none yet) go last.
create or replace function diary.training_json(u uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(diary.workout_json(w) order by diary.pos(w.extra), w.started_at, w.id)
                          from diary.workouts w where w.user_id = u and w.deleted_at is null and w.ended_at is not null), '[]'),
    'active', (select diary.workout_json(w) from diary.workouts w where w.user_id = u and w.deleted_at is null and w.ended_at is null limit 1),
    'folders', coalesce((select jsonb_agg(diary.with_extra(diary.folder_base(f), f.extra) order by f.position, f.id)
                         from diary.routine_folders f where f.user_id = u and f.deleted_at is null), '[]'),
    'routines', coalesce((select jsonb_agg(diary.routine_json(r) order by r.position, r.id)
                          from diary.routines r where r.user_id = u and r.deleted_at is null), '[]'),
    -- "My exercises": own exercises the app lists ("$pos"); ones made only from a set's name aren't listed.
    'mfdExercises', coalesce((select jsonb_agg(diary.with_extra(diary.own_exercise_base(e), e.extra) order by diary.pos(e.extra), e.name)
                              from diary.exercises e where e.user_id = u and e.deleted_at is null and e.archived_at is null
                                and jsonb_typeof(e.extra->'$pos') = 'number'), '[]'))
$$;
revoke all on function diary.training_json(uuid) from public, anon, authenticated;

create or replace function diary.as_envelope(u uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  -- Training exactly as stored (empty values kept where the app had them); the other areas without empty values.
  select diary.training_json(u) || jsonb_strip_nulls(jsonb_build_object(
    'meals', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(m.legacy_id, m.id::text), 'date', m.local_date::text, 'meal', initcap(m.meal), 'name', m.name,
        'amount', trim_scale(m.amount), 'unit', m.unit, 'cal', trim_scale(m.kcal), 'p', trim_scale(m.protein_g), 'c', trim_scale(m.carbs_g), 'f', trim_scale(m.fat_g),
        'fiber', trim_scale(m.fibre_g), 'sugar', trim_scale(m.sugars_g), 'saturates', trim_scale(m.saturated_fat_g), 'salt', trim_scale(m.salt_g),
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
        'id', coalesce(x.legacy_id, x.id::text), 'date', x.local_date::text, 'kg', trim_scale(x.weight_kg), 'bodyFat', trim_scale(x.body_fat_pct),
        'source', case when x.source = 'health_connect' then 'health' end, 'addedBy', diary.added_by(x.ai_action_id)))
        order by x.local_date)
      from diary.weigh_ins x where x.user_id = u and x.deleted_at is null), '[]'),
    -- Recovery days and measurements are separate tables; the old document had one list of check-ins.
    'checkins', coalesce((select jsonb_agg(c order by c->>'date', c->>'id') from (
        select jsonb_strip_nulls(jsonb_build_object('id', 'recovery:' || r.local_date, 'date', r.local_date::text,
          'sleep', trim_scale(r.sleep_h), 'sleepSource', case when r.sleep_source = 'health_connect' then 'health' end, 'steps', r.steps,
          'restingHr', r.resting_hr, 'hrv', r.hrv_ms, 'energy', r.energy, 'soreness', r.soreness, 'note', coalesce(r.note, ''),
          'sleepStages', (select jsonb_build_object('deep', n.deep_min, 'light', n.light_min, 'rem', n.rem_min, 'awake', n.awake_min,
                            'start', diary.epoch_ms(n.started_at), 'end', diary.epoch_ms(n.ended_at))
                          from diary.sleep_nights n where n.user_id = u and n.local_date = r.local_date and n.deleted_at is null))) c
        from diary.recovery_days r where r.user_id = u and r.deleted_at is null
        union all
        select jsonb_strip_nulls(jsonb_object_agg(site, trim_scale(cm)) || jsonb_build_object('id', split_part(legacy_id, ':', 1), 'date', min(local_date)::text,
          'note', '', 'addedBy', diary.added_by(min(ai_action_id::text)::uuid)))
        from diary.body_measurements where user_id = u and deleted_at is null group by split_part(legacy_id, ':', 1)) z), '[]'),
    'profile', (select jsonb_strip_nulls(jsonb_build_object(
        'firstName', p.first_name, 'lastName', p.last_name, 'name', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
        'birthDate', p.birth_date::text, 'age', extract(year from age(p.birth_date))::int,
        'sex', p.sex, 'height', trim_scale(p.height_cm), 'activity', p.activity_level, 'weight', trim_scale(lw.kg),
        'goal', g.goal, 'target', trim_scale(g.target_weight_kg), 'days', g.training_days_per_week, 'waterGoalMl', g.water_goal_ml,
        'experience', p.experience, 'equipment', p.equipment, 'limitations', p.limitations, 'diet', p.diet, 'onboarded', p.onboarded))
        -- Daily targets need the age, so they appear once the date of birth is known.
        || case when p.birth_date is not null and lw.kg is not null
             then diary.targets(p.sex, lw.kg, p.height_cm, extract(year from age(p.birth_date)), p.activity_level, coalesce(g.goal, 'maintain')) else '{}' end
      from diary.user_profiles p left join diary.user_goals g on g.user_id = p.user_id
        left join lateral (select x.weight_kg kg from diary.weigh_ins x where x.user_id = u and x.deleted_at is null order by x.local_date desc limit 1) lw on true
      where p.user_id = u and p.deleted_at is null),
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
