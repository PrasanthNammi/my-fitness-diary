// MFD 3.0 step 7: daily targets from the latest weigh-in. In the app (profileForTargets, behind the MFD3 switch) the
// weight targets use is the latest weigh-in by date; without weigh-ins, or with the switch off, it is the profile
// weight. The database works out exactly the same targets as the app (diary.targets, every sex/activity/goal), and
// the rebuilt profile carries them once the date of birth is known, from the latest weigh-in.
const assert = require('node:assert/strict'), esbuild = require('esbuild'), path = require('path'), os = require('os');
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const out = path.join(os.tmpdir(), 'mfd-targets-weighin.cjs');
esbuild.buildSync({ stdin: { contents: `export * from './frontend/domain/nutrition'; export { MFD3 } from './frontend/lib/release';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent' });
const api = require(out);
const alice = '11111111-1111-4111-8111-111111111111';

const profile = { name: 'Alex', age: 31, sex: 'male', heightCm: 180, weightKg: 85, activity: 'moderate', goal: 'lose', targetWeightKg: 76, trainingDaysPerWeek: 4 };
const weights = [{ id: 'a', date: '2026-11-17', kg: 79.2 }, { id: 'b', date: '2026-11-01', kg: 82 }, { id: 'c', date: '2026-11-18', kg: 1000 }];

assert.equal(api.MFD3, false, 'the 3.0 switch stays off until the release');
assert.equal(api.profileForTargets(profile, weights, false), profile, 'switch off: unchanged');
assert.equal(api.profileForTargets(profile, weights, true).weightKg, 79.2, 'latest valid weigh-in by date, not list order');
assert.equal(api.profileForTargets(profile, [], true), profile, 'no weigh-ins: the profile weight');
const before = api.calculateTargets(profile).targets, after = api.calculateTargets(api.profileForTargets(profile, weights, true)).targets;
assert.ok(after.kcal < before.kcal && after.protein < before.protein, 'lighter: lower energy and protein targets');

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}');`);
  await db.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account', '12-read'])
    await db.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));

  // The database and the app agree for every sex, activity level and goal (incl. the minimum-energy floor).
  let n = 0;
  for (const sex of ['male', 'female']) for (const activity of ['sedentary', 'light', 'moderate', 'very', 'extra'])
    for (const goal of ['lose', 'maintain', 'gain', 'recomp']) for (const [kg, cm, age] of [[79.2, 180, 31], [52.5, 158, 64], [110.4, 192, 22], [41, 150, 90]]) {
      const js = api.calculateTargets({ ...profile, sex, activity, goal, weightKg: kg, heightCm: cm, age }).targets;
      const sql = (await db.query('select diary.targets($1,$2,$3,$4,$5,$6) t', [sex, kg, cm, age, activity, goal])).rows[0].t;
      assert.deepEqual(sql, { cal: js.kcal, protein: js.protein, carbs: js.carbs, fat: js.fat }, `${sex} ${activity} ${goal} ${kg}`);
      n++;
    }

  // The rebuilt profile: no targets without a date of birth; with one, from the latest weigh-in.
  const doc = { profile: { firstName: 'Alex', sex: 'male', height: 180, weight: 85, target: 76, activity: 1.55, goal: 'Fat loss', days: 4, onboarded: true, cal: 2400 },
    weights: [{ id: 'k1', date: '2026-11-01', kg: 82 }, { id: 'k2', date: '2026-11-17', kg: 79.2 }], sessions: [], meals: [], checkins: [], routines: [], folders: [] };
  await db.query('insert into public.forma_workspaces (user_id, payload) values ($1, $2)', [alice, JSON.stringify(doc)]);
  const env = async () => (await db.query('select diary.as_envelope($1) e', [alice])).rows[0].e.profile;
  assert.equal((await env()).cal, undefined);
  const dob = new Date(Date.UTC(new Date().getUTCFullYear() - 31, 0, 1)).toISOString().slice(0, 10);
  await db.query('update diary.user_profiles set birth_date = $2 where user_id = $1', [alice, dob]);
  const p = await env(), js = api.calculateTargets({ ...profile, weightKg: 79.2, age: 31, goal: 'lose', activity: 'moderate' }).targets;
  assert.equal(p.weight, 79.2);
  assert.deepEqual([p.cal, p.protein, p.carbs, p.fat], [js.kcal, js.protein, js.carbs, js.fat]);

  console.log(`targets: latest weigh-in by date (switch off until 3.0); app and database agree on all ${n} profiles; rebuilt profile gets targets once the date of birth is known`);
})().catch((e) => { console.error(e); process.exit(1); });
