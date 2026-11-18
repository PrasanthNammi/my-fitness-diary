-- MFD 3.0 database, part 6: nutrition.
--
--   foods            a food's label: values per basis amount ("per 100 g", "per serving"). The person's own foods
--                    (every food they logged, saved or scanned) have user_id set; shared foods have it empty.
--                    in_my_foods = shown in My foods.
--   favourite_foods  which foods are starred (the pair person + food is the key).
--   food_entries     one thing eaten: day, meal, amount, and a snapshot of what that amount contained, so editing a
--                    food's label later never rewrites history (lesson 5).
--   water_logs       one drink; a day's water is the sum.
--
-- Run after 03-training.sql. Safe to re-run.
begin;

create table if not exists diary.foods (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,   -- empty = shared
  name            text not null check (char_length(btrim(name)) between 1 and 150),
  brand           text check (char_length(brand) <= 120),
  barcode         text check (barcode ~ '^[0-9]{8,14}$'),
  basis_amount    numeric(9,2) not null check (basis_amount > 0 and basis_amount <= 100000),
  basis_unit      text not null check (basis_unit in ('g', 'ml', 'serving')),
  serving_size    numeric(9,2) check (serving_size > 0 and serving_size <= 100000),   -- g or ml in one serving
  serving_label   text check (char_length(serving_label) <= 60),
  kcal            numeric      not null check (kcal between 0 and 100000),
  protein_g       numeric      not null default 0 check (protein_g between 0 and 10000),
  carbs_g         numeric      not null default 0 check (carbs_g between 0 and 10000),
  fat_g           numeric      not null default 0 check (fat_g between 0 and 10000),
  fibre_g         numeric      check (fibre_g between 0 and 10000),        -- empty = not on the label (unlike 0)
  sugars_g        numeric      check (sugars_g between 0 and 10000),
  saturated_fat_g numeric      check (saturated_fat_g between 0 and 10000),
  salt_g          numeric      check (salt_g between 0 and 10000),
  ingredients     text check (char_length(ingredients) <= 4000),
  notes           text check (char_length(notes) <= 1000),
  source          text check (char_length(source) <= 60),                  -- 'Open Food Facts', 'Community', …
  in_my_foods     boolean not null default false,
  legacy_id       text check (char_length(legacy_id) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         bigint not null default 0,
  deleted_at      timestamptz
);
create unique index if not exists foods_shared_barcode on diary.foods (barcode) where user_id is null and barcode is not null and deleted_at is null;
create index if not exists foods_own_barcode on diary.foods (user_id, barcode) where barcode is not null;
create index if not exists foods_my_foods on diary.foods (user_id) where in_my_foods and deleted_at is null;
create index if not exists foods_legacy on diary.foods (user_id, legacy_id) where legacy_id is not null;
-- A label keeps its values exactly (e.g. salt 0.125 g; rounding to 0.01 changed what the AI connector read, update 2).
-- Tables made before this change are widened in place.
alter table diary.foods alter column kcal type numeric, alter column protein_g type numeric, alter column carbs_g type numeric,
  alter column fat_g type numeric, alter column fibre_g type numeric, alter column sugars_g type numeric,
  alter column saturated_fat_g type numeric, alter column salt_g type numeric;

create table if not exists diary.favourite_foods (
  user_id    uuid not null references auth.users(id) on delete cascade,
  food_id    uuid not null references diary.foods(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 0,
  deleted_at timestamptz,
  primary key (user_id, food_id)
);

create table if not exists diary.food_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  local_date      date not null check (local_date >= date '2000-01-01'),
  meal            text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id         uuid references diary.foods(id) on delete set null,      -- the label it came from, if kept
  name            text not null check (char_length(btrim(name)) between 1 and 150),
  amount          numeric(9,2) not null check (amount > 0 and amount <= 100000),
  unit            text not null check (unit in ('g', 'ml', 'serving')),
  -- What the amount eaten contained (snapshot).
  kcal            numeric      not null check (kcal between 0 and 100000),
  protein_g       numeric      not null default 0 check (protein_g between 0 and 10000),
  carbs_g         numeric      not null default 0 check (carbs_g between 0 and 10000),
  fat_g           numeric      not null default 0 check (fat_g between 0 and 10000),
  fibre_g         numeric      check (fibre_g between 0 and 10000),
  sugars_g        numeric      check (sugars_g between 0 and 10000),
  saturated_fat_g numeric      check (saturated_fat_g between 0 and 10000),
  salt_g          numeric      check (salt_g between 0 and 10000),
  ai_action_id uuid,                                    -- set when ChatGPT or Claude added it
  legacy_id       text check (char_length(legacy_id) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         bigint not null default 0,
  deleted_at      timestamptz,
  foreign key (ai_action_id, user_id) references diary.ai_actions (id, user_id) on delete set null (ai_action_id)
);
-- The food diary of one day, the screen MFD opens most.
create index if not exists food_entries_by_day on diary.food_entries (user_id, local_date) where deleted_at is null;
-- An entry keeps what was logged exactly (the app works portions out to many decimals; rounding to 0.01 shifted
-- day totals by 0.1). Tables made before this change are widened in place.
alter table diary.food_entries alter column kcal type numeric, alter column protein_g type numeric, alter column carbs_g type numeric,
  alter column fat_g type numeric, alter column fibre_g type numeric, alter column sugars_g type numeric,
  alter column saturated_fat_g type numeric, alter column salt_g type numeric;
create index if not exists food_entries_by_food on diary.food_entries (food_id);

create table if not exists diary.water_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null check (local_date >= date '2000-01-01'),
  ml         integer not null check (ml between 1 and 10000),
  logged_at  timestamptz not null default now(),
  ai_action_id uuid,                                    -- set when ChatGPT or Claude added it
  legacy_id  text check (char_length(legacy_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 0,
  deleted_at timestamptz,
  foreign key (ai_action_id, user_id) references diary.ai_actions (id, user_id) on delete set null (ai_action_id)
);
create index if not exists water_logs_by_day on diary.water_logs (user_id, local_date) where deleted_at is null;

-- A food you link to must be shared or your own (like exercises).
create or replace function diary.check_food() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.food_id is not null and not exists (select 1 from diary.foods f where f.id = new.food_id and (f.user_id is null or f.user_id = new.user_id)) then
    raise exception 'Unknown food' using errcode = '23503';
  end if;
  return new;
end $$;
revoke all on function diary.check_food() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['foods', 'favourite_foods', 'food_entries', 'water_logs'] loop
    execute format('drop trigger if exists stamp on diary.%I', t);
    execute format('create trigger stamp before insert or update on diary.%I for each row execute function diary.stamp()', t);
    execute format('alter table diary.%I enable row level security', t);
    execute format('create index if not exists %I on diary.%I (user_id, version)', t || '_sync', t);
  end loop;
  foreach t in array array['favourite_foods', 'food_entries'] loop
    execute format('drop trigger if exists check_food on diary.%I', t);
    execute format('create trigger check_food before insert or update of food_id, user_id on diary.%I for each row execute function diary.check_food()', t);
  end loop;
  foreach t in array array['favourite_foods', 'food_entries', 'water_logs'] loop
    execute format('drop policy if exists own_rows on diary.%I', t);
    execute format('create policy own_rows on diary.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update on diary.%I to authenticated', t);
  end loop;
end $$;

-- Foods: shared ones readable by everyone; your own only by you.
drop policy if exists read_shared_or_own on diary.foods;
create policy read_shared_or_own on diary.foods for select to authenticated using (user_id is null or user_id = (select auth.uid()));
drop policy if exists add_own on diary.foods;
create policy add_own on diary.foods for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists change_own on diary.foods;
create policy change_own on diary.foods for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on diary.foods to authenticated;

commit;
