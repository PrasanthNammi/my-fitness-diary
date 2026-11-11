// Native Safari AppleEvents, not WebDriver. Secret stdout is an internal pipe only.
// No command here may be invoked from a chat tool to print a browser URL.
const {spawn}=require('node:child_process');const path=require('node:path');
const {AUTH,CALLBACK,classify}=require('./c1c-browser-policy.cjs');
const {parseCallback}=require('./c1c-manual-google-flow.cjs');
const CODES=new Set(['SAFARI_SETUP','SAFARI_CANCELLED','SAFARI_PERMISSION_OR_BRIDGE','SAFARI_WINDOW','SAFARI_TARGET','SAFARI_CALLBACK','SAFARI_TIMEOUT','SAFARI_USED']);
class SafariFailure extends Error{constructor(code){super(CODES.has(code)?code:'SAFARI_SETUP');this.code=this.message;}}
function invoke(operation,args=[],timeoutMs=15000){
 if(!['ready','pair','smoke','smoke_status','navigate','url','callback','close'].includes(operation))return Promise.reject(new SafariFailure('SAFARI_SETUP'));
 return new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/osascript',[path.join(__dirname,'c1c-safari-bridge.applescript'),operation,...args],{stdio:['ignore','pipe','pipe']});
  let bytes=0,parts=[],finished=false;const stop=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);parts=[];error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{child.kill('SIGTERM');stop(new SafariFailure('SAFARI_PERMISSION_OR_BRIDGE'));},timeoutMs);
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192){child.kill('SIGTERM');stop(new SafariFailure('SAFARI_CALLBACK'));}else parts.push(chunk);});
  // Never reflect AppleScript errors: they can contain the current page address.
  child.stderr.resume();child.on('error',()=>stop(new SafariFailure('SAFARI_PERMISSION_OR_BRIDGE')));
  child.on('close',code=>{if(finished)return;const text=Buffer.concat(parts).toString('utf8').replace(/\r?\n$/,'');stop(code===0?null:new SafariFailure('SAFARI_PERMISSION_OR_BRIDGE'),text);});
 });
}
async function ownedSafariWindow({label,bridge=invoke,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),onStatus=()=>{}}={}){
 if(!['primary','secondary'].includes(label))throw new SafariFailure('SAFARI_SETUP');
 // Preparation may be corrected before any authorization URL/code/verifier exists.
 // Never retry navigation, authentication, callback or exchange.
 let id;const preparationDeadline=now()+300000;
 for(let preparation=0;preparation<3;preparation++){
  const remaining=preparationDeadline-now();if(remaining<=0)throw new SafariFailure('SAFARI_TIMEOUT');
  onStatus('prepare_private_window');
  if(await bridge('ready',[label.toUpperCase(),...(preparation?['WINDOW_NOT_READY']:[])],remaining)!=='READY_PRIVATE')throw new SafariFailure('SAFARI_CANCELLED');
  if(now()>=preparationDeadline)throw new SafariFailure('SAFARI_TIMEOUT');
  const candidate=await bridge('pair',[],Math.min(60000,preparationDeadline-now()));
  if(/^[1-9]\d{0,9}$/.test(candidate)){id=candidate;break;}
  if(!['ERROR_WINDOW','ERROR_TABS','ERROR_NOT_RUNNING'].includes(candidate))throw new SafariFailure('SAFARI_WINDOW');
 }
 if(!id)throw new SafariFailure('SAFARI_WINDOW');
 onStatus('local_safari_smoke');
 if(await bridge('smoke',[id])!=='SMOKE_STARTED')throw new SafariFailure('SAFARI_WINDOW');
 const smokeDeadline=now()+15000;let smokeOK=false;
 while(now()<smokeDeadline){const result=await bridge('smoke_status',[id]);if(result==='SMOKE_OK'){smokeOK=true;break;}
  if(result!=='NOT_READY')throw new SafariFailure('SAFARI_WINDOW');await sleep(500);}
 if(!smokeOK)throw new SafariFailure('SAFARI_TIMEOUT');
 let started=false,captured=false,closed=false,navigated=true; // Local smoke already modified this owned test tab.
 return {async authorize(url,deadlineMs=now()+300000){
  if(started||closed)throw new SafariFailure('SAFARI_USED');started=true;
  const u=new URL(url);if(u.origin!==AUTH||u.pathname!=='/auth/v1/authorize'||u.searchParams.get('redirect_to')!==CALLBACK||u.searchParams.get('code_challenge_method')!=='s256')throw new SafariFailure('SAFARI_TARGET');
  if(await bridge('navigate',[id,url])!=='NAVIGATED')throw new SafariFailure('SAFARI_WINDOW');navigated=true;onStatus('awaiting_google_selection');let seenProvider=false;
  while(now()<deadlineMs){
   const current=await bridge('url',[id]);
   if(current.startsWith('ERROR_'))throw new SafariFailure('SAFARI_WINDOW');
   if(!seenProvider&&(current===''||current==='about:blank')){await sleep(500);continue;}
   const surface=classify(current);
   if(surface==='worker_callback'){
    try{parseCallback(current);}catch{throw new SafariFailure('SAFARI_CALLBACK');}
    const snapshot=await bridge('callback',[id]);
    if(snapshot==='NOT_READY'){await sleep(500);continue;}
    const at=snapshot.indexOf('\n');if(at<0||snapshot.slice(0,at)!==current||snapshot.slice(at+1)!=='EXPECTED_CALLBACK')throw new SafariFailure('SAFARI_CALLBACK');
    captured=true;onStatus('owned_callback_captured');return {url:current,provenance:'operator-private-attestation + pinned Safari window/tab + diagnostic snapshot',http_method_observed:false};
   }
   if(!['auth_authorize','auth_callback','google'].includes(surface))throw new SafariFailure('SAFARI_TARGET');
   seenProvider=true;await sleep(500);
  }
  throw new SafariFailure('SAFARI_TIMEOUT');
 },async close(){
  if(closed)return;closed=true;
  // Never close unowned/unmodified windows. The bridge refuses changed tab counts.
  if(navigated){const reply=await bridge('close',[id]);if(reply!=='CLOSED')throw new SafariFailure('SAFARI_WINDOW');}
 },evidence(){return {started,captured,closed,private_mode:'operator attested',existing_session_access:false};}};
}
module.exports={SafariFailure,invoke,ownedSafariWindow};
