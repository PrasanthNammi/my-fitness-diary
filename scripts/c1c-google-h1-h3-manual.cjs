// Prepared runner: default mode is plan-only. No live baseline is created by this file.
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {run,requireSafeBaseline}=require('./c1c-alternative-lifecycle-core.cjs');
const {createManualGoogleFlow,ATTESTATION,ManualFailure}=require('./c1c-manual-google-flow.cjs');
const {hiddenInput}=require('./c1c-private-terminal.cjs');
const {record,phaseForCheck}=require('./c1c-safe-diagnostics.cjs');
const PLAN=Object.freeze({project:'gngnrmzeghjzqsmzuktl',mode:'MANUAL_SAFARI_PROPOSAL',
 max_new_first_party_sessions:2,max_manual_google_flows:2,max_runner_requests:30,
 browser_request_cap_machine_enforced:false,aggregate_40_request_cap_proven:false,
 max_flow_seconds:300,replay_wait_seconds:12,max_expiry_wait_seconds:4200,
 callbacks:'exact existing Worker callback; operator-attested fresh private main window',
 callback_input:'hidden local TTY, manually typed, never chat/clipboard/argv/files',
 browser_automation:false,remote_access:false,new_clients:false,settings_changes:false,
 automatic_retries:0,requires_manual_scope_approval:true,hosted_acceptance:false});
const isolationText=label=>'NEW PRIVATE '+label.toUpperCase()+' WINDOW; NO MFD LOGIN; NO EXISTING SESSION';
function confirmed(answer,statement){if(answer!=='y'&&answer!=='Y')throw new ManualFailure('MANUAL_ATTESTATION');return statement;}
function safeFailure(e){return e instanceof ManualFailure?{code:e.code}:record(e);}
async function runManualBatch({baseline,mapping,key,io,fetcher=fetch,sleep,now=()=>Date.now(),onCheck=()=>{},onProgress=()=>{}}){
 requireSafeBaseline(baseline);let requests=0,flows=0,phase='preflight',lastPassed=null;
 const progress=()=>onProgress({phase,last_passed:lastPassed,runner_requests:requests,manual_flows:flows});
 const result=await run({baseline,mapping,key,sleep,now,onCheck:label=>{lastPassed=record(new Error(label)).code;phase=phaseForCheck(label,phase);progress();onCheck(label);},
  fetcher:async(url,init)=>{if(++requests>PLAN.max_runner_requests)throw new ManualFailure('MANUAL_TRANSPORT');progress();return fetcher(url,init);},
  acquireSession:async({label,request})=>{
   phase=label+'_manual';if(++flows>2)throw new ManualFailure('MANUAL_USED');progress();
   if(await io.confirmIsolation(label)!==isolationText(label))throw new ManualFailure('MANUAL_ATTESTATION');
   const flow=createManualGoogleFlow({label,key,expectedUser:mapping[label+'_uuid'],now,
    transport:(url,init)=>request(new URL(url).pathname+new URL(url).search,'POST',undefined,JSON.parse(init.body))});
   let callbackUrl;
   try{
    const start=await flow.start();await io.showStart(start);
    const remaining=()=>{const ms=start.deadline_ms-now();if(ms<=0)throw new ManualFailure('MANUAL_EXPIRED');return ms;};
    const attestation=await io.confirmCallback(label,remaining());
    if(attestation!==ATTESTATION)throw new ManualFailure('MANUAL_ATTESTATION');
    callbackUrl=await io.readCallback(label,remaining());
    return await flow.complete({callbackUrl,attestation});
   }finally{callbackUrl=undefined;flow.dispose();}
  }});
 return {...result,runner_requests:requests,manual_flows:flows,
  browser_request_count:'NOT_MACHINE_OBSERVED',provenance:'operator attestation plus provider PKCE/issued-token verification'};
}
function verifyLivePreparation(){
 if(process.version!=='v22.13.1'||process.execArgv.length||process.env.NODE_OPTIONS||
  process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||process.env.NODE_EXTRA_CA_CERTS||process.env.SSLKEYLOGFILE||
  !process.stdin.isTTY||!process.stdout.isTTY)throw new ManualFailure('MANUAL_SETUP');
 if(execFileSync('/bin/sh',['-c','ulimit -c'],{encoding:'utf8'}).trim()!=='0')throw new ManualFailure('MANUAL_SETUP');
 const baselinePath='.sites-runtime/c1c-acceptance/approved-manual-baseline.json';
 const st=fs.lstatSync(baselinePath);
 if(!st.isFile()||(st.mode&0o077)||st.uid!==process.getuid())throw new ManualFailure('MANUAL_SETUP');
 const b=JSON.parse(fs.readFileSync(baselinePath));requireSafeBaseline(b);
 if(b.method!=='manual-safari'||b.manual_scope_approved!==true||b.manual_browser_budget_acknowledged!==true||
  b.reuse_interval_seconds!==10||b.policies?.single_session!==false||b.policies?.timebox_hours!==0||
  b.policies?.inactivity_hours!==0||b.policies?.replay_detection!==true||
  !Number.isFinite(Date.parse(b.observed_at))||Date.now()-Date.parse(b.observed_at)>300000||Date.parse(b.observed_at)>Date.now()+30000)
  throw new ManualFailure('MANUAL_SETUP');
 const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const path='docs/artifacts/c1c-manual-manifest.json';
 if(sha(path)!==b.authorized_manifest_sha256)throw new ManualFailure('MANUAL_SETUP');
 const manifest=JSON.parse(fs.readFileSync(path));
 for(const [file,hash]of Object.entries(manifest))if(sha(file)!==hash)throw new ManualFailure('MANUAL_SETUP');
 if(sha('.sites-runtime/c1b-release/wrangler.json')!=='e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5')throw new ManualFailure('MANUAL_SETUP');
 if(sha('.sites-runtime/independent/colocated-worker.js')!=='0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e')throw new ManualFailure('MANUAL_SETUP');
 return b;
}
if(require.main===module){let enabled=false;let latest={status:'not_started'};
 const write=()=>{if(!enabled)return;const file='.sites-runtime/c1c-acceptance/manual-live-progress.json';
  const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
  try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,JSON.stringify({...latest,at:new Date().toISOString()}));}finally{fs.closeSync(fd);}};
 (async()=>{
 if(process.argv[2]!=='--execute-approved-manual'){console.log(JSON.stringify(PLAN,null,2));return;}
 const baseline=verifyLivePreparation();
 const lock='.sites-runtime/c1c-acceptance/manual-'+baseline.authorized_manifest_sha256+'.lock';
 fs.writeFileSync(lock,'one-attempt batch; do not remove to retry\n',{flag:'wx',mode:0o600});
 enabled=true;latest={status:'running',phase:'preflight',runner_requests:0};write();
 const mapping=JSON.parse(fs.readFileSync('.sites-runtime/c1b-two-user-evidence/uuid-mapping.json'));
 const cfg=JSON.parse(fs.readFileSync('.sites-runtime/c1b-release/wrangler.json'));
 console.log('MANUAL STAGING TEST ONLY. No remote access/browser automation. Never send authentication material in chat.');
 const out=await runManualBatch({baseline,mapping,key:cfg.vars.MFD_SUPABASE_PUBLISHABLE_KEY,
  io:{
   confirmIsolation:async label=>{
    console.log('STEP 1 — Keep a NEW private Safari window ready for '+label.toUpperCase()+'. No existing MFD login/session; do not visit /login.');
    return confirmed(await hiddenInput('Is that window ready? Type y, then Enter (typing is hidden): '),isolationText(label));
   },
   showStart:async start=>{
    console.log('STEP 2 — Copy ONLY the following public link into that private Safari window, then select the approved '+start.label.toUpperCase()+' Google account once.');
    console.log(start.url);
    console.log('Select only the approved account once. Do not Retry, reload, save, screenshot or share the callback.');
    console.log('Expected callback page: CB_TRANSACTION_REQUIRED. Any other outcome: Ctrl-C, no retry.');
    console.log('After callback handoff, close only this test-owned private window; use a fresh one for SECONDARY.');
   },
   confirmCallback:async(_label,timeoutMs)=>{
    console.log('STEP 3 — In that same private MAIN window, confirm the address is the exact Worker /auth/google/callback?code=... and the page says CB_TRANSACTION_REQUIRED.');
    console.log('This must be your own fresh GET callback, with no Retry or reload. Otherwise press Ctrl-C.');
    return confirmed(await hiddenInput('Do you see that expected page? Type y, then Enter (hidden): ',{timeoutMs}),ATTESTATION);
   },
   readCallback:(_label,timeoutMs)=>hiddenInput('STEP 4 — Manually type that fresh full Safari callback address here (hidden), then Enter. Do NOT paste or send it to chat: ',{timeoutMs})
  },onProgress:p=>{latest={status:'running',...p};write();},onCheck:label=>console.log('PASS '+record(new Error(label)).code)});
 latest={...latest,status:'passed',phase:'complete'};write();
 console.log(JSON.stringify(out,null,2));
 })().catch(e=>{latest={...latest,status:'stopped',failure:safeFailure(e)};try{write();}catch{/* Fixed stderr only. */}
  console.error('STOP '+safeFailure(e).code+'; no retry, recovery or automatic cleanup.');process.exitCode=1;});}
module.exports={PLAN,isolationText,confirmed,safeFailure,runManualBatch,verifyLivePreparation};
