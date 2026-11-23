// Cycle & Health in the database (database/diary/17-cycle.sql) on the real pieces (delta sync, the switch, the AI
// connector): random cycle edits by the app (its own diff) on two phones give exactly the same diary from the tables
// after every save; the rows hold the values; odd values are kept exactly (patch) but not stored as facts; only the
// owner can read or change her rows; the AI connector's diary never contains any of it; deleting removes the rows.
const {PGlite} = require('@electric-sql/pglite');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');
require('../public/legacy/workspace-ops.js');
const W = globalThis.MFDWorkspaceOps;
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222';
const as_ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', RES = 'https://mfd-connect.invalid/mcp';
const CYCLE = ['cycleSettings', 'cycleDays', 'cycleMeds', 'cycleDoses', 'cycleLabs', 'cycleConditions'];
let seed = Number(process.env.SEED || 11);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const day = (n) => new Date(Date.UTC(2026, 10, 23) - n * 864e5).toISOString().slice(0, 10);
const SECRET = 'private-note-7f3a';
function base() {
  return {profile: {name: 'Alex', onboarded: true, sex: 'female', cal: 2000, protein: 120, carbs: 200, fat: 60, days: 3, height: 165, birthDate: '1999-02-01'},
    meals: [], weights: [], checkins: [], chat: [], sessions: [], routines: [], folders: [], active: null, water: {}, mfdSettings: {weightUnit: 'kg'}};
}
// One random change, the way the app's cycle store makes them.
function edit(d, k) {
  const r = rnd(), L = (key) => (d[key] = Array.isArray(d[key]) ? d[key] : []);
  if (r < 0.06) d.cycleSettings = {enabled: true, reminderStyle: pick(['discreet', 'private', 'detailed']), lockDetails: rnd() < 0.3, aiAccess: false, compare: rnd() < 0.5,
    healthSync: false, medReminders: true, periodSoon: rnd() < 0.5, favourites: ['Fatigue', 'Acne'], customSymptoms: rnd() < 0.3 ? ['Jaw pain'] : [], ...(rnd() < 0.5 ? {logReminder: '21:00'} : {})};
  else if (r < 0.4) {
    const date = day(Math.floor(rnd() * 40)), days = L('cycleDays'), i = days.findIndex((x) => x.date === date);
    const v = rnd() < 0.15 ? {id: date, date, nothing: true} : {id: date, date, bleeding: pick(['none', 'spotting', 'period', 'withdrawal', 'unsure']),
      ...(rnd() < 0.5 ? {flow: pick(['light', 'medium', 'heavy', 'very_heavy'])} : {}), ...(rnd() < 0.2 ? {clots: true} : {}),
      ...(rnd() < 0.6 ? {pain: Math.floor(rnd() * 11)} : {}), ...(rnd() < 0.3 ? {painSites: ['Lower belly', 'Back'], painLimits: rnd() < 0.5} : {}),
      ...(rnd() < 0.6 ? {symptoms: {Fatigue: 1 + Math.floor(rnd() * 3), ...(rnd() < 0.5 ? {Acne: 2} : {})}} : {}),
      ...(rnd() < 0.6 ? {mood: 1 + Math.floor(rnd() * 5), energy: 1 + Math.floor(rnd() * 5), stress: 3, focus: 4} : {}),
      ...(rnd() < 0.2 ? {feelings: ['Calm']} : {}), ...(rnd() < 0.2 ? {sleepNotes: ['Woke often']} : {}),
      ...(rnd() < 0.25 ? {fertility: {lh: pick(['negative', 'positive', 'unclear']), ...(rnd() < 0.5 ? {bbt: pick([36.42, 36.7, 50])} : {}), mucus: pick(['dry', 'egg_white'])}} : {}),
      ...(rnd() < 0.2 ? {note: SECRET} : {}), ...(rnd() < 0.1 ? {source: 'health_connect'} : {}), ...(rnd() < 0.05 ? {pain: 99, odd: {x: [1, null]}} : {})};
    if (i >= 0) days[i] = v; else { days.push(v); days.sort((a, b) => a.date.localeCompare(b.date)); }
  }
  else if (r < 0.48 && d.cycleDays?.length) d.cycleDays.splice(Math.floor(rnd() * d.cycleDays.length), 1);
  else if (r < 0.55) L('cycleMeds').push({id: `med-${k}`, name: pick(['Levothyroxine', 'Metformin', 'Vitamin D']), dose: pick([50, 500, 0.5]), unit: pick(['µg', 'mg']), times: ['07:00'], reminder: true, ...(rnd() < 0.3 ? {start: day(30)} : {})});
  else if (r < 0.58 && d.cycleMeds?.length) pick(d.cycleMeds).dose = pick([75, 100]);
  else if (r < 0.6 && d.cycleMeds?.length) d.cycleMeds.splice(0, 1);
  else if (r < 0.72 && d.cycleMeds?.length) { const m = pick(d.cycleMeds), date = day(Math.floor(rnd() * 10)), id = `${m.id}:${date}:07:00`, doses = L('cycleDoses');
    const i = doses.findIndex((x) => x.id === id); const v = {id, medId: m.id, date, time: '07:00', status: pick(['taken', 'missed'])}; if (i >= 0) doses[i] = v; else doses.push(v); }
  else if (r < 0.82) L('cycleLabs').push({id: `lab-${k}`, test: pick(['tsh', 'ft4', 'ft3', 'other']), value: pick([2.4, 6.1, 13.25, 0.004]), unit: 'mIU/L', low: 0.4, high: 4, date: day(Math.floor(rnd() * 400)), ...(rnd() < 0.2 ? {name: 'Ferritin'} : {})});
  else if (r < 0.85 && d.cycleLabs?.length) d.cycleLabs.splice(Math.floor(rnd() * d.cycleLabs.length), 1);
  else if (r < 0.92) L('cycleConditions').push({id: `cond-${k}`, kind: pick(['pcos', 'hypothyroidism', 'other']), status: pick(['diagnosed', 'suspected']), ...(rnd() < 0.5 ? {since: '2021-03-01'} : {}), ...(rnd() < 0.3 ? {name: 'Endometriosis'} : {})});
  else if (r < 0.95 && d.cycleConditions?.length) d.cycleConditions.reverse();
  else if (d.cycleLabs?.length > 1) d.cycleLabs.reverse();
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
  for (const f of ['01-foundation', '02-library', '03-training', '04-catalogue', '05-fill-training', '06-nutrition', '07-fill-nutrition', '08-body', '09-fill-body',
    '10-account', '11-fill-account', '12-read', '13-save-rows', '14-apply-training', '15-tables-switch']) await db.exec(readFileSync(`database/diary/${f}.sql`, 'utf8'));
  await db.exec(readFileSync('database/mcp-read-tables.sql', 'utf8'));
  await db.exec(readFileSync('database/diary/16-everyone-3.sql', 'utf8'));
  for (let i = 0; i < 2; i++) await db.exec(readFileSync('database/diary/17-cycle.sql', 'utf8'));   // (and safe to re-run)
  for (let i = 0; i < 2; i++) await db.exec(readFileSync('database/mcp-cycle.sql', 'utf8'));
  await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}', writes_enabled=true;`);
  for (const u of [alice, bob]) await db.query(`insert into public.forma_workspaces (user_id, payload) values ($1, $2)`, [u, JSON.stringify(base())]);
  for (const u of [alice, bob]) await db.query(`select diary.move_to_tables($1), diary.move_areas($1)`, [u]);

  const sql = async (q, p = []) => { await db.exec('reset role'); return (await db.query(q, p)).rows[0]; };
  const asUser = async (u, q, p = [], worker = false) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub: u, session_id: as_, ...(worker ? {client_id: 'worker', aud: RES} : {aud: 'authenticated'})})]);
    await db.exec('set role authenticated');
    try { return (await db.query(q, p)).rows; } finally { await db.exec('reset role'); }
  };
  const full = async (u) => (await asUser(u, `select public.forma_workspace_full() f`))[0].f;
  const save = async (u, ops, rev) => (await asUser(u, `select * from public.forma_save_changes($1, $2)`, [JSON.stringify(ops), rev]))[0];
  const pull = async (u, since) => (await asUser(u, `select public.forma_workspace_pull($1) p`, [since]))[0].p;

  // Random saves on one phone; a second phone follows from the changes only.
  let a = await full(alice), phone = a.payload, rev = a.revision, other = JSON.parse(JSON.stringify(phone)), otherRev = rev, saves = 0;
  for (let k = 0; k < 220; k++) {
    const next = edit(JSON.parse(JSON.stringify(phone)), k);
    const ops = W.diff(phone, next);
    if (!ops.length) continue;
    const r = await save(alice, ops, rev);
    assert.equal(r.conflict, false, `save ${k}`); saves++;
    const now = await full(alice);
    phone = r.adjusted ? now.payload : next; rev = r.saved_revision;
    assert.deepEqual(phone, now.payload, `save ${k}: the phone's copy = the server's diary; ops ${JSON.stringify(ops).slice(0, 300)}`);
    const p = await pull(alice, otherRev);
    if (p.full) other = JSON.parse(JSON.stringify(now.payload)); else for (const c of p.changes) other = W.apply(other, c.ops);
    otherRev = p.revision;
    assert.deepEqual(other, now.payload, `save ${k}: the other phone`);
  }
  const st = (await sql(`select payload from public.forma_workspaces where user_id = $1`, [alice])).payload;
  assert.ok(CYCLE.every((k) => !(k in st)), 'cycle parts live in the tables, not the document');
  console.log(`PASS cycle saves: ${saves} random saves (days, medicines, doses, labs, conditions, settings), both phones and the server always the same diary`);

  // The rows hold the facts; odd values stay exact in the diary but are not stored as facts.
  const days = phone.cycleDays || [];
  assert.equal((await sql(`select count(*)::int n from diary.cycle_days where user_id = $1 and deleted_at is null`, [alice])).n, new Set(days.map((x) => x.date)).size, 'one row per logged day');
  for (const x of days.slice(0, 15)) {
    const row = await sql(`select bleeding, pain, nothing, mood, bbt_c::float bbt, source from diary.cycle_days where user_id = $1 and local_date = $2 and deleted_at is null`, [alice, x.date]);
    assert.equal(row.bleeding, x.bleeding ?? null); assert.equal(row.source, x.source ?? null, 'where the day came from'); assert.equal(row.nothing, !!x.nothing); assert.equal(row.mood, x.mood ?? null);
    assert.equal(row.pain, x.pain >= 0 && x.pain <= 10 ? x.pain : null, 'pain 0–10 only'); assert.equal(row.bbt, x.fertility?.bbt >= 34 && x.fertility?.bbt <= 43 ? x.fertility.bbt : null, 'temperature 34–43 °C only');
  }
  const meds = phone.cycleMeds || [], doses = phone.cycleDoses || [];
  assert.equal((await sql(`select count(*)::int n from diary.medications where user_id = $1 and deleted_at is null`, [alice])).n, meds.length);
  assert.equal((await sql(`select count(*)::int n from diary.medication_doses d where d.user_id = $1 and d.deleted_at is null and d.medication_id is not null`, [alice])).n,
    doses.filter((x) => meds.some((m) => m.id === x.medId)).length, 'doses linked to their medicine while it exists');
  assert.equal((await sql(`select count(*)::int n from diary.lab_results where user_id = $1 and deleted_at is null`, [alice])).n, (phone.cycleLabs || []).length);
  assert.equal((await sql(`select count(*)::int n from diary.health_conditions where user_id = $1 and deleted_at is null`, [alice])).n, (phone.cycleConditions || []).length);
  // Saving only what changed leaves the same rows and patches as copying everything again.
  const partial = await sql(`select (select jsonb_object_agg(k, diary.cycle_part($1, k)) from unnest(diary.cycle_keys()) k) c, (select coalesce(jsonb_object_agg(part, ops), '{}') from diary.doc_patches where user_id = $1 and part like 'cycle%') p`, [alice]);
  await sql(`select diary.set_areas($1, diary.area_values($1, diary.area_keys()))`, [alice]);
  const whole = await sql(`select (select jsonb_object_agg(k, diary.cycle_part($1, k)) from unnest(diary.cycle_keys()) k) c, (select coalesce(jsonb_object_agg(part, ops), '{}') from diary.doc_patches where user_id = $1 and part like 'cycle%') p`, [alice]);
  assert.deepEqual(partial, whole, 'partial copies = a full copy');
  assert.equal((await sql(`select count(*)::int n from diary.fill_problems where kind = 'error'`)).n, 0);
  console.log('PASS cycle rows: one per day, medicines, linked doses, labs and conditions; values outside the rules kept exactly in the diary but never stored as facts');

  // Only the owner: Bob sees and changes nothing of Alice's; anonymous sees nothing.
  for (const t of ['cycle_settings', 'cycle_days', 'medications', 'medication_doses', 'lab_results', 'health_conditions']) {
    assert.equal((await asUser(bob, `select count(*)::int n from diary.${t} where user_id = '${alice}'`))[0].n, 0, `Bob can't read ${t}`);
    const changed = await asUser(bob, `update diary.${t} set updated_at = now() where user_id = '${alice}' returning 1`);
    assert.equal(changed.length, 0, `Bob can't change ${t}`);
    await db.exec('set role anon');
    await assert.rejects(db.query(`select 1 from diary.${t} limit 1`), /permission denied/, `anonymous can't read ${t}`);
    await db.exec('reset role');
  }
  await assert.rejects(asUser(bob, `insert into diary.cycle_days (user_id, local_date) values ('${alice}', '2026-11-01')`), /row-level security|violates/, 'Bob can\'t write Alice\'s rows');
  assert.ok((await asUser(alice, `select count(*)::int n from diary.cycle_days`))[0].n > 0, 'Alice reads her own');
  console.log('PASS privacy: only the owner reads or changes her cycle rows; other people and anonymous get nothing');

  // Never in the AI connector's diary or its answers.
  const env = (await sql(`select diary.as_envelope($1) e`, [alice])).e;
  assert.ok(CYCLE.every((k) => !(k in env)), 'the AI connector\'s diary has no cycle parts');
  if (days.some((x) => x.note === SECRET)) {
    await asUser(alice, `select public.mfd_mcp('consent', $1)`, [JSON.stringify({client_id: 'app-a', permissions: ['workouts', 'routines', 'nutrition', 'progress', 'profile', 'recovery'], timezone: 'UTC'})]);
    for (const op of ['profile', 'workouts', 'summarize_nutrition', 'weight_trend', 'recovery']) {
      const out = await asUser(alice, `select public.mfd_mcp($1, $2::jsonb)::text t`, [op, JSON.stringify({connection: 'app-a'})], true).catch((e) => [{t: ''}]);
      assert.ok(!out[0].t.includes(SECRET) && !/cycleDays|cycle_days|bleeding/.test(out[0].t), `${op} says nothing about the cycle`);
    }
  }
  console.log('PASS AI: the connector\'s diary and its answers contain nothing from Cycle & Health');

  // get_cycle: only with the "cycle" tick on that connection AND the person's own switch in MFD.
  const cycleCall = (u, conn, args = {}) => asUser(u, `select public.mfd_mcp('cycle', $1::jsonb)::text t`, [JSON.stringify({connection: conn, ...args})], true).then((r) => JSON.parse(r[0].t));
  await assert.rejects(cycleCall(alice, 'app-a'), /Consent required/, 'without the cycle tick: nothing');
  await asUser(alice, `select public.mfd_mcp('consent', $1)`, [JSON.stringify({client_id: 'app-c', permissions: ['cycle'], timezone: 'UTC'})]);
  await sql(`update diary.cycle_settings set ai_access = false, enabled = true where user_id = $1`, [alice]);
  await assert.rejects(cycleCall(alice, 'app-c'), /not shared with AI assistants/, 'switch off in MFD: nothing');
  await sql(`update diary.cycle_settings set ai_access = true where user_id = $1`, [alice]);
  const all = phone.cycleDays || [], first = all[0]?.date ?? '2026-01-01', last = all.at(-1)?.date ?? '2026-01-01';
  const got = await cycleCall(alice, 'app-c', {from: first, to: last});
  assert.equal(got.days.length, all.length, 'every day in the range'); assert.ok(got.days.every((d) => !('id' in d)), 'no internal ids');
  const per = all.filter((d) => d.bleeding === 'period').length;
  assert.ok(per === 0 ? got.periods.length === 0 : got.periods.length >= 1, 'periods from period days');
  assert.ok(got.periods.every((p) => p.bleeding_days >= 1 && (p.cycle_length_days === undefined || p.cycle_length_days > 7)), 'a new period only after a gap of more than 7 days');
  assert.equal(got.medicines.length, (phone.cycleMeds || []).length); assert.equal(got.conditions.length, (phone.cycleConditions || []).length);
  assert.ok(got.notes.some((n) => /Do not infer fertile days/.test(n)) && !/"fertile_window"|"ovulation_day"/.test(JSON.stringify(got)), 'never fertile days');
  await assert.rejects(cycleCall(alice, 'app-c', {from: '2020-01-01', to: '2026-01-01'}), /At most 400 days/);
  await assert.rejects(cycleCall(bob, 'app-c'), /Consent required|Active session required/, 'another person: nothing');
  await sql(`update diary.cycle_settings set ai_access = false where user_id = $1`, [alice]);
  await assert.rejects(cycleCall(alice, 'app-c'), /not shared/, 'switching off in MFD stops it at once');
  console.log('PASS AI permission: get_cycle answers only with the cycle tick on that connection and the person\'s own switch in MFD; ranges limited; no ids; never fertile days');

  // Deleting everything removes the rows (soft-deleted, then cleared like other rows).
  a = await full(alice);
  const ops = W.diff(a.payload, Object.fromEntries(Object.entries(a.payload).filter(([k]) => !CYCLE.includes(k))));
  assert.equal((await save(alice, ops, a.revision)).conflict, false);
  for (const t of ['cycle_settings', 'cycle_days', 'medications', 'medication_doses', 'lab_results', 'health_conditions'])
    assert.equal((await sql(`select count(*)::int n from diary.${t} where user_id = $1 and deleted_at is null`, [alice])).n, 0, `${t} cleared`);
  const after = (await full(alice)).payload;
  assert.ok(CYCLE.every((k) => !(k in after)), 'gone from her diary');
  console.log('PASS delete: removing Cycle & Health clears every row and leaves nothing in the diary');
})().catch((e) => { console.error(e); process.exit(1); });
