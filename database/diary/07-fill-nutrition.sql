-- MFD 3.0 database, part 7: fill the nutrition tables from the old envelope and keep them following it (like part 5
-- for training).
--
--   foods            one per food label the person used (the newest version of each), plus My foods and favourites.
--   food_entries     every diary entry, with the values that were stored for the amount eaten.
--   favourite_foods  the starred foods.
--   water_logs       the envelope only knows each day's total, so each day becomes one row (from 3.0 on, the app
--                    adds one row per drink).
--
-- Run after 06-nutrition.sql and 05-fill-training.sql. Safe to re-run.
begin;

-- (src: the food part of the diary to copy instead of the stored document; see 14-apply-training.sql)
drop function if exists diary.fill_nutrition(uuid, text[]);
create or replace function diary.fill_nutrition(u uuid, only_entries text[] default null, src jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare doc jsonb := src; now_ts timestamptz := now(); my text[]; favs text[];
begin
  if doc is null then select payload into doc from public.forma_workspaces where user_id = u; end if;
  if doc is null then return; end if;
  select coalesce(array_agg(p->>'id'), '{}') into my from jsonb_array_elements(case when jsonb_typeof(doc->'products') = 'array' then doc->'products' else '[]' end) p where p->>'id' is not null;
  select coalesce(array_agg(f), '{}') into favs from jsonb_array_elements_text(case when jsonb_typeof(doc->'foodFavorites') = 'array' then doc->'foodFavorites' else '[]' end) f;

  -- ── Foods: every label in the entries (newest version), My foods, and favourites only kept in settings ──
  -- The old diary has two shapes for a label: in entries and My foods (cal, p, c, f, basis, unit…) and in the
  -- settings' favourites (kcal, protein, refAmount, refUnit…). Both become the same row.
  -- rank: My foods first, then entries newest first (by day, then position), then settings' favourites.
  create temporary table if not exists _labels (fid text, l jsonb, rank int, day text, pos bigint) on commit drop;
  truncate _labels;
  insert into _labels
    select x->'labelFood'->>'id', x->'labelFood', 1, coalesce(x->>'date', ''), n
    from jsonb_array_elements(case when jsonb_typeof(doc->'meals') = 'array' then doc->'meals' else '[]' end) with ordinality e(x, n)
    where jsonb_typeof(x->'labelFood') = 'object' and coalesce(x->'labelFood'->>'id', '') <> ''
      -- every entry using a label that a changed entry uses, so "newest version" looks at all of them
      and (only_entries is null or x->'labelFood'->>'id' = any(my) or x->'labelFood'->>'id' = any(favs)
           or x->'labelFood'->>'id' in (select c->'labelFood'->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'meals') = 'array' then doc->'meals' else '[]' end) c
                                        where c->>'id' = any(only_entries)))
    union all
    select p->>'id', p, 0, '', 0 from jsonb_array_elements(case when jsonb_typeof(doc->'products') = 'array' then doc->'products' else '[]' end) p where coalesce(p->>'id', '') <> ''
    union all
    select f->>'id', jsonb_build_object('id', f->'id', 'name', f->'name', 'brand', f->'brand', 'barcode', f->'barcode', 'basis', f->'refAmount',
        'unit', f->'refUnit', 'cal', f->'kcal', 'p', f->'protein', 'c', f->'carbs', 'f', f->'fat', 'fiber', f->'fibre', 'sugar', f->'sugars',
        'saturates', f->'saturates', 'salt', f->'salt', 'servingSize', f->'servingSize', 'servingLabel', f->'servingLabel', 'ingredients', f->'ingredients'), 2, '', 0
    from jsonb_array_elements(case when jsonb_typeof(doc->'mfdSettings'->'favouriteFoods') = 'array' then doc->'mfdSettings'->'favouriteFoods' else '[]' end) f
    where coalesce(f->>'id', '') <> '';

  merge into diary.foods t
  using (
    select distinct on (fid)
      diary.legacy_uuid(u, 'food', fid) id, u user_id, left(coalesce(nullif(btrim(l->>'name'), ''), 'Food'), 150) name,
      nullif(left(btrim(coalesce(l->>'brand', '')), 120), '') brand,
      case when l->>'barcode' ~ '^[0-9]{8,14}$' then l->>'barcode' end barcode,
      coalesce(diary.within(diary.num(l->'basis'), 0.01, 100000), 100) basis_amount,
      case when l->>'unit' in ('g', 'ml', 'serving') then l->>'unit' else 'g' end basis_unit,
      diary.within(diary.num(l->'servingSize'), 0.01, 100000) serving_size, nullif(left(btrim(coalesce(l->>'servingLabel', '')), 60), '') serving_label,
      coalesce(diary.within(diary.num(l->'cal'), 0, 100000), 0) kcal,
      coalesce(diary.within(diary.num(l->'p'), 0, 10000), 0) protein_g, coalesce(diary.within(diary.num(l->'c'), 0, 10000), 0) carbs_g,
      coalesce(diary.within(diary.num(l->'f'), 0, 10000), 0) fat_g,
      diary.within(diary.num(l->'fiber'), 0, 10000) fibre_g, diary.within(diary.num(l->'sugar'), 0, 10000) sugars_g,
      diary.within(diary.num(l->'saturates'), 0, 10000) saturated_fat_g, diary.within(diary.num(l->'salt'), 0, 10000) salt_g,
      nullif(left(coalesce(l->>'ingredients', ''), 4000), '') ingredients, nullif(left(btrim(coalesce(l->>'notes', '')), 1000), '') notes,
      nullif(left(coalesce(l->>'source', ''), 60), '') source, fid = any(my) in_my_foods, fid legacy_id
    from _labels
    order by fid, rank, day desc, pos desc
  ) s
  on t.id = s.id
  when matched and (t.name, t.brand, t.barcode, t.basis_amount, t.basis_unit, t.serving_size, t.serving_label, t.kcal, t.protein_g, t.carbs_g, t.fat_g,
                    t.fibre_g, t.sugars_g, t.saturated_fat_g, t.salt_g, t.ingredients, t.notes, t.source, t.in_my_foods, t.deleted_at)
    is distinct from (s.name, s.brand, s.barcode, s.basis_amount, s.basis_unit, s.serving_size, s.serving_label, s.kcal, s.protein_g, s.carbs_g, s.fat_g,
                      s.fibre_g, s.sugars_g, s.saturated_fat_g, s.salt_g, s.ingredients, s.notes, s.source, s.in_my_foods, null::timestamptz)
    then update set name = s.name, brand = s.brand, barcode = s.barcode, basis_amount = s.basis_amount, basis_unit = s.basis_unit, serving_size = s.serving_size,
      serving_label = s.serving_label, kcal = s.kcal, protein_g = s.protein_g, carbs_g = s.carbs_g, fat_g = s.fat_g, fibre_g = s.fibre_g, sugars_g = s.sugars_g,
      saturated_fat_g = s.saturated_fat_g, salt_g = s.salt_g, ingredients = s.ingredients, notes = s.notes, source = s.source, in_my_foods = s.in_my_foods, deleted_at = null
  when not matched then insert (id, user_id, name, brand, barcode, basis_amount, basis_unit, serving_size, serving_label, kcal, protein_g, carbs_g, fat_g,
      fibre_g, sugars_g, saturated_fat_g, salt_g, ingredients, notes, source, in_my_foods, legacy_id)
    values (s.id, s.user_id, s.name, s.brand, s.barcode, s.basis_amount, s.basis_unit, s.serving_size, s.serving_label, s.kcal, s.protein_g, s.carbs_g, s.fat_g,
      s.fibre_g, s.sugars_g, s.saturated_fat_g, s.salt_g, s.ingredients, s.notes, s.source, s.in_my_foods, s.legacy_id);
  -- Removed from My foods: the food stays (entries point to it), only the flag goes.
  update diary.foods set in_my_foods = false where user_id = u and in_my_foods and deleted_at is null and not (legacy_id = any(my));

  -- ── Entries (those an assistant added get their ai_actions row first) ──
  perform diary.note_ai(u, 'log_meal', (select jsonb_agg(jsonb_build_object('key', x->>'id', 'by', x->'addedBy'))
    from jsonb_array_elements(case when jsonb_typeof(doc->'meals') = 'array' then doc->'meals' else '[]' end) x
    where x ? 'addedBy' and (only_entries is null or x->>'id' = any(only_entries))));
  merge into diary.food_entries t
  using (
    select diary.legacy_uuid(u, 'food_entry', x->>'id') id, u user_id,
      coalesce(diary.day(x->>'date'), now_ts::date) local_date,
      case lower(coalesce(x->>'meal', '')) when 'breakfast' then 'breakfast' when 'lunch' then 'lunch' when 'dinner' then 'dinner' else 'snack' end meal,
      case when coalesce(x->'labelFood'->>'id', '') <> '' then diary.legacy_uuid(u, 'food', x->'labelFood'->>'id') end food_id,
      left(coalesce(nullif(btrim(x->>'name'), ''), nullif(btrim(x->'labelFood'->>'name'), ''), 'Food'), 150) name,
      coalesce(diary.within(diary.num(x->'amount'), 0.01, 100000), diary.within(diary.num(x->'grams'), 0.01, 100000), 1) amount,
      case when x->>'unit' in ('g', 'ml', 'serving') then x->>'unit' when x->'labelFood'->>'unit' in ('g', 'ml', 'serving') then x->'labelFood'->>'unit' when x ? 'grams' then 'g' else 'serving' end unit,
      coalesce(diary.within(diary.num(x->'cal'), 0, 100000), 0) kcal,
      coalesce(diary.within(diary.num(x->'p'), 0, 10000), 0) protein_g, coalesce(diary.within(diary.num(x->'c'), 0, 10000), 0) carbs_g,
      coalesce(diary.within(diary.num(x->'f'), 0, 10000), 0) fat_g,
      diary.within(diary.num(x->'fiber'), 0, 10000) fibre_g, diary.within(diary.num(x->'sugar'), 0, 10000) sugars_g,
      diary.within(diary.num(x->'saturates'), 0, 10000) saturated_fat_g, diary.within(diary.num(x->'salt'), 0, 10000) salt_g,
      case when x ? 'addedBy' then diary.legacy_uuid(u, 'ai_action', 'log_meal:' || (x->>'id')) end ai_action_id, x->>'id' legacy_id
    from jsonb_array_elements(case when jsonb_typeof(doc->'meals') = 'array' then doc->'meals' else '[]' end) x
    where coalesce(x->>'id', '') <> '' and (only_entries is null or x->>'id' = any(only_entries))
  ) s
  on t.id = s.id
  when matched and (t.local_date, t.meal, t.food_id, t.name, t.amount, t.unit, t.kcal, t.protein_g, t.carbs_g, t.fat_g, t.fibre_g, t.sugars_g, t.saturated_fat_g, t.salt_g, t.ai_action_id, t.deleted_at)
    is distinct from (s.local_date, s.meal, s.food_id, s.name, s.amount, s.unit, s.kcal, s.protein_g, s.carbs_g, s.fat_g, s.fibre_g, s.sugars_g, s.saturated_fat_g, s.salt_g, s.ai_action_id, null::timestamptz)
    then update set local_date = s.local_date, meal = s.meal, food_id = s.food_id, name = s.name, amount = s.amount, unit = s.unit, kcal = s.kcal, protein_g = s.protein_g,
      carbs_g = s.carbs_g, fat_g = s.fat_g, fibre_g = s.fibre_g, sugars_g = s.sugars_g, saturated_fat_g = s.saturated_fat_g, salt_g = s.salt_g, ai_action_id = s.ai_action_id, deleted_at = null
  when not matched then insert (id, user_id, local_date, meal, food_id, name, amount, unit, kcal, protein_g, carbs_g, fat_g, fibre_g, sugars_g, saturated_fat_g, salt_g, ai_action_id, legacy_id)
    values (s.id, s.user_id, s.local_date, s.meal, s.food_id, s.name, s.amount, s.unit, s.kcal, s.protein_g, s.carbs_g, s.fat_g, s.fibre_g, s.sugars_g, s.saturated_fat_g, s.salt_g, s.ai_action_id, s.legacy_id);
  update diary.food_entries set deleted_at = now_ts
    where user_id = u and deleted_at is null and legacy_id is not null and (only_entries is null or legacy_id = any(only_entries))
      and legacy_id not in (select x->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'meals') = 'array' then doc->'meals' else '[]' end) x where x->>'id' is not null);

  -- Values the new rules refused, counted (the envelope still has the originals).
  insert into diary.fill_problems (user_id, kind, legacy_id, detail)
  select u, 'food_entry', x->>'id', k
  from jsonb_array_elements(case when jsonb_typeof(doc->'meals') = 'array' then doc->'meals' else '[]' end) x,
    lateral (values ('cal', diary.num(x->'cal'), 0, 100000), ('amount', diary.num(x->'amount'), 0.01, 100000), ('p', diary.num(x->'p'), 0, 10000),
                    ('c', diary.num(x->'c'), 0, 10000), ('f', diary.num(x->'f'), 0, 10000)) v(k, val, lo, hi)
  where (only_entries is null or x->>'id' = any(only_entries)) and v.val is not null and v.val not between v.lo and v.hi
  on conflict do nothing;

  -- ── Favourites (only foods that exist) ──
  merge into diary.favourite_foods t
  using (select u user_id, diary.legacy_uuid(u, 'food', f) food_id from unnest(favs) f
         where exists (select 1 from diary.foods x where x.id = diary.legacy_uuid(u, 'food', f))) s
  on t.user_id = s.user_id and t.food_id = s.food_id
  when matched and t.deleted_at is not null then update set deleted_at = null
  when not matched then insert (user_id, food_id) values (s.user_id, s.food_id);
  update diary.favourite_foods set deleted_at = now_ts
    where user_id = u and deleted_at is null and food_id not in (select diary.legacy_uuid(u, 'food', f) from unnest(favs) f);

  -- ── Water: one row per day with that day's total ──
  merge into diary.water_logs t
  using (
    select diary.legacy_uuid(u, 'water', d) id, u user_id, diary.day(d) local_date, round(diary.num(v))::int ml,
      diary.day(d)::timestamptz + interval '12 hours' logged_at, d legacy_id
    from jsonb_each(case when jsonb_typeof(doc->'water') = 'object' then doc->'water' else '{}' end) w(d, v)
    where diary.day(d) is not null and diary.num(v) between 1 and 10000
  ) s
  on t.id = s.id
  when matched and (t.ml, t.deleted_at) is distinct from (s.ml, null::timestamptz) then update set ml = s.ml, deleted_at = null
  when not matched then insert (id, user_id, local_date, ml, logged_at, legacy_id) values (s.id, s.user_id, s.local_date, s.ml, s.logged_at, s.legacy_id);
  update diary.water_logs set deleted_at = now_ts
    where user_id = u and deleted_at is null and legacy_id is not null
      and legacy_id not in (select d from jsonb_each(case when jsonb_typeof(doc->'water') = 'object' then doc->'water' else '{}' end) w(d, v) where diary.num(v) between 1 and 10000);
end $$;
revoke all on function diary.fill_nutrition(uuid, text[], jsonb) from public, anon, authenticated;

-- After every save: redo only the entries that changed; My foods, favourites and water are small and redone whole.
create or replace function diary.follow_nutrition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare changed text[];
begin
  begin
    -- Food that lives in the tables is written there directly (14-apply-training.sql), never copied from here.
    if new.payload->'$training' ? 'meals' then return null; end if;
    if tg_op = 'INSERT' then perform diary.fill_nutrition(new.user_id); return null; end if;
    if (old.payload->'meals', old.payload->'products', old.payload->'foodFavorites', old.payload->'water', old.payload->'mfdSettings'->'favouriteFoods')
       is not distinct from (new.payload->'meals', new.payload->'products', new.payload->'foodFavorites', new.payload->'water', new.payload->'mfdSettings'->'favouriteFoods') then
      return null;                                     -- nothing in nutrition changed
    end if;
    select array_agg(id) into changed from (
      select coalesce(n.x->>'id', o.x->>'id') id
      from (select x from jsonb_array_elements(case when jsonb_typeof(new.payload->'meals') = 'array' then new.payload->'meals' else '[]' end) x) n
      full join (select x from jsonb_array_elements(case when jsonb_typeof(old.payload->'meals') = 'array' then old.payload->'meals' else '[]' end) x) o on n.x->>'id' = o.x->>'id'
      where n.x is distinct from o.x) c where id is not null;
    perform diary.fill_nutrition(new.user_id, coalesce(changed, '{}'));
  exception when others then
    insert into diary.fill_problems (user_id, kind, legacy_id, detail)
    values (new.user_id, 'error', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'), left(sqlerrm, 500)) on conflict do nothing;
  end;
  return null;
end $$;
revoke all on function diary.follow_nutrition() from public, anon, authenticated;

-- Triggers on one event run in name order: diary_1_training, diary_2_nutrition, diary_3_body, diary_4_account.
drop trigger if exists follow_nutrition on public.forma_workspaces;
drop trigger if exists diary_2_nutrition on public.forma_workspaces;
create trigger diary_2_nutrition after insert or update of payload on public.forma_workspaces
  for each row execute function diary.follow_nutrition();

commit;
