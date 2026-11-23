// Load test data: writes SQL that creates many synthetic people with realistic diaries (no real data).
// Usage: node database/load/seed.cjs <people> [seed]   → SQL on stdout
// Sizes are a mix like a real user base: most light, some regular, a few heavy, plus "extreme" people at the end.
//   light   30 workouts,  90 meals      (60%)
//   regular 150 workouts, 450 meals     (30%)
//   heavy   400 workouts, 1200 meals    (9%)
//   extreme 1100 workouts, 2000 meals (near the 8 MB diary limit)   (1%, at least 1)
// A workout has 6 exercises x 4 sets (24 sets), like a typical gym session. Every person also has folders, routines
// (two folders with the same routine names, as in real use), own exercises, products, water, weigh-ins, check-ins.
const people = Number(process.argv[2] || 100);
let seed = Number(process.argv[3] || 7);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const uuid = (i) => `10ad0000-0000-4000-8000-${String(i).padStart(12, '0')}`;   // numbered: never repeats
const EX = [['Bench Press (Barbell)', 'bench_press_barbell'], ['Squat (Barbell)', 'squat_barbell'], ['Lat Pulldown (Cable)', 'lat_pulldown_cable'],
  ['Seated Row (Cable)', 'seated_row_cable'], ['Shoulder Press (Dumbbell)', 'shoulder_press_dumbbell'], ['Leg Press (Machine)', 'leg_press_machine'],
  ['Bicep Curl (Dumbbell)', 'bicep_curl_dumbbell'], ['Triceps Pushdown (Cable)', 'triceps_pushdown_cable'], ['Romanian Deadlift (Barbell)', 'romanian_deadlift_barbell']];
const DAY = 864e5, T0 = Date.UTC(2023, 0, 2, 17);
const date = (ms) => new Date(ms).toISOString().slice(0, 10);

function workout(u, k) {
  const id = `w${k}`, started = T0 + k * DAY * 1.3, sets = [];
  for (let g = 0; g < 6; g++) {
    const [exercise, catalogId] = EX[(k + g) % EX.length];
    for (let i = 0; i < 4; i++) sets.push({id: `${id}-s${g}-${i}`, exercise, catalogId, catalogSource: 'MFD', tracking: 'weight_reps', type: i === 0 ? 'warmup' : 'normal',
      group: g, set: i + 1, kg: pick([20, 40, 60, 62.5, 80, 100]), reps: pick([5, 8, 10, 12]), done: true, notes: '', rpe: i === 3 ? pick([8, 9, null]) : null,
      mfdDoneAt: started + (g * 4 + i) * 120000});
  }
  return {id, name: pick(['Upper 1', 'Upper 2', 'Lower 1', 'Lower 2', 'Push', 'Pull']), date: date(started), started, finished: started + 3600000, routineId: null, sets};
}
function diary(u, size) {
  const [nw, nm] = {light: [30, 90], regular: [150, 450], heavy: [400, 1200], extreme: [1100, 2000]}[size];
  const routines = [];
  for (const [f, folderId] of [['A', 'f1'], ['B', 'f2']]) for (const name of ['Upper 1', 'Upper 2', 'Lower 1', 'Lower 2'])
    routines.push({id: `r-${f}-${name.replace(' ', '')}`, name, folderId, exercises: EX.slice(0, 5).map(([n, c], j) => ({name: n, catalogId: c, catalogSource: 'MFD', sets: 3, reps: 8, kg: 40 + j * 10, rest: 90,
      setDetails: [{type: 'warmup', kg: 20, reps: 10}, {type: 'normal', kg: 40 + j * 10, reps: 8}, {type: 'normal', kg: 40 + j * 10, reps: 8}]}))});
  const water = {}; for (let d = 0; d < Math.min(nm / 3, 400); d++) water[date(T0 + d * DAY)] = pick([1500, 2000, 2500, 3250]);
  return {
    profile: {name: `Load ${u}`, firstName: 'Load', onboarded: true, sex: pick(['male', 'female']), height: pick([165, 172, 180]), activity: 1.55, goal: 'Maintain', days: 4,
      cal: 2400, protein: 160, carbs: 250, fat: 70, birthDate: '1994-03-14', waterGoalMl: 3000},
    mfdSettings: {weightUnit: 'kg', defaultRestSec: 90},
    meals: Array.from({length: nm}, (_, i) => ({id: `m${i}`, date: date(T0 + Math.floor(i / 3) * DAY), meal: ['Breakfast', 'Lunch', 'Dinner'][i % 3], name: pick(['Skyr', 'Oats', 'Rice', 'Chicken', 'Dal']),
      amount: pick([100, 150, 200, 250]), unit: 'g', cal: pick([120, 380, 260, 330]), p: 20, c: 30, f: 8})),
    products: Array.from({length: 15}, (_, i) => ({id: `p${i}`, name: `Food ${i}`, basis: 100, unit: 'g', cal: 100 + i, p: 10, c: 10, f: 3})),
    foodFavorites: ['Skyr', 'Oats'], water,
    weights: Array.from({length: Math.min(nw, 200)}, (_, i) => ({id: `k${i}`, date: date(T0 + i * DAY * 2), kg: 80 - i * 0.02})),
    checkins: Array.from({length: 20}, (_, i) => ({id: `c${i}`, date: date(T0 + i * DAY * 7), sleep: 7, energy: 3})),
    chat: [], folders: [{id: 'f1', name: 'Program A'}, {id: 'f2', name: 'Program B'}], folderOpen: {}, routines,
    mfdExercises: Array.from({length: 10}, (_, i) => ({id: `custom:own${i}`, name: `Own exercise ${i}`, tracking: 'weight_reps', source: 'custom'})),
    sessions: Array.from({length: nw}, (_, k) => workout(u, k)), active: null,
  };
}
const lit = (v) => "$j$" + JSON.stringify(v) + "$j$::jsonb";
const sizes = Array.from({length: people}, (_, i) => i >= people - Math.max(1, Math.round(people * 0.01)) ? 'extreme' : i % 100 < 60 ? 'light' : i % 100 < 90 ? 'regular' : 'heavy');
process.stdout.write('create table if not exists lt_people (n int primary key, id uuid not null, size text not null);\n');
sizes.forEach((size, i) => {
  const u = uuid(i + 1);
  process.stdout.write(`insert into auth.users(id) values('${u}'); insert into public.forma_workspaces(user_id, payload) values('${u}', ${lit(diary(i, size))});\n` +
    `insert into lt_people values(${i + 1}, '${u}', '${size}');\n`);
});
