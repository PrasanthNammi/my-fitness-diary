const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const migrationPath='supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_staging_mfd_c01_remediation.sql'));
const migration=fs.readFileSync(migrationPath,'utf8');
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const payload={profile:{name:'Alice',waterGoalMl:2000},sessions:[{id:'before-migration',started:1700000000000,sets:[]}],unknown:{preserve:true}};
async function bootstrap(db=new PGlite()){
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create role supabase_admin;
 create schema auth;create schema storage;grant usage,create on schema public to supabase_admin;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
 create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
 grant usage on schema auth,storage to authenticated;
 grant execute on all functions in schema auth,storage to authenticated;
 grant select,insert,update,delete on storage.objects to authenticated;
 alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated;
 alter default privileges for role supabase_admin in schema public grant all on tables to anon,authenticated;
 alter default privileges for role supabase_admin in schema public grant execute on functions to anon,authenticated;`);
 await db.exec(fs.readFileSync('database/schema.sql','utf8'));
 await db.exec(fs.readFileSync('database/mcp.sql','utf8'));
 await db.exec(`grant all on public.forma_workspaces to authenticated;
 alter table mfd_mcp.settings alter column resource_uri set default 'https://old-resource.invalid/mcp';
 insert into auth.users values('${alice}'),('${bob}');insert into auth.sessions values('${session}','${alice}'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${bob}');
 set mfd.c01.target_ref='gngnrmzeghjzqsmzuktl';set mfd.c01.exposed_schemas='public,graphql_public';`);
 await db.query('insert into public.forma_workspaces(user_id,payload,revision) values($1,$2,7)',[alice,payload]);
 return db;
}
async function identity(db,user=alice,client){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:user===alice?session:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',role:'authenticated',...(client?{client_id:client,aud:'https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp'}:{})})]);
 await db.exec('set role authenticated');
}
async function run(nativeDb){
 const db=await bootstrap(nativeDb);
 if(nativeDb){
  await db.exec("reset session authorization; alter role postgres nosuperuser bypassrls; grant anon,authenticated,service_role to postgres; set session authorization postgres");
  assert.equal((await db.query("select rolsuper from pg_roles where rolname=current_user")).rows[0].rolsuper,false);
  assert.equal((await db.query("select pg_has_role(current_user,'supabase_admin','MEMBER') as member")).rows[0].member,false);
  await assert.rejects(()=>db.exec("alter default privileges for role supabase_admin in schema public revoke all on tables from anon"),/permission denied|must be member/);
  console.log('PASS SQL Editor model: postgres NOSUPERUSER, no supabase_admin membership; provider-default mutation denied');
 }
 const preflight=fs.readFileSync('database/staging/c01-preflight.sql','utf8');
 await db.exec(preflight);
 // Exercise the exact preflight CTE with synthetic provider metadata. pg_settings
 // cannot register a provider GUC in PGlite, so only its metadata input is replaced.
 const authorityCte=preflight.slice(preflight.indexOf('with provider as ('),preflight.indexOf("select jsonb_build_object(\n 'database'"))
  .replace("(select setting::jsonb from pg_settings where name='supautils.policy_grants')",'$1::jsonb');
 const authoritySql=authorityCte+"select relname,ordinary_owner_or_inherited_owner as owned,supported_delegation_configured as delegated,ordinary_owner_or_inherited_owner or supported_delegation_configured as allowed from storage_authority order by relname";
 assert((await db.query(authoritySql,[null])).rows.every(r=>r.owned&&r.allowed),'ordinary ownership remains sufficient');
 await db.exec('set role authenticated');
 for(const input of [null,{},[],{postgres:['storage.objects','storage.buckets']},{authenticated:'storage.objects'},{authenticated:['storage.*']},{authenticated:['storage.object']},{authenticated:{'storage.objects':true}}]){
  assert((await db.query(authoritySql,[input])).rows.every(r=>!r.allowed),'missing/wrong-role/wrong-shape delegation fails closed');
 }
 const partial=(await db.query(authoritySql,[{authenticated:['storage.objects']}])).rows;
 assert.equal(partial.find(r=>r.relname==='objects').allowed,true);
 assert.equal(partial.find(r=>r.relname==='buckets').allowed,false,'each table independently authorized');
 assert((await db.query(authoritySql,[{authenticated:['storage.objects','storage.buckets']}])).rows.every(r=>!r.owned&&r.delegated&&r.allowed));
 await assert.rejects(()=>db.query(authoritySql,['{not-json']),/json/i);
 await db.exec('reset role');
 console.log('PASS preflight ownership/delegation distinction and missing, malformed, wrong-role, partial and exact delegation cases');
 const providerDefaultsBefore=(await db.query("select defaclrole::regrole::text as creator,defaclnamespace,defaclobjtype,defaclacl::text from pg_default_acl where defaclrole='supabase_admin'::regrole or defaclnamespace=0 order by 1,2,3")).rows;
 const initialWorkspace=(await db.query('select * from public.forma_workspaces order by user_id')).rows;
 // Wrong or missing target assertions must fail before creating any new table.
 await db.exec("set mfd.c01.target_ref='wrong-target'");
 await assert.rejects(()=>db.exec(migration),/target assertion/);await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('public.mfd_profiles') as t")).rows[0].t,null);
 await db.exec("set mfd.c01.target_ref='gngnrmzeghjzqsmzuktl';set mfd.c01.exposed_schemas='public,mfd_mcp'");
 await assert.rejects(()=>db.exec(migration),/private schema is exposed/);await db.exec('rollback');
 await db.exec("set mfd.c01.exposed_schemas='public,graphql_public'");
 // A pre-existing wrong resource/writes state is never silently corrected.
 await db.exec('update mfd_mcp.settings set writes_enabled=true');
 await assert.rejects(()=>db.exec(migration),/resource\/writes precondition/);await db.exec('rollback');
 await db.exec('update mfd_mcp.settings set writes_enabled=false');
 await db.exec(migration);
 assert.deepEqual((await db.query('select * from public.forma_workspaces order by user_id')).rows,initialWorkspace);
 const before=(await db.query('select payload,revision,updated_at from public.forma_workspaces where user_id=$1',[alice])).rows[0];
 assert.deepEqual(before.payload,payload);assert.equal(before.revision,7);
 assert.equal((await db.query('select count(*)::int as n from public.mfd_social_workouts')).rows[0].n,0,'no history backfill');
 for(let i=0;i<2;i++)await db.exec(migration);
 assert.deepEqual((await db.query('select payload,revision,updated_at from public.forma_workspaces where user_id=$1',[alice])).rows[0],before);
 for(const file of ['social','shared-catalogue','catalogue-photos']){
  await db.exec(fs.readFileSync('database/tests/'+file+'.sql','utf8'));console.log('PASS remediated schema: '+file+' SQL suite');
 }
 for(const table of ['forma_workspaces','mfd_profiles','mfd_friendships','mfd_blocks','mfd_social_workouts','mfd_messages','mfd_reactions','mfd_catalogue','mfd_catalogue_reports','mfd_workout_photos','mfd_catalogue_photos']){
  for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['authenticated','public.'+table,privilege])).rows[0].allowed,false);
 }
 // Narrow defaults protect postgres tables/sequences without changing provider/global defaults.
 const defaultSnapshot=async()=> (await db.query("select defaclrole::regrole::text as creator,defaclnamespace,defaclobjtype,defaclacl::text from pg_default_acl where defaclrole='supabase_admin'::regrole or defaclnamespace=0 order by 1,2,3")).rows;
 assert.deepEqual(await defaultSnapshot(),providerDefaultsBefore);
 await db.exec('create table public.c01_postgres_probe(id int);create sequence public.c01_postgres_probe_seq;create function public.c01_postgres_probe() returns int language sql as $$select 1$$');
 for(const who of ['anon','authenticated']){
  assert.equal((await db.query("select has_table_privilege($1,'public.c01_postgres_probe','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') as ok",[who])).rows[0].ok,false);
  assert.equal((await db.query("select has_sequence_privilege($1,'public.c01_postgres_probe_seq','USAGE,SELECT,UPDATE') as ok",[who])).rows[0].ok,false);
  // Deliberately still true: no misleading claim that IN SCHEMA removed PUBLIC EXECUTE.
  assert.equal((await db.query("select has_function_privilege($1,'public.c01_postgres_probe()','EXECUTE') as ok",[who])).rows[0].ok,true);
 }
 // The required future-MFD pattern closes PUBLIC/direct grants atomically.
 await db.exec("begin; create function public.c01_future_mfd_probe() returns int language sql security definer set search_path='' as $$select 1$$; revoke all on function public.c01_future_mfd_probe() from public,anon,authenticated; commit");
 for(const who of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.c01_future_mfd_probe()','EXECUTE') as ok",[who])).rows[0].ok,false);
 await db.exec('drop function public.c01_future_mfd_probe()');
 await identity(db);
 let saved=(await db.query('select * from public.forma_save_workspace_v2($1,7)',[payload])).rows[0];assert.equal(saved.saved_revision,8);assert.equal(saved.conflict,false);
 saved=(await db.query('select * from public.forma_save_workspace_v2($1,7)',[payload])).rows[0];assert.equal(saved.conflict,true);
 assert.equal((await db.query('select payload from public.forma_workspaces')).rows[0].payload.unknown.preserve,true);
 await identity(db,bob);
 assert.equal((await db.query('select * from public.forma_workspaces')).rows.length,0);
 assert.equal((await db.query('update public.forma_workspaces set payload=\'{}\' returning user_id')).rows.length,0);
 assert.equal((await db.query('delete from public.forma_workspaces returning user_id')).rows.length,0);
 // Create Bob through the application's CAS function; cannot name Alice as owner.
 assert.equal((await db.query('select * from public.forma_save_workspace_v2($1,0)',[{profile:{name:'Bob'},sessions:[]}])).rows[0].conflict,false);
 await identity(db,alice);assert.deepEqual((await db.query('select user_id from public.forma_workspaces')).rows,[{user_id:alice}]);
 await db.exec('reset role');await db.exec("insert into mfd_mcp.clients values('synthetic-client');insert into mfd_mcp.grants values('"+alice+"','synthetic-client',array['profile','workouts','routines','nutrition','progress']),('"+bob+"','synthetic-client',array['profile','workouts','routines','nutrition','progress'])");
 await identity(db,alice,'synthetic-client');
 for(const table of ['forma_workspaces','mfd_profiles','mfd_catalogue','mfd_catalogue_reports','mfd_friendships','mfd_blocks','mfd_messages','mfd_reactions','mfd_social_workouts','mfd_workout_photos','mfd_catalogue_photos']){
  assert.equal((await db.query('select * from public.'+table)).rows.length,0,'OAuth blocked: '+table);
 }
 await assert.rejects(()=>db.query('select * from public.forma_save_workspace_v2($1,8)',[payload]));
 await assert.rejects(()=>db.query("select mfd_observability.record_sync('saved',0)"),/Sign in required/);
 for(const [user,name,other] of [[alice,'Alice',bob],[bob,'Bob',alice]]){
  await identity(db,user,'synthetic-client');
  const own=(await db.query("select public.mfd_mcp('profile',$1) as result",[{user_id:other}])).rows[0].result;
  assert.equal(own.data.name,name);
  for(const section of ['workouts','routines','nutrition','progress']){
   const result=(await db.query('select public.mfd_mcp($1,$2) as result',[section,{user_id:other}])).rows[0].result;
   if(user===bob)assert.deepEqual(result.data,[]);
  }
 }
 await identity(db,alice,'synthetic-client');
 assert.equal((await db.query("select public.mfd_mcp('profile','{}') as result")).rows[0].result.data.name,'Alice');
 await assert.rejects(()=>db.query("select public.mfd_mcp('propose_water_goal','{\"expected_revision\":8,\"water_goal_ml\":3000}')"),/Writes disabled/);
 assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('mfd-avatars','"+alice+"/unauthorized.jpg')"));
 await db.exec('reset role');
 await db.exec('set role service_role');
 assert((await db.query('select public.mfd_prometheus_metrics() as metrics')).rows[0].metrics.includes('mfd_sync_operations_total'));
 await db.exec('reset role');
 assert.equal((await db.query('select resource_uri,writes_enabled from mfd_mcp.settings')).rows[0].writes_enabled,false);
 assert.equal((await db.query('select count(*)::int n from storage.buckets')).rows[0].n,3);
 // Re-run after valid user activity; preserve all workspace and settings records.
 const rows=(await db.query('select * from public.forma_workspaces order by user_id')).rows;
 const settingBefore=(await db.query('select * from mfd_mcp.settings')).rows;
 const allData=async()=>{const snapshot={};for(const {table_schema,table_name} of (await db.query("select table_schema,table_name from information_schema.tables where table_type='BASE TABLE' and table_schema in('public','mfd_mcp','mfd_observability') order by 1,2")).rows){snapshot[table_schema+'.'+table_name]=(await db.query('select to_jsonb(t) as row from '+table_schema+'.'+table_name+' t order by to_jsonb(t)::text')).rows}return snapshot};
 const dataBefore=await allData();
 await db.exec(migration);assert.deepEqual((await db.query('select * from public.forma_workspaces order by user_id')).rows,rows);
 assert.deepEqual(await allData(),dataBefore);assert.deepEqual((await db.query('select * from mfd_mcp.settings')).rows,settingBefore);
 const defaultValue=(await db.query("select column_default from information_schema.columns where table_schema='mfd_mcp' and table_name='settings' and column_name='resource_uri'")).rows[0].column_default;
 assert(defaultValue.includes('https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp'));
 // Existing policies and function bodies cannot be replaced just by rerunning.
 await db.exec('alter policy profiles_read on public.mfd_profiles using(false)');
 await assert.rejects(()=>db.exec(migration),/catalog\/bucket drift/);await db.exec('rollback');
 await db.exec('alter policy profiles_read on public.mfd_profiles using(true)');
 await db.exec("create or replace function public.mfd_are_friends(a uuid,b uuid) returns boolean language sql stable security invoker set search_path='' as $$select true$$");
 await assert.rejects(()=>db.exec(migration),/existing function differs/);await db.exec('rollback');
 // Restore this deliberately broken fixture in a disposable DB, never via the migration.
 const reference=fs.readFileSync('database/social.sql','utf8').match(/create function public\.mfd_are_friends[\s\S]*?\$\$;/)[0];
 await db.exec(reference.replace('create function','create or replace function'));
 // A late unexpected bucket mismatch must roll back every earlier change in the transaction.
 await db.exec('drop index public.mfd_catalogue_creator');
 await db.exec("update storage.buckets set public=true where id='mfd-avatars'");
 await assert.rejects(()=>db.exec(migration),/C01:.*(?:bucket|catalog)/);await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('public.mfd_catalogue_creator') as t")).rows[0].t,null,'late failure rolled back recreated index');
 await db.exec('create index mfd_catalogue_creator on public.mfd_catalogue(creator_id)');
 await db.exec("update storage.buckets set public=false where id='mfd-avatars'");
 await db.close();
 console.log('PASS C01 guards, idempotence, data preservation, default ACLs, CAS, Alice/Bob isolation, OAuth restrictions and disabled writes');
}
module.exports={bootstrap,migrationPath,run};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1});
