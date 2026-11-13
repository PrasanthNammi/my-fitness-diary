// get_recovery and the trimmed get_workouts on embedded PostgreSQL, on top of the production connector script,
// suggest_workout_targets and start_workout: the separate "recovery" consent, audience and connection checks; one
// row per day from the recovery check-ins (measurement-only rows and other users left out, text numbers from older
// entries read), stages with bed and wake time in the person's time zone, averages, range limits; workouts with a
// heart-rate summary instead of the stored series; every other operation unchanged.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bs='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',RES='https://mfd-connect.invalid/mcp';
const night=(day)=>({deep:72,light:250,rem:95,awake:18,start:Date.UTC(2026,9,day-1,22,30),end:Date.UTC(2026,9,day,6,15)});
const diary=name=>({profile:{name,cal:2200,protein:130,carbs:260,fat:70,days:3},chat:[],weights:[{id:'w',date:'2026-10-05',kg:80,source:'health',bodyFat:18}],meals:[],routines:[],active:null,
 checkins:name==='alice'?[
  {id:'c1',date:'2026-10-03',sleep:7.5,steps:9000,energy:4,soreness:2,restingHr:58,hrv:44,sleepStages:night(3),note:'Felt good'},
  {id:'c2',date:'2026-10-04',sleep:'6.5',steps:'4200',restingHr:63,hrv:38,note:''},
  {id:'m',date:'2026-10-04',waist:82,note:''},
  {id:'c3',date:'2026-09-01',sleep:8},
 ]:[{id:'b1',date:'2026-10-03',sleep:5,restingHr:70}],
 sessions:[{id:name+'-s',date:'2026-10-02',name:'Pull',started:1,finished:2,heartRate:{interval:15,bpm:Array(400).fill(120),avg:121,max:166,source:'watch'},
  sets:[{exercise:'Lat Pulldown',kg:50,reps:10,done:true,mfdDoneAt:12345,mfdSuggested:{kg:50}}]},{id:name+'-s2',date:'2026-10-03',name:'Legs',started:3,finished:4,sets:[]}]});
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create schema auth;
 create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table auth.refresh_tokens(id bigserial primary key,session_id uuid,user_id varchar(255),revoked boolean);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
 insert into auth.users values('${alice}'),('${bob}'); insert into auth.sessions values('${as}','${alice}'),('${bs}','${bob}');
 insert into auth.refresh_tokens(session_id,user_id,revoked) values('${as}','${alice}',false),('${bs}','${bob}',false);`);
 await db.exec(readFileSync('database/schema.sql','utf8'));
 await db.exec(readFileSync('database/sync-observability.sql','utf8'));
 await db.exec(readFileSync('database/production/mcp-production.sql','utf8'));
 await db.exec(readFileSync('database/mcp-suggest-targets.sql','utf8'));
 await db.exec(readFileSync('database/mcp-start-workout.sql','utf8'));
 const recoverySql=readFileSync('database/mcp-recovery.sql','utf8');
 await db.exec(recoverySql);await db.exec(recoverySql); // safe to re-run
 await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}';`);
 for(const [u,name] of [[alice,'alice'],[bob,'bob']])await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)',[u,JSON.stringify(diary(name))]);
 async function as_(user,worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:user===alice?as:bs,...(worker?{client_id:'worker',aud:RES}:{aud:'authenticated'})})]);await db.exec('set role authenticated');}
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as r',[op,JSON.stringify(args)])).rows[0].r;
 const a=args=>({connection:'app-a',...args});
 const range={from:'2026-10-01',to:'2026-10-07'};

 // Consent: a connection without "recovery" can't read it; the permission is accepted; audience and connection checked.
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','progress'],timezone:'Europe/Berlin'});
 await as_(alice,true);await assert.rejects(rpc('recovery',a(range)),/Consent required/);
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','progress','recovery'],timezone:'Europe/Berlin'});
 await as_(alice);await assert.rejects(rpc('recovery',a(range)),/Invalid audience/);
 await as_(alice,true);await assert.rejects(rpc('recovery',range),/Connection required/);
 await as_(alice);await assert.rejects(rpc('consent',{client_id:'app-b',permissions:['recovery','everything']}),/check/);
 console.log('PASS get_recovery consent: needs the separate "recovery" permission, the connector audience and a connection');

 // Days: recovery rows only, one per day, text numbers read, stages and local bed/wake time, averages.
 await as_(alice,true);
 const r=await rpc('recovery',a(range));
 assert.deepEqual(r.data.days,[
  {date:'2026-10-03',sleep_hours:7.5,steps:9000,resting_heart_rate_bpm:58,hrv_ms:44,energy_1_to_5:4,soreness_1_to_5:2,note:'Felt good',sleep_stages_minutes:{deep:72,light:250,rem:95,awake:18},bed_time:'00:30',wake_time:'08:15'},
  {date:'2026-10-04',sleep_hours:6.5,steps:4200,resting_heart_rate_bpm:63,hrv_ms:38}]);
 assert.deepEqual(r.data.averages,{days_with_data:2,sleep_hours:7.0,steps:6600,resting_heart_rate_bpm:60.5,hrv_ms:41.0,energy_1_to_5:4.0,soreness_1_to_5:2.0});
 assert.deepEqual([r.data.from,r.data.to],['2026-10-01','2026-10-07']);
 const none=await rpc('recovery',a({from:'2026-08-01',to:'2026-08-10'}));assert.deepEqual([none.data.days,none.data.averages],[[],{days_with_data:0}]);
 const def=await rpc('recovery',a({}));assert.equal(new Date(def.data.to)-new Date(def.data.from),13*864e5,'default: the last 14 days');
 await assert.rejects(rpc('recovery',a({from:'2026-01-01',to:'2026-10-01'})),/At most 92 days/);
 await assert.rejects(rpc('recovery',a({from:'2026-10-05',to:'2026-10-01'})),/on or before/);
 await assert.rejects(rpc('recovery',a({from:'5 Oct'})),/Invalid date range/);
 console.log('PASS get_recovery: one row per day from recovery check-ins, older text numbers, stages with local bed and wake time, averages, 14-day default, 92-day limit');

 // Bob's diary is never read.
 await as_(bob);await rpc('consent',{client_id:'app-a',permissions:['recovery']});
 await as_(bob,true);assert.deepEqual((await rpc('recovery',a(range))).data.days,[{date:'2026-10-03',sleep_hours:5,resting_heart_rate_bpm:70}]);
 console.log('PASS get_recovery reads only the signed-in person\'s diary');

 // Workouts: heart-rate summary instead of the series, no internal set fields; other tools unchanged.
 await as_(alice,true);
 const w=await rpc('workouts',a({}));
 assert.deepEqual(w.data[0].heart_rate,{avg_bpm:121,max_bpm:166,source:'MFD Galaxy Watch app'});assert.equal(w.data[0].heartRate,undefined);
 assert.deepEqual(w.data[0].sets,[{exercise:'Lat Pulldown',kg:50,reps:10,done:true}]);
 assert.equal(w.data[1].heart_rate,undefined);assert.deepEqual(w.data[1].sets,[]);
 assert.ok(JSON.stringify(w).length<2000,'small answer');
 const p=await rpc('progress',a({}));assert.equal(p.data[0].kg,80,'weigh-ins as before');
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['progress','recovery']});
 await as_(alice,true);await assert.rejects(rpc('workouts',a({})),/Consent required/,'workouts still need their own permission');
 console.log('PASS get_workouts: heart-rate summary instead of up to 2,000 readings, no internal fields; consent unchanged');
 await workerChecks();
})().catch(e=>{console.error(e);process.exit(1)});

// The worker lists get_recovery only for a connection allowed to read recovery, and passes it on as "recovery".
async function workerChecks(){
 const esbuild=require('esbuild'),os=require('os'),path=require('path');
 const out=path.join(os.tmpdir(),'mfd-mcp-recovery-worker.cjs');
 esbuild.buildSync({entryPoints:['hosting/worker/mcp.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
 const {serveMcp}=require(out);
 const post=(body)=>new Request('https://connect.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,...body})});
 const calls=[];const call=async(operation,args)=>{calls.push([operation,args]);return new Response(JSON.stringify({today:'2026-10-07',data:{days:[]}}),{headers:{'Content-Type':'application/json'}});};
 const names=async(sections)=>((await (await serveMcp(post({method:'tools/list'}),{origin:'https://connect.invalid',writes:true,sections,call})).json()).result.tools).map(t=>t.name);
 assert.ok((await names(['workouts','recovery'])).includes('get_recovery'));
 assert.ok(!(await names(['workouts','progress'])).includes('get_recovery'),'not without the permission');
 assert.ok(!(await names(undefined)).includes('get_recovery'),'not on the direct path');
 await serveMcp(post({method:'tools/call',params:{name:'get_recovery',arguments:{from:'2026-10-01',to:'2026-10-07'}}}),{origin:'https://connect.invalid',writes:true,sections:['recovery'],call});
 assert.deepEqual(calls.at(-1)?.[0],'recovery');
 console.log('PASS worker: get_recovery listed only with the recovery permission and called as "recovery"');
}
