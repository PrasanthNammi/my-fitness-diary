// Database move, step 2b wiring (database/diary/15-tables-switch.sql), end to end on the real pieces: delta sync
// (workspace-delta.sql), the Friends feed trigger, the AI connector and the switch. Alice is switched on, Bob isn't.
//   * Bob saves exactly as before.
//   * Switching Alice on: her diary comes back identical, phones get an empty change, her feed stays.
//   * 150 random saves by the app (its own diff), a second phone following by downloading only changes: after every
//     save both phones and the server's full download are exactly the same diary.
//   * The AI connector (log a workout, start a workout) and the other ways of writing (the whole diary written back, a
//     list changed in place) land in the tables; the second phone gets them too; the feed follows the tables.
//   * Food, body and settings move too (diary.move_areas): identical diary, 250 random saves of meals, water, weights,
//     check-ins, settings, My foods and suggestions on two phones; the AI connector's food, weight, water, settings,
//     suggestion and water-goal writes, its activity list and undo; new accounts start fully in the tables.
//   * An older app's save of training is refused for Alice; switching back puts everything in the document again.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
require('../public/legacy/workspace-ops.js');
const W = globalThis.MFDWorkspaceOps;
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const as_ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', RES = 'https://mfd-connect.invalid/mcp';
const TRAINING = ['sessions', 'active', 'folders', 'routines', 'mfdExercises'];
let seed = Number(process.env.SEED || 7);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const T0 = Date.UTC(2026, 9, 1, 17), day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
let uid = 0; const id = (p) => `${p}${++uid}`;
const set = (w, g, i, o = {}) => ({id: id(`${w}-s`), exercise: g ? 'Band Walk' : 'Bench Press (Barbell)', catalogId: g ? 'custom:band' : 'bench_press_barbell', catalogSource: g ? 'Custom' : 'MFD',
  tracking: g ? 'reps' : 'weight_reps', type: 'normal', group: g, set: i + 1, kg: g ? null : pick([40, 60, 82.5]), reps: pick([5, 8, 10]), done: true, notes: '', ...o});
const workout = (k) => { const w = id('w'), started = T0 + k * 864e5; return {id: w, name: pick(['Push', 'Pull']), date: new Date(started).toISOString().slice(0, 10), started, finished: started + 36e5, routineId: null, sets: [set(w, 0, 0), set(w, 0, 1), set(w, 1, 0)]}; };
function diary() {
  return {profile: {name: 'Alex', onboarded: true, cal: 2400, protein: 160, carbs: 250, fat: 70, days: 4}, meals: [], weights: [{id: 'k1', date: day(3), kg: 80}], checkins: [], chat: [], water: {},
    mfdSettings: {weightUnit: 'kg', defaultRestSec: 90}, folderOpen: {}, folders: [{id: 'f1', name: 'PPL'}],
    mfdExercises: [{id: 'custom:band', name: 'Band Walk', tracking: 'reps', source: 'custom'}, {id: 'history:row', name: 'Rowing (Hevy)', tracking: 'weight_reps', source: 'custom', equipment: ''}],
    routines: [{id: 'r1', name: 'Push A', folderId: 'f1', exercises: [{name: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', sets: 2, reps: 8, kg: 80, rest: 120, setDetails: [{type: 'warmup', kg: 40, reps: 10}, {type: 'normal', kg: 80, reps: 8}]}]}],
    sessions: [0, 1, 2, 3].map(workout), active: null};
}
function edit(d, k) {
  const r = rnd();
  if (r < 0.2) d.sessions.push(workout(k + 10));
  else if (r < 0.45 && d.sessions.length) { const s = pick(pick(d.sessions).sets); if (s) { s.reps = pick([6, 9, 12]); s.kg = s.kg == null ? null : pick([42.5, 61.25]); } }
  else if (r < 0.5 && d.sessions.length > 2) d.sessions.splice(Math.floor(rnd() * d.sessions.length), 1);
  else if (r < 0.62) { if (!d.active) d.active = {...workout(k + 40), finished: null, rest: {0: {duration: 90, end: T0}}}; else { const s = pick(d.active.sets); s.done = !s.done; } }
  else if (r < 0.67 && d.active) { const {rest, ...a} = d.active; d.sessions.push({...a, id: id('w'), finished: a.started + 36e5}); d.active = null; }
  else if (r < 0.74) d.routines.push({id: id('r'), name: 'Legs', folderId: null, exercises: []});
  else if (r < 0.78 && d.routines.length) pick(d.routines).name = 'Renamed';
  else if (r < 0.82) d.meals.push({id: id('m'), date: day(0), meal: 'Lunch', name: 'Skyr', amount: 200, unit: 'g', cal: 120, p: 22, c: 8, f: 0.4});
  else if (r < 0.86) d.water[day(0)] = (d.water[day(0)] || 0) + 250;
  else if (r < 0.9) d.mfdExercises.push({id: id('history:x'), name: id('Move '), tracking: 'reps', source: 'custom'});
  else if (r < 0.93) d.folderOpen.f1 = !d.folderOpen.f1;
  else if (d.sessions.length) pick(d.sessions).name = 'Renamed';
  return JSON.parse(JSON.stringify(d));
}

// Food, body and settings edits the app makes (after they move to the tables too): odd values and unknown details kept.
const AREAS = ['meals', 'products', 'foodFavorites', 'water', 'weights', 'checkins', 'profile', 'mfdSettings', 'aiSuggestions', 'aiChanges'];
function editAreas(d, k) {
  const r = rnd(), L = (key) => (d[key] = Array.isArray(d[key]) ? d[key] : []);
  if (r < 0.15) L('meals').push({id: id('m'), date: day(k % 5), meal: pick(['Breakfast', 'Lunch', 'Snack']), name: pick(['Skyr', 'Dal', 'Rice']), amount: pick([200, 75.5, 1]),
    unit: pick(['g', 'ml', 'serving']), cal: pick([120, 333.33, 0]), p: 22, c: 8, f: 0.4, ...(rnd() < 0.3 ? {labelFood: {id: id('lf'), name: 'Skyr', basis: 100, unit: 'g', cal: 60}} : {}), ...(rnd() < 0.2 ? {fiber: 2.5, x: {odd: [1, null]}} : {})});
  else if (r < 0.25 && d.meals.length) { const m = pick(d.meals); m.amount = pick([150, 99.9]); if (rnd() < 0.3) delete m.f; if (rnd() < 0.3) m.note = 'extra'; }
  else if (r < 0.3 && d.meals.length) d.meals.splice(Math.floor(rnd() * d.meals.length), 1);
  else if (r < 0.33 && d.meals.length > 1) d.meals.reverse();
  else if (r < 0.42) { d.water = d.water || {}; const w = day(k % 4); if (rnd() < 0.2) delete d.water[w]; else d.water[w] = (d.water[w] || 0) + pick([250, 330, 0.5]); }
  else if (r < 0.5) L('weights').push({id: id('k'), date: day(k % 9), kg: pick([80, 79.45, 81.2]), ...(rnd() < 0.3 ? {waist: 82, note: ''} : {})});
  else if (r < 0.54 && d.weights.length) { const w = pick(d.weights); w.kg = pick([78.9, 80]); }
  else if (r < 0.57 && d.weights.length) d.weights.splice(0, 1);
  else if (r < 0.62) L('checkins').push({id: id('c'), date: day(k % 6), sleep: pick([6.5, 8, null]), energy: pick([3, 4]), soreness: {legs: 2}});
  else if (r < 0.7) { d.profile = d.profile || {}; const f = pick(['cal', 'protein', 'name', 'waterGoalMl', 'days', 'unknownThing']); if (rnd() < 0.2) delete d.profile[f]; else d.profile[f] = pick([2500, 'Alex B', 3000, 5, {a: 1}, null]); }
  else if (r < 0.76) { d.mfdSettings = d.mfdSettings || {}; const f = pick(['weightUnit', 'defaultRestSec', 'theme']); d.mfdSettings[f] = pick(['lb', 'kg', 120, 'dark', null]); }
  else if (r < 0.82) L('products').push({id: id('p'), name: pick(['Oats', 'Whey']), basis: 100, unit: 'g', cal: pick([389, 120.5]), p: 13, c: 66, f: 7, ...(rnd() < 0.3 ? {barcode: '4001234567890'} : {})});
  else if (r < 0.85 && d.products?.length) pick(d.products).cal = 400;
  else if (r < 0.88 && d.products?.length) d.products.splice(0, 1);
  else if (r < 0.92) { d.foodFavorites = Array.isArray(d.foodFavorites) ? d.foodFavorites : []; d.foodFavorites.push(pick(['Skyr', 'Oats', `lf:${k}`])); }
  else if (r < 0.95) L('aiSuggestions').push({id: id('s'), routineId: 'r1', createdAt: T0 + k, status: 'pending', exercises: [{name: 'Bench Press (Barbell)', sets: [{kg: 82.5, reps: 8}]}]});
  else if (r < 0.97 && d.aiSuggestions?.length) pick(d.aiSuggestions).status = 'dismissed';
  else edit(d, k);
  return JSON.parse(JSON.stringify(d));
}

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create schema auth;
    create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table auth.refresh_tokens(id bigserial primary key,session_id uuid,user_id varchar(255),revoked boolean);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into auth.users values ('${alice}'), ('${bob}'); insert into auth.sessions values ('${as_}', '${alice}');
    insert into auth.refresh_tokens(session_id,user_id,revoked) values ('${as_}','${alice}',false);
    create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as $$select 1::bigint$$;`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  await db.exec(readFileSync('database/sync-observability.sql', 'utf8'));
  await db.exec(readFileSync('database/production/mcp-production.sql', 'utf8'));
  for (const f of ['mcp-suggest-targets', 'mcp-start-workout', 'mcp-recovery', 'mcp-ai-logging', 'mcp-routine-edit']) await db.exec(readFileSync(`database/${f}.sql`, 'utf8'));
  await db.exec('create schema if not exists mfd_private'); await db.exec(readFileSync('database/workspace-delta.sql', 'utf8'));
  const social = readFileSync('database/social-incremental.sql', 'utf8');
  const project = social.slice(social.indexOf('create or replace function mfd_private.project_workouts()'), social.indexOf('end loop;return new;end$$;') + 'end loop;return new;end$$;'.length);
  await db.exec(`create table public.mfd_social_workouts(owner_id uuid not null, workout_id text not null, data jsonb not null, started_at timestamptz not null,
    updated_at timestamptz not null default now(), primary key(owner_id, workout_id)); ${project}
    create trigger mfd_project_workouts after insert or update on public.forma_workspaces for each row execute function mfd_private.project_workouts();`);
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body',
    '10-account', '11-fill-account', '12-read', '13-save-rows', '14-apply-training', '15-tables-switch']) await db.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));
  await db.exec(readFileSync('database/diary/15-tables-switch.sql', 'utf8')); // safe to re-run
  await db.exec(readFileSync('database/mcp-read-tables.sql', 'utf8'));
  for (let i = 0; i < 2; i++) await db.exec(readFileSync('database/diary/16-everyone-3.sql', 'utf8')); // (and safe to re-run)
  await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}', writes_enabled=true;`);
  for (const u of [alice, bob]) await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [u, JSON.stringify(diary())]);

  const sql = async (q, p = []) => { await db.exec('reset role'); return (await db.query(q, p)).rows[0]; };
  const asUser = async (u, q, p = [], worker = false) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub: u, session_id: as_, ...(worker ? {client_id: 'worker', aud: RES} : {aud: 'authenticated'})})]);
    await db.exec('set role authenticated');
    try { return (await db.query(q, p)).rows[0]; } finally { await db.exec('reset role'); }
  };
  const full = async (u) => (await asUser(u, `select public.forma_workspace_full() f`)).f;
  const save = async (u, ops, rev) => asUser(u, `select * from public.forma_save_changes($1, $2)`, [JSON.stringify(ops), rev]);
  const pull = async (u, since) => (await asUser(u, `select public.forma_workspace_pull($1) p`, [since])).p;
  const feed = async (u) => (await sql(`select coalesce(jsonb_object_agg(workout_id, data), '{}') f from public.mfd_social_workouts where owner_id = $1`, [u])).f;
  const feedFromTables = async (u) => (await sql(`select coalesce(jsonb_object_agg(legacy_id, diary.feed_copy(w)), '{}') f from diary.workouts w where user_id = $1 and deleted_at is null and ended_at is not null`, [u])).f;

  // Bob (not switched): forma_save_changes is the old save.
  let b = await full(bob);
  const bobNext = edit(JSON.parse(JSON.stringify(b.payload)), 0);
  let r = await save(bob, W.diff(b.payload, bobNext), b.revision);
  assert.equal(r.conflict, false);
  assert.deepEqual((await full(bob)).payload, (await sql(`select payload from public.forma_workspaces where user_id = $1`, [bob])).payload, 'Bob: stored document = his diary');
  assert.ok((await sql(`select payload ? 'sessions' s from public.forma_workspaces where user_id = $1`, [bob])).s);

  // Switch Alice on.
  const before = await full(alice);
  r = await sql(`select diary.move_to_tables($1) r`, [alice]);
  assert.equal(r.r.moved, true);
  const stored = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  assert.ok(TRAINING.every((k) => !(k in stored)) && Array.isArray(stored.$training), 'training is out of the document');
  let a = await full(alice);
  assert.deepEqual(a.payload, before.payload, 'her diary comes back identical');
  assert.equal(a.revision, before.revision + 1);
  assert.deepEqual((await pull(alice, before.revision)).changes, [{revision: a.revision, ops: []}], 'phones: an empty change');
  assert.equal(Object.keys(await feed(alice)).length, 4, 'her feed stays');
  assert.equal((await sql(`select diary.move_to_tables($1) r`, [alice])).r.already, true);
  assert.deepEqual((await sql(`select payload from diary.moved_payloads where user_id = $1`, [alice])).payload, (await sql(`select $1::jsonb p`, [JSON.stringify(before.payload)])).p, 'a safety copy of her diary as it was');
  console.log('PASS switch on: diary identical from the tables, an empty change for phones, feed kept; Bob unchanged');

  // The app saves; a second phone follows by downloading only the changes.
  let phone = JSON.parse(JSON.stringify(a.payload)), rev = a.revision, other = JSON.parse(JSON.stringify(a.payload)), otherRev = a.revision, saves = 0;
  for (let k = 0; k < 150; k++) {
    const next = edit(JSON.parse(JSON.stringify(phone)), k);
    const ops = W.diff(phone, next);
    if (!ops.length) continue;
    r = await save(alice, ops, rev);
    assert.equal(r.conflict, false, `save ${k}`);
    saves++;
    const now = await full(alice);
    phone = r.adjusted ? now.payload : next; rev = r.saved_revision;
    assert.deepEqual(phone, now.payload, `save ${k}: the phone's copy = the server's diary`);
    const p = await pull(alice, otherRev);
    if (p.full) other = JSON.parse(JSON.stringify(now.payload)); else for (const c of p.changes) other = W.apply(other, c.ops);
    otherRev = p.revision;
    assert.deepEqual(other, now.payload, `save ${k}: the other phone, from the changes only`);
  }
  assert.equal((await save(alice, [{k: 'meals', v: []}], rev - 1)).conflict, true, 'an out-of-date save is a conflict, as before');
  assert.deepEqual(await feed(alice), await feedFromTables(alice), 'feed = the tables');
  assert.equal((await sql(`select count(*)::int n from diary.fill_problems where kind = 'error'`)).n, 0);
  const st = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  assert.ok(TRAINING.every((k) => !(k in st)), 'still no training in the document');
  console.log(`PASS app saves: ${saves} saves, both phones and the server always the same diary (full and changes-only downloads); feed follows`);

  // The AI connector and other writers.
  await asUser(alice, `select public.mfd_mcp('consent', $1)`, [JSON.stringify({client_id: 'app-a', permissions: ['workouts', 'routines', 'log_workouts', 'log_routines', 'log_nutrition'], timezone: 'UTC'})]);
  const mcp = (op, args) => asUser(alice, `select public.mfd_mcp($1, $2::jsonb) r`, [op, JSON.stringify({connection: 'app-a', ...args})], true);
  const follow = async (label) => {
    const now = await full(alice), p = await pull(alice, otherRev);
    if (p.full) other = JSON.parse(JSON.stringify(now.payload)); else for (const c of p.changes) other = W.apply(other, c.ops);
    otherRev = p.revision;
    assert.deepEqual(other, now.payload, `${label}: the other phone follows`);
    return now.payload;
  };
  const n0 = (await full(alice)).payload.sessions.length;
  await mcp('log_workout', {date: day(0), name: 'AI run', exercises: [{exercise: 'Bench Press (Barbell)', sets: [{kg: 60, reps: 5}]}]});
  let d = await follow('log_workout');
  assert.equal(d.sessions.length, n0 + 1); assert.equal(d.sessions.at(-1).name, 'AI run');
  if (!d.active) {
    await mcp('start_workout', {name: 'AI start', exercises: [{exercise: 'Bench Press (Barbell)', sets: [{kg: 50, reps: 5}]}]});
    d = await follow('start_workout');
    assert.equal(d.active.name, 'AI start');
  }
  // The whole diary written back (as undo does): a workout removed, a meal added.
  const gone = d.sessions[0].id;
  await sql(`update public.forma_workspaces set payload = jsonb_set(diary.full_payload(user_id, payload), '{sessions}',
    (select jsonb_agg(e) from jsonb_array_elements(diary.full_payload(user_id, payload)->'sessions') e where e->>'id' <> $2)), revision = revision + 1 where user_id = $1`, [alice, gone]);
  d = await follow('whole diary written back');
  assert.ok(!d.sessions.some((s) => s.id === gone));
  // A list changed in place without loading the diary would lose the other workouts: refused unless it's an append.
  await sql(`update public.forma_workspaces set payload = jsonb_set(payload, '{routines}', $2::jsonb), revision = revision + 1 where user_id = $1`,
    [alice, JSON.stringify([{id: 'r-ai', name: 'AI plan', folderId: null, exercises: []}])]);
  d = await follow('appended in place');
  assert.ok(d.routines.some((x) => x.id === 'r-ai') && d.routines.length > 1, 'appended, nothing else lost');
  assert.deepEqual(await feed(alice), await feedFromTables(alice), 'feed = the tables');
  console.log('PASS other writers: AI log_workout and start_workout, the whole diary written back, a list appended in place: all in the tables, the other phone follows, feed follows');

  // ── Food, body and settings move to the tables too ──
  const beforeAreas = await full(alice), storedBefore = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  r = await sql(`select diary.move_areas($1) r`, [alice]);
  assert.equal(r.r.moved, true);
  const st3 = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  assert.ok([...TRAINING, ...AREAS].every((k) => !(k in st3)), `the document keeps only the rest: ${Object.keys(st3)}`);
  a = await full(alice);
  assert.deepEqual(a.payload, beforeAreas.payload, 'her diary comes back identical');
  assert.deepEqual((await pull(alice, beforeAreas.revision)).changes.map((c) => c.ops), [[]], 'phones: an empty change');
  await follow('areas moved');
  assert.equal((await sql(`select diary.move_areas($1) r`, [alice])).r.already, true);
  assert.deepEqual((await sql(`select payload from diary.moved_payloads where user_id = $1 and what = 'areas'`, [alice])).payload, storedBefore, 'a safety copy of the document as it was');
  console.log('PASS areas moved: food, body and settings out of the document, diary identical, an empty change for phones, safety copy');

  phone = JSON.parse(JSON.stringify(a.payload)); rev = a.revision; saves = 0;
  for (let k = 0; k < 250; k++) {
    const next = editAreas(JSON.parse(JSON.stringify(phone)), k);
    const ops = W.diff(phone, next);
    if (!ops.length) continue;
    r = await save(alice, ops, rev);
    assert.equal(r.conflict, false, `area save ${k}`);
    saves++;
    const now = await full(alice);
    phone = r.adjusted ? now.payload : next; rev = r.saved_revision;
    assert.deepEqual(phone, now.payload, `area save ${k}: the phone's copy = the server's diary; ops ${JSON.stringify(ops).slice(0, 400)}`);
    await follow(`area save ${k}`);
  }
  // Saves copy only what changed: the rows (and their patches) are exactly what copying everything again gives.
  const partial = (await sql(`select diary.area_json($1) a, (select coalesce(jsonb_object_agg(part, ops), '{}') from diary.doc_patches where user_id = $1) p`, [alice]));
  await sql(`select diary.set_areas($1, diary.area_values($1, diary.area_keys()))`, [alice]);
  const whole = (await sql(`select diary.area_json($1) a, (select coalesce(jsonb_object_agg(part, ops), '{}') from diary.doc_patches where user_id = $1) p`, [alice]));
  assert.deepEqual(partial, whole, 'partial copies = a full copy (rows and patches)');
  const st4 = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  assert.ok([...TRAINING, ...AREAS].every((k) => !(k in st4)), 'still nothing moved in the document');
  assert.equal((await sql(`select count(*)::int n from diary.fill_problems where kind = 'error'`)).n, 0);
  console.log(`PASS area saves: ${saves} saves of food, water, weights, check-ins, settings, My foods and suggestions, both phones and the server always the same diary`);

  // The AI connector writes food, body and settings; the app lists and undoes them.
  await asUser(alice, `select public.mfd_mcp('consent', $1)`, [JSON.stringify({client_id: 'app-a', permissions: ['workouts', 'routines', 'nutrition', 'progress', 'profile', 'log_workouts', 'log_routines', 'log_nutrition', 'log_progress', 'log_settings'], timezone: 'UTC'})]);
  // (the random edits above left odd goals; a set-up profile first, as the AI connector requires)
  r = await save(alice, [{k: 'profile', v: {...phone.profile, name: 'Alex', cal: 2400, protein: 160, carbs: 250, fat: 70, days: 4}}], rev);
  assert.equal(r.conflict, false); await follow('profile set up');
  let n = (await full(alice)).payload;
  await mcp('log_meal', {meal: 'lunch', name: 'AI Dal', amount: 250, unit: 'g', kcal: 300, protein: 15, date: day(0)});
  d = await follow('log_meal');
  assert.equal(d.meals.length, n.meals.length + 1); assert.equal(d.meals.at(-1).name, 'AI Dal');
  assert.deepEqual(d.weights, n.weights, 'nothing else changed');
  await mcp('log_weight', {kg: 79.3, date: day(0)});
  d = await follow('log_weight');
  assert.equal(d.weights.at(-1).kg, 79.3); assert.equal(d.meals.length, n.meals.length + 1);
  const water0 = Number(d.water?.[day(0)] || 0);
  await mcp('log_water', {ml: 300, date: day(0), request_id: 'w1'});
  d = await follow('log_water');
  assert.equal(d.water[day(0)], water0 + 300);
  const step1 = (await mcp('change_settings', {default_rest_seconds: 150})).r;
  assert.equal(step1.saved, false); assert.ok(step1.confirm_token, JSON.stringify(step1));
  await mcp('change_settings', {default_rest_seconds: 150, confirm_token: step1.confirm_token});
  d = await follow('change_settings');
  assert.equal(d.mfdSettings.defaultRestSec, 150); assert.equal(d.profile.name, n.profile.name, 'the profile kept');
  const list = (await asUser(alice, `select public.mfd_mcp('ai_entries', $1) r`, [JSON.stringify({client_id: 'app-a'})])).r;
  for (const kind of ['sessions', 'meals', 'weights']) assert.ok(list.some((e) => e.kind === kind), `AI activity lists ${kind}: ${JSON.stringify(list).slice(0, 300)}`);
  const meal = list.find((e) => e.kind === 'meals');
  await asUser(alice, `select public.mfd_mcp('undo', $1) r`, [JSON.stringify({client_id: 'app-a', ids: [meal.id]})]);
  d = await follow('undo meal');
  assert.ok(!d.meals.some((m) => m.id === meal.id), 'the AI meal undone'); assert.equal(d.weights.at(-1).kg, 79.3);
  // In-place writers: the AI suggestion list and the water goal.
  const sg = (await full(alice)).payload.aiSuggestions?.length || 0;
  const sr = (await mcp('suggest_workout_targets', {routine: n.routines[0].name, exercises: [{exercise: 'Bench Press (Barbell)', sets: [{kg: 85, reps: 6}]}]})).r;
  d = await follow('suggest');
  assert.equal(d.aiSuggestions.at(-1).id, sr.id); assert.equal(d.aiSuggestions.length, Math.min(sg + 1, 30));
  assert.ok(d.meals.length === n.meals.length && d.weights.length === n.weights.length + 1 && d.profile.cal === 2400, 'suggestions: nothing else lost');
  // The water goal (proposed by the AI, approved in the app, then set): the profile record changed in place.
  const cur = await full(alice);
  const prop = (await mcp('propose_water_goal', {water_goal_ml: 3200, expected_revision: cur.revision})).r;
  await asUser(alice, `select public.mfd_mcp('approve', $1) r`, [JSON.stringify({proposal_id: prop.proposal_id})]);
  await mcp('apply_water_goal', {proposal_id: prop.proposal_id});
  d = await follow('water goal');
  assert.deepEqual(d.profile, {...cur.payload.profile, waterGoalMl: 3200}, 'the water goal set, the rest of the profile kept');
  for (const f of ['mfd_mcp.dispatch(text,jsonb)', 'mfd_mcp.suggest(jsonb)', 'mfd_mcp.change_settings(jsonb)', 'mfd_mcp.recent_ai_entries(uuid,text)'])
    assert.match((await sql(`select pg_get_functiondef($1::regprocedure) d`, [f])).d, /diary\.full_payload/, `${f} reads the whole diary`);
  const tb = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  assert.ok([...TRAINING, ...AREAS].every((k) => !(k in tb)), 'the AI writes left the document small');
  console.log('PASS AI connector: log_meal, log_weight, log_water, change_settings (two steps), suggestions, the water goal, the app\'s AI list and undo, all from the tables; the other phone follows');

  // New accounts start in the tables (switching is in use), and an empty sign-up works too.
  const carol = '33333333-3333-4333-8333-333333333333', dan = '44444444-4444-4444-8444-444444444444';
  await sql(`insert into auth.users values ($1), ($2)`, [carol, dan]);
  const cd = diary();
  await sql(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [carol, JSON.stringify(cd)]);
  const cs = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [carol])).payload;
  assert.ok([...TRAINING, ...AREAS].every((k) => !(k in cs)) && Array.isArray(cs.$training), 'Carol starts in the tables');
  assert.deepEqual((await full(carol)).payload, (await sql(`select $1::jsonb p`, [JSON.stringify(cd)])).p, 'her diary as she saved it');
  await sql(`insert into public.forma_workspaces (user_id, payload) values ($1, '{"profile":{},"meals":[],"weights":[],"checkins":[],"chat":[],"sessions":[],"routines":[]}')`, [dan]);
  const dn = await full(dan);
  assert.deepEqual(dn.payload, {profile: {}, meals: [], weights: [], checkins: [], chat: [], sessions: [], routines: []});
  r = await save(dan, [{k: 'meals', i: 'm-d', v: {id: 'm-d', date: day(0), meal: 'Lunch', name: 'Toast', amount: 1, unit: 'serving', cal: 90}}], dn.revision);
  assert.equal(r.conflict, false); assert.equal((await full(dan)).payload.meals[0].name, 'Toast');
  assert.equal((await sql(`select count(*)::int n from diary.fill_problems where legacy_id like 'switch_new%'`)).n, 0);
  console.log('PASS new accounts start in the tables (training, food, body and settings) with their diary exactly as saved');

  // MFD 3.0 for everyone (16-everyone-3.sql): new accounts join the list; a profile row only with a date of birth.
  const erin = '55555555-5555-4555-8555-555555555555';
  await sql(`insert into auth.users values ($1)`, [erin]);
  assert.equal((await asUser(erin, `select public.mfd3_enabled() is_on`)).is_on, true, 'a new account has 3.0 (its set-up asks for the date of birth)');
  assert.equal((await sql(`select count(*)::int n from auth.users u where not exists (select 1 from diary.mfd3_people p where p.user_id = u.id)`)).n, 0, 'every account has 3.0');
  await sql(`insert into public.forma_workspaces (user_id, payload) values ($1, '{"profile":{},"meals":[],"weights":[],"checkins":[],"chat":[],"sessions":[],"routines":[]}')`, [erin]);
  let e0 = await full(erin);
  const setUp = {...e0.payload.profile, name: 'Erin', firstName: 'Erin', onboarded: true, height: 170, sex: 'female', activity: 'light', cal: 2000, protein: 120, carbs: 200, fat: 60, days: 3};
  await assert.rejects(save(erin, [{k: 'profile', v: setUp}], e0.revision), /birth_date/, 'a set-up without a date of birth (older app) is refused');
  assert.deepEqual((await full(erin)).payload, e0.payload, 'nothing saved');
  e0 = await full(erin);
  r = await save(erin, [{k: 'profile', v: {...setUp, birthDate: '1995-04-12', age: 31}}], e0.revision);
  assert.equal(r.conflict, false);
  assert.equal((await sql(`select birth_date::text d from diary.user_profiles where user_id = $1`, [erin])).d, '1995-04-12', 'the profile row with the date of birth');
  e0 = await full(erin);
  const {birthDate, ...noDob} = e0.payload.profile;
  r = await save(erin, [{k: 'profile', v: noDob}], e0.revision);
  assert.equal(r.conflict, false, 'an older app dropping the date of birth still saves');
  assert.equal((await sql(`select birth_date::text d from diary.user_profiles where user_id = $1`, [erin])).d, '1995-04-12', 'the date of birth is kept');
  assert.deepEqual((await full(erin)).payload.profile, noDob, 'the diary as saved');
  await assert.rejects(sql(`update diary.user_profiles set birth_date = null where user_id = $1`, [erin]), /null value|not-null/);
  console.log('PASS 3.0 for everyone: new accounts join (set-up asks the date of birth); date of birth required, a set-up without one waits for it');

  // Big diaries (over the old 8 MB document limit): saved whole and as changes, back exactly; the stored
  // document stays small.
  const big = (n0) => Array.from({length: 300}, (_, k) => ({...workout(n0 + k), notes: 'long note '.repeat(3000) + k}));   // ~30 KB each: over 8 MB with few rows
  let cf = await full(carol);
  const more0 = big(9000);
  const bigDoc = {...cf.payload, sessions: big(5000)};
  assert.ok(JSON.stringify(bigDoc).length > 8e6 && JSON.stringify(more0).length > 8e6, `${JSON.stringify(bigDoc).length} bytes`);
  r = await asUser(carol, `select * from public.forma_save_workspace_v2($1, $2)`, [JSON.stringify(bigDoc), cf.revision]);
  assert.equal(r.conflict, false, 'a whole 9 MB+ diary is saved');
  cf = await full(carol);
  assert.deepEqual(cf.payload.sessions, (await sql(`select $1::jsonb s`, [JSON.stringify(bigDoc.sessions)])).s, 'and comes back exactly');
  const more = more0;
  r = await save(carol, more.map((w) => ({k: 'sessions', i: w.id, v: w})), cf.revision);
  assert.equal(r.conflict, false, 'changes over 8 MB are saved');
  cf = await full(carol);
  assert.equal(cf.payload.sessions.length, 600);
  assert.ok((await sql(`select octet_length(payload::text) n from public.forma_workspaces where user_id = $1`, [carol])).n < 20000, 'the stored document stays small');
  await assert.rejects(asUser(bob, `select * from public.forma_save_workspace_v2($1, $2)`, [JSON.stringify({...bigDoc}), (await full(bob)).revision]), /Invalid workspace document/,
    'a diary still in the document keeps the 8 MB limit');
  console.log('PASS big diaries: whole saves and changes over 8 MB (long workouts), back exactly; the document limit stays for diaries not moved');

  // An older app (old save) can't save training or food for Alice.
  const now = await full(alice);
  await assert.rejects(asUser(alice, `select * from public.forma_save_workspace_patch($1, $2)`, [JSON.stringify([{k: 'sessions', i: now.payload.sessions[0].id, d: true}]), now.revision]), /Not a list|Invalid workspace/);
  assert.deepEqual((await full(alice)).payload, now.payload, 'nothing changed');

  // Switching back.
  r = await sql(`select diary.move_back($1) r`, [alice]);
  const back = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  assert.deepEqual(back, now.payload, 'the document has everything again');
  assert.deepEqual((await full(alice)).payload, now.payload);
  await follow('switched back');
  console.log('PASS safety: an older app can\'t save training for a switched person; switching back restores the document exactly');
})().catch((e) => { console.error(e); process.exit(1); });
