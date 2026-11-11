// Connector proxy (Worker as OAuth server for AI apps). Synthetic helpers/upstreams only.
const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
const ctx={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:require('node:crypto').webcrypto,atob,btoa,Date,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(buildSync({stdin:{contents:"export * from './hosting/independent/connector';export {createColocatedService} from './hosting/independent/colocated-router';",resolveDir:process.cwd()},bundle:true,format:'cjs',platform:'neutral',mainFields:['module','main'],external:['cloudflare:workers'],write:false}).outputFiles[0].text,ctx);
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
const C=ctx.module.exports,origin='https://mfd-connect.invalid',base='https://gngnrmzeghjzqsmzuktl.supabase.co',callback=origin+'/oauth/upstream/callback',app='https://app.invalid/cb';
const config={supabase:base,issuer:base+'/auth/v1',resource:origin+'/mcp',authOrigin:origin,key:'sb_publishable_synthetic',clients:['up'],redirects:{up:[callback]}};
const jwt=c=>'e30.'+Buffer.from(JSON.stringify({iss:config.issuer,aud:config.resource,client_id:'up',exp:Date.now()/1000+3600,...c})).toString('base64url')+'.sig';
let rpcReplies={ai_entries:[]},who={userId:'alice',email:'alice@example.invalid',token:'browser-alice'},upstreamData,completed,approvedScope,revoked=[],rpc=[],rpcStatus=200,tokenReply={status:200,claims:{sub:'alice'}};
let details={client:{id:'up'},user:{id:'alice'},redirect_uri:callback},grants=[{id:'g1',userId:'alice',clientId:'app',scope:['workouts'],createdAt:1}];
const request={clientId:'app',redirectUri:app,state:'s',scope:[],responseType:'code',issuer:origin};
const oauth={
 parseAuthRequest:async r=>{const u=new URL(r.url);if(u.searchParams.get('client_id')!=='app')throw Error('unknown client');if(u.searchParams.get('redirect_uri')!==app)throw Object.assign(Error('bad'),{redirectTo:app+'?error=invalid_request'});return request;},
 describeConsent:async()=>({clientId:'app',clientName:'<img src=x onerror=alert(1)>',redirectHost:'app.invalid',redirectIsLoopback:false,scope:[],redirectUri:app}),
 beginConsent:async()=>({handle:'h1',headers:new Headers({'Set-Cookie':'__Host-oauth-consent-1=x; Secure'})}),
 approveConsent:async(r,h,o)=>{assert.equal(h,'h1');approvedScope=o.scope;return {request,headers:new Headers()};},
 denyConsent:async()=>({headers:new Headers({Location:app+'?error=access_denied&state=s'})}),
 beginUpstream:async(r,o)=>{upstreamData=o.data;return {state:'st',headers:o.headers};},
 finishUpstream:async()=>({request:{...request,scope:['workouts']},data:upstreamData,headers:new Headers()}),
 completeAuthorization:async o=>{completed=o;return {redirectTo:app+'?code=c&state=s&iss='+origin};},
 listUserGrants:async uid=>({items:grants.filter(g=>g.userId===uid)}),
 revokeGrant:async(id,uid)=>{revoked.push(id+':'+uid);},
 lookupClient:async()=>({clientId:'app',clientName:'<b>App</b>'}),
};
const raw=async(path,init={},token)=>{
 if(path.startsWith('/auth/v1/oauth/authorizations/')){if(path.endsWith('/consent'))return Response.json({redirect_url:details.consentRedirect||callback+'?code=up-code&state=st'});return Response.json(details);}
 if(path==='/rest/v1/rpc/mfd_mcp'){const b=JSON.parse(init.body);rpc.push({...b,token});return Response.json(rpcReplies[b.operation]??{},{status:rpcStatus});}
 throw Error('unexpected '+path);
};
const fetcher=async(url,init)=>{assert.equal(url,base+'/auth/v1/oauth/token');const b=new URLSearchParams(init.body);assert.equal(b.get('client_id'),'up');assert.equal(b.get('resource'),config.resource);
 return tokenReply.status===200?Response.json({access_token:jwt(tokenReply.claims),refresh_token:'rt-'+b.get('grant_type')}):Response.json({error:'x'},{status:tokenReply.status});};
const c=()=>({config,raw,fetcher,oauth,identity:async()=>who});
const form=(path,fields,cookie='')=>new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,Cookie:cookie},body:new URLSearchParams(fields)});
const authorizeGet=q=>C.authorize(new Request(origin+'/oauth/authorize?'+new URLSearchParams(q)),c());
(async()=>{
 assert(C.audienceIs('authenticated','authenticated')&&C.audienceIs(['authenticated'],'authenticated')&&!C.audienceIs(['authenticated','x'],'authenticated')&&!C.audienceIs('x','authenticated'));
 // Consent page.
 assert.equal((await authorizeGet({client_id:'nope'})).response.status,400);
 assert.equal((await authorizeGet({client_id:'app',redirect_uri:'https://evil.invalid'})).response.headers.get('location'),app+'?error=invalid_request');
 who=null;let r=(await authorizeGet({client_id:'app',redirect_uri:app})).response;assert.equal(r.status,303);assert(r.headers.get('location').startsWith('/login?return_to=%2Foauth%2Fauthorize%3F'));
 who={userId:'alice',email:'alice@example.invalid',token:'browser-alice'};
 let out=await authorizeGet({client_id:'app',redirect_uri:app});const html=await out.response.text();
 assert.equal(out.response.status,200);assert(!html.includes('<img')&&html.includes('&lt;img')&&html.includes('not verified')&&!/<input[^>]*\bchecked\b/.test(html)&&html.includes('alice@example.invalid'));
 assert(['log_workouts','log_nutrition','log_progress'].every(p=>html.includes(`value="${p}"`))&&html.includes('Add workouts')&&html.includes('never edit or delete'));
 assert(out.response.headers.get('set-cookie').startsWith('__Host-oauth-consent-'));same(out.formTargets,[base+'/auth/v1/oauth/authorize',app]);
 // Approve/deny.
 r=(await C.authorize(form('/oauth/authorize',{handle:'h1',decision:'deny'}),c())).response;assert.equal(r.status,302);assert(r.headers.get('location').includes('error=access_denied'));
 for(const bad of [[],['secrets'],['log_admin'],['workouts','workouts']]){const f=new URLSearchParams({handle:'h1',decision:'approve'});bad.forEach(s=>f.append('permission',s));assert.equal((await C.authorize(form('/oauth/authorize',f),c())).response.status,400);}
 who=null;assert.equal((await C.authorize(form('/oauth/authorize',{handle:'h1',decision:'approve',permission:'workouts'}),c())).response.status,401);who={userId:'alice',email:'',token:'browser-alice'};
 const f=new URLSearchParams({handle:'h1',decision:'approve',timezone:'Europe/Berlin'});f.append('permission','workouts');f.append('permission','profile');
 r=(await C.authorize(form('/oauth/authorize',f),c())).response;const up=new URL(r.headers.get('location'));
 assert.equal(up.origin+up.pathname,base+'/auth/v1/oauth/authorize');assert.equal(up.searchParams.get('client_id'),'up');assert.equal(up.searchParams.get('redirect_uri'),callback);assert.equal(up.searchParams.get('code_challenge_method'),'S256');assert.equal(up.searchParams.get('state'),'st');
 same(approvedScope,['workouts','profile']);assert(/^[a-f0-9]{64}$/.test(upstreamData.verifier)&&upstreamData.userId==='alice');same(upstreamData.sections,['workouts','profile']);assert.equal(upstreamData.timezone,'Europe/Berlin');
 {const g=new URLSearchParams({handle:'h1',decision:'approve',timezone:'../../etc'});g.append('permission','workouts');await C.authorize(form('/oauth/authorize',g),c());assert.equal(upstreamData.timezone,'UTC');}
 {const g=new URLSearchParams({handle:'h1',decision:'approve',timezone:'Europe/Berlin'});g.append('permission','workouts');g.append('permission','profile');await C.authorize(form('/oauth/authorize',g),c());}
 // Supabase's page for the Worker client: same browser, same user, exact client and callback only.
 const sb=(cookie='__Host-oauth-upstream-1=x')=>C.supabaseConsent(new Request(origin+'/oauth/mcp/consent?authorization_id=auth1',{headers:{Cookie:cookie}}),c());
 assert.equal((await sb('')).status,403);
 for(const d of [{client:{id:'other'},user:{id:'alice'},redirect_uri:callback},{client:{id:'up'},user:{id:'bob'},redirect_uri:callback},{client:{id:'up'},user:{id:'alice'},redirect_uri:'https://evil.invalid'}]){details=d;assert.equal((await sb()).status,403);}
 details={client:{id:'up'},user:{id:'alice'},redirect_uri:callback};r=await sb();assert.equal(r.status,303);assert(r.headers.get('location').startsWith(callback+'?code='));
 details={redirect_url:'https://evil.invalid/x?code=1'};await assert.rejects(sb());details={client:{id:'up'},user:{id:'alice'},redirect_uri:callback};
 // Upstream callback.
 const cb=q=>C.upstreamCallback(new Request(callback+'?'+new URLSearchParams(q)),c());
 r=await cb({error:'access_denied',state:'st'});assert.equal(new URL(r.headers.get('location')).searchParams.get('error'),'access_denied');assert.equal(new URL(r.headers.get('location')).searchParams.get('iss'),origin);
 tokenReply={status:200,claims:{sub:'bob'}};r=await cb({code:'x',state:'st'});assert.equal(new URL(r.headers.get('location')).searchParams.get('error'),'server_error');
 tokenReply={status:200,claims:{sub:'alice',aud:'authenticated'}};r=await cb({code:'x',state:'st'});assert.equal(new URL(r.headers.get('location')).searchParams.get('error'),'server_error');
 tokenReply={status:200,claims:{sub:'alice'}};who={userId:'bob',email:'',token:'browser-bob'};r=await cb({code:'x',state:'st'});assert.equal(new URL(r.headers.get('location')).searchParams.get('error'),'access_denied');
 who={userId:'alice',email:'',token:'browser-alice'};rpcStatus=500;r=await cb({code:'x',state:'st'});assert.equal(new URL(r.headers.get('location')).searchParams.get('error'),'server_error');rpcStatus=200;
 rpc=[];completed=null;r=await cb({code:'x',state:'st'});assert.equal(r.headers.get('location'),app+'?code=c&state=s&iss='+origin);
 same(rpc,[{operation:'consent',args:{client_id:'app',permissions:['workouts','profile'],timezone:'Europe/Berlin'},token:'browser-alice'}]);
 assert.equal(completed.userId,'alice');same(completed.scope,['workouts','profile']);assert.equal(completed.props.connection,'app');assert.equal(completed.props.sb.refresh,'rt-authorization_code');
 // Connections: only own grants; diary sections removed when no other grant of that app remains.
 const conn=fields=>C.connections(form('/oauth/mcp/connections',fields),c());
 grants.push({id:'g2',userId:'bob',clientId:'app',scope:['nutrition'],createdAt:1});rpc=[];
 assert.equal((await conn({grant_id:'g2'})).status,404);same(revoked,[]);
 grants.push({id:'g3',userId:'alice',clientId:'app',scope:['workouts'],createdAt:2});
 // Undo: the user's own browser session asks the diary to remove that app's unchanged recent entries.
 // Undo is reviewed first: the page lists this app's recent entries; only ticked ones are removed.
 r=await conn({grant_id:'g1',action:'review'});assert.equal(r.status,200);assert((await r.text()).includes('Nothing to undo'));
 rpcReplies.ai_entries=[{kind:'weights',id:'w1',at:'2026-11-03T10:00:00Z',date:'2026-11-03',unchanged:true,kg:72},{kind:'meals',id:'m1',at:'2026-11-03T09:00:00Z',date:'2026-11-03',unchanged:true,meal:'Breakfast',name:'<b>Egg</b>',kcal:78},{kind:'meals',id:'m2',at:'2026-11-02T20:00:00Z',date:'2026-11-02',unchanged:false,meal:'Lunch',name:'Rice',kcal:650}];
 let page2=await (await conn({grant_id:'g1',action:'review'})).text();
 assert(page2.includes('value="w1"')&&page2.includes('value="m1"')&&!page2.includes('value="m2"')&&page2.includes('Weigh-in · 72 kg · 3 Nov')&&page2.includes('&lt;b&gt;Egg')&&page2.includes('Lunch · Rice · 650 kcal · 2 Nov')&&page2.includes('data-all="entry"'));
 rpc=[];r=await conn({grant_id:'g1',action:'undo'});assert((await r.text()).includes('Nothing selected'));same(rpc,[]);
 rpcReplies.undo={removed:1,kept_edited:1,skipped:1};
 {const f=new URLSearchParams({grant_id:'g1',action:'undo'});f.append('entry','w1');f.append('entry','m1');page2=await (await conn(f)).text();}
 same(rpc.map(x=>[x.operation,x.args.client_id,x.args.ids,x.token]),[['undo','app',['w1','m1'],'browser-alice']]);assert(page2.includes('Removed 1 entry')&&page2.includes('1 selected entry was kept'));
 assert.equal((await conn({grant_id:'g2',action:'review'})).status,404);same(revoked,[]);rpcReplies.ai_entries=[];
 rpc=[];
 assert.equal((await conn({grant_id:'g1'})).status,200);same(revoked,['g1:alice']);assert.equal(rpc.length,0);
 grants=grants.filter(g=>g.id!=='g1');assert.equal((await conn({grant_id:'g3'})).status,200);same(rpc.map(x=>x.operation+':'+x.args.client_id),['revoke:app']);
 const list=await (await C.connections(new Request(origin+'/oauth/mcp/connections'),c())).text();assert(!list.includes('<b>App')&&list.includes('&lt;b&gt;App'));
 // Only listed AI apps may connect, by client metadata document origin.
 {const listed={...config,aiClients:['https://chatgpt.com','https://claude.ai']},cl=()=>({...c(),config:listed});
  assert(C.aiClientAllowed(listed,'https://chatgpt.com/oauth/client.json')&&C.aiClientAllowed(listed,'https://claude.ai/oauth/mcp-oauth-client-metadata'));
  for(const id of ['app','http://chatgpt.com/x','https://chatgpt.com.evil.invalid/x','https://evil.invalid/chatgpt.com','javascript:alert(1)',''])assert(!C.aiClientAllowed(listed,id),id);
  assert(C.aiClientAllowed(config,'app'));
  r=(await C.authorize(new Request(origin+'/oauth/authorize?client_id=app&redirect_uri='+encodeURIComponent(app)),cl())).response;assert.equal(r.status,403);assert((await r.text()).includes('ChatGPT and Claude'));
  assert.equal((await C.authorize(new Request(origin+'/oauth/authorize?client_id='+encodeURIComponent('https://chatgpt.com/oauth/client.json')),cl())).response.status,400);
  const g=new URLSearchParams({handle:'h1',decision:'approve'});g.append('permission','workouts');upstreamData=null;
  assert.equal((await C.authorize(form('/oauth/authorize',g),cl())).response.status,403);assert.equal(upstreamData,null);}
 // Upstream refresh mapping.
 const props={userId:'alice',connection:'app',sb:{access:'a',refresh:'r'}};
 tokenReply={status:200,claims:{sub:'alice'}};let x=await C.refreshUpstream(config,fetcher,props);assert.equal(x.status,'ok');assert.equal(x.props.sb.refresh,'rt-refresh_token');assert.equal(x.props.connection,'app');
 tokenReply={status:400};assert.equal((await C.refreshUpstream(config,fetcher,props)).status,'revoked');
 tokenReply={status:503};assert.equal((await C.refreshUpstream(config,fetcher,props)).status,'unavailable');
 tokenReply={status:200,claims:{sub:'alice',client_id:'someone-else'}};assert.equal((await C.refreshUpstream(config,fetcher,props)).status,'revoked');
 // Shared quota covers the provider's endpoints; the pre-connector router does not expose them.
 let allow=false;const svc=C.createColocatedService(config,{idFromName:()=>0,get:()=>({consume:async()=>allow})},async()=>Response.json({}));
 for(const p of ['/oauth/token','/oauth/register','/oauth/authorize','/oauth/upstream/callback','/.well-known/oauth-authorization-server','/mcp'])assert.equal((await svc.guard(new Request(origin+p,{method:'POST'}),true)).status,429,p);
 allow=true;assert.equal(await svc.guard(new Request(origin+'/oauth/token',{method:'POST'}),true),null);
 assert.equal((await svc.guard(new Request(origin+'/oauth/token',{method:'POST'}))).status,404);assert.equal((await svc.guard(new Request(origin+'/admin'),true)).status,404);
 assert.equal((await svc.guard(new Request(origin+'/oauth/token',{method:'POST',headers:{Origin:'https://evil.invalid'}}),true)).status,403);
 console.log('PASS connector OAuth: escaped consent page, required sections, browser/user/client-bound Supabase hand-off, callback identity checks, own-grant revocation, upstream refresh mapping, quota on provider endpoints, timezone capture, user undo, AI app allowlist');
})().catch(e=>{console.error(e);process.exitCode=1});
