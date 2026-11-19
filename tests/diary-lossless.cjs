// Database move, step 2a: the training tables give back EXACTLY what the app stored (the "extra" column in
// 03-training.sql, filled by 05-fill-training.sql, put back by 12-read.sql). A diary full of awkward cases is saved
// and diary.training_json must equal its training part as JSON, value for value and in the same order; after a
// later save that ticks one set and adds a workout, it still does. Also: target weights (mfdSuggested.weightKg)
// reach the planned_weight_kg column.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body',
  '10-account', '11-fill-account', '12-read', '13-save-rows'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));
const T0 = Date.UTC(2026, 10, 1, 17);
const KEYS = ['sessions', 'active', 'folders', 'routines', 'mfdExercises'];

function diary() {
  const set = (w, i, o = {}) => ({id: `${w}-s${i}`, exercise: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', tracking: 'weight_reps',
    type: 'normal', group: 0, set: i + 1, kg: 60, reps: 8, done: true, notes: '', ...o});
  return {
    profile: {name: 'Alex', onboarded: true}, meals: [], weights: [], checkins: [], chat: [], folderOpen: {f1: true},
    folders: [{id: 'f1', name: 'Push Pull Legs'}, {id: 'f2', name: 'Arms', colour: 'orange'}],
    mfdExercises: [{id: 'custom:band', name: 'Band Walk', tracking: 'reps', source: 'custom', muscle: 'Glutes'}, {id: 'custom:sled', name: 'Sled Push', tracking: 'distance_time', source: 'custom'}],
    routines: [
      {id: 'r1', name: 'Push A', folderId: 'f1', createdAt: 1, updatedAt: 2, exercises: [
        {name: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', sets: 2, reps: 8, kg: 80, rest: 120, notes: '', superset_id: null,
          setDetails: [{id: 'r1:0:1', exercise: 'Bench Press (Barbell)', group: 0, set: 1, type: 'warmup', kg: 40, reps: 10, tracking: 'weight_reps', done: true},
                       {id: 'r1:0:2', exercise: 'Bench Press (Barbell)', group: 0, set: 2, type: 'normal', kg: 80, reps: 8, tracking: 'weight_reps', done: true, mfdUnusualOk: true}]},
        {name: 'Band Walk', catalogId: 'custom:band', sets: 3, reps: 15, kg: 0, rest: 60}]},
      {id: 'r2', name: 'Legs', folderId: null, exercises: [{name: 'Sled Push', catalogId: 'custom:sled', sets: 2, reps: 0, kg: 0, rest: 90, setDetails: []}]},
      {id: 'r3', name: 'Empty plan', folderId: 'f2', exercises: []},
    ],
    // Not in date order, with Hevy bookkeeping, explicit empties, a detail the tables never heard of, odd decimals.
    sessions: [
      {id: 'w2', name: 'Pull', date: '2026-11-03', started: T0 + 2 * 864e5, finished: T0 + 2 * 864e5 + 36e5, routineId: null, notes: '', rest: {}, sample: false,
        sets: [set('w2', 1, {set: 2, kg: 12.345, reps: null}), set('w2', 0, {type: 'warmup', kg: null, legacyCatalogId: 'hevy:abc', sourceSetIndex: 0}),
               set('w2', 2, {exercise: 'Lat Pulldown', catalogId: 'hevy:lat', catalogSource: 'Hevy', group: 1, set: 1, kg: 50, mfdUnusualOk: true})]},
      {id: 'w1', name: 'Push', date: '2026-11-01', started: T0, finished: T0 + 36e5, routineId: 'r1',
        sets: [set('w1', 0, {mfdSuggested: {weightKg: 82.5, reps: 8, timeSec: null, distanceKm: null, floors: null, steps: null}, mfdAi: true, mfdDoneAt: T0 + 6e5}),
               set('w1', 1, {exercise: 'Band Walk', catalogId: 'custom:band', catalogSource: 'Custom', tracking: 'reps', group: 1, set: 1, kg: null, reps: 15, superset_id: '0'})]},
    ],
    active: {id: 'live', name: 'Legs', date: '2026-11-19', started: T0 + 18 * 864e5, finished: null, routineId: 'r2', clock: {paused: false},
      rest: {0: {duration: 90, end: T0 + 18 * 864e5 + 6e5}}, sets: [set('live', 0, {exercise: 'Sled Push', catalogId: 'custom:sled', catalogSource: 'Custom', tracking: 'distance_time', kg: null, reps: null, distance_meters: 20, duration_seconds: 30, done: false})]},
  };
}

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}'); grant usage on schema auth to authenticated;`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of files) await db.exec(f);
  const d = diary();
  await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [alice, JSON.stringify(d)]);
  const training = async () => (await db.query(`select diary.training_json($1) t`, [alice])).rows[0].t;
  const same = async (doc, label) => {
    const t = await training();
    for (const k of KEYS) assert.deepEqual(t[k], doc[k] ?? null, `${label}: ${k}`);
    // As JSON values (numbers, nulls, key sets), and lists in the same order.
    const eq = (await db.query(`select (select payload from public.forma_workspaces where user_id = $1) - 'profile' - 'meals' - 'weights' - 'checkins' - 'chat' - 'folderOpen'
      = diary.training_json($1) - 'x' as same`, [alice])).rows[0].same;
    assert.equal(eq, true, `${label}: equal as JSON`);
  };
  await same(d, 'first save');
  assert.equal((await db.query(`select count(*)::int n from diary.fill_problems where kind = 'error'`)).rows[0].n, 0);
  // The AI target weight reaches its column (it was lost before: the app stores weightKg).
  assert.equal(Number((await db.query(`select planned_weight_kg from diary.workout_sets where legacy_id = 'w1:w1-s0'`)).rows[0].planned_weight_kg), 82.5);

  // Later saves: one set ticked differently, a workout added at the front, a routine renamed, an exercise listed first.
  d.sessions[1].sets[1].reps = 16;
  d.sessions.unshift({id: 'w3', name: 'Arms', date: '2026-11-05', started: T0 + 4 * 864e5, finished: T0 + 4 * 864e5 + 18e5, sets: [set('w3', 0, {kg: 22.5})]});
  d.routines[0].name = 'Push A (new)';
  d.mfdExercises.reverse();
  await db.query(`update public.forma_workspaces set payload = $2 where user_id = $1`, [alice, JSON.stringify(d)]);
  await same(d, 'after later saves');
  // The running workout finished: it moves to the list, nothing left running.
  d.sessions.push({...d.active, id: 'w4', finished: T0 + 18 * 864e5 + 36e5, sets: d.active.sets.map((s) => ({...s, id: 'w4-s0', done: true}))});
  delete d.sessions.at(-1).clock; delete d.sessions.at(-1).rest;
  d.active = null;
  await db.query(`update public.forma_workspaces set payload = $2 where user_id = $1`, [alice, JSON.stringify(d)]);
  await same(d, 'after finishing');
  console.log('PASS lossless: training comes back exactly as stored (order, empties, unknown details, decimals, running workout, plans), also after later saves; AI target weights kept');
})().catch((e) => { console.error(e); process.exit(1); });

function set(w, i, o = {}) {
  return {id: `${w}-s${i}`, exercise: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', tracking: 'weight_reps',
    type: 'normal', group: 0, set: i + 1, kg: 60, reps: 8, done: true, notes: '', ...o};
}
