// MFD 3.0 database, update 2 (scripts-diary-update.cjs 2) on a database as it is after update 1: food labels still
// rounded to 0.01. After the update a label keeps its values exactly (salt 0.125, not 0.13), the AI connector's view
// of the diary has them, nothing else is rewritten, and the update is safe to run again.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync, mkdtempSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {tmpdir} = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111';

const doc = { profile: { name: 'A', sex: 'male', height: 180, activity: 1.55, goal: 'Maintain', days: 3, onboarded: true }, mfdSettings: {}, chat: [], active: null,
  folders: [], routines: [], sessions: [], checkins: [], water: {}, weights: [{ id: 'k1', date: '2026-10-01', kg: 80.4 }],
  meals: [{ id: 'm1', date: '2026-10-01', meal: 'Dinner', name: 'Oats', amount: 47, unit: 'g',
    labelFood: { id: 'off-2', name: 'Oats', basis: 100, unit: 'g', cal: 371.3, p: 13.37, c: 58.71, f: 7.035, salt: 0.125, sugar: 1.075 }, cal: 174.511, p: 6.2839, c: 27.5937, f: 3.3041 }] };

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account', '12-read'])
    await db.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));
  // As after update 1: labels rounded to 0.01.
  await db.exec(`alter table diary.foods alter column kcal type numeric(8,2), alter column protein_g type numeric(8,2), alter column carbs_g type numeric(8,2),
    alter column fat_g type numeric(8,2), alter column fibre_g type numeric(8,2), alter column sugars_g type numeric(8,2), alter column saturated_fat_g type numeric(8,2), alter column salt_g type numeric(8,2);`);
  await db.query('insert into public.forma_workspaces (user_id, payload) values ($1, $2)', [alice, JSON.stringify(doc)]);
  const one = async (sql) => (await db.query(sql)).rows[0];
  assert.deepEqual(await one(`select salt_g::text s, fat_g::text f from diary.foods`), { s: '0.13', f: '7.04' }, 'rounded before');
  const entry = await one(`select id, version from diary.food_entries`), weighIn = await one(`select id, version from diary.weigh_ins`);

  const file = path.join(mkdtempSync(path.join(tmpdir(), 'mfd-update2-')), 'update.sql');
  execFileSync(process.execPath, ['scripts-diary-update.cjs', '2', file], { stdio: 'pipe' });
  const sql = readFileSync(file, 'utf8');
  const res = await db.exec(sql);
  assert.deepEqual(res.at(-2).rows[0], { foods: 1, labels_with_more_than_2_decimals: 1, problems_left: 0 });
  await db.exec(sql);

  assert.deepEqual(await one(`select salt_g::text s, fat_g::text f, sugars_g::text g from diary.foods`), { s: '0.125', f: '7.035', g: '1.075' }, 'exact after');
  const label = (await one(`select diary.as_envelope('${alice}') e`)).e.meals[0].labelFood;
  assert.deepEqual([label.salt, label.f, label.sugar], [0.125, 7.035, 1.075]);
  assert.deepEqual(await one(`select id, version from diary.food_entries`), entry, 'entries untouched');
  assert.deepEqual(await one(`select id, version from diary.weigh_ins`), weighIn, 'other rows untouched');

  console.log('diary update 2: food labels keep their values exactly (salt 0.125), connector view has them, nothing else rewritten, safe to re-run');
})().catch((e) => { console.error(e); process.exit(1); });
