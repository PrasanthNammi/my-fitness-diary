// PROPOSAL ONLY: no CLI and no default session acquisition. Separate approval required.
// LOCAL ONLY. Default invocation prints a plan; live mode requires separate approval.
// Credentials exist only in this process. Never add response/request logging here.
const crypto=require('node:crypto');
const BASE='https://gngnrmzeghjzqsmzuktl.supabase.co',WORKER='https://mfd-connect-staging.shanustylish777.workers.dev';
const PLAN={project:'gngnrmzeghjzqsmzuktl',new_sessions:2,max_http_requests:40,max_wait_seconds:4200,grants:'unchanged',logout_scope:'local',new_clients:0,token_persistence:false,oauth_client_lifecycle:'not covered'};
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function requireSafeBaseline(b){if(b.project!==PLAN.project||b.session_policy_safe!==true||!Number.isInteger(b.reuse_interval_seconds)||b.reuse_interval_seconds<0||b.reuse_interval_seconds>120||!Array.isArray(b.existing_session_hashes)||!b.existing_session_hashes.length)throw Error('BASELINE_REQUIRED');}
function claims(t){try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url'));}catch{throw Error('TOKEN_FORMAT');}}
async function run({baseline,mapping,key,acquireSession,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),onCheck=()=>{}}){
 requireSafeBaseline(baseline);let calls=0;const evidence=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);evidence.push(label);onCheck(label);};
 async function request(path,method='GET',token,body,worker=false){if(++calls>PLAN.max_http_requests)throw Error('REQUEST_CAP');if(!path.startsWith('/')||path.startsWith('//'))throw Error('PATH');const r=await fetcher((worker?WORKER:BASE)+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});if(r.status>=300&&r.status<400)throw Error('UNEXPECTED_REDIRECT');return r;}
 const keysResponse=await request('/auth/v1/.well-known/jwks.json');check(keysResponse.status===200,'PUBLIC_KEYS_STATUS');const jwks=await keysResponse.json();check(Array.isArray(jwks.keys)&&jwks.keys.length>0&&jwks.keys.every(k=>k&&typeof k==='object'&&!['d','p','q','dp','dq','qi','oth','k'].some(field=>Object.hasOwn(k,field))),'PUBLIC_KEYS_REQUIRED');
 const people=[];
 for(const [index,label] of ['primary','secondary'].entries()){
  if(typeof acquireSession!=='function')throw Error('SESSION_ACQUISITION_REQUIRED');const session=await acquireSession({label,request}),t=session.access_token,c=claims(t);
  check(signed(t),'ISSUED_SIGNATURE_'+label);
  check(c.sub===mapping[label+'_uuid']&&c.iss===BASE+'/auth/v1'&&c.aud==='authenticated'&&c.role==='authenticated'&&c.client_id===undefined&&typeof c.session_id==='string'&&typeof c.exp==='number'&&c.exp>now()/1000&&(c.nbf===undefined||(typeof c.nbf==='number'&&c.nbf<=now()/1000)),'ISSUED_CLAIMS_'+label);
  check(!baseline.existing_session_hashes.includes(digest(c.session_id)),'DISPOSABLE_SESSION_'+label);
  check(session.user?.id===c.sub&&typeof session.refresh_token==='string','SESSION_REPLY_'+label);
  people.push({label,session,claims:c});
  const own=await request('/rest/v1/forma_workspaces?select=payload,revision&user_id=eq.'+c.sub,'GET',t);check(own.status===200,'OWN_READ_STATUS_'+label);const rows=await own.json();check(rows.length===1&&rows[0].payload.profile.name==='MFD STAGING '+(index?'B':'A')&&rows[0].revision===1,'OWN_FIXTURE_'+label);
  const other=await request('/rest/v1/forma_workspaces?select=revision&user_id=eq.'+mapping[(index?'primary':'secondary')+'_uuid'],'GET',t);check(other.status===200&&(await other.json()).length===0,'CROSS_OWNER_DENIED_'+label);
  const connections=await request('/rest/v1/rpc/mfd_mcp','POST',t,{operation:'connections',args:{}});check(connections.status===200,'LIVE_RPC_'+label);const grants=await connections.json();check(grants.length===1&&grants[0].client_id==='fcad3c45-07cd-418a-978a-7e1d94ee0406'&&JSON.stringify(grants[0].permissions)==='["profile"]','PROFILE_ONLY_'+label);
  check((await request('/mcp','GET',t,undefined,true)).status===401,'FIRST_PARTY_NOT_MCP_'+label);
 }
 check(people[0].claims.session_id!==people[1].claims.session_id,'DISTINCT_SESSIONS');
 function signed(t){try{const [h,p,s]=t.split('.'),header=JSON.parse(Buffer.from(h,'base64url')),jwk=jwks.keys.find(k=>k.kid===header.kid);return header.alg==='ES256'&&typeof header.kid==='string'&&header.kid.length>0&&jwk?.kty==='EC'&&jwk.crv==='P-256'&&Buffer.from(s,'base64url').length===64&&crypto.verify('sha256',Buffer.from(h+'.'+p),{key:crypto.createPublicKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url'));}catch{return false;}}
 async function refresh(p,old){const r=await request('/auth/v1/token?grant_type=refresh_token','POST',undefined,{refresh_token:old});check(r.status===200,'REFRESH_OK_'+p.label);const s=await r.json();
  check(signed(s.access_token),'REFRESH_SIGNATURE_'+p.label);const c=claims(s.access_token);
  check(c.iss===BASE+'/auth/v1'&&c.aud==='authenticated'&&c.role==='authenticated'&&c.client_id===undefined&&typeof c.exp==='number'&&c.exp>now()/1000&&(c.nbf===undefined||(typeof c.nbf==='number'&&c.nbf<=now()/1000)),'REFRESH_CLAIMS_'+p.label);
  check(c.session_id===p.claims.session_id&&c.sub===p.claims.sub&&typeof s.refresh_token==='string'&&s.refresh_token&&s.refresh_token!==old,'ROTATION_IDENTITY_'+p.label);return s;}
 async function live(token,label){const r=await request('/rest/v1/rpc/mfd_mcp','POST',token,{operation:'connections',args:{}});const data=r.status===200?await r.json():null;check(Array.isArray(data)&&data.length===1&&data[0].client_id==='fcad3c45-07cd-418a-978a-7e1d94ee0406'&&JSON.stringify(data[0].permissions)==='["profile"]',label);}
 const a=people[0],b=people[1],r0=a.session.refresh_token,r1=await refresh(a,r0),r2=await refresh(a,r1.refresh_token);check(r2.refresh_token!==r0,'NONPARENT_REPLAY');
 await live(r2.access_token,'PRE_REPLAY_RPC_LIVE');
 await sleep((baseline.reuse_interval_seconds+2)*1000);
 check(claims(r2.access_token).exp>now()/1000+30,'REPLAY_EXPIRY_BOUND');
 check([400,401].includes((await request('/auth/v1/token?grant_type=refresh_token','POST',undefined,{refresh_token:r0})).status),'OLD_NONPARENT_REJECTED');
 check([401,403].includes((await request('/rest/v1/rpc/mfd_mcp','POST',r2.access_token,{operation:'connections',args:{}})).status)&&claims(r2.access_token).exp>now()/1000,'REPLAY_SESSION_RPC_DENIED');
 const wait=Math.max(0,(b.claims.exp+120)*1000-now());check(wait<=PLAN.max_wait_seconds*1000,'EXPIRY_WAIT_BOUND');await sleep(wait);
 check(await require('./c1c-expiry-response.cjs').expiredAccessRejected(await request('/auth/v1/user','GET',b.session.access_token),b.claims.exp,now()),'GENUINE_EXPIRY_DENIED');
 const renewed=await refresh(b,b.session.refresh_token);await live(renewed.access_token,'PRE_LOGOUT_RPC_LIVE');check(claims(renewed.access_token).exp>now()/1000+30,'LOGOUT_EXPIRY_BOUND');check((await request('/auth/v1/logout?scope=local','POST',renewed.access_token)).status===204,'LOCAL_LOGOUT');
 check([401,403].includes((await request('/rest/v1/rpc/mfd_mcp','POST',renewed.access_token,{operation:'connections',args:{}})).status)&&claims(renewed.access_token).exp>now()/1000,'SIGNED_OUT_RPC_DENIED');
 // No automatic retry, grant revocation, global logout or cleanup mutation on failure.
 return {passed:evidence,requests:calls,personal_credentials_persisted:false};
}
module.exports={PLAN,requireSafeBaseline,run};
