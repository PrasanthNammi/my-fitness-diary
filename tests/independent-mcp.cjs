const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {buildSync}=require('esbuild');
const context={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:require('node:crypto').webcrypto,atob,Date};
vm.createContext(context);vm.runInContext(buildSync({stdin:{contents:`export * from './hosting/independent/config'; export * from './hosting/independent/service'; export * from './hosting/independent/auth'; export * from './hosting/independent/limits';`,resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,context);
const {integrationConfig,createMcpService,createAuthService,localRateGate,RESOURCE}=context.module.exports;
const env={...JSON.parse(fs.readFileSync('.openai/environment.json')),MFD_MCP_RESOURCE_URL:RESOURCE,MFD_AUTH_ORIGIN:'https://mfd-auth-staging.invalid',MFD_ALLOWED_CLIENT_IDS:'["client-a"]',MFD_CLIENT_REDIRECTS:'{"client-a":["https://client.invalid/callback"]}'};
const config=integrationConfig(env),allow={allow:async()=>true};
const claims={sub:'alice',iss:config.issuer,aud:config.resource,client_id:'client-a',session_id:'session-a',role:'authenticated',exp:Date.now()/1000+3600};
const jwt=c=>'e30.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.synthetic';
let authStatus=200,rpcStatus=200,calls=[],redirect='https://client.invalid/callback?code=synthetic&state=state',authClient='client-a',nativeFail=false;
const browser=jwt({...claims,client_id:undefined,aud:'authenticated'});
const fetcher=async(url,init={})=>{
 calls.push({url,init});assert(url.startsWith(config.supabase+'/'));assert.equal(init.redirect,'manual');
 const bearer=new Headers(init.headers).get('Authorization')?.slice(7);
 if(url.endsWith('/auth/v1/user'))return authStatus===200?Response.json({id:JSON.parse(Buffer.from(bearer.split('.')[1],'base64url'))?.sub||'alice'}):Response.json({error:'Denied'},{status:authStatus});
 if(url.includes('/auth/v1/token?'))return Response.json({access_token:browser,refresh_token:'synthetic-refresh',user:{id:'alice'}});
 if(url.includes('/oauth/authorizations/'))return url.endsWith('/consent')?(nativeFail?Response.json({error:'Failed'},{status:400}):Response.json({redirect_url:redirect})):Response.json({user:{id:'alice'},client:{id:authClient,name:'Test'},redirect_uri:'https://client.invalid/callback',scope:'openid'});
 if(url.endsWith('/rest/v1/rpc/mfd_mcp')){
  if(rpcStatus!==200)return Response.json({error:'Session, client or consent denied'},{status:rpcStatus});
  const {operation}=JSON.parse(init.body);
  if(operation==='connections')return Response.json([]);
  if(['consent','revoke'].includes(operation))return Response.json({});
  return Response.json({data:{owner:JSON.parse(Buffer.from(bearer.split('.')[1],'base64url')).sub},revision:1});
 }
 if(url.includes('/user/oauth/grants'))return init.method==='DELETE'?new Response(null,{status:204}):Response.json([]);
 if(url.includes('/logout'))return new Response(null,{status:204});
 throw Error('Unexpected path');
};
const body=(method='tools/call',args={})=>JSON.stringify({jsonrpc:'2.0',id:1,method,params:method==='tools/call'?{name:'get_profile',arguments:args}:{}});
const request=(text=body(),token=jwt(claims),headers={})=>new Request(config.resource,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...headers},body:text});
const cookie='__Host-mfd-integration-access='+browser;
const form=(path,text,headers={})=>new Request(config.authOrigin+path,{method:'POST',headers:{Cookie:cookie,Origin:config.authOrigin,'Content-Type':'application/x-www-form-urlencoded',...headers},body:text});
(async()=>{
 for(const overrides of [{MFD_ENV:'production'},{MFD_MCP_WRITES:'true'},{MFD_SUPABASE_URL:'https://other.invalid'},{MFD_MCP_RESOURCE_URL:'https://old.invalid/mcp'},{MFD_AUTH_ORIGIN:'http://unsafe.invalid'},{MFD_AUTH_ORIGIN:'https://private.chatgpt.site'},{MFD_ALLOWED_CLIENT_IDS:'[]'},{MFD_CLIENT_REDIRECTS:'{"client-a":["http://evil.invalid/callback"]}'}])assert.throws(()=>integrationConfig({...env,...overrides}));
 let service=createMcpService(config,fetcher,allow),r;
 const metadata=config.resource.slice(0,-4)+'/.well-known/oauth-protected-resource/mcp';
 calls=[];r=await service(new Request(metadata));assert.equal(r.status,200);assert.equal((await r.json()).resource,RESOURCE);assert.equal(calls.length,0);
 r=await service(new Request(config.resource,{method:'POST',headers:{'oai-authenticated-user-id':'alice'},body:body()}));assert.equal(r.status,401);assert(r.headers.get('www-authenticate').includes(metadata));
 for(const altered of [{iss:'https://bad.invalid'},{aud:'authenticated'},{aud:'https://old.invalid/mcp'},{exp:1},{nbf:Date.now()/1000+100},{client_id:'other'},{session_id:''},{role:'service_role'}]){calls=[];r=await service(request(body(),jwt({...claims,...altered})));assert.equal(r.status,401);assert(!calls.some(c=>c.url.includes('/rest/')));}
 authStatus=401;r=await service(request());assert.equal(r.status,401);authStatus=200;
 r=await service(request(body(),jwt(null)));assert.equal(r.status,401);
 for(const user of ['alice','bob']){r=await service(request(body(),jwt({...claims,sub:user})));assert.equal(JSON.parse((await r.json()).result.content[0].text).data.owner,user);}
 r=await service(request(body('tools/call',{user_id:'bob'})));assert.equal((await r.json()).error.code,-32602);
 for(const status of [401,403]){rpcStatus=status;r=await service(request());const result=(await r.json()).result;assert.equal(result.isError,true);assert(result._meta['mcp/www_authenticate'][0].includes('insufficient_scope'));}rpcStatus=200;
 r=await service(request(body('tools/list')));const tools=(await r.json()).result.tools;assert.equal(tools.length,5);assert(tools.every(t=>t.annotations.readOnlyHint&&t.securitySchemes[0].type==='oauth2'));
 r=await service(request(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'apply_water_goal',arguments:{}}})));assert.equal((await r.json()).error.code,-32602);
 for(const text of ['null','[]','{','{"jsonrpc":"2.0","id":1,"method":"initialize","params":42}']){r=await service(request(text));assert.equal(r.status,400);}
 r=await service(request(body('initialize')+' '.repeat(17000)));assert.equal(r.status,413);
 r=await service(request(body(),jwt(claims),{Origin:config.authOrigin}));assert.equal(r.status,403);
 calls=[];await Promise.all(Array.from({length:4},()=>service(request())));assert.equal(calls.filter(c=>c.url.includes('/rest/')).length,4);assert(!calls.some(c=>/propose|apply|approve/.test(c.init.body||'')));
 rpcStatus=429;r=await service(request());assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');rpcStatus=200;
 service=createMcpService(config,fetcher,{allow:async()=>false});calls=[];r=await service(request());assert.equal(r.status,429);assert.equal(calls.length,0);
 service=createMcpService(config,fetcher,{allow:async()=>{throw Error('Limiter unavailable');}});calls=[];r=await service(request());assert.equal(r.status,503);assert.equal(calls.length,0);
 calls=[];r=await createAuthService(config,fetcher,{allow:async()=>{throw Error('Limiter unavailable');}})(form('/login','email=a&password=b'));assert.equal(r.status,400);assert.equal(calls.length,0);
 let time=0;const gate=localRateGate(2,100,1,()=>time);assert(await gate.allow('a'));assert(await gate.allow('a'));assert(!await gate.allow('a'));assert(!await gate.allow('b'));time=100;assert(await gate.allow('b'));
 const auth=createAuthService(config,fetcher,allow);
 r=await auth(new Request(config.authOrigin+'/login?return_to=https://evil.invalid'));assert.equal(r.status,400);
 r=await auth(new Request(config.authOrigin+'/login?return_to='+encodeURIComponent('/oauth/mcp/consent?authorization_id=test')));assert.equal(r.status,200);const html=await r.text(),csrf=/name="csrf" value="([a-f0-9]+)"/.exec(html)[1];assert(r.headers.get('set-cookie').includes('HttpOnly'));assert(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
 r=await auth(form('/login','email=a&password=b&csrf='+csrf));assert.equal(r.status,400);
 r=await auth(form('/login','email=a&password=b&csrf='+csrf+'&return_to='+encodeURIComponent('/oauth/mcp/consent?authorization_id=test'),{Cookie:'__Host-mfd-integration-csrf='+csrf}));assert.equal(r.status,303);assert(r.headers.get('location').endsWith('/oauth/mcp/consent?authorization_id=test'));assert(r.headers.get('set-cookie').includes('Secure; HttpOnly; SameSite=Lax'));assert(!r.headers.get('location').includes(browser));
 r=await auth(form('/login','csrf='+csrf,{Origin:'https://evil.invalid'}));assert.equal(r.status,403);
 r=await auth(new Request(config.authOrigin+'/oauth/mcp/consent?authorization_id=test'));assert.equal(r.status,401);assert((await r.text()).includes('/login?return_to='));
 const consent='authorization_id=test&decision=approve&permission=profile';
 r=await auth(form('/oauth/mcp/consent',consent));assert.equal(r.status,303);
 for(const target of ['https://evil.invalid/callback?code=x','javascript:alert(1)']){redirect=target;calls=[];r=await auth(form('/oauth/mcp/consent',consent));assert.equal(r.status,503);assert(!calls.some(c=>c.init.body?.includes('"operation":"consent"')));}redirect='https://client.invalid/callback?code=synthetic&state=state';
 authClient='other';calls=[];r=await auth(form('/oauth/mcp/consent',consent));assert.equal(r.status,503);assert(!calls.some(c=>c.url.endsWith('/consent')));authClient='client-a';
 nativeFail=true;calls=[];r=await auth(form('/oauth/mcp/consent',consent));assert.equal(r.status,503);assert(!calls.some(c=>c.init.body?.includes('"operation":"consent"')));nativeFail=false;
 calls=[];r=await auth(form('/oauth/mcp/connections','client_id=client-a'));assert.equal(r.status,200);assert(calls.findIndex(c=>c.init.body?.includes('"operation":"revoke"'))<calls.findIndex(c=>c.url.includes('/user/oauth/grants')));
 r=await auth(form('/oauth/mcp/approve','proposal_id=x'));assert.equal(r.status,403);
 r=await auth(new Request(config.authOrigin+'/oauth/mcp/connections',{headers:{Cookie:'__Host-mfd-integration-access='+jwt(claims)}}));assert.equal(r.status,401);
 r=await auth(form('/logout',''));assert.equal(r.status,200);assert(r.headers.get('set-cookie').includes('Max-Age=0'));
 console.log('PASS isolated MCP/auth: config, resource binding, verified-token boundary, owner arguments, client/consent denials, writes, malformed traffic, bounded local limiter, 429, cookies/CSRF, exact callbacks, consent failure, revoke-first and logout');
})().catch(e=>{console.error(e);process.exit(1)});
