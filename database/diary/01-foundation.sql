-- MFD 3.0 database, part 1: the foundation every diary table shares.
--
-- The diary moves from one JSON document per person (public.forma_workspaces.payload) to one table per kind of
-- thing, in the schema "diary". This file holds what all those tables have in common:
--
--   * sync_counters: one number per person. Every insert, change or deletion of one of their rows takes the next
--     number (stored in the row's "version"), so a phone can ask "what changed after number N?".
--   * diary.stamp(): the trigger that sets created_at, updated_at and version on every write. Writers can't
--     forget it and can't fake it.
--   * diary.legacy_uuid(): turns an id from the old JSON ("w12", "hevy-..." or a uuid) into the same uuid every
--     time, so filling the tables from the old document can be repeated without creating duplicates.
--
-- Conventions for every table in this schema (see the MFD Database Plan page):
--   id uuid, user_id uuid (owner), created_at, updated_at, version, deleted_at (null = live).
--   Metric units only (kg, cm, s, m, ml, g). local_date = the diary day; timestamptz = the exact moment.
--   Row-level security on every table: a person only ever sees and changes their own rows.
--
-- Safe to re-run.
begin;

create schema if not exists diary;
revoke all on schema diary from public, anon;
grant usage on schema diary to authenticated;

-- One counter per person.
create table if not exists diary.sync_counters (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_version bigint not null default 0 check (last_version >= 0)
);
alter table diary.sync_counters enable row level security;
drop policy if exists own_counter on diary.sync_counters;
create policy own_counter on diary.sync_counters for select to authenticated using (user_id = (select auth.uid()));
grant select on diary.sync_counters to authenticated;

-- The next number for this person (row-locked, so two writes never get the same number).
create or replace function diary.next_version(owner uuid) returns bigint
language sql security definer set search_path = '' as $$
  insert into diary.sync_counters as c (user_id, last_version) values (owner, 1)
  on conflict (user_id) do update set last_version = c.last_version + 1
  returning last_version
$$;
revoke all on function diary.next_version(uuid) from public, anon, authenticated;

-- Shared rows (the exercise and food library, user_id empty) take their numbers from one shared sequence.
create sequence if not exists diary.shared_version;

-- Before every insert or update: the database, not the writer, sets the bookkeeping columns.
create or replace function diary.stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_at := old.created_at;            -- never changes after the row is made
    if new.user_id is distinct from old.user_id then
      raise exception 'A row cannot move to another person' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  new.version := case when new.user_id is null then nextval('diary.shared_version') else diary.next_version(new.user_id) end;
  return new;
end $$;
revoke all on function diary.stamp() from public, anon, authenticated;

-- What ChatGPT or Claude did: one row per action. Entries an assistant added point here (ai_action_id), and
-- "details" holds what Undo needs for changes that aren't entries (water added, settings, folders).
create table if not exists diary.ai_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  connection  text not null check (char_length(connection) between 1 and 512),   -- which assistant connection
  request_id  text check (char_length(request_id) <= 64),
  action      text not null check (action ~ '^[a-z_]{3,40}$'),                   -- log_meal, change_settings, …
  details     jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 20000),
  undone_at   timestamptz,
  legacy_id   text check (char_length(legacy_id) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 0,
  deleted_at  timestamptz,
  unique (id, user_id)
);
-- Repeats of a request are stopped by the connector; one request can rightly touch several things (a routine and its
-- new folder), so this is a lookup, not a uniqueness rule.
create index if not exists ai_actions_request on diary.ai_actions (user_id, connection, request_id) where request_id is not null;
create index if not exists ai_actions_recent on diary.ai_actions (user_id, created_at desc);
create index if not exists ai_actions_sync on diary.ai_actions (user_id, version);
alter table diary.ai_actions enable row level security;
drop policy if exists own_rows on diary.ai_actions;
create policy own_rows on diary.ai_actions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on diary.ai_actions to authenticated;
drop trigger if exists stamp on diary.ai_actions;
create trigger stamp before insert or update on diary.ai_actions for each row execute function diary.stamp();

-- The same uuid for the same old id, every time (an md5 hash shaped as a uuid).
create or replace function diary.legacy_uuid(owner uuid, kind text, legacy_id text) returns uuid
language sql immutable set search_path = '' as $$
  select md5(owner::text || ':' || kind || ':' || legacy_id)::uuid
$$;

-- An old "added by" mark ({connection, at, request}) → its ai_actions row (made once), and that row's id.
-- refs: [{"key": old entry id, "by": the mark}]. Used by every fill-in before it writes entries.
create or replace function diary.note_ai(owner uuid, act text, refs jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into diary.ai_actions (id, user_id, connection, request_id, action, created_at, legacy_id)
  select diary.legacy_uuid(owner, 'ai_action', act || ':' || (r->>'key')), owner, left(coalesce(nullif(r->'by'->>'connection', ''), 'unknown'), 512),
    nullif(left(r->'by'->>'request', 64), ''), act,
    case when r->'by'->>'at' ~ '^\d{4}-\d{2}-\d{2}T' then (r->'by'->>'at')::timestamptz else now() end, r->>'key'
  from jsonb_array_elements(coalesce(refs, '[]')) r
  where jsonb_typeof(r->'by') = 'object'
    and not exists (select 1 from diary.ai_actions a where a.id = diary.legacy_uuid(owner, 'ai_action', act || ':' || (r->>'key')))
$$;
revoke all on function diary.note_ai(uuid, text, jsonb) from public, anon, authenticated;

commit;
