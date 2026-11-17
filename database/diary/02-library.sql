-- MFD 3.0 database, part 2: the exercise library (training needs it: every exercise in a routine or workout
-- points to a row here).
--
--   muscle_groups, muscles, equipment   small fixed lists, keyed by a short name ('chest', 'barbell').
--                                       Everyone can read them; only migrations change them.
--   exercises                           the built-in catalogue (user_id empty, shared) and each person's own
--                                       exercises (user_id set, private), in one table.
--   exercise_muscle_groups              which muscle groups an exercise trains (what the app shows and counts).
--   exercise_muscles                    the detailed muscles (primary, secondary, stabiliser).
--   exercise_equipment                  what it needs.
--
-- Run after 01-foundation.sql. Safe to re-run.
begin;

-- ── Fixed lists ────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists diary.muscle_groups (
  key  text primary key check (key ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 1 and 40)
);
create table if not exists diary.muscles (
  key          text primary key check (key ~ '^[a-z_]{2,40}$'),
  name         text not null check (char_length(name) between 1 and 60),
  muscle_group text not null references diary.muscle_groups(key)
);
create table if not exists diary.equipment (
  key  text primary key check (key ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60)
);

-- ── Exercises ──────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists diary.exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,      -- empty = shared library
  source      text not null check (source in ('mfd', 'exercisedb', 'wger', 'free_exercise_db', 'community', 'custom')),
  source_ref  text check (char_length(source_ref) <= 120),           -- its id in the source ('bench_press')
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  aliases     text[] not null default '{}',
  category    text check (char_length(category) <= 40),
  tracking    text not null check (tracking in ('weight_reps', 'reps', 'weighted_bodyweight', 'assisted_bodyweight',
                'time', 'weight_time', 'distance_time', 'weight_distance', 'floors_time', 'steps_time')),
  description text check (char_length(description) <= 2000),
  setup       text[] not null default '{}',
  steps       text[] not null default '{}',
  cues        text[] not null default '{}',
  mistakes    text[] not null default '{}',
  media_url   text check (char_length(media_url) <= 500),
  credit      text check (char_length(credit) <= 300),
  licence     text check (char_length(licence) <= 120),
  legacy_id   text check (char_length(legacy_id) <= 200),            -- its id in the old JSON; removed in step 4
  archived_at timestamptz,                                           -- hidden from search, kept for history
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 0,
  deleted_at  timestamptz,
  -- Your own exercises are 'custom'; shared ones never are.
  constraint exercises_owner_source check ((user_id is null) = (source <> 'custom'))
);
-- A shared exercise is found by its source id; your own by name (ignoring capitals), once each.
create unique index if not exists exercises_shared_ref on diary.exercises (source, source_ref) where user_id is null;
create unique index if not exists exercises_own_name on diary.exercises (user_id, lower(btrim(name))) where user_id is not null and deleted_at is null;
-- The old id is only a note (own exercises are matched by name; one old id can carry several names).
drop index if exists diary.exercises_legacy;
create index if not exists exercises_legacy on diary.exercises (user_id, legacy_id) where legacy_id is not null;
create index if not exists exercises_sync on diary.exercises (user_id, version);

create table if not exists diary.exercise_muscle_groups (
  exercise_id  uuid not null references diary.exercises(id) on delete cascade,
  muscle_group text not null references diary.muscle_groups(key),
  role         text not null check (role in ('primary', 'secondary')),
  primary key (exercise_id, muscle_group)
);
create table if not exists diary.exercise_muscles (
  exercise_id uuid not null references diary.exercises(id) on delete cascade,
  muscle      text not null references diary.muscles(key),
  role        text not null check (role in ('primary', 'secondary', 'stabiliser')),
  primary key (exercise_id, muscle)
);
create table if not exists diary.exercise_equipment (
  exercise_id uuid not null references diary.exercises(id) on delete cascade,
  equipment   text not null references diary.equipment(key),
  primary key (exercise_id, equipment)
);
-- "Which exercises train the chest?" without reading every row.
create index if not exists exercise_muscle_groups_by_group on diary.exercise_muscle_groups (muscle_group);

drop trigger if exists stamp on diary.exercises;
create trigger stamp before insert or update on diary.exercises for each row execute function diary.stamp();

-- ── Who may see and change what ────────────────────────────────────────────────────────────────────────────
alter table diary.muscle_groups enable row level security;
alter table diary.muscles enable row level security;
alter table diary.equipment enable row level security;
alter table diary.exercises enable row level security;
alter table diary.exercise_muscle_groups enable row level security;
alter table diary.exercise_muscles enable row level security;
alter table diary.exercise_equipment enable row level security;

drop policy if exists read_all on diary.muscle_groups; create policy read_all on diary.muscle_groups for select to authenticated using (true);
drop policy if exists read_all on diary.muscles;       create policy read_all on diary.muscles       for select to authenticated using (true);
drop policy if exists read_all on diary.equipment;     create policy read_all on diary.equipment     for select to authenticated using (true);

-- Shared exercises: everyone reads them. Your own: only you read and change them.
drop policy if exists read_shared_or_own on diary.exercises;
create policy read_shared_or_own on diary.exercises for select to authenticated using (user_id is null or user_id = (select auth.uid()));
drop policy if exists add_own on diary.exercises;
create policy add_own on diary.exercises for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists change_own on diary.exercises;
create policy change_own on diary.exercises for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The links follow their exercise: visible when the exercise is, changeable when it's yours.
do $$ declare t text; begin
  foreach t in array array['exercise_muscle_groups', 'exercise_muscles', 'exercise_equipment'] loop
    execute format('drop policy if exists follow_exercise on diary.%I', t);
    execute format('create policy follow_exercise on diary.%I for select to authenticated using (exists (select 1 from diary.exercises e where e.id = exercise_id and (e.user_id is null or e.user_id = (select auth.uid()))))', t);
    execute format('drop policy if exists change_own on diary.%I', t);
    execute format('create policy change_own on diary.%I for all to authenticated using (exists (select 1 from diary.exercises e where e.id = exercise_id and e.user_id = (select auth.uid()))) with check (exists (select 1 from diary.exercises e where e.id = exercise_id and e.user_id = (select auth.uid())))', t);
  end loop;
end $$;

grant select on diary.muscle_groups, diary.muscles, diary.equipment to authenticated;
grant select, insert, update on diary.exercises to authenticated;
grant select, insert, update, delete on diary.exercise_muscle_groups, diary.exercise_muscles, diary.exercise_equipment to authenticated;

commit;
