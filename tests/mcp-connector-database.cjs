// Connector migration on embedded PostgreSQL: per-app consent, analysis results, add-only writes.
// Synthetic Supabase auth fixtures only; no network or hosted database.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bs='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',RES='https://mfd-connect.invalid/mcp';
const day=d=>`2026-10-${String(d).padStart(2,'0')}`;
const diary=(name,n)=>({profile:{name,cal:2200,protein:130,carbs:260,fat:70,days:3},routines:[],checkins:[],chat:[],
 sessions:Array.from({length:30},(_,i)=>({id:`${name}-s${i}`,date:day(i+1),name:'Push',started:Date.UTC(2026,9,i+1,17),finished:Date.UTC(2026,9,i+1,18),
  sets:[{exercise:'Bench Press',type:'warmup',kg:40,reps:10},...[1,2,3].map(()=>({exercise:'Bench Press',type:'normal',kg:60+i,reps:5,done:true})),...(i%2?[1,2,3].map(()=>({exercise:'Dips',reps:10})):[])]})),
 meals:Array.from({length:12},(_,i)=>({id:`${name}-m${i}`,date:day(Math.floor(i/2)+1),cal:i%2?600:400,p:i%2?40:30,c:50,f:10})),
 weights:Array.from({length:8},(_,i)=>({id:`${name}-w${i}`,date:day(i*3+1),kg:70+n-i*0.5})),keep:{me:true}});
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin; create schema auth;
 create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table auth.refresh_tokens(id bigserial primary key,session_id uuid,user_id varchar(255),revoked boolean);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
 insert into auth.users values('${alice}'),('${bob}'); insert into auth.sessions values('${as}','${alice}'),('${bs}','${bob}');
 insert into auth.refresh_tokens(session_id,user_id,revoked) values('${as}','${alice}',false),('${bs}','${bob}',false);`);
 await db.exec(readFileSync('database/schema.sql','utf8'));
 await db.exec(readFileSync('database/mcp.sql','utf8'));
 await db.exec(readFileSync('database/mcp-connector-proxy.sql','utf8'));
 await db.exec(readFileSync('database/mcp-connector-v2.sql','utf8'));
 await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}';`);
 for(const [u,name,n] of [[alice,'alice',1],[bob,'bob',2]])await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)',[u,JSON.stringify(diary(name,n))]);
 // Browser session (no client_id) grants sections; the Worker's token (client 'worker') reads/writes for one connection.
 async function as_(user,worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:user===alice?as:bs,...(worker?{client_id:'worker',aud:RES}:{aud:'authenticated'})})]);await db.exec('set role authenticated');}
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as r',[op,JSON.stringify(args)])).rows[0].r;
 const sql=async q=>{await db.exec('reset role');const r=(await db.query(q)).rows;return r;};
 // Dates relative to the connection's "today" (UTC by default), so the test runs on any day.
 const {t:T,y:Y,tm:TM,t2:T2,t3:T3}=(await sql("select d::text t,(d-1)::text y,(d+1)::text tm,(d+2)::text t2,(d+3)::text t3 from (select (now() at time zone 'UTC')::date d) x"))[0];
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','nutrition','progress','log_workouts','log_progress']});
 await rpc('consent',{client_id:'https://chatgpt.invalid/client.json',permissions:['profile']});
 await assert.rejects(rpc('consent',{client_id:'app-a',permissions:['admin']}));
 await assert.rejects(rpc('consent',{client_id:'has space',permissions:['workouts']}));
 await as_(bob);await rpc('consent',{client_id:'app-a',permissions:['workouts']});
 // Connection binding: sections are per app and per user.
 await as_(alice,true);const a=args=>({connection:'app-a',...args});
 await assert.rejects(rpc('workouts',{}),/Connection required/);
 await assert.rejects(rpc('profile',{connection:'app-a'}),/Consent required/);
 assert.equal((await rpc('profile',{connection:'https://chatgpt.invalid/client.json'})).data.name,'alice');
 await assert.rejects(rpc('workouts',{connection:'https://chatgpt.invalid/client.json'}),/Consent required/);
 // The Worker's token can never change consent, with or without a connection.
 await assert.rejects(rpc('consent',{client_id:'app-a',permissions:['profile']}),/Connection required/);
 await assert.rejects(rpc('consent',a({client_id:'app-a',permissions:['profile']})),/Consent required/);
 // Lists: date range and ordering.
 assert.deepEqual((await rpc('workouts',a({from:'2026-10-10',to:'2026-10-12',order:'newest'}))).data.map(w=>w.id),['alice-s11','alice-s10','alice-s9']);
 assert.equal((await rpc('workouts',a({limit:2}))).data[0].id,'alice-s0');
 await assert.rejects(rpc('workouts',a({from:'2026-02-30'})),/Invalid date range/);
 // Analysis.
 const m=(await rpc('summarize_training',a({from:'2026-10-01',to:'2026-10-31',group:'month'}))).data.periods[0];
 assert.deepEqual([m.sessions,m.working_sets,m.reps,Number(m.volume_kg),Number(m.minutes)],[30,135,900,33525,1800]);
 const ep=(await rpc('exercise_progress',a({exercise:' BENCH press ',to:'2026-10-03'}))).data.sessions;
 assert.deepEqual(ep.map(s=>[s.date,Number(s.top_kg),Number(s.est_1rm_kg)]),[[day(1),60,70],[day(2),61,71.2],[day(3),62,72.3]]);
 assert.deepEqual((await rpc('list_exercises',a({}))).data.map(e=>[e.exercise,e.sessions,e.sets]),[['Bench Press',30,90],['Dips',15,45]]);
 const nu=(await rpc('summarize_nutrition',a({group:'week'}))).data.periods;
 assert.deepEqual(nu.map(p=>[p.period,p.days_logged,Number(p.avg_kcal_per_day)]),[['2026-09-28',4,1000],['2026-10-05',2,1000]]);
 const wt=(await rpc('weight_trend',a({}))).data;assert.deepEqual([wt.entries,Number(wt.first.kg),Number(wt.last.kg),Number(wt.change_kg)],[8,71,67.5,-3.5]);
 await as_(bob,true);assert.equal((await rpc('summarize_training',{connection:'app-a',group:'month'})).data.periods[0].sessions,30);
 assert.equal(Number((await rpc('exercise_progress',{connection:'app-a',exercise:'Bench Press',to:'2026-10-01'})).data.sessions[0].top_kg),60);
 await assert.rejects(rpc('summarize_nutrition',{connection:'app-a'}),/Consent required/);
 // Add-only writes: switch, permission, validation, duplicates, cap, isolation.
 await as_(alice,true);
 await assert.rejects(rpc('log_weight',a({date:Y,kg:66})),/turned off/);
 await sql('update mfd_mcp.settings set writes_enabled=true');await as_(alice,true);
 await assert.rejects(rpc('log_meal',a({date:Y,meal:'lunch',name:'x',amount:1,unit:'g',kcal:1})),/Consent required/);
 // A workspace the app's validBackup() would reject must stay untouched.
 await sql(`update public.forma_workspaces set payload=payload-'chat' where user_id='${alice}'`);await as_(alice,true);
 await assert.rejects(rpc('log_weight',a({date:Y,kg:70})),/Finish setting up/);
 await sql(`update public.forma_workspaces set payload=payload||'{"chat":[]}' where user_id='${alice}'`);
 const before=(await sql(`select revision from public.forma_workspaces where user_id='${alice}'`))[0].revision;await as_(alice,true);
 const w=await rpc('log_workout',a({date:Y,name:'Legs',duration_minutes:45,request_id:'r1',exercises:[{exercise:'Squat',sets:[{kg:100,reps:5},{kg:100,reps:5,type:'failure'}]},{exercise:'Run',sets:[{distance_meters:5000,duration_seconds:1500}]}]}));
 assert.equal(Number(w.revision),Number(before)+1);
 assert.deepEqual((await rpc('log_workout',a({date:Y,request_id:'r1',exercises:[{exercise:'Other',sets:[{reps:1}]}]}))),{id:w.id,duplicate:true,today:T});
 const added=(await sql(`select payload->'sessions'->-1 s, jsonb_array_length(payload->'sessions') n, payload->'keep' k, payload->'sessions'->0->>'id' first from public.forma_workspaces where user_id='${alice}'`))[0];
 assert.equal(added.n,31);assert.deepEqual(added.k,{me:true});assert.equal(added.first,'alice-s0');
 assert.deepEqual(added.s.sets.map(s=>[s.exercise,s.group,s.set,s.tracking,s.type]),[['Squat',0,1,'weight_reps','normal'],['Squat',0,2,'weight_reps','failure'],['Run',1,1,'distance_duration','normal']]);
 assert.equal(added.s.finished-added.s.started,45*60000);assert.equal(added.s.addedBy.connection,'app-a');assert.equal(added.s.addedBy.request,'r1');
 await as_(alice,true);
 for(const bad of [{date:'1999-01-01',kg:70},{date:Y,kg:5},{date:Y},{date:Y,kg:'70'},{date:'yesterday',kg:70}])await assert.rejects(rpc('log_weight',a(bad)),/Invalid/);
 for(const bad of [{exercises:[]},{exercises:[{exercise:'',sets:[{reps:1}]}]},{exercises:[{exercise:'Squat',sets:[{}]}]},{exercises:[{exercise:'Squat',sets:[{reps:2.5}]}]},{exercises:[{exercise:'Squat',sets:[{kg:-1,reps:1}]}]},{exercises:[{exercise:'Squat',sets:[{reps:1,type:'mega'}]}]}])
  await assert.rejects(rpc('log_workout',a({date:Y,...bad})),/Invalid/);
 await rpc('log_weight',a({date:Y,kg:66}));
 // Routines: a new plan in the app's routine format; never touches existing routines.
 await assert.rejects(rpc('create_routine',a({name:'Plan',exercises:[{exercise:'Squat',sets:[{reps:5}]}]})),/Consent required/);
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','nutrition','progress','log_workouts','log_progress','log_routines']});await as_(alice,true);
 const rt=await rpc('create_routine',a({name:'Upper A',request_id:'plan-1',exercises:[{exercise:'Bench Press',rest_seconds:120,notes:'Pause reps',sets:[{kg:65,reps:5},{kg:65,reps:5},{kg:65,reps:5}]},{exercise:'Dips',sets:[{reps:10},{reps:10}]}]}));
 assert.equal((await rpc('create_routine',a({name:'Upper A',request_id:'plan-1',exercises:[{exercise:'X',sets:[{reps:1}]}]}))).duplicate,true);
 const routine=(await sql(`select payload->'routines'->-1 r, jsonb_array_length(payload->'routines') n from public.forma_workspaces where user_id='${alice}'`))[0];
 assert.equal(routine.n,1);assert.equal(routine.r.id,rt.id);assert.equal(routine.r.name,'Upper A');
 assert.deepEqual(routine.r.exercises.map(e=>[e.name,e.sets,e.reps,e.kg,e.rest,e.notes??null,e.setDetails.length]),[['Bench Press',3,5,65,120,'Pause reps',3],['Dips',2,10,0,90,null,2]]);
 assert(routine.r.exercises[1].setDetails.every(x=>x.group===1&&x.exercise==='Dips'&&x.done===false));
 await as_(alice,true);
 for(const bad of [{exercises:[{exercise:'Squat',sets:[{reps:5}]}]},{name:'P',exercises:[{exercise:'Squat',sets:Array.from({length:21},()=>({reps:5}))}]},{name:'P',exercises:[{exercise:'Squat',rest_seconds:2000,sets:[{reps:5}]}]}])
  await assert.rejects(rpc('create_routine',a(bad)),/Invalid/);
 let blocked=0;for(let i=0;i<30;i++){try{await rpc('log_weight',a({date:T,kg:70}));}catch(e){assert.match(e.message,/Daily limit/);blocked=i;break;}}
 assert.equal(blocked,27,'3 used, 27 more allowed, the 31st blocked');
 const weights=(await sql(`select jsonb_array_length(payload->'weights') n from public.forma_workspaces where user_id='${alice}'`))[0].n;assert.equal(weights,8+1+27);
 assert.equal((await sql(`select jsonb_array_length(payload->'sessions') n from public.forma_workspaces where user_id='${bob}'`))[0].n,30);
 await as_(bob,true);await assert.rejects(rpc('log_weight',{connection:'app-a',date:Y,kg:70}),/Consent required/);
 // Helpers are not callable by clients, and revoking a connection stops reads.
 for(const fn of ["mfd_mcp.add_entry('"+alice+"','app-a','log_weight','{}',current_date)","mfd_mcp.undo_entries('"+alice+"','app-a')","mfd_mcp.recent_ai_entries('"+alice+"','app-a')","mfd_mcp.analyze('weight_trend','{}','{}')"])await assert.rejects(db.query('select '+fn),/permission denied/);
 // ── v2: today, date rules, saved foods, records, muscle groups, targets, undo ──
 await as_(alice);await rpc('consent',{client_id:'app-b',permissions:['workouts','routines','nutrition','progress','profile','log_workouts','log_routines','log_nutrition','log_progress'],timezone:'Pacific/Kiritimati'});
 await rpc('consent',{client_id:'app-c',permissions:['progress','log_progress'],timezone:'not/a zone'});
 assert.deepEqual((await sql("select client_id,timezone from mfd_mcp.grants where client_id in ('app-b','app-c') order by 1")).map(r=>r.timezone),['Pacific/Kiritimati','UTC']);
 await as_(alice,true);const b=args=>({connection:'app-b',...args});
 const kiri=(await sql("select (now() at time zone 'Pacific/Kiritimati')::date::text d"))[0].d;
 const prof=await rpc('profile',b({}));assert.equal(prof.today,kiri);assert.deepEqual([prof.data.cal,prof.data.protein,prof.data.carbs,prof.data.fat],[2200,130,260,70]);
 const nt=(await rpc('summarize_nutrition',b({group:'week'}))).data;assert.deepEqual(nt.daily_targets,{kcal:2200,protein_g:130,carbs_g:260,fat_g:70});
 assert.deepEqual(nt.periods.map(p=>[Number(p.avg_kcal_vs_target_pct),Number(p.avg_protein_vs_target_pct)]),[[45,54],[45,54]]);
 assert.deepEqual((await rpc('list_exercises',b({to:'2026-10-31'}))).data.map(e=>[e.exercise,e.muscle_group]),[['Bench Press','Chest'],['Dips','Chest']]);
 const mv=(await rpc('muscle_volume',b({from:'2026-10-01',to:'2026-10-31'}))).data;assert.deepEqual(mv.totals,{Chest:135});assert.deepEqual(mv.unclassified,[]);
 assert.equal(mv.weeks.reduce((n,w)=>n+w.working_sets.Chest,0),135);
 const pr=(await rpc('personal_records',b({to:'2026-10-31'}))).data.records.find(r=>r.exercise==='Bench Press');
 assert.deepEqual([pr.sessions,Number(pr.heaviest.kg),pr.heaviest.date,Number(pr.best_est_1rm.kg),pr.best_est_1rm.set,pr.new_in_last_30_days],[30,89,day(30),103.8,'89 kg x 5',true]);
 const sg=(await rpc('exercise_progress',b({exercise:'Bench Press',to:'2026-10-31'}))).data.suggestion;assert.equal(Number(sg.next_kg),89);assert.match(sg.reason,/one more rep/);
 {const one=(await rpc('exercise_progress',b({exercise:'Bench Press',from:'2026-10-30',to:'2026-10-30'}))).data.suggestion;assert.equal(Number(one.next_kg),89);assert.match(one.reason,/Stay at 89 kg/);}
 // Date rules: older days only when empty; yesterday/today open; meals up to 2 days ahead; no future workouts/weights.
 const K=(await sql("select d::text t,(d-1)::text y,(d+2)::text t2,(d+3)::text t3,(d+1)::text tm from (select (now() at time zone 'Pacific/Kiritimati')::date d) x"))[0];
 await assert.rejects(rpc('log_weight',b({date:day(4),kg:70})),/already have a weigh-in on 4 Oct 2026/);
 await rpc('log_weight',b({date:day(5),kg:70}));await assert.rejects(rpc('log_weight',b({date:day(5),kg:70.2})),/already have a weigh-in/);
 await rpc('log_weight',b({date:K.y,kg:70}));await rpc('log_weight',b({date:K.y,kg:70.1}));await rpc('log_weight',b({date:K.t,kg:70}));
 await assert.rejects(rpc('log_weight',b({date:K.tm,kg:70})),/cannot be in the future/);
 await assert.rejects(rpc('log_workout',b({date:day(2),exercises:[{exercise:'Squat',sets:[{reps:5}]}]})),/already have a workout logged on 2 Oct 2026/);
 await rpc('log_workout',b({date:'2026-09-15',exercises:[{exercise:'Squat',sets:[{kg:80,reps:5}]}]}));
 await rpc('log_workout',b({date:'2026-09-16',exercises:[{exercise:'Seated Cable Row',sets:[{kg:50,reps:10},{kg:50,reps:11},{kg:45,reps:12}]}]}));
 {const up=(await rpc('exercise_progress',b({exercise:'seated cable row'}))).data.suggestion;assert.equal(Number(up.next_kg),52.5);assert.match(up.reason,/add a little weight/);}
 await assert.rejects(rpc('log_workout',b({date:K.tm,exercises:[{exercise:'Squat',sets:[{reps:5}]}]})),/future/);
 const meal=(date,m,extra={})=>rpc('log_meal',b({date,meal:m,name:'Egg',amount:1,unit:'serving',kcal:78,protein:6,...extra}));
 await meal(day(20),'breakfast');await assert.rejects(meal(day(20),'breakfast'),/already have breakfast logged on 20 Oct 2026/);await meal(day(20),'lunch');
 await meal(K.y,'breakfast');await meal(K.y,'breakfast');await meal(K.t,'snack');await meal(K.t,'snack');
 // Label extras (toor dal from photos): fibre, sugars and salt as read; saturated fat not on the label stays unknown.
 await meal(K.t2,'dinner',{fibre:2.5,sugars:0,salt:0.4});
 {const e=(await sql(`select e from public.forma_workspaces, jsonb_array_elements(payload->'meals') e where user_id='${alice}' and e->>'date'='${K.t2}'`))[0].e;
  assert.deepEqual([Number(e.fiber),Number(e.sugar),Number(e.salt),'saturates' in e,Number(e.labelFood.fiber),Number(e.labelFood.salt),'saturates' in e.labelFood],[2.5,0,0.4,false,2.5,0.4,false]);
  const s=(await rpc('summarize_nutrition',b({from:K.t2,to:K.t2}))).data.periods[0];assert.deepEqual([Number(s.fibre_g),Number(s.sugars_g),Number(s.salt_g),'saturated_fat_g' in s],[2.5,0,0.4,false]);}
 await assert.rejects(meal(K.t2,'dinner',{fibre:-1}),/Invalid fibre/);await assert.rejects(meal(K.t2,'dinner',{salt:'lots'}),/Invalid salt/);
 await assert.rejects(meal(K.t3,'dinner'),/up to 2 days ahead/);
 await assert.rejects(rpc('create_routine',b({name:'  upper a ',exercises:[{exercise:'Squat',sets:[{reps:5}]}]})),/routine named "upper a" already exists/);
 // Saved foods: values come from the diary's own food, scaled; no estimates mixed in.
 await sql(`update public.forma_workspaces set payload=payload||'{"products":[{"id":"p-oats","name":"Rolled oats","brand":"Mill","basis":100,"unit":"g","cal":380,"p":13,"c":60,"f":7,"fiber":10,"sugar":1,"salt":0.02}]}' where user_id='${alice}'`);await as_(alice,true);
 const foods=(await rpc('list_saved_foods',b({search:'oat'}))).data;assert.deepEqual(foods.map(f=>[f.food_id,f.per_amount,f.unit,f.kcal,Number(f.fibre_g),Number(f.sugars_g),f.saturated_fat_g]),[['p-oats',100,'g',380,10,1,undefined]]);
 assert.ok((await rpc('list_saved_foods',b({}))).data.some(f=>f.name==='Egg'&&f.times_logged>=1));
 const oat=await rpc('log_meal',b({date:K.t,meal:'breakfast',food_id:'p-oats',amount:50,unit:'g'}));
 assert.deepEqual([oat.added.name,Number(oat.added.cal),Number(oat.added.p),Number(oat.added.c),Number(oat.added.f),oat.added.labelFood.id,oat.added.meal,Number(oat.added.fiber),Number(oat.added.sugar),Number(oat.added.salt),'saturates' in oat.added],['Rolled oats',190,6.5,30,3.5,'p-oats','Breakfast',5,0.5,0.01,false]);
 await assert.rejects(rpc('log_meal',b({date:K.t,meal:'breakfast',food_id:'p-oats',amount:50,unit:'g',fibre:1})),/Leave out kcal and nutrients/);
 await assert.rejects(rpc('log_meal',b({date:K.t,meal:'breakfast',food_id:'p-oats',amount:1,unit:'serving'})),/food's unit \(g\)/);
 await assert.rejects(rpc('log_meal',b({date:K.t,meal:'breakfast',food_id:'p-oats',amount:50,unit:'g',kcal:1})),/Leave out kcal/);
 await assert.rejects(rpc('log_meal',b({date:K.t,meal:'breakfast',food_id:'nope',amount:50,unit:'g'})),/Saved food not found/);
 await assert.rejects(rpc('log_meal',b({date:K.t,meal:'breakfast',amount:50,unit:'g'})),/name and kcal are required/);
 // Undo (browser only): this app's last-24 h entries that are unchanged; edited, older and other apps' entries stay.
 const nr=await rpc('create_routine',b({name:'Pull B',exercises:[{exercise:'Pull-up',sets:[{reps:8},{reps:8}]}]}));
 await rpc('log_weight',{connection:'app-c',date:T,kg:69});
 const count=async()=>(await sql(`select (select count(*) from jsonb_array_elements(payload->'weights') e where e->'addedBy'->>'connection'='app-b')::int w, (select count(*) from jsonb_array_elements(payload->'meals') e where e->'addedBy'->>'connection'='app-b')::int m, (select count(*) from jsonb_array_elements(payload->'weights') e where e->'addedBy'->>'connection'='app-c')::int c, jsonb_array_length(payload->'routines')::int r from public.forma_workspaces where user_id='${alice}'`))[0];
 assert.deepEqual(await count(),{w:4,m:8,c:1,r:2});
 // The user changed one AI weigh-in in the app; the app also linked the AI routine to its catalogue; one entry is from two days ago.
 await sql(`update public.forma_workspaces set payload=jsonb_set(jsonb_set(jsonb_set(payload,'{weights}',(select jsonb_agg(case when e->>'date'='${day(5)}' and e->'addedBy'->>'connection'='app-b' then e||'{"kg":70.4}' else e end order by n) from jsonb_array_elements(payload->'weights') with ordinality t(e,n))),
   '{routines}',(select jsonb_agg(case when e->>'id'='${nr.id}' then jsonb_set(e,'{exercises,0}',e->'exercises'->0||'{"catalogId":"free-Pullups","catalogSource":"Free Exercise DB"}') else e end order by n) from jsonb_array_elements(payload->'routines') with ordinality t(e,n))),
   '{meals}',(select jsonb_agg(case when e->>'date'='${day(20)}' and e->>'meal'='Lunch' then jsonb_set(e,'{addedBy,at}','"2020-01-01T00:00:00Z"') else e end order by n) from jsonb_array_elements(payload->'meals') with ordinality t(e,n))) where user_id='${alice}'`);
 // An AI entry from before undo existed (no fingerprint), and one with a malformed time: both must be kept.
 await sql(`update public.forma_workspaces set payload=jsonb_set(payload,'{weights}',payload->'weights'||'[{"id":"legacy-ai","date":"${K.y}","kg":71,"addedBy":{"connection":"app-b","at":"${new Date().toISOString().slice(0,19)}Z"}},{"id":"odd-ai","date":"${K.y}","kg":71,"addedBy":{"connection":"app-b","at":"not a time","fp":"x"}}]') where user_id='${alice}'`);
 await as_(alice,true);await assert.rejects(rpc('undo',b({client_id:'app-b'})),/Consent required/);
 const rev0=(await sql(`select revision from public.forma_workspaces where user_id='${alice}'`))[0].revision;
 await as_(alice);
 // Review list: this app's last-24 h entries; edited and pre-undo entries are marked unchanged=false.
 const list=await rpc('ai_entries',{client_id:'app-b'});
 assert.equal(list.length,15);assert.equal(list.filter(e=>e.unchanged).length,13);
 assert.deepEqual([...new Set(list.map(e=>e.kind))].sort(),['meals','routines','sessions','weights']);
 assert(list.some(e=>e.kind==='weights'&&e.id==='legacy-ai'&&e.unchanged===false)&&!list.some(e=>e.id==='odd-ai'));
 assert.equal(list.find(e=>e.kind==='routines').name,'Pull B');
 await assert.rejects(rpc('undo',{client_id:'app-b'}),/Choose the entries/);await assert.rejects(rpc('undo',{client_id:'app-b',ids:[]}),/Choose the entries/);
 // Remove one selected entry only, then the rest; an edited and an unknown id are skipped.
 assert.deepEqual(await rpc('undo',{client_id:'app-b',ids:[nr.id]}),{removed:1,kept_edited:2,skipped:0});
 const rest=list.filter(e=>e.unchanged&&e.id!==nr.id).map(e=>e.id),edited=list.find(e=>!e.unchanged).id;
 const un=await rpc('undo',{client_id:'app-b',ids:[...rest,edited,'no-such-id']});assert.deepEqual(un,{removed:12,kept_edited:2,skipped:2});
 assert.deepEqual(await count(),{w:3,m:1,c:1,r:1});assert.equal((await sql(`select count(*)::int n from public.forma_workspaces, jsonb_array_elements(payload->'weights') e where user_id='${alice}' and e->>'id' in ('legacy-ai','odd-ai')`))[0].n,2);
 assert.equal(Number((await sql(`select revision from public.forma_workspaces where user_id='${alice}'`))[0].revision),Number(rev0)+2);
 assert.deepEqual(await rpc('undo',{client_id:'app-b',ids:rest}),{removed:0,kept_edited:2,skipped:12});assert.equal((await rpc('ai_entries',{client_id:'app-b'})).length,2);
 assert.equal((await sql(`select jsonb_array_length(payload->'sessions') n from public.forma_workspaces where user_id='${alice}'`))[0].n,31);
 await as_(alice);await rpc('revoke',{client_id:'app-a'});await as_(alice,true);await assert.rejects(rpc('workouts',a({})),/Consent required/);
 console.log('PASS connector migration: per-app/per-user consent, date ranges, exact training/exercise/nutrition/weight analysis, add-only writes and routines with switch, validation, duplicates, daily cap, private helpers; v2 today/timezone, date rules, saved foods, records, muscle groups, targets, user undo');
})().catch(e=>{console.error(e);process.exitCode=1});
