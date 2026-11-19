// Settings → Export (frontend/domain/exportCsv.ts, frontend/lib/zip.ts): one CSV per area for a date range; numbers
// exactly as logged; text that spreadsheets would run as a formula is escaped; the Hevy/Strong-format workouts file is
// read back by MFD's own Hevy importer to the same sets; several files come as a .zip that standard tools open.
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), assert = require('node:assert/strict'), esbuild = require('esbuild');
const {execFileSync} = require('child_process');
process.env.TZ = 'Europe/Berlin';
const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mfd-export-'));
for (const [f, out] of [['frontend/domain/exportCsv.ts', 'e.cjs'], ['frontend/lib/zip.ts', 'z.cjs']])
  esbuild.buildSync({entryPoints: [f], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(dir, out), logLevel: 'silent'});
const E = require(path.join(dir, 'e.cjs')), Z = require(path.join(dir, 'z.cjs'));

const T = (d, h, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
const set = (o) => ({id: Math.random().toString(36), type: 'normal', weightKg: null, reps: null, timeSec: null, distanceKm: null, rpe: null, done: true, ...o});
const food = (o) => ({id: 'f', name: 'Skyr', brand: 'Arla', barcode: null, origin: 'custom', refAmount: 100, refUnit: 'g', servingSize: null, servingLabel: null,
  kcal: 60, protein: 11, carbs: 4, fat: 0.2, sugars: 4, saturates: 0.1, fibre: null, salt: 0.06, ingredients: null, ...o});
const data = {
  unit: 'kg', exerciseName: (id) => ({bench: 'Bench Press (Barbell)', curl: 'Seated Dumbbell Curl', run: 'Treadmill'})[id] ?? id,
  workouts: [
    {id: 'w0', title: 'Old', routineId: null, startedAt: T('2026-01-02', 9), endedAt: T('2026-01-02', 10), exercises: [{id: 'b', exerciseId: 'bench', tracking: 'weight_reps', restSec: 90, note: '', supersetId: null, sets: [set({weightKg: 50, reps: 5})]}]},
    {id: 'w1', title: 'Upper, heavy', routineId: null, startedAt: T('2026-11-19', 7, 31), endedAt: T('2026-11-19', 8, 42), exercises: [
      {id: 'b1', exerciseId: 'bench', tracking: 'weight_reps', restSec: 90, note: 'Pause "at" chest', supersetId: null,
        sets: [set({type: 'warmup', weightKg: 40, reps: 10}), set({weightKg: 82.5, reps: 8, rpe: 8}), set({type: 'drop', weightKg: 60, reps: 12}), set({weightKg: 90, reps: 3, done: false})]},
      {id: 'b2', exerciseId: 'curl', tracking: 'weight_reps', restSec: 60, note: '', supersetId: null, sets: [set({weightKg: 12.25, reps: 10})]},
      {id: 'b3', exerciseId: 'run', tracking: 'distance_time', restSec: 0, note: '', supersetId: null, sets: [set({timeSec: 600, distanceKm: 1.6})]}]}],
  routines: [{id: 'r1', name: 'Upper 2', folderId: 'f1', createdAt: 0, updatedAt: 0, exercises: [{id: 'r1:0', exerciseId: 'bench', tracking: 'weight_reps', restSec: 90, note: '', supersetId: null, sets: [set({weightKg: 40, reps: 8})]}]}],
  folders: [{id: 'f1', name: 'Push Pull Legs', collapsed: false, createdAt: 0}],
  diary: [
    {id: 'm1', date: '2026-11-19', meal: 'lunch', food: food({name: '=HYPERLINK("x")'}), amount: 150, unit: 'g', createdAt: 2},
    {id: 'm2', date: '2026-11-19', meal: 'breakfast', food: food({}), amount: 200, unit: 'g', createdAt: 1},
    {id: 'm3', date: '2026-10-01', meal: 'dinner', food: food({}), amount: 100, unit: 'g', createdAt: 3}],
  water: {'2026-11-19': 1500, '2026-10-01': 500},
  weights: [{id: 'k1', date: '2026-11-18', kg: 72.4}, {id: 'k2', date: '2026-11-02', kg: 73.1, source: 'health', bodyFat: 16.8}],
  checkins: [{id: 'c1', date: '2026-11-18', waist: '82', arms: 34, note: ''}, {id: 'c2', date: '2026-11-19', sleep: 7.4, steps: 9120, restingHr: 56, hrv: 48, energy: 4, soreness: 2, note: 'legs, sore',
    sleepStages: {deep: 82, light: 230, rem: 96, awake: 12, start: T('2026-11-18', 23, 10), end: T('2026-11-19', 6, 40)}}],
};
const parse = (text) => { assert.ok(text.startsWith('﻿'), 'byte-order mark for Excel'); return text.slice(1).trimEnd().split('\r\n'); };
const range = {from: '2026-11-01', to: '2026-11-19'};
const files = Object.fromEntries(E.exportFiles(data, E.EXPORT_AREAS, range, 'mfd').map((f) => [f.name, f]));

// Names, one per area, routines whole.
assert.deepEqual(Object.keys(files), ['mfd-workouts_2026-11-01_to_2026-11-19.csv', 'mfd-nutrition_2026-11-01_to_2026-11-19.csv', 'mfd-body_2026-11-01_to_2026-11-19.csv',
  'mfd-recovery_2026-11-01_to_2026-11-19.csv', 'mfd-routines_all.csv']);
// Workouts: done sets only, in range, exact numbers, types in words, notes quoted.
assert.deepEqual(parse(files['mfd-workouts_2026-11-01_to_2026-11-19.csv'].text), [
  'date,start_time,workout,exercise,set,type,weight_kg,reps,time,distance_km,floors,steps,rpe,exercise_notes',
  '2026-11-19,07:31,"Upper, heavy",Bench Press (Barbell),1,warm-up,40,10,,,,,,"Pause ""at"" chest"',
  '2026-11-19,07:31,"Upper, heavy",Bench Press (Barbell),2,normal,82.5,8,,,,,8,"Pause ""at"" chest"',
  '2026-11-19,07:31,"Upper, heavy",Bench Press (Barbell),3,drop set,60,12,,,,,,"Pause ""at"" chest"',
  '2026-11-19,07:31,"Upper, heavy",Seated Dumbbell Curl,1,normal,12.25,10,,,,,,',
  '2026-11-19,07:31,"Upper, heavy",Treadmill,1,normal,,,10:00,1.6,,,,']);
// Nutrition: by date and meal, a food named like a formula is shown as text, water as its own row.
assert.deepEqual(parse(files['mfd-nutrition_2026-11-01_to_2026-11-19.csv'].text), [
  'date,meal,food,brand,amount,unit,kcal,protein_g,carbs_g,fat_g,fibre_g,sugars_g,saturated_fat_g,salt_g',
  '2026-11-19,Breakfast,Skyr,Arla,200,g,120,22,8,0.4,,8,0.2,0.12',
  '2026-11-19,Lunch,"\'=HYPERLINK(""x"")",Arla,150,g,90,16.5,6,0.3,,6,0.2,0.09',
  '2026-11-19,Water,Water,,1500,ml,,,,,,,,']);
assert.deepEqual(parse(files['mfd-body_2026-11-01_to_2026-11-19.csv'].text), [
  'date,weight_kg,body_fat_%,waist_cm,chest_cm,hips_cm,arms_cm,source', '2026-11-02,73.1,16.8,,,,,Health Connect', '2026-11-18,72.4,,82,,,34,MFD']);
assert.deepEqual(parse(files['mfd-recovery_2026-11-01_to_2026-11-19.csv'].text), [
  'date,sleep_h,deep_min,light_min,rem_min,awake_min,bedtime,wake_time,steps,resting_hr,hrv_ms,energy_1_5,soreness_1_5,note',
  '2026-11-19,7.4,82,230,96,12,23:10,06:40,9120,56,48,4,2,"legs, sore"']);
assert.deepEqual(parse(files['mfd-routines_all.csv'].text), [
  'folder,routine,order,exercise,set,type,target_weight_kg,target_reps,target_time,target_distance_km,rest_s,notes', 'Push Pull Legs,Upper 2,1,Bench Press (Barbell),1,normal,40,8,,,90,']);
// Pounds: the person's unit, two decimals.
const lb = E.exportFiles({...data, unit: 'lb'}, ['workouts'], range, 'mfd')[0];
assert.match(lb.text, /date,start_time,workout,exercise,set,type,weight_lb,/); assert.match(lb.text, /,181\.88,8,/);
// All time includes the January workout; a range with nothing gives just the header.
assert.equal(E.exportFiles(data, ['workouts'], {from: null, to: null}, 'mfd')[0].rows, 6);
assert.equal(E.exportFiles(data, ['workouts'], {from: '2025-01-01', to: '2025-12-31'}, 'mfd')[0].rows, 0);
console.log('PASS export CSV: one file per area, date range, done sets, exact numbers, kg/lb, quoting, formula-safe text');

// Hevy/Strong format, read back by MFD's own Hevy importer (public/legacy/training.js) to the same sets.
const src = fs.readFileSync('public/legacy/training.js', 'utf8').split('\n');
const fn = (name) => src.find((l) => l.startsWith(`function ${name}(`));
let n = 0;
const ctx = vm.createContext({Intl, Date, Number, Math, Map, Set, Error, JSON, String, Object, Array, state: {sessions: []}, uid: () => 'id' + (++n)});
vm.runInContext(["const setKinds=[['warmup','Warm-up'],['normal','Working'],['failure','Failure'],['dropset','Drop set']];", 'function mfd3Import(){return false}',
  ...['parseCSV', 'numericCSV', 'hevyDate', 'importIdentity', 'exerciseKey', 'sameWorkout', 'parseHevyImport'].map(fn)].join('\n'), ctx);
const hevy = E.exportFiles(data, ['workouts'], range, 'hevy')[0];
assert.equal(hevy.name, 'mfd-workouts-hevy-format_2026-11-01_to_2026-11-19.csv');
const back = JSON.parse(JSON.stringify(ctx.parseHevyImport(hevy.text, 'Europe/Berlin')));
assert.deepEqual(back.errors, []);
assert.equal(back.workouts.length, 1);
const w = back.workouts[0];
assert.deepEqual([w.name, w.date, w.started, w.finished], ['Upper, heavy', '2026-11-19', T('2026-11-19', 7, 31), T('2026-11-19', 8, 42)]);
assert.deepEqual(w.sets.map((s) => [s.exercise, s.type, s.kg ?? null, s.reps ?? null, s.distance_meters ?? null, s.duration_seconds ?? null, s.rpe ?? null]), [
  ['Bench Press (Barbell)', 'warmup', 40, 10, null, null, null], ['Bench Press (Barbell)', 'normal', 82.5, 8, null, null, 8], ['Bench Press (Barbell)', 'dropset', 60, 12, null, null, null],
  ['Seated Dumbbell Curl', 'normal', 12.25, 10, null, null, null], ['Treadmill', 'normal', null, null, 1600, 600, null]]);
console.log('PASS Hevy/Strong format: MFD\'s own Hevy importer reads it back to the same workout, times and sets');

// Several files: one .zip that the standard unzip tool opens, files byte for byte.
const all = E.exportFiles(data, E.EXPORT_AREAS, range, 'mfd');
const zipFile = path.join(dir, 'export.zip');
fs.writeFileSync(zipFile, Z.zip(all, new Date('2026-11-19T10:00:00')));
assert.match(execFileSync('unzip', ['-t', zipFile], {encoding: 'utf8'}), /No errors detected/);
execFileSync('unzip', ['-q', zipFile, '-d', path.join(dir, 'out')]);
for (const f of all) assert.equal(fs.readFileSync(path.join(dir, 'out', f.name), 'utf8'), f.text, f.name);
assert.equal(Z.crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'standard CRC-32 check value');
fs.rmSync(dir, {recursive: true, force: true});
console.log('PASS export zip: one .zip with a file per area, opened by unzip, every file identical');
