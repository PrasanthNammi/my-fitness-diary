// MFD 3.0 step 3: the side-by-side check (scripts-diary-compare.cjs) on embedded PostgreSQL with the real connector
// functions installed. A production-shaped diary reports SAME on every line (data and the AI connector's answers),
// the check keeps nothing, and a value changed in the tables is caught as DIFFERENT.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync, mkdtempSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const {tmpdir} = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const T = (n) => Date.parse(day(n) + 'T17:00:00Z');

function diary(who) {
  const sessions = Array.from({ length: 8 }, (_, k) => {
    const sets = [];
    for (let g = 0; g < 2; g++) for (let i = 0; i < 3; i++) sets.push({ id: `${who}${k}-${g}-${i}`, exercise: ['Bench Press (Barbell)', 'Squat (Barbell)'][g],
      catalogId: ['bench_press_barbell', 'squat_barbell'][g], catalogSource: 'MFD', tracking: 'weight_reps', type: i ? (i === 2 && k === 3 ? 'dropset' : 'normal') : 'warmup',
      group: g, set: i + 1, kg: 60 + k * 2.5 + i * 5, reps: 8 - i, done: true, notes: g ? '' : 'Slow down', ...(k === 5 && g === 1 ? { tracking: 'weighted_bodyweight' } : {}) });
    if (k === 7) sets.push({ id: `${who}${k}-band`, exercise: 'Band Walk', catalogId: 'history:band%20walk', catalogSource: 'Custom', tracking: 'reps', type: 'normal', group: 2, set: 1, kg: null, reps: 20, done: true, notes: '' });
    return { id: `${who}w${k}`, name: k % 2 ? 'Legs' : 'Push', date: day(40 - k * 5), started: T(40 - k * 5), finished: T(40 - k * 5) + 3600000, routineId: null, sets,
      ...(k < 4 ? { source: 'hevy', importKey: `push|${k}`, importTimezone: 'Europe/Berlin', sample: false, notes: '', rest: {} } : {}) };
  });
  return {
    profile: { name: 'Alex M', firstName: 'Alex', lastName: 'M', age: 31, sex: 'male', height: 180, weight: 80, target: 76, activity: 1.55, goal: 'Fat loss', days: 4, onboarded: true, cal: 2400, protein: 160, carbs: 250, fat: 70 },
    mfdSettings: { weightUnit: 'kg', energyUnit: 'kcal', defaultRestSec: 120, coach: { provider: 'none' } },
    sessions, active: null, chat: [], folders: [{ id: 'f1', name: 'PPL' }], folderOpen: {},
    mfdExercises: [{ id: 'custom:band', name: 'Band Walk', tracking: 'reps', source: 'custom' }],
    routines: [{ id: 'r1', name: 'Push A', folderId: 'f1', exercises: [{ name: 'Bench Press (Barbell)', catalogId: 'bench_press_barbell', catalogSource: 'MFD', sets: 3, reps: 8, kg: 80, rest: 120, notes: '', superset_id: null, setDetails: [] }] },
               { id: 'r2', name: 'Push B', folderId: 'f1', exercises: [] }],
    meals: [
      { id: `${who}m1`, date: day(3), meal: 'Breakfast', name: 'Skyr', amount: 200, unit: 'g', labelFood: { id: 'off-1', name: 'Skyr', basis: 100, unit: 'g', cal: 60, p: 11, c: 4, f: 0.2 }, cal: 120, p: 22, c: 8, f: 0.4 },
      { id: `${who}m2`, date: day(2), meal: 'Snack', name: 'Dal', amount: 1, unit: 'serving', labelFood: { id: 'mcp-1', name: 'Dal', basis: 1, unit: 'serving', cal: 350, p: 18, c: 50, f: 8 }, cal: 350, p: 18, c: 50, f: 8,
        addedBy: { connection: 'https://claude.ai/x', at: '2026-11-16T10:00:00Z' } },
      { id: `${who}m3`, date: day(2), meal: 'Lunch', name: 'Skyr', amount: 150, unit: 'g', labelFood: { id: 'off-1', name: 'Skyr', basis: 100, unit: 'g', cal: 60, p: 11, c: 4, f: 0.2 }, cal: 90, p: 16.5, c: 6, f: 0.3 },
      // portions worked out to many decimals, as the app stores them
      { id: `${who}m4`, date: day(2), meal: 'Dinner', name: 'Oats', amount: 47, unit: 'g', labelFood: { id: 'off-2', name: 'Oats', basis: 100, unit: 'g', cal: 371.3, p: 13.37, c: 58.71, f: 7.03, salt: 0.125, sugar: 1.075 }, cal: 174.511, p: 6.2839, c: 27.5937, f: 3.3041 },
    ],
    products: [], foodFavorites: [], water: { [day(2)]: 2000 },
    weights: [{ id: `${who}k1`, date: day(20), kg: 81.2 }, { id: `${who}k2`, date: day(10), kg: 80.4 }, { id: `${who}k3`, date: day(1), kg: 79.6 }],
    checkins: [{ id: 'c1', date: day(4), sleep: 7.5, steps: 9000, note: '' }],
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
    insert into auth.users values ('${alice}'), ('${bob}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  await db.exec(readFileSync('database/sync-observability.sql', 'utf8'));
  await db.exec(readFileSync('database/production/mcp-production.sql', 'utf8'));
  for (const f of ['mcp-suggest-targets', 'mcp-start-workout', 'mcp-recovery', 'mcp-ai-logging']) await db.exec(readFileSync(`database/${f}.sql`, 'utf8'));
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account'])
    await db.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));
  // The Friends feed's copy table and the trigger that writes it today (from the stored document).
  const social = readFileSync('database/social-incremental.sql', 'utf8');
  const project = social.slice(social.indexOf('create or replace function mfd_private.project_workouts()'), social.indexOf('end loop;return new;end$$;') + 'end loop;return new;end$$;'.length);
  await db.exec(`create schema if not exists mfd_private; create table public.mfd_social_workouts(owner_id uuid not null, workout_id text not null, data jsonb not null,
    started_at timestamptz not null, updated_at timestamptz not null default now(), primary key(owner_id, workout_id)); ${project}
    create trigger mfd_project_workouts after insert or update on public.forma_workspaces for each row execute function mfd_private.project_workouts();`);
  for (const [u, w] of [[alice, 'a'], [bob, 'b']]) await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [u, JSON.stringify(diary(w))]);

  const file = path.join(mkdtempSync(path.join(tmpdir(), 'mfd-compare-')), 'compare.sql');
  execFileSync(process.execPath, ['scripts-diary-compare.cjs', file], { stdio: 'pipe' });
  const sql = readFileSync(file, 'utf8');
  const run = async () => {
    try { await db.exec(sql); } catch (e) { await db.exec('rollback'); return e.message; }
    throw new Error('the check must end with its report');
  };

  // A save that swaps two routine names (the app allows it; a one-name rule refused it in production).
  const swapped = diary('a'); swapped.routines[0].name = 'Push B'; swapped.routines[1].name = 'Push A';
  await db.query('update public.forma_workspaces set payload = $2 where user_id = $1', [alice, JSON.stringify(swapped)]);
  assert.deepEqual((await db.query(`select legacy_id, name from diary.routines where user_id = '${alice}' order by legacy_id`)).rows.map((r) => r.name), ['Push B', 'Push A']);
  assert.equal((await db.query('select count(*)::int n from diary.fill_problems')).rows[0].n, 0, 'no problems noted');

  const report = await run();
  const lines = report.split('\n').filter((l) => /\s(SAME|DIFFERENT|EXPECTED)( \(.*)?$/.test(l));
  assert.equal(lines.length, 23, report);
  assert.ok(/Expected\s+feed copies, older exercise id\s+0\s+2\s+EXPECTED/.test(report), report);
  assert.ok(/Friends feed\s+workout copies\s+16\s+0\s+SAME/.test(report), report);
  assert.ok(/food entries\s+8\s+0\s+SAME/.test(report), report);
  assert.ok(/list_saved_foods\s+2\s+0\s+SAME/.test(report), report);
  assert.ok(/routines: name, folder, exercises\s+4\s+0\s+SAME/.test(report), report);
  // Only the targets differ: the new tables work them out from the date of birth (3.0), which these diaries don't have yet.
  assert.deepEqual(lines.filter((l) => l.includes('DIFFERENT')), [], report);
  assert.ok(/Expected\s+daily targets \(need date of birth\)\s+0\s+4\s+EXPECTED/.test(report), report);
  assert.ok(/the "error" is on purpose/.test(report), report);
  assert.ok(/AI connector\s+exercise_progress\s+2\s+0\s+SAME/.test(report), report);
  // Nothing kept: the read functions it installed are gone again.
  assert.equal((await db.query(`select count(*)::int n from pg_proc where proname = 'as_envelope'`)).rows[0].n, 0);

  // A value that differs in the tables is caught, in the data and in the connector's answers.
  await db.exec(`update diary.workout_sets set reps = reps + 1 where id = (select id from diary.workout_sets where user_id = '${alice}' and set_type = 'normal' limit 1)`);
  const bad = await run();
  assert.ok(/sets: weight, reps, type, done\s+\d+\s+1\s+DIFFERENT/.test(bad), bad);
  assert.ok(/AI connector\s+summarize_training week\s+1\s+1\s+DIFFERENT/.test(bad), bad);
  assert.ok(/Friends feed\s+workout copies\s+15\s+1\s+DIFFERENT/.test(bad), bad);

  console.log('diary compare: production-shaped diaries SAME on all 21 lines (data, Friends feed copies and connector answers), incl. long decimals, tracking as logged and a routine-name swap; nothing kept; a changed value is caught');
})().catch((e) => { console.error(e); process.exit(1); });
