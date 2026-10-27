const {buildSync}=require('esbuild'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortSignal,crypto:require('node:crypto').webcrypto,atob,btoa,Date};
vm.createContext(context);vm.runInContext(buildSync({entryPoints:['hosting/worker/mfd.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text,context);
const handle=context.module.exports.handleMfd,origin='https://prasanth-nammi-portfolio.paleriver512.chatgpt.site';
const claims={sub:'alice',iss:'https://djyozltkmbzhwuvemxuy.supabase.co/auth/v1',aud:origin+'/mcp',role:'authenticated',client_id:'client-a',session_id:'session-a',exp:Date.now()/1000+3600};
const jwt=claims=>'e30.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
const bearer=jwt(claims),browser=jwt({...claims,client_id:undefined,aud:'authenticated'}),cookie='__Host-mfd-access='+browser;
let calls=[],deny=false,revoked=false,authorizationUser='alice';
const deps={assets:{fetch:async()=>new Response('existing frontend')},fetch:async(url,init)=>{
 calls.push({url,init});
 if(url.endsWith('/auth/v1/user'))return deny?Response.json({error:'bad signature'},{status:401}):Response.json({id:'alice',email:'alice@example.invalid'});
 if(url.includes('/oauth/authorizations/')){
  if(url.endsWith('/consent'))return Response.json({redirect_url:'https://client.example/callback?code=issued&state=state'});
  return Response.json({authorization_id:'auth-1',user:{id:authorizationUser},client:{id:'client-a',name:'<script>bad()</script>'},redirect_uri:'https://client.example/callback',scope:'openid'});
 }
 if(url.endsWith('/rest/v1/rpc/mfd_mcp')){
  const {operation,args}=JSON.parse(init.body);
  if(operation==='revoke'){revoked=true;return Response.json({})}
  if(operation==='consent'){revoked=false;return Response.json({})}
  if(operation==='connections')return Response.json([{client_id:'client-a',permissions:['workouts']}]);
  if(revoked)return Response.json({error:'denied'},{status:403});
  if(operation==='review')return Response.json({id:'11111111-1111-4111-8111-111111111111',client_id:'client-a',revision:5,water_goal_ml:2500,expires_at:'tomorrow'});
  if(operation==='propose_water_goal')return Response.json({proposal_id:'11111111-1111-4111-8111-111111111111'});
  return Response.json({revision:5,data:[{id:'alice-workout'}]});
 }
 if(url.includes('/user/oauth/grants'))return init.method==='DELETE'?new Response(null,{status:204}):Response.json([{client_id:'native-only'}]);
 throw Error('Unexpected upstream '+url);
}};
const request=(path,method='GET',body,headers={})=>new Request(origin+path,{method,headers,...(body===undefined?{}:{body})});
const rpc=(method,params={},extra={},headers={})=>request('/mcp','POST',JSON.stringify({jsonrpc:'2.0',id:1,method,params,...extra}),{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+bearer,...headers});
const form=(path,body,headers={})=>request(path,'POST',body,{Cookie:cookie,Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...headers});
(async()=>{
 let r=await handle(request('/'),deps);assert.equal(await r.text(),'existing frontend');
 r=await handle(request('/.well-known/oauth-protected-resource/mcp'),deps);assert.equal((await r.json()).resource,origin+'/mcp');
 calls=[];r=await handle(request('/mcp','POST','{}',{Cookie:cookie}),deps);assert.equal(r.status,401);assert(r.headers.get('www-authenticate').includes('resource_metadata'));assert.equal(calls.length,0);
 r=await handle(rpc('initialize',{protocolVersion:'2025-06-18'}),deps);assert.equal((await r.json()).result.protocolVersion,'2025-06-18');
 r=await handle(rpc('tools/list'),deps);let body=await r.json();assert.equal(body.result.tools.length,5);assert(body.result.tools.every(t=>t.annotations.readOnlyHint));
 r=await handle(rpc('tools/call',{name:'get_workouts',arguments:{limit:1}}),deps);body=await r.json();assert(body.result.content[0].text.includes('alice-workout'));assert.equal(calls.at(-1).init.headers.get('authorization'),'Bearer '+bearer);assert(!calls.at(-1).init.headers.has('cookie'));
 for(const args of [{user_id:'bob'},{limit:101},{limit:1.1},{offset:-1},{table:'forma_workspaces'}]){
  r=await handle(rpc('tools/call',{name:'get_workouts',arguments:args}),deps);assert.equal((await r.json()).error.code,-32602);
 }
 r=await handle(rpc('tools/call',{name:'apply_water_goal',arguments:{}}),deps);assert.equal((await r.json()).error.code,-32602);
 deny=true;r=await handle(rpc('tools/list'),deps);assert.equal(r.status,401);deny=false;
 for(const changes of [{aud:'authenticated'},{iss:'https://evil.example'},{client_id:undefined},{exp:1},{sub:'bob'},{role:'service_role'}]){
  r=await handle(rpc('tools/list',{}, {},{Authorization:'Bearer '+jwt({...claims,...changes})}),deps);assert.equal(r.status,401);
 }
 r=await handle(rpc('tools/list',{}, {},{Origin:'https://evil.example'}),deps);assert.equal(r.status,403);
 r=await handle(rpc('tools/list',{}, {},{'MCP-Protocol-Version':'unknown'}),deps);assert.equal(r.status,400);
 r=await handle(rpc('tools/list',{}, {},{Accept:'application/json'}),deps);assert.equal(r.status,406);
 r=await handle(rpc('notifications/initialized',{}, {id:undefined}),deps);assert.equal(r.status,202);
 r=await handle(request('/mcp','POST','{',{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+bearer}),deps);assert.equal((await r.json()).error.code,-32700);
 r=await handle(rpc('tools/list',{padding:'x'.repeat(17000)}),deps);assert.equal(r.status,413);
 r=await handle(request('/oauth/mcp/consent?authorization_id=auth-1'),deps);assert.equal(r.status,401);
 r=await handle(request('/oauth/mcp/consent?authorization_id=auth-1','GET',undefined,{Cookie:cookie}),deps);body=await r.text();assert(body.includes('&lt;script&gt;'));assert(!body.includes('<script>'));assert(body.includes('alice@example.invalid'));assert(!body.includes('checked'));assert(r.headers.get('cache-control').includes('no-store'));
 // Consent pages accept only a first-party token for the authenticated user.
 for(const altered of [
  {sub:'bob',client_id:undefined,aud:'authenticated'},
  {aud:origin+'/mcp',client_id:'client-a'},
  {role:'service_role',client_id:undefined,aud:'authenticated'},
  {exp:1,client_id:undefined,aud:'authenticated'},
  {session_id:undefined,client_id:undefined,aud:'authenticated'}
 ]){
  const candidate=jwt({...claims,client_id:undefined,aud:'authenticated',...altered});
  r=await handle(request('/oauth/mcp/consent?authorization_id=auth-1','GET',undefined,{Cookie:'__Host-mfd-access='+candidate}),deps);
  assert.equal(r.status,altered.exp===1?401:403);
 }
 r=await handle(form('/oauth/mcp/consent','authorization_id=auth-1&decision=approve&permission=workouts',{Origin:'https://evil.example'}),deps);assert.equal(r.status,403);
 authorizationUser='bob';r=await handle(form('/oauth/mcp/consent','authorization_id=auth-1&decision=approve&permission=workouts'),deps);assert.equal(r.status,403);authorizationUser='alice';
 r=await handle(form('/oauth/mcp/consent','authorization_id=auth-1&decision=approve'),deps);assert.equal(r.status,400);
 r=await handle(form('/oauth/mcp/consent','authorization_id=auth-1&decision=approve&permission=workouts'),deps);assert.equal(r.status,303);assert(r.headers.get('location').startsWith('https://client.example/callback'));
 assert(calls.some(c=>c.init.body?.includes('"operation":"consent"')));
 r=await handle(form('/oauth/mcp/consent','authorization_id=auth-1&decision=deny'),deps);assert.equal(r.status,303);assert(calls.at(-1).init.body.includes('"action":"deny"'));
 r=await handle(request('/oauth/mcp/connections','GET',undefined,{Cookie:cookie}),deps);assert((await r.text()).includes('native-only'));
 r=await handle(form('/oauth/mcp/connections','client_id=client-a'),deps);assert.equal(r.status,200);assert(calls.at(-1).url.includes('/user/oauth/grants?client_id=client-a'));
 r=await handle(rpc('tools/call',{name:'get_workouts'}),deps);assert.equal((await r.json()).result.isError,true);
 revoked=false;
 const writes={...deps,mcpWrites:true};
 r=await handle(rpc('tools/list'),writes);assert.equal((await r.json()).result.tools.length,7);
 r=await handle(rpc('tools/call',{name:'propose_water_goal',arguments:{expected_revision:5,water_goal_ml:2500}}),writes);assert((await r.json()).result.content[0].text.includes('/oauth/mcp/approve?proposal_id='));
 r=await handle(request('/oauth/mcp/approve?proposal_id=11111111-1111-4111-8111-111111111111','GET',undefined,{Cookie:cookie}),writes);body=await r.text();assert(body.includes('2500'));assert(body.includes('revision 5'));
 r=await handle(form('/oauth/mcp/approve','proposal_id=11111111-1111-4111-8111-111111111111'),writes);assert.equal(r.status,200);assert(calls.at(-1).init.body.includes('"operation":"approve"'));
 r=await handle(form('/oauth/mcp/approve','proposal_id=11111111-1111-4111-8111-111111111111'),deps);assert.equal(r.status,403);
 console.log('PASS MCP transport, discovery, verified bearer identity, protocol validation, tool allowlists, consent/deny, CSRF, XSS, revocation, approval and unchanged frontend');
})().catch(e=>{console.error(e);process.exit(1)});
