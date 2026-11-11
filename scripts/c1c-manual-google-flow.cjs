// Local preparation. No browser control, CLI, logging, filesystem or default network transport.
// Operator attestation is explicit; this never fabricates CDP/browser-context evidence.
const {createClient}=require('@supabase/supabase-js');
const crypto=require('node:crypto');
const {BASE,CALLBACK}=require('./c1c-google-pkce-plan.cjs');
const ATTESTATION='NEW PRIVATE MAIN WINDOW; OWN FRESH GET CALLBACK; CB_TRANSACTION_REQUIRED; NO RETRY';
const CODES=new Set(['MANUAL_SETUP','MANUAL_USED','MANUAL_EXPIRED','MANUAL_ATTESTATION','MANUAL_CALLBACK','MANUAL_START','MANUAL_TRANSPORT','MANUAL_EXCHANGE','MANUAL_IDENTITY','MANUAL_CANCELLED']);
class ManualFailure extends Error {
 constructor(code){super(CODES.has(code)?code:'MANUAL_EXCHANGE');this.code=this.message;}
}
function parseCallback(value){
 if(typeof value!=='string'||value.length>4096||/[\s\x00-\x1f\x7f]/.test(value))throw new ManualFailure('MANUAL_CALLBACK');
 let u;try{u=new URL(value);}catch{throw new ManualFailure('MANUAL_CALLBACK');}
 if(u.href!==value||u.origin+u.pathname!==CALLBACK||u.username||u.password||u.hash||
   [...u.searchParams.keys()].some(k=>k!=='code')||u.searchParams.getAll('code').length!==1)
  throw new ManualFailure('MANUAL_CALLBACK');
 const code=u.searchParams.get('code');
 if(!code||code.length>2048||!/[A-Za-z0-9]/.test(code)||/[^A-Za-z0-9._~-]/.test(code))throw new ManualFailure('MANUAL_CALLBACK');
 return code;
}
function createManualGoogleFlow({key,expectedUser,label,transport,now=()=>Date.now()}){
 if(!key?.startsWith('sb_publishable_')||typeof expectedUser!=='string'||!expectedUser||
   !['primary','secondary'].includes(label)||typeof transport!=='function')throw new ManualFailure('MANUAL_SETUP');
 const memory=new Map();let started=false,consumed=false,disposed=false,deadline=0,exchanges=0;
 const clear=()=>{memory.clear();disposed=true;};
 const client=createClient(BASE,key,{auth:{flowType:'pkce',autoRefreshToken:false,detectSessionInUrl:false,
  persistSession:true,debug:false,storageKey:'c1c-manual-'+crypto.randomBytes(16).toString('hex'),
  storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}},
  global:{fetch:async(url,init)=>{
   if(++exchanges!==1||url!==BASE+'/auth/v1/token?grant_type=pkce'||init?.method!=='POST')throw new ManualFailure('MANUAL_TRANSPORT');
   try{return await transport(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)});}
   catch{throw new ManualFailure('MANUAL_TRANSPORT');}
  }}});
 return {
  async start(){
   if(started||disposed)throw new ManualFailure('MANUAL_USED');started=true;deadline=now()+300000;
   try{
    const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:CALLBACK,
     skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
    if(error||!data?.url)throw new ManualFailure('MANUAL_START');
    const u=new URL(data.url);
    if(u.origin!==BASE||u.pathname!=='/auth/v1/authorize'||u.searchParams.get('provider')!=='google'||
      u.searchParams.get('redirect_to')!==CALLBACK||u.searchParams.get('code_challenge_method')!=='s256'||
      !/^[A-Za-z0-9_-]{43}$/.test(u.searchParams.get('code_challenge')||''))throw new ManualFailure('MANUAL_START');
    // Public initiation URL only: no verifier, callback code, user identifier or bearer.
    return {url:u.href,label,expires_in_seconds:300,deadline_ms:deadline,provenance:'operator-attested-private-browser'};
   }catch{clear();throw new ManualFailure('MANUAL_START');}
  },
  async complete({callbackUrl,attestation}={}){
   if(!started||consumed||disposed)throw new ManualFailure('MANUAL_USED');consumed=true;
   try{
    if(now()>=deadline)throw new ManualFailure('MANUAL_EXPIRED');
    if(attestation!==ATTESTATION)throw new ManualFailure('MANUAL_ATTESTATION');
    const code=parseCallback(callbackUrl);
    const {data,error}=await client.auth.exchangeCodeForSession(code);
    if(error||!data?.session)throw new ManualFailure('MANUAL_EXCHANGE');
    const s=data.session;let c;try{c=JSON.parse(Buffer.from(s.access_token.split('.')[1],'base64url'));}
    catch{throw new ManualFailure('MANUAL_IDENTITY');}
    if(data.user?.id!==expectedUser||c.sub!==expectedUser||c.iss!==BASE+'/auth/v1'||c.aud!=='authenticated'||
      c.role!=='authenticated'||c.client_id!==undefined||typeof c.session_id!=='string'||!c.session_id||
      typeof c.exp!=='number'||c.exp<=now()/1000||(c.nbf!==undefined&&(typeof c.nbf!=='number'||c.nbf>now()/1000))||
      typeof s.refresh_token!=='string'||!s.refresh_token)throw new ManualFailure('MANUAL_IDENTITY');
    // Lifecycle core must independently verify signature, claims and exclusion from original session set.
    return {access_token:s.access_token,refresh_token:s.refresh_token,user:{id:expectedUser},expires_at:c.exp};
   }catch(e){throw e instanceof ManualFailure?e:new ManualFailure('MANUAL_EXCHANGE');}
   finally{clear();}
  },
  dispose(){consumed=true;clear();},
  evidence(){return {label,started,consumed,exchange_requests:exchanges,memory_entries:memory.size,
   provenance:'operator-attested-private-browser',machine_verified_browser_context:false};}
 };
}
module.exports={BASE,CALLBACK,ATTESTATION,ManualFailure,parseCallback,createManualGoogleFlow};
