// MFD 3.0 database, part 12: diary.as_envelope rebuilds a person's diary from the tables in the old document's shape.
// A diary shaped like production (capitalised meals, drop sets, notes on every set of an exercise, Hevy imports, a
// running workout, AI marks, heart rate, recovery with sleep stages, measurements, water, My foods, favourites,
// settings) is saved, the tables fill, and every field a reader uses comes back the same. diary.changes_since returns
// only rows changed after a sync number, and only the caller's.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account', '12-read']
  .map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));
const T0 = Date.UTC(2026, 9, 1, 17);
const by = (req) => ({ connection: 'https://claude.ai/connector', at: '2026-11-16T10:00:00.000Z', ...(req ? { request: req } : {}) });
const night = { deep: 72, light: 250, rem: 95, awake: 18, start: Date.UTC(2026, 10, 14, 22, 30), end: Date.UTC(2026, 10, 15, 6, 15) };

function diary() {
  const set = (w, g, i, extra = {}, tag = {}) => ({ id: `${w}-s${g}-${i}`, exercise: ['Bench Press (Barbell)', 'Band Walk'][g], catalogId: ['bench_press_barbell', 'custom:band'][g],
    catalogSource: g ? 'Custom' : 'MFD', tracking: g ? 'reps' : 'weight_reps', type: i === 0 ? 'warmup' : i === 3 ? 'dropset' : 'normal', group: g * 2, set: i + 1,
    kg: g ? null : 60 + i * 2.5, reps: 8 + i, done: true, notes: g ? '' : 'Pause at the bottom', ...extra, ...tag });
  const sessions = Array.from({ length: 6 }, (_, k) => {
    const started = T0 + k * 86400000;
    const sets = [];
    for (let g = 0; g < 2; g++) for (let i = 0; i < 4; i++) sets.push(set('w' + k, g, i, k === 2 && g === 0 && i === 1 ? { mfdDoneAt: started + 600000, mfdSuggested: { kg: 62.5, reps: 8 }, mfdAi: true, rpe: 8 } : {}, k === 2 && g === 0 ? { superset_id: '0' } : {}));
    const s = { id: 'w' + k, name: k % 2 ? 'Pull' : 'Push', date: new Date(started).toISOString().slice(0, 10), started, finished: started + 3600000, routineId: k === 0 ? 'r1' : null, sets };
    if (k < 3) Object.assign(s, { source: 'hevy', importKey: `push|${started / 1000}`, importTimezone: 'Europe/Berlin', notes: 'Imported' });
    if (k === 4) Object.assign(s, { addedBy: by('req-w4') });
    if (k === 5) s.heartRate = { interval: 15, bpm: [0, 120, 131], avg: 126, max: 140, source: 'watch' };
    return s;
  });
  const label = (id, extra = {}) => ({ id, name: 'Skyr', brand: 'Arla', barcode: '4061462023842', basis: 100, unit: 'g', cal: 60, p: 11, c: 4, f: 0.2, sugar: 4, salt: 0.1, ...extra });
  return {
    profile: { name: 'Alex M', firstName: 'Alex', lastName: 'M', age: 31, sex: 'male', height: 180, weight: 80, target: 76, activity: 1.55, goal: 'Fat loss', days: 4,
      experience: 'Beginner', equipment: 'Gym', limitations: '', diet: 'No preference', onboarded: true, waterGoalMl: 3000, cal: 2400, protein: 160, carbs: 250, fat: 70 },
    mfdSettings: { weightUnit: 'kg', energyUnit: 'kcal', defaultRestSec: 120, weekStart: 1, coach: { provider: 'none' }, healthWeightSkip: ['2026-11-01'] },
    mfdExercises: [{ id: 'custom:band', name: 'Band Walk', tracking: 'reps', source: 'custom' }],
    folders: [{ id: 'f1', name: 'Push Pull Legs' }],
    routines: [{ id: 'r1', name: 'Push A', folderId: 'f1', exercises: [{ name: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', sets: 2, reps: 8, kg: 80, rest: 120, notes: '', superset_id: null,
      setDetails: [{ type: 'warmup', kg: 40, reps: 10 }, { type: 'normal', kg: 80, reps: 8 }] }], addedBy: by('req-r1') }],
    sessions, active: { id: 'live', name: 'Legs', date: '2026-11-17', started: T0 + 47 * 86400000, finished: null, routineId: null,
      sets: [{ id: 'l1', exercise: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', tracking: 'weight_reps', type: 'normal', group: 0, set: 1, kg: 70, reps: 5, done: true, notes: '', mfdDoneAt: T0 + 47 * 86400000 + 60000 },
             { id: 'l2', exercise: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', tracking: 'weight_reps', type: 'normal', group: 0, set: 2, kg: 70, reps: null, done: false, notes: '' }] },
    meals: [
      { id: 'm1', date: '2026-11-16', meal: 'Breakfast', name: 'Skyr', amount: 200, unit: 'g', labelFood: label('off-1'), cal: 120, p: 22, c: 8, f: 0.4, sugar: 8, salt: 0.2 },
      { id: 'm2', date: '2026-11-16', meal: 'Snack', name: 'Dal', amount: 1, unit: 'serving', labelFood: { id: 'mcp-1', name: 'Dal', basis: 1, unit: 'serving', cal: 350, p: 18, c: 50, f: 8 }, cal: 350, p: 18, c: 50, f: 8, addedBy: by('req-m2') },
    ],
    products: [label('off-1')], foodFavorites: ['off-1'], water: { '2026-11-16': 2500, '2026-11-17': 750 },
    weights: [{ id: 'kg1', date: '2026-11-15', kg: 80.4 }, { id: 'kg2', date: '2026-11-16', kg: 79.5, addedBy: by('req-kg2') }, { id: 'kg3', date: '2026-11-17', kg: 79.2, source: 'health', bodyFat: 18.5 }],
    checkins: [{ id: 'c1', date: '2026-11-15', sleep: 7.25, sleepSource: 'health', steps: 9000, energy: 4, soreness: 2, restingHr: 58, hrv: 44, sleepStages: night, note: 'Felt good' },
               { id: 'm9', date: '2026-11-16', waist: 82.5, arms: 36, note: '' }],
    chat: [], folderOpen: { f1: true },
  };
}

// What readers use, per list, compared by id (stored order can differ; readers sort by date).
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
const SET = ['id', 'exercise', 'catalogId', 'type', 'group', 'set', 'kg', 'reps', 'rpe', 'done', 'notes', 'mfdDoneAt', 'mfdSuggested', 'mfdAi', 'superset_id', 'duration_seconds', 'distance_meters'];
const session = (s) => ({ ...pick(s, ['id', 'name', 'date', 'started', 'finished', 'routineId', 'source', 'importKey', 'importTimezone', 'notes', 'heartRate']),
  addedBy: s.addedBy?.connection, sets: s.sets.map((x) => pick(x, SET)).sort((a, b) => a.id.localeCompare(b.id)) });
const byId = (list, f) => [...list].map(f).sort((a, b) => String(a.id).localeCompare(String(b.id)));

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}'), ('${bob}'); grant usage on schema auth to authenticated;`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of files) await db.exec(f);
  for (const f of files) await db.exec(f); // safe to re-run
  const d = diary();
  await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [alice, JSON.stringify(d)]);
  await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [bob, JSON.stringify({ ...diary(), meals: [], weights: [] })]);
  const env = async (u) => (await db.query(`select diary.as_envelope($1) e`, [u])).rows[0].e;
  const e = await env(alice);

  // Training: every workout and set field readers use, the running workout, plans.
  assert.deepEqual(byId(e.sessions, session), byId(d.sessions, session));
  assert.deepEqual(session(e.active), session({ ...d.active, finished: undefined }));
  assert.deepEqual(e.folders, d.folders);
  assert.equal(e.routines.length, 1);
  assert.deepEqual(pick(e.routines[0], ['id', 'name', 'folderId']), pick(d.routines[0], ['id', 'name', 'folderId']));
  assert.equal(e.routines[0].addedBy.connection, by().connection);
  assert.deepEqual(e.routines[0].exercises.map((x) => pick(x, ['name', 'catalogId', 'rest', 'sets', 'reps', 'kg', 'setDetails'])),
    d.routines[0].exercises.map((x) => pick(x, ['name', 'catalogId', 'rest', 'sets', 'reps', 'kg', 'setDetails'])));
  assert.deepEqual(e.mfdExercises.map((x) => pick(x, ['id', 'name', 'tracking'])), d.mfdExercises.map((x) => pick(x, ['id', 'name', 'tracking'])));

  // Nutrition: entries with their values, the label, My foods, favourites, water.
  const MEAL = ['id', 'date', 'meal', 'name', 'amount', 'unit', 'cal', 'p', 'c', 'f', 'sugar', 'salt'];
  assert.deepEqual(byId(e.meals, (m) => ({ ...pick(m, MEAL), label: pick(m.labelFood, ['id', 'name', 'basis', 'unit', 'cal', 'p', 'c', 'f']), ai: !!m.addedBy })),
    byId(d.meals, (m) => ({ ...pick(m, MEAL), label: pick(m.labelFood, ['id', 'name', 'basis', 'unit', 'cal', 'p', 'c', 'f']), ai: !!m.addedBy })));
  assert.deepEqual(e.products.map((p) => p.id), ['off-1']);
  assert.deepEqual(e.foodFavorites, ['off-1']);
  assert.deepEqual(e.water, d.water);

  // Body: weigh-ins (source, body fat, AI mark), recovery with sleep stages, measurements.
  assert.deepEqual(byId(e.weights, (w) => ({ ...pick(w, ['id', 'date', 'kg', 'source', 'bodyFat']), ai: !!w.addedBy })),
    byId(d.weights, (w) => ({ ...pick(w, ['id', 'date', 'kg', 'source', 'bodyFat']), ai: !!w.addedBy })));
  const rec = e.checkins.find((c) => c.date === '2026-11-15');
  assert.deepEqual(pick(rec, ['sleep', 'sleepSource', 'steps', 'energy', 'soreness', 'restingHr', 'hrv', 'sleepStages', 'note']),
    pick(d.checkins[0], ['sleep', 'sleepSource', 'steps', 'energy', 'soreness', 'restingHr', 'hrv', 'sleepStages', 'note']));
  assert.deepEqual(pick(e.checkins.find((c) => c.id === 'm9'), ['date', 'waist', 'arms']), pick(d.checkins[1], ['date', 'waist', 'arms']));

  // Account: profile facts (weight = latest weigh-in, no stored age or targets), settings.
  assert.deepEqual(pick(e.profile, ['firstName', 'lastName', 'name', 'sex', 'height', 'target', 'days', 'waterGoalMl', 'onboarded']),
    pick(d.profile, ['firstName', 'lastName', 'name', 'sex', 'height', 'target', 'days', 'waterGoalMl', 'onboarded']));
  assert.equal(e.profile.weight, 79.2);
  assert.equal(e.profile.age, undefined);
  assert.deepEqual(pick(e.mfdSettings, ['weightUnit', 'energyUnit', 'defaultRestSec', 'weekStart', 'healthWeightSkip']),
    pick(d.mfdSettings, ['weightUnit', 'energyUnit', 'defaultRestSec', 'weekStart', 'healthWeightSkip']));

  // Each person only gets their own diary.
  assert.equal((await env(bob)).meals.length, 0);

  // changes_since: only the caller's rows after the number, and the newest number.
  const as = async (u, sql, p = []) => { await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${u}"}', false);`);
    try { return (await db.query(sql, p)).rows[0]; } finally { await db.exec('reset role'); } };
  const all = (await as(alice, `select diary.changes_since(0) c`)).c;
  assert.equal(all.changes.workouts.length, 7);
  assert.ok(all.changes.workouts.every((w) => w.user_id === alice));
  assert.equal(all.changes.food_entries.length, 2);
  const top = all.version;
  assert.deepEqual((await as(alice, `select diary.changes_since($1) c`, [top])).c, { version: top, changes: {} });
  const d2 = diary(); d2.weights.push({ id: 'kg4', date: '2026-11-18', kg: 79 });
  await db.query(`update public.forma_workspaces set payload = $2 where user_id = $1`, [alice, JSON.stringify(d2)]);
  const next = (await as(alice, `select diary.changes_since($1) c`, [top])).c;
  assert.deepEqual(Object.keys(next.changes), ['weigh_ins']);
  assert.equal(next.changes.weigh_ins[0].legacy_id, 'kg4');
  assert.ok(next.version > top);
  await assert.rejects(db.query(`select diary.as_envelope($1)`, [alice]).then(() => as(alice, `select diary.as_envelope('${bob}')`)), /permission denied/);

  console.log('diary read: every field readers use comes back the same; changes_since returns only new rows, only yours');
})().catch((e) => { console.error(e); process.exit(1); });
