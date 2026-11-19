// MFD 3.0 database, step 2 (filling): the training tables follow the old envelope on embedded PostgreSQL.
// A diary shaped like production fills completely (every workout, set and value, nothing lost, own exercises
// one per name, built-in ones linked), filling again changes nothing, a save that ticks one set only touches that
// set, deletions and finishing a running workout follow, and an unexpected error never blocks the app's save.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));
const T0 = Date.UTC(2026, 9, 1, 17);

// A diary like production: built-in exercises by library id, own exercises ('custom:'), old auto-made ones
// ('history:'), Hevy imports, routines with and without per-set details, a folder, heart rate, odd values.
function diary() {
  const set = (w, g, i, extra = {}) => ({ id: `${w}-s${g}-${i}`, exercise: ['Bench Press', 'Squat', 'Lat Pulldown', 'Face Pull (Cable)'][g], catalogId: ['bench_press_barbell', 'squat_barbell', 'lat_pulldown_cable', 'history:face%20pull%20(cable)'][g],
    catalogSource: g === 3 ? undefined : 'MFD', tracking: 'weight_reps', type: i === 0 ? 'warmup' : 'normal', group: g, set: i + 1, kg: 60 + i * 2.5, reps: 8, done: true, notes: '', ...extra });
  const sessions = Array.from({ length: 40 }, (_, k) => {
    const w = 'w' + k, started = T0 + k * 86400000;
    const sets = [];
    for (let g = 0; g < 4; g++) for (let i = 0; i < 4; i++) sets.push(set(w, g, i, k === 3 && g === 0 && i === 1 ? { rpe: 0 } : k === 4 && g === 1 && i === 2 ? { reps: '9' } : {}));
    if (k === 5) sets.push({ id: `${w}-c`, exercise: 'Band Walk', catalogId: 'custom:band', catalogSource: 'Custom', tracking: 'reps', type: 'normal', group: 4, set: 1, kg: null, reps: 20, done: true });
    if (k === 6) sets.push({ id: `${w}-run`, exercise: 'Running', catalogId: 'running', catalogSource: 'MFD', tracking: 'distance_time', type: 'normal', group: 4, set: 1, distance_meters: 5000, duration_seconds: 1500, done: true, superset_id: 'A' });
    const s = { id: w, name: k % 2 ? 'Pull' : 'Push', date: new Date(started).toISOString().slice(0, 10), started, finished: started + 3600000, routineId: k < 3 ? 'r1' : null, sets };
    if (k < 30) Object.assign(s, { source: 'hevy', importKey: `${s.name.toLowerCase()}|${started / 1000}`, importTimezone: 'Europe/Berlin' });
    if (k === 39) Object.assign(s, { heartRate: { interval: 15, bpm: [0, 120, 130, 145], avg: 132, max: 150, source: 'watch' }, sets: sets.map((x) => ({ ...x, mfdDoneAt: started + 600000 })) });
    return s;
  });
  return {
    profile: { name: 'A', cal: 2200, protein: 130, carbs: 260, fat: 70, days: 3 }, meals: [], weights: [], checkins: [], chat: [],
    folders: [{ id: 'f1', name: 'Push Pull Legs' }], folderOpen: { f1: true },
    mfdExercises: [{ id: 'custom:band', name: 'Band Walk', tracking: 'reps', source: 'custom' }, { id: 'custom:unused', name: 'Neck Curl', tracking: 'weight_reps', source: 'custom' },
      { id: 'history:old%20thing', name: 'Old Thing', tracking: 'reps', source: 'custom' }],
    routines: [
      { id: 'r1', name: 'Push A', folderId: 'f1', exercises: [{ name: 'Bench Press', catalogId: 'bench_press_barbell', sets: 3, reps: 8, kg: 80, rest: 120, notes: 'Pause', setDetails: [{ type: 'warmup', kg: 40, reps: 10 }, { type: 'normal', kg: 80, reps: 8 }, { type: 'dropset', kg: 60, reps: 12 }] }] },
      { id: 'r2', name: 'Legs', folderId: null, exercises: [{ name: 'Squat', catalogId: 'squat_barbell', sets: 2, reps: 5, kg: 100, rest: 180 }, { name: 'Face Pull (Cable)', catalogId: 'history:face%20pull%20(cable)', sets: 1, reps: 15, kg: 20, rest: 60, superset_id: 'x' }] },
    ],
    sessions, active: null, water: {},
  };
}

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}'), ('${bob}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of files) await db.exec(f);
  for (const f of files) await db.exec(f); // safe to re-run
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const all = async (sql, p = []) => (await db.query(sql, p)).rows;
  const save = async (u, d) => db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2) on conflict (user_id) do update set payload = excluded.payload, revision = public.forma_workspaces.revision + 1`, [u, JSON.stringify(d)]);
  const live = async (t, u = alice) => (await one(`select count(*)::int n from diary.${t} where user_id = $1 and deleted_at is null`, [u])).n;
  const top = async (u = alice) => (await one(`select last_version v from diary.sync_counters where user_id = $1`, [u])).v;

  // First save: everything appears.
  const d = diary();
  await save(alice, d);
  const sets = d.sessions.reduce((n, s) => n + s.sets.length, 0);
  assert.deepEqual([await live('workouts'), await live('workout_sets'), await live('routines'), await live('routine_folders'), await live('routine_sets')], [40, sets, 2, 1, 6]);
  assert.equal(await live('workout_exercises'), 40 * 4 + 2);
  // Every value arrived: compare each set with its original.
  const rows = await all(`select legacy_id, weight_kg::float kg, reps, set_type, rpe::float rpe, distance_m::float dist, duration_s, completed_at from diary.workout_sets where user_id = $1`, [alice]);
  const byId = new Map(rows.map((r) => [r.legacy_id, r]));
  for (const s of d.sessions) for (const x of s.sets) {
    const r = byId.get(`${s.id}:${x.id}`); assert.ok(r, x.id);
    assert.equal(r.kg, x.kg ?? null, x.id); assert.equal(r.reps, x.reps == null ? null : Number(x.reps), x.id);
    assert.equal(r.set_type, x.type === 'warmup' ? 'warmup' : 'normal');
    assert.equal(r.dist, x.distance_meters ?? null); assert.equal(r.duration_s, x.duration_seconds ?? null);
    assert.equal(new Date(r.completed_at).getTime(), x.mfdDoneAt ?? s.finished, 'completed when ticked, else at the end');
  }
  assert.equal(byId.get('w3:w3-s0-1').rpe, null, 'RPE 0 (Hevy "none") is left empty');
  assert.deepEqual(await all(`select kind, detail from diary.fill_problems where user_id = $1`, [alice]), [{ kind: 'workout_set', detail: 'rpe' }], 'and counted');
  assert.equal(byId.get('w4:w4-s1-2').reps, 9, 'numbers stored as text in older entries are read');
  console.log(`PASS first fill: 40 workouts, ${sets} sets with every value, 2 routines with 6 planned sets, 1 folder; out-of-range values left empty and counted`);

  // Exercises: built-in ones linked; own ones once per name; unused auto-made "history" ones left out.
  const ex = await all(`select e.name, e.source, e.legacy_id from diary.exercises e where e.user_id = $1 order by e.name`, [alice]);
  assert.deepEqual(ex.map((e) => e.name), ['Band Walk', 'Face Pull (Cable)', 'Neck Curl', 'Old Thing'], 'every exercise in My exercises, also unused auto-made ones (step 2a)');
  const bench = await one(`select count(*)::int n from diary.workout_exercises we join diary.exercises e on e.id = we.exercise_id where we.user_id = $1 and e.source = 'mfd' and e.source_ref = 'bench_press_barbell'`, [alice]);
  assert.equal(bench.n, 40, 'built-in exercises are linked, not copied');
  const r1 = await one(`select r.name, f.name folder, (select count(*)::int from diary.routine_sets s join diary.routine_exercises x on x.id = s.routine_exercise_id where x.routine_id = r.id) planned,
    (select array_agg(set_type order by s.position) from diary.routine_sets s join diary.routine_exercises x on x.id = s.routine_exercise_id where x.routine_id = r.id) types
    from diary.routines r left join diary.routine_folders f on f.id = r.folder_id where r.legacy_id = 'r1'`);
  assert.deepEqual(r1, { name: 'Push A', folder: 'Push Pull Legs', planned: 3, types: ['warmup', 'normal', 'drop'] });
  assert.equal((await one(`select count(*)::int n from diary.workouts where routine_id is not null`)).n, 3, 'workouts keep their routine');
  assert.equal((await one(`select count(*)::int n from diary.workouts where source = 'hevy_import' and import_key is not null`)).n, 30);
  assert.deepEqual(await one(`select bpm, avg_bpm, max_bpm, source from diary.workout_heart_rate`), { bpm: [0, 120, 130, 145], avg_bpm: 132, max_bpm: 150, source: 'watch' });
  console.log('PASS links: built-in exercises linked by library id; own exercises once per name (every one in My exercises); routines keep folder and set types; heart rate kept');

  // Filling again changes nothing (no new sync numbers).
  let v = await top();
  await db.query(`select diary.fill_training($1)`, [alice]);
  assert.equal(await top(), v, 'no row rewritten');
  // A save that ticks one set touches exactly that set.
  d.sessions[39].sets[5].reps = 10;
  await save(alice, d);
  assert.equal(await top(), v + 1, 'one change, one new number');
  assert.equal((await one(`select reps from diary.workout_sets where legacy_id = 'w39:w39-s1-1'`)).reps, 10);
  v = await top();
  // A save that changes nothing training-related (food) touches nothing.
  d.meals.push({ id: 'm1', date: '2026-11-01', name: 'Oats', cal: 300 });
  await save(alice, d);
  assert.equal(await top(), v, 'other parts of the diary don\'t touch the training tables');
  console.log('PASS small updates: filling again rewrites nothing; ticking one set changes exactly one row; food saves leave training alone');

  // A running workout, finished into history; deleting a workout and a routine.
  d.active = { id: 'act', name: 'Push', date: '2026-11-17', started: T0 + 50 * 86400000, routineId: 'r1', rest: { 0: { duration: 90, end: T0 + 50 * 86400000 + 300000 } },
    sets: [{ id: 'a1', exercise: 'Bench Press', catalogId: 'bench_press_barbell', type: 'normal', group: 0, set: 1, kg: 80, reps: 8, done: true, mfdDoneAt: T0 + 50 * 86400000 + 200000 }, { id: 'a2', exercise: 'Bench Press', catalogId: 'bench_press_barbell', type: 'normal', group: 0, set: 2, kg: 80, reps: null, done: false }] };
  await save(alice, d);
  const running = await one(`select w.ended_at, (select count(*) filter (where completed_at is not null)::int from diary.workout_sets s join diary.workout_exercises x on x.id = s.workout_exercise_id where x.workout_id = w.id) ticked,
    (select rest_ends_at from diary.workout_exercises where workout_id = w.id) rest from diary.workouts w where legacy_id = 'act'`);
  assert.equal(running.ended_at, null); assert.equal(running.ticked, 1); assert.ok(running.rest, 'running rest timer');
  d.sessions.push({ ...d.active, finished: d.active.started + 3600000, sets: d.active.sets.filter((x) => x.done) }); d.active = null;
  await save(alice, d);
  assert.ok((await one(`select ended_at from diary.workouts where legacy_id = 'act' and deleted_at is null`)).ended_at, 'finished: same workout, now with an end');
  assert.equal(await live('workout_sets'), sets + 1, 'the unticked set is gone with it');
  d.sessions = d.sessions.filter((s) => s.id !== 'w0'); d.routines = d.routines.filter((r) => r.id !== 'r2');
  await save(alice, d);
  assert.equal((await one(`select count(*)::int n from diary.workout_sets where legacy_id like 'w0:%' and deleted_at is null`)).n, 0, 'deleted workout: its sets are marked deleted too');
  assert.equal((await one(`select deleted_at is not null gone from diary.routines where legacy_id = 'r2'`)).gone, true);
  assert.equal((await one(`select count(*)::int n from diary.routine_sets where legacy_id like 'r2:%' and deleted_at is null`)).n, 0);
  console.log('PASS changes follow: a running workout (with its rest timer) finishes into history under the same id; deleted workouts and routines are marked deleted with their children');

  // Bob's diary is separate; and a broken diary never blocks a save.
  await save(bob, { ...diary(), sessions: diary().sessions.slice(0, 2) });
  assert.equal(await live('workouts', bob), 2); assert.equal(await live('workouts'), 40);
  await db.exec(`create or replace function diary.fill_training(u uuid, only_workouts text[] default null, src jsonb default null, plans boolean default null) returns void language plpgsql as $$ begin raise exception 'boom'; end $$`);
  d.sessions[1].name = 'Renamed';
  await save(alice, d); // must not throw
  assert.equal((await one(`select payload->'sessions'->1->>'name' n from public.forma_workspaces where user_id = $1`, [alice])).n, 'Renamed', 'the app\'s save went through');
  assert.equal((await one(`select detail from diary.fill_problems where user_id = $1 and kind = 'error'`, [alice])).detail, 'boom', 'and the error is written down');
  console.log('PASS safety: each person\'s diary fills only their own rows; an error while filling never blocks the app\'s save and is written down');
})().catch((e) => { console.error(e); process.exit(1); });
