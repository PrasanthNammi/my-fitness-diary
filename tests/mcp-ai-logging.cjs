// More AI logging on embedded PostgreSQL, on top of the production connector script and the later connector SQL:
// log_water, log_measurements, routine folders (create_routine with a folder, move_routine, folder names in
// get_routines) and change_settings (separate "log_settings" consent, two steps with a confirm token, safe limits,
// targets that match the app's own calculation), each listed in "aiChanges" for undo in the app.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const esbuild=require('esbuild'),os=require('os'),path=require('path'),fs=require('fs');
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bs='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',RES='https://mfd-connect.invalid/mcp';
const today=new Date().toISOString().slice(0,10),ago=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);
const diary=name=>({profile:{name,cal:2200,protein:130,carbs:260,fat:70,days:3,sex:'male',age:30,height:180,weight:80,target:80,activity:1.55,goal:'Maintain'},
 chat:[],meals:[],sessions:[],active:null,water:{[ago(5)]:500},mfdSettings:{weightUnit:'kg',defaultRestSec:90},
 weights:[{id:'w1',date:ago(10),kg:82},{id:'w2',date:ago(2),kg:80}],
 checkins:[{id:'c1',date:ago(6),waist:84,note:''},{id:'c2',date:ago(6),sleep:7}],
 folders:[{id:'f1',name:'Push Pull Legs'}],folderOpen:{f1:true},
 routines:[{id:'r1',name:'Push A',folderId:null,exercises:[{name:'Bench Press',sets:3,reps:8,kg:60,rest:90}]},{id:'r2',name:'Legs',folderId:'f1',exercises:[]}]});

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
 for(const f of ['mcp-suggest-targets','mcp-start-workout','mcp-recovery'])await db.exec(readFileSync(`database/${f}.sql`,'utf8'));
 const sql=readFileSync('database/mcp-ai-logging.sql','utf8');await db.exec(sql);await db.exec(sql); // safe to re-run
 await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}';`);
 for(const [u,name] of [[alice,'alice'],[bob,'bob']])await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)',[u,JSON.stringify(diary(name))]);
 async function as_(user,worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:user===alice?as:bs,...(worker?{client_id:'worker',aud:RES}:{aud:'authenticated'})})]);await db.exec('set role authenticated');}
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as r',[op,JSON.stringify(args)])).rows[0].r;
 const doc=async(u=alice)=>{await db.exec('reset role');return (await db.query('select payload from public.forma_workspaces where user_id=$1',[u])).rows[0].payload;};
 const a=args=>({connection:'app-a',...args});

 // Consent: water needs "log_nutrition", measurements "log_progress", folders "log_routines", settings the new "log_settings".
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['progress'],timezone:'UTC'});
 await as_(alice,true);
 await assert.rejects(rpc('log_water',a({date:today,ml:250})),/Consent required/);
 await assert.rejects(rpc('log_measurements',a({date:today,waist_cm:80})),/Consent required/);
 await assert.rejects(rpc('move_routine',a({routine:'Push A',folder:'Push Pull Legs'})),/Consent required/);
 await assert.rejects(rpc('change_settings',a({goal:'lose'})),/Consent required/);
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['routines','log_nutrition','log_progress','log_routines','log_settings'],timezone:'UTC'});
 await as_(alice);await assert.rejects(rpc('log_water',a({date:today,ml:250})),/Invalid audience/);
 await as_(alice,true);await assert.rejects(rpc('log_water',{date:today,ml:250}),/Connection required/);
 console.log('PASS consent: water, measurements, folders and settings each need their permission, the connector audience and a connection');

 // Water: added to the day, limits, older days only when empty, repeat-safe, listed for undo.
 await as_(alice,true);
 let r=await rpc('log_water',a({date:today,ml:500,request_id:'w-1'}));assert.equal(r.day_total_ml,500);
 r=await rpc('log_water',a({date:today,ml:250}));assert.equal(r.day_total_ml,750);
 assert.equal((await rpc('log_water',a({date:today,ml:500,request_id:'w-1'}))).duplicate,true,'same request: not added twice');
 for(const ml of [20,6000,250.5])await assert.rejects(rpc('log_water',a({date:today,ml})),/ml must be/);
 await assert.rejects(rpc('log_water',a({date:ago(-1),ml:250})),/future/);
 await assert.rejects(rpc('log_water',a({date:ago(5),ml:250})),/already logged/);
 r=await rpc('log_water',a({date:ago(4),ml:300}));assert.equal(r.day_total_ml,300,'an empty older day');
 for(let i=0;i<2;i++)await rpc('log_water',a({date:ago(1),ml:5000}));
 await assert.rejects(rpc('log_water',a({date:ago(1),ml:50})),/at most 10,000 ml/);
 let d=await doc();assert.equal(d.water[today],750);assert.equal(d.water[ago(5)],500,'other days untouched');
 assert.deepEqual(d.aiChanges.filter(c=>c.kind==='water').map(c=>c.ml),[500,250,300,5000,5000]);
 assert.equal(d.aiChanges[0].addedBy.connection,'app-a');assert.equal(d.aiChanges[0].addedBy.request,'w-1');
 console.log('PASS log_water: adds to the day, 50-5000 ml, 10 L a day, no future, older days only when empty, repeat-safe, listed for undo');

 // Measurements: a new dated row like the app's, limits, older days only when empty.
 await as_(alice,true);
 r=await rpc('log_measurements',a({date:today,waist_cm:81.25,arms_cm:36}));
 d=await doc();const m=d.checkins.find(c=>c.id===r.id);
 assert.deepEqual({...m,addedBy:undefined},{id:r.id,date:today,note:'',waist:81.3,arms:36,addedBy:undefined});assert.equal(m.addedBy.connection,'app-a');
 await assert.rejects(rpc('log_measurements',a({date:today})),/at least one/);
 await assert.rejects(rpc('log_measurements',a({date:today,waist_cm:300})),/waist_cm must be from 40 to 200/);
 await assert.rejects(rpc('log_measurements',a({date:ago(6),chest_cm:100})),/already have measurements/);
 r=await rpc('log_measurements',a({date:ago(7),chest_cm:100}));assert.ok(r.id);
 d=await doc();assert.deepEqual(d.checkins.map(c=>c.date),[...d.checkins.map(c=>c.date)].sort(),'kept in date order');
 console.log('PASS log_measurements: a new dated row (cm), at least one value, sane limits, older days only when empty');

 // Folders: get_routines names them; a missing folder needs the user's yes; created and filed; moving.
 await as_(alice,true);
 const list=await rpc('routines',a({}));
 assert.deepEqual(list.folders,['Push Pull Legs']);assert.equal(list.data.find(x=>x.name==='Legs').folder,'Push Pull Legs');assert.equal(list.data.find(x=>x.name==='Push A').folder,null);
 const plan={name:'Upper',exercises:[{exercise:'Row',sets:[{kg:50,reps:10}]}]};
 await assert.rejects(rpc('create_routine',a({...plan,folder:'Upper Lower'})),/no folder called "Upper Lower" \(folders: "Push Pull Legs"\)\. Ask the user/);
 d=await doc();assert.ok(!d.routines.some(x=>x.name==='Upper'),'nothing added without the folder');
 r=await rpc('create_routine',a({...plan,folder:'Upper Lower',create_folder:true}));
 d=await doc();const fid=d.folders.find(f=>f.name==='Upper Lower').id;
 assert.equal(d.routines.find(x=>x.name==='Upper').folderId,fid);assert.equal(d.folderOpen[fid],true);assert.equal(r.folder_created,true);
 assert.equal(d.aiChanges.at(-1).kind,'folder');
 r=await rpc('create_routine',a({...plan,name:'Upper 2',folder:'push pull legs'}));
 d=await doc();assert.equal(d.routines.find(x=>x.name==='Upper 2').folderId,'f1','existing folder, any case');assert.equal(d.folders.length,2);
 r=await rpc('move_routine',a({routine:'push a',folder:'Push Pull Legs'}));
 d=await doc();assert.equal(d.routines.find(x=>x.id==='r1').folderId,'f1');
 assert.deepEqual((({kind,routineId,from,to})=>({kind,routineId,from,to}))(d.aiChanges.at(-1)),{kind:'move',routineId:'r1',from:undefined,to:'f1'});
 assert.equal((await rpc('move_routine',a({routine:'Push A',folder:'Push Pull Legs'}))).unchanged,true);
 await assert.rejects(rpc('move_routine',a({routine:'Nope',folder:'Push Pull Legs'})),/No routine called "Nope"/);
 await assert.rejects(rpc('move_routine',a({routine:'Legs',folder:'Arms'})),/no folder called "Arms"/);
 r=await rpc('move_routine',a({routine:'Legs',folder:'Arms',create_folder:true}));assert.equal(r.folder_created,true);
 d=await doc();assert.equal(d.aiChanges.at(-1).createdFolder,d.folders.find(f=>f.name==='Arms').id);
 console.log('PASS folders: get_routines names them; a missing folder needs create_folder after the user agrees; create_routine files it; move_routine moves');

 // Settings: two steps, the same values, once, within the limits; targets follow like the app's.
 await as_(alice,true);
 const before=await doc();
 const p1=await rpc('change_settings',a({goal:'lose',activity:'very',default_rest_seconds:120,weight_unit:'kg'}));
 assert.equal(p1.saved,false);assert.ok(p1.confirm_token);
 assert.deepEqual(p1.changes,{goal:{from:'maintain',to:'lose'},activity:{from:'moderate',to:'very'},default_rest_seconds:{from:90,to:120}},'only real changes');
 assert.ok(p1.daily_targets.to.kcal<p1.daily_targets.from.kcal);
 assert.deepEqual(await doc(),before,'step 1 saves nothing');
 await assert.rejects(rpc('change_settings',a({goal:'lose',activity:'extra',default_rest_seconds:120,weight_unit:'kg',confirm_token:p1.confirm_token})),/differ from what the user confirmed/);
 const p2=await rpc('change_settings',a({goal:'lose',activity:'very',default_rest_seconds:120,weight_unit:'kg'}));
 await assert.rejects(rpc('change_settings',a({goal:'lose',activity:'very',default_rest_seconds:120,weight_unit:'kg',confirm_token:p1.confirm_token})),/expired or was already used/,'a newer preview replaces the older token');
 r=await rpc('change_settings',a({goal:'lose',activity:'very',default_rest_seconds:120,weight_unit:'kg',confirm_token:p2.confirm_token}));
 assert.equal(r.saved,true);
 d=await doc();assert.equal(d.profile.goal,'Fat loss');assert.equal(d.profile.activity,1.725);assert.equal(d.mfdSettings.defaultRestSec,120);
 assert.equal(d.profile.cal,r.daily_targets.kcal);assert.equal(d.profile.protein,r.daily_targets.protein_g);
 assert.equal(d.aiChanges.at(-1).kind,'settings');assert.deepEqual(d.aiChanges.at(-1).changes,p2.changes);
 assert.equal((await rpc('change_settings',a({goal:'lose',activity:'very',default_rest_seconds:120,weight_unit:'kg',confirm_token:p2.confirm_token}))).unchanged,true,'sent again: nothing more happens');
 const p4=await rpc('change_settings',a({training_days:4}));await rpc('change_settings',a({training_days:4,confirm_token:p4.confirm_token}));
 await assert.rejects(rpc('change_settings',a({training_days:5,confirm_token:p4.confirm_token})),/already used|differ/,'a token works once');
 // Limits.
 await assert.rejects(rpc('change_settings',a({target_weight_kg:55})),/within 25% of the current weight \(80 kg\)/);
 await assert.rejects(rpc('change_settings',a({target_weight_kg:61,height_cm:190})),/below a healthy minimum for 190 cm/);
 for(const bad of [{age:5},{training_days:9},{water_goal_ml:200},{default_rest_seconds:5},{goal:'bulk'},{energy_unit:'cal'},{height_cm:300}])
  await assert.rejects(rpc('change_settings',a(bad)),/Invalid/);
 await assert.rejects(rpc('change_settings',a({})),/Nothing to change/);
 assert.equal((await rpc('change_settings',a({goal:'lose'}))).unchanged,true);
 await assert.rejects(rpc('change_settings',a({goal:'gain',confirm_token:'00000000-0000-4000-8000-000000000000'})),/expired or was already used/);
 // Another app can't use this app's token.
 await as_(alice);await rpc('consent',{client_id:'app-b',permissions:['log_settings'],timezone:'UTC'});
 await as_(alice,true);const p3=await rpc('change_settings',a({water_goal_ml:3000}));
 await assert.rejects(rpc('change_settings',{connection:'app-b',water_goal_ml:3000,confirm_token:p3.confirm_token}),/expired or was already used/);
 console.log('PASS change_settings: preview first, saves only the confirmed values once, safe limits, targets stored, listed for undo');

 // The SQL targets equal the app's calculateTargets for many profiles.
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-tg-'));esbuild.buildSync({entryPoints:['frontend/domain/nutrition.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'n.cjs'),logLevel:'silent'});
 const N=require(path.join(dir,'n.cjs'));fs.rmSync(dir,{recursive:true,force:true});
 await db.exec('reset role');
 let checked=0;
 for(const sex of ['male','female'])for(const activity of ['sedentary','light','moderate','very','extra'])for(const goal of ['lose','maintain','gain','recomp'])for(const [kg,cm,age] of [[48,155,19],[68,175,26],[93.4,188,41],[120,170,63]]){
  const js=N.calculateTargets({sex,weightKg:kg,heightCm:cm,age,activity,goal,name:'',targetWeightKg:kg,trainingDaysPerWeek:3}).targets;
  const s=(await db.query('select mfd_mcp.targets($1,$2,$3,$4,$5,$6) t',[sex,kg,cm,age,activity,goal])).rows[0].t;
  assert.deepEqual([s.kcal,s.protein_g,s.carbs_g,s.fat_g].map(Number),[js.kcal,js.protein,js.carbs,js.fat],`${sex} ${activity} ${goal} ${kg}`);checked++;
 }
 console.log(`PASS daily targets: SQL matches the app's calculation for ${checked} profiles`);

 // Bob's diary is never touched.
 const bobDoc=await doc(bob);assert.equal(bobDoc.aiChanges,undefined);assert.equal(bobDoc.water[today],undefined);
 console.log('PASS other people\'s diaries are untouched');
 await workerChecks();
})().catch(e=>{console.error(e);process.exit(1)});

// The worker lists each new tool only with its permission, checks arguments, and passes them on by name.
async function workerChecks(){
 const out=path.join(os.tmpdir(),'mfd-mcp-ai-logging-worker.cjs');
 esbuild.buildSync({entryPoints:['hosting/worker/mcp.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
 const {serveMcp,PERMISSIONS}=require(out);
 assert.ok(PERMISSIONS.includes('log_settings'));
 const post=(body)=>new Request('https://connect.invalid/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,...body})});
 const calls=[];const call=async(operation,args)=>{calls.push([operation,args]);return new Response('{}',{headers:{'Content-Type':'application/json'}});};
 const names=async(sections)=>((await (await serveMcp(post({method:'tools/list'}),{origin:'https://connect.invalid',writes:false,sections,call})).json()).result.tools).map(t=>t.name);
 assert.deepEqual((await names(['log_nutrition','log_progress','log_routines'])).filter(n=>['log_water','log_measurements','move_routine','change_settings'].includes(n)),['log_water','log_measurements','move_routine']);
 assert.ok((await names(['log_settings'])).includes('change_settings'));assert.ok(!(await names(['profile','log_progress'])).includes('change_settings'));
 const tool=async(name,args,sections)=>(await (await serveMcp(post({method:'tools/call',params:{name,arguments:args}}),{origin:'https://connect.invalid',writes:false,sections,call})).json());
 assert.match((await tool('log_water',{date:'2026-10-07',ml:9000},['log_nutrition'])).error.message,/Invalid arguments.ml/);
 assert.match((await tool('change_settings',{goal:'lose',password:'x'},['log_settings'])).error.message,/Unknown argument/);
 await tool('change_settings',{goal:'lose'},['log_settings']);assert.deepEqual(calls.at(-1),['change_settings',{goal:'lose'}]);
 const cr=await tool('create_routine',{name:'X',folder:'Arms',create_folder:true,exercises:[{exercise:'Curl',sets:[{reps:10}]}]},['log_routines']);assert.ok(!cr.error,JSON.stringify(cr));assert.equal(calls.at(-1)[1].folder,'Arms');
 console.log('PASS worker: each new tool listed only with its permission, unknown arguments refused, passed on by name');
}
