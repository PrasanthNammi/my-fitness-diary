-- MFD 3.0 database, part 9: fill the body tables from the old envelope and keep them following it.
--
--   weights  → weigh_ins (one per day; if the old list ever had two on a day, the later one wins and it's counted)
--   checkins → recovery_days (the first recovery row of a day, as the app shows it), sleep_nights (its stages),
--              body_measurements (one row per site per old row)
--
-- Body data is small (a few hundred rows at most), so every change redoes the whole area; MERGE still only writes
-- rows that changed. Run after 08-body.sql. Safe to re-run.
begin;

create or replace function diary.fill_body(u uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare doc jsonb; now_ts timestamptz := now();
begin
  select payload into doc from public.forma_workspaces where user_id = u;
  if doc is null then return; end if;

  -- ── Weigh-ins ──
  -- First: gone from the envelope, or replaced by a later weigh-in on the same day (before adding, so the
  -- one-per-day rule never sees two at once).
  update diary.weigh_ins t set deleted_at = now_ts
    where t.user_id = u and t.deleted_at is null and t.legacy_id is not null and not exists (
      select 1 from (select distinct on (diary.day(x->>'date')) x->>'id' id
                     from jsonb_array_elements(case when jsonb_typeof(doc->'weights') = 'array' then doc->'weights' else '[]' end) with ordinality e(x, n)
                     where diary.day(x->>'date') is not null and diary.within(diary.num(x->'kg'), 20, 400) is not null
                     order by diary.day(x->>'date'), n desc) k where k.id = t.legacy_id);
  perform diary.note_ai(u, 'log_weight', (select jsonb_agg(jsonb_build_object('key', x->>'id', 'by', x->'addedBy'))
    from jsonb_array_elements(case when jsonb_typeof(doc->'weights') = 'array' then doc->'weights' else '[]' end) x where x ? 'addedBy'));
  merge into diary.weigh_ins t
  using (
    select distinct on (d) diary.legacy_uuid(u, 'weigh_in', x->>'id') id, u user_id, d local_date,
      diary.within(diary.num(x->'kg'), 20, 400) weight_kg, diary.within(diary.num(x->'bodyFat'), 2, 70) body_fat_pct,
      case when x->>'source' = 'health' then 'health_connect' when x ? 'addedBy' then 'ai' else 'manual' end source,
      case when x ? 'addedBy' then diary.legacy_uuid(u, 'ai_action', 'log_weight:' || (x->>'id')) end ai_action_id, x->>'id' legacy_id
    from (select x, diary.day(x->>'date') d, n from jsonb_array_elements(case when jsonb_typeof(doc->'weights') = 'array' then doc->'weights' else '[]' end) with ordinality e(x, n)) w
    where d is not null and coalesce(x->>'id', '') <> '' and diary.within(diary.num(x->'kg'), 20, 400) is not null
    order by d, n desc
  ) s
  on t.id = s.id
  when matched and (t.local_date, t.weight_kg, t.body_fat_pct, t.source, t.ai_action_id, t.deleted_at) is distinct from (s.local_date, s.weight_kg, s.body_fat_pct, s.source, s.ai_action_id, null::timestamptz)
    then update set local_date = s.local_date, weight_kg = s.weight_kg, body_fat_pct = s.body_fat_pct, source = s.source, ai_action_id = s.ai_action_id, deleted_at = null
  when not matched then insert (id, user_id, local_date, weight_kg, body_fat_pct, source, ai_action_id, legacy_id) values (s.id, s.user_id, s.local_date, s.weight_kg, s.body_fat_pct, s.source, s.ai_action_id, s.legacy_id);
  insert into diary.fill_problems (user_id, kind, legacy_id, detail)
  select u, 'weigh_in', x->>'id', case when diary.within(diary.num(x->'kg'), 20, 400) is null then 'kg' else 'second on the same day' end
  from jsonb_array_elements(case when jsonb_typeof(doc->'weights') = 'array' then doc->'weights' else '[]' end) with ordinality e(x, n)
  where diary.within(diary.num(x->'kg'), 20, 400) is null
     or exists (select 1 from jsonb_array_elements(doc->'weights') with ordinality e2(y, m) where y->>'date' = x->>'date' and m > n)
  on conflict do nothing;

  -- ── Recovery: one row per day (the first recovery row of that day, as the app shows it) ──
  create temporary table if not exists _rec (d date, x jsonb) on commit drop;
  truncate _rec;
  insert into _rec
    select distinct on (diary.day(x->>'date')) diary.day(x->>'date'), x
    from jsonb_array_elements(case when jsonb_typeof(doc->'checkins') = 'array' then doc->'checkins' else '[]' end) with ordinality e(x, n)
    where diary.day(x->>'date') is not null
      and (coalesce(x->>'sleep', x->>'steps', x->>'energy', x->>'soreness', x->>'restingHr', x->>'hrv') is not null
           or jsonb_typeof(x->'sleepStages') = 'object' or nullif(btrim(coalesce(x->>'note', '')), '') is not null)
    order by diary.day(x->>'date'), n;

  merge into diary.recovery_days t
  using (
    select u user_id, d local_date, round(diary.within(diary.num(x->'sleep'), 0, 24), 2) sleep_h,
      case when diary.within(diary.num(x->'sleep'), 0, 24) is null then null when x->>'sleepSource' = 'health' then 'health_connect' else 'manual' end sleep_source,
      round(diary.within(diary.num(x->'steps'), 0, 200000))::int steps, round(diary.within(diary.num(x->'restingHr'), 20, 250))::smallint resting_hr,
      round(diary.within(diary.num(x->'hrv'), 1, 500))::smallint hrv_ms, round(diary.within(diary.num(x->'energy'), 1, 5))::smallint energy,
      round(diary.within(diary.num(x->'soreness'), 1, 5))::smallint soreness, nullif(left(btrim(coalesce(x->>'note', '')), 1000), '') note
    from _rec
  ) s
  on t.user_id = s.user_id and t.local_date = s.local_date
  when matched and (t.sleep_h, t.sleep_source, t.steps, t.resting_hr, t.hrv_ms, t.energy, t.soreness, t.note, t.deleted_at)
    is distinct from (s.sleep_h, s.sleep_source, s.steps, s.resting_hr, s.hrv_ms, s.energy, s.soreness, s.note, null::timestamptz)
    then update set sleep_h = s.sleep_h, sleep_source = s.sleep_source, steps = s.steps, resting_hr = s.resting_hr, hrv_ms = s.hrv_ms,
      energy = s.energy, soreness = s.soreness, note = s.note, deleted_at = null
  when not matched then insert (user_id, local_date, sleep_h, sleep_source, steps, resting_hr, hrv_ms, energy, soreness, note)
    values (s.user_id, s.local_date, s.sleep_h, s.sleep_source, s.steps, s.resting_hr, s.hrv_ms, s.energy, s.soreness, s.note);
  update diary.recovery_days set deleted_at = now_ts where user_id = u and deleted_at is null and local_date not in (select d from _rec);

  merge into diary.sleep_nights t
  using (
    select u user_id, d local_date, diary.ms(x->'sleepStages'->'start') started_at, diary.ms(x->'sleepStages'->'end') ended_at,
      coalesce(round(diary.within(diary.num(x->'sleepStages'->'deep'), 0, 1440)), 0)::smallint deep_min,
      coalesce(round(diary.within(diary.num(x->'sleepStages'->'light'), 0, 1440)), 0)::smallint light_min,
      coalesce(round(diary.within(diary.num(x->'sleepStages'->'rem'), 0, 1440)), 0)::smallint rem_min,
      coalesce(round(diary.within(diary.num(x->'sleepStages'->'awake'), 0, 1440)), 0)::smallint awake_min
    from _rec
    where jsonb_typeof(x->'sleepStages') = 'object' and diary.ms(x->'sleepStages'->'end') > diary.ms(x->'sleepStages'->'start')
      and diary.ms(x->'sleepStages'->'end') - diary.ms(x->'sleepStages'->'start') <= interval '24 hours'
  ) s
  on t.user_id = s.user_id and t.local_date = s.local_date
  when matched and (t.started_at, t.ended_at, t.deep_min, t.light_min, t.rem_min, t.awake_min, t.deleted_at)
    is distinct from (s.started_at, s.ended_at, s.deep_min, s.light_min, s.rem_min, s.awake_min, null::timestamptz)
    then update set started_at = s.started_at, ended_at = s.ended_at, deep_min = s.deep_min, light_min = s.light_min, rem_min = s.rem_min, awake_min = s.awake_min, deleted_at = null
  when not matched then insert (user_id, local_date, started_at, ended_at, deep_min, light_min, rem_min, awake_min)
    values (s.user_id, s.local_date, s.started_at, s.ended_at, s.deep_min, s.light_min, s.rem_min, s.awake_min);
  update diary.sleep_nights set deleted_at = now_ts
    where user_id = u and deleted_at is null and local_date not in (select d from _rec where jsonb_typeof(x->'sleepStages') = 'object');

  -- ── Measurements: one row per site of each old row ──
  perform diary.note_ai(u, 'log_measurements', (select jsonb_agg(jsonb_build_object('key', x->>'id', 'by', x->'addedBy'))
    from jsonb_array_elements(case when jsonb_typeof(doc->'checkins') = 'array' then doc->'checkins' else '[]' end) x where x ? 'addedBy'));
  merge into diary.body_measurements t
  using (
    select diary.legacy_uuid(u, 'measurement', (x->>'id') || ':' || site) id, u user_id, diary.day(x->>'date') local_date, site,
      round(diary.num(x->site), 1) cm,
      case when x ? 'addedBy' then diary.legacy_uuid(u, 'ai_action', 'log_measurements:' || (x->>'id')) end ai_action_id, (x->>'id') || ':' || site legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'checkins') = 'array' then doc->'checkins' else '[]' end) x,
         unnest(array['waist', 'chest', 'hips', 'arms']) site
    where coalesce(x->>'id', '') <> '' and diary.day(x->>'date') is not null
      and case site when 'arms' then diary.num(x->site) between 15 and 80 when 'waist' then diary.num(x->site) between 40 and 200 else diary.num(x->site) between 50 and 200 end
  ) s
  on t.id = s.id
  when matched and (t.local_date, t.cm, t.ai_action_id, t.deleted_at) is distinct from (s.local_date, s.cm, s.ai_action_id, null::timestamptz)
    then update set local_date = s.local_date, cm = s.cm, ai_action_id = s.ai_action_id, deleted_at = null
  when not matched then insert (id, user_id, local_date, site, cm, ai_action_id, legacy_id) values (s.id, s.user_id, s.local_date, s.site, s.cm, s.ai_action_id, s.legacy_id);
  update diary.body_measurements t set deleted_at = now_ts
    where t.user_id = u and t.deleted_at is null and t.legacy_id is not null and t.legacy_id not in (
      select (x->>'id') || ':' || site from jsonb_array_elements(case when jsonb_typeof(doc->'checkins') = 'array' then doc->'checkins' else '[]' end) x,
        unnest(array['waist', 'chest', 'hips', 'arms']) site
      where case site when 'arms' then diary.num(x->site) between 15 and 80 when 'waist' then diary.num(x->site) between 40 and 200 else diary.num(x->site) between 50 and 200 end);
  insert into diary.fill_problems (user_id, kind, legacy_id, detail)
  select u, 'measurement', x->>'id', site
  from jsonb_array_elements(case when jsonb_typeof(doc->'checkins') = 'array' then doc->'checkins' else '[]' end) x, unnest(array['waist', 'chest', 'hips', 'arms']) site
  where diary.num(x->site) is not null
    and not case site when 'arms' then diary.num(x->site) between 15 and 80 when 'waist' then diary.num(x->site) between 40 and 200 else diary.num(x->site) between 50 and 200 end
  on conflict do nothing;
end $$;
revoke all on function diary.fill_body(uuid) from public, anon, authenticated;

create or replace function diary.follow_body() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op = 'UPDATE' and (old.payload->'weights', old.payload->'checkins') is not distinct from (new.payload->'weights', new.payload->'checkins') then
      return null;                                     -- nothing in body changed
    end if;
    perform diary.fill_body(new.user_id);
  exception when others then
    insert into diary.fill_problems (user_id, kind, legacy_id, detail)
    values (new.user_id, 'error', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'), left(sqlerrm, 500)) on conflict do nothing;
  end;
  return null;
end $$;
revoke all on function diary.follow_body() from public, anon, authenticated;

-- Triggers on one event run in name order: diary_1_training, diary_2_nutrition, diary_3_body, diary_4_account.
drop trigger if exists follow_body on public.forma_workspaces;
drop trigger if exists diary_3_body on public.forma_workspaces;
create trigger diary_3_body after insert or update of payload on public.forma_workspaces
  for each row execute function diary.follow_body();

commit;
