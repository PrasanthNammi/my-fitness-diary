const assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {BASE,CALLBACK,ATTESTATION,createManualGoogleFlow,parseCallback}=require('../scripts/c1c-manual-google-flow.cjs');
const {safeFailure,confirmed}=require('../scripts/c1c-google-h1-h3-manual.cjs');
const secret='synthetic-private-sentinel',enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function fixture(options={}){
 let time=Date.now(),challenge,calls=0;
 const flow=createManualGoogleFlow({key:'sb_publishable_synthetic',expectedUser:'a',label:'primary',now:()=>time,
  transport:async(url,init)=>{
   calls++;assert.equal(url,BASE+'/auth/v1/token?grant_type=pkce');assert.equal(init.method,'POST');assert.equal(init.redirect,'manual');
   const body=JSON.parse(init.body);assert.equal(body.auth_code,'synthetic-once');
   assert.equal(crypto.createHash('sha256').update(body.code_verifier).digest('base64url'),challenge);
   if(options.throw)throw Error(secret);
   if(options.reject)return Response.json({error:secret},{status:400});
   if(options.json)return new Response(secret,{status:200});
   const sub=options.wrong?'b':'a';
   const c={sub,iss:BASE+'/auth/v1',aud:'authenticated',role:'authenticated',session_id:'new-session',exp:time/1000+3600,...options.claims};
   return Response.json({access_token:'e30.'+enc(c)+'.synthetic',refresh_token:secret,expires_in:3600,token_type:'bearer',
    provider_token:secret,user:{id:sub,email:secret}});
  }});
 return {flow,get calls(){return calls;},expire(){time+=300001;},async start(){const x=await flow.start();challenge=new URL(x.url).searchParams.get('code_challenge');return x;}};
}
(async()=>{
 assert.equal(confirmed('y',ATTESTATION),ATTESTATION);assert.equal(confirmed('Y',ATTESTATION),ATTESTATION);
 for(const answer of ['',undefined,'no','yes',' '+secret])assert.throws(()=>confirmed(answer,ATTESTATION),/MANUAL_ATTESTATION/);
 const f=fixture(),s=await f.start();assert.equal(f.calls,0);assert.equal(new URL(s.url).searchParams.get('redirect_to'),CALLBACK);
 assert(!('browserContext' in s));assert.equal(s.provenance,'operator-attested-private-browser');
 const r=await f.flow.complete({callbackUrl:CALLBACK+'?code=synthetic-once',attestation:ATTESTATION});
 assert.equal(r.user.id,'a');assert.deepEqual(Object.keys(r.user),['id']);assert(!('provider_token' in r));
 assert.equal(f.flow.evidence().machine_verified_browser_context,false);assert.equal(f.flow.evidence().memory_entries,0);
 assert(!JSON.stringify(f.flow.evidence()).includes(secret));await assert.rejects(()=>f.flow.complete({}),/MANUAL_USED/);assert.equal(f.calls,1);
 for(const callback of [CALLBACK,CALLBACK+'?code=',CALLBACK+'?code=a&code=b',CALLBACK+'?code=a&state=b',CALLBACK+'?code=a#x',
  CALLBACK.replace('https:','http:')+'?code=a',CALLBACK.replace('/callback','/callback/')+'?code=a',
  'https://attacker.invalid/auth/google/callback?code=a',CALLBACK+'?code=%0A',CALLBACK+'?error=denied',CALLBACK+'?code=a\n',
  CALLBACK+'?code='+ 'x'.repeat(2049),CALLBACK+'?code=a%2Fb',CALLBACK.replace('https://','https://user@')+'?code=a']){
  assert.throws(()=>parseCallback(callback),/MANUAL_CALLBACK/);
  const x=fixture();await x.start();await assert.rejects(()=>x.flow.complete({callbackUrl:callback,attestation:ATTESTATION}),/MANUAL_CALLBACK/);
  assert.equal(x.calls,0);assert.equal(x.flow.evidence().memory_entries,0);await assert.rejects(()=>x.flow.complete({}),/MANUAL_USED/);
 }
 for(const attestation of [undefined,'',secret,'PRIMARY']){
  const x=fixture();await x.start();await assert.rejects(()=>x.flow.complete({callbackUrl:CALLBACK+'?code=synthetic-once',attestation}),/MANUAL_ATTESTATION/);
  assert.equal(x.calls,0);assert.equal(x.flow.evidence().memory_entries,0);
 }
 const expired=fixture();await expired.start();expired.expire();await assert.rejects(()=>expired.flow.complete({callbackUrl:CALLBACK+'?code=synthetic-once',attestation:ATTESTATION}),/MANUAL_EXPIRED/);assert.equal(expired.calls,0);
 const disposed=fixture();await disposed.start();disposed.flow.dispose();assert.equal(disposed.flow.evidence().memory_entries,0);await assert.rejects(()=>disposed.flow.start(),/MANUAL_USED/);
 for(const options of [{wrong:true},{reject:true},{throw:true},{json:true},{claims:{aud:['authenticated']}},{claims:{iss:'https://wrong.invalid'}},
  {claims:{client_id:null}},{claims:{role:'anon'}},{claims:{session_id:''}},{claims:{exp:1}},{claims:{nbf:Date.now()/1000+3600}}]){
  const x=fixture(options);await x.start();let error;
  try{await x.flow.complete({callbackUrl:CALLBACK+'?code=synthetic-once',attestation:ATTESTATION});}catch(e){error=e;}
  assert(error);assert(!JSON.stringify(safeFailure(error)).includes(secret));assert.equal(x.flow.evidence().memory_entries,0);assert.equal(x.calls,1);
 }
 const child=spawnSync(process.execPath,['--require','./tests/no-network.cjs','scripts/c1c-google-h1-h3-manual.cjs'],{encoding:'utf8'});
 assert.equal(child.status,0);const plan=JSON.parse(child.stdout);assert.equal(plan.requires_manual_scope_approval,true);assert.equal(plan.aggregate_40_request_cap_proven,false);
 const blocked=spawnSync(process.execPath,['--require','./tests/no-network.cjs','scripts/c1c-google-h1-h3-manual.cjs','--execute-approved-manual'],{encoding:'utf8'});
 assert.equal(blocked.status,1);assert(blocked.stderr.includes('STOP MANUAL_SETUP'));
 assert(!JSON.stringify(safeFailure(new Error(secret))).includes(secret));
 console.log('PASS manual SDK PKCE, exact callback/attestation/expiry/one-use/account guards, in-memory cleanup, privacy and inert CLI');
})().catch(e=>{console.error(e);process.exitCode=1});
