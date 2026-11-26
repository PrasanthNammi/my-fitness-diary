// database/auth-email-alert.sql: sign-up/reset email failures counted for Grafana (26 Nov 2026, Gmail refused
// the app password and email sign-ups failed unnoticed for two weeks).
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(readFileSync('database/schema.sql','utf8').replace('create extension if not exists pg_cron;',''));
 await db.exec(readFileSync('database/sync-observability.sql','utf8'));
 const before=(await db.query('select public.mfd_prometheus_metrics() as m')).rows[0].m;
 const alert=readFileSync('database/auth-email-alert.sql','utf8');
 await db.exec(alert);
 const metrics=async()=>{await db.exec('reset role');return (await db.query('select public.mfd_prometheus_metrics() as m')).rows[0].m;};
 const total=async()=>Number(/mfd_auth_email_failures_total (\d+)/.exec(await metrics())[1]);
 // Every earlier metric is still exported unchanged; the new counter starts at 0.
 const m0=await metrics();
 assert(m0.startsWith(before),'earlier metrics unchanged and first');
 assert(m0.includes('# TYPE mfd_auth_email_failures_total counter\nmfd_auth_email_failures_total 0\n'));
 // The app's server calls it with the public key (anon): counted, at most once per 10 seconds.
 await db.exec('set role anon');await db.query('select public.mfd_note_auth_email_failure()');await db.query('select public.mfd_note_auth_email_failure()');
 assert.equal(await total(),1);
 await db.exec("update mfd_observability.auth_email_failures set last_at=clock_timestamp()-interval '11 seconds'");
 await db.exec('set role authenticated');await db.query('select public.mfd_note_auth_email_failure()');
 assert.equal(await total(),2);
 // Nobody but the metrics reader sees the table or the metrics; the counter has one row and no personal details.
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from mfd_observability.auth_email_failures'));
  await assert.rejects(db.query('select public.mfd_prometheus_metrics()'));
 }
 await db.exec('reset role');
 assert.deepEqual((await db.query("select column_name from information_schema.columns where table_schema='mfd_observability' and table_name='auth_email_failures' order by ordinal_position")).rows.map(r=>r.column_name),['id','total','last_at']);
 await assert.rejects(db.query('insert into mfd_observability.auth_email_failures(id) values(false)'));
 // Safe to run again: the count is kept.
 await db.exec(alert);
 assert.equal(await total(),2);
 assert.equal((await db.query('select count(*)::int as n from mfd_observability.auth_email_failures')).rows[0].n,1);
 console.log('PASS auth email alert: counter exported after the unchanged sync metrics, anon/authenticated can count but not read, one count per 10 seconds, one row without personal details, safe to run again');
})().catch(e=>{console.error(e);process.exit(1)});
