-- MFD 3.0 database, part 10: account and AI suggestions.
--
--   user_profiles   facts about the person (one row each): names, date of birth, sex, height, activity level and
--                   what they told onboarding. Current weight is the latest weigh-in; it's not stored here.
--   user_goals      what they aim for: goal, target weight, training days, water goal. Daily calorie and macro
--                   targets are worked out from profile + goals + latest weigh-in, never stored.
--   user_settings   how the app behaves for them: units (display only; storage is always metric), week start,
--                   rest time, screen and vibration, the plates at their gym.
--   ai_suggestions  suggested targets for a routine's next session, from ChatGPT or Claude.
--
-- birth_date may be empty until the person answers MFD 3.0's date-of-birth pop-up; once every account has one,
-- a small follow-up makes it required (lesson 10: collect first, then enforce).
--
-- Run after 09-fill-body.sql. Safe to re-run.
begin;

create table if not exists diary.user_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  first_name     text check (char_length(btrim(first_name)) between 1 and 40),
  last_name      text check (char_length(btrim(last_name)) between 1 and 40),
  birth_date     date check (birth_date >= date '1900-01-01'),     -- required for everyone after 3.0 (see above)
  sex            text not null check (sex in ('female', 'male')),  -- used for calorie estimates
  height_cm      numeric(5,1) not null check (height_cm between 100 and 250),
  activity_level text not null default 'moderate' check (activity_level in ('sedentary', 'light', 'moderate', 'very', 'extra')),
  experience     text check (char_length(experience) <= 40),
  equipment      text check (char_length(equipment) <= 200),
  limitations    text check (char_length(limitations) <= 1000),
  diet           text check (char_length(diet) <= 60),
  onboarded      boolean not null default false,             -- finished onboarding (the old data has no date for it)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        bigint not null default 0,
  deleted_at     timestamptz,
  -- 13 to 100 years old on the day it's saved.
  check (birth_date is null or (birth_date <= (now() - interval '13 years')::date and birth_date >= (now() - interval '101 years')::date))
);

create table if not exists diary.user_goals (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  goal                   text not null default 'maintain' check (goal in ('lose', 'maintain', 'gain', 'recomp')),
  target_weight_kg       numeric(5,2) check (target_weight_kg between 20 and 400),
  training_days_per_week smallint not null default 3 check (training_days_per_week between 1 and 7),
  water_goal_ml          integer check (water_goal_ml between 250 and 10000),   -- empty = the app's default
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  version                bigint not null default 0,
  deleted_at             timestamptz
);

create table if not exists diary.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  weight_unit        text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  energy_unit        text not null default 'kcal' check (energy_unit in ('kcal', 'kJ')),
  length_unit        text not null default 'cm' check (length_unit in ('cm', 'in')),
  week_start         smallint not null default 1 check (week_start in (0, 1, 6)),   -- Sunday, Monday, Saturday
  default_rest_s     smallint not null default 90 check (default_rest_s between 0 and 900),
  keep_awake         boolean not null default true,
  vibrate            boolean not null default true,
  plate_set          jsonb check (jsonb_typeof(plate_set) = 'object' and octet_length(plate_set::text) <= 2000),
  -- Days whose Samsung Health weight the person deleted in MFD (so it isn't brought back).
  health_weight_skip date[] not null default '{}' check (cardinality(health_weight_skip) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            bigint not null default 0,
  deleted_at         timestamptz
);

create table if not exists diary.ai_suggestions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  routine_id   uuid,
  routine_name text check (char_length(routine_name) <= 80),     -- as it was called when suggested
  status       text not null default 'new' check (status in ('new', 'used', 'dismissed')),
  details      jsonb not null check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 50000),  -- the suggested sets, read whole
  used_at      timestamptz,
  ai_action_id uuid,
  legacy_id    text check (char_length(legacy_id) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      bigint not null default 0,
  deleted_at   timestamptz,
  check ((status = 'used') = (used_at is not null)),
  foreign key (routine_id, user_id) references diary.routines (id, user_id) on delete set null (routine_id),
  foreign key (ai_action_id, user_id) references diary.ai_actions (id, user_id) on delete set null (ai_action_id)
);
create index if not exists ai_suggestions_by_routine on diary.ai_suggestions (routine_id) where deleted_at is null;

do $$ declare t text; begin
  foreach t in array array['user_profiles', 'user_goals', 'user_settings', 'ai_suggestions'] loop
    execute format('drop trigger if exists stamp on diary.%I', t);
    execute format('create trigger stamp before insert or update on diary.%I for each row execute function diary.stamp()', t);
    execute format('alter table diary.%I enable row level security', t);
    execute format('drop policy if exists own_rows on diary.%I', t);
    execute format('create policy own_rows on diary.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update on diary.%I to authenticated', t);
    execute format('create index if not exists %I on diary.%I (user_id, version)', t || '_sync', t);
  end loop;
end $$;

commit;
