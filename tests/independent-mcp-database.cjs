const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict');
const resources=['https://gngnrmzeghjzqsmzuktl.supabase.co/functions/v1/mfd-mcp/mcp','https://mfd-colocated-staging.invalid/mcp'],old='https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp';
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222',as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bs='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
(async()=>{
 for(const resource of resources){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role supabase_auth_admin;create schema auth;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 insert into auth.users values('${alice}'),('${bob}');insert into auth.sessions values('${as}','${alice}'),('${bs}','${bob}');`);
 await db.exec(fs.readFileSync('database/schema.sql','utf8'));await db.exec(fs.readFileSync('database/mcp.sql','utf8'));
 await db.exec(`insert into mfd_mcp.clients values('client-a');update mfd_mcp.settings set resource_uri='${resource}';`);
 async function identity(user,client,aud=resource,session=user===alice?as:bs){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session,...(client?{client_id:client,aud}:{})})]);await db.exec('set role authenticated');}
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as data',[op,JSON.stringify(args)])).rows[0].data;
 for(const [user,name] of [[alice,'Alice'],[bob,'Bob']]){
  await identity(user);await db.query('select public.forma_save_workspace($1::jsonb,0)',[JSON.stringify({profile:{name,email:'private'},sessions:[{id:name}]})]);await rpc('consent',{client_id:'client-a',permissions:['profile']});
  await identity(user,'client-a');assert.equal((await rpc('profile',{user_id:user===alice?bob:alice})).data.name,name);assert.equal((await rpc('profile')).data.email,undefined);
  await assert.rejects(()=>rpc('workouts'),/Consent required/);assert.equal((await db.query('select * from public.forma_workspaces')).rows.length,0);
  await assert.rejects(()=>rpc('propose_water_goal',{expected_revision:1,water_goal_ml:2500}),/Writes disabled/);
 }
 await identity(alice,'client-a',old);await assert.rejects(()=>rpc('profile'),/Invalid audience/);
 await identity(alice,'client-a',resources.find(value=>value!==resource));await assert.rejects(()=>rpc('profile'),/Invalid audience/);
 await identity(alice,'unknown');await assert.rejects(()=>rpc('profile'),/Invalid audience/);
 await identity(alice,'client-a',resource,bs);await assert.rejects(()=>rpc('profile'),/Active session/);
 await identity(alice);await rpc('revoke',{client_id:'client-a'});await identity(alice,'client-a');await assert.rejects(()=>rpc('profile'),/Consent required/);
 await db.exec(`reset role;delete from auth.sessions where id='${bs}'`);await identity(bob,'client-a');await assert.rejects(()=>rpc('profile'),/Active session/);
 await db.exec('reset role;set role supabase_auth_admin');
 const hook=(await db.query('select mfd_mcp.access_token_hook($1::jsonb) as data',[JSON.stringify({client_id:'client-a',claims:{sub:alice,aud:'authenticated',client_id:'client-a'}})])).rows[0].data;
 assert.equal(hook.claims.aud,resource);
 await db.exec(`reset role;begin;update mfd_mcp.settings set resource_uri='${old}';alter table mfd_mcp.settings alter column resource_uri set default '${resource}';rollback;`);
 assert.equal((await db.query('select resource_uri,writes_enabled from mfd_mcp.settings')).rows[0].resource_uri,resource);assert.equal((await db.query('select writes_enabled from mfd_mcp.settings')).rows[0].writes_enabled,false);
 await db.close();console.log('PASS isolated-resource SQL rehearsal: new audience/hook, old audience denial, Alice/Bob, live sessions, consent revocation, OAuth RLS, disabled writes and transactional rollback');
 }
})().catch(e=>{console.error(e);process.exit(1)});
