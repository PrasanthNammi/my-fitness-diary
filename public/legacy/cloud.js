// The offline copy lives in device-store.js (IndexedDB); tests and old pages without it use localStorage.
const device=window.MFDDevice||{ready:Promise.resolve(false),get:k=>localStorage.getItem(k),set:(k,v)=>localStorage.setItem(k,v),remove:k=>localStorage.removeItem(k)};
if(window.MFDDevice)window.MFDDevice.onError=()=>{cloud.error='This device has no room for an offline copy. Your diary is safe online; keep the app connected until it syncs.';toast(cloud.error)};
const cloud={client:window.formaSupabase,user:null,revision:0,ready:false,dirty:false,busy:false,conflict:false,status:'Local only',error:'',generation:0,sequence:0,timer:null,google:false,starting:true,loading:false,offline:false,reconciling:false,journalPatch:{},cacheTimer:null,base:null,remote:null,choices:{},mergeConflicts:[],retryCount:0,retryAt:0,syncPaused:false,serverBase:null,serverIsBase:false,pullUnavailable:false,patchUnavailable:false,editedAt:{},wakePending:false,savePromise:null,refreshPromise:null,lastAttempt:0,lastSavedAt:0};
const beforeCloudRender=render;
render=function(){if(typeof canUseForma!=='function'||canUseForma())beforeCloudRender();updateCloudUI()};
function accountCacheKey(id){return 'forma.account.'+id}
function readAccountCache(id){try{const cached=JSON.parse(device.get(accountCacheKey(id))||'null'),journal=JSON.parse(device.get(accountCacheKey(id)+'.journal')||'null');if(cached){if(!cached.dirty&&!cached.baseDocument)cached.baseDocument=structuredClone(cached.document);if(cached.baseDelta)cached.baseDocument=MFDWorkspaceMerge.applyDelta(cached.document,cached.baseDelta);if(cached.remoteDelta)cached.remote={revision:cached.remoteDelta.revision,payload:MFDWorkspaceMerge.applyDelta(cached.document,cached.remoteDelta.patch)}}if(cached&&journal&&journal.userId===id&&journal.revision===cached.revision){cached.document={...cached.document,...journal.patch};cached.dirty=true;cached.pendingPatch=journal.patch}return cached}catch{return null}}
function cacheWorkspace(){clearTimeout(cloud.cacheTimer);try{if(cloud.user){const key=accountCacheKey(cloud.user.id);device.set(key,JSON.stringify({document:state,revision:cloud.revision,dirty:cloud.dirty,baseDelta:cloud.base?MFDWorkspaceMerge.delta(state,cloud.base):null,remoteDelta:cloud.remote?{revision:cloud.remote.revision,patch:MFDWorkspaceMerge.delta(state,cloud.remote.payload)}:null,choices:cloud.choices,editedAt:cloud.editedAt,serverIsBase:!!(cloud.serverBase&&cloud.serverIsBase)}));device.remove(key+'.journal');cloud.journalPatch={}}else localStorage.setItem(KEY,JSON.stringify(state));return true}catch{cloud.error='This device has no room for an offline copy. Your diary is safe online; keep the app connected until it syncs.';toast(cloud.error);return false}}
function journalWorkspace(keys){if(!cloud.user)return cacheWorkspace();try{for(const key of keys)cloud.journalPatch[key]=state[key];device.set(accountCacheKey(cloud.user.id)+'.journal',JSON.stringify({userId:cloud.user.id,revision:cloud.revision,patch:cloud.journalPatch}));clearTimeout(cloud.cacheTimer);cloud.cacheTimer=setTimeout(()=>{if(window.requestIdleCallback)window.requestIdleCallback(()=>cacheWorkspace(),{timeout:1200});else cacheWorkspace()},700);return true}catch{cloud.error='This device has no room for an offline copy. Your diary is safe online; keep the app connected until it syncs.';return false}}
save=function(){if(typeof canUseForma==='function'&&!canUseForma())return;cloud.sequence++;if(cloud.user)cloud.dirty=true;const keys=cloud.patchKeys;cloud.patchKeys=null;const editedAt=Date.now();for(const key of keys||['*'])cloud.editedAt[key]=editedAt;if(cloud.retryAt>editedAt+2000)cloud.retryAt=editedAt+2000;if(keys)journalWorkspace(keys);else cacheWorkspace();queueCloudSave();updateCloudUI()};
// Sync never stops while anything is unsaved (MFD 1.0.1):
// - after an edit the upload starts within 1.8 s (at once when the app goes to the background);
// - every sign of life wakes it immediately: app opened or back in front, focus, network back (wakeCloud);
// - a failure only delays the next attempt (1, 2, 4 … 15 s) and a 30 s safety check catches anything missed;
// - the same value changed here and in the cloud (e.g. by an AI assistant) is resolved automatically: the most
//   recent change wins and the other value is kept on this device (forma.account.<id>.resolved).
const RETRY_MAX=15000,SAFETY_EVERY=30000;
const networkError=e=>navigator.onLine===false||/fetch|network|offline|abort|timed? ?out|load failed|connection/i.test(e?.message||e?.name||'');
function queueCloudSave(now=document.hidden){if(!cloud.user||!cloud.ready||(!cloud.dirty&&!cloud.conflict))return;clearTimeout(cloud.timer);const wait=Math.max(0,cloud.retryAt-Date.now()),run=()=>{cloud.timer=null;if(cloud.conflict)refreshCloud();else syncCloud()};if(now&&!wait){run();return}cloud.timer=setTimeout(run,Math.max(now?0:1800,wait));updateCloudUI()}
// Going to the background: last chance to upload before the app may be closed (but no burst right after a failure).
function flushCloud(){if(!cloud.user||!cloud.dirty)return;cacheWorkspace();if(Date.now()-cloud.lastAttempt>5000)cloud.retryAt=0;queueCloudSave(true)}
// The wait itself isn't stored: pending changes are already on the device (journal/cache) from the edit.
function pauseCloudRetry(){cloud.retryCount++;cloud.retryAt=Date.now()+Math.min(RETRY_MAX,1000*2**Math.min(cloud.retryCount,5))}
let lastWake=0;
/** The app is in use again (opened, foreground, focus, network back, Sync now): skip any back-off and sync now. */
function wakeCloud(){if(!cloud.user||!cloud.ready)return;const now=Date.now();if(now-lastWake<1500)return;lastWake=now;cloud.retryAt=0;if(navigator.onLine!==false)cloud.offline=false;if(cloud.busy||cloud.reconciling){cloud.wakePending=true;return}clearTimeout(cloud.timer);cloud.timer=null;if(cloud.dirty&&!cloud.conflict)syncCloud(true);else refreshCloud()}
function afterCloudWork(){if(cloud.wakePending){cloud.wakePending=false;lastWake=0;setTimeout(wakeCloud,0);return}if(cloud.dirty||cloud.conflict)queueCloudSave()}
function safetyCheck(){if(!cloud.user||!cloud.ready||cloud.busy||cloud.reconciling||document.hidden)return;if((cloud.dirty||cloud.conflict)&&Date.now()>=cloud.retryAt&&Date.now()-cloud.lastAttempt>=SAFETY_EVERY-1000){clearTimeout(cloud.timer);cloud.timer=null;if(cloud.conflict)refreshCloud();else syncCloud()}}
function cloudLabel(){return cloud.starting?'Checking account…':!cloud.user?'Local only':!cloud.ready?'Account setup needed':cloud.busy||cloud.reconciling&&cloud.dirty?'Saving…':cloud.dirty||cloud.conflict?(cloud.retryCount?(cloud.offline?'No connection · will save when back online':'Not saved yet · retrying'):'Saving…'):cloud.error?'Sync needs attention':'All changes saved'}
function updateCloudUI(){let button=$('#account-button');if(!button){button=document.createElement('button');button.id='account-button';button.className='btn soft small';button.onclick=()=>openAccount();$('.header-right')?.prepend(button)}if(button){button.textContent=cloud.user?'Account':'Sign in';button.disabled=cloud.starting}let indicator=$('.local-indicator');if(indicator)indicator.textContent='● '+cloudLabel();let note=$('.side-bottom p');if(note)note.textContent=cloud.user?cloud.user.email:'Your entries stay in this browser.';let foot=$('footer span');if(foot)foot.textContent=cloud.user?'Private account · '+cloudLabel():'Browser storage · Sign in for cloud saving';let preview=$('.preview');if(preview)preview.textContent=cloud.user?'PRIVATE ACCOUNT':'LOCAL WORKSPACE';let label=$('#profile-storage-label');if(label)label.textContent=cloud.user?'PRIVATE ACCOUNT':'LOCAL PROFILE';let status=$('#cloud-live-status');if(status)status.textContent=cloudLabel()+(cloud.error?' · '+cloud.error:'');if(typeof renderAuthGate==='function')renderAuthGate()}
function localGuestData(){try{let d=JSON.parse(localStorage.getItem(KEY)||'null');return d&&validBackup(d)?d:null}catch{return null}}
function hasWorkspaceData(d){return !!d&&(d.profile?.onboarded||['sessions','meals','weights','checkins','products'].some(k=>d[k]?.length)||d.routines?.length)}

// Parts of the diary that only describe this device (the day being viewed): this device always keeps its own.
const DEVICE_ONLY=new Set(['mfdDate']);
function rememberResolved(list){if(!cloud.user||!list.length)return;try{const key=accountCacheKey(cloud.user.id)+'.resolved',old=JSON.parse(device.get(key)||'[]'),small=v=>{const t=JSON.stringify(v);return t===undefined||t.length>20000?'(large)':v};device.set(key,JSON.stringify([...list.map(c=>({at:Date.now(),path:c.path,kept:c.side,local:small(c.local),cloud:small(c.remote)})),...old].slice(0,50)))}catch{}}
/** Merge with automatic conflict resolution: per value, the more recent change wins (device-only parts stay local). */
function mergeCloud(base,local,remote,remoteAt){
 const first=MFDWorkspaceMerge.reconcile(base,local,remote,cloud.choices);if(!first.conflicts.length)return first;
 const remoteTime=Date.parse(remoteAt||'')||0,choices={...cloud.choices},decided=[];
 for(const c of first.conflicts){const top=c.path[0],localTime=cloud.editedAt[top]||cloud.editedAt['*']||0;const side=DEVICE_ONLY.has(top)||!remoteTime||localTime>remoteTime?'local':'cloud';choices[c.key]=side;decided.push({...c,side})}
 const merged=MFDWorkspaceMerge.reconcile(base,local,remote,choices);rememberResolved(decided);
 return {document:merged.document,conflicts:merged.conflicts};
}
function reconcileCloud(data){
 if(!validBackup(data.payload))throw Error('Unsupported workspace format');
 const remote=compactDocument(cloud.normalize?cloud.normalize(data.payload):data.payload);
 if(!cloud.dirty){state=structuredClone(remote);cloud.base=structuredClone(remote);cloud.revision=Number(data.revision);setServerBase(data.payload);cloud.conflict=false;cloud.remote=null;cloud.choices={};cloud.mergeConflicts=[];cloud.dirty=!MFDWorkspaceMerge.equal(remote,data.payload);cloud.serverIsBase=!cloud.dirty;return}
 const local=compactDocument(cloud.normalize?cloud.normalize(state):state),base=cloud.base&&compactDocument(cloud.normalize?cloud.normalize(cloud.base):cloud.base);
 const merged=mergeCloud(base||undefined,local,remote,data.updated_at);
 if(!validBackup(merged.document))throw Error('Could not reconcile workspace safely');
 // The durable cache preserves the pending document plus base/remote deltas; no destructive replacement.
 state=merged.document;if(base)cloud.base=structuredClone(base);cloud.mergeConflicts=merged.conflicts;cloud.conflict=merged.conflicts.length>0;cloud.remote=cloud.conflict?{payload:remote,revision:Number(data.revision)}:null;
 if(!cloud.conflict){cloud.base=structuredClone(remote);cloud.revision=Number(data.revision);setServerBase(data.payload);cloud.serverIsBase=false;cloud.choices={}}
 cloud.dirty=cloud.conflict||!MFDWorkspaceMerge.equal(state,data.payload);cloud.error='';
}
async function cloudRequest(request){if(typeof AbortController==='undefined'||typeof request.abortSignal!=='function')return request;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{return await request.abortSignal(controller.signal)}finally{clearTimeout(timer)}}
async function fetchCloudWorkspace(){return cloudRequest(cloud.client.from('forma_workspaces').select('payload,revision,updated_at').eq('user_id',cloud.user.id).maybeSingle())}
// Delta sync (database/DELTA_SYNC.md). cloud.serverBase is a private copy of exactly what the server
// holds at cloud.revision: changes are computed against it and applied to it. Whenever it can't be
// trusted it's dropped, and the next exchange is a full copy, as before.
const workspaceOps=window.MFDWorkspaceOps;
function missingRpc(error){return error?.code==='PGRST202'||error?.code==='42883'||error?.code==='PGRST205'||/could not find the (function|table)/i.test(error?.message||'')}
function compactDocument(doc){return workspaceOps?workspaceOps.compact(doc,null,false).document:doc}
function setServerBase(payload){cloud.serverBase=payload?structuredClone(payload):null}
async function pullCloudWorkspace(){
 if(workspaceOps&&cloud.serverBase&&cloud.revision>0&&!cloud.pullUnavailable){
  const {data,error}=await cloudRequest(cloud.client.rpc('forma_workspace_pull',{since_revision:cloud.revision}));
  if(error){if(!missingRpc(error))return {data:null,error};cloud.pullUnavailable=true}
  else if(data&&!data.full){const revision=Number(data.revision);
   if(revision===cloud.revision)return {data:{payload:cloud.serverBase,revision},error:null,unchanged:true};
   let doc;try{doc=cloud.serverBase;for(const change of data.changes||[])doc=workspaceOps.apply(doc,change.ops)}catch{cloud.serverBase=null;doc=null}
   if(doc){let updated_at=null;if(cloud.dirty){try{const at=await cloudRequest(cloud.client.from('forma_workspaces').select('updated_at').eq('user_id',cloud.user.id).maybeSingle());updated_at=at.data?.updated_at??null}catch{}}return {data:{payload:doc,revision,updated_at},error:null}}
  }
 }
 return fetchCloudWorkspace();
}
async function handleCloudSession(session){
 const user=session?.user;if(cloud.user?.id===user?.id&&!cloud.starting)return;
 if(cloud.user&&cloud.dirty)cacheWorkspace();
 if(typeof closeModal==='function')closeModal();
 const generation=++cloud.generation;clearTimeout(cloud.timer);clearTimeout(cloud.cacheTimer);cloud.ready=false;cloud.dirty=false;cloud.conflict=false;cloud.error='';cloud.busy=false;cloud.user=user||null;cloud.starting=false;cloud.loading=!!user;cloud.offline=false;cloud.reconciling=!!user;cloud.journalPatch={};cloud.base=null;cloud.remote=null;cloud.choices={};cloud.mergeConflicts=[];cloud.retryCount=0;cloud.retryAt=0;cloud.syncPaused=false;cloud.serverBase=null;cloud.serverIsBase=false;cloud.editedAt={};cloud.wakePending=false;cloud.savePromise=null;cloud.refreshPromise=null;
 if(!user){state=defaults();cloud.revision=0;cloud.reconciling=false;render();return}
 state=defaults();const cache=readAccountCache(user.id),cached=!!cache&&validBackup(cache.document);
 if(cached){state=cache.document;cloud.revision=cache.revision;cloud.dirty=!!cache.dirty;cloud.base=cache.baseDocument||(!cache.dirty?structuredClone(cache.document):null);cloud.remote=cache.remote||null;cloud.conflict=!!cloud.remote;cloud.choices=cache.choices||{};cloud.editedAt=cache.editedAt||{};if(cloud.dirty&&!Object.keys(cloud.editedAt).length)cloud.editedAt={'*':Date.now()};cloud.journalPatch=cache.pendingPatch||{};if(cache.serverIsBase&&cloud.base){cloud.serverBase=cloud.base;cloud.serverIsBase=true}cloud.ready=true;cloud.loading=false}
 render();try{const pulled=await pullCloudWorkspace(),{data,error}=pulled;if(generation!==cloud.generation)return;if(error)throw error;
 cloud.loading=false;if(data&&pulled.unchanged){cloud.ready=true;render();queueCloudSave()}
 else if(data){reconcileCloud(data);cloud.ready=true;cacheWorkspace();render();queueCloudSave()}
 else if(cached){cloud.revision=0;cloud.ready=true;cloud.dirty=true;cacheWorkspace();render();queueCloudSave()}
 else{cloud.revision=0;render();openMigration()}
 }catch(error){if(generation!==cloud.generation)return;cloud.loading=false;if(cached){cloud.ready=true;cloud.offline=networkError(error);cloud.error=cloud.offline?'':error.message||'Could not check updates';cloud.retryCount++;cloud.retryAt=Date.now()+2000;render();queueCloudSave()}else{cloud.error=error.message||'Could not load your account';render();setTimeout(()=>{if(generation===cloud.generation&&!cloud.ready&&cloud.user){cloud.starting=true;handleCloudSession({user:cloud.user})}},Math.min(RETRY_MAX,5000))}}
 finally{if(generation===cloud.generation){cloud.reconciling=false;updateCloudUI()}}
}
/** Upload pending changes. Waits for a save or check already running instead of skipping; resolves true when everything is saved. */
function syncCloud(force=false){
 if(!cloud.user||!cloud.ready)return Promise.resolve(false);
 if(cloud.busy&&cloud.savePromise)return cloud.savePromise;
 if(cloud.reconciling&&cloud.refreshPromise)return cloud.refreshPromise.then(()=>cloud.dirty?syncCloud():!cloud.conflict);
 // The first check at sign-in/start-up is still merging: save right after it, never alongside it.
 if(cloud.reconciling){queueCloudSave();return Promise.resolve(false)}
 if(!cloud.dirty&&!cloud.conflict)return Promise.resolve(true);
 // Waiting after a failure: only a wake-up (app back in use, network back, Sync now) skips the wait.
 if(!force&&Date.now()<cloud.retryAt){queueCloudSave();return Promise.resolve(false)}
 if(cloud.conflict)return refreshCloud().then(()=>cloud.dirty&&!cloud.conflict?syncCloud(true):!cloud.dirty&&!cloud.conflict);
 if(navigator.onLine===false){cloud.offline=true;pauseCloudRetry();queueCloudSave();updateCloudUI();return Promise.resolve(false)}
 cloud.savePromise=saveCloud().finally(()=>{cloud.savePromise=null});return cloud.savePromise;
}
async function saveCloud(){
 clearTimeout(cloud.timer);cloud.timer=null;cloud.busy=true;cloud.lastAttempt=Date.now();cloud.error='';updateCloudUI();const generation=cloud.generation;
 try{for(let attempt=0;attempt<2;attempt++){
  const compacted=compactDocument(state);if(compacted!==state)state=compacted;
  const sequence=cloud.sequence,document=structuredClone(state),revision=cloud.revision;
  const saveWhole=()=>cloudRequest(cloud.client.rpc('forma_save_workspace_v2',{document,expected_revision:revision}));
  const ops=workspaceOps&&cloud.serverBase&&revision>0&&!cloud.patchUnavailable?workspaceOps.diff(cloud.serverBase,document):null;
  let data,error,whole=!ops;
  if(ops&&!ops.length){data=[{saved_revision:revision,conflict:false,adjusted:false}];error=null}// the server already has exactly this
  else{({data,error}=await(ops?cloudRequest(cloud.client.rpc('forma_save_workspace_patch',{ops,expected_revision:revision})):saveWhole()));
   // Older server without patch saves, or a change that didn't fit the server copy: save the whole document, as before.
   if(ops&&error&&(missingRpc(error)||error.code==='22023')){if(missingRpc(error))cloud.patchUnavailable=true;cloud.serverBase=null;whole=true;({data,error}=await saveWhole())}}
  if(generation!==cloud.generation)return false;
  const result=data?.[0];
  if(result?.conflict||error?.code==='PT409'||error?.code==='40001'){
   const latest=await pullCloudWorkspace();if(generation!==cloud.generation)return false;if(latest.error)throw latest.error;if(!latest.data)throw Error('Workspace unavailable');if(!latest.unchanged)reconcileCloud(latest.data);cacheWorkspace();render();if(cloud.conflict)return false;if(!cloud.dirty){cloud.retryCount=0;cloud.retryAt=0;cloud.editedAt={};cloud.lastSavedAt=Date.now();return true}continue;
  }
  if(error)throw error;
  if(!result?.saved_revision)throw Error('Save not confirmed');cloud.base=document;cloud.revision=Number(result.saved_revision);
  // Whole-document saves and adjusted patches may be stored slightly differently: next exchange is a full copy.
  cloud.serverBase=whole||result.adjusted?null:document;cloud.serverIsBase=!!cloud.serverBase;cloud.offline=false;cloud.dirty=cloud.sequence!==sequence;cloud.retryCount=0;cloud.retryAt=0;cloud.lastSavedAt=Date.now();if(!cloud.dirty)cloud.editedAt={};cacheWorkspace();return true;
 }pauseCloudRetry();return false;
 }catch(error){if(generation===cloud.generation){cloud.offline=networkError(error);cloud.error=cloud.offline?'':error.message||'Sync unavailable';cloud.dirty=true;pauseCloudRetry()}return false}
 finally{if(generation===cloud.generation){cloud.busy=false;updateCloudUI();afterCloudWork()}}
}

// Backups include the original Hevy rows again: they're stored apart from the synced diary.
const exportWorkspaceOnly=typeof exportData==='function'?exportData:()=>{};
async function importRowsForBackup(){const rows=new Map();for(let from=0;;from+=1000){const {data,error}=await cloudRequest(cloud.client.from('forma_import_rows').select('session_id,rows').order('session_id').range(from,from+999));if(error){if(missingRpc(error))return rows;throw error}for(const r of data||[])rows.set(r.session_id,r.rows);if(!data||data.length<1000)return rows}}
globalThis.exportData=async function(){if(!cloud.user){exportWorkspaceOnly();return}let doc=state,complete=true;
 try{const rows=await importRowsForBackup();if(rows.size)doc={...state,sessions:state.sessions.map(s=>s&&!s.hevyRows&&rows.has(String(s.id))?{...s,hevyRows:rows.get(String(s.id))}:s)}}catch{complete=false}
 const url=URL.createObjectURL(new Blob([JSON.stringify(doc)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='forma-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 toast(complete?'Backup exported':'Backup exported without the original Hevy rows (offline). They are safe in your account.')};
function openMigration(){if(typeof renderMigrationScreen==='function')renderMigrationScreen()}
async function beginCloudWorkspace(useGuest){if(!cloud.user)return;let d=useGuest?localGuestData():defaults();if(!d){toast('No compatible browser data found');return}state=structuredClone(d);cloud.loading=false;cloud.ready=true;cloud.dirty=true;cloud.sequence++;cacheWorkspace();closeModal();render();let ok=await syncCloud();if(ok){if(useGuest){try{localStorage.removeItem(KEY)}catch{}}toast('Your private workspace is saved')}else{toast('Saved locally; cloud upload needs attention');openAccount()}}
function exportGuestBackup(){let guest=localGuestData();if(!guest){toast('No browser backup to export');return}downloadWorkspace(guest,'forma-browser-backup')}
function downloadWorkspace(doc,name){let url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));let link=document.createElement('a');link.href=url;link.download=name+'-'+today()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function openAccount(mode='signin'){if(cloud.user){modal(`${modalHead('Your account')}<p class="small-muted">${esc(cloud.user.email)}</p><div class="section-note" id="cloud-live-status">${esc(cloudLabel())}${cloud.error?' · '+esc(cloud.error):''}</div><div class="actions">${!cloud.ready&&!cloud.conflict?`<button class="btn" data-mfd-onclick="${mfdOn((()=>function(event){openMigration();
})())}">Set up workspace</button>`:''}<button class="btn secondary" data-mfd-onclick="${mfdOn((()=>function(event){exportData();
})())}">Download backup</button>${cloud.ready&&!cloud.conflict?`<button class="btn" data-mfd-onclick="${mfdOn((()=>function(event){manualCloudSync();
})())}">Sync now</button>`:''}${cloud.conflict?`<button class="btn" data-mfd-onclick="${mfdOn((()=>function(event){reviewCloudConflict();
})())}">Resolve conflict</button>`:''}<button class="btn secondary" data-mfd-onclick="${mfdOn((()=>function(event){signOutForma();
})())}">Sign out</button></div>`);return}modal(`${modalHead(mode==='signup'?'Create your My Fitness Diary account':'Welcome back')}<p class="small-muted">Your own workouts, nutrition, and progress—saved across devices.</p><div class="tabs"><button class="tab ${mode==='signin'?'active':''}" data-mfd-onclick="${mfdOn((()=>function(event){openAccount('signin');
})())}">Sign in</button><button class="tab ${mode==='signup'?'active':''}" data-mfd-onclick="${mfdOn((()=>function(event){openAccount('signup');
})())}">Create account</button></div><form id="auth-form" data-mfd-onsubmit="${mfdOn(((__mfd_v3)=>function(event){submitAccount(event, "" + String(__mfd_v3 ?? "") + "");
})(mode))}"><label for="auth-email">Email</label><input id="auth-email" type="email" required autocomplete="email" maxlength="254"><label for="auth-password">Password</label><input id="auth-password" type="password" required minlength="12" autocomplete="${mode==='signup'?'new-password':'current-password'}">${mode==='signup'?'<p class="small-muted">Use at least 12 characters. Confirm your email before signing in.</p>':''}<div id="auth-error" class="auth-error" role="status"></div><button id="auth-submit" class="btn full">${mode==='signup'?'Create account':'Sign in'}</button></form><div class="auth-divider">or</div><button type="button" id="google-signin-button" class="btn secondary full">Continue with Google</button><div id="google-auth-status" class="auth-error" role="status" aria-live="polite"></div>`);$('#google-signin-button').addEventListener('click',googleSignIn)}
async function submitAccount(event,mode){event.preventDefault();let email=$('#auth-email').value.trim(),password=$('#auth-password').value,button=$('#auth-submit');button.disabled=true;$('#auth-error').textContent='';try{let result=mode==='signup'?await cloud.client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await cloud.client.auth.signInWithPassword({email,password});if(result.error)throw result.error;$('#auth-password')&&($('#auth-password').value='');if(mode==='signup'&&!result.data.session){$('#auth-error').textContent='Check your inbox to confirm your email, then return and sign in.';return}closeModal();await handleCloudSession(result.data.session);toast('Signed in')}catch(error){let target=$('#auth-error');if(target)target.textContent=error.message||'Could not sign in'}finally{if($('#auth-submit'))$('#auth-submit').disabled=false}}
async function googleSignIn(){let button=$('#google-signin-button'),status=$('#google-auth-status');if(button?.disabled)return;let waiting;if(button){button.disabled=true;button.textContent='Connecting to Google…'}if(status)status.textContent='Preparing secure sign-in…';try{if(!cloud.client?.auth)throw Error('Account services did not load. Refresh the page and try again.');const result=await Promise.race([cloud.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,skipBrowserRedirect:true}}),new Promise((_,reject)=>{waiting=setTimeout(()=>reject(Error('Sign-in timed out. Refresh this page and try again.')),12000)})]);clearTimeout(waiting);if(result.error)throw result.error;if(!result.data?.url)throw Error('No sign-in link was returned.');let url=new URL(result.data.url);if(url.protocol!=='https:'||url.hostname!=='djyozltkmbzhwuvemxuy.supabase.co')throw Error('Unexpected sign-in destination.');if(status){status.textContent='Opening Google sign-in… ';let link=document.createElement('a');link.href=url.href;link.textContent='Click here if you are not redirected';link.target='_top';link.className='text-btn';status.appendChild(link)}(window.parent!==window?window.parent:window).location.assign(url.href)}catch(error){clearTimeout(waiting);let message=error.message||'Google sign-in could not start.';if(status)status.textContent=message;toast(message)}finally{if(button){button.disabled=false;button.textContent='Continue with Google'}}}

async function manualCloudSync(){cloud.retryCount=0;cloud.retryAt=0;cloud.syncPaused=false;if(navigator.onLine!==false)cloud.offline=false;if(!cloud.dirty||cloud.conflict)await refreshCloud();if(cloud.dirty)await syncCloud(true);openAccount()}
function refreshCloud(){if(!cloud.user||!cloud.ready)return Promise.resolve();if(cloud.reconciling&&cloud.refreshPromise)return cloud.refreshPromise;if(cloud.busy&&cloud.savePromise)return cloud.savePromise.then(()=>refreshCloud());cloud.refreshPromise=pullAndMerge().finally(()=>{cloud.refreshPromise=null});return cloud.refreshPromise}
async function pullAndMerge(){const generation=cloud.generation;cloud.reconciling=true;cloud.lastAttempt=Date.now();try{const pulled=await pullCloudWorkspace(),{data,error}=pulled;if(generation!==cloud.generation)return;if(error)throw error;if(data&&!pulled.unchanged){reconcileCloud(data);cacheWorkspace();render()}cloud.error='';cloud.offline=false;if(!cloud.dirty&&!cloud.conflict){cloud.retryCount=0;cloud.retryAt=0;cloud.lastSavedAt=cloud.lastSavedAt||Date.now()}}catch(error){if(generation!==cloud.generation)return;cloud.offline=networkError(error);cloud.error=cloud.offline?'':error.message||'Could not check for updates';if(cloud.dirty||cloud.conflict)pauseCloudRetry()}finally{if(generation===cloud.generation){cloud.reconciling=false;updateCloudUI();afterCloudWork()}}}
function conflictValue(value){if(value===undefined)return 'Deleted';if(value===null)return '—';if(typeof value==='object')return JSON.stringify(value);return String(value)}
function conflictLabel(c){const labels={kg:'Weight',reps:'Reps',catalogId:'Exercise',duration_seconds:'Time',distance_meters:'Distance',name:'Name',profile:'Profile',active:'Workout',water:'Water',meals:'Food',routines:'Routine',sessions:'Workout'};const root=c.path[0],key=c.path.find(p=>p.startsWith('id:'));const left=state[root],right=cloud.remote?.payload[root];const item=key&&([...(Array.isArray(left)?left:left?[left]:[]),...(Array.isArray(right)?right:right?[right]:[])].find(v=>'id:'+v.id===key));return [item?.name||labels[root]||root,labels[c.path.at(-1)]||c.path.at(-1)].filter(Boolean).join(' · ')}
function reviewCloudConflict(){if(!cloud.remote){refreshCloud();return}const result=MFDWorkspaceMerge.reconcile(cloud.base||undefined,state,cloud.normalize?cloud.normalize(cloud.remote.payload):cloud.remote.payload,cloud.choices);cloud.mergeConflicts=result.conflicts;cloud.reviewSequence=cloud.sequence;modal(`${modalHead('Review')}<p class="small-muted">Both versions are saved. Choose the value to keep.</p>${result.conflicts.map((c,i)=>`<section class="sync-choice"><strong>${esc(conflictLabel(c))}</strong><div class="actions"><button class="btn secondary" data-mfd-onclick="${mfdOn(((__mfd_v1)=>function(event){chooseSyncValue(__mfd_v1, 'local');
})(i))}"><small>This device</small><span>${esc(conflictValue(c.local))}</span></button><button class="btn secondary" data-mfd-onclick="${mfdOn(((__mfd_v3)=>function(event){chooseSyncValue(__mfd_v3, 'cloud');
})(i))}"><small>Cloud</small><span>${esc(conflictValue(c.remote))}</span></button></div></section>`).join('')}<button class="btn secondary full" data-mfd-onclick="${mfdOn((()=>function(event){closeModal();
})())}">Later</button>`)}
function chooseSyncValue(index,choice){if(cloud.reviewSequence!==cloud.sequence){reviewCloudConflict();return}const item=cloud.mergeConflicts[index];if(!item||!cloud.remote)return;cloud.choices[item.key]={side:choice,local:item.local,remote:item.remote};const remote=cloud.remote;reconcileCloud(remote);cloud.sequence++;cacheWorkspace();render();if(cloud.conflict)reviewCloudConflict();else{closeModal();queueCloudSave()}}
async function reloadCloudConfirmed(){await refreshCloud();if(cloud.conflict)reviewCloudConflict()}

async function signOutForma(){if(cloud.busy){toast('Wait for the current save before signing out');return}if(cloud.dirty){modal(`${modalHead('Changes are still on this device')}<p class="small-muted">Export a backup or try syncing. Your account-specific local copy will remain available when you sign in again on this browser.</p><div class="actions"><button class="btn secondary" data-mfd-onclick="${mfdOn((()=>function(event){exportData();
})())}">Export backup</button><button class="btn secondary" data-mfd-onclick="${mfdOn((()=>function(event){manualCloudSync();
})())}">Try sync</button><button class="btn danger" data-mfd-onclick="${mfdOn((()=>function(event){performFormaSignOut();
})())}">Sign out anyway</button></div>`);return}await performFormaSignOut()}
async function performFormaSignOut(){const userId=cloud.user?.id,keepPending=cloud.dirty;if(!cacheWorkspace()&&keepPending)return;const {error}=await cloud.client.auth.signOut({scope:'local'});if(error){toast(error.message);return}if(userId){try{localStorage.removeItem('mfd-feed-v1:'+userId)}catch{}}if(userId&&!keepPending){try{device.remove(accountCacheKey(userId));device.remove(accountCacheKey(userId)+'.journal')}catch{}}closeModal();await handleCloudSession(null);state=defaults();render();toast('Signed out on this device')}
async function initializeCloud(){await device.ready;if(!cloud.client){cloud.starting=false;cloud.error='Sign-in is temporarily unavailable. Please refresh and try again.';updateCloudUI();return}cloud.client.auth.onAuthStateChange((event,session)=>{if(event==='INITIAL_SESSION')return;if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED'].includes(event))setTimeout(()=>handleCloudSession(session),0)});try{const {data,error}=await cloud.client.auth.getSession();if(error)throw error;if(data.session){await handleCloudSession(data.session)}else{cloud.starting=false;updateCloudUI()}}catch(error){cloud.starting=false;cloud.error=error.message;updateCloudUI()}}

window.addEventListener('focus',wakeCloud);window.addEventListener('pageshow',wakeCloud);window.addEventListener('online',()=>{cloud.offline=false;lastWake=0;wakeCloud()});window.addEventListener('pagehide',flushCloud);document.addEventListener('visibilitychange',()=>{if(document.hidden)flushCloud();else wakeCloud()});window.addEventListener('offline',()=>{cloud.offline=true;updateCloudUI()});if(typeof setInterval==="function")setInterval(safetyCheck,SAFETY_EVERY);
window.addEventListener('beforeunload',event=>{if(cloud.user&&cloud.dirty&&!cacheWorkspace()){event.preventDefault();event.returnValue=''}});
initializeCloud();
const oauthErrorParams=new URLSearchParams(location.search);if(oauthErrorParams.has('error_description')){setTimeout(()=>{openAccount();const el=$('#google-auth-status');if(el)el.textContent=oauthErrorParams.get('error_description')},300)}

function resetModal(){if(!cloud.user){localResetModal();return}modal(`${modalHead('Your cloud workspace is connected')}<p class="small-muted">Local reset is unavailable while signed in, so it cannot accidentally erase your cloud history. Export a backup before making bulk changes.</p><div class="actions"><button class="btn secondary" data-mfd-onclick="${mfdOn((()=>function(event){exportData();
})())}">Export backup</button><button class="btn" data-mfd-onclick="${mfdOn((()=>function(event){closeModal();
})())}">Keep my workspace</button></div>`)}
