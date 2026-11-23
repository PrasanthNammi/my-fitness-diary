// Database move, step 2b core (database/diary/14-apply-training.sql): the app's training changes applied to the
// tables give exactly the same diary as applying them to the stored document. Random edits like the app's (log a
// workout, tick and change sets, start/finish a running workout, edit and reorder routines, folders and My exercises,
// delete things, replace whole lists) are turned into operations by the app's own diff (public/legacy/workspace-ops.js);
// the document side is the server's own rule today (workspace_apply, then compaction). After every save the diary
// rebuilt from the tables (diary.workspace_doc) must equal the document exactly. Bad operations are refused the same.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
require('../public/legacy/workspace-ops.js');
const W = globalThis.MFDWorkspaceOps;
const alice = '11111111-1111-4111-8111-111111111111';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body',
  '10-account', '11-fill-account', '12-read', '13-save-rows', '14-apply-training'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));
const TRAINING = ['sessions', 'active', 'folders', 'routines', 'mfdExercises'];

// A small deterministic random generator, so a failure can be replayed.
let seed = Number(process.env.SEED || 20261119);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const T0 = Date.UTC(2026, 9, 1, 17);
let uid = 0;
const id = (p) => `${p}${++uid}`;
const EX = [['Bench Press (Barbell)', 'bench_press_barbell', 'MFD', 'weight_reps'], ['Band Walk', 'custom:band', 'Custom', 'reps'], ['Rowing (Hevy)', 'history:rowing', 'Custom', 'weight_reps'], ['Treadmill', 'treadmill', 'MFD', 'distance_time']];
function aSet(w, g, i) {
  const [exercise, catalogId, catalogSource, tracking] = EX[g % EX.length];
  const s = {id: id(`${w}-s`), exercise, catalogId, catalogSource, tracking, type: pick(['normal', 'normal', 'warmup', 'dropset', 'failure']), group: g, set: i + 1,
    kg: tracking === 'reps' ? null : pick([20, 40, 60, 12.25, 82.5, null]), reps: pick([5, 8, 10, null]), done: rnd() > 0.2, notes: pick(['', '', 'pause'])};
  if (tracking === 'distance_time') Object.assign(s, {kg: null, reps: null, distance_meters: pick([1500, 2000]), duration_seconds: pick([600, 900, null])});
  if (rnd() < 0.2) s.rpe = pick([7, 8, null]);
  if (rnd() < 0.15) s.mfdSuggested = {weightKg: 80, reps: 8, timeSec: null, distanceKm: null, floors: null, steps: null};
  if (rnd() < 0.1) s.mfdUnusualOk = true;
  return s;
}
function aWorkout(k) {
  const w = id('w'), started = T0 + k * 864e5;
  const sets = []; for (let g = 0; g < 1 + Math.floor(rnd() * 3); g++) for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) sets.push(aSet(w, g, i));
  const o = {id: w, name: pick(['Push', 'Pull', 'Legs']), date: new Date(started).toISOString().slice(0, 10), started, finished: started + 36e5, routineId: null, sets};
  if (rnd() < 0.3) Object.assign(o, {source: 'hevy', importKey: `${w}|${started / 1000}`, importTimezone: 'Europe/Berlin', notes: '', rest: {}, sample: false});
  return o;
}
const aRoutine = () => ({id: id('r'), name: pick(['Push A', 'Legs', 'Upper']), folderId: null, exercises: [{name: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', sets: 2, reps: 8, kg: 60, rest: 90,
  setDetails: [{type: 'warmup', kg: 40, reps: 10, rpe: null}, {type: 'normal', kg: 60, reps: 8, floors: null}]}]});

// One random edit, the way the app changes its diary.
function edit(d, k) {
  const r = rnd();
  if (r < 0.25) d.sessions.push(aWorkout(k));
  else if (r < 0.45 && d.sessions.length) { const w = pick(d.sessions); const s = pick(w.sets); if (s) { s.reps = pick([6, 9, 11]); s.done = true; s.mfdDoneAt = w.started + 6e5; } }
  else if (r < 0.52 && d.sessions.length) d.sessions.splice(Math.floor(rnd() * d.sessions.length), 1);
  else if (r < 0.62) { if (!d.active) d.active = {...aWorkout(k), finished: null, clock: {paused: false}, rest: {0: {duration: 90, end: T0}}}; else { const s = pick(d.active.sets); if (s) s.done = !s.done; } }
  else if (r < 0.67 && d.active) { d.sessions.push({...d.active, id: id('w'), finished: d.active.started + 36e5, clock: undefined, rest: undefined}); d.active = null; }
  else if (r < 0.75) { d.routines.push(aRoutine()); if (d.folders.length && rnd() < 0.5) d.routines.at(-1).folderId = pick(d.folders).id; }
  else if (r < 0.79 && d.routines.length) pick(d.routines).name = pick(['Push B', 'Legs 2', 'Full body']);
  else if (r < 0.82 && d.routines.length > 1) d.routines.reverse();
  else if (r < 0.86) d.folders.push({id: id('f'), name: id('Folder ')});
  else if (r < 0.9) { d.mfdExercises = d.mfdExercises || []; d.mfdExercises.push({id: id('history:x'), name: id('Move '), tracking: 'reps', source: 'custom', equipment: '', primaryMuscle: 'Legs', secondaryMuscles: []}); }
  else if (r < 0.92 && d.sessions.length > 1) d.sessions.reverse();
  else if (r < 0.94 && d.sessions.length) d.sessions = d.sessions.filter(() => rnd() < 0.7);
  else if (r < 0.96 && d.routines.length) d.routines.splice(0, 1);
  else { const w = pick(d.sessions); if (w) w.name = 'Renamed'; }
  // The app's own undefined → missing (JSON).
  return JSON.parse(JSON.stringify(d));
}

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}'); grant usage on schema auth to authenticated;
    create schema mfd_observability; create function mfd_observability.record_sync(text, double precision) returns void language sql as $$select$$;
    create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as $$select 1::bigint$$; create schema mfd_private;`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  await db.exec(readFileSync('database/workspace-delta.sql', 'utf8'));
  for (const f of files) await db.exec(f);
  for (const f of files) await db.exec(f); // safe to re-run

  const q = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  // The "document side": what the server stores today (apply, then compaction), kept in a scratch table.
  await db.exec(`create table scratch (n int primary key, doc jsonb)`);
  const base = {profile: {name: 'Alex'}, meals: [], weights: [], checkins: [], chat: [], sessions: [], routines: [], active: null, folders: []};
  await db.query(`insert into scratch values (1, $1)`, [JSON.stringify(base)]);
  // The "tables side": training in the tables, the rest in a stored document with "$training".
  await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [alice, JSON.stringify({...base, sessions: [], routines: [], folders: []})]);
  let present = (await q(`select diary.apply_training_ops($1, $2, '[]') p`, [alice, JSON.stringify(TRAINING.filter((k) => k in base).map((k) => ({k, v: base[k]})))])).p;
  assert.deepEqual(present.sort(), ['active', 'folders', 'routines', 'sessions']);

  let app = JSON.parse(JSON.stringify(base)), saves = 0, opsTotal = 0;
  for (let k = 0; k < 400; k++) {
    const next = edit(JSON.parse(JSON.stringify(app)), k);
    const ops = W.diff(app, next).filter((o) => TRAINING.includes(o.k));
    app = next;
    if (!ops.length) continue;
    saves++; opsTotal += ops.length;
    const stored = (await q(`update scratch set doc = (mfd_private.workspace_compact(mfd_private.workspace_apply(doc, $1))).document where n = 1 returning doc`, [JSON.stringify(ops)])).doc;
    present = (await q(`select diary.apply_training_ops($1, $2, $3) p`, [alice, JSON.stringify(ops), JSON.stringify(present)])).p;
    if (k % 25 === 0) assert.equal((await q(`select diary.plans_doc($1) = (select jsonb_build_object('folders', t->'folders', 'routines', t->'routines', 'mfdExercises', t->'mfdExercises') from (select diary.training_json($1) t) x) ok`, [alice])).ok, true, `plans_doc, edit ${k}`);
    const fromTables = (await q(`select diary.workspace_doc($1, $2) d`, [alice, JSON.stringify({profile: {}, $training: present})])).d;
    for (const key of TRAINING) assert.deepEqual(fromTables[key], stored[key], `save ${saves} (edit ${k}), ${key}; ops ${JSON.stringify(ops).slice(0, 300)}`);
    assert.equal((await q(`select (select doc from scratch) - 'profile' - 'meals' - 'weights' - 'checkins' - 'chat' = diary.workspace_doc($1, $2) - 'profile' ok`,
      [alice, JSON.stringify({profile: {}, $training: present})])).ok, true, `save ${saves}: equal as JSON`);
  }
  assert.ok(saves > 300, `${saves} saves`);
  // The plans built on their own (fast) are exactly the plans of the whole rebuild.
  assert.equal((await q(`select diary.plans_doc($1) = (select jsonb_build_object('folders', t->'folders', 'routines', t->'routines', 'mfdExercises', t->'mfdExercises') from (select diary.training_json($1) t) x) ok`, [alice])).ok, true, 'plans_doc = training_json plans');
  assert.equal((await q(`select count(*)::int n from diary.fill_problems where kind = 'error'`)).n, 0);

  // A key the diary doesn't have comes back missing, and an operation that doesn't fit is refused like the document's.
  present = (await q(`select diary.apply_training_ops($1, '[{"k":"mfdExercises","d":true}]', $2) p`, [alice, JSON.stringify(present)])).p;
  assert.ok(!('mfdExercises' in (await q(`select diary.workspace_doc($1, $2) d`, [alice, JSON.stringify({profile: {}, $training: present})])).d));
  for (const [ops, re] of [[[{k: 'sessions', i: 'nope', d: true}], /Missing item in sessions/], [[{k: 'sessions', i: 'a', v: {id: 'b'}}], /Item id mismatch/],
    [[{k: 'sessions', o: ['x']}], /Order does not match/], [[{k: 'active', i: 'x', d: true}], /Not a list: active/], [[{k: 'mfdExercises', i: 'x', v: {id: 'x'}}], /Not a list: mfdExercises/]])
    await assert.rejects(db.query(`select diary.apply_training_ops($1, $2, $3)`, [alice, JSON.stringify(ops), JSON.stringify(present)]), re);
  console.log(`PASS apply training: ${saves} random saves (${opsTotal} operations) give exactly the document's result from the tables; bad operations refused the same`);
})().catch((e) => { console.error(e); process.exit(1); });
