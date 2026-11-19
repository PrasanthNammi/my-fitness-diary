// MFD 3.0 database, the real install (scripts-diary-install.cjs): the numbered files, run in order on a database that
// already holds diaries, fill every diary once (report all OK), give exactly the same library and tables as running
// database/diary/01–11 in order, are safe to run again in any order, and leave the follow triggers working.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync, readdirSync, mkdtempSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {tmpdir} = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const T0 = Date.UTC(2026, 9, 1, 17);

const dir = mkdtempSync(path.join(tmpdir(), 'mfd-install-'));
execFileSync(process.execPath, ['scripts-diary-install.cjs', dir], { stdio: 'pipe' });
const parts = readdirSync(dir).sort((a, b) => parseInt(a) - parseInt(b)).map((f) => ({ f, sql: readFileSync(path.join(dir, f), 'utf8') }));
const direct = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account']
  .map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));

function diary(who) {
  const sessions = Array.from({ length: 6 }, (_, k) => {
    const started = T0 + k * 86400000;
    return { id: `${who}-w${k}`, name: 'Push', date: new Date(started).toISOString().slice(0, 10), started, finished: started + 3600000,
      sets: [0, 1, 2].map((i) => ({ id: `${who}-w${k}-s${i}`, exercise: 'Bench Press', catalogId: 'bench_press_barbell', catalogSource: 'MFD', tracking: 'weight_reps', type: 'normal', group: 0, set: i + 1, kg: 60 + i * 2.5, reps: 8, done: true }))
        .concat([{ id: `${who}-w${k}-c`, exercise: 'Band Walk', catalogId: 'custom:band', catalogSource: 'Custom', tracking: 'reps', type: 'normal', group: 1, set: 1, kg: null, reps: 20, done: k % 2 === 0 }]) };
  });
  return {
    profile: { name: 'Alex M', firstName: 'Alex', lastName: 'M', sex: 'male', height: 180, weight: 80, target: 76, activity: 1.725, goal: 'Fat loss', days: 4, onboarded: true, waterGoalMl: 3000, cal: 2400, protein: 160, carbs: 250, fat: 70 },
    mfdSettings: { weightUnit: 'kg', energyUnit: 'kcal', defaultRestSec: 120, weekStart: 1 },
    mfdExercises: [{ id: 'custom:band', name: 'Band Walk', tracking: 'reps', source: 'custom' }],
    folders: [{ id: 'f1', name: 'Push Pull Legs' }],
    routines: [{ id: 'r1', name: 'Push A', folderId: 'f1', exercises: [{ name: 'Bench Press', catalogId: 'bench_press_barbell', sets: 3, reps: 8, kg: 80, rest: 120 }] }],
    sessions, active: null, chat: [],
    // The same food label for both people (each gets their own copy).
    meals: [{ id: `${who}-m1`, date: '2026-11-16', meal: 'Lunch', name: 'Rice', amount: 200, unit: 'g', labelFood: { id: 'x-rice', name: 'Rice', basis: 100, unit: 'g', cal: 130, p: 2.7, c: 28, f: 0.3 }, cal: 260, p: 5.4, c: 56, f: 0.6 }],
    weights: [{ id: `${who}-kg1`, date: '2026-11-16', kg: 79.5 }],
    checkins: [{ id: 'c1', date: '2026-11-16', sleep: 7.5, energy: 4 }, { id: 'm1', date: '2026-11-16', waist: 84, note: '' }],
    water: { '2026-11-16': 2500 },
  };
}

async function fresh() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}'), ('${bob}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  // Diaries saved before the install, like production.
  for (const u of [alice, bob]) await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [u, JSON.stringify(diary(u === alice ? 'a' : 'b'))]);
  return db;
}
const rows = async (db, sql) => (await db.query(sql)).rows;
// Everything that matters, without the bookkeeping columns (versions and times differ by run).
const snapshot = async (db) => {
  const out = {};
  for (const [t, order] of [['muscle_groups', 'key'], ['muscles', 'key'], ['equipment', 'key'], ['exercise_muscle_groups', '1, 2, 3'], ['exercise_muscles', '1, 2, 3'], ['exercise_equipment', '1, 2']]) out[t] = await rows(db, `select * from diary.${t} order by ${order}`);
  out.exercises = await rows(db, `select id, user_id, source, source_ref, name, aliases, category, tracking, description, setup, steps, cues, mistakes, media_url, credit, licence from diary.exercises order by id`);
  for (const t of ['workouts', 'workout_exercises', 'workout_sets', 'routines', 'routine_folders', 'foods', 'food_entries', 'water_logs', 'weigh_ins', 'body_measurements', 'recovery_days', 'user_profiles', 'user_goals', 'user_settings']) {
    out[t] = (await rows(db, `select count(*)::int n from diary.${t} where deleted_at is null`))[0].n;
  }
  return out;
};

(async () => {
  // The install, file by file, in number order.
  const db = await fresh();
  assert.ok(parts.length >= 3 && parts[0].f === '1-tables.sql', parts.map((p) => p.f).join());
  for (const p of parts) assert.ok(p.sql.length < 260 * 1024, `${p.f} is ${p.sql.length} bytes`);
  await db.exec(parts[0].sql);
  assert.equal(parts[1].f, '2-tables-and-fill.sql');
  const res = await db.exec(parts[1].sql);
  const report = res.filter((r) => r.rows.length && 'result' in r.rows[0]).pop().rows;
  assert.equal(report.length, 23);
  assert.deepEqual(report.filter((r) => r.result !== 'OK'), [], 'report has no DIFFERENT/LOOK lines');
  assert.equal(report.find((r) => r.item === 'foods (labels per person)').new, '2');
  for (const p of parts.slice(2)) await db.exec(p.sql);
  const installed = await snapshot(db);

  // Same as running 01–11 in order and filling.
  const ref = await fresh();
  for (const f of direct) await ref.exec(f);
  await ref.exec(`do $$ declare u uuid; begin for u in select user_id from public.forma_workspaces loop
    perform diary.fill_training(u); perform diary.fill_nutrition(u); perform diary.fill_body(u); perform diary.fill_account(u); end loop; end $$;`);
  assert.deepEqual(installed, await snapshot(ref));
  assert.equal(installed.exercises.filter((e) => e.user_id === null).length, JSON.parse(readFileSync('public/catalogue/mfd_exercises.json', 'utf8')).exercises.length);

  // Safe to run again, in any order: nothing changes and no sync numbers are used up.
  const top = async () => (await rows(db, `select coalesce(sum(last_version), 0)::int v from diary.sync_counters`))[0].v;
  const before = await top();
  for (const p of [...parts].reverse()) await db.exec(p.sql);
  assert.deepEqual(await snapshot(db), installed);
  assert.equal(await top(), before, 'running again used no sync numbers');

  // The follow triggers are live: a save with one more workout appears in the tables.
  const d = diary('a');
  d.sessions.push({ ...d.sessions[0], id: 'a-w-new', started: T0 + 10 * 86400000, finished: T0 + 10 * 86400000 + 3600000, date: '2026-10-11', sets: d.sessions[0].sets.map((s) => ({ ...s, id: 'new-' + s.id })) });
  await db.query(`update public.forma_workspaces set payload = $2 where user_id = $1`, [alice, JSON.stringify(d)]);
  assert.equal((await rows(db, `select count(*)::int n from diary.workouts where user_id = '${alice}' and deleted_at is null`))[0].n, 7);
  assert.equal((await rows(db, `select count(*)::int n from diary.fill_problems`))[0].n, 0);

  console.log(`diary install: ${parts.length} files, report all OK, same as 01–11, re-runnable, triggers live`);
})().catch((e) => { console.error(e); process.exit(1); });
