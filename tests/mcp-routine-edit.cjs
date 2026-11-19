// database/mcp-routine-edit.sql on embedded PostgreSQL (after the production connector script and the later SQL):
// an AI routine takes the type the person uses for each exercise (Chest Press keeps its KG column, Treadmill its km)
// or none, so the app's library decides; start_workout the same; log_workout unchanged. edit_routine renames, changes
// working and warm-up set counts without touching weights or reps, and adds exercises; listed for undo; safe to re-run.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const alice='11111111-1111-4111-8111-111111111111',as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',RES='https://mfd-connect.invalid/mcp';
const ago=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10),T=n=>Date.parse(ago(n)+'T17:00:00Z');
const set=(w,ex,k,tracking,v)=>({id:`${w}-${ex}-${k}`,exercise:ex,group:0,set:k+1,type:'normal',tracking,done:true,...v});
const sessions=[
 ...[10,8,6].map((n,i)=>({id:'s'+i,name:'Upper',date:ago(n),started:T(n),finished:T(n)+3600000,sets:[
  set('s'+i,'Chest Press (Machine)',0,'weight_reps',{kg:40,reps:8}),set('s'+i,'Chest Press (Machine)',1,'weight_reps',{kg:40,reps:8}),
  set('s'+i,'Treadmill',0,'distance_duration',{duration_seconds:600,distance_meters:1500})]})),
 // The most recent workout came from a routine with the wrong type: one bad set doesn't outvote the history.
 {id:'s9',name:'Upper 2',date:ago(1),started:T(1),finished:T(1)+3600000,sets:[set('s9','Chest Press (Machine)',0,'reps',{reps:5})]},
];
const diary={profile:{name:'Alex',cal:2200,protein:130,carbs:260,fat:70,days:3,sex:'male',age:30,height:180,weight:80,target:80,activity:1.55,goal:'Maintain'},
 chat:[],meals:[],sessions,active:null,water:{},mfdSettings:{weightUnit:'kg',defaultRestSec:90},weights:[],checkins:[],folders:[],folderOpen:{},
 routines:[{id:'r1',name:'Push A',folderId:null,exercises:[{name:'Bench Press',sets:3,reps:8,kg:60,rest:90}]},
  {id:'r2',name:'Pull B',folderId:null,exercises:[{name:'Seated Row',sets:2,reps:10,kg:50,rest:90,setDetails:[
   {id:'p1',type:'warmup',kg:30,reps:10},{id:'p2',type:'normal',kg:50,reps:10,tracking:'weight_reps'},{id:'p3',type:'normal',kg:52.5,reps:8,tracking:'weight_reps'}]}]}]};

(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create schema auth;
 create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table auth.refresh_tokens(id bigserial primary key,session_id uuid,user_id varchar(255),revoked boolean);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
 insert into auth.users values('${alice}'); insert into auth.sessions values('${as}','${alice}');
 insert into auth.refresh_tokens(session_id,user_id,revoked) values('${as}','${alice}',false);`);
 await db.exec(readFileSync('database/schema.sql','utf8'));
 await db.exec(readFileSync('database/sync-observability.sql','utf8'));
 await db.exec(readFileSync('database/production/mcp-production.sql','utf8'));
 for(const f of ['mcp-suggest-targets','mcp-start-workout','mcp-recovery','mcp-ai-logging'])await db.exec(readFileSync(`database/${f}.sql`,'utf8'));
 const sql=readFileSync('database/mcp-routine-edit.sql','utf8');await db.exec(sql);await db.exec(sql); // safe to re-run
 await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}', writes_enabled=true;`);
 await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)',[alice,JSON.stringify(diary)]);
 const as_=async(worker)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:alice,session_id:as,...(worker?{client_id:'worker',aud:RES}:{aud:'authenticated'})})]);await db.exec('set role authenticated');};
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as r',[op,JSON.stringify(args)])).rows[0].r;
 const doc=async()=>{await db.exec('reset role');return (await db.query('select payload from public.forma_workspaces where user_id=$1',[alice])).rows[0].payload;};
 const a=args=>({connection:'app-a',...args});
 await as_(false);await rpc('consent',{client_id:'app-a',permissions:['routines','log_workouts'],timezone:'UTC'});
 await as_(true);await assert.rejects(rpc('edit_routine',a({routine:'Push A',new_name:'Push X'})),/Consent required/);
 await as_(false);await rpc('consent',{client_id:'app-a',permissions:['routines','log_workouts','log_routines'],timezone:'UTC'});
 await as_(true);

 // create_routine: the person's own type, whatever numbers the plan has; unknown exercises left to the app.
 await rpc('create_routine',a({name:'Upper 2',exercises:[
  {exercise:'Chest Press (Machine)',sets:[{reps:5},{reps:5}]},{exercise:'treadmill',sets:[{duration_seconds:600}]},{exercise:'Pec Fly',sets:[{reps:12}]}]}));
 let d=await doc(),r=d.routines.find(x=>x.name==='Upper 2');
 assert.deepEqual(r.exercises.map(e=>e.setDetails[0].tracking),['weight_reps','distance_duration',undefined]);
 console.log('PASS create_routine: Chest Press keeps KG and reps, Treadmill keeps km and time (from the person\'s workouts), an unknown exercise is left to the app');

 // start_workout the same; log_workout keeps the columns of the values logged.
 await rpc('start_workout',a({exercises:[{exercise:'Treadmill',sets:[{duration_seconds:900}]},{exercise:'Pec Fly',sets:[{kg:20,reps:12}]}]}));
 d=await doc();assert.deepEqual(d.active.sets.map(s=>s.tracking),['distance_duration',undefined]);
 await rpc('log_workout',a({date:ago(0),exercises:[{exercise:'Treadmill',sets:[{duration_seconds:600}]}]}));
 d=await doc();assert.equal(d.sessions.at(-1).sets[0].tracking,'duration');
 console.log('PASS start_workout uses the person\'s type too; log_workout unchanged');

 // edit_routine: rename (a taken name is refused), set counts, add exercises.
 await assert.rejects(rpc('edit_routine',a({routine:'Nope',new_name:'X'})),/No routine called "Nope"/);
 await assert.rejects(rpc('edit_routine',a({routine:'Push A'})),/Give new_name, add_exercises and\/or sets/);
 await assert.rejects(rpc('edit_routine',a({routine:'Push A',new_name:'pull b'})),/already exists/);
 await assert.rejects(rpc('edit_routine',a({routine:'Push A',sets:[{exercise:'Squat',working_sets:4}]})),/No exercise "Squat"/);
 for(const s of [{exercise:'Bench Press'},{exercise:'Bench Press',working_sets:0},{exercise:'Bench Press',working_sets:21},{exercise:'Bench Press',warmup_sets:11},{exercise:'Bench Press',working_sets:2.5}])
  await assert.rejects(rpc('edit_routine',a({routine:'Push A',sets:[s]})),/working_sets \(1-20\)/);
 await assert.rejects(rpc('edit_routine',a({routine:'Push A',add_exercises:[{exercise:'bench press',sets:[{reps:8}]}]})),/already in routine/);
 assert.equal((await rpc('edit_routine',a({routine:'Push A',new_name:'Push A'}))).unchanged,true,'nothing to change');
 r=await rpc('edit_routine',a({routine:'push a',new_name:'Push Day',request_id:'e-1',sets:[{exercise:'Bench Press',working_sets:5,warmup_sets:2}],
  add_exercises:[{exercise:'Treadmill',rest_seconds:0,sets:[{duration_seconds:600}]}]}));
 assert.deepEqual([r.routine,r.renamed_from,r.sets_changed,r.exercises_added],['Push Day','Push A',[{exercise:'Bench Press',sets:7}],['Treadmill']]);
 assert.equal((await rpc('edit_routine',a({routine:'Push Day',new_name:'Other',request_id:'e-1'}))).duplicate,true,'same request: not applied twice');
 d=await doc();r=d.routines.find(x=>x.id==='r1');
 assert.equal(r.name,'Push Day');
 const bench=r.exercises[0];
 assert.deepEqual(bench.setDetails.map(s=>[s.set,s.type,s.kg??null,s.reps]),[[1,'warmup',null,8],[2,'warmup',null,8],[3,'normal',60,8],[4,'normal',60,8],[5,'normal',60,8],[6,'normal',60,8],[7,'normal',60,8]]);
 assert.equal(bench.sets,7);assert.equal(new Set(bench.setDetails.map(s=>s.id)).size,7,'every new set has its own id');
 assert.deepEqual([r.exercises[1].name,r.exercises[1].rest,r.exercises[1].setDetails[0].tracking],['Treadmill',0,'distance_duration']);
 const ch=d.aiChanges.at(-1);
 assert.deepEqual([ch.kind,ch.routineId,ch.name,ch.renamedFrom,ch.added,ch.addedNames,ch.count,ch.sets[0].index,ch.sets[0].after,ch.sets[0].before.length],
  ['routine_edit','r1','Push Day','Push A',1,['Treadmill'],2,0,7,3]);
 console.log('PASS edit_routine: rename (unique), working and warm-up sets without changing weights or reps, new exercises at the end, repeat-safe, listed for undo');

 // Fewer sets keep the first ones; existing warm-ups and weights stay as they are.
 await rpc('edit_routine',a({routine:'Pull B',sets:[{exercise:'seated row',working_sets:1,warmup_sets:1}]}));
 assert.equal((await rpc('edit_routine',a({routine:'Pull B',sets:[{exercise:'Seated Row',working_sets:1}]}))).unchanged,true);
 r=await rpc('edit_routine',a({routine:'Pull B',sets:[{exercise:'Seated Row',working_sets:3}]}));
 d=await doc();
 assert.deepEqual(d.routines.find(x=>x.id==='r2').exercises[0].setDetails.map(s=>[s.id.length>2?'new':s.id,s.type,s.kg,s.reps]),
  [['p1','warmup',30,10],['p2','normal',50,10],['new','normal',50,10],['new','normal',50,10]]);
 console.log('PASS edit_routine: fewer sets keep the first ones, more copy the last; weights and reps never change');
})().catch(e=>{console.error(e);process.exit(1);});
