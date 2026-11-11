// Prepared native Safari capture, no live baseline supplied by this file.
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {run,requireSafeBaseline}=require('./c1c-alternative-lifecycle-core.cjs');
const {createManualGoogleFlow,ATTESTATION,ManualFailure}=require('./c1c-manual-google-flow.cjs');
const {ownedSafariWindow,SafariFailure}=require('./c1c-safari-owned-window.cjs');
const {record,phaseForCheck}=require('./c1c-safe-diagnostics.cjs');
const PLAN={mode:'PROPOSED_NATIVE_SAFARI_CAPTURE',project:'gngnrmzeghjzqsmzuktl',new_sessions_max:2,runner_requests_max:30,
 browser_requests_machine_counted:false,private_mode:'operator attested; not exposed by Safari scripting dictionary',
 existing_browser_data:'never read before pairing; only the attested dedicated one-tab test window afterward',
 callback_transfer:'internal private pipe; no user copy/paste/Terminal entry',google_authentication:'human only, normal browser',
 platform_permission:'macOS Automation for Safari may require operator consent; no Accessibility/JavaScript enabling',
 settings_changes:false,deployments:false,automatic_retries:0,window_preparation_checks_max:3,window_preparation_deadline_seconds:300,requires_new_approval:true};
function safeFailure(e){return e instanceof SafariFailure||e instanceof ManualFailure?{code:e.code}:record(e);}
async function runSafariBatch({baseline,mapping,key,bridge,fetcher=fetch,sleep,now=()=>Date.now(),onProgress=()=>{}}){
 requireSafeBaseline(baseline);let requests=0,flows=0,phase='preflight',lastPassed=null;const usedWindows=new Set();
 const progress=()=>onProgress({phase,last_passed:lastPassed,runner_requests:requests,flows});
 return run({baseline,mapping,key,sleep,now,onCheck:label=>{lastPassed=record(new Error(label)).code;phase=phaseForCheck(label,phase);progress();},
  fetcher:(url,init)=>{if(++requests>30)throw new SafariFailure('SAFARI_SETUP');progress();return fetcher(url,init);},
  acquireSession:async({label,request})=>{
   if(++flows>2)throw new SafariFailure('SAFARI_USED');phase=label+'_private_window';progress();
   let pairID;const checkedBridge=async(operation,args,timeout)=>{
    if(pairID&&['smoke','smoke_status','navigate','url','callback','close'].includes(operation)&&args[0]!==pairID)throw new SafariFailure('SAFARI_WINDOW');
    const result=await bridge(operation,args,timeout);
    if(operation==='pair'&&/^[1-9]\d{0,9}$/.test(result)){if(usedWindows.has(result))throw new SafariFailure('SAFARI_USED');usedWindows.add(result);pairID=result;}
    return result;
   };
   const window=await ownedSafariWindow({label,bridge:checkedBridge,now,sleep,onStatus:s=>{phase=label+'_'+s;progress();}});
   const flow=createManualGoogleFlow({key,label,expectedUser:mapping[label+'_uuid'],now,
    transport:(url,init)=>request(new URL(url).pathname+new URL(url).search,'POST',undefined,JSON.parse(init.body))});
   let captured;
   try{
    phase=label+'_public_auth_preflight';progress();
    const settings=await request('/auth/v1/settings');
    if(settings.status!==200)throw new SafariFailure('SAFARI_SETUP');const publicSettings=await settings.json();
    if(publicSettings.disable_signup!==true||publicSettings.external?.google!==true||publicSettings.external?.anonymous_users!==false||!Number.isFinite(Date.parse(settings.headers.get('date')))||Math.abs(Date.parse(settings.headers.get('date'))-now())>30000)throw new SafariFailure('SAFARI_SETUP');
    const start=await flow.start();captured=await window.authorize(start.url,start.deadline_ms);
    // The private-window attestation is human; the pinned main tab and expected
    // diagnostic are checked by the native bridge. No fabricated CDP method proof.
    phase=label+'_exchange';progress();return await flow.complete({callbackUrl:captured.url,attestation:ATTESTATION});
   }finally{captured=undefined;flow.dispose();await window.close();}
  }});
}
if(require.main===module){let enabled=false,latest={status:'not_started'};
 const write=()=>{if(!enabled)return;const p='.sites-runtime/c1c-acceptance/safari-live-progress.json';const fd=fs.openSync(p,fs.constants.O_NOFOLLOW|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_WRONLY,0o600);try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,JSON.stringify({...latest,at:new Date().toISOString()}));}finally{fs.closeSync(fd);}};
 (async()=>{
  if(process.argv[2]!=='--execute-approved-safari'){console.log(JSON.stringify(PLAN,null,2));return;}
  if(process.version!=='v22.13.1'||process.execArgv.length||process.env.NODE_OPTIONS||process.env.NODE_EXTRA_CA_CERTS||process.env.SSLKEYLOGFILE||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||execFileSync('/bin/sh',['-c','ulimit -c'],{encoding:'utf8'}).trim()!=='0')throw new SafariFailure('SAFARI_SETUP');
  const p='.sites-runtime/c1c-acceptance/approved-safari-baseline.json',st=fs.lstatSync(p);
  if(!st.isFile()||(st.mode&0o077)||st.uid!==process.getuid())throw new SafariFailure('SAFARI_SETUP');
  const b=JSON.parse(fs.readFileSync(p));requireSafeBaseline(b);
  if(b.method!=='safari-owned-window-stepwise'||b.safari_scope_approved!==true||b.browser_budget_acknowledged!==true||b.local_safari_smoke_approved!==true||b.reuse_interval_seconds!==10||b.policies?.single_session!==false||b.policies?.timebox_hours!==0||b.policies?.inactivity_hours!==0||b.policies?.replay_detection!==true||!Number.isFinite(Date.parse(b.observed_at))||Date.now()-Date.parse(b.observed_at)>300000||Date.parse(b.observed_at)>Date.now()+30000)throw new SafariFailure('SAFARI_SETUP');
  const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');const mp='docs/artifacts/c1c-safari-stepwise-manifest.json';
  if(sha(mp)!==b.authorized_manifest_sha256)throw new SafariFailure('SAFARI_SETUP');
  for(const [file,h]of Object.entries(JSON.parse(fs.readFileSync(mp))))if(sha(file)!==h)throw new SafariFailure('SAFARI_SETUP');
  if(sha('.sites-runtime/c1b-release/wrangler.json')!=='e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5'||sha('.sites-runtime/independent/colocated-worker.js')!==b.authorized_runtime_sha256)throw new SafariFailure('SAFARI_SETUP');
  fs.writeFileSync('.sites-runtime/c1c-acceptance/safari-'+b.authorized_manifest_sha256+'.lock','one approved run; no retry\n',{mode:0o600,flag:'wx'});
  enabled=true;latest={status:'running',phase:'preflight',runner_requests:0};write();
  const {invoke}=require('./c1c-safari-owned-window.cjs'),mapping=JSON.parse(fs.readFileSync('.sites-runtime/c1b-two-user-evidence/uuid-mapping.json')),cfg=JSON.parse(fs.readFileSync('.sites-runtime/c1b-release/wrangler.json'));
  const result=await runSafariBatch({baseline:b,mapping,key:cfg.vars.MFD_SUPABASE_PUBLISHABLE_KEY,bridge:invoke,onProgress:p=>{latest={status:'running',...p};write();}});
  latest={...latest,status:'passed',phase:'complete'};write();console.log(JSON.stringify(result));
 })().catch(e=>{latest={...latest,status:'stopped',failure:safeFailure(e)};try{write();}catch{}console.error('STOP '+safeFailure(e).code+'; no retry or automatic hosted recovery');process.exitCode=1;});
}
module.exports={PLAN,runSafariBatch,safeFailure};
