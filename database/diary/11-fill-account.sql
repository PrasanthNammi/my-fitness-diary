-- MFD 3.0 database, part 11: fill account, AI suggestions and AI changes from the old envelope and keep them
-- following it.
--
--   profile        → user_profiles (no age: the date of birth comes from the 3.0 pop-up; no weight: it's the latest
--                    weigh-in) and user_goals (goal and activity were stored as text and multipliers: translated)
--   mfdSettings    → user_settings (the old AI coach settings and hidden AI items are not carried over)
--   aiSuggestions  → ai_suggestions
--   aiChanges      → ai_actions with their Undo details (water, settings, folders, moved routines)
--
-- Run after 10-account.sql. Safe to re-run.
begin;

-- (src: the account part of the diary to copy instead of the stored document; see 14-apply-training.sql)
drop function if exists diary.fill_account(uuid);
create or replace function diary.fill_account(u uuid, src jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare doc jsonb := src; p jsonb; s jsonb;
begin
  if doc is null then select payload into doc from public.forma_workspaces where user_id = u; end if;
  if doc is null then return; end if;
  p := case when jsonb_typeof(doc->'profile') = 'object' then doc->'profile' else '{}' end;
  s := case when jsonb_typeof(doc->'mfdSettings') = 'object' then doc->'mfdSettings' else '{}' end;

  -- ── Profile (only once onboarding gave the essentials) ──
  if diary.within(diary.num(p->'height'), 100, 250) is not null then
    merge into diary.user_profiles t
    using (select u user_id,
      nullif(left(btrim(coalesce(p->>'firstName', '')), 40), '') first_name, nullif(left(btrim(coalesce(p->>'lastName', '')), 40), '') last_name,
      case when p->>'sex' = 'female' then 'female' else 'male' end sex, round(diary.num(p->'height'), 1) height_cm,
      case when p->>'activity' in ('sedentary', 'light', 'moderate', 'very', 'extra') then p->>'activity'
           else case diary.num(p->'activity') when 1.2 then 'sedentary' when 1.375 then 'light' when 1.725 then 'very' when 1.9 then 'extra' else 'moderate' end end activity_level,
      nullif(left(btrim(coalesce(p->>'experience', '')), 40), '') experience, nullif(left(btrim(coalesce(p->>'equipment', '')), 200), '') equipment,
      nullif(left(btrim(coalesce(p->>'limitations', '')), 1000), '') limitations, nullif(left(btrim(coalesce(p->>'diet', '')), 60), '') diet,
      coalesce((p->>'onboarded')::boolean, false) onboarded,
      -- MFD 3.0's date of birth (a real date, 13 to 100 years old today; anything else is left out)
      case when diary.day(p->>'birthDate') between (now() - interval '101 years')::date + 1 and (now() - interval '13 years')::date
        then diary.day(p->>'birthDate') end birth_date) x
    on t.user_id = x.user_id
    when matched and (t.first_name, t.last_name, t.sex, t.height_cm, t.activity_level, t.experience, t.equipment, t.limitations, t.diet, t.onboarded, t.birth_date, t.deleted_at)
      is distinct from (x.first_name, x.last_name, x.sex, x.height_cm, x.activity_level, x.experience, x.equipment, x.limitations, x.diet, x.onboarded, coalesce(x.birth_date, t.birth_date), null::timestamptz)
      then update set first_name = x.first_name, last_name = x.last_name, sex = x.sex, height_cm = x.height_cm, activity_level = x.activity_level,
        experience = x.experience, equipment = x.equipment, limitations = x.limitations, diet = x.diet, onboarded = x.onboarded,
        birth_date = coalesce(x.birth_date, t.birth_date), deleted_at = null
    when not matched then insert (user_id, first_name, last_name, sex, height_cm, activity_level, experience, equipment, limitations, diet, onboarded, birth_date)
      values (x.user_id, x.first_name, x.last_name, x.sex, x.height_cm, x.activity_level, x.experience, x.equipment, x.limitations, x.diet, x.onboarded, x.birth_date);
  end if;

  -- ── Goals ──
  merge into diary.user_goals t
  using (select u user_id,
    case when p->>'goal' ~* 'lose|loss' then 'lose' when p->>'goal' ~* 'gain|muscle' then 'gain' when p->>'goal' ~* 'recomp' then 'recomp' else 'maintain' end goal,
    diary.within(diary.num(p->'target'), 20, 400) target_weight_kg, coalesce(round(diary.within(diary.num(p->'days'), 1, 7)), 3)::smallint training_days_per_week,
    round(diary.within(diary.num(p->'waterGoalMl'), 250, 10000))::int water_goal_ml) x
  on t.user_id = x.user_id
  when matched and (t.goal, t.target_weight_kg, t.training_days_per_week, t.water_goal_ml, t.deleted_at)
    is distinct from (x.goal, x.target_weight_kg, x.training_days_per_week, x.water_goal_ml, null::timestamptz)
    then update set goal = x.goal, target_weight_kg = x.target_weight_kg, training_days_per_week = x.training_days_per_week, water_goal_ml = x.water_goal_ml, deleted_at = null
  when not matched then insert (user_id, goal, target_weight_kg, training_days_per_week, water_goal_ml) values (x.user_id, x.goal, x.target_weight_kg, x.training_days_per_week, x.water_goal_ml);

  -- ── Settings ──
  merge into diary.user_settings t
  using (select u user_id,
    case when s->>'weightUnit' = 'lb' then 'lb' else 'kg' end weight_unit, case when s->>'energyUnit' = 'kJ' then 'kJ' else 'kcal' end energy_unit,
    case when s->>'lengthUnit' = 'in' then 'in' else 'cm' end length_unit,
    case when diary.num(s->'weekStart') in (0, 1, 6) then diary.num(s->'weekStart')::smallint else 1 end week_start,
    coalesce(round(diary.within(diary.num(s->'defaultRestSec'), 0, 900)), 90)::smallint default_rest_s,
    coalesce((s->>'keepAwake')::boolean, true) keep_awake, coalesce((s->>'vibrate')::boolean, true) vibrate,
    case when jsonb_typeof(s->'plates') = 'object' and octet_length((s->'plates')::text) <= 2000 then s->'plates' end plate_set,
    coalesce((select array_agg(distinct diary.day(d)) from jsonb_array_elements_text(case when jsonb_typeof(s->'healthWeightSkip') = 'array' then s->'healthWeightSkip' else '[]' end) d where diary.day(d) is not null), '{}') health_weight_skip) x
  on t.user_id = x.user_id
  when matched and (t.weight_unit, t.energy_unit, t.length_unit, t.week_start, t.default_rest_s, t.keep_awake, t.vibrate, t.plate_set, t.health_weight_skip, t.deleted_at)
    is distinct from (x.weight_unit, x.energy_unit, x.length_unit, x.week_start, x.default_rest_s, x.keep_awake, x.vibrate, x.plate_set, x.health_weight_skip, null::timestamptz)
    then update set weight_unit = x.weight_unit, energy_unit = x.energy_unit, length_unit = x.length_unit, week_start = x.week_start, default_rest_s = x.default_rest_s,
      keep_awake = x.keep_awake, vibrate = x.vibrate, plate_set = x.plate_set, health_weight_skip = x.health_weight_skip, deleted_at = null
  when not matched then insert (user_id, weight_unit, energy_unit, length_unit, week_start, default_rest_s, keep_awake, vibrate, plate_set, health_weight_skip)
    values (x.user_id, x.weight_unit, x.energy_unit, x.length_unit, x.week_start, x.default_rest_s, x.keep_awake, x.vibrate, x.plate_set, x.health_weight_skip);

  -- ── AI changes (water, settings, folders, moved routines) → ai_actions with what Undo needs ──
  merge into diary.ai_actions t
  using (
    select diary.legacy_uuid(u, 'ai_action', 'change:' || (c->>'id')) id, u user_id, left(coalesce(nullif(c->'addedBy'->>'connection', ''), 'unknown'), 512) connection,
      nullif(left(c->'addedBy'->>'request', 64), '') request_id,
      case c->>'kind' when 'water' then 'log_water' when 'settings' then 'change_settings' when 'folder' then 'create_folder' else 'move_routine' end action,
      c - 'id' - 'kind' - 'addedBy' details,
      case when c->'addedBy'->>'at' ~ '^\d{4}-\d{2}-\d{2}T' then (c->'addedBy'->>'at')::timestamptz else now() end created_at, c->>'id' legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'aiChanges') = 'array' then doc->'aiChanges' else '[]' end) c
    where coalesce(c->>'id', '') <> '' and c->>'kind' in ('water', 'settings', 'folder', 'move') and octet_length(c::text) <= 20000
  ) x
  on t.id = x.id
  when matched and t.deleted_at is not null then update set deleted_at = null
  when not matched then insert (id, user_id, connection, request_id, action, details, created_at, legacy_id)
    values (x.id, x.user_id, x.connection, x.request_id, x.action, x.details, x.created_at, x.legacy_id);
  -- Undone in the app (gone from the list): marked undone, kept as history.
  update diary.ai_actions set undone_at = now()
    where user_id = u and undone_at is null and id in (select a.id from diary.ai_actions a where a.user_id = u and a.legacy_id is not null
      and a.id = diary.legacy_uuid(u, 'ai_action', 'change:' || a.legacy_id)
      and a.legacy_id not in (select c->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'aiChanges') = 'array' then doc->'aiChanges' else '[]' end) c where c->>'id' is not null));

  -- ── AI suggestions ──
  perform diary.note_ai(u, 'suggest_workout_targets', (select jsonb_agg(jsonb_build_object('key', x->>'id', 'by', x->'addedBy'))
    from jsonb_array_elements(case when jsonb_typeof(doc->'aiSuggestions') = 'array' then doc->'aiSuggestions' else '[]' end) x where x ? 'addedBy'));
  merge into diary.ai_suggestions t
  using (
    select diary.legacy_uuid(u, 'ai_suggestion', x->>'id') id, u user_id,
      case when exists (select 1 from diary.routines r where r.id = diary.legacy_uuid(u, 'routine', x->>'routineId') and r.deleted_at is null) then diary.legacy_uuid(u, 'routine', x->>'routineId') end routine_id,
      nullif(left(btrim(coalesce(x->>'routineName', '')), 80), '') routine_name,
      case when x->>'status' in ('used', 'dismissed') then x->>'status' else 'new' end status,
      jsonb_strip_nulls(jsonb_build_object('exercises', x->'exercises', 'used_exercises', x->'usedExercises', 'note', x->'note')) details,
      case when x->>'status' = 'used' then coalesce(diary.ms(x->'usedAt'), diary.ms(x->'createdAt'), now()) end used_at,
      case when x ? 'addedBy' then diary.legacy_uuid(u, 'ai_action', 'suggest_workout_targets:' || (x->>'id')) end ai_action_id,
      coalesce(diary.ms(x->'createdAt'), now()) created_at, x->>'id' legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'aiSuggestions') = 'array' then doc->'aiSuggestions' else '[]' end) x
    where coalesce(x->>'id', '') <> '' and octet_length(x::text) <= 50000
  ) x
  on t.id = x.id
  when matched and (t.routine_id, t.routine_name, t.status, t.details, t.used_at, t.ai_action_id, t.deleted_at)
    is distinct from (x.routine_id, x.routine_name, x.status, x.details, x.used_at, x.ai_action_id, null::timestamptz)
    then update set routine_id = x.routine_id, routine_name = x.routine_name, status = x.status, details = x.details, used_at = x.used_at, ai_action_id = x.ai_action_id, deleted_at = null
  when not matched then insert (id, user_id, routine_id, routine_name, status, details, used_at, ai_action_id, created_at, legacy_id)
    values (x.id, x.user_id, x.routine_id, x.routine_name, x.status, x.details, x.used_at, x.ai_action_id, x.created_at, x.legacy_id);
  update diary.ai_suggestions set deleted_at = now()
    where user_id = u and deleted_at is null and legacy_id is not null and legacy_id not in (
      select x->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'aiSuggestions') = 'array' then doc->'aiSuggestions' else '[]' end) x where x->>'id' is not null);
end $$;
revoke all on function diary.fill_account(uuid, jsonb) from public, anon, authenticated;

create or replace function diary.follow_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    -- Account data that lives in the tables is written there directly, never copied from here.
    if new.payload->'$training' ? 'profile' then return null; end if;
    if tg_op = 'UPDATE' and (old.payload->'profile', old.payload->'mfdSettings', old.payload->'aiSuggestions', old.payload->'aiChanges', old.payload->'routines')
       is not distinct from (new.payload->'profile', new.payload->'mfdSettings', new.payload->'aiSuggestions', new.payload->'aiChanges', new.payload->'routines') then
      return null;                                     -- nothing in account or AI changed
    end if;
    perform diary.fill_account(new.user_id);
  exception when others then
    insert into diary.fill_problems (user_id, kind, legacy_id, detail)
    values (new.user_id, 'error', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'), left(sqlerrm, 500)) on conflict do nothing;
  end;
  return null;
end $$;
revoke all on function diary.follow_account() from public, anon, authenticated;

-- Triggers on one event run in name order (diary_1_training … diary_4_account): this one runs last, after the
-- routines its suggestions point to are in place.
drop trigger if exists diary_4_account on public.forma_workspaces;
create trigger diary_4_account after insert or update of payload on public.forma_workspaces
  for each row execute function diary.follow_account();

commit;
