// Database move, step 1 (database/diary/13-save-rows.sql): the app saves only changed rows into the tables with
// public.diary_save. New workout with its exercise and sets in one batch (parents first, whatever the order sent);
// edits change only the fields sent; versions come back and match changes_since; a delete passes on to children.
// Clashes (changed by another phone or an AI since the version the phone saw, deleted meanwhile, "new" but existing)
// save NOTHING and return the rows as they are now. Unknown tables or fields, bookkeeping fields, bad values and
// someone else's rows are refused, and a refused batch leaves no trace.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body',
  '10-account', '11-fill-account', '12-read', '13-save-rows'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}'), ('${bob}'); grant usage on schema auth to authenticated;`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of files) await db.exec(f);
  for (const f of files) await db.exec(f); // safe to re-run
  const bench = (await db.query(`select id from diary.exercises where user_id is null and name = 'Bench Press (Barbell)'`)).rows[0].id;

  const as = async (u, sql, p = []) => { await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${u}"}', false);`);
    try { return (await db.query(sql, p)).rows[0]; } finally { await db.exec('reset role'); } };
  const save = async (u, rows) => (await as(u, `select public.diary_save($1::jsonb) r`, [JSON.stringify({rows})])).r;
  const refused = (u, rows, re) => assert.rejects(as(u, `select public.diary_save($1::jsonb) r`, [JSON.stringify({rows})]), re);
  const count = async (t) => (await db.query(`select count(*)::int n from diary.${t}`)).rows[0].n;

  // A new workout, its exercise and two sets in one batch, sent children first: saved parents first.
  const w = randomUUID(), we = randomUUID(), s1 = randomUUID(), s2 = randomUUID();
  let r = await save(alice, [
    {table: 'workout_sets', id: s2, row: {workout_exercise_id: we, position: 1, weight_kg: 82.5, reps: 8, completed_at: '2026-11-19T07:40:00Z'}},
    {table: 'workout_sets', id: s1, row: {workout_exercise_id: we, position: 0, set_type: 'warmup', weight_kg: 40, reps: 10, completed_at: '2026-11-19T07:35:00Z'}},
    {table: 'workout_exercises', id: we, row: {workout_id: w, exercise_id: bench, position: 0, rest_s: 120}},
    {table: 'workouts', id: w, row: {name: 'Upper', local_date: '2026-11-19', started_at: '2026-11-19T07:31:00Z', ended_at: '2026-11-19T08:42:00Z'}},
  ]);
  assert.deepEqual(r.saved.map((x) => x.table), ['workouts', 'workout_exercises', 'workout_sets', 'workout_sets'], 'parents first');
  assert.ok(r.saved.every((x) => x.version > 0) && !r.clashes);
  const v = Object.fromEntries(r.saved.map((x) => [x.id, x.version]));
  assert.equal(r.version, Math.max(...Object.values(v)), 'newest sync number');
  const down = (await as(alice, `select diary.changes_since(0) c`)).c;
  assert.deepEqual(down.changes.workout_sets.map((x) => [x.id, x.version, Number(x.weight_kg)]).sort(), [[s1, v[s1], 40], [s2, v[s2], 82.5]].sort(), 'downloads see the same rows');
  assert.equal((await db.query(`select user_id from diary.workouts where id = $1`, [w])).rows[0].user_id, alice, 'owner is the signed-in person');

  // An edit sends only what changed; the rest stays.
  r = await save(alice, [{table: 'workout_sets', id: s2, seen: v[s2], row: {reps: 9}}]);
  const s2row = (await db.query(`select weight_kg, reps, version from diary.workout_sets where id = $1`, [s2])).rows[0];
  assert.deepEqual([Number(s2row.weight_kg), s2row.reps], [82.5, 9]);
  assert.ok(Number(s2row.version) > v[s2]); v[s2] = Number(s2row.version);

  // A clash: another phone saved this set after the version this phone saw. Nothing from the batch is saved.
  const before = await count('workout_sets');
  r = await save(alice, [{table: 'workout_sets', id: s2, seen: v[s2] - 1, row: {reps: 12}}, {table: 'workout_sets', id: randomUUID(), row: {workout_exercise_id: we, position: 2, reps: 5}}]);
  assert.equal(r.saved.length, 0); assert.equal(r.clashes.length, 1);
  assert.deepEqual([r.clashes[0].id, r.clashes[0].now.reps], [s2, 9], 'the row as it is now');
  assert.equal(await count('workout_sets'), before, 'the new set in the same batch was not saved either');
  // "New" but the row exists already: a clash too (e.g. both phones made it).
  r = await save(alice, [{table: 'workout_sets', id: s1, row: {reps: 11}}]);
  assert.equal(r.clashes?.length, 1);

  // Deleting the exercise passes on to its sets; editing a deleted row is a clash.
  const weVersion = Number((await db.query(`select version from diary.workout_exercises where id = $1`, [we])).rows[0].version);
  r = await save(alice, [{table: 'workout_exercises', id: we, seen: weVersion, delete: true}]);
  assert.equal(r.saved.length, 1);
  assert.equal((await db.query(`select count(*)::int n from diary.workout_sets where workout_exercise_id = $1 and deleted_at is null`, [we])).rows[0].n, 0, 'sets deleted with it');
  const s1v = Number((await db.query(`select version from diary.workout_sets where id = $1`, [s1])).rows[0].version);
  r = await save(alice, [{table: 'workout_sets', id: s1, seen: s1v, row: {reps: 3}}]);
  assert.equal(r.clashes?.length, 1, 'deleted meanwhile');

  // Heart rate is keyed by its workout.
  r = await save(alice, [{table: 'workout_heart_rate', id: w, row: {source: 'watch', interval_s: 15, bpm: [0, 120, 131], avg_bpm: 126, max_bpm: 140}}]);
  assert.equal(r.saved.length, 1);
  assert.deepEqual((await db.query(`select bpm from diary.workout_heart_rate where workout_id = $1`, [w])).rows[0].bpm, [0, 120, 131]);

  // Refused, with nothing left behind.
  const rows = await count('workouts');
  await refused(alice, [{table: 'meals', id: randomUUID(), row: {}}], /Unknown table meals/);
  await refused(alice, [{table: 'workouts', id: 'w1', row: {name: 'x'}}], /needs a uuid/);
  await refused(alice, [{table: 'workouts', id: w, seen: 1e9, row: {version: 1}}], /protected field "version"/);
  await refused(alice, [{table: 'workouts', id: w, seen: 1e9, row: {user_id: bob}}], /protected field "user_id"/);
  await refused(alice, [{table: 'workouts', id: w, seen: 1e9, row: {colour: 'red'}}], /Unknown or protected field "colour"/);
  await refused(alice, [{table: 'workouts', id: randomUUID(), row: {name: 'Ok', local_date: '2026-11-19', started_at: '2026-11-19T07:00:00Z'}},
    {table: 'workout_sets', id: randomUUID(), row: {workout_exercise_id: we, position: 0, reps: 5000}}], /check/, 'a bad value refuses the whole batch');
  assert.equal(await count('workouts'), rows, 'the valid workout in that batch was not kept');
  // Someone else's rows: invisible, and can't be taken over.
  await refused(bob, [{table: 'workout_sets', id: s2, row: {reps: 1}}], /duplicate key|violates/);
  await refused(bob, [{table: 'workout_sets', id: randomUUID(), row: {workout_exercise_id: we, position: 0, reps: 1}}], /foreign key|violates/);
  assert.equal(Number((await db.query(`select reps from diary.workout_sets where id = $1`, [s2])).rows[0].reps), 9, 'unchanged');
  await db.exec('set role anon');
  await assert.rejects(db.query(`select public.diary_save('{"rows":[]}')`), /permission denied/, 'not signed in');
  await db.exec('reset role');
  r = await save(alice, []);
  assert.deepEqual(r.saved, []);

  console.log('PASS diary_save: batches saved parents first with versions, partial edits, clashes save nothing and return the current rows, deletes pass on, bad input and other people refused');
})().catch((e) => { console.error(e); process.exit(1); });
