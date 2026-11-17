// MFD 3.0 database, step 2 (training) on embedded PostgreSQL: the foundation, the exercise library and the training
// tables build (twice: safe to re-run), the built-in catalogue loads, and every rule holds: owners, links between
// rows, value limits, one running workout, sync numbers, deletions passed on to children, and row-level security.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into auth.users values ('${alice}'), ('${bob}');`);
  for (const f of files) await db.exec(f);
  for (const f of files) await db.exec(f); // safe to re-run
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params = []) => (await db.query(sql, params)).rows;
  const as = async (user) => { await db.exec('reset role'); if (user) { await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub: user})]); await db.exec('set role authenticated'); } };

  // Library: the built-in catalogue, with stable ids.
  await as(null);
  const counts = await one(`select (select count(*) from diary.exercises)::int ex, (select count(*) from diary.muscle_groups)::int g, (select count(*) from diary.muscles)::int m, (select count(*) from diary.exercise_muscle_groups)::int eg`);
  assert.deepEqual(counts, {ex: 1064, g: 20, m: 38, eg: 3147});
  const bench = (await one(`select id from diary.exercises where source='mfd' and source_ref='barbell_bench_press'`))?.id ?? (await one(`select id from diary.exercises where source='mfd' and name ilike '%bench press%' order by name limit 1`)).id;
  assert.equal(bench, (await one(`select md5('mfd:' || source_ref)::uuid id from diary.exercises where id=$1`, [bench])).id, 'built-in ids come from the catalogue id');
  assert.ok((await one(`select count(*)::int n from diary.exercise_muscle_groups where exercise_id=$1 and role='primary'`, [bench])).n >= 1);
  console.log('PASS library: 1,064 built-in exercises, 20 muscle groups, 38 muscles and their links; fixed ids; safe to re-run');

  // Alice builds a routine in a folder and does a workout from it.
  await as(alice);
  const folder = (await one(`insert into diary.routine_folders (user_id, name) values ($1, 'Push Pull Legs') returning id, version, created_at`, [alice]));
  const routine = (await one(`insert into diary.routines (user_id, folder_id, name) values ($1, $2, 'Push A') returning id`, [alice, folder.id])).id;
  const rex = (await one(`insert into diary.routine_exercises (user_id, routine_id, exercise_id, position) values ($1, $2, $3, 0) returning id`, [alice, routine, bench])).id;
  await db.query(`insert into diary.routine_sets (user_id, routine_exercise_id, position, target_weight_kg, target_reps) values ($1, $2, 0, 80, 8), ($1, $2, 1, 80, 8)`, [alice, rex]);
  const workout = (await one(`insert into diary.workouts (user_id, routine_id, name, local_date, started_at, source) values ($1, $2, 'Push A', '2026-11-17', '2026-11-17 18:02+01', 'app') returning id`, [alice, routine])).id;
  const wex = (await one(`insert into diary.workout_exercises (user_id, workout_id, exercise_id, position) values ($1, $2, $3, 0) returning id`, [alice, workout, bench])).id;
  await db.query(`insert into diary.workout_sets (user_id, workout_exercise_id, position, weight_kg, reps, completed_at) values ($1, $2, 0, 80, 8, now()), ($1, $2, 1, 82.5, 6, null)`, [alice, wex]);
  const done = await one(`select count(*) filter (where completed_at is not null)::int done, count(*)::int sets from diary.workout_sets`);
  assert.deepEqual(done, {done: 1, sets: 2});
  console.log('PASS training: folder → routine → exercise → planned sets; workout → exercise → sets');

  // Bookkeeping: the database sets created/updated/version; numbers only go up, per person.
  const v1 = (await one(`select version from diary.workouts where id=$1`, [workout])).version;
  await db.query(`update diary.workouts set notes='Felt strong', version=1, created_at='2000-01-01' where id=$1`, [workout]);
  const w = await one(`select version, created_at from diary.workouts where id=$1`, [workout]);
  assert.ok(w.version > v1, 'every change takes a new, higher number'); assert.ok(new Date(w.created_at).getFullYear() > 2000, 'created_at can\'t be rewritten');
  assert.equal((await one(`select last_version from diary.sync_counters where user_id=$1`, [alice])).last_version, w.version);
  console.log('PASS bookkeeping: versions are set by the database and only go up; created_at can\'t be rewritten');

  // Value rules.
  const rejects = async (sql, params, re, msg) => { await db.exec('savepoint s'); await assert.rejects(db.query(sql, params), re, msg); await db.exec('rollback to savepoint s'); };
  await db.exec('begin');
  await rejects(`insert into diary.workout_sets (user_id, workout_exercise_id, position, reps) values ($1, $2, 2, -5)`, [alice, wex], /check/, 'negative reps');
  await rejects(`insert into diary.workout_sets (user_id, workout_exercise_id, position, rpe) values ($1, $2, 2, 11)`, [alice, wex], /check/, 'RPE above 10');
  await rejects(`insert into diary.workout_sets (user_id, workout_exercise_id, position, set_type) values ($1, $2, 2, 'mega')`, [alice, wex], /check/, 'unknown set type');
  await rejects(`insert into diary.workouts (user_id, name, local_date, started_at, ended_at) values ($1, 'X', '2026-11-17', '2026-11-17 18:00+01', '2026-11-17 17:00+01')`, [alice], /check/, 'ends before it starts');
  await rejects(`insert into diary.workouts (user_id, name, local_date, started_at) values ($1, 'Second', '2026-11-17', now())`, [alice], /workouts_one_running/, 'two running workouts');
  await rejects(`insert into diary.routines (user_id, name) values ($1, 'push a')`, [alice], /routines_name/, 'routine name taken (any capitals)');
  await rejects(`insert into diary.workout_sets (user_id, workout_exercise_id, position) values ($1, gen_random_uuid(), 0)`, [alice], /foreign key/, 'set without a real exercise row');
  await rejects(`insert into diary.workout_exercises (user_id, workout_id, exercise_id, position) values ($1, $2, gen_random_uuid(), 1)`, [alice, workout], /Unknown exercise|foreign key/, 'unknown exercise');
  await db.exec('commit');
  console.log('PASS rules: negative reps, RPE > 10, unknown set types, backwards times, a second running workout, duplicate routine names and dangling links are refused');

  // Ownership: Bob can't see Alice's rows, can't attach rows to them, and can't use her own exercises.
  const myCurl = (await one(`insert into diary.exercises (user_id, source, name, tracking) values ($1, 'custom', 'Alice Curl', 'weight_reps') returning id`, [alice])).id;
  await as(bob);
  assert.equal((await one(`select count(*)::int n from diary.workouts`)).n, 0, 'Bob sees none of Alice\'s workouts');
  assert.equal((await one(`select count(*)::int n from diary.exercises where id=$1`, [myCurl])).n, 0, 'or her own exercises');
  assert.ok((await one(`select count(*)::int n from diary.exercises`)).n === 1064, 'but he sees the shared library');
  await db.exec('begin');
  await rejects(`insert into diary.workout_exercises (user_id, workout_id, exercise_id, position) values ($1, $2, $3, 1)`, [bob, workout, bench], /foreign key|row-level security/, 'Bob can\'t add to Alice\'s workout');
  await rejects(`insert into diary.workouts (user_id, name, local_date, started_at) values ($1, 'Sneaky', '2026-11-17', now())`, [alice], /row-level security/, 'or write rows as Alice');
  const bw = (await one(`insert into diary.workouts (user_id, name, local_date, started_at, ended_at) values ($1, 'Bob', '2026-11-17', now(), now()) returning id`, [bob])).id;
  await rejects(`insert into diary.workout_exercises (user_id, workout_id, exercise_id, position) values ($1, $2, $3, 0)`, [bob, bw, myCurl], /Unknown exercise/, 'or use Alice\'s own exercise');
  await db.exec('commit');
  // Row-level security doesn't raise an error: for Bob the row simply isn't there to change.
  assert.equal((await db.query(`update diary.exercises set name='Mine now' where id=$1`, [bench])).affectedRows, 0, 'nobody edits the shared library');
  assert.equal((await one(`select name from diary.exercises where id=$1`, [bench])).name !== 'Mine now', true);
  await as(alice);
  await assert.rejects(db.query(`update diary.workouts set user_id=$1 where id=$2`, [bob, workout]), /row-level security|another person/, 'a row can\'t move to another person');
  console.log('PASS ownership: each person sees only their own rows plus the shared library; links and exercises can\'t cross between people');

  // Deleting: marking a workout deleted marks its exercises and sets too; a deleted folder lets go of its routines.
  await db.query(`update diary.workouts set deleted_at=now() where id=$1`, [workout]);
  const left = await one(`select (select count(*) from diary.workout_exercises where deleted_at is null)::int ex, (select count(*) from diary.workout_sets where deleted_at is null)::int sets`);
  assert.deepEqual(left, {ex: 0, sets: 0});
  await db.query(`insert into diary.workouts (user_id, name, local_date, started_at) values ($1, 'Next', '2026-11-18', now())`, [alice]); // the deleted one no longer counts as running
  await db.query(`update diary.routine_folders set deleted_at=now() where id=$1`, [folder.id]);
  assert.equal((await one(`select folder_id from diary.routines where id=$1`, [routine])).folder_id, null);
  assert.equal((await one(`select count(*)::int n from diary.routine_sets where deleted_at is null`)).n, 2, 'the routine itself stays');
  console.log('PASS deleting: a deleted workout takes its exercises and sets with it (each with a new sync number); a deleted folder leaves its routines unfiled');
})().catch((e) => { console.error(e); process.exit(1); });
