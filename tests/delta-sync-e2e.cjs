// Delta sync end to end: the real sync engine (public/legacy/cloud.js + workspace-merge.js +
// workspace-ops.js) on two simulated phones against a real Postgres with the MFD schema, through
// PostgREST (the API Supabase uses). Counts the bytes each exchange moves.
// Needs the test database and PostgREST (database/tests/run.sh starts both; CI runs it); skipped otherwise.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto'),{execFileSync}=require('child_process');
const testdb=require('./lib/testdb.cjs'),REST=process.env.MFD_TEST_REST,SECRET=process.env.MFD_TEST_JWT_SECRET||'local-test-secret-local-test-secret-123';
if(!testdb.available||!REST){console.log('SKIP delta sync e2e (run database/tests/run.sh)');process.exit(0)}
const {PostgrestClient}=require('@supabase/postgrest-js');
const sql=testdb.sql;
const lit=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=sub=>{const h=b64({alg:'HS256',typ:'JWT'}),p=b64({role:'authenticated',sub,exp:Math.floor(Date.now()/1000)+3600});return h+'.'+p+'.'+crypto.createHmac('sha256',SECRET).update(h+'.'+p).digest('base64url')};
const cloudSource=fs.readFileSync('public/legacy/cloud.js','utf8').replace(/^initializeCloud\(\);$/m,'');
const opsSource=fs.readFileSync('public/legacy/workspace-ops.js','utf8'),mergeSource=fs.readFileSync('public/legacy/workspace-merge.js','utf8');
const O=(()=>{const c={structuredClone};vm.createContext(c);vm.runInContext(opsSource,c);return c.MFDWorkspaceOps})();

// ---- a diary shaped like the largest real one (277 workouts, ~31 sets each, Hevy rows) -------------
let n=0;const nid=p=>p+(++n);
function realSet(g,i){return {id:nid('set'),exercise:['Bench Press','Squat','Lat Pulldown','Row'][g%4],catalogId:'bench_press',catalogSource:'MFD',legacyCatalogId:'barbell_bench_press_legacy',tracking:'weight_reps',type:i===0?'warmup':'normal',group:g,set:i+1,kg:60+i*2.5,reps:8,done:true,notes:'',sourceSetIndex:i,
 rpe:null,floors:null,steps:null,custom_metric:null,distance_meters:null,duration_seconds:null,superset_id:null}}
function realSession(k){const sets=[];for(let g=0;g<8;g++)for(let i=0;i<4;i++)sets.push(realSet(g,i));
 return {id:'w'+k,name:'Upper '+k,date:'2025-01-01',started:1.7e12+k*86400000,finished:1.7e12+k*86400000+3600000,importKey:'hevy-'+k,importTimezone:'Europe/Berlin',sets,
  hevyRows:sets.map((s,i)=>({title:'Upper '+k,start_time:'1 Jan 2025, 10:00',end_time:'1 Jan 2025, 11:00',description:'',exercise_title:s.exercise,superset_id:'',exercise_notes:'',set_index:String(i),set_type:s.type,weight_kg:String(s.kg),reps:'8',distance_km:'',duration_seconds:'',rpe:''}))}}
const base=()=>({profile:{name:'Tester',onboarded:true},meals:Array.from({length:45},(_,i)=>({id:'m'+i,date:'2026-11-01',name:'Food '+i,kcal:300})),weights:[{id:'kg1',date:'2026-11-01',kg:72.3}],checkins:[],chat:[],
 routines:[{id:'r1',name:'Upper',exercises:[{name:'Bench Press',sets:3,reps:8,kg:60,setDetails:[realSet(0,0),realSet(0,1)]}]}],sessions:Array.from({length:277},(_,k)=>realSession(k)),active:null,water:{'2026-11-06':750},mfdExercises:[],folders:[]});

// ---- a phone ---------------------------------------------------------------------------------------
function phone(user,storage=new Map()){const traffic={up:0,down:0,calls:[]};let failNetwork=false;
 const fetchCounting=async(url,init={})=>{if(failNetwork)throw new TypeError('fetch failed: offline');const body=init.body?String(init.body):'';traffic.up+=body.length;const r=await fetch(url,init);const text=await r.text();traffic.down+=text.length;traffic.calls.push(String(url).replace(REST,'').split('?')[0]);return new Response(text,{status:r.status,headers:r.headers})};
 const client=new PostgrestClient(REST,{headers:{Authorization:'Bearer '+jwt(user)},fetch:fetchCounting});
 const timers=new Map();let id=0;
 const c={window:{formaSupabase:client,addEventListener(){},requestIdleCallback(f){timers.set(++id,f)}},navigator:{onLine:true},document:{hidden:false,addEventListener(){}},
  localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},setTimeout(f){timers.set(++id,f);return id},clearTimeout(i){timers.delete(i)},setInterval(){return 0},
  structuredClone,state:{profile:{}},defaults:()=>({profile:{},sessions:[],routines:[],meals:[],weights:[],checkins:[],chat:[]}),render(){},validBackup:d=>!!d?.profile&&['meals','weights','sessions','routines','checkins','chat'].every(k=>Array.isArray(d[k])),
  canUseForma:()=>!!c.cloud?.user&&c.cloud.ready,updateCloudUI(){},toast(){},URLSearchParams,location:{search:''},KEY:'guest',console,AbortController,Response,TypeError,Error,Map,Set,Promise,JSON,Object,Array,Number,String,Date,Math};
 c.window.MFDWorkspaceMerge=undefined;vm.createContext(c);vm.runInContext(mergeSource,c);c.MFDWorkspaceMerge=c.window.MFDWorkspaceMerge;vm.runInContext(opsSource,c);c.MFDWorkspaceOps=c.window.MFDWorkspaceOps;
 c.$=()=>null;vm.runInContext(cloudSource+'\nthis.cloud=cloud;',c);c.updateCloudUI=()=>{};
 return {c,storage,traffic,timers,offline(v){failNetwork=v;c.navigator.onLine=!v},flaky(v){failNetwork=v},async runTimers(){/* time passes: the scheduled wait is over */c.cloud.retryAt=0;const due=[...timers.values()];timers.clear();for(const f of due)await f()},reset(){traffic.up=0;traffic.down=0;traffic.calls.length=0},
  boot:()=>c.handleCloudSession({user:{id:user,email:user+'@test.invalid'}}),
  edit(fn,keys){fn(c.state);c.cloud.patchKeys=keys;c.save()},sync:()=>c.syncCloud(true),refresh:()=>c.refreshCloud()}}
const server=user=>JSON.parse(sql(`select json_build_object('payload',payload,'revision',revision) from public.forma_workspaces where user_id='${user}'`));
const same=(a,b)=>O.equal(a,b);
const KB=v=>Math.round(v/1024);

(async()=>{
 const U=crypto.randomUUID();sql(`insert into auth.users(id) values('${U}')`);
 try{
 const original=base();const originalText=JSON.stringify(original);
 sql(`insert into public.forma_workspaces(user_id,payload) values('${U}',${lit(original)})`);
 let s=server(U);assert.equal(s.revision,1);
 assert.ok(!s.payload.sessions.some(x=>x.hevyRows),'stored without raw import rows');
 assert.equal(Number(sql(`select count(*) from public.forma_import_rows where user_id='${U}'`)),277,'raw rows kept in their own table');
 const compactSize=JSON.stringify(s.payload).length;
 const report=[`diary: ${KB(originalText.length)} KB as written, ${KB(compactSize)} KB stored compact`];

 // 1. First sign-in on phone A: one full download.
 const A=phone(U);await A.boot();assert.ok(same(A.c.state,s.payload),'A has the diary');assert.equal(A.c.cloud.revision,1);
 report.push(`first sign-in: ${KB(A.traffic.down)} KB down`);
 // 2. A logs a set in one workout: only that workout travels.
 A.reset();A.edit(st=>{st.sessions[5].sets.push({...st.sessions[5].sets[0],id:'new-set',kg:100})},['sessions']);assert.equal(await A.sync(),true);
 assert.ok(A.traffic.calls.includes('/rpc/forma_save_changes'),'saved as a patch');assert.ok(A.traffic.up<20000,'one workout up, not the diary: '+A.traffic.up);
 s=server(U);assert.equal(s.revision,2);assert.ok(same(s.payload,A.c.state),'server equals phone A');
 report.push(`log one set: ${KB(A.traffic.up)} KB up (was ${KB(compactSize)} KB)`);
 // 3. Nothing changed: returning to the app downloads (almost) nothing.
 A.reset();await A.refresh();assert.ok(A.traffic.down<100,'unchanged refresh: '+A.traffic.down);report.push(`return to app, nothing new: ${A.traffic.down} bytes down`);

 // 4. Phone B signs in; both phones edit different things; both edits survive (conflict + rebase).
 const B=phone(U);await B.boot();assert.ok(same(B.c.state,s.payload));
 A.edit(st=>{st.meals.push({id:'mA',date:'2026-11-06',name:'Oats',kcal:350})},['meals']);
 B.edit(st=>{st.weights.push({id:'kgB',date:'2026-11-06',kg:72.1})},['weights']);
 assert.equal(await A.sync(),true);B.reset();assert.equal(await B.sync(),true,'B rebases on A and saves');
 assert.ok(B.traffic.calls.includes('/rpc/forma_workspace_pull'),'B fetched only the changes after the conflict');
 s=server(U);assert.ok(s.payload.meals.some(m=>m.id==='mA')&&s.payload.weights.some(w=>w.id==='kgB'),'both edits on the server');
 A.reset();await A.refresh();assert.ok(same(A.c.state,s.payload),'A converged');assert.ok(A.traffic.down<5000,'A downloaded only B\'s change: '+A.traffic.down);
 report.push(`other phone's change arrives: ${A.traffic.down} bytes down`);

 // 5. Same value changed on both phones: resolved automatically, the more recent change wins, nothing blocks.
 // 5a. A's change reached the cloud after B's edit: the cloud value wins on B, B has nothing left to save.
 A.edit(st=>{st.meals[0].kcal=111},['meals']);B.edit(st=>{st.meals[0].kcal=222},['meals']);await new Promise(r=>setTimeout(r,1100));
 assert.equal(await A.sync(),true);assert.equal(await B.sync(),true,'B resolves on its own and finishes');
 assert.ok(!B.c.cloud.conflict&&!B.c.cloud.dirty,'no conflict, nothing pending');assert.equal(B.c.state.meals[0].kcal,111,'the later (cloud) change won');assert.equal(server(U).payload.meals[0].kcal,111);
 const resolved=JSON.parse(B.storage.get('forma.account.'+U+'.resolved')||'[]');assert.equal(resolved[0]?.kept,'cloud');assert.equal(resolved[0]?.local,222,'the other value is kept on the phone');
 // 5b. B edits after the cloud changed: B's value wins and is saved.
 A.edit(st=>{st.meals[0].kcal=444},['meals']);assert.equal(await A.sync(),true);await new Promise(r=>setTimeout(r,1100));
 B.edit(st=>{st.meals[0].kcal=333},['meals']);assert.equal(await B.sync(),true);
 assert.equal(server(U).payload.meals[0].kcal,333,'the later (phone) change won');assert.ok(!B.c.cloud.dirty);
 await A.refresh();assert.equal(A.c.state.meals[0].kcal,333,'A converged');
 // 5c. The day each phone is looking at stays its own, whatever the timing.
 B.edit(st=>{st.mfdDate='2026-11-05'},['mfdDate']);await new Promise(r=>setTimeout(r,1100));A.edit(st=>{st.mfdDate='2026-11-01'},['mfdDate']);assert.equal(await A.sync(),true);
 assert.equal(await B.sync(),true);assert.equal(B.c.state.mfdDate,'2026-11-05','device-only value kept');

 // 6. ChatGPT adds a meal (connector-style SQL write) while A is mid-workout.
 await A.refresh();A.edit(st=>{st.active={id:'act',name:'Push',started:Date.now(),sets:[{...st.sessions[0].sets[0],id:'a1',rpe:null}]}},['active']);
 sql(`update public.forma_workspaces set payload=jsonb_set(payload,'{meals}',payload->'meals'||'[{"id":"ai1","name":"Wrap","kcal":448,"addedBy":{"app":"ChatGPT"}}]'::jsonb),revision=revision+1 where user_id='${U}'`);
 assert.equal(await A.sync(),true);s=server(U);
 assert.ok(s.payload.meals.some(m=>m.id==='ai1')&&s.payload.active?.id==='act','connector meal and the workout both kept');
 assert.ok(!('rpe' in s.payload.active.sets[0]),'stored compact');assert.ok(same(A.c.state,s.payload),'A matches');

 // 7. Offline edits wait on the phone, then sync.
 A.offline(true);A.edit(st=>{st.water['2026-11-06']=1000},['water']);assert.equal(await A.sync(),false);assert.ok(A.c.cloud.dirty);
 A.offline(false);A.c.cloud.retryAt=0;A.c.cloud.syncPaused=false;assert.equal(await A.sync(),true);assert.equal(server(U).payload.water['2026-11-06'],1000);

 // 8. App killed right after an edit (only the journal written): restart, nothing lost.
 A.edit(st=>{st.meals.push({id:'killed',name:'Banana',kcal:90})},['meals']);
 const A2=phone(U,A.storage);await A2.boot();assert.ok(A2.c.state.meals.some(m=>m.id==='killed'),'edit survived the restart');
 assert.equal(await A2.sync(),true);assert.ok(server(U).payload.meals.some(m=>m.id==='killed'));

 // 9. Restart with a saved copy: only a version check, no download.
 await A2.refresh();A2.c.cacheWorkspace();const A3=phone(U,A2.storage);await A3.boot();
 assert.ok(A3.traffic.down<200,'restart downloads only the version check: '+A3.traffic.down);assert.ok(same(A3.c.state,server(U).payload));
 report.push(`app restart, nothing new: ${A3.traffic.down} bytes down (was ${KB(compactSize)} KB)`);

 // 10. An old app version saves the whole diary (v2): phones still get just the change.
 const doc=server(U);doc.payload.profile.name='Old app';sql(`select public.forma_save_workspace_v2(${lit(doc.payload)},${doc.revision}) from (select set_config('request.jwt.claim.sub','${U}',true)) x`);
 A3.reset();await A3.refresh();assert.equal(A3.c.state.profile.name,'Old app');assert.ok(A3.traffic.down<5000,'v2 write arrives as a change: '+A3.traffic.down);

 // 11. Phone away longer than the change history: full download, correct result.
 B.edit(st=>{st.meals.push({id:'late',name:'Late',kcal:1})},['meals']);await B.sync();
 sql(`delete from public.forma_workspace_changes where user_id='${U}'`);
 A3.reset();await A3.refresh();assert.ok(same(A3.c.state,server(U).payload),'caught up after history was cleared');assert.ok(A3.traffic.down>100000,'it was a full download');

 // 12. A Hevy import: rows go up with the workouts, the server files them, backups get them back.
 const imported=realSession(9001);A3.edit(st=>{st.sessions.push(imported)},['sessions']);assert.equal(await A3.sync(),true);
 assert.equal(A3.c.cloud.serverBase,null,'server stored it differently (rows moved): next exchange is full');
 assert.equal(Number(sql(`select count(*) from public.forma_import_rows where user_id='${U}' and session_id='w9001'`)),1);
 await A3.refresh();assert.ok(same(A3.c.state,server(U).payload)&&!A3.c.state.sessions.some(x=>x.hevyRows),'phone now holds the compact form');
 const rows=await A3.c.importRowsForBackup();assert.equal(rows.size,278,'backup gets every original row');assert.ok(same(rows.get('w9001'),imported.hevyRows),'rows unchanged');
 // Nothing lost overall: every original workout and set is still there, rows byte-identical in their table.
 const final=server(U).payload;for(const w of original.sessions){const now=final.sessions.find(x=>x.id===w.id);assert.ok(now,'workout '+w.id+' kept');
  const strip=x=>{const {hevyRows,...rest}=x;return {...rest,sets:rest.sets.map(t=>Object.fromEntries(Object.entries(t).filter(([,v])=>v!==null)))}};
  if(w.id!=='w5')assert.ok(same(strip(now),strip(w)),'workout '+w.id+' unchanged');assert.ok(same(rows.get(w.id),w.hevyRows),'rows of '+w.id+' unchanged')}
 // 13. A bad network for a whole workout (no "offline" signal): it keeps retrying, never pauses, saves when back.
 const F=phone(U);await F.boot();F.flaky(true);
 for(let i=0;i<7;i++){F.edit(st=>{st.water['2026-11-07']=(st.water['2026-11-07']||0)+250},['water']);assert.equal(await F.sync(),false)}
 assert.ok(F.c.cloud.offline&&F.c.cloud.dirty,'waiting with changes on the phone');assert.equal(F.c.cloud.syncPaused,false,'never paused');assert.equal(F.c.cloud.error,'','not shown as an error');
 assert.ok(F.timers.size>0,'a retry is scheduled');assert.ok(F.c.cloud.retryAt-Date.now()<=15000,'waits at most 15 s');
 F.flaky(false);F.c.wakeCloud();await (F.c.cloud.savePromise||F.c.cloud.refreshPromise);
 assert.ok(!F.c.cloud.dirty&&!F.c.cloud.offline&&F.c.cloud.retryCount===0,'saved on wake');assert.equal(server(U).payload.water['2026-11-07'],1750);
 // 14. Sync now while a save is running: waits for that save instead of skipping.
 F.edit(st=>{st.water['2026-11-07']=2000},['water']);const p1=F.sync(),p2=F.sync();assert.equal(p1,p2,'same save');assert.equal(await p2,true);assert.equal(server(U).payload.water['2026-11-07'],2000);
 // 15. App opened with unsaved changes while the network fails: a retry is scheduled, and it saves once back.
 F.edit(st=>{st.water['2026-11-07']=2250},['water']);F.c.cacheWorkspace();const G=phone(U,F.storage);G.flaky(true);await G.boot();
 assert.ok(G.c.cloud.ready&&G.c.cloud.dirty,'opens with the pending change');assert.ok(G.timers.size>0,'retry scheduled at start');
 G.flaky(false);await G.runTimers();await (G.c.cloud.savePromise||G.c.cloud.refreshPromise);if(G.c.cloud.dirty){await G.runTimers();await (G.c.cloud.savePromise||G.c.cloud.refreshPromise)}
 assert.ok(!G.c.cloud.dirty,'saved after the network came back');assert.equal(server(U).payload.water['2026-11-07'],2250);
 // 16. A long back-off is cut short by a new edit (so logging a set retries within 2 s).
 G.c.cloud.retryAt=Date.now()+30000;G.edit(st=>{st.water['2026-11-07']=2500},['water']);assert.ok(G.c.cloud.retryAt-Date.now()<=2000,'edit shortens the wait');assert.equal(await G.sync(),true);
 // 17. An AI assistant changes the same value while the phone has unsaved edits: newer wins automatically.
 await G.refresh();G.edit(st=>{st.profile.name='Phone name'},['profile']);await new Promise(r=>setTimeout(r,1100));
 sql(`update public.forma_workspaces set payload=jsonb_set(payload,'{profile,name}','"AI name"'),revision=revision+1,updated_at=now() where user_id='${U}'`);
 assert.equal(await G.sync(),true,'no conflict screen, saved');assert.equal(server(U).payload.profile.name,'AI name','the AI change was more recent');assert.ok(!G.c.cloud.conflict);

 console.log('PASS delta sync end to end: patches, pulls, two phones, conflicts resolved automatically (latest wins, device-only kept), bad network without offline signal (never pauses, saves on wake), Sync now waits for a running save, start-up retry, edit cuts back-off, AI edit while pending, connector mid-workout, offline, killed mid-save, restart, old app, history gap, Hevy import + backup rows, nothing lost\n  '+report.join('\n  '));
 }finally{sql(`delete from public.forma_import_rows where user_id='${U}';delete from public.forma_workspace_changes where user_id='${U}';delete from public.mfd_social_workouts where owner_id='${U}';delete from public.forma_workspaces where user_id='${U}';delete from auth.users where id='${U}'`)}
})().catch(e=>{console.error(e);process.exitCode=1});
