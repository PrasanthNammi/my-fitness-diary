// LOCAL PREPARATION ONLY. No CLI live mode, browser launch, credential input or logging.
// The transport is deliberately supplied by a separately approved owned-flow harness.
const {createClient}=require('@supabase/supabase-js');const crypto=require('node:crypto');
const BASE='https://gngnrmzeghjzqsmzuktl.supabase.co';const CALLBACK='https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback';
function createOwnedGoogleFlow({key,expectedUser,browserContext,transport,now=()=>Date.now()}){
 if(!key?.startsWith('sb_publishable_')||typeof expectedUser!=='string'||!expectedUser||!browserContext||typeof transport!=='function')throw Error('GOOGLE_PLAN_CONTEXT_REQUIRED');
 const memory=new Map();let started=false,used=false,deadline=0,calls=0,challenge;
 const client=createClient(BASE,key,{auth:{storageKey:'c1c-owned-'+crypto.randomBytes(16).toString('hex'),storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce',debug:false},global:{fetch:async(url,init)=>{if(++calls>1||url!==BASE+'/auth/v1/token?grant_type=pkce'||init?.method!=='POST')throw Error('GOOGLE_PLAN_TRANSPORT_DENIED');try{return await transport(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw Error('GOOGLE_PLAN_EXCHANGE_FAILED');}}}});
 return {
  async start(){if(started)throw Error('GOOGLE_PLAN_ALREADY_STARTED');started=true;deadline=now()+300000;const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:CALLBACK,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});if(error||!data?.url)throw Error('GOOGLE_PLAN_START_FAILED');const u=new URL(data.url);if(u.origin!==BASE||u.pathname!=='/auth/v1/authorize'||u.searchParams.get('redirect_to')!==CALLBACK||u.searchParams.get('provider')!=='google'||u.searchParams.get('code_challenge_method')!=='s256'||!/^[A-Za-z0-9_-]{43}$/.test(u.searchParams.get('code_challenge')||''))throw Error('GOOGLE_PLAN_START_DRIFT');challenge=u.searchParams.get('code_challenge');return {url:u.href,browserContext};},
  async complete({url,context,mainFrame,method}){if(!started||used)throw Error('GOOGLE_PLAN_NOT_PENDING');used=true;
   try{if(context!==browserContext||mainFrame!==true||method!=='GET'||now()>deadline)throw Error('GOOGLE_PLAN_BINDING');const u=new URL(url);if(u.origin+u.pathname!==CALLBACK||u.hash||u.username||u.password||[...u.searchParams.keys()].some(k=>k!=='code')||u.searchParams.getAll('code').length!==1)throw Error('GOOGLE_PLAN_CALLBACK');const code=u.searchParams.get('code');if(!code||code.length>2048||/[\s\x00-\x1f]/.test(code))throw Error('GOOGLE_PLAN_CODE');const {data,error}=await client.auth.exchangeCodeForSession(code);if(error||!data?.session)throw Error('GOOGLE_PLAN_EXCHANGE');const s=data.session;let c;try{c=JSON.parse(Buffer.from(s.access_token.split('.')[1],'base64url'));}catch{throw Error('GOOGLE_PLAN_TOKEN');}if(data.user?.id!==expectedUser||c.sub!==expectedUser||c.iss!==BASE+'/auth/v1'||c.aud!=='authenticated'||c.role!=='authenticated'||c.client_id!==undefined||typeof c.session_id!=='string'||!c.session_id||typeof c.exp!=='number'||c.exp<=now()/1000||(c.nbf!==undefined&&(typeof c.nbf!=='number'||c.nbf>now()/1000))||!s.refresh_token)throw Error('GOOGLE_PLAN_IDENTITY');return {access_token:s.access_token,refresh_token:s.refresh_token,user:{id:expectedUser},expires_at:c.exp};}
   finally{memory.clear();}
  },
  // Counts only; never exposes verifier/session/callback contents.
  evidence(){return {started,consumed:used,exchange_requests:calls,memory_entries:memory.size,has_s256_challenge:!!challenge};}
 };
}
module.exports={BASE,CALLBACK,createOwnedGoogleFlow};
