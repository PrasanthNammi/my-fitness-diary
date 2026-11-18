// MFD 3.0 step 6: date of birth instead of age. The age is worked out from it (birthdays, 29 February); a date is
// usable only when real and 13-100 years old; the pickers' check says what's missing or wrong. A profile saved with
// a date of birth keeps it after reload and its age follows it; diaries without one load as before. The pop-up is due
// only with the 3.0 switch on, after onboarding, without a date of birth. In the database (update 3), the date is
// copied into the profile, impossible ones are left out, a later save without it keeps it, and targets appear.
const assert = require('node:assert/strict'), esbuild = require('esbuild'), path = require('path'), os = require('os');
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync, mkdtempSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const out = path.join(os.tmpdir(), 'mfd-birth-date.cjs');
esbuild.buildSync({ stdin: { contents: `export * from './frontend/domain/birthDate'; export * from './frontend/adapters/compat'; export { MFD3 } from './frontend/lib/release';`,
  resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent', jsx: 'automatic', loader: { '.svg': 'text', '.css': 'empty' } });
const api = require(out);

// Age from the date of birth.
assert.equal(api.ageOn('1994-03-14', '2026-03-13'), 31, 'the day before the birthday');
assert.equal(api.ageOn('1994-03-14', '2026-03-14'), 32, 'on the birthday');
assert.equal(api.ageOn('2000-02-29', '2026-02-28'), 25, 'leap-day birthday, not yet');
assert.equal(api.ageOn('2000-02-29', '2026-03-01'), 26);
assert.equal(api.isoDate(2026, 2, 31), null, '31 February');
assert.equal(api.isoDate(2024, 2, 29), '2024-02-29');
assert.equal(api.isoDate(2025, 2, 29), null);
// The pickers' check.
const today = '2026-11-18';
assert.deepEqual(api.checkBirthDate('', '3', '1994', today), { state: 'empty' });
assert.deepEqual(api.checkBirthDate('31', '4', '1994', today), { state: 'bad', message: 'That date doesn’t exist' });
assert.deepEqual(api.checkBirthDate('14', '3', '1994', today), { state: 'ok', date: '1994-03-14', age: 32 });
assert.equal(api.checkBirthDate('19', '11', '2013', today).state, 'bad', '12 years old');
assert.equal(api.checkBirthDate('18', '11', '2013', today).state, 'ok', '13 today');
assert.equal(api.checkBirthDate('18', '11', '1926', today).state, 'ok', '100 today');
assert.equal(api.checkBirthDate('17', '11', '1925', today).state, 'bad', '101');
assert.deepEqual([api.birthYears(today)[0], api.birthYears(today).at(-1), api.birthYears(today).length], [2013, 1926, 88]);
assert.equal(api.usableBirthDate('1994-03-14', today), '1994-03-14');
for (const bad of ['1994-02-30', '14.03.1994', 1994, null, '2020-01-01', '1900-01-01']) assert.equal(api.usableBirthDate(bad, today), undefined, String(bad));

// Saving and reloading a profile.
const raw = { profile: { onboarded: true, name: 'Alex M', firstName: 'Alex', lastName: 'M', age: 30, sex: 'male', height: 180, weight: 80, target: 76, activity: 1.55, goal: 'Fat loss', days: 4 },
  sessions: [], routines: [], folders: [], meals: [], products: [], weights: [], checkins: [], water: {}, chat: [], active: null, mfdSettings: {} };
const read = (s) => api.toDB({ state: s, ready: true, user: null }, { exercises: [], foods: [] });
let db = read(raw);
assert.equal(db.profile.birthDate, undefined, 'no date of birth yet');
assert.equal(db.profile.age, 30, 'age as before');
const now = new Date().toISOString().slice(0, 10), born = `${Number(now.slice(0, 4)) - 40}-01-01`;
db.profile = { ...db.profile, birthDate: born, age: api.ageOn(born, now) };
const saved = JSON.parse(JSON.stringify(api.fromDB(db, raw, new Set(['profile']))));
assert.equal(saved.profile.birthDate, born, 'stored');
assert.equal(saved.profile.age, api.ageOn(born, now), 'age kept for older readers');
db = read(saved);
assert.deepEqual([db.profile.birthDate, db.profile.age], [born, api.ageOn(born, now)], 'after reload');
assert.equal(read({ ...saved, profile: { ...saved.profile, birthDate: '1994-02-30', age: 33 } }).profile.age, 33, 'an impossible date is ignored');

// When the pop-up is due.
assert.equal(api.MFD3, false, 'off until 3.0');
assert.equal(api.needsBirthDate(api.MFD3, db.profile), false);
assert.equal(api.needsBirthDate(true, { age: 30 }), true, '3.0, no date of birth');
assert.equal(api.needsBirthDate(true, { birthDate: born }), false, 'set once');
assert.equal(api.needsBirthDate(true, null), false, 'during onboarding (asked there)');

(async () => {
  const alice = '11111111-1111-4111-8111-111111111111';
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    insert into auth.users values ('${alice}');`);
  await pg.exec(readFileSync('database/schema.sql', 'utf8'));
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body', '10-account', '11-fill-account', '12-read'])
    await pg.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));
  const doc = { ...raw, weights: [{ id: 'k1', date: now, kg: 79.2 }] };
  await pg.query('insert into public.forma_workspaces (user_id, payload) values ($1, $2)', [alice, JSON.stringify(doc)]);
  const one = async (sql) => (await pg.query(sql)).rows[0];
  const save = (p) => pg.query('update public.forma_workspaces set payload = $2 where user_id = $1', [alice, JSON.stringify({ ...doc, profile: { ...doc.profile, ...p } })]);
  const dob = async () => (await one(`select birth_date::text b from diary.user_profiles`)).b;

  // Update 3 runs on the production state (nobody has a date of birth yet) and is safe twice.
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'mfd-update3-')), 'update.sql');
  execFileSync(process.execPath, ['scripts-diary-update.cjs', '3', file], { stdio: 'pipe' });
  const res = await pg.exec(readFileSync(file, 'utf8')); await pg.exec(readFileSync(file, 'utf8'));
  assert.deepEqual(res.at(-2).rows[0], { profiles: 1, with_birth_date: 0, problems_left: 0 });

  await save({ birthDate: '1994-02-30' }); assert.equal(await dob(), null, 'impossible date left out');
  await save({ birthDate: `${Number(now.slice(0, 4)) - 5}-01-01` }); assert.equal(await dob(), null, 'too young left out');
  await save({ birthDate: born }); assert.equal(await dob(), born, 'copied');
  await save({}); assert.equal(await dob(), born, 'a later save without it keeps it');
  const p = (await one(`select diary.as_envelope('${alice}') e`)).e.profile;
  assert.equal(p.birthDate, born);
  assert.ok(p.cal > 0 && p.protein > 0, 'targets appear once the date of birth is known');
  assert.equal((await one('select count(*)::int n from diary.fill_problems')).n, 0);

  console.log('birth date: age from the date (birthdays, 29 Feb), 13-100, pickers check; kept through save/reload; pop-up due only on 3.0 without one; database copies it, refuses impossible ones, keeps it; targets appear');
})().catch((e) => { console.error(e); process.exit(1); });
