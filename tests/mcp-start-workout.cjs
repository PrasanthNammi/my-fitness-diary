// start_workout on embedded PostgreSQL, on top of the production connector script and suggest_workout_targets:
// consent ("log_routines"), audience and connection checks; either a routine (exact name, case-insensitive) or
// 1-30 validated exercises; catalogue ids linked from routines/past workouts; planned values not ticked; never
// replaces a running workout; idempotent request_id; shared daily limit; writes switch; other users and the rest
// of the diary untouched; every other operation still goes through mfd_mcp.dispatch.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bs='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',RES='https://mfd-connect.invalid/mcp';
const diary=name=>({profile:{name,cal:2200,protein:130,carbs:260,fat:70,days:3},checkins:[],chat:[],weights:[],meals:[{id:name+'-m',date:'2026-10-01',cal:500,p:30,c:50,f:10}],active:null,
 routines:[{id:name+'-r1',name:'Upper 1',exercises:[{name:'Bench Press',catalogId:'bench_press',sets:2,reps:8,kg:60,rest:120,setDetails:[{exercise:'Bench Press',type:'warmup',kg:30,reps:10,tracking:'weight_reps'},{exercise:'Bench Press',type:'normal',kg:60,reps:8,tracking:'weight_reps'}]},{name:'Plank',sets:2,reps:0,kg:0,rest:60}]},{id:name+'-r2',name:'Empty',exercises:[]}],
 sessions:[{id:name+'-s',date:'2026-10-02',name:'Pull',started:1,finished:2,sets:[{exercise:'Lat Pulldown',catalogId:'lat_pulldown',tracking:'weight_reps',kg:50,reps:10,done:true}]}]});
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
 const startSql=readFileSync('database/mcp-start-workout.sql','utf8');
 await db.exec(startSql);await db.exec(startSql); // safe to re-run
 await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}';`);
 for(const [u,name] of [[alice,'alice'],[bob,'bob']])await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)',[u,JSON.stringify(diary(name))]);
 async function as_(user,worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:user===alice?as:bs,...(worker?{client_id:'worker',aud:RES}:{aud:'authenticated'})})]);await db.exec('set role authenticated');}
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as r',[op,JSON.stringify(args)])).rows[0].r;
 const sql=async q=>{await db.exec('reset role');return (await db.query(q)).rows;};
 const doc=async u=>(await sql(`select payload,revision from public.forma_workspaces where user_id='${u}'`))[0];
 const clear=async u=>sql(`update public.forma_workspaces set payload=jsonb_set(payload,'{active}','null') where user_id='${u}'`);
 const a=args=>({connection:'app-a',...args});
 const good={name:'Push (AI)',exercises:[{exercise:'Bench Press',rest_seconds:120,sets:[{type:'warmup',kg:40,reps:10},{kg:62.5,reps:8},{kg:62.5,reps:8}]},{exercise:'lat pulldown',sets:[{kg:55,reps:10}]},{exercise:'Plank',sets:[{duration_seconds:60}]},{exercise:'Burpee',sets:[{reps:15}]}]};

 // Consent and access.
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','routines','log_workouts']});
 await as_(alice,true);await assert.rejects(rpc('start_workout',a(good)),/Consent required/);
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','routines','log_workouts','log_routines']});
 await sql('update mfd_mcp.settings set writes_enabled=false');await as_(alice,true);await assert.rejects(rpc('start_workout',a(good)),/turned off/);await sql('update mfd_mcp.settings set writes_enabled=true');
 await as_(alice);await assert.rejects(rpc('start_workout',a(good)),/Invalid audience/);
 await as_(alice,true);await assert.rejects(rpc('start_workout',{...good}),/Connection required/);

 // Exercises: active workout created, planned values not ticked, catalogue ids linked, nothing else changes.
 const before=await doc(alice);
 const r=await rpc('start_workout',a({...good,request_id:'w-1'}));
 assert.equal(r.name,'Push (AI)');assert.equal(r.exercises,4);assert.equal(r.revision,Number(before.revision)+1);
 const after=await doc(alice),act=after.payload.active;
 assert.equal(act.name,'Push (AI)');assert.equal(act.unplanned,true);assert.ok(!('routineId' in act));assert.ok(Math.abs(act.started-Date.now())<60000,'started now');
 assert.equal(act.sets.length,6);assert.ok(act.sets.every(s=>s.done===false),'nothing ticked');
 assert.deepEqual(act.sets.map(s=>[s.exercise,s.group,s.set,s.type,s.kg??null,s.reps??null,s.duration_seconds??null,s.tracking??null,s.catalogId??null]),[
  ['Bench Press',0,1,'warmup',40,10,null,'weight_reps','bench_press'],['Bench Press',0,2,'normal',62.5,8,null,'weight_reps','bench_press'],['Bench Press',0,3,'normal',62.5,8,null,'weight_reps','bench_press'],
  ['lat pulldown',1,1,'normal',55,10,null,'weight_reps','lat_pulldown'],['Plank',2,1,'normal',null,null,60,'duration',null],['Burpee',3,1,'normal',null,15,null,null,null]],'sets, groups, tracking and catalogue links (reps only, unknown: type left to the app catalogue)');
 // Reps-only plan for an exercise the user already tracks with weight: keeps weight × reps (from history).
 await clear(alice);await as_(alice,true);
 await rpc('start_workout',a({exercises:[{exercise:'Lat Pulldown',sets:[{reps:12}]},{exercise:'Goblet Squat',sets:[{reps:10}]}]}));
 const rp=(await doc(alice)).payload.active.sets;
 assert.deepEqual(rp.map(s=>[s.exercise,s.tracking??null,s.catalogId??null,s.kg??null,s.reps]),[['Lat Pulldown','weight_reps','lat_pulldown',null,12],['Goblet Squat',null,null,null,10]],'history type reused; unknown left to the app');
 await sql(`update public.forma_workspaces set payload=jsonb_set(payload,'{active}','${JSON.stringify(act).replace(/'/g,"''")}'::jsonb) where user_id='${alice}'`);await as_(alice,true);
 assert.deepEqual(act.rest,{0:{duration:120,end:0},1:{duration:90,end:0},2:{duration:90,end:0},3:{duration:90,end:0}});
 assert.equal(act.addedBy.connection,'app-a');assert.equal(act.addedBy.request,'w-1');
 for(const k of ['routines','sessions','meals','profile','weights'])assert.deepEqual(after.payload[k],before.payload[k],k+' untouched');
 assert.equal((await doc(bob)).payload.active,null,'other user untouched');

 // Same request again: no second workout. A different request while one is running: refused, the running one kept.
 assert.equal((await rpc('start_workout',a({...good,request_id:'w-1'}))).duplicate,true);
 await assert.rejects(rpc('start_workout',a({...good,request_id:'w-2'})),/already in progress \("Push \(AI\)"\)/);
 assert.deepEqual((await doc(alice)).payload.active,act,'running workout unchanged');
 // The user ticks a set in the app; the AI still can't replace it.
 await sql(`update public.forma_workspaces set payload=jsonb_set(payload,'{active,sets,1,done}','true') where user_id='${alice}'`);
 await as_(alice,true);await assert.rejects(rpc('start_workout',a({routine:'Upper 1'})),/already in progress/);assert.equal((await doc(alice)).payload.active.sets[1].done,true);

 // Routine by name: its own planned sets (setDetails, or the summary for older routines), rest and link.
 await clear(alice);await as_(alice,true);
 const rr=await rpc('start_workout',a({routine:'upper 1'}));assert.equal(rr.routine,'Upper 1');assert.equal(rr.name,'Upper 1');
 const ra=(await doc(alice)).payload.active;assert.equal(ra.routineId,'alice-r1');assert.equal(ra.unplanned,false);
 assert.deepEqual(ra.sets.map(s=>[s.exercise,s.group,s.set,s.type,s.kg,s.reps,s.done]),[['Bench Press',0,1,'warmup',30,10,false],['Bench Press',0,2,'normal',60,8,false],['Plank',1,1,'normal',0,0,false],['Plank',1,2,'normal',0,0,false]]);
 assert.equal(ra.sets[0].catalogId,'bench_press');assert.deepEqual(ra.rest,{0:{duration:120,end:0},1:{duration:60,end:0}});
 await clear(alice);await as_(alice,true);
 assert.equal((await rpc('start_workout',a({routine:'Upper 1',name:'Upper 1 – heavy'}))).name,'Upper 1 – heavy','custom name for a routine workout');

 // Validation.
 await clear(alice);await as_(alice,true);
 for(const [bad,msg] of [[{},/either a routine name or a list/],[{routine:'Upper 1',exercises:good.exercises},/either a routine name or a list/],[{routine:'Nope'},/Routine "Nope" not found/],[{routine:'Empty'},/has no exercises/],
  [{exercises:[]},/1-30 exercises/],[{exercises:Array(31).fill(good.exercises[0])},/1-30 exercises/],[{exercises:[{exercise:'',sets:[{reps:5}]}]},/Invalid exercise 1/],
  [{exercises:[{exercise:'X',sets:[]}]},/Invalid exercise 1/],[{exercises:[{exercise:'X',rest_seconds:901,sets:[{reps:5}]}]},/Invalid exercise 1/],[{exercises:[{exercise:'X',sets:[{}]}]},/Invalid set 1 of exercise 1/],
  [{exercises:[{exercise:'X',sets:[{kg:-1,reps:5}]}]},/Invalid set/],[{exercises:[{exercise:'X',sets:[{reps:5.5}]}]},/Invalid set/],[{exercises:[{exercise:'X',sets:[{reps:5,type:'giant'}]}]},/Invalid set/],
  [{exercises:[{exercise:'X',sets:[{kg:'heavy',reps:5}]}]},/Invalid set/],[{name:'x'.repeat(81),exercises:good.exercises},/Invalid workout name/],[{request_id:'bad id!',exercises:good.exercises},/Invalid request_id/]])
  await assert.rejects(rpc('start_workout',a(bad)),msg,JSON.stringify(bad).slice(0,60));
 assert.equal((await doc(alice)).payload.active,null,'nothing written by refused calls');

 // Shared daily limit of 30 entries per app (counts with other adds today).
 await sql(`update mfd_mcp.write_counts set n=30 where user_id='${alice}'`);await as_(alice,true);
 await assert.rejects(rpc('start_workout',a({routine:'Upper 1'})),/Daily limit/);assert.equal((await doc(alice)).payload.active,null);
 // Other operations still route to the dispatcher.
 await as_(alice,true);assert.equal((await rpc('routines',a({}))).data.length,2,'reads still go through dispatch');
 console.log('PASS start_workout: consent/audience/connection, exercises or routine (one of them), validated sets, catalogue links, faded plan (nothing ticked), never replaces a running workout, idempotent request_id, daily limit, writes switch, rest of the diary and other users untouched, dispatch unchanged');
})().catch(e=>{console.error(e);process.exit(1)});
