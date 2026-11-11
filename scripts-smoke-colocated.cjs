// Real local workerd + SQLite DO. Never contacts hosted Auth/RPC.
const https=require('node:https'),fs=require('node:fs'),assert=require('node:assert/strict');
const origin='https://127.0.0.1:54444',cert=fs.readFileSync('.sites-runtime/c1a3/cloudflare/local.crt');
const evidence='.sites-runtime/c1a4';
async function request(path,options={}){return new Promise((resolve,reject)=>{
 const r=https.request(origin+path,{ca:cert,rejectUnauthorized:true,method:options.method||'GET',headers:options.headers||{},timeout:15000},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,text:Buffer.concat(chunks).toString()}));});
 r.on('error',reject);r.on('timeout',()=>r.destroy(Error('Loopback timeout')));r.end(options.body);
});}
const state=async()=>JSON.parse((await request('/__fixture/state')).text);
const claims={sub:'native-alice',iss:'https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1',aud:origin+'/mcp',client_id:'native-local',session_id:'native-session',role:'authenticated',exp:Date.now()/1000+3600};
const jwt=c=>'e30.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.synthetic';
const headers={Authorization:'Bearer '+jwt(claims),'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
const call=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_profile'}});
(async()=>{
 if(process.argv[2]==='persistence'){
  const before=JSON.parse(fs.readFileSync(evidence+'/quota-before-restart.json')),after=await state();
  assert.deepEqual(after.rows,before.rows);assert(after.rows.find(row=>row.scope==='global').used===30);
  fs.writeFileSync(evidence+'/persistence-result.json',JSON.stringify({persisted_after_process_restart:true,rows:after.rows},null,2));console.log('PASS shared SQLite counters survive full workerd process restart unchanged');return;
 }
 const initial=await state();assert(initial.rows.every(row=>row.window<Math.floor(Date.now()/60000)),'Start a full rehearsal only after the previous fixed window has expired; never reset stored quotas');
 let r=await request('/.well-known/oauth-protected-resource/mcp');assert.equal(r.status,200);assert.equal(JSON.parse(r.text).resource,origin+'/mcp');
 r=await request('/mcp',{method:'POST',body:call});assert.equal(r.status,401);
 r=await request('/mcp',{method:'POST',headers,body:call});assert.equal(r.status,200);assert(JSON.parse(r.text).result.content[0].text.includes('Native Alice'));
 r=await request('/mcp',{method:'POST',headers:{...headers,Authorization:'Bearer '+jwt({...claims,aud:'https://gngnrmzeghjzqsmzuktl.supabase.co/functions/v1/mfd-mcp/mcp'})},body:call});assert.equal(r.status,401);
 r=await request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_profile',arguments:{user_id:'bob'}}})});assert.equal(JSON.parse(r.text).error.code,-32602);
 r=await request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'apply_water_goal'}})});assert.equal(JSON.parse(r.text).error.code,-32602);
 r=await request('/login');assert.equal(r.status,200);const csrf=/name="csrf" value="([a-f0-9]+)"/.exec(r.text)[1],cookie=r.headers['set-cookie'].find(c=>c.startsWith('__Host-mfd-integration-csrf=')).split(';')[0];
 const form={Origin:origin,'Content-Type':'application/x-www-form-urlencoded'};
 r=await request('/login',{method:'POST',headers:{...form,Cookie:cookie},body:'csrf='+csrf+'&email=synthetic%40example.invalid&password=synthetic'});assert.equal(r.status,303);
 const jar=r.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ');assert(r.headers['set-cookie'].every(c=>c.includes('HttpOnly')));
 r=await request('/oauth/mcp/consent?authorization_id=local',{headers:{Cookie:jar}});assert.equal(r.status,200);
 r=await request('/oauth/mcp/consent',{method:'POST',headers:{...form,Cookie:jar},body:'authorization_id=local&decision=approve&permission=profile'});assert.equal(r.status,303);assert(r.headers.location.startsWith('https://client.invalid/callback?'));
 const reconnect=await request('/oauth/mcp/consent?authorization_id=local-reconnect',{headers:{Cookie:jar}});assert.equal(reconnect.status,303);assert(reconnect.headers.location.startsWith('https://client.invalid/callback?'));
 r=await request('/oauth/mcp/connections',{method:'POST',headers:{...form,Cookie:jar},body:'client_id=native-local'});assert.equal(r.status,200);
 r=await request('/mcp',{method:'POST',headers:{Cookie:jar},body:call});assert.equal(r.status,401); // Browser identity cannot authenticate MCP.
 const before=await state();r=await request('/__fixture/missing-binding');assert.equal(r.status,503);assert.equal((await state()).upstreamCalls,before.upstreamCalls);
 r=await request('/internal/limiter');assert.equal(r.status,404);
 // Real simultaneous requests from both routes share ONE coordinator budget.
 const responses=await Promise.all(Array.from({length:90},(_,i)=>i%2?request('/login'):request('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})));
 assert(responses.some(r=>r.status===429));assert(responses.every(r=>[200,429].includes(r.status)));
 const after=await state(),global=after.rows.find(row=>row.scope==='global');assert.equal(global.used,30);assert(after.rows.length<=4);
 assert(after.rows.find(row=>row.scope==='auth').used<=20);assert(after.rows.find(row=>row.scope==='mcp').used<=25);
 assert.equal(after.rows.filter(row=>row.scope!=='global').reduce((n,row)=>n+row.used,0),global.used);
 const blocked=await request('/mcp',{method:'POST',headers,body:call});assert.equal(blocked.status,429);assert.equal((await state()).upstreamCalls,after.upstreamCalls);
 fs.writeFileSync(evidence+'/quota-before-restart.json',JSON.stringify(after,null,2));
 fs.writeFileSync(evidence+'/smoke-result.json',JSON.stringify({shared_routes:true,synthetic_auth_consent:true,exact_resource:true,cookie_not_mcp_auth:true,missing_binding_fail_closed:true,concurrent_requests:responses.length,global_accepted:global.used,bounded_rows:after.rows.length,denied_without_upstream:true},null,2));
 console.log('PASS colocated HTTPS MCP/auth + real SQLite DO: exact audience, protected tools, consent, no owner injection/writes, 90 concurrent mixed-route requests, shared cap and failure closed');
})().catch(e=>{console.error(e);process.exitCode=1});
