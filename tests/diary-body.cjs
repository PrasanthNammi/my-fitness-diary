// MFD 3.0 database, body: weigh-ins, measurements, recovery days and sleep nights build (twice), fill from a
// production-shaped envelope and follow it; one weigh-in and one recovery row per day; Health Connect vs typed;
// small saves change only what changed; rules and ownership hold.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const files = ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body'].map((f) => readFileSync(`database/diary/${f}.sql`, 'utf8'));
const night = (day) => ({ deep: 72, light: 250, rem: 95, awake: 18, start: Date.UTC(2026, 10, day - 1, 22, 30), end: Date.UTC(2026, 10, day, 6, 15) });
function diary() {
  return {
    profile: { name: 'A', cal: 2200, protein: 130, carbs: 260, fat: 70, days: 3 }, sessions: [], routines: [], folders: [], meals: [], chat: [], active: null, water: {},
    weights: [
      { id: 'kg1', date: '2026-11-10', kg: 80.4 },
      { id: 'kg2', date: '2026-11-12', kg: 80.1, addedBy: { connection: 'https://chatgpt.com/x', at: '2026-11-12T08:00:00Z' } },
      { id: 'kg3', date: '2026-11-14', kg: 79.8, source: 'health', bodyFat: 18.5 },
      { id: 'kg4', date: '2026-11-14', kg: 79.6 },          // a second on the same day: the later one wins
      { id: 'kg5', date: '2026-11-15', kg: 900 },           // impossible: left out and counted
    ],
    checkins: [
      { id: 'c1', date: '2026-11-15', sleep: 7.25, sleepSource: 'health', steps: 9000, energy: 4, soreness: 2, restingHr: 58, hrv: 44, sleepStages: night(15), note: 'Felt good' },
      { id: 'c2', date: '2026-11-16', sleep: '6.5', steps: '4200', note: '' },
      { id: 'c2b', date: '2026-11-16', energy: 3 },          // a second recovery row that day: the app shows the first
      { id: 'm1', date: '2026-11-16', waist: 82.25, arms: 36, note: '' },
      { id: 'm2', date: '2026-11-17', chest: 104, hips: 300, note: '' },   // hips 300: left out and counted
    ],
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
  assert.deepEqual(await all(`select local_date::text d, weight_kg::float kg, body_fat_pct::float bf, source from diary.weigh_ins where user_id = $1 and deleted_at is null order by 1`, [alice]), [
    { d: '2026-11-10', kg: 80.4, bf: null, source: 'manual' }, { d: '2026-11-12', kg: 80.1, bf: null, source: 'ai' }, { d: '2026-11-14', kg: 79.6, bf: null, source: 'manual' }]);
  assert.deepEqual(await all(`select local_date::text d, sleep_h::float, sleep_source, steps, resting_hr, hrv_ms, energy, soreness, note from diary.recovery_days where user_id = $1 order by 1`, [alice]), [
    { d: '2026-11-15', sleep_h: 7.25, sleep_source: 'health_connect', steps: 9000, resting_hr: 58, hrv_ms: 44, energy: 4, soreness: 2, note: 'Felt good' },
    { d: '2026-11-16', sleep_h: 6.5, sleep_source: 'manual', steps: 4200, resting_hr: null, hrv_ms: null, energy: null, soreness: null, note: null }]);
  assert.deepEqual(await one(`select deep_min, light_min, rem_min, awake_min, to_char(started_at at time zone 'UTC', 'HH24:MI') s, to_char(ended_at at time zone 'UTC', 'HH24:MI') e from diary.sleep_nights`), { deep_min: 72, light_min: 250, rem_min: 95, awake_min: 18, s: '22:30', e: '06:15' });
  assert.deepEqual(await all(`select local_date::text d, site, cm::float from diary.body_measurements order by 1, 2`), [
    { d: '2026-11-16', site: 'arms', cm: 36 }, { d: '2026-11-16', site: 'waist', cm: 82.3 }, { d: '2026-11-17', site: 'chest', cm: 104 }]);
  assert.deepEqual((await all(`select kind, legacy_id, detail from diary.fill_problems order by 2`)).map((r) => `${r.kind}:${r.legacy_id}:${r.detail}`),
    ['weigh_in:kg3:second on the same day', 'weigh_in:kg5:kg', 'measurement:m2:hips'].sort((a, b) => a.split(':')[1].localeCompare(b.split(':')[1])));
  console.log('PASS fill: weigh-ins one per day (later wins, AI and Health Connect marked), recovery one per day (first row, text numbers read), sleep stages, measurements one per site; impossible values left out and counted');

  // Small saves; replacing a weigh-in on the same day.
  let v = await top();
  await db.query(`select diary.fill_body($1)`, [alice]);
  assert.equal(await top(), v, 'filling again changes nothing');
  d.checkins[0].energy = 5; await save(alice, d);
  assert.equal(await top(), v + 1, 'one value changed, one row');
  v = await top(); d.meals.push({ id: 'x', date: '2026-11-17', name: 'Oats', cal: 300 }); await save(alice, d);
  // (the counter is one per person across all areas, so the food entry itself takes a number; no body row may)
  assert.equal((await one(`select (select count(*) from diary.weigh_ins where version > $1) + (select count(*) from diary.recovery_days where version > $1) + (select count(*) from diary.body_measurements where version > $1) + (select count(*) from diary.sleep_nights where version > $1) n`, [v])).n, 0, 'a food save leaves body alone');
  d.weights = d.weights.map((w) => (w.id === 'kg1' ? { ...w, id: 'kg1b', kg: 80.2 } : w)); await save(alice, d);
  assert.deepEqual(await one(`select legacy_id, weight_kg::float kg from diary.weigh_ins where user_id = $1 and local_date = '2026-11-10' and deleted_at is null`, [alice]), { legacy_id: 'kg1b', kg: 80.2 }, 'replaced on the same day without breaking one-per-day');
  d.checkins = d.checkins.filter((c) => c.id !== 'm1'); await save(alice, d);
  assert.equal((await one(`select count(*)::int n from diary.body_measurements where deleted_at is null`)).n, 1, 'removed measurements follow');
  console.log('PASS small saves: one change = one row; food saves leave body alone; a weigh-in replaced on the same day; removals follow');

  // Rules and ownership.
  await save(bob, { ...diary(), weights: [{ id: 'b1', date: '2026-11-17', kg: 70 }], checkins: [] });
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: bob })]); await db.exec('set role authenticated');
  assert.equal((await one(`select count(*)::int n from diary.weigh_ins`)).n, 1, 'Bob sees only his weigh-in');
  await assert.rejects(db.query(`insert into diary.weigh_ins (user_id, local_date, weight_kg) values ($1, '2026-11-17', 71)`, [bob]), /weigh_ins_one_per_day/, 'one weigh-in per day');
  await assert.rejects(db.query(`insert into diary.recovery_days (user_id, local_date, energy) values ($1, '2026-11-17', 6)`, [bob]), /check/, 'energy 1–5');
  await assert.rejects(db.query(`insert into diary.recovery_days (user_id, local_date, sleep_h) values ($1, '2026-11-17', 7)`, [bob]), /check/, 'a sleep value must say where it came from');
  await assert.rejects(db.query(`insert into diary.body_measurements (user_id, local_date, site, cm) values ($1, '2026-11-17', 'arms', 150)`, [bob]), /check/, 'arms 15–80 cm');
  await assert.rejects(db.query(`insert into diary.body_measurements (user_id, local_date, site, cm) values ($1, '2026-11-17', 'neck', 40)`, [bob]), /check/, 'only known sites');
  await assert.rejects(db.query(`insert into diary.weigh_ins (user_id, local_date, weight_kg) values ($1, '2026-11-18', 70)`, [alice]), /row-level security/, 'can\'t write as Alice');
  await db.exec('reset role');
  console.log('PASS rules: one weigh-in and one recovery row per day, ranges per value and per site, sleep always with its source, only your own rows');
})().catch((e) => { console.error(e); process.exit(1); });
