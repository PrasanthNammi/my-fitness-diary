// The Hevy import (public/legacy/training.js, the code the app runs): a made-up export covering every case is read
// exactly (workouts, sets, set types, units, supersets, notes, both date formats, duplicates), and every exercise name
// is matched against the built-in library. With HEVY_CSV=<path> it also checks a real export, which is never
// committed or uploaded: every row becomes a set, numbers are kept exactly, and importing it again adds nothing.
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), assert = require('node:assert/strict'), esbuild = require('esbuild');

// MFD's own import functions, taken unchanged from the app.
const src = fs.readFileSync('public/legacy/training.js', 'utf8').split('\n');
const fn = (name) => { const line = src.find((l) => l.startsWith(`function ${name}(`)); assert.ok(line, name); return line; };
function importer(existing = [], smart = false) {
  let n = 0;
  const ctx = vm.createContext({ Intl, Date, Number, Math, Map, Set, Error, JSON, String, Object, Array, state: { sessions: existing }, uid: () => 'id' + (++n) });
  vm.runInContext(["const setKinds=[['warmup','Warm-up'],['normal','Working'],['failure','Failure'],['dropset','Drop set']];", `const MFD3_IMPORT=${smart};`, ...['parseCSV', 'numericCSV', 'hevyDate', 'importIdentity', 'exerciseKey', 'sameWorkout', 'parseHevyImport'].map(fn)].join('\n'), ctx);
  // Copied out of the sandbox so results compare like normal values.
  return (text, zone) => JSON.parse(JSON.stringify(ctx.parseHevyImport(text, zone)));
}

// ── The made-up export ─────────────────────────────────────────────────────────────────────────────────────
const sample = fs.readFileSync('tests/fixtures/hevy-sample.csv', 'utf8');
const d = importer()(sample, 'Europe/Berlin');
assert.deepEqual(d.errors, []);
assert.equal(d.workouts.length, 2); assert.equal(d.rows, 7);
const [push, cardio] = d.workouts;
assert.equal(push.name, 'Push A'); assert.equal(push.date, '2026-05-09');
assert.equal(new Date(push.started).toISOString(), '2026-05-09T06:14:00.000Z', '08:14 in Berlin (summer time) is 06:14 UTC');
assert.equal(push.finished - push.started, 66 * 60000);
assert.equal(push.notes, 'Felt strong, slept 8h', 'commas inside quotes stay in the text');
assert.equal(push.source, 'hevy'); assert.equal(push.importKey, 'push a|' + Math.round(push.started / 1000));
assert.deepEqual(push.sets.map((s) => [s.exercise, s.group, s.set, s.type, s.kg, s.reps, s.rpe]), [
  ['Bench Press (Barbell)', 0, 1, 'warmup', 40, 10, null],
  ['Bench Press (Barbell)', 0, 2, 'normal', 80, 8, 8],
  ['Bench Press (Barbell)', 0, 3, 'failure', 80, 6, 10],
  ['Lateral Raise (Dumbbell)', 1, 1, 'normal', 25 * 0.45359237, 12, null],
  ['Triceps Pushdown', 2, 1, 'dropset', 30, 10, null],
]);
assert.ok(push.sets.every((s) => s.done), 'imported sets count as done');
assert.equal(push.sets[3].superset_id, '0'); assert.equal(push.sets[4].superset_id, '0', 'superset kept');
assert.equal(push.sets[0].notes, 'Pause at chest'); assert.equal(push.sets[4].notes, 'He said "slow"', 'quotes inside quotes');
assert.equal(push.hevyRows.length, 5, 'original rows kept');
assert.equal(new Date(cardio.started).toISOString(), '2026-05-10T05:00:00.000Z', 'an explicit offset is used as given');
assert.deepEqual(cardio.sets.map((s) => [s.exercise, s.distance_meters, s.duration_seconds]), [['Running', 5500, 1800], ['Cycling', 3 * 1609.344, 900]]);
assert.deepEqual(d.conversions.sort(), ['km → m', 'lb → kg', 'miles → m']);
// Importing again: both are duplicates, nothing new.
const again = importer(d.workouts)(sample, 'Europe/Berlin');
assert.deepEqual([again.fresh.length, again.duplicates.length], [0, 2]);
// A broken row blocks the whole import (no half workouts).
const broken = importer()(sample.replace(',1,normal,80,,8,', ',x,normal,80,,8,'), 'Europe/Berlin');
assert.equal(broken.errors.length, 1); assert.match(broken.errors[0].message, /Invalid set_index/);
console.log('PASS Hevy import: workouts, sets, set types, lb/km/miles, supersets, notes, both date formats, duplicates, broken rows');

// ── MFD 3.0: a workout logged in both Hevy and MFD is "already in MFD" ─────────────────────────────────────
// Same day, overlapping time (30 min slack), at least half the exercises the same. Only workouts logged in MFD count
// (earlier imports are matched exactly, as before). Behind the 3.0 switch, which must match the app's.
assert.match(src.find((l) => l.startsWith('const MFD3_IMPORT=')), /=false;/, 'off until 3.0');
assert.match(fs.readFileSync('frontend/lib/release.ts', 'utf8'), /export const MFD3 = false;/, 'the importer and the app switch together');
const logged = (extra) => ({ id: 'm', name: 'Upper', date: push.date, started: push.started + 5 * 60000, finished: push.finished + 10 * 60000,
  sets: [{ exercise: 'Bench Press (Barbell)' }, { exercise: 'Lateral Raise (Dumbbell)' }, { exercise: 'Face Pull' }], ...extra });
const check = (s, smart = true) => importer([s], smart)(sample, 'Europe/Berlin');
assert.deepEqual(check(logged()).alreadyInMfd.map((w) => w.name), ['Push A'], 'same workout logged in MFD: not imported again');
assert.deepEqual(check(logged()).fresh.map((w) => w.name), ['Cardio'], 'the other workout still imports');
assert.equal(check(logged(), false).alreadyInMfd.length, 0, 'switch off: as before');
assert.equal(check(logged({ date: '2026-05-08' })).alreadyInMfd.length, 0, 'another day');
assert.equal(check(logged({ started: push.finished + 31 * 60000, finished: push.finished + 90 * 60000 })).alreadyInMfd.length, 0, 'not at the same time');
assert.equal(check(logged({ started: push.finished + 20 * 60000, finished: push.finished + 80 * 60000 })).alreadyInMfd.length, 1, 'right after (within 30 min) still counts');
assert.equal(check(logged({ sets: [{ exercise: 'Squat (Barbell)' }, { exercise: 'Leg Press (Machine)' }, { exercise: 'Bench Press (Barbell)' }] })).alreadyInMfd.length, 0, 'mostly other exercises');
assert.equal(check(logged({ source: 'hevy' })).alreadyInMfd.length, 0, 'an earlier import is not a logged workout');
assert.equal(check(logged({ sets: [] })).alreadyInMfd.length, 0, 'an empty workout matches nothing');
console.log('PASS already in MFD: same day + overlapping time + mostly the same exercises; other days, times, exercises and earlier imports are not; off until 3.0');

// ── Exercise names matched to the library ──────────────────────────────────────────────────────────────────
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfd-hevy-'));
esbuild.buildSync({ entryPoints: ['frontend/catalogue/hevyMatcher.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(temp, 'm.cjs'), logLevel: 'silent' });
const { HevyMatcher } = require(path.join(temp, 'm.cjs')); fs.rmSync(temp, { recursive: true, force: true });
const catalogue = JSON.parse(fs.readFileSync('public/catalogue/mfd_exercises.json', 'utf8')).exercises;
const matcher = new HevyMatcher(catalogue, JSON.parse(fs.readFileSync('public/catalogue/hevy_map.json', 'utf8')));
const matched = (names) => { const r = { auto: [], ask: [] }; for (const t of names) { const m = matcher.match(t); (m.mfdId && m.method !== 'needs_confirmation' ? r.auto : r.ask).push(t); } return r; };
const s = matched(['Bench Press (Barbell)', 'Lateral Raise (Dumbbell)', 'Triceps Pushdown', 'Running', 'Cycling']);
assert.ok(s.auto.includes('Bench Press (Barbell)'), 'common Hevy names match by themselves');
console.log(`PASS exercise matching: ${s.auto.length}/5 sample names matched automatically; the rest are asked once in the preview`);

// ── A real export (only when given) ────────────────────────────────────────────────────────────────────────
const real = process.env.HEVY_CSV;
if (real && fs.existsSync(real)) {
  const text = fs.readFileSync(real, 'utf8');
  const r = importer()(text, process.env.HEVY_ZONE || 'Europe/Berlin');
  assert.deepEqual(r.errors.slice(0, 3), [], 'every row reads');
  const sets = r.workouts.flatMap((w) => w.sets);
  assert.equal(sets.length, r.rows, 'every row becomes a set');
  const raw = r.workouts.flatMap((w) => w.hevyRows);
  assert.ok(raw.every((row, i) => !row.weight_kg || Math.abs(Number(row.weight_kg) - sets[i].kg) < 1e-9), 'weights kept exactly');
  assert.ok(raw.every((row, i) => !row.reps || Number(row.reps) === sets[i].reps), 'reps kept exactly');
  assert.ok(raw.every((row, i) => !row.distance_km || Math.abs(Number(row.distance_km) * 1000 - sets[i].distance_meters) < 1e-6), 'km → m');
  assert.ok(r.workouts.every((w) => w.finished >= w.started && /^\d{4}-\d\d-\d\d$/.test(w.date)), 'times and days');
  const twice = importer(r.workouts)(text, process.env.HEVY_ZONE || 'Europe/Berlin');
  assert.equal(twice.fresh.length, 0, 'importing the same file again adds nothing');
  const names = [...new Set(sets.map((x) => x.exercise))], m = matched(names);
  const days = r.workouts.map((w) => w.date).sort();
  console.log(`PASS real export: ${r.workouts.length} workouts, ${sets.length} sets (${days[0]} to ${days.at(-1)}), all read exactly; again → 0 new; ${m.auto.length}/${names.length} exercise names matched automatically`);
  if (m.ask.length) console.log('  asked once in the preview: ' + m.ask.length + ' names');
} else console.log('SKIP real export (set HEVY_CSV=<path> to check one)');
