-- MFD database, part 17: Cycle & Health (optional, private; only for women who switch it on).
--
--   cycle_settings     one row per person: switched on, reminders and how they read, privacy choices, favourites.
--   cycle_days         one row per person per day: bleeding, flow, pain, symptoms, mind & energy, sleep notes,
--                      fertility observations (recorded only, never turned into predictions), a private note,
--                      or "nothing to note" (a day not logged has no row: it is "not logged", never "no symptoms").
--   medications        her medicines: name, dose, unit, times, days, start/end, reminder.
--   medication_doses   taken / missed per medicine, day and time.
--   lab_results        lab results she enters (TSH, Free T4, Free T3, others) with the report's own reference range.
--   health_conditions  conditions she adds (PCOS, hypothyroidism…), diagnosed or suspected.
--
-- The app keeps these as six parts of the diary ("cycleSettings", "cycleDays", "cycleMeds", "cycleDoses",
-- "cycleLabs", "cycleConditions"); like food, body and settings they live in these tables and come back exactly
-- (rows plus the small per-part patch, 14-apply-training.sql). Only the person can read or change their rows.
-- They are never part of the AI connector's diary (diary.area_json) or the Friends feed.
--
-- Run after 12-read.sql and 14-apply-training.sql. Safe to re-run.
begin;

create table if not exists diary.cycle_settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  enabled         boolean not null default false,
  reminder_style  text not null default 'discreet' check (reminder_style in ('discreet', 'private', 'detailed')),
  lock_details    boolean not null default false,
  ai_access       boolean not null default false,
  compare         boolean not null default false,
  health_sync     boolean not null default false,
  log_reminder    time,
  med_reminders   boolean not null default false,
  period_soon     boolean not null default false,
  favourites      text[] not null default '{}' check (cardinality(favourites) <= 50),
  custom_symptoms text[] not null default '{}' check (cardinality(custom_symptoms) <= 50),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         bigint not null default 0,
  deleted_at      timestamptz
);

create table if not exists diary.cycle_days (
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_date     date not null check (local_date >= date '1900-01-01'),
  position       int,
  nothing        boolean not null default false,
  bleeding       text check (bleeding in ('none', 'spotting', 'period', 'withdrawal', 'unsure')),
  flow           text check (flow in ('light', 'medium', 'heavy', 'very_heavy')),
  clots          boolean,
  products       text check (char_length(products) <= 200),
  pain           smallint check (pain between 0 and 10),
  pain_sites     text[] check (cardinality(pain_sites) <= 20),
  pain_limits    boolean,
  symptoms       jsonb check (symptoms is null or jsonb_typeof(symptoms) = 'object'),
  mood           smallint check (mood between 1 and 5),
  energy         smallint check (energy between 1 and 5),
  stress         smallint check (stress between 1 and 5),
  focus          smallint check (focus between 1 and 5),
  feelings       text[] check (cardinality(feelings) <= 20),
  sleep_notes    text[] check (cardinality(sleep_notes) <= 20),
  lh_test        text check (lh_test in ('negative', 'positive', 'unclear')),
  bbt_c          numeric(4,2) check (bbt_c between 34 and 43),
  mucus          text check (mucus in ('dry', 'sticky', 'creamy', 'watery', 'egg_white')),
  pregnancy_test text check (pregnancy_test in ('negative', 'positive')),
  note           text check (char_length(note) <= 4000),
  source         text check (source in ('health_connect')),   -- null = logged in MFD; 'health_connect' = a period day read from Health Connect
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        bigint not null default 0,
  deleted_at     timestamptz,
  primary key (user_id, local_date)
);
alter table diary.cycle_days add column if not exists source text check (source in ('health_connect'));

create table if not exists diary.medications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    int,
  name        text not null check (char_length(name) between 1 and 120),
  dose        numeric(10,3) check (dose > 0 and dose < 1000000),
  unit        text check (char_length(unit) <= 20),
  times       text[] not null default '{}' check (cardinality(times) <= 12),
  days        text check (char_length(days) <= 40),
  start_date  date,
  end_date    date,
  reminder    boolean not null default false,
  notes       text check (char_length(notes) <= 1000),
  legacy_id   text check (char_length(legacy_id) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 0,
  deleted_at  timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists diary.medication_doses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  position      int,
  medication_id uuid references diary.medications(id) on delete set null,
  med_legacy    text check (char_length(med_legacy) <= 200),
  local_date    date not null check (local_date >= date '1900-01-01'),
  at_time       text check (at_time ~ '^\d{2}:\d{2}$'),
  status        text not null check (status in ('taken', 'missed')),
  note          text check (char_length(note) <= 500),
  legacy_id     text check (char_length(legacy_id) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       bigint not null default 0,
  deleted_at    timestamptz
);
create index if not exists medication_doses_by_day on diary.medication_doses (user_id, local_date) where deleted_at is null;

create table if not exists diary.lab_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    int,
  test        text not null check (test in ('tsh', 'ft4', 'ft3', 'other')),
  name        text check (char_length(name) <= 80),
  value       numeric(12,4) not null check (value >= 0 and value < 100000000),
  unit        text check (char_length(unit) <= 20),
  ref_low     numeric(12,4),
  ref_high    numeric(12,4),
  taken_on    date not null check (taken_on >= date '1900-01-01'),
  note        text check (char_length(note) <= 1000),
  legacy_id   text check (char_length(legacy_id) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 0,
  deleted_at  timestamptz,
  check (ref_low is null or ref_high is null or ref_low <= ref_high)
);
create index if not exists lab_results_by_test on diary.lab_results (user_id, test, taken_on) where deleted_at is null;

create table if not exists diary.health_conditions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  position    int,
  kind        text not null check (kind in ('pcos', 'hypothyroidism', 'hyperthyroidism', 'thyroid_other', 'other')),
  name        text check (char_length(name) <= 80),
  status      text not null default 'diagnosed' check (status in ('diagnosed', 'suspected')),
  since       date,
  note        text check (char_length(note) <= 1000),
  legacy_id   text check (char_length(legacy_id) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 0,
  deleted_at  timestamptz
);

do $$ declare t text; begin
  foreach t in array array['cycle_settings', 'cycle_days', 'medications', 'medication_doses', 'lab_results', 'health_conditions'] loop
    execute format('drop trigger if exists stamp on diary.%I', t);
    execute format('create trigger stamp before insert or update on diary.%I for each row execute function diary.stamp()', t);
    execute format('alter table diary.%I enable row level security', t);
    execute format('drop policy if exists own_rows on diary.%I', t);
    execute format('create policy own_rows on diary.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on diary.%I from public, anon', t);
    execute format('grant select, insert, update on diary.%I to authenticated', t);
    execute format('create index if not exists %I on diary.%I (user_id, version)', t || '_sync', t);
  end loop;
end $$;

-- A short text value from the diary (trimmed, at most n characters), else empty.
create or replace function diary.txt(j jsonb, n int) returns text language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'string' and btrim(j #>> '{}') <> '' then left(btrim(j #>> '{}'), n) end
$$;
-- A list of short texts (strings only, each at most n characters, at most m of them), else empty.
create or replace function diary.txts(j jsonb, n int, m int) returns text[] language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'array' then (select array_agg(left(btrim(x), n) order by k) from jsonb_array_elements_text(j) with ordinality e(x, k)
    where k <= m and btrim(x) <> '') end
$$;
create or replace function diary.bool(j jsonb) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'boolean' then (j #>> '{}')::boolean end
$$;
create or replace function diary.pick(j jsonb, allowed text[]) returns text language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'string' and j #>> '{}' = any (allowed) then j #>> '{}' end
$$;

-- Copies the person's cycle parts into the tables (src: the parts to copy; otherwise the stored diary). Rows not in
-- the diary any more are marked deleted. Values outside the rules are left out (the part's patch keeps them exact).
create or replace function diary.fill_cycle(u uuid, src jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare doc jsonb := src; s jsonb; now_ts timestamptz := now();
begin
  if doc is null then select payload into doc from public.forma_workspaces where user_id = u; end if;
  if doc is null then return; end if;

  -- Settings.
  s := doc->'cycleSettings';
  if jsonb_typeof(s) = 'object' then
    insert into diary.cycle_settings as t (user_id, enabled, reminder_style, lock_details, ai_access, compare, health_sync, log_reminder, med_reminders, period_soon, favourites, custom_symptoms)
    values (u, coalesce(diary.bool(s->'enabled'), false), coalesce(diary.pick(s->'reminderStyle', array['discreet', 'private', 'detailed']), 'discreet'),
      coalesce(diary.bool(s->'lockDetails'), false), coalesce(diary.bool(s->'aiAccess'), false), coalesce(diary.bool(s->'compare'), false),
      coalesce(diary.bool(s->'healthSync'), false), case when s->>'logReminder' ~ '^([01]\d|2[0-3]):[0-5]\d$' then (s->>'logReminder')::time end,
      coalesce(diary.bool(s->'medReminders'), false), coalesce(diary.bool(s->'periodSoon'), false),
      coalesce(diary.txts(s->'favourites', 60, 50), '{}'), coalesce(diary.txts(s->'customSymptoms', 60, 50), '{}'))
    on conflict (user_id) do update set enabled = excluded.enabled, reminder_style = excluded.reminder_style, lock_details = excluded.lock_details,
      ai_access = excluded.ai_access, compare = excluded.compare, health_sync = excluded.health_sync, log_reminder = excluded.log_reminder,
      med_reminders = excluded.med_reminders, period_soon = excluded.period_soon, favourites = excluded.favourites, custom_symptoms = excluded.custom_symptoms,
      deleted_at = null
    where (t.enabled, t.reminder_style, t.lock_details, t.ai_access, t.compare, t.health_sync, t.log_reminder, t.med_reminders, t.period_soon, t.favourites, t.custom_symptoms, t.deleted_at)
      is distinct from (excluded.enabled, excluded.reminder_style, excluded.lock_details, excluded.ai_access, excluded.compare, excluded.health_sync, excluded.log_reminder,
        excluded.med_reminders, excluded.period_soon, excluded.favourites, excluded.custom_symptoms, null::timestamptz);
  else
    update diary.cycle_settings set deleted_at = now_ts where user_id = u and deleted_at is null;
  end if;

  -- Days (one per date; if the list ever has two for a date, the later one wins and the patch keeps both).
  merge into diary.cycle_days t
  using (
    select distinct on (d) u user_id, d local_date, (n - 1)::int position, coalesce(diary.bool(x->'nothing'), false) nothing,
      diary.pick(x->'bleeding', array['none', 'spotting', 'period', 'withdrawal', 'unsure']) bleeding,
      diary.pick(x->'flow', array['light', 'medium', 'heavy', 'very_heavy']) flow, diary.bool(x->'clots') clots, diary.txt(x->'products', 200) products,
      diary.within(round(diary.num(x->'pain')), 0, 10)::smallint pain, diary.txts(x->'painSites', 40, 20) pain_sites, diary.bool(x->'painLimits') pain_limits,
      case when jsonb_typeof(x->'symptoms') = 'object' then x->'symptoms' end symptoms,
      diary.within(round(diary.num(x->'mood')), 1, 5)::smallint mood, diary.within(round(diary.num(x->'energy')), 1, 5)::smallint energy,
      diary.within(round(diary.num(x->'stress')), 1, 5)::smallint stress, diary.within(round(diary.num(x->'focus')), 1, 5)::smallint focus,
      diary.txts(x->'feelings', 40, 20) feelings, diary.txts(x->'sleepNotes', 40, 20) sleep_notes,
      diary.pick(x->'fertility'->'lh', array['negative', 'positive', 'unclear']) lh_test, round(diary.within(diary.num(x->'fertility'->'bbt'), 34, 43), 2) bbt_c,
      diary.pick(x->'fertility'->'mucus', array['dry', 'sticky', 'creamy', 'watery', 'egg_white']) mucus,
      diary.pick(x->'fertility'->'pregnancy', array['negative', 'positive']) pregnancy_test, diary.txt(x->'note', 4000) note,
      diary.pick(x->'source', array['health_connect']) source
    from (select x, n, diary.day(x->>'date') d from jsonb_array_elements(case when jsonb_typeof(doc->'cycleDays') = 'array' then doc->'cycleDays' else '[]' end) with ordinality e(x, n)) z
    where d is not null
    order by d, n desc
  ) s on t.user_id = s.user_id and t.local_date = s.local_date
  when matched and (t.position, t.nothing, t.bleeding, t.flow, t.clots, t.products, t.pain, t.pain_sites, t.pain_limits, t.symptoms, t.mood, t.energy, t.stress, t.focus,
                    t.feelings, t.sleep_notes, t.lh_test, t.bbt_c, t.mucus, t.pregnancy_test, t.note, t.source, t.deleted_at)
    is distinct from (s.position, s.nothing, s.bleeding, s.flow, s.clots, s.products, s.pain, s.pain_sites, s.pain_limits, s.symptoms, s.mood, s.energy, s.stress, s.focus,
                      s.feelings, s.sleep_notes, s.lh_test, s.bbt_c, s.mucus, s.pregnancy_test, s.note, s.source, null::timestamptz)
    then update set position = s.position, nothing = s.nothing, bleeding = s.bleeding, flow = s.flow, clots = s.clots, products = s.products, pain = s.pain,
      pain_sites = s.pain_sites, pain_limits = s.pain_limits, symptoms = s.symptoms, mood = s.mood, energy = s.energy, stress = s.stress, focus = s.focus,
      feelings = s.feelings, sleep_notes = s.sleep_notes, lh_test = s.lh_test, bbt_c = s.bbt_c, mucus = s.mucus, pregnancy_test = s.pregnancy_test, note = s.note, source = s.source, deleted_at = null
  when not matched then insert (user_id, local_date, position, nothing, bleeding, flow, clots, products, pain, pain_sites, pain_limits, symptoms, mood, energy, stress, focus,
      feelings, sleep_notes, lh_test, bbt_c, mucus, pregnancy_test, note, source)
    values (s.user_id, s.local_date, s.position, s.nothing, s.bleeding, s.flow, s.clots, s.products, s.pain, s.pain_sites, s.pain_limits, s.symptoms, s.mood, s.energy, s.stress, s.focus,
      s.feelings, s.sleep_notes, s.lh_test, s.bbt_c, s.mucus, s.pregnancy_test, s.note, s.source);
  update diary.cycle_days t set deleted_at = now_ts
    where t.user_id = u and t.deleted_at is null and t.local_date not in (
      select diary.day(x->>'date') from jsonb_array_elements(case when jsonb_typeof(doc->'cycleDays') = 'array' then doc->'cycleDays' else '[]' end) x where diary.day(x->>'date') is not null);

  -- Medicines.
  merge into diary.medications t
  using (
    select distinct on (x->>'id') diary.legacy_uuid(u, 'medication', x->>'id') id, u user_id, (n - 1)::int position, left(btrim(x->>'name'), 120) name,
      case when diary.num(x->'dose') > 0 and diary.num(x->'dose') < 1000000 then diary.num(x->'dose') end dose, diary.txt(x->'unit', 20) unit,
      coalesce((select array_agg(t2 order by k) from jsonb_array_elements_text(case when jsonb_typeof(x->'times') = 'array' then x->'times' else '[]' end) with ordinality e2(t2, k)
                where t2 ~ '^([01]\d|2[0-3]):[0-5]\d$' and k <= 12), '{}') times,
      diary.txt(x->'days', 40) days, diary.day(x->>'start') start_date, diary.day(x->>'end') end_date, coalesce(diary.bool(x->'reminder'), false) reminder,
      diary.txt(x->'notes', 1000) notes, x->>'id' legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'cycleMeds') = 'array' then doc->'cycleMeds' else '[]' end) with ordinality e(x, n)
    where coalesce(x->>'id', '') <> '' and coalesce(btrim(x->>'name'), '') <> ''
      and (diary.day(x->>'end') is null or diary.day(x->>'start') is null or diary.day(x->>'end') >= diary.day(x->>'start'))
    order by x->>'id', n desc
  ) s on t.id = s.id
  when matched and (t.position, t.name, t.dose, t.unit, t.times, t.days, t.start_date, t.end_date, t.reminder, t.notes, t.deleted_at)
    is distinct from (s.position, s.name, s.dose, s.unit, s.times, s.days, s.start_date, s.end_date, s.reminder, s.notes, null::timestamptz)
    then update set position = s.position, name = s.name, dose = s.dose, unit = s.unit, times = s.times, days = s.days, start_date = s.start_date,
      end_date = s.end_date, reminder = s.reminder, notes = s.notes, deleted_at = null
  when not matched then insert (id, user_id, position, name, dose, unit, times, days, start_date, end_date, reminder, notes, legacy_id)
    values (s.id, s.user_id, s.position, s.name, s.dose, s.unit, s.times, s.days, s.start_date, s.end_date, s.reminder, s.notes, s.legacy_id);
  update diary.medications t set deleted_at = now_ts
    where t.user_id = u and t.deleted_at is null and t.legacy_id is not null and t.legacy_id not in (
      select x->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'cycleMeds') = 'array' then doc->'cycleMeds' else '[]' end) x where x->>'id' is not null);

  -- Doses (linked to their medicine when it exists).
  merge into diary.medication_doses t
  using (
    select distinct on (x->>'id') diary.legacy_uuid(u, 'medication_dose', x->>'id') id, u user_id, (n - 1)::int position,
      (select m.id from diary.medications m where m.id = diary.legacy_uuid(u, 'medication', x->>'medId') and m.user_id = u and m.deleted_at is null) medication_id,
      diary.txt(x->'medId', 200) med_legacy, diary.day(x->>'date') local_date,
      case when x->>'time' ~ '^\d{2}:\d{2}$' then x->>'time' end at_time, diary.pick(x->'status', array['taken', 'missed']) status,
      diary.txt(x->'note', 500) note, x->>'id' legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'cycleDoses') = 'array' then doc->'cycleDoses' else '[]' end) with ordinality e(x, n)
    where coalesce(x->>'id', '') <> '' and diary.day(x->>'date') is not null and diary.pick(x->'status', array['taken', 'missed']) is not null
    order by x->>'id', n desc
  ) s on t.id = s.id
  when matched and (t.position, t.medication_id, t.med_legacy, t.local_date, t.at_time, t.status, t.note, t.deleted_at)
    is distinct from (s.position, s.medication_id, s.med_legacy, s.local_date, s.at_time, s.status, s.note, null::timestamptz)
    then update set position = s.position, medication_id = s.medication_id, med_legacy = s.med_legacy, local_date = s.local_date, at_time = s.at_time,
      status = s.status, note = s.note, deleted_at = null
  when not matched then insert (id, user_id, position, medication_id, med_legacy, local_date, at_time, status, note, legacy_id)
    values (s.id, s.user_id, s.position, s.medication_id, s.med_legacy, s.local_date, s.at_time, s.status, s.note, s.legacy_id);
  update diary.medication_doses t set deleted_at = now_ts
    where t.user_id = u and t.deleted_at is null and t.legacy_id is not null and t.legacy_id not in (
      select x->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'cycleDoses') = 'array' then doc->'cycleDoses' else '[]' end) x where x->>'id' is not null);

  -- Lab results.
  merge into diary.lab_results t
  using (
    select distinct on (x->>'id') diary.legacy_uuid(u, 'lab_result', x->>'id') id, u user_id, (n - 1)::int position,
      diary.pick(x->'test', array['tsh', 'ft4', 'ft3', 'other']) test, diary.txt(x->'name', 80) name, diary.num(x->'value') value, diary.txt(x->'unit', 20) unit,
      diary.num(x->'low') ref_low, diary.num(x->'high') ref_high, diary.day(x->>'date') taken_on, diary.txt(x->'note', 1000) note, x->>'id' legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'cycleLabs') = 'array' then doc->'cycleLabs' else '[]' end) with ordinality e(x, n)
    where coalesce(x->>'id', '') <> '' and diary.pick(x->'test', array['tsh', 'ft4', 'ft3', 'other']) is not null and diary.day(x->>'date') is not null
      and diary.num(x->'value') >= 0 and diary.num(x->'value') < 100000000
      and (diary.num(x->'low') is null or diary.num(x->'high') is null or diary.num(x->'low') <= diary.num(x->'high'))
    order by x->>'id', n desc
  ) s on t.id = s.id
  when matched and (t.position, t.test, t.name, t.value, t.unit, t.ref_low, t.ref_high, t.taken_on, t.note, t.deleted_at)
    is distinct from (s.position, s.test, s.name, s.value, s.unit, s.ref_low, s.ref_high, s.taken_on, s.note, null::timestamptz)
    then update set position = s.position, test = s.test, name = s.name, value = s.value, unit = s.unit, ref_low = s.ref_low, ref_high = s.ref_high,
      taken_on = s.taken_on, note = s.note, deleted_at = null
  when not matched then insert (id, user_id, position, test, name, value, unit, ref_low, ref_high, taken_on, note, legacy_id)
    values (s.id, s.user_id, s.position, s.test, s.name, s.value, s.unit, s.ref_low, s.ref_high, s.taken_on, s.note, s.legacy_id);
  update diary.lab_results t set deleted_at = now_ts
    where t.user_id = u and t.deleted_at is null and t.legacy_id is not null and t.legacy_id not in (
      select x->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'cycleLabs') = 'array' then doc->'cycleLabs' else '[]' end) x where x->>'id' is not null);

  -- Conditions.
  merge into diary.health_conditions t
  using (
    select distinct on (x->>'id') diary.legacy_uuid(u, 'health_condition', x->>'id') id, u user_id, (n - 1)::int position,
      diary.pick(x->'kind', array['pcos', 'hypothyroidism', 'hyperthyroidism', 'thyroid_other', 'other']) kind, diary.txt(x->'name', 80) name,
      coalesce(diary.pick(x->'status', array['diagnosed', 'suspected']), 'diagnosed') status, diary.day(x->>'since') since, diary.txt(x->'note', 1000) note, x->>'id' legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'cycleConditions') = 'array' then doc->'cycleConditions' else '[]' end) with ordinality e(x, n)
    where coalesce(x->>'id', '') <> '' and diary.pick(x->'kind', array['pcos', 'hypothyroidism', 'hyperthyroidism', 'thyroid_other', 'other']) is not null
    order by x->>'id', n desc
  ) s on t.id = s.id
  when matched and (t.position, t.kind, t.name, t.status, t.since, t.note, t.deleted_at)
    is distinct from (s.position, s.kind, s.name, s.status, s.since, s.note, null::timestamptz)
    then update set position = s.position, kind = s.kind, name = s.name, status = s.status, since = s.since, note = s.note, deleted_at = null
  when not matched then insert (id, user_id, position, kind, name, status, since, note, legacy_id)
    values (s.id, s.user_id, s.position, s.kind, s.name, s.status, s.since, s.note, s.legacy_id);
  update diary.health_conditions t set deleted_at = now_ts
    where t.user_id = u and t.deleted_at is null and t.legacy_id is not null and t.legacy_id not in (
      select x->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'cycleConditions') = 'array' then doc->'cycleConditions' else '[]' end) x where x->>'id' is not null);
end $$;
revoke all on function diary.fill_cycle(uuid, jsonb) from public, anon, authenticated;

-- The cycle parts as the app keeps them, rebuilt from the rows (empty values left out). Used by diary.area_part.
create or replace function diary.cycle_part(u uuid, k text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if k = 'cycleSettings' then return (
    select jsonb_build_object('enabled', s.enabled, 'reminderStyle', s.reminder_style, 'lockDetails', s.lock_details, 'aiAccess', s.ai_access,
      'compare', s.compare, 'healthSync', s.health_sync, 'medReminders', s.med_reminders, 'periodSoon', s.period_soon,
      'favourites', to_jsonb(s.favourites), 'customSymptoms', to_jsonb(s.custom_symptoms))
      || case when s.log_reminder is not null then jsonb_build_object('logReminder', to_char(s.log_reminder, 'HH24:MI')) else '{}' end
    from diary.cycle_settings s where s.user_id = u and s.deleted_at is null); end if;
  if k = 'cycleDays' then return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', d.local_date::text, 'date', d.local_date::text, 'nothing', case when d.nothing then true end,
      'bleeding', d.bleeding, 'flow', d.flow, 'clots', d.clots, 'products', d.products, 'pain', d.pain, 'painSites', to_jsonb(d.pain_sites),
      'painLimits', d.pain_limits, 'symptoms', d.symptoms, 'mood', d.mood, 'energy', d.energy, 'stress', d.stress, 'focus', d.focus,
      'feelings', to_jsonb(d.feelings), 'sleepNotes', to_jsonb(d.sleep_notes),
      'fertility', nullif(jsonb_strip_nulls(jsonb_build_object('lh', d.lh_test, 'bbt', trim_scale(d.bbt_c), 'mucus', d.mucus, 'pregnancy', d.pregnancy_test)), '{}'),
      'note', d.note, 'source', d.source)) order by d.position nulls last, d.local_date)
    from diary.cycle_days d where d.user_id = u and d.deleted_at is null), '[]'); end if;
  if k = 'cycleMeds' then return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', coalesce(m.legacy_id, m.id::text), 'name', m.name, 'dose', trim_scale(m.dose), 'unit', m.unit,
      'times', to_jsonb(m.times), 'days', m.days, 'start', m.start_date::text, 'end', m.end_date::text, 'reminder', m.reminder, 'notes', m.notes))
      order by m.position nulls last, m.created_at, m.id)
    from diary.medications m where m.user_id = u and m.deleted_at is null), '[]'); end if;
  if k = 'cycleDoses' then return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', coalesce(x.legacy_id, x.id::text), 'medId', x.med_legacy, 'date', x.local_date::text,
      'time', x.at_time, 'status', x.status, 'note', x.note)) order by x.position nulls last, x.local_date, x.id)
    from diary.medication_doses x where x.user_id = u and x.deleted_at is null), '[]'); end if;
  if k = 'cycleLabs' then return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', coalesce(l.legacy_id, l.id::text), 'test', l.test, 'name', l.name, 'value', trim_scale(l.value),
      'unit', l.unit, 'low', trim_scale(l.ref_low), 'high', trim_scale(l.ref_high), 'date', l.taken_on::text, 'note', l.note))
      order by l.position nulls last, l.taken_on, l.id)
    from diary.lab_results l where l.user_id = u and l.deleted_at is null), '[]'); end if;
  if k = 'cycleConditions' then return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', coalesce(c.legacy_id, c.id::text), 'kind', c.kind, 'name', c.name, 'status', c.status,
      'since', c.since::text, 'note', c.note)) order by c.position nulls last, c.created_at, c.id)
    from diary.health_conditions c where c.user_id = u and c.deleted_at is null), '[]'); end if;
  return null;
end $$;
revoke all on function diary.cycle_part(uuid, text) from public, anon, authenticated;

commit;
