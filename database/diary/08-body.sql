-- MFD 3.0 database, part 8: body.
--
--   weigh_ins          one per person per day: weight, body fat, where it came from.
--   body_measurements  one row per measurement (day, site, cm), so a new site ("neck") is new data, not a new column.
--   recovery_days      one row per person per day: sleep, steps, resting heart rate, HRV, energy, soreness, note.
--   sleep_nights       the night's main sleep by stage, one per person per day.
--
-- A value Samsung Health / Health Connect gave keeps following it; a value the person typed is never replaced
-- (weigh_ins.source, recovery_days.sleep_source).
--
-- Run after 06-nutrition.sql. Safe to re-run.
begin;

create table if not exists diary.weigh_ins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_date   date not null check (local_date >= date '1900-01-01'),
  weight_kg    numeric(5,2) not null check (weight_kg between 20 and 400),
  body_fat_pct numeric(4,1) check (body_fat_pct between 2 and 70),
  source       text not null default 'manual' check (source in ('manual', 'health_connect', 'ai')),
  ai_action_id uuid,                                    -- set when ChatGPT or Claude added it
  legacy_id    text check (char_length(legacy_id) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      bigint not null default 0,
  deleted_at   timestamptz,
  foreign key (ai_action_id, user_id) references diary.ai_actions (id, user_id) on delete set null (ai_action_id)
);
create unique index if not exists weigh_ins_one_per_day on diary.weigh_ins (user_id, local_date) where deleted_at is null;

create table if not exists diary.body_measurements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null check (local_date >= date '1900-01-01'),
  site       text not null check (site in ('waist', 'chest', 'hips', 'arms')),   -- more sites later = a new value here
  cm         numeric(5,1) not null,
  ai_action_id uuid,                                    -- set when ChatGPT or Claude added it
  legacy_id  text check (char_length(legacy_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 0,
  deleted_at timestamptz,
  -- Sensible ranges per site.
  check (case site when 'arms' then cm between 15 and 80 when 'waist' then cm between 40 and 200 else cm between 50 and 200 end),
  foreign key (ai_action_id, user_id) references diary.ai_actions (id, user_id) on delete set null (ai_action_id)
);
create index if not exists body_measurements_by_site on diary.body_measurements (user_id, site, local_date) where deleted_at is null;

create table if not exists diary.recovery_days (
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_date   date not null check (local_date >= date '2000-01-01'),
  sleep_h      numeric(4,2) check (sleep_h between 0 and 24),
  sleep_source text check (sleep_source in ('manual', 'health_connect')),
  steps        integer check (steps between 0 and 200000),
  resting_hr   smallint check (resting_hr between 20 and 250),
  hrv_ms       smallint check (hrv_ms between 1 and 500),
  energy       smallint check (energy between 1 and 5),
  soreness     smallint check (soreness between 1 and 5),
  note         text check (char_length(note) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      bigint not null default 0,
  deleted_at   timestamptz,
  primary key (user_id, local_date),
  check ((sleep_h is null) = (sleep_source is null))           -- a sleep value always says where it came from
);

create table if not exists diary.sleep_nights (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null check (local_date >= date '2000-01-01'),
  started_at timestamptz not null,
  ended_at   timestamptz not null,
  deep_min   smallint not null default 0 check (deep_min between 0 and 1440),
  light_min  smallint not null default 0 check (light_min between 0 and 1440),
  rem_min    smallint not null default 0 check (rem_min between 0 and 1440),
  awake_min  smallint not null default 0 check (awake_min between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 0,
  deleted_at timestamptz,
  primary key (user_id, local_date),
  check (ended_at > started_at and ended_at - started_at <= interval '24 hours')
);

do $$ declare t text; begin
  foreach t in array array['weigh_ins', 'body_measurements', 'recovery_days', 'sleep_nights'] loop
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
