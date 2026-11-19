// Database move, step 2b wiring (database/diary/15-tables-switch.sql), end to end on the real pieces: delta sync
// (workspace-delta.sql), the Friends feed trigger, the AI connector and the switch. Alice is switched on, Bob isn't.
//   * Bob saves exactly as before.
//   * Switching Alice on: her diary comes back identical, phones get an empty change, her feed stays.
//   * 150 random saves by the app (its own diff), a second phone following by downloading only changes: after every
//     save both phones and the server's full download are exactly the same diary.
//   * The AI connector (log a workout, start a workout) and the other ways of writing (the whole diary written back, a
//     list changed in place) land in the tables; the second phone gets them too; the feed follows the tables.
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

  // An older app (old save) can't save training for Alice.
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
