// MFD 3.0 database, nutrition: tables build (twice), fill from a production-shaped envelope and follow it.
// Every entry arrives with its stored values (snapshot), one food per label (newest version), My foods and
// favourites (both label shapes), water per day; small saves change only what changed; rules and ownership hold.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));

const label = (id, extra = {}) => ({ id, name: 'Skyr', brand: 'Arla', barcode: '4061462023842', basis: 100, unit: 'g', cal: 63, p: 11, c: 4, f: 0.2, sugar: 4, saturates: 0.1, salt: 0.1, source: 'Open Food Facts', ...extra });
function diary() {
  const meals = [];
  for (let i = 0; i < 30; i++) meals.push({ id: 'm' + i, date: `2026-11-${String(1 + (i % 15)).padStart(2, '0')}`, meal: ['Breakfast', 'Lunch', 'Dinner', 'Snack'][i % 4], name: 'Skyr', amount: 150, unit: 'g',
    labelFood: label('off-4061462023842'), cal: 94.5, p: 16.5, c: 6, f: 0.3, sugar: 6, saturates: 0.15, salt: 0.15 });
  // The same label, changed later (newest version wins for the food; each entry keeps its own values).
  meals.push({ id: 'm-new', date: '2026-11-16', meal: 'Snack', name: 'Skyr', amount: 200, unit: 'g', labelFood: label('off-4061462023842', { cal: 60, p: 12 }), cal: 120, p: 24, c: 8, f: 0.4 });
  // A serving-based food added by an assistant, a ml drink, and an older entry without labelFood details.
  meals.push({ id: 'm-ai', date: '2026-11-17', meal: 'Lunch', name: 'Toor dal', amount: 1, unit: 'serving', labelFood: { id: 'mcp-1', name: 'Toor dal', basis: 1, unit: 'serving', cal: 350, p: 18, c: 50, f: 8, servingSize: 300, servingLabel: '1 bowl' }, cal: 350, p: 18, c: 50, f: 8, addedBy: { connection: 'https://claude.ai/x', at: '2026-11-17T12:00:00Z' } });
  meals.push({ id: 'm-ml', date: '2026-11-17', meal: 'Snack', name: 'Cola Zero', amount: 330, unit: 'ml', labelFood: { id: 'off-5449000131805', name: 'Cola Zero', basis: 100, unit: 'ml', cal: 0.3, p: 0, c: 0, f: 0, barcode: '5449000131805' }, cal: 1, p: 0, c: 0, f: 0 });
  meals.push({ id: 'm-old', date: '2026-10-01', meal: 'Dinner', name: 'Pasta', grams: 250, labelFood: { id: 'legacy-m-old', name: 'Pasta', basis: 250, unit: 'g', cal: 400, p: 14, c: 75, f: 3 }, cal: 400, p: 14, c: 75, f: 3 });
  return {
    profile: { name: 'A', cal: 2200, protein: 130, carbs: 260, fat: 70, days: 3 }, sessions: [], routines: [], folders: [], weights: [], checkins: [], chat: [], active: null,
    meals, products: [label('mcp-mine', { name: 'Protein Bar', barcode: '1234567890123', cal: 380 })],
    foodFavorites: ['off-4061462023842', 'fav-only'],
    mfdSettings: { favouriteFoods: [{ id: 'fav-only', name: 'Banana', kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, refAmount: 100, refUnit: 'g', fibre: 2.6 }] },
    water: { '2026-11-16': 2250, '2026-11-17': 750, 'bad': 5 },
  };
}

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into auth.users values ('${alice}'), ('${bob}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of files) await db.exec(f);
  for (const f of files) await db.exec(f);
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const all = async (sql, p = []) => (await db.query(sql, p)).rows;
  const save = async (u, d) => db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2) on conflict (user_id) do update set payload = excluded.payload, revision = public.forma_workspaces.revision + 1`, [u, JSON.stringify(d)]);
  const live = async (t, u = alice) => (await one(`select count(*)::int n from diary.${t} where user_id = $1 and deleted_at is null`, [u])).n;
  const top = async (u = alice) => (await one(`select last_version v from diary.sync_counters where user_id = $1`, [u])).v;

  const d = diary();
  await save(alice, d);
  assert.deepEqual(await all(`select kind, detail from diary.fill_problems`), [], 'no errors');
  assert.equal(await live('food_entries'), d.meals.length);
  // Every entry keeps exactly the values stored for it.
  for (const m of d.meals) {
    const r = await one(`select local_date::text, meal, name, amount::float, unit, kcal::float, protein_g::float p, fat_g::float f, sugars_g::float sugar from diary.food_entries where legacy_id = $1`, [m.id]);
    assert.deepEqual([r.local_date, r.meal, r.name, r.amount, r.unit, r.kcal, r.p, r.f, r.sugar], [m.date, m.meal.toLowerCase(), m.name, m.amount ?? m.grams, m.unit ?? 'g', m.cal, m.p, m.f, m.sugar ?? null], m.id);
  }
  console.log(`PASS entries: all ${d.meals.length} with their day, meal, amount, unit and stored values (g, ml, serving; older entries too)`);

  // Foods: one per label, the newest version; snapshot entries unaffected.
  const skyr = await one(`select kcal::float, protein_g::float p, barcode, source, in_my_foods from diary.foods where legacy_id = 'off-4061462023842'`);
  assert.deepEqual(skyr, { kcal: 60, p: 12, barcode: '4061462023842', source: 'Open Food Facts', in_my_foods: false }, 'the newest version of the label');
  assert.equal((await one(`select kcal::float k from diary.food_entries where legacy_id = 'm0'`)).k, 94.5, 'older entries keep their own values');
  assert.deepEqual(await one(`select basis_amount::float b, basis_unit, serving_size::float s, serving_label from diary.foods where legacy_id = 'mcp-1'`), { b: 1, basis_unit: 'serving', s: 300, serving_label: '1 bowl' });
  assert.deepEqual(await one(`select name, in_my_foods from diary.foods where legacy_id = 'mcp-mine'`), { name: 'Protein Bar', in_my_foods: true });
  assert.deepEqual(await one(`select name, kcal::float, fibre_g::float fibre from diary.foods where legacy_id = 'fav-only'`), { name: 'Banana', kcal: 89, fibre: 2.6 }, 'a favourite only kept in settings becomes a food too');
  assert.deepEqual((await all(`select f.name from diary.favourite_foods x join diary.foods f on f.id = x.food_id where x.user_id = $1 and x.deleted_at is null order by 1`, [alice])).map((r) => r.name), ['Banana', 'Skyr']);
  assert.equal(await live('foods'), 6, 'Skyr, Toor dal, Cola Zero, Pasta, Protein Bar, Banana');
  assert.deepEqual(await all(`select local_date::text d, ml from diary.water_logs where user_id = $1 order by 1`, [alice]), [{ d: '2026-11-16', ml: 2250 }, { d: '2026-11-17', ml: 750 }], 'water per day (a bad day key is skipped)');
  console.log('PASS foods: one per label (newest version), My foods, favourites in both old shapes, water per day');

  // Small saves.
  let v = await top();
  await db.query(`select diary.fill_nutrition($1)`, [alice]);
  assert.equal(await top(), v, 'filling again changes nothing');
  d.meals[3].amount = 175; d.meals[3].cal = 110.25; await save(alice, d);
  assert.equal(await top(), v + 1, 'one entry changed, one row');
  // Editing an old entry doesn't bring back an older version of its food's label.
  d.meals[0].amount = 160; await save(alice, d);
  assert.equal((await one(`select kcal::float k from diary.foods where legacy_id = 'off-4061462023842'`)).k, 60, 'the food keeps its newest label');
  v = await top(); d.water['2026-11-17'] = 1000; await save(alice, d);
  assert.equal(await top(), v + 1, 'one day of water, one row');
  v = await top(); d.sessions.push({ id: 'w1', name: 'Push', date: '2026-11-17', started: 1.79e12, finished: 1.79e12 + 3.6e6, sets: [] }); await save(alice, d);
  assert.equal((await one(`select count(*)::int n from diary.food_entries where version > $1`, [v])).n, 0, 'a workout save leaves nutrition alone');
  d.meals = d.meals.filter((m) => m.id !== 'm5'); d.products = []; d.foodFavorites = ['fav-only']; delete d.water['2026-11-16']; await save(alice, d);
  assert.equal((await one(`select deleted_at is not null gone from diary.food_entries where legacy_id = 'm5'`)).gone, true, 'deleted entry');
  assert.equal((await one(`select in_my_foods from diary.foods where legacy_id = 'mcp-mine'`)).in_my_foods, false, 'removed from My foods: kept, flag off');
  assert.equal(await live('favourite_foods'), 1); assert.equal(await live('water_logs'), 1);
  console.log('PASS small saves: one changed entry or water day = one row; workout saves leave nutrition alone; deletions, My foods and favourites follow');

  // Rules and ownership.
  await save(bob, { ...diary(), meals: diary().meals.slice(0, 2) });
  assert.equal(await live('food_entries', bob), 2); assert.equal(await live('food_entries'), d.meals.length);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: bob })]); await db.exec('set role authenticated');
  assert.equal((await one(`select count(*)::int n from diary.food_entries`)).n, 2, 'Bob sees only his entries');
  const aliceFood = (await db.query(`select id from diary.foods where legacy_id = 'mcp-mine'`)).rows.length;
  assert.equal(aliceFood, 1, 'only his own copy of the same label (each person has their own foods)');
  const alicesOwn = await (async () => { await db.exec('reset role'); return (await one(`select id from diary.foods where user_id = $1 and legacy_id = 'mcp-1'`, [alice])).id; })();
  await db.exec('set role authenticated');
  await assert.rejects(db.query(`insert into diary.food_entries (user_id, local_date, meal, food_id, name, amount, unit, kcal) values ($1, '2026-11-17', 'lunch', $2, 'X', 1, 'g', 1)`, [bob, alicesOwn]), /Unknown food/, 'can\'t log someone else\'s food');
  await assert.rejects(db.query(`insert into diary.food_entries (user_id, local_date, meal, name, amount, unit, kcal) values ($1, '2026-11-17', 'brunch', 'X', 1, 'g', 1)`, [bob]), /check/, 'meal must be one of the four');
  await assert.rejects(db.query(`insert into diary.food_entries (user_id, local_date, meal, name, amount, unit, kcal) values ($1, '2026-11-17', 'lunch', 'X', -1, 'g', 1)`, [bob]), /check/, 'amount above 0');
  await assert.rejects(db.query(`insert into diary.water_logs (user_id, local_date, ml) values ($1, '2026-11-17', 50000)`, [bob]), /check/, 'water 1–10,000 ml');
  await db.exec('reset role');
  console.log('PASS rules: each person sees and links only their own foods and entries; meal, amount and water limits hold');
})().catch((e) => { console.error(e); process.exit(1); });
