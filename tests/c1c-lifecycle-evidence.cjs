// Reject false-positive lifecycle evidence. Real crypto, modeled provider only.
const assert=require('node:assert/strict'),crypto=require('node:crypto');const {run}=require('../scripts/c1c-alternative-lifecycle-core.cjs');
const base='https://gngnrmzeghjzqsmzuktl.supabase.co',cid='fcad3c45-07cd-418a-978a-7e1d94ee0406',enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function exercise(mode){let time=Date.now(),seq=0,replays=0,logout=0,rotations=0;const live=new Set(['a','b']),tokens=new Map();
 const pair=mode==='rsa_mislabeled'?crypto.generateKeyPairSync('rsa',{modulusLength:2048}):crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),wrong=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk={...pair.publicKey.export({format:'jwk'}),kid:'local',alg:'ES256'};
 const issue=(sub,refresh=false)=>{
  const extra=mode==='initial_null_nbf'||refresh&&mode==='null_nbf'?{nbf:null}:refresh&&mode==='wrong_audience'?{aud:'wrong'}:{};
  const ttl=refresh&&mode==='short_refresh'?40:100;
  const payload={sub,session_id:'new-'+sub,iss:base+'/auth/v1',aud:'authenticated',role:'authenticated',exp:time/1000+ttl,...extra};
  const data=enc({alg:'ES256',kid:'local'})+'.'+enc(payload);const key=refresh&&((mode==='bad_signature'&&sub==='a')||(mode==='bad_secondary_signature'&&sub==='b'))?wrong.privateKey:pair.privateKey;
  const r='synthetic-'+(++seq);tokens.set(r,{sub,used:false});return {access_token:data+'.'+crypto.sign('sha256',Buffer.from(data),{key,dsaEncoding:'ieee-p1363'}).toString('base64url'),refresh_token:r,user:{id:sub}};
 };
 let failure;try{await run({baseline:{project:'gngnrmzeghjzqsmzuktl',session_policy_safe:true,reuse_interval_seconds:10,existing_session_hashes:['original']},mapping:{primary_uuid:'a',secondary_uuid:'b'},key:'sb_publishable_synthetic',now:()=>time,sleep:async ms=>{time+=mode==='suspended'&&ms===12000?3600000:ms;},acquireSession:async({label})=>issue(label==='primary'?'a':'b'),fetcher:async(url,init)=>{
  const u=new URL(url),body=init.body?JSON.parse(init.body):{},token=new Headers(init.headers).get('authorization')?.slice(7),c=token?JSON.parse(Buffer.from(token.split('.')[1],'base64url')):{};
  if(u.pathname.endsWith('jwks.json'))return Response.json({keys:[jwk]});
  if(u.pathname==='/rest/v1/forma_workspaces')return Response.json(u.searchParams.get('user_id')==='eq.'+c.sub?[{payload:{profile:{name:'MFD STAGING '+(c.sub==='a'?'A':'B')}},revision:1}]:[]);
  if(u.pathname==='/mcp')return new Response(null,{status:401});
  if(u.pathname==='/rest/v1/rpc/mfd_mcp'){
   const forced=mode==='invalid_before_replay'&&c.sub==='a'&&rotations>=2||mode==='invalid_before_logout'&&c.sub==='b'&&rotations>=3;
   return live.has(c.sub)&&!forced?Response.json([{client_id:cid,permissions:['profile']}]):Response.json({error:'denied'},{status:403});
  }
  if(u.pathname==='/auth/v1/token'){
   const old=tokens.get(body.refresh_token);assert(old);if(old.used){replays++;live.delete(old.sub);if(mode==='expired_after_replay')time+=200000;return Response.json({error:'replayed'},{status:400});}
   old.used=true;rotations++;return Response.json(issue(old.sub,true));
  }
  if(u.pathname==='/auth/v1/user')return new Response(null,{status:c.exp<=time/1000?401:200});
  if(u.pathname==='/auth/v1/logout'){logout++;live.delete(c.sub);if(mode==='expired_after_logout')time+=200000;return new Response(null,{status:204});}
  throw Error('UNEXPECTED_MODEL_REQUEST');
 }});}catch(e){failure=e.message;}
 return {failure,replays,logout};
}
(async()=>{
 const cases=[['rsa_mislabeled','ISSUED_SIGNATURE_primary'],['initial_null_nbf','ISSUED_CLAIMS_primary'],['bad_signature','REFRESH_SIGNATURE_primary'],['null_nbf','REFRESH_CLAIMS_primary'],['wrong_audience','REFRESH_CLAIMS_primary'],['invalid_before_replay','PRE_REPLAY_RPC_LIVE'],['short_refresh','REPLAY_EXPIRY_BOUND'],['suspended','REPLAY_EXPIRY_BOUND'],['expired_after_replay','REPLAY_SESSION_RPC_DENIED'],['bad_secondary_signature','REFRESH_SIGNATURE_secondary'],['invalid_before_logout','PRE_LOGOUT_RPC_LIVE'],['expired_after_logout','SIGNED_OUT_RPC_DENIED']];
 for(const [mode,label]of cases){const r=await exercise(mode);assert.equal(r.failure,label,mode);if(['bad_signature','null_nbf','wrong_audience','invalid_before_replay','short_refresh','suspended'].includes(mode))assert.equal(r.replays,0);if(mode!=='expired_after_logout')assert.equal(r.logout,0);}
 console.log('PASS lifecycle evidence: reject bad refreshed signatures/claims, dead-before-event sessions, expiry/suspend confounds; no false replay/logout PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
