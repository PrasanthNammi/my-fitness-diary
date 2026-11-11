// LOCAL ONLY. Default invocation prints a plan; live mode requires separate approval.
// Credentials exist only in this process. Never add response/request logging here.
const fs=require('node:fs'),crypto=require('node:crypto');
const BASE='https://gngnrmzeghjzqsmzuktl.supabase.co',WORKER='https://mfd-connect-staging.shanustylish777.workers.dev';
const PLAN={project:'gngnrmzeghjzqsmzuktl',new_sessions:2,max_http_requests:40,max_wait_seconds:4200,grants:'unchanged',logout_scope:'local',new_clients:0,token_persistence:false,oauth_client_lifecycle:'not covered'};
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function requireSafeBaseline(b){if(b.project!==PLAN.project||b.session_policy_safe!==true||!Number.isInteger(b.reuse_interval_seconds)||b.reuse_interval_seconds<0||b.reuse_interval_seconds>120||!Array.isArray(b.existing_session_hashes)||!b.existing_session_hashes.length)throw Error('BASELINE_REQUIRED');}
function claims(t){try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url'));}catch{throw Error('TOKEN_FORMAT');}}
async function run({baseline,mapping,key,credentials,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now()}){
 requireSafeBaseline(baseline);let calls=0;const evidence=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);evidence.push(label);};
 async function request(path,method='GET',token,body,worker=false){if(++calls>PLAN.max_http_requests)throw Error('REQUEST_CAP');if(!path.startsWith('/')||path.startsWith('//'))throw Error('PATH');const r=await fetcher((worker?WORKER:BASE)+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(r.status>=300&&r.status<400)throw Error('UNEXPECTED_REDIRECT');return r;}
 const keysResponse=await request('/auth/v1/.well-known/jwks.json');check(keysResponse.status===200,'PUBLIC_KEYS_STATUS');const jwks=await keysResponse.json();check(Array.isArray(jwks.keys)&&jwks.keys.length>0,'PUBLIC_KEYS_REQUIRED');
 const people=[];
 for(const [index,label] of ['primary','secondary'].entries()){
  const r=await request('/auth/v1/token?grant_type=password','POST',undefined,credentials[index]);if(r.status!==200)throw Error('SIGNIN_STOP');const session=await r.json(),t=session.access_token,c=claims(t),h=JSON.parse(Buffer.from(t.split('.')[0],'base64url')),jwk=jwks.keys.find(k=>k.kid===h.kid);
  check(h.alg==='ES256'&&!!jwk&&crypto.verify('sha256',Buffer.from(t.split('.').slice(0,2).join('.')),{key:crypto.createPublicKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(t.split('.')[2],'base64url')),'ISSUED_SIGNATURE_'+label);
  check(c.sub===mapping[label+'_uuid']&&c.iss===BASE+'/auth/v1'&&c.aud==='authenticated'&&c.role==='authenticated'&&c.client_id===undefined&&typeof c.session_id==='string'&&c.exp>now()/1000&&(!c.nbf||c.nbf<=now()/1000),'ISSUED_CLAIMS_'+label);
  check(!baseline.existing_session_hashes.includes(digest(c.session_id)),'DISPOSABLE_SESSION_'+label);
  check(session.user?.id===c.sub&&typeof session.refresh_token==='string','SESSION_REPLY_'+label);
  people.push({label,session,claims:c});
  const own=await request('/rest/v1/forma_workspaces?select=payload,revision&user_id=eq.'+c.sub,'GET',t);check(own.status===200,'OWN_READ_STATUS_'+label);const rows=await own.json();check(rows.length===1&&rows[0].payload.profile.name==='MFD STAGING '+(index?'B':'A')&&rows[0].revision===1,'OWN_FIXTURE_'+label);
  const other=await request('/rest/v1/forma_workspaces?select=revision&user_id=eq.'+mapping[(index?'primary':'secondary')+'_uuid'],'GET',t);check(other.status===200&&(await other.json()).length===0,'CROSS_OWNER_DENIED_'+label);
  const connections=await request('/rest/v1/rpc/mfd_mcp','POST',t,{operation:'connections',args:{}});check(connections.status===200,'LIVE_RPC_'+label);const grants=await connections.json();check(grants.length===1&&grants[0].client_id==='fcad3c45-07cd-418a-978a-7e1d94ee0406'&&JSON.stringify(grants[0].permissions)==='["profile"]','PROFILE_ONLY_'+label);
  check((await request('/mcp','GET',t,undefined,true)).status===401,'FIRST_PARTY_NOT_MCP_'+label);
 }
 check(people[0].claims.session_id!==people[1].claims.session_id,'DISTINCT_SESSIONS');
 async function refresh(p,old){const r=await request('/auth/v1/token?grant_type=refresh_token','POST',undefined,{refresh_token:old});check(r.status===200,'REFRESH_OK_'+p.label);const s=await r.json();check(claims(s.access_token).session_id===p.claims.session_id&&claims(s.access_token).sub===p.claims.sub&&s.refresh_token!==old,'ROTATION_IDENTITY_'+p.label);return s;}
 const a=people[0],b=people[1],r0=a.session.refresh_token,r1=await refresh(a,r0),r2=await refresh(a,r1.refresh_token);check(r2.refresh_token!==r0,'NONPARENT_REPLAY');
 await sleep((baseline.reuse_interval_seconds+2)*1000);
 check([400,401].includes((await request('/auth/v1/token?grant_type=refresh_token','POST',undefined,{refresh_token:r0})).status),'OLD_NONPARENT_REJECTED');
 check([401,403].includes((await request('/rest/v1/rpc/mfd_mcp','POST',r2.access_token,{operation:'connections',args:{}})).status),'REPLAY_SESSION_RPC_DENIED');
 const wait=Math.max(0,(b.claims.exp+120)*1000-now());check(wait<=PLAN.max_wait_seconds*1000,'EXPIRY_WAIT_BOUND');await sleep(wait);
 check((await request('/auth/v1/user','GET',b.session.access_token)).status===401,'GENUINE_EXPIRY_DENIED');
 const renewed=await refresh(b,b.session.refresh_token);check((await request('/auth/v1/logout?scope=local','POST',renewed.access_token)).status===204,'LOCAL_LOGOUT');
 check([401,403].includes((await request('/rest/v1/rpc/mfd_mcp','POST',renewed.access_token,{operation:'connections',args:{}})).status),'SIGNED_OUT_RPC_DENIED');
 // No automatic retry, grant revocation, global logout or cleanup mutation on failure.
 return {passed:evidence,requests:calls,personal_credentials_persisted:false};
}
async function hidden(prompt){if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('PRIVATE_TTY_REQUIRED');process.stdout.write(prompt);return new Promise(resolve=>{let s='';process.stdin.setRawMode(true);process.stdin.resume();function done(v){process.stdin.off('data',on);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(v);}function on(buf){for(const ch of buf.toString()){if(ch==='\r'||ch==='\n')return done(s);if(ch==='\u0003')return process.exit(130);if(ch==='\u007f')s=s.slice(0,-1);else s+=ch;}}process.stdin.on('data',on);});}
if(require.main===module){(async()=>{if(process.argv[2]!=='--execute-approved'){console.log(JSON.stringify(PLAN,null,2));return;}if(process.execArgv.length||process.env.NODE_OPTIONS||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||process.env.NODE_EXTRA_CA_CERTS||process.env.SSLKEYLOGFILE)throw Error('UNREVIEWED_RUNTIME');const baseline=JSON.parse(fs.readFileSync('.sites-runtime/c1c-acceptance/approved-session-baseline.json'));requireSafeBaseline(baseline);const mapping=JSON.parse(fs.readFileSync('.sites-runtime/c1b-two-user-evidence/uuid-mapping.json'));const config=JSON.parse(fs.readFileSync('.sites-runtime/c1b-release/wrangler.json'));const credentials=[];for(const label of ['primary','secondary'])credentials.push({email:await hidden(label+' email (hidden): '),password:await hidden(label+' existing password (hidden): ')});console.log(JSON.stringify(await run({baseline,mapping,key:config.vars.MFD_SUPABASE_PUBLISHABLE_KEY,credentials}),null,2));})().catch(()=>{console.error('STOP: acceptance runner failed; no automatic retry or cleanup. Inspect only redacted evidence and isolated-session state.');process.exitCode=1});}
module.exports={PLAN,requireSafeBaseline,run};
