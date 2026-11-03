const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 // Synthetic Supabase auth/storage contracts only; no hosted service is contacted.
 await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
 create schema auth; create schema storage; create schema cron;
 create table auth.users(id uuid primary key);
 create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
 create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
 grant usage on schema auth,storage to authenticated;
 grant execute on all functions in schema auth,storage to authenticated;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
 for(const file of ['schema','social','shared-catalogue','social-photos','catalogue-photos','private-photo-metadata','private-exercises','sync-observability']){
  // PGlite cannot run the pg_cron background worker; only scheduling is stubbed.
  const sql=readFileSync('database/'+file+'.sql','utf8').replace('create extension if not exists pg_cron;','');
  await db.exec(sql);
 }
 for(const file of ['social','shared-catalogue','catalogue-photos']){
  await db.exec(readFileSync('database/tests/'+file+'.sql','utf8'));
  console.log('PASS database/tests/'+file+'.sql (embedded PostgreSQL)');
 }
 await db.exec(`insert into auth.users values('11111111-1111-4111-8111-111111111111');
 insert into auth.sessions values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
 insert into public.forma_workspaces(user_id,payload) values('11111111-1111-4111-8111-111111111111','{"profile":{"name":"Alice"}}');
 insert into public.mfd_profiles(user_id,username,display_name) values('11111111-1111-4111-8111-111111111111','alice_rls','Alice');
 insert into storage.objects(bucket_id,name) values('catalogue-photos','11111111-1111-4111-8111-111111111111/test.jpg');`);
 await db.exec(readFileSync('database/mcp.sql','utf8'));
 // Every pre-existing table policy is present alongside the OAuth restriction.
 const rows=(await db.query("select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='storage' and tablename='objects')")).rows;
 assert(rows.length>5);
 for(const {schemaname,tablename} of rows){
  const policies=(await db.query('select policyname,permissive from pg_policies where schemaname=$1 and tablename=$2',[schemaname,tablename])).rows;
  assert(policies.some(p=>p.permissive==='RESTRICTIVE'&&p.policyname.startsWith('mcp_no_direct_')),tablename);
 }
 await db.exec(`select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","client_id":"client-a","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',false);set role authenticated;`);
 for(const table of ['public.forma_workspaces','public.mfd_profiles','storage.objects']){
  assert.equal((await db.query('select * from '+table)).rows.length,0,table);
 }
 await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('catalogue-photos','11111111-1111-4111-8111-111111111111/denied.jpg')"));
 const blocked=(await db.query("select * from public.forma_save_workspace_v2('{}',1)")).rows[0];
 assert.equal(blocked.conflict,true);assert.equal(blocked.saved_revision,null);
 await db.exec('reset role');
 assert.deepEqual((await db.query('select payload from public.forma_workspaces')).rows[0].payload,{profile:{name:'Alice'}});
 console.log('PASS OAuth tokens denied direct workspace/profile/storage reads, uploads and v2 save RPC');
 await db.close();console.log('PASS MCP restriction installed across complete repository table schema');
})().catch(e=>{console.error(e);process.exitCode=1});
