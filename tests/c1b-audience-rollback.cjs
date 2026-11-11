// Disposable synthetic PostgreSQL only. No hosted credentials or calls.
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const forward=fs.readFileSync('database/staging/c1b-audience-transition.proposed.sql','utf8'),reverse=fs.readFileSync('database/staging/c1b-audience-rollback.proposed.sql','utf8');
assert.equal(crypto.createHash('sha256').update(forward).digest('hex'),'1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590');
const old='https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp',next='https://mfd-connect-staging.shanustylish777.workers.dev/mcp';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
(async()=>{
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema mfd_mcp;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean,note text);
 insert into auth.users values('${ids[0]}','2026-10-01',false,'primary'),('${ids[1]}','2026-10-02',false,'secondary');
 create table auth.identities(id integer primary key,user_id uuid,provider text);insert into auth.identities values(1,'${ids[0]}','email'),(2,'${ids[1]}','email');
 create table auth.sessions(id integer);create table auth.oauth_clients(id integer);create table auth.oauth_authorizations(id integer);create table auth.oauth_consents(id integer);
 create table mfd_mcp.settings(id boolean primary key,writes_enabled boolean,resource_uri text default '${old}',retained text);
 insert into mfd_mcp.settings values(true,false,'${old}','unchanged');
 create table mfd_mcp.clients(id integer);create table mfd_mcp.grants(id integer);create table mfd_mcp.proposals(id integer);
 create table public.diary(owner uuid,payload jsonb);alter table public.diary enable row level security;
 create policy owners on public.diary to authenticated using(owner=current_setting('fixture.owner',true)::uuid) with check(owner=current_setting('fixture.owner',true)::uuid);
 grant select,insert on public.diary to authenticated;revoke all on public.diary from anon;
 insert into public.diary values('${ids[0]}','{"synthetic":"retain"}');
 create function public.fixture_rpc() returns integer language sql set search_path='' as $$select 42$$;revoke execute on function public.fixture_rpc() from public;grant execute on function public.fixture_rpc() to authenticated;
 set mfd.c1b.target_ref='gngnrmzeghjzqsmzuktl';set mfd.c1b.exposed_schemas='public,graphql_public';
 set mfd.c1b.worker_writes='false';set mfd.c1b.oauth_server_disabled='true';`);
 await db.query("select set_config('mfd.c1b.approved_user_ids',$1,false)",[JSON.stringify(ids)]);
 const snapshot=async()=>(await db.query(`select jsonb_build_object(
 'users',(select jsonb_agg(to_jsonb(u) order by id) from auth.users u),'identities',(select jsonb_agg(to_jsonb(i) order by id) from auth.identities i),
 'settings',(select jsonb_agg(to_jsonb(s)) from mfd_mcp.settings s),'default',(select pg_get_expr(adbin,adrelid) from pg_attrdef where adrelid='mfd_mcp.settings'::regclass),
 'diary',(select jsonb_agg(to_jsonb(t)) from public.diary t),
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('auth','mfd_mcp','public') and c.relkind='r'),
 'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p),
 'functions',(select jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl,'body',prosrc,'definer',prosecdef,'config',proconfig)) from pg_proc where oid='public.fixture_rpc()'::regprocedure),
 'worker_assertion',current_setting('mfd.c1b.worker_writes')) as state`)).rows[0].state;
 async function reject(pattern){const before=await snapshot();await assert.rejects(()=>db.exec(reverse),pattern);await db.exec('rollback');assert.deepEqual(await snapshot(),before);}
 const baseline=await snapshot();
 await reject(/unexpected current audience/); // strict one-shot reverse, not idempotent.
 await db.exec(forward);const committed=await snapshot();assert.equal(committed.settings[0].resource_uri,next);assert.equal(committed.default,"'"+next+"'::text");
 for(const [key,value] of [['target_ref','wrong'],['exposed_schemas','public,mfd_mcp'],['worker_writes','true'],['oauth_server_disabled','false']]){
  const original=(await db.query('select current_setting($1) as v',['mfd.c1b.'+key])).rows[0].v;
  await db.query('select set_config($1,$2,false)',['mfd.c1b.'+key,value]);await reject(/unverified/);await db.query('select set_config($1,$2,false)',['mfd.c1b.'+key,original]);
 }
 for(const value of ['null','{}','[]',JSON.stringify([ids[0],ids[0]]),JSON.stringify([ids[0],'33333333-3333-4333-8333-333333333333'])]){await db.query("select set_config('mfd.c1b.approved_user_ids',$1,false)",[value]);await reject(/approved|Auth baseline/);}
 await db.query("select set_config('mfd.c1b.approved_user_ids',$1,false)",[JSON.stringify(ids)]);
 for(const table of ['auth.sessions','auth.oauth_clients','auth.oauth_authorizations','auth.oauth_consents','mfd_mcp.clients','mfd_mcp.grants','mfd_mcp.proposals']){await db.exec(`insert into ${table} values(1)`);await reject(/state is not empty/);assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,1);await db.exec(`delete from ${table}`);}
 await db.exec('update mfd_mcp.settings set writes_enabled=true');await reject(/write switch/);await db.exec('update mfd_mcp.settings set writes_enabled=false');
 await db.exec("update mfd_mcp.settings set resource_uri='https://drift.invalid/mcp'");await reject(/unexpected current audience/);await db.query('update mfd_mcp.settings set resource_uri=$1',[next]);
 await db.exec("alter table mfd_mcp.settings alter column resource_uri set default 'drift'");await reject(/column default drift/);await db.exec(`alter table mfd_mcp.settings alter column resource_uri set default '${next}'`);
 await db.exec("update auth.identities set provider='google' where id=1");await reject(/Auth baseline drift/);await db.exec("update auth.identities set provider='email' where id=1");
 const beforeLate=await snapshot();await assert.rejects(()=>db.exec(reverse.replace("notify pgrst,'reload schema';","select 1/0;")),/division by zero/);await db.exec('rollback');assert.deepEqual(await snapshot(),beforeLate);
 await db.exec(reverse);assert.deepEqual(await snapshot(),baseline); // exact row/default/UUID/data/RLS/ACL/owner/function restoration.
 await reject(/unexpected current audience/); // repeated reverse safely refuses old state, preserves it.
 await db.exec(forward);await db.exec(reverse);assert.deepEqual(await snapshot(),baseline);
 await db.close();console.log('PASS committed forward/reverse CAS: exact old state, two UUIDs, data/RLS/ACL/function preservation, all OAuth/session guards, runtime assertions, drift, strict repeat refusal and late atomic rollback');
})().catch(e=>{console.error(e);process.exitCode=1});
