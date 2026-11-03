// Driver for running official local Supabase Edge and Wrangler HTTPS emulators.
// Refuses non-loopback targets; trusts ONLY the generated local test certificate.
const http=require('node:http'),https=require('node:https'),fs=require('node:fs'),assert=require('node:assert/strict');
const base='https://gngnrmzeghjzqsmzuktl.supabase.co',resource=base+'/functions/v1/mfd-mcp/mcp';
const cert=fs.readFileSync('.sites-runtime/c1a3/cloudflare/local.crt');
const result={edge:{},auth:{}};
async function request(kind,path,options={}){
 const secure=kind==='auth',port=secure?54443:55421;
 return new Promise((resolve,reject)=>{
  const req=(secure?https:http).request({hostname:'127.0.0.1',port,path,method:options.method||'GET',headers:options.headers||{},...(secure?{ca:cert,rejectUnauthorized:true}:{}),timeout:20000},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body:Buffer.concat(chunks).toString()}));});
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Local runtime timed out')));req.end(options.body);
 });
}
const jwt=claims=>'e30.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic';
const claims={sub:'native-alice',iss:base+'/auth/v1',aud:resource,role:'authenticated',client_id:'native-local',session_id:'native-session',exp:Date.now()/1000+3600};
const message=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_profile'}});
const headers={Authorization:'Bearer '+jwt(claims),'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
(async()=>{
 const probe=await request('edge','/functions/v1/mfd-probe');assert.equal(probe.status,200);result.edge.observed=JSON.parse(probe.body);
 const gated=await request('edge','/functions/v1/mfd-gated');assert.equal(gated.status,401);
 assert.equal((await request('edge','/functions/v1/mfd-gated',{headers:{Authorization:'Bearer invalid'}})).status,401);
 let r=await request('edge','/functions/v1/mfd-mcp/.well-known/oauth-protected-resource/mcp');assert.equal(r.status,200);assert.equal(JSON.parse(r.body).resource,resource);
 r=await request('edge','/functions/v1/mfd-mcp/.well-known/oauth-protected-resource/mcp',{method:'HEAD'});assert.equal(r.status,200);assert.equal(r.body,'');
 r=await request('edge','/functions/v1/mfd-mcp/mcp',{method:'POST',body:message});assert.equal(r.status,401);assert(r.headers['www-authenticate'].includes(resource.slice(0,-4)+'/.well-known'));
 r=await request('edge','/functions/v1/mfd-mcp/mcp',{method:'POST',body:message,headers:{...headers,Origin:'https://evil.invalid'}});assert.equal(r.status,403);
 r=await request('edge','/functions/v1/mfd-mcp/mcp',{method:'POST',body:message,headers});assert.equal(r.status,200);assert(JSON.parse(r.body).result.content[0].text.includes('Native Alice'));
 for(const changes of [{aud:'authenticated'},{aud:'https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp'},{exp:1},{client_id:'other'},{sub:'native-bob'},{session_id:''}]){
  r=await request('edge','/functions/v1/mfd-mcp/mcp',{method:'POST',body:message,headers:{...headers,Authorization:'Bearer '+jwt({...claims,...changes})}});assert.equal(r.status,401);
 }
 r=await request('edge','/functions/v1/mfd-mcp/mcp',{method:'POST',body:message,headers:{...headers,Authorization:'Bearer invalid'}});assert.equal(r.status,401);
 r=await request('edge','/functions/v1/mfd-mcp/mcp',{method:'POST',body:'{',headers});assert.equal(r.status,400);
 r=await request('edge','/functions/v1/mfd-mcp/mcp',{method:'POST',body:message+' '.repeat(17000),headers});assert.equal(r.status,413);
 result.edge.gateway_default_401=true;result.edge.discovery_200=true;result.edge.private_requires_verified_auth=true;result.edge.synthetic_valid_read=true;
 r=await request('auth','/login');assert.equal(r.status,200);assert(r.headers['content-type'].startsWith('text/html'));assert(r.headers['content-security-policy'].includes("form-action 'self'"));assert(r.headers['cache-control'].includes('no-store'));
 const csrf=/name="csrf" value="([a-f0-9]+)"/.exec(r.body)[1],csrfCookie=r.headers['set-cookie'].find(c=>c.startsWith('__Host-mfd-integration-csrf=')).split(';')[0];
 assert(r.headers['set-cookie'][0].includes('Secure; HttpOnly; SameSite=Lax'));
 const origin='https://127.0.0.1:54443',formHeaders={Origin:origin,'Content-Type':'application/x-www-form-urlencoded'};
 r=await request('auth','/login',{method:'POST',headers:{...formHeaders,Cookie:csrfCookie,Origin:'https://evil.invalid'},body:'csrf='+csrf});assert.equal(r.status,403);
 r=await request('auth','/login',{method:'POST',headers:formHeaders,body:'csrf='+csrf});assert.equal(r.status,400);
 r=await request('auth','/login',{method:'POST',headers:{...formHeaders,Cookie:csrfCookie},body:'csrf='+csrf+'&email=synthetic%40example.invalid&password=synthetic&return_to='+encodeURIComponent('/oauth/mcp/consent?authorization_id=native')});assert.equal(r.status,303);assert(r.headers.location.endsWith('/oauth/mcp/consent?authorization_id=native'));
 const cookies=r.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ');assert(cookies.includes('__Host-mfd-integration-access='));
 r=await request('auth','/oauth/mcp/consent?authorization_id=native',{headers:{Cookie:cookies}});
 if(r.status!==200){const entry=cookies.split('; ').find(v=>v.startsWith('__Host-mfd-integration-access='));let shape;try{const data=JSON.parse(Buffer.from(decodeURIComponent(entry.slice(entry.indexOf('=')+1)).split('.')[1],'base64url'));shape={subject:data.sub,issuer:data.iss,audience:data.aud,role:data.role,sessionPresent:!!data.session_id,expired:data.exp<Date.now()/1000};}catch{shape={invalidEncoding:true};}console.error('Synthetic fixture diagnostic',JSON.stringify({status:r.status,cookieNames:cookies.split('; ').map(v=>v.split('=')[0]),shape}));}
 assert.equal(r.status,200);assert(r.body.includes('Native fixture'));
 r=await request('auth','/oauth/mcp/consent',{method:'POST',headers:{...formHeaders,Cookie:cookies},body:'authorization_id=native&decision=approve&permission=profile'});assert.equal(r.status,303);assert(r.headers.location.startsWith('https://client.invalid/callback?'));
 r=await request('auth','/oauth/mcp/connections',{method:'POST',headers:{...formHeaders,Cookie:cookies},body:'client_id=native-local'});assert.equal(r.status,200);
 r=await request('auth','/oauth/mcp/approve',{method:'POST',headers:{...formHeaders,Cookie:cookies},body:'proposal_id=synthetic'});assert.equal(r.status,403);
 const states=[];for(let i=0;i<35;i++)states.push((await request('auth','/login')).status);
 assert(states.includes(429));const before=JSON.parse((await request('auth','/__fixture/state')).body).upstreamCalls;
 r=await request('auth','/login',{method:'POST',headers:{...formHeaders,Cookie:csrfCookie},body:'csrf='+csrf+'&email=a&password=b'});assert.equal(r.status,429);assert.equal(r.headers['retry-after'],'60');assert.equal(JSON.parse((await request('auth','/__fixture/state')).body).upstreamCalls,before);
 result.auth={https_certificate_verified:true,html:true,csrf:true,cookie_attributes:true,synthetic_login_consent_revoke:true,writes_disabled:true,local_rate_limit_before_upstream:true};
 fs.writeFileSync('.sites-runtime/c1a3/native-results.json',JSON.stringify(result,null,2));console.log('PASS native Edge gateway/routing/discovery/auth guards and workerd HTTPS HTML/cookies/CSRF/consent/limiter (synthetic Auth/RPC only)');
})().catch(e=>{console.error(e);process.exitCode=1});
