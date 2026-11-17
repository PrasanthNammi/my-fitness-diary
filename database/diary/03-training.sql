-- MFD 3.0 database, part 3: training.
--
--   routine_folders → routines → routine_exercises → routine_sets      the plans
--   workouts → workout_exercises → workout_sets, workout_heart_rate    what was actually done
--
-- Every child row repeats its owner (user_id) and points to its parent through (parent_id, user_id), so the
-- database guarantees a child always belongs to the same person as its parent. Deleting means setting
-- deleted_at (so other phones hear about it); a deleted parent passes deleted_at on to its children.
--
-- Run after 02-library.sql. Safe to re-run.
begin;

-- ── Plans ──────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists diary.routine_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  position   integer not null default 0 check (position >= 0),
  legacy_id  text check (char_length(legacy_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 0,
  deleted_at timestamptz,
  unique (id, user_id)
);
create unique index if not exists routine_folders_name on diary.routine_folders (user_id, lower(btrim(name))) where deleted_at is null;

create table if not exists diary.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  folder_id  uuid,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  notes      text check (char_length(notes) <= 2000),
  position   integer not null default 0 check (position >= 0),
  legacy_id  text check (char_length(legacy_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 0,
  deleted_at timestamptz,
  unique (id, user_id),
  -- A removed folder leaves its routines unfiled (only folder_id is emptied, never the owner).
  foreign key (folder_id, user_id) references diary.routine_folders (id, user_id) on delete set null (folder_id)
);
create unique index if not exists routines_name on diary.routines (user_id, lower(btrim(name))) where deleted_at is null;

create table if not exists diary.routine_exercises (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  routine_id     uuid not null,
  exercise_id    uuid not null references diary.exercises(id),
  position       integer not null check (position >= 0),
  rest_s         integer not null default 90 check (rest_s between 0 and 900),
  superset_group smallint check (superset_group >= 0),
  notes          text check (char_length(notes) <= 300),
  legacy_id      text check (char_length(legacy_id) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        bigint not null default 0,
  deleted_at     timestamptz,
  unique (id, user_id),
  foreign key (routine_id, user_id) references diary.routines (id, user_id) on delete cascade
);

create table if not exists diary.routine_sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  routine_exercise_id uuid not null,
  position            integer not null check (position >= 0),
  set_type            text not null default 'normal' check (set_type in ('warmup', 'normal', 'failure', 'drop')),
  target_weight_kg    numeric(6,2) check (target_weight_kg between 0 and 1000),
  target_reps         integer check (target_reps between 0 and 1000),
  target_duration_s   integer check (target_duration_s between 0 and 86400),
  target_distance_m   numeric(9,1) check (target_distance_m between 0 and 1000000),
  legacy_id           text check (char_length(legacy_id) <= 200),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             bigint not null default 0,
  deleted_at          timestamptz,
  foreign key (routine_exercise_id, user_id) references diary.routine_exercises (id, user_id) on delete cascade
);

-- ── What was done ──────────────────────────────────────────────────────────────────────────────────────────
create table if not exists diary.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  routine_id  uuid,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  local_date  date not null check (local_date >= date '2000-01-01'),
  started_at  timestamptz not null,
  ended_at    timestamptz,                                  -- empty = still running
  time_zone   text check (char_length(time_zone) <= 64),
  source      text not null default 'app' check (source in ('app', 'watch', 'ai', 'hevy_import')),
  import_key  text check (char_length(import_key) <= 200),
  notes       text check (char_length(notes) <= 2000),
  legacy_id   text check (char_length(legacy_id) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 0,
  deleted_at  timestamptz,
  unique (id, user_id),
  check (ended_at is null or ended_at >= started_at),
  foreign key (routine_id, user_id) references diary.routines (id, user_id) on delete set null (routine_id)
);
-- Only one workout can be running per person.
create unique index if not exists workouts_one_running on diary.workouts (user_id) where ended_at is null and deleted_at is null;
-- The same imported workout can't come in twice.
create unique index if not exists workouts_import on diary.workouts (user_id, import_key) where import_key is not null and deleted_at is null;
-- History screens: newest first.
create index if not exists workouts_by_day on diary.workouts (user_id, local_date desc) where deleted_at is null;

create table if not exists diary.workout_exercises (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  workout_id     uuid not null,
  exercise_id    uuid not null references diary.exercises(id),
  position       integer not null check (position >= 0),
  rest_s         integer not null default 90 check (rest_s between 0 and 900),
  superset_group smallint check (superset_group >= 0),
  notes          text check (char_length(notes) <= 300),
  rest_ends_at   timestamptz,                               -- a running rest timer
  legacy_id      text check (char_length(legacy_id) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        bigint not null default 0,
  deleted_at     timestamptz,
  unique (id, user_id),
  foreign key (workout_id, user_id) references diary.workouts (id, user_id) on delete cascade
);
-- "Every time I did Bench Press" (progress charts, personal records).
create index if not exists workout_exercises_by_exercise on diary.workout_exercises (user_id, exercise_id) where deleted_at is null;

create table if not exists diary.workout_sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  workout_exercise_id uuid not null,
  position            integer not null check (position >= 0),
  set_type            text not null default 'normal' check (set_type in ('warmup', 'normal', 'failure', 'drop')),
  weight_kg           numeric(6,2) check (weight_kg between 0 and 1000),
  reps                integer check (reps between 0 and 1000),
  duration_s          integer check (duration_s between 0 and 86400),
  distance_m          numeric(9,1) check (distance_m between 0 and 1000000),
  floors              integer check (floors between 0 and 10000),
  steps               integer check (steps between 0 and 1000000),
  rpe                 numeric(3,1) check (rpe between 1 and 10),
  planned_weight_kg   numeric(6,2) check (planned_weight_kg between 0 and 1000),
  planned_reps        integer check (planned_reps between 0 and 1000),
  planned_by_ai       boolean not null default false,
  completed_at        timestamptz,                          -- when it was ticked; empty = not done
  legacy_id           text check (char_length(legacy_id) <= 200),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             bigint not null default 0,
  deleted_at          timestamptz,
  foreign key (workout_exercise_id, user_id) references diary.workout_exercises (id, user_id) on delete cascade
);
create index if not exists workout_sets_by_exercise on diary.workout_sets (workout_exercise_id);

create table if not exists diary.workout_heart_rate (
  workout_id uuid primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  source     text not null check (source in ('watch', 'health_connect')),
  interval_s smallint not null default 15 check (interval_s between 1 and 300),
  bpm        smallint[] not null check (cardinality(bpm) between 1 and 5000 and 0 <= all (bpm) and 250 >= all (bpm)),  -- 0 = no reading
  avg_bpm    smallint check (avg_bpm between 30 and 250),
  max_bpm    smallint check (max_bpm between 30 and 250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 0,
  deleted_at timestamptz,
  foreign key (workout_id, user_id) references diary.workouts (id, user_id) on delete cascade
);

-- Children are read through their parent; this is what makes that fast.
create index if not exists routines_by_folder on diary.routines (folder_id);
create index if not exists routine_exercises_by_routine on diary.routine_exercises (routine_id);
create index if not exists routine_sets_by_exercise on diary.routine_sets (routine_exercise_id);
create index if not exists workout_exercises_by_workout on diary.workout_exercises (workout_id);

-- ── Rules that need a little code ──────────────────────────────────────────────────────────────────────────
-- An exercise in your routine or workout must be a shared one or one of your own.
create or replace function diary.check_exercise() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from diary.exercises e where e.id = new.exercise_id and (e.user_id is null or e.user_id = new.user_id)) then
    raise exception 'Unknown exercise' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function diary.check_exercise() from public, anon, authenticated;

-- Deleting a parent (setting deleted_at) deletes its children the same way, so phones learn about each one.
-- A deleted folder only lets go of its routines.
create or replace function diary.pass_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is null or old.deleted_at is not null then return null; end if;
  case tg_table_name
    when 'routine_folders'   then update diary.routines set folder_id = null where folder_id = new.id and deleted_at is null;
    when 'routines'          then update diary.routine_exercises set deleted_at = new.deleted_at where routine_id = new.id and deleted_at is null;
    when 'routine_exercises' then update diary.routine_sets set deleted_at = new.deleted_at where routine_exercise_id = new.id and deleted_at is null;
    when 'workouts'          then update diary.workout_exercises set deleted_at = new.deleted_at where workout_id = new.id and deleted_at is null;
                                  update diary.workout_heart_rate set deleted_at = new.deleted_at where workout_id = new.id and deleted_at is null;
    when 'workout_exercises' then update diary.workout_sets set deleted_at = new.deleted_at where workout_exercise_id = new.id and deleted_at is null;
  end case;
  return null;
end $$;
revoke all on function diary.pass_on_delete() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['routine_folders', 'routines', 'routine_exercises', 'routine_sets', 'workouts', 'workout_exercises', 'workout_sets', 'workout_heart_rate'] loop
    -- Bookkeeping columns on every write.
    execute format('drop trigger if exists stamp on diary.%I', t);
    execute format('create trigger stamp before insert or update on diary.%I for each row execute function diary.stamp()', t);
    -- Only your own rows: read, add, change. Deleting is a change (deleted_at), so there is no delete permission.
    execute format('alter table diary.%I enable row level security', t);
    execute format('drop policy if exists own_rows on diary.%I', t);
    execute format('create policy own_rows on diary.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update on diary.%I to authenticated', t);
    -- What changed after number N, per person.
    execute format('create index if not exists %I on diary.%I (user_id, version)', t || '_sync', t);
  end loop;
  foreach t in array array['routine_exercises', 'workout_exercises'] loop
    execute format('drop trigger if exists check_exercise on diary.%I', t);
    execute format('create trigger check_exercise before insert or update of exercise_id, user_id on diary.%I for each row execute function diary.check_exercise()', t);
  end loop;
  foreach t in array array['routine_folders', 'routines', 'routine_exercises', 'workouts', 'workout_exercises'] loop
    execute format('drop trigger if exists pass_on_delete on diary.%I', t);
    execute format('create trigger pass_on_delete after update of deleted_at on diary.%I for each row execute function diary.pass_on_delete()', t);
  end loop;
end $$;

commit;
