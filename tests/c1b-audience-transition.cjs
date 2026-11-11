// Disposable synthetic local database only. Never connects to hosted Supabase.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const sql=fs.readFileSync('database/staging/c1b-audience-transition.proposed.sql','utf8');
const old='https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp',next='https://mfd-connect-staging.shanustylish777.workers.dev/mcp';
(async()=>{
 const db=new PGlite();
 await db.exec(`create schema mfd_mcp; create table mfd_mcp.settings(id boolean primary key,writes_enabled boolean,resource_uri text default '${old}',preserved text);insert into mfd_mcp.settings values(true,false,'${old}','retain');create table mfd_mcp.clients(id text);create table mfd_mcp.grants(id text);create table mfd_mcp.proposals(id text);`);
 await db.exec("create schema auth;create table auth.users(id text primary key);insert into auth.users values('synthetic-primary'),('synthetic-secondary');");
 const state=async()=>(await db.query('select * from mfd_mcp.settings')).rows;
 async function denied(pattern){await assert.rejects(()=>db.exec(sql),pattern);await db.exec('rollback');}
 await denied(/unverified/);
 await db.exec("set mfd.c1b.target_ref='gngnrmzeghjzqsmzuktl';set mfd.c1b.exposed_schemas='public,graphql_public'");
 await db.exec('update mfd_mcp.settings set writes_enabled=true');await denied(/write switch/);await db.exec('update mfd_mcp.settings set writes_enabled=false');
 await db.exec("insert into mfd_mcp.clients values('existing')");await denied(/inventory changed/);await db.exec('delete from mfd_mcp.clients');
 await db.exec("alter table mfd_mcp.settings alter column resource_uri set default 'drift'");await denied(/unexpected resource/);assert.equal((await state())[0].resource_uri,old);
 await db.exec(`alter table mfd_mcp.settings alter column resource_uri set default '${old}'`);
 // Inject a late error into a LOCAL copy to prove the preceding UPDATE/DDL roll back.
 await assert.rejects(()=>db.exec(sql.replace("notify pgrst,'reload schema';","select 1/0;")),/division by zero/);await db.exec('rollback');assert.equal((await state())[0].resource_uri,old);
 await db.exec(sql);assert.deepEqual(await state(),[{id:true,writes_enabled:false,resource_uri:next,preserved:'retain'}]);
 const before=JSON.stringify(await state());await db.exec(sql);assert.equal(JSON.stringify(await state()),before);
 assert.deepEqual((await db.query('select id from auth.users order by id')).rows,[{id:'synthetic-primary'},{id:'synthetic-secondary'}]);
 await db.close();console.log('PASS C1B proposed audience CAS: guards, default drift, empty-client gate, late transactional rollback, preserved fields and repeat execution');
})().catch(e=>{console.error(e);process.exitCode=1});
