// The old-vs-new comparison used by the dry run and the real install: one row per check
// (k, area, item, old_value, new_value), counted per person on both sides. Read-only.
module.exports = `
  with w as (select user_id u, payload p from public.forma_workspaces),
  sess as (select s from w, jsonb_array_elements(case when jsonb_typeof(p->'sessions') = 'array' then p->'sessions' else '[]' end) s
           union all select p->'active' from w where jsonb_typeof(p->'active') = 'object'),
  sets as (select x from sess, jsonb_array_elements(case when jsonb_typeof(s->'sets') = 'array' then s->'sets' else '[]' end) x),
  meals as (select u, x from w, jsonb_array_elements(case when jsonb_typeof(p->'meals') = 'array' then p->'meals' else '[]' end) x),
  wts as (select x from w, jsonb_array_elements(case when jsonb_typeof(p->'weights') = 'array' then p->'weights' else '[]' end) x),
  cis as (select u, x from w, jsonb_array_elements(case when jsonb_typeof(p->'checkins') = 'array' then p->'checkins' else '[]' end) x)
  select 1, 'Training', 'workouts', (select count(*) from sess), (select count(*) from diary.workouts where deleted_at is null)
  union all select 2, 'Training', 'sets', (select count(*) from sets), (select count(*) from diary.workout_sets where deleted_at is null)
  union all select 3, 'Training', 'ticked sets', (select count(*) from sets where x->>'done' is distinct from 'false'), (select count(*) from diary.workout_sets where deleted_at is null and completed_at is not null)
  union all select 4, 'Training', 'reps (total)', (select coalesce(sum(round(diary.within(diary.num(x->'reps'), 0, 1000))), 0) from sets), (select coalesce(sum(reps), 0) from diary.workout_sets where deleted_at is null)
  union all select 5, 'Training', 'volume kg×reps', (select round(coalesce(sum(round(diary.within(diary.num(x->'kg'), 0, 1000), 2) * round(diary.within(diary.num(x->'reps'), 0, 1000))), 0)) from sets), (select round(coalesce(sum(weight_kg * reps), 0)) from diary.workout_sets where deleted_at is null)
  union all select 6, 'Training', 'routines', (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'routines') = 'array' then p->'routines' else '[]' end) r where coalesce(btrim(r->>'name'), '') <> ''), (select count(*) from diary.routines where deleted_at is null)
  union all select 7, 'Training', 'folders', (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'folders') = 'array' then p->'folders' else '[]' end) f), (select count(*) from diary.routine_folders where deleted_at is null)
  union all select 8, 'Training', 'sets on a built-in exercise', (select count(*) from sets where exists (select 1 from diary.exercises e where e.user_id is null and e.source_ref = x->>'catalogId')),
    (select count(*) from diary.workout_sets s join diary.workout_exercises we on we.id = s.workout_exercise_id join diary.exercises e on e.id = we.exercise_id where s.deleted_at is null and e.user_id is null)
  union all select 9, 'Training', 'heart-rate recordings', (select count(*) from sess where jsonb_typeof(s->'heartRate') = 'object'), (select count(*) from diary.workout_heart_rate where deleted_at is null)
  union all select 10, 'Nutrition', 'food entries', (select count(*) from meals), (select count(*) from diary.food_entries where deleted_at is null)
  union all select 11, 'Nutrition', 'kcal (total)', (select round(coalesce(sum(diary.within(diary.num(x->'cal'), 0, 100000)), 0)) from meals), (select round(coalesce(sum(kcal), 0)) from diary.food_entries where deleted_at is null)
  union all select 12, 'Nutrition', 'protein g (total)', (select round(coalesce(sum(diary.within(diary.num(x->'p'), 0, 10000)), 0)) from meals), (select round(coalesce(sum(protein_g), 0)) from diary.food_entries where deleted_at is null)
  union all select 13, 'Nutrition', 'foods (labels per person)', (select count(*) from (select distinct u, x->'labelFood'->>'id' from meals where coalesce(x->'labelFood'->>'id', '') <> '') z), (select count(*) from diary.foods f where f.user_id is not null and exists (select 1 from diary.food_entries e where e.food_id = f.id))
  union all select 14, 'Nutrition', 'water ml (total)', (select coalesce(sum(round(diary.within(diary.num(v), 1, 10000))), 0) from w, jsonb_each(case when jsonb_typeof(p->'water') = 'object' then p->'water' else '{}' end) e(d, v) where diary.day(d) is not null), (select coalesce(sum(ml), 0) from diary.water_logs where deleted_at is null)
  union all select 15, 'Body', 'weigh-ins (days)', (select count(*) from (select distinct p, x->>'date' from w, jsonb_array_elements(case when jsonb_typeof(p->'weights') = 'array' then p->'weights' else '[]' end) x) z), (select count(*) from diary.weigh_ins where deleted_at is null)
  union all select 16, 'Body', 'recovery days', (select count(*) from (select distinct u, x->>'date' from cis where coalesce(x->>'sleep', x->>'steps', x->>'energy', x->>'soreness', x->>'restingHr', x->>'hrv') is not null or jsonb_typeof(x->'sleepStages') = 'object' or nullif(btrim(coalesce(x->>'note', '')), '') is not null) z),
    (select count(*) from diary.recovery_days where deleted_at is null)
  union all select 17, 'Body', 'sleep hours (total)', (select round(coalesce(sum(diary.within(diary.num(x->'sleep'), 0, 24)), 0), 1) from cis), (select round(coalesce(sum(sleep_h), 0), 1) from diary.recovery_days where deleted_at is null)
  union all select 18, 'Body', 'measurements', (select count(*) from cis, unnest(array['waist', 'chest', 'hips', 'arms']) k where diary.num(x->k) is not null), (select count(*) from diary.body_measurements where deleted_at is null)
  union all select 19, 'Account', 'profiles', (select count(*) from w where diary.within(diary.num(p->'profile'->'height'), 100, 250) is not null), (select count(*) from diary.user_profiles)
  union all select 20, 'Account', 'settings', (select count(*) from w), (select count(*) from diary.user_settings)
  union all select 21, 'AI', 'entries added by an assistant', (select count(*) from meals where x ? 'addedBy') + (select count(*) from wts where x ? 'addedBy') + (select count(*) from sess where s ? 'addedBy')
      + (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'routines') = 'array' then p->'routines' else '[]' end) r where r ? 'addedBy'),
    (select count(*) from diary.food_entries where ai_action_id is not null) + (select count(*) from diary.weigh_ins where ai_action_id is not null) + (select count(*) from diary.workouts where ai_action_id is not null) + (select count(*) from diary.routines where ai_action_id is not null)
  union all select 22, 'AI', 'workout suggestions', (select count(*) from w, jsonb_array_elements(case when jsonb_typeof(p->'aiSuggestions') = 'array' then p->'aiSuggestions' else '[]' end) x), (select count(*) from diary.ai_suggestions where deleted_at is null)`;
