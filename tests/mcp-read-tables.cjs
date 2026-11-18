// MFD 3.0 step 4 (database/mcp-read-tables.sql): the AI connector's read tools behind a per-person switch.
// Installing it changes no answer. Switched on for one person, every read tool answers the same from the tables as
// from the stored document (daily targets aside: from 3.0 they're worked out from the date of birth), and nobody
// else is affected. The rebuild can't be called directly by a client, and re-running the file is safe.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const as = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', bs = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', RES = 'https://mfd-connect.invalid/mcp';
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const T = (n) => Date.parse(day(n) + 'T17:00:00Z');

function diary(who) {
  const sessions = Array.from({ length: 6 }, (_, k) => ({ id: `${who}w${k}`, name: k % 2 ? 'Legs' : 'Push', date: day(30 - k * 5), started: T(30 - k * 5), finished: T(30 - k * 5) + 3600000, routineId: k ? null : 'r1',
    sets: [0, 1, 2].map((i) => ({ id: `${who}${k}-${i}`, exercise: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', tracking: 'weight_reps',
      type: i ? 'normal' : 'warmup', group: 0, set: i + 1, kg: 60 + k * 2.5 + i * 5, reps: 8 - i, done: true, notes: '' })) }));
  return {
    profile: { name: 'Alex', firstName: 'Alex', sex: 'male', age: 31, height: 180, weight: 80, target: 76, activity: 1.55, goal: 'Fat loss', days: 4, onboarded: true, cal: 2400, protein: 160, carbs: 250, fat: 70 },
    mfdSettings: { weightUnit: 'kg', defaultRestSec: 90 }, chat: [], active: null, sessions,
    folders: [{ id: 'f1', name: 'Push Pull Legs' }], folderOpen: {},
    routines: [{ id: 'r1', name: 'Push A', folderId: 'f1', exercises: [{ name: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', sets: 3, reps: 8, kg: 80, rest: 90, notes: '', superset_id: null, setDetails: [] }] },
               { id: 'r2', name: 'Legs', folderId: null, exercises: [] }],
    meals: [{ id: `${who}m1`, date: day(2), meal: 'Lunch', name: 'Skyr', amount: 200, unit: 'g', labelFood: { id: 'off-1', name: 'Skyr', basis: 100, unit: 'g', cal: 60, p: 11, c: 4, f: 0.2 }, cal: 120, p: 22, c: 8, f: 0.4 }],
    products: [], foodFavorites: [], water: { [day(2)]: 1500 },
    weights: [{ id: `${who}k1`, date: day(20), kg: 81.2 }, { id: `${who}k2`, date: day(1), kg: 79.6 }],
    checkins: [{ id: 'c1', date: day(3), sleep: 7.5, steps: 9000, energy: 4, note: '' }],
  };
}

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create schema auth;
    create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table auth.refresh_tokens(id bigserial primary key,session_id uuid,user_id varchar(255),revoked boolean);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into auth.users values('${alice}'),('${bob}'); insert into auth.sessions values('${as}','${alice}'),('${bs}','${bob}');
    insert into auth.refresh_tokens(session_id,user_id,revoked) values('${as}','${alice}',false),('${bs}','${bob}',false);`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  await db.exec(readFileSync('database/sync-observability.sql', 'utf8'));
  await db.exec(readFileSync('database/production/mcp-production.sql', 'utf8'));
  for (const f of ['mcp-suggest-targets', 'mcp-start-workout', 'mcp-recovery', 'mcp-ai-logging']) await db.exec(readFileSync(`database/${f}.sql`, 'utf8'));
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account', '12-read'])
    await db.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));
  await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}';`);
  for (const [u, w] of [[alice, 'a'], [bob, 'b']]) await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)', [u, JSON.stringify(diary(w))]);

  const as_ = async (user, worker) => { await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, session_id: user === alice ? as : bs, ...(worker ? { client_id: 'worker', aud: RES } : { aud: 'authenticated' }) })]);
    await db.exec('set role authenticated'); };
  const rpc = async (op, args = {}) => (await db.query('select public.mfd_mcp($1,$2::jsonb) as r', [op, JSON.stringify(args)])).rows[0].r;
  for (const u of [alice, bob]) { await as_(u); await rpc('consent', { client_id: 'app-a', permissions: ['workouts', 'routines', 'nutrition', 'progress', 'profile', 'recovery'], timezone: 'UTC' }); }

  // Every read tool, with an explicit order where the tool otherwise uses the stored order.
  const reads = [['workouts', { order: 'newest' }], ['routines', {}], ['nutrition', { order: 'newest' }], ['progress', { order: 'newest' }], ['recovery', {}],
    ['summarize_training', { group: 'week' }], ['list_exercises', {}], ['exercise_progress', { exercise: 'Bench Press (Barbell)' }], ['personal_records', {}],
    ['muscle_volume', {}], ['summarize_nutrition', { group: 'day' }], ['list_saved_foods', {}], ['weight_trend', {}]];
  const answers = async (u) => { await as_(u, true); const out = {}; for (const [op, args] of reads) out[op] = await rpc(op, { connection: 'app-a', ...args }); return out; };
  // What a reader sees of each entry (the stored document also carries bookkeeping the tables don't keep).
  const view = (op, r) => {
    const d = r.data;
    if (op === 'workouts') return d.map((w) => ({ id: w.id, name: w.name, date: w.date, sets: (w.sets || []).map((s) => [s.exercise, s.kg, s.reps, s.type]) }));
    if (op === 'routines') return d.map((x) => ({ id: x.id, name: x.name, folder: x.folder, exercises: x.exercises.map((e) => [e.name, e.sets, e.reps, e.kg]) }));
    if (op === 'nutrition') return d.map((m) => [m.id, m.date, m.meal, m.name, m.amount, m.cal, m.p]);
    if (op === 'progress') return d.map((w) => [w.id, w.date, w.kg]);
    if (op === 'summarize_nutrition') return { ...d, daily_targets: undefined, periods: d.periods.map(({ avg_kcal_vs_target_pct, avg_protein_vs_target_pct, ...p }) => p) };
    return d;
  };

  // Installing the switch changes no answer.
  const before = await answers(alice), bobBefore = await answers(bob);
  await db.exec('reset role');
  const sql = readFileSync('database/mcp-read-tables.sql', 'utf8');
  await db.exec(sql); await db.exec(sql); // safe to re-run
  assert.deepEqual(await answers(alice), before);
  for (const fn of ['mfd_mcp.dispatch(text,jsonb)', 'mfd_mcp.recovery(jsonb)', 'mfd_mcp.routines_out(jsonb)'])
    assert.ok((await db.query('select pg_get_functiondef($1::regprocedure) d', [fn])).rows[0].d.includes('mfd_mcp.read_doc('), fn);

  // Switched on for Alice: the same answers from the tables; Bob still reads his stored document.
  await db.exec('reset role'); await db.query('insert into diary.read_from_tables values ($1)', [alice]);
  const after = await answers(alice);
  for (const [op] of reads) assert.deepEqual(view(op, after[op]), view(op, before[op]), op);
  assert.notDeepEqual(after.summarize_nutrition.data.daily_targets, before.summarize_nutrition.data.daily_targets, 'targets come from the date of birth in 3.0');
  assert.deepEqual(await answers(bob), bobBefore);

  // It really reads the tables: a change made only in the tables shows for Alice.
  await db.exec('reset role'); await db.exec(`update diary.weigh_ins set weight_kg = 79.1 where user_id = '${alice}' and legacy_id = 'ak2'`);
  assert.equal((await answers(alice)).progress.data[0].kg, 79.1);

  // A client can't call the switch or the rebuild directly.
  await as_(alice, true);
  await assert.rejects(db.query(`select mfd_mcp.read_doc('${alice}', '{}')`), /permission denied/);
  await assert.rejects(db.query(`select diary.as_envelope('${alice}')`), /permission denied/);

  console.log('mcp read tables: no change when installed; switched on, all 13 read tools answer the same from the tables; others unaffected; not callable directly');
})().catch((e) => { console.error(e); process.exit(1); });
