// database/mcp-routine-folders.sql on embedded PostgreSQL: two folders each with an "Upper 1". The AI tools that act on
// an existing routine (edit_routine, suggest_workout_targets, start_workout, move_routine) take the one in in_folder;
// without in_folder they refuse and name the folders (nothing changed); a name in one place only works as before;
// an unknown folder or a routine not in that folder is refused. Safe to re-run.
const {PGlite}=require('@electric-sql/pglite');
const esbuild=require('esbuild'),os=require('os'),path=require('path');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const alice='11111111-1111-4111-8111-111111111111',as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',RES='https://mfd-connect.invalid/mcp';
const ago=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);
const plan=(name,kg)=>({name,sets:2,reps:8,kg,rest:90});
const diary={profile:{name:'Alex',cal:2200,protein:130,carbs:260,fat:70,days:3,sex:'male',age:30,height:180,weight:80,target:80,activity:1.55,goal:'Maintain'},
 chat:[],meals:[],sessions:[],active:null,water:{},mfdSettings:{weightUnit:'kg',defaultRestSec:90},weights:[],checkins:[],folderOpen:{},
 folders:[{id:'f1',name:'hevy-trainer'},{id:'f2',name:'hevy-trainer-2'}],
 routines:[{id:'r1',name:'Upper 1',folderId:'f1',exercises:[plan('Bench Press',60),plan('Seated Row',50)]},
  {id:'r3',name:'Lower 1',folderId:'f1',exercises:[plan('Squat',80)]},
  {id:'r2',name:'Upper 1',folderId:'f2',exercises:[plan('Incline Press',40)]}]};

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
 for(const f of ['mcp-suggest-targets','mcp-start-workout','mcp-recovery','mcp-ai-logging','mcp-routine-edit'])await db.exec(readFileSync(`database/${f}.sql`,'utf8'));
 const sql=readFileSync('database/mcp-routine-folders.sql','utf8');await db.exec(sql);await db.exec(sql); // safe to re-run
 await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}', writes_enabled=true;`);
 await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)',[alice,JSON.stringify(diary)]);
 const as_=async(worker)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:alice,session_id:as,...(worker?{client_id:'worker',aud:RES}:{aud:'authenticated'})})]);await db.exec('set role authenticated');};
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as r',[op,JSON.stringify(args)])).rows[0].r;
 const doc=async()=>{await db.exec('reset role');const d=(await db.query('select payload from public.forma_workspaces where user_id=$1',[alice])).rows[0].payload;await as_(true);return d;};
 const a=args=>({connection:'app-a',...args});
 const byId=(d,id)=>d.routines.find(r=>r.id===id);
 await as_(false);await rpc('consent',{client_id:'app-a',permissions:['routines','log_workouts','log_routines'],timezone:'UTC'});
 await as_(true);

 // edit_routine: refused without in_folder (both folders named), then the one in hevy-trainer-2.
 const before=await doc();
 await assert.rejects(rpc('edit_routine',a({routine:'Upper 1',add_exercises:[{exercise:'Lat Pulldown',sets:[{kg:50,reps:10}]}]})),
  /There are 2 routines called "Upper 1" \(in folder "hevy-trainer", in folder "hevy-trainer-2"\)/);
 assert.deepEqual((await doc()).routines,before.routines,'nothing changed');
 await rpc('edit_routine',a({routine:'upper 1',in_folder:'Hevy-Trainer-2',add_exercises:[{exercise:'Lat Pulldown',sets:[{kg:50,reps:10}]}]}));
 let d=await doc();
 assert.deepEqual(byId(d,'r2').exercises.map(e=>e.name),['Incline Press','Lat Pulldown'],'added to the second folder\'s Upper 1');
 assert.deepEqual(byId(d,'r1'),before.routines[0],'the first folder\'s Upper 1 untouched');
 // A name in one place only: as before, with or without in_folder.
 await rpc('edit_routine',a({routine:'Lower 1',sets:[{exercise:'Squat',working_sets:3}]}));
 d=await doc();assert.equal(byId(d,'r3').exercises[0].sets,3);
 await rpc('edit_routine',a({routine:'Lower 1',in_folder:'hevy-trainer',new_name:'Lower A'}));
 d=await doc();assert.equal(byId(d,'r3').name,'Lower A');
 // Wrong folder or a routine not in it: refused.
 await assert.rejects(rpc('edit_routine',a({routine:'Upper 1',in_folder:'nope',new_name:'X'})),/No folder called "nope"/);
 await assert.rejects(rpc('edit_routine',a({routine:'Lower A',in_folder:'hevy-trainer-2',new_name:'X'})),/No routine called "Lower A" in folder "hevy-trainer-2"/);
 await assert.rejects(rpc('edit_routine',a({routine:'Nothing',new_name:'X'})),/No routine called "Nothing"/);
 console.log('PASS edit_routine: same name in two folders refused without in_folder (folders named, nothing changed), the right one with it; single names as before; wrong folder refused');

 // suggest_workout_targets and start_workout.
 const ex=[{exercise:'Incline Press',sets:[{kg:42.5,reps:8}]}];
 await assert.rejects(rpc('suggest_workout_targets',a({routine:'Upper 1',exercises:ex})),/There are 2 routines called "Upper 1"/);
 const s=await rpc('suggest_workout_targets',a({routine:'Upper 1',in_folder:'hevy-trainer-2',exercises:ex}));
 d=await doc();assert.equal(d.aiSuggestions.find(x=>x.id===s.id).routineId,'r2');
 await assert.rejects(rpc('start_workout',a({routine:'Upper 1'})),/There are 2 routines called "Upper 1"/);
 await rpc('start_workout',a({routine:'Upper 1',in_folder:'hevy-trainer-2'}));
 d=await doc();assert.deepEqual([...new Set(d.active.sets.map(x=>x.exercise))],['Incline Press','Lat Pulldown'],'the second folder\'s plan started');
 console.log('PASS suggest_workout_targets and start_workout take the routine in in_folder; refused without it when the name repeats');

 // move_routine: in_folder is where it is now, folder where it goes.
 await assert.rejects(rpc('move_routine',a({routine:'Upper 1',folder:'hevy-trainer'})),/There are 2 routines called "Upper 1"/);
 await rpc('move_routine',a({routine:'Upper 1',in_folder:'hevy-trainer',folder:'hevy-trainer-2'}));
 d=await doc();assert.equal(byId(d,'r1').folderId,'f2');assert.equal(byId(d,'r2').folderId,'f2');
 console.log('PASS move_routine: in_folder picks the routine to move');

 // The connector accepts in_folder on the four tools and passes it on.
 const out=path.join(os.tmpdir(),'mfd-mcp-routine-folders-worker.cjs');
 esbuild.buildSync({entryPoints:['hosting/worker/mcp.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
 const {serveMcp}=require(out);
 const post=(body)=>new Request('https://connect.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,...body})});
 const calls=[];const call=async(operation,args)=>{calls.push([operation,args]);return new Response('{}',{headers:{'Content-Type':'application/json'}});};
 const tool=async(name,args)=>(await (await serveMcp(post({method:'tools/call',params:{name,arguments:args}}),{origin:'https://connect.invalid',writes:false,sections:['routines','log_routines'],call})).json());
 for(const [name,args] of [['edit_routine',{routine:'Upper 1',new_name:'U'}],['suggest_workout_targets',{routine:'Upper 1',exercises:ex}],['start_workout',{routine:'Upper 1'}],['move_routine',{routine:'Upper 1',folder:'x'}]]){
  const r=await tool(name,{...args,in_folder:'hevy-trainer-2'});assert.ok(!r.error,name+' '+JSON.stringify(r));assert.equal(calls.at(-1)[1].in_folder,'hevy-trainer-2',name);
 }
 assert.match((await tool('edit_routine',{routine:'Upper 1',new_name:'U',in_folder:'x'.repeat(81)})).error.message,/Invalid arguments.in_folder/);
 console.log('PASS connector: edit_routine, suggest_workout_targets, start_workout and move_routine accept in_folder and pass it on');
})().catch(e=>{console.error(e);process.exit(1);});
