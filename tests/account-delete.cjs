// Delete my account (database/account-delete.sql) on embedded PostgreSQL: only the signed-in person, only after
// typing DELETE; everything of theirs goes (diary, social both directions, AI leftovers, old safety copies), the other
// person's own data stays, and shared catalogue items they added stay for others without their name.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
 create schema auth; create schema storage; create schema cron;
 create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
 grant usage on schema auth,storage to authenticated; grant execute on all functions in schema auth,storage to authenticated;
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
 for(const f of ['schema','social','shared-catalogue','social-photos','catalogue-photos','private-photo-metadata','social-incremental','social-comments'])
  await db.exec(readFileSync('database/'+f+'.sql','utf8').replace('create extension if not exists pg_cron;',''));
 // Stand-ins for the AI connector's pending changes and the old in-database safety copies.
 await db.exec(`create schema if not exists mfd_mcp; create table if not exists mfd_mcp.pending_changes(user_id uuid);
  create schema if not exists mfd_private; create table mfd_private.backup_20261108_public_mfd_profiles(user_id uuid);
  create table mfd_private.backup_20261108_public_mfd_messages(sender uuid, recipient uuid); create table mfd_private.workspaces_before_compaction(user_id uuid);`);
 for(let i=0;i<2;i++)await db.exec(readFileSync('database/account-delete.sql','utf8'));   // safe to re-run
 await db.exec(`insert into auth.users values('${A}'),('${B}'),('${C}');
  insert into public.forma_workspaces(user_id,payload) values('${A}','{"profile":{"name":"A"}}'),('${B}','{"profile":{"name":"B"}}');
  insert into public.mfd_profiles(user_id,username,display_name) values('${A}','anna_a','A'),('${B}','ben_b','B'),('${C}','cleo_c','C');
  insert into public.mfd_friendships(sender,recipient,status) values('${A}','${B}','accepted');
  insert into public.mfd_messages(sender,recipient,body) values('${A}','${B}','hi'),('${B}','${A}','hey');
  insert into public.mfd_social_workouts(owner_id,workout_id,data,started_at) values('${A}','wa','{}',now()),('${B}','wb','{}',now());
  insert into public.mfd_reactions(user_id,owner_id,workout_id) values('${A}','${B}','wb'),('${B}','${A}','wa');
  insert into public.mfd_comments(owner_id,workout_id,user_id,body) values('${B}','wb','${A}','nice'),('${A}','wa','${B}','great'),('${B}','wb','${B}','thanks');
  insert into public.mfd_blocks(owner_id,target_id) values('${C}','${A}');
  insert into public.mfd_catalogue(creator_id,kind,name,data) values('${A}','food','Anna oats','{"basis":100,"unit":"g","cal":370,"p":13,"c":59,"f":7}'),('${B}','food','Ben rice','{"basis":100,"unit":"g","cal":130,"p":3,"c":28,"f":0.3}');
  insert into public.mfd_catalogue_reports(item_id,reporter_id,field,message) select id,'${A}','kcal','wrong' from public.mfd_catalogue where name='Ben rice';
  insert into mfd_mcp.pending_changes values('${A}'),('${B}');
  insert into mfd_private.backup_20261108_public_mfd_profiles values('${A}'),('${B}');
  insert into mfd_private.backup_20261108_public_mfd_messages values('${A}','${B}'),('${B}','${C}');
  insert into mfd_private.workspaces_before_compaction values('${A}');`).catch((e)=>{throw new Error('seed: '+e.message)});
 const as=async(u,q,p=[])=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:u,role:'authenticated'})]);await db.exec('set role authenticated');try{return (await db.query(q,p)).rows}finally{await db.exec('reset role')}};
 const n=async(q)=>(await db.query(q)).rows[0].n;
 // Only after typing DELETE; anonymous never.
 await assert.rejects(as(A,"select public.mfd_delete_account('delete')"),/Type DELETE/);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");await db.exec('set role anon');
 await assert.rejects(db.query("select public.mfd_delete_account('DELETE')"),/permission denied|Sign in/);await db.exec('reset role');
 assert.equal(await n(`select count(*)::int n from auth.users where id='${A}'`),1,'nothing deleted before confirming');
 assert.deepEqual((await as(A,"select public.mfd_delete_account('DELETE') r"))[0].r,{deleted:true});
 // Everything of A is gone; B's own things stay; A's shared item stays without a name.
 const left={account:`auth.users where id='${A}'`,diary:`public.forma_workspaces where user_id='${A}'`,profile:`public.mfd_profiles where user_id='${A}'`,
  friendships:`public.mfd_friendships where '${A}' in (sender,recipient)`,messages:`public.mfd_messages where '${A}' in (sender,recipient)`,
  workouts:`public.mfd_social_workouts where owner_id='${A}'`,reactions:`public.mfd_reactions where '${A}' in (user_id,owner_id)`,
  comments:`public.mfd_comments where '${A}' in (user_id,owner_id)`,blocks:`public.mfd_blocks where '${A}' in (owner_id,target_id)`,
  reports:`public.mfd_catalogue_reports where reporter_id='${A}'`,removals:`public.mfd_social_removals where owner_id='${A}'`,
  pending:`mfd_mcp.pending_changes where user_id='${A}'`,oldProfiles:`mfd_private.backup_20261108_public_mfd_profiles where user_id='${A}'`,
  oldMessages:`mfd_private.backup_20261108_public_mfd_messages where '${A}' in (sender,recipient)`,oldDiary:`mfd_private.workspaces_before_compaction where user_id='${A}'`};
 for(const [k,w] of Object.entries(left))assert.equal(await n('select count(*)::int n from '+w),0,k+' left');
 assert.equal(await n(`select count(*)::int n from public.mfd_catalogue where name='Anna oats' and creator_id is null`),1,'shared item kept, without a name');
 assert.equal(await n(`select count(*)::int n from public.mfd_catalogue where name='Ben rice' and creator_id='${B}'`),1);
 assert.equal(await n(`select count(*)::int n from public.forma_workspaces where user_id='${B}'`),1,"B's diary untouched");
 assert.equal(await n(`select count(*)::int n from public.mfd_social_workouts where owner_id='${B}'`),1,"B's workout stays");
 assert.equal(await n(`select count(*)::int n from public.mfd_comments where user_id='${B}' and owner_id='${B}'`),1,"B's own comment on B's workout stays");
 assert.equal(await n(`select count(*)::int n from mfd_private.backup_20261108_public_mfd_messages where sender='${B}'`),1,"others' rows stay");
 console.log('PASS delete account: only after typing DELETE and only for the signed-in person; diary, social (both directions), AI leftovers and old copies removed; others keep their data; shared catalogue items stay without a name');
})().catch((e)=>{console.error(e);process.exit(1)});
