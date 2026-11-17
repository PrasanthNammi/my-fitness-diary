// MFD 3.0 database, account and AI: profiles, goals, settings, AI suggestions and AI actions build (twice), fill from
// a production-shaped envelope and follow it. No age and no weight are stored (date of birth comes from the pop-up,
// weight is the latest weigh-in); entries ChatGPT or Claude added point to their AI action; all four fill-ins run in
// order on one save; rules and ownership hold.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));
const by = (req) => ({ connection: 'https://claude.ai/connector', at: '2026-11-16T10:00:00Z', ...(req ? { request: req } : {}) });
function diary() {
  return {
    profile: { name: 'Alex M', firstName: 'Alex', lastName: 'M', age: 31, sex: 'male', height: 180, weight: 80, target: 76, activity: 1.725, goal: 'Fat loss', days: 4,
      experience: 'Beginner', equipment: 'Gym', limitations: '', diet: 'No preference', onboarded: true, waterGoalMl: 3000, cal: 2400, protein: 160, carbs: 250, fat: 70, profileId: 'alexm' },
    mfdSettings: { weightUnit: 'kg', energyUnit: 'kcal', defaultRestSec: 120, weekStart: 1, coach: { provider: 'none' }, aiHidden: ['food:x'], plates: { unit: 'kg', bar: 20, plates: [25, 20, 10, 5, 2.5] }, healthWeightSkip: ['2026-11-01'] },
    routines: [{ id: 'r1', name: 'Push A', folderId: null, exercises: [], addedBy: by('req-r1') }],
    folders: [], sessions: [], active: null, chat: [], water: {}, checkins: [],
    meals: [{ id: 'm1', date: '2026-11-16', meal: 'Lunch', name: 'Dal', amount: 1, unit: 'serving', labelFood: { id: 'mcp-1', name: 'Dal', basis: 1, unit: 'serving', cal: 350, p: 18, c: 50, f: 8 }, cal: 350, p: 18, c: 50, f: 8, addedBy: by('req-m1') },
      { id: 'm2', date: '2026-11-16', meal: 'Dinner', name: 'Rice', amount: 200, unit: 'g', labelFood: { id: 'x-rice', name: 'Rice', basis: 100, unit: 'g', cal: 130, p: 2.7, c: 28, f: 0.3 }, cal: 260, p: 5.4, c: 56, f: 0.6 }],
    weights: [{ id: 'kg1', date: '2026-11-16', kg: 79.5, addedBy: by() }],
    aiSuggestions: [{ id: 's1', routineId: 'r1', routineName: 'Push A', status: 'used', createdAt: Date.UTC(2026, 10, 15, 9), usedAt: Date.UTC(2026, 10, 15, 18), exercises: [{ exercise: 'Bench', sets: [{ kg: 80, reps: 8 }] }], note: 'Go up 2.5 kg', addedBy: by('req-s1') }],
    aiChanges: [{ id: 'c1', kind: 'water', date: '2026-11-16', ml: 500, addedBy: by('req-w') }, { id: 'c2', kind: 'settings', changes: { goal: { from: 'maintain', to: 'lose' } }, addedBy: by() }],
  };
}
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    insert into auth.users values ('${alice}'), ('${bob}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of files) await db.exec(f);
  for (const f of files) await db.exec(f);
  const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
  const all = async (sql, p = []) => (await db.query(sql, p)).rows;
  const save = async (u, d) => db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2) on conflict (user_id) do update set payload = excluded.payload, revision = public.forma_workspaces.revision + 1`, [u, JSON.stringify(d)]);
  const top = async (u = alice) => (await one(`select last_version v from diary.sync_counters where user_id = $1`, [u])).v;

  const d = diary();
  await save(alice, d);
  assert.deepEqual(await all(`select kind, detail from diary.fill_problems`), [], 'no errors in any of the four fill-ins');
  assert.deepEqual(await one(`select first_name, last_name, birth_date, sex, height_cm::float h, activity_level, experience, equipment, limitations, diet, onboarded from diary.user_profiles`),
    { first_name: 'Alex', last_name: 'M', birth_date: null, sex: 'male', h: 180, activity_level: 'very', experience: 'Beginner', equipment: 'Gym', limitations: null, diet: 'No preference', onboarded: true });
  const cols = (await all(`select column_name from information_schema.columns where table_schema = 'diary' and table_name = 'user_profiles'`)).map((r) => r.column_name);
  assert.ok(!cols.includes('age') && !cols.includes('weight_kg'), 'no age (it goes stale) and no weight (the latest weigh-in is the weight)');
  assert.deepEqual(await one(`select goal, target_weight_kg::float t, training_days_per_week d, water_goal_ml w from diary.user_goals`), { goal: 'lose', t: 76, d: 4, w: 3000 });
  assert.deepEqual(await one(`select weight_unit, energy_unit, length_unit, week_start, default_rest_s, keep_awake, vibrate, plate_set, health_weight_skip from diary.user_settings`),
    { weight_unit: 'kg', energy_unit: 'kcal', length_unit: 'cm', week_start: 1, default_rest_s: 120, keep_awake: true, vibrate: true, plate_set: { unit: 'kg', bar: 20, plates: [25, 20, 10, 5, 2.5] }, health_weight_skip: [new Date('2026-11-01')] });
  console.log('PASS account: profile (no age, no weight, onboarded yes/no), goals and settings translated from the old shapes; the old coach settings and hidden AI items stay behind');

  // AI: every assistant-added entry points to its action; changes and suggestions are there.
  const linked = await one(`select (select count(*) from diary.food_entries where ai_action_id is not null)::int meals, (select count(*) from diary.food_entries where ai_action_id is null)::int own_meals,
    (select count(*) from diary.weigh_ins where ai_action_id is not null)::int weights, (select count(*) from diary.routines where ai_action_id is not null)::int routines`);
  assert.deepEqual(linked, { meals: 1, own_meals: 1, weights: 1, routines: 1 });
  assert.deepEqual(await all(`select action, connection, request_id from diary.ai_actions where user_id = $1 order by action`, [alice]), [
    { action: 'change_settings', connection: 'https://claude.ai/connector', request_id: null }, { action: 'create_routine', connection: 'https://claude.ai/connector', request_id: 'req-r1' },
    { action: 'log_meal', connection: 'https://claude.ai/connector', request_id: 'req-m1' }, { action: 'log_water', connection: 'https://claude.ai/connector', request_id: 'req-w' },
    { action: 'log_weight', connection: 'https://claude.ai/connector', request_id: null }, { action: 'suggest_workout_targets', connection: 'https://claude.ai/connector', request_id: 'req-s1' }]);
  assert.deepEqual(await one(`select details from diary.ai_actions where action = 'log_water'`), { details: { date: '2026-11-16', ml: 500 } }, 'Undo details kept');
  const sug = await one(`select s.status, s.routine_name, s.details->>'note' note, s.used_at is not null used, r.name routine from diary.ai_suggestions s join diary.routines r on r.id = s.routine_id`);
  assert.deepEqual(sug, { status: 'used', routine_name: 'Push A', note: 'Go up 2.5 kg', used: true, routine: 'Push A' }, 'the suggestion points to its routine (filled in the right order)');
  console.log('PASS AI: entries ChatGPT or Claude added point to their action (yours don\'t); water/settings changes keep their Undo details; suggestions link to their routine');

  // Small saves and Undo.
  let v = await top();
  for (const f of ['fill_training', 'fill_nutrition', 'fill_body', 'fill_account']) await db.query(`select diary.${f}($1)`, [alice]);
  assert.equal(await top(), v, 'filling everything again changes nothing');
  d.mfdSettings.weightUnit = 'lb'; await save(alice, d);
  assert.equal(await top(), v + 1, 'one setting, one row');
  d.aiChanges = d.aiChanges.filter((c) => c.id !== 'c1'); await save(alice, d);
  assert.ok((await one(`select undone_at from diary.ai_actions where action = 'log_water'`)).undone_at, 'undone in the app → marked undone, kept as history');
  console.log('PASS small saves: filling again changes nothing; one setting = one row; an undone AI change is kept and marked undone');

  // Rules and ownership.
  await save(bob, { ...diary(), meals: [], weights: [], routines: [], aiSuggestions: [], aiChanges: [] });
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: bob })]); await db.exec('set role authenticated');
  assert.equal((await one(`select count(*)::int n from diary.ai_actions`)).n, 0, 'Bob sees none of Alice\'s AI history');
  await assert.rejects(db.query(`update diary.user_profiles set birth_date = '2020-01-01' where user_id = $1`, [bob]), /check/, 'at least 13 years old');
  await assert.rejects(db.query(`update diary.user_settings set week_start = 3 where user_id = $1`, [bob]), /check/, 'week starts Sunday, Monday or Saturday');
  await db.query(`update diary.user_profiles set birth_date = '1994-03-14' where user_id = $1`, [bob]);
  assert.equal((await one(`select birth_date::text b from diary.user_profiles`)).b, '1994-03-14', 'the pop-up\'s date of birth');
  await db.exec('reset role');
  console.log('PASS rules: each person sees only their own account and AI history; date of birth 13–100 years; week start and other limits hold');
})().catch((e) => { console.error(e); process.exit(1); });
