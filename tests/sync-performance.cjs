const fs=require('fs'),vm=require('vm'),assert=require('assert');
const cloudSource=fs.readFileSync('public/legacy/cloud.js','utf8').replace(/^initializeCloud\(\);$/m,'');
const copy=x=>JSON.parse(JSON.stringify(x));
const documentFor=(n=0)=>({profile:{name:'Tester'},sessions:[],routines:[],active:null,meals:[],weights:[],checkins:[],chat:[],water:{test:n}});
function harness(){const storage=new Map(),events={},docEvents={},timers=new Map();let id=0,remote,saveCalls=[],renders=0;
 const c={window:{formaSupabase:{from(){const q={select(){return q},eq(){return q},maybeSingle:()=>remote};return q},rpc:async(name,args)=>{saveCalls.push(copy(args));return{data:[{saved_revision:args.expected_revision+1}]}}}},navigator:{onLine:true},document:{hidden:false,addEventListener(n,f){docEvents[n]=f}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout(f){timers.set(++id,f);return id},clearTimeout(i){timers.delete(i)},structuredClone,state:documentFor(),defaults:documentFor,render(){renders++},validBackup:d=>!!d?.profile,canUseForma:()=>!!c.cloud.user&&c.cloud.ready,updateCloudUI(){},toast(){},URLSearchParams,location:{search:''},KEY:'guest',console};c.window.addEventListener=(n,f)=>{events[n]=f};c.window.requestIdleCallback=f=>{timers.set(++id,f)};vm.createContext(c);vm.runInContext(fs.readFileSync('public/legacy/workspace-merge.js','utf8'),c);c.MFDWorkspaceMerge=c.window.MFDWorkspaceMerge;vm.runInContext(cloudSource+'\nthis.cloud=cloud;',c);c.updateCloudUI=()=>{};return{c,storage,events,docEvents,timers,saves:saveCalls,remote(p){remote=p},seed(user,doc,revision,dirty=false){storage.set('forma.account.'+user,JSON.stringify({document:doc,revision,dirty}))},boot(user='alice'){return c.handleCloudSession({user:{id:user,email:user+'@invalid'}})}}}
(async()=>{
 // Cached content is available before any network response, without exposing another account's cache.
 let h=harness(),resolve;h.seed('alice',documentFor(1),3);h.remote(new Promise(r=>resolve=r));let boot=h.boot();assert(h.c.cloud.ready);assert.equal(h.c.state.water.test,1);assert(h.c.cloud.reconciling);assert.equal(await h.c.syncCloud(),false);resolve({data:{payload:documentFor(2),revision:4}});await boot;assert.equal(h.c.state.water.test,2);
 // Offline restart + small journal survives process interruption and remains pending.
 h=harness();h.seed('alice',documentFor(1),3);h.storage.set('forma.account.alice.journal',JSON.stringify({userId:'alice',revision:3,patch:{water:{test:8},active:{id:'active',sets:[]}}}));h.remote(Promise.resolve({error:new Error('Failed to fetch')}));await h.boot();assert(h.c.cloud.ready&&h.c.cloud.offline&&h.c.cloud.dirty);assert.equal(h.c.state.water.test,8);h.c.state={...h.c.state,active:{id:'active',sets:[{reps:12}]}};h.c.cloud.patchKeys=['active'];h.c.save();let journal=JSON.parse(h.storage.get('forma.account.alice.journal'));assert.equal(journal.patch.water.test,8);assert.equal(journal.patch.active.sets[0].reps,12);assert.equal(h.saves.length,0);h.docEvents.visibilitychange();h.c.document.hidden=true;h.docEvents.visibilitychange();assert(!h.storage.has('forma.account.alice.journal'));assert.equal(JSON.parse(h.storage.get('forma.account.alice')).document.active.sets[0].reps,12);
 // Offline account switch cannot display the previous user's document.
 h.c.cloud.user=null;h.remote(Promise.resolve({error:new Error('Failed to fetch')}));await h.boot('bob');assert(!h.c.cloud.ready);assert.equal(h.c.state.water.test,0);
 // Concurrent edits made while startup is fetching are preserved; differing revisions conflict.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(new Promise(r=>resolve=r));boot=h.boot();h.c.state.water={test:9};h.c.cloud.patchKeys=['water'];h.c.save();resolve({data:{payload:documentFor(2),revision:4}});await boot;assert(h.c.cloud.conflict);assert.equal(h.c.state.water.test,9);assert.equal(h.c.cloud.revision,3);assert.equal(JSON.parse(h.storage.get('forma.account.alice')).revision,3);assert.equal(await h.c.syncCloud(),false);
 // A pending GET cannot overwrite a new edit made after that GET started.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();h.remote(new Promise(r=>resolve=r));let refresh=h.c.refreshCloud();h.c.state.water={test:7};h.c.cloud.patchKeys=['water'];h.c.save();resolve({data:{payload:documentFor(99),revision:4}});await refresh;assert.equal(h.c.state.water.test,7);assert(h.c.cloud.dirty);
 // In-flight POST followed by an edit must never mark the newer edit as synced.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();
 let postResolve;h.c.window.formaSupabase.rpc=(name,args)=>new Promise(r=>postResolve=r);h.c.cloud.dirty=true;let syncing=h.c.syncCloud();h.c.state.water={test:10};h.c.cloud.patchKeys=['water'];h.c.save();postResolve({data:[{saved_revision:4}]});await syncing;assert(h.c.cloud.dirty);assert.equal(h.c.state.water.test,10);assert.equal(JSON.parse(h.storage.get('forma.account.alice')).document.water.test,10);

 // Independent cloud/local changes merge automatically without showing a blocking conflict.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();h.c.state={...h.c.state,sessions:[{id:'offline',sets:[]}]};h.c.cloud.patchKeys=['sessions'];h.c.save();const cloudCopy=documentFor(2);cloudCopy.meals=[{id:'remote-food',name:'Rice'}];h.remote(Promise.resolve({data:{payload:cloudCopy,revision:4}}));await h.c.refreshCloud();assert(!h.c.cloud.conflict);assert.equal(h.c.state.sessions[0].id,'offline');assert.equal(h.c.state.meals[0].id,'remote-food');assert.equal(h.c.cloud.revision,4);assert(h.c.cloud.dirty);
 // Restart reconstructs the true baseline from compact deltas before applying a pending journal.
 h.c.cacheWorkspace();const saved=JSON.parse(h.storage.get('forma.account.alice'));assert(Array.isArray(saved.baseDelta));assert(!saved.baseDocument);const next=harness();next.storage.set('forma.account.alice',JSON.stringify(saved));next.remote(Promise.resolve({data:{payload:cloudCopy,revision:4}}));await next.boot();assert(!next.c.cloud.conflict);assert.equal(next.c.state.sessions[0].id,'offline');
 // CAS rejection fetches the latest cloud copy and retries with the merged pending document.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();h.c.state={...h.c.state,sessions:[{id:'local',sets:[]}]};h.c.cloud.patchKeys=['sessions'];h.c.save();let attempts=0;h.c.window.formaSupabase.rpc=async(name,args)=>{if(attempts++===0)return{data:[{saved_revision:null,conflict:true}]};assert.equal(args.expected_revision,4);assert.equal(args.document.sessions[0].id,'local');assert.equal(args.document.meals[0].id,'remote-food');return{data:[{saved_revision:5}]}};h.remote(Promise.resolve({data:{payload:cloudCopy,revision:4}}));assert.equal(await h.c.syncCloud(),true);assert.equal(attempts,2);assert(!h.c.cloud.dirty&&!h.c.cloud.conflict);
 // Clean state and focus/visibility events must never POST an unnecessary save.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();assert.equal(await h.c.syncCloud(),false);assert.equal(h.saves.length,0);
 // Repeated conflicts are bounded even when events call sync directly. Local edits survive.
 h.c.state={...h.c.state,sessions:[{id:'pending',sets:[]}]};h.c.cloud.patchKeys=['sessions'];h.c.save();let calls=0;
 h.c.window.formaSupabase.rpc=async()=>{calls++;return {data:[{conflict:true}]}};
 for(let round=0;round<5;round++){h.c.cloud.retryAt=0;await h.c.syncCloud();const n=calls;await h.c.syncCloud();assert.equal(calls,n);}
 assert.equal(calls,10);assert(h.c.cloud.syncPaused);assert(h.c.cloud.dirty);assert.equal(h.c.state.sessions[0].id,'pending');
 assert.equal(JSON.parse(h.storage.get('forma.account.alice')).document.sessions[0].id,'pending');
 // HTTP 409 is reconciled once without using SQLSTATE 40001.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();h.c.state={...h.c.state,sessions:[{id:'pending',sets:[]}]};h.c.save();calls=0;
 h.c.window.formaSupabase.rpc=async()=>++calls===1?{error:{code:'PT409'}}:{data:[{saved_revision:4}]};assert(await h.c.syncCloud());assert.equal(calls,2);
 // Ordinary reloads do not prompt while a local checkpoint succeeds.
 let prevented=false;h.c.cloud.dirty=true;h.events.beforeunload({preventDefault(){prevented=true}});assert(!prevented);
 // Successful logout removes synced local copies, but never discards pending work.
 for(const pending of [false,true]){
  h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();
  h.c.closeModal=()=>{};h.c.cloud.client.auth={signOut:async()=>({error:null})};h.c.cloud.dirty=pending;h.storage.set('mfd-feed-v1:alice','{}');
  await h.c.performFormaSignOut();assert.equal(h.c.cloud.user,null);assert.equal(h.c.state.water.test,0);assert.equal(h.storage.has('forma.account.alice'),pending);
  assert(!h.storage.has('mfd-feed-v1:alice'),'friends feed copy is removed on logout');
 }
 // A failed logout retains both the session and its local recovery copy.
 h=harness();h.seed('alice',documentFor(1),3);h.remote(Promise.resolve({data:{payload:documentFor(1),revision:3}}));await h.boot();h.c.cloud.client.auth={signOut:async()=>({error:Error('offline')})};await h.c.performFormaSignOut();assert.equal(h.c.cloud.user.id,'alice');assert(h.storage.has('forma.account.alice'));
 // Going to the background uploads at once: a workout finished just before the app is swiped away
 // reaches the cloud, so another copy (second phone, or Safari vs the home-screen app) has it.
 let shared={payload:{...documentFor(1),sessions:[{id:'yesterday',sets:[]}]},revision:3};
 const connect=x=>{x.c.window.formaSupabase.rpc=async(name,{document,expected_revision})=>{await new Promise(r=>setImmediate(r));if(expected_revision!==shared.revision)return{data:[{conflict:true}]};shared={payload:copy(document),revision:shared.revision+1};return{data:[{saved_revision:shared.revision}]}};x.remote(Promise.resolve({data:copy(shared)}))};
 h=harness();connect(h);h.seed('alice',copy(shared.payload),3);await h.boot();
 h.c.state={...h.c.state,sessions:[...h.c.state.sessions,{id:'today',sets:[]}]};h.c.cloud.patchKeys=['sessions'];h.c.save();
 assert.equal(h.timers.size>0,true);h.c.document.hidden=true;h.docEvents.visibilitychange();await new Promise(r=>setTimeout(r,20));h.timers.clear();
 assert.deepEqual(shared.payload.sessions.map(x=>x.id),['yesterday','today']);assert.equal(h.c.cloud.dirty,false);
 let other=harness();connect(other);await other.boot();assert.equal(other.c.state.sessions.at(-1).id,'today');
 // An edit made while already in the background (e.g. a last typed value flushed on hide) also goes straight up.
 h.c.state={...h.c.state,water:{test:5}};h.c.cloud.patchKeys=['water'];h.c.save();await new Promise(r=>setTimeout(r,20));assert.equal(shared.payload.water.test,5);
 // Closing or reloading a visible page uploads at once too.
 h.c.document.hidden=false;h.c.state={...h.c.state,water:{test:6}};h.c.cloud.patchKeys=['water'];h.c.save();h.events.pagehide();await new Promise(r=>setTimeout(r,20));assert.equal(shared.payload.water.test,6);
 // In the foreground, edits are still batched rather than uploaded one by one.
 h.c.state={...h.c.state,water:{test:7}};h.c.cloud.patchKeys=['water'];h.c.save();await new Promise(r=>setTimeout(r,20));assert.equal(shared.payload.water.test,6);
 // After failures, background uploads respect the retry back-off instead of hammering the server.
 h.c.window.formaSupabase.rpc=async()=>{throw Error('Failed to fetch')};await h.c.syncCloud();const until=h.c.cloud.retryAt;let tries=0;h.c.window.formaSupabase.rpc=async()=>{tries++;return{error:Error('x')}};h.c.document.hidden=true;h.docEvents.visibilitychange();await new Promise(r=>setTimeout(r,20));assert.equal(tries,0);assert(until>Date.now());
 console.log('PASS cached-first startup, offline journaling/recovery, account isolation, conflict baselines, GET/POST races, lifecycle flush, immediate background upload and safe logout cleanup');
})().catch(e=>{console.error(e);process.exit(1)});
