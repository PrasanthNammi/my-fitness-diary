// MFD 3.0 database, update 1 (scripts-diary-update.cjs) on a database as installed on 2026-11-17: routine names
// forced unique, food entries rounded to 0.01, no tracking per workout exercise. A save swapping two routine names
// is refused there (noted, the save goes through) - as happened in production. The update fixes all three, copies
// the diaries again, clears the resolved notes, keeps every other row as it was, and is safe to run again.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync, mkdtempSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {tmpdir} = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111';
const T0 = Date.UTC(2026, 9, 1, 17);

const diary = (names = ['Upper 1', 'Upper 2']) => ({
  profile: { name: 'A', sex: 'male', height: 180, activity: 1.55, goal: 'Fat loss', days: 4, onboarded: true }, mfdSettings: {}, chat: [], active: null,
  folders: [], routines: names.map((name, i) => ({ id: 'r' + i, name, folderId: null, exercises: [] })),
  sessions: [{ id: 'w1', name: 'Upper', date: '2026-10-01', started: T0, finished: T0 + 3600000, routineId: null,
    sets: [{ id: 's1', exercise: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', tracking: 'weighted_bodyweight', type: 'normal', group: 0, set: 1, kg: 20, reps: 8, done: true, notes: '' },
           { id: 's2', exercise: 'Plank', catalogId: 'plank', catalogSource: 'MFD', tracking: 'duration', type: 'normal', group: 1, set: 1, kg: null, reps: null, duration_seconds: 60, done: true, notes: '' }] }],
  meals: [{ id: 'm1', date: '2026-10-01', meal: 'Dinner', name: 'Oats', amount: 47, unit: 'g', labelFood: { id: 'off-2', name: 'Oats', basis: 100, unit: 'g', cal: 371.3, p: 13.37, c: 58.71, f: 7.03 },
    cal: 174.511, p: 6.2839, c: 27.5937, f: 3.3041 }],
  weights: [{ id: 'k1', date: '2026-10-01', kg: 80.4 }], checkins: [], water: {},
});

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account'])
    await db.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));
  // As installed on 2026-11-17 (before these fixes): one-name rule on routines, entries rounded to 0.01. (The tracking
  // column didn't exist yet; here it stays empty until the update fills it.)
  await db.exec(`drop index diary.routines_by_name; create unique index routines_name on diary.routines (user_id, lower(btrim(name))) where deleted_at is null;
    alter table diary.food_entries alter column kcal type numeric(8,2), alter column protein_g type numeric(8,2), alter column carbs_g type numeric(8,2), alter column fat_g type numeric(8,2);`);
  const one = async (sql) => (await db.query(sql)).rows[0];
  await db.query('insert into public.forma_workspaces (user_id, payload) values ($1, $2)', [alice, JSON.stringify(diary())]);
  // The swap is refused by the one-name rule: noted, the save still goes through, the tables keep the old names.
  await db.query('update public.forma_workspaces set payload = $2 where user_id = $1', [alice, JSON.stringify(diary(['Upper 2', 'Upper 1']))]);
  assert.equal((await one(`select count(*)::int n from diary.fill_problems where detail like '%routines_name%'`)).n, 1);
  assert.equal((await one(`select name from diary.routines where legacy_id = 'r0'`)).name, 'Upper 1');
  assert.equal((await one(`select kcal::text k from diary.food_entries`)).k, '174.51');
  await db.exec('update diary.workout_exercises set tracking = null');
  const weighIn = await one(`select id, version from diary.weigh_ins`);

  // The update, twice (safe to run again).
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'mfd-update-')), 'update.sql');
  execFileSync(process.execPath, ['scripts-diary-update.cjs', '1', file], { stdio: 'pipe' });
  const sql = readFileSync(file, 'utf8');
  const res = await db.exec(sql);
  assert.deepEqual(res.at(-2).rows[0], { exercises_with_tracking: 2, food_entries: 1, problems_left: 0 });
  await db.exec(sql);

  assert.deepEqual((await db.query(`select legacy_id, name from diary.routines order by legacy_id`)).rows.map((r) => r.name), ['Upper 2', 'Upper 1'], 'names follow');
  assert.deepEqual((await db.query(`select tracking from diary.workout_exercises order by position`)).rows.map((r) => r.tracking), ['weighted_bodyweight', 'duration'], 'tracking as logged');
  assert.deepEqual(await one(`select kcal::text k, protein_g::text p from diary.food_entries`), { k: '174.511', p: '6.2839' }, 'values exactly as logged');
  assert.deepEqual(await one(`select id, version from diary.weigh_ins`), weighIn, 'untouched rows are not rewritten');
  const env = (await one(`select diary.as_envelope('${alice}') e`)).e;
  assert.deepEqual(env.sessions[0].sets.map((s) => s.tracking), ['weighted_bodyweight', 'duration']);
  assert.equal(env.meals[0].cal, 174.511);

  // And names can repeat from now on, like in the app.
  await db.query('update public.forma_workspaces set payload = $2 where user_id = $1', [alice, JSON.stringify(diary(['Upper', 'Upper']))]);
  assert.equal((await one(`select count(*)::int n from diary.routines where name = 'Upper' and deleted_at is null`)).n, 2);
  assert.equal((await one(`select count(*)::int n from diary.fill_problems`)).n, 0);

  console.log('diary update 1: routine-name swap and repeats follow, tracking kept as logged, entries exact, notes cleared, other rows untouched, safe to re-run');
})().catch((e) => { console.error(e); process.exit(1); });
