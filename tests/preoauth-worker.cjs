const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild'),fs=require('node:fs');
const ctx={module:{exports:{}},Request,Response,URL,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(buildSync({stdin:{contents:"export * from './hosting/independent/preoauth';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,ctx);
const {createPreoauthService,preoauthConfig,PREOAUTH_ORIGIN:origin}=ctx.module.exports;
const config=JSON.parse(fs.readFileSync('hosting/independent/preoauth-deployment.proposed.jsonc','utf8').split('\n').filter(x=>!x.startsWith('//')).join('\n'));
preoauthConfig(config.vars);for(const change of [{MFD_MCP_WRITES:'true'},{MFD_RELEASE_MODE:'active'},{MFD_ALLOWED_CLIENT_IDS:'["fake"]'},{MFD_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_unused'},{MFD_AUTH_ORIGIN:'https://wrong.invalid'},{MFD_MCP_RESOURCE_URL:origin+'/other'}])assert.throws(()=>preoauthConfig({...config.vars,...change}));
let consumed=[];const binding={idFromName:n=>{assert.equal(n,'mfd-staging-shared-v1');return n;},get:()=>({consume:async k=>{consumed.push(k);return true;}})};
(async()=>{const app=createPreoauthService(binding);
for(const path of ['/','/login','/logout','/auth/google','/auth/google/callback?code=synthetic&state=synthetic','/oauth/mcp/consent?authorization_id=synthetic','/oauth/mcp/connections','/oauth/mcp/approve','/mcp'])for(const method of ['GET','POST']){const r=await app(new Request(origin+path,{method,headers:{Authorization:'Bearer synthetic',Cookie:'session=synthetic',Origin:origin},...(method==='POST'?{body:'synthetic'}:{})}));assert.equal(r.status,503);assert(!r.headers.has('set-cookie'));assert(!r.headers.has('location'));assert.equal(r.headers.get('cache-control'),'private, no-store');const text=await r.text();assert(!text.includes('synthetic'));}
for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']){const r=await app(new Request(origin+path));assert.equal(r.status,200);assert.equal((await r.json()).resource,origin+'/mcp');}
assert(consumed.includes('auth')&&consumed.includes('mcp')&&consumed.includes('discovery'));
assert.equal((await app(new Request('https://wrong.invalid/mcp',{headers:{'X-Forwarded-Host':origin}}))).status,421);
assert.equal((await app(new Request(origin+'/mcp',{headers:{Origin:'https://wrong.invalid'}}))).status,403);
assert.equal((await app(new Request(origin+'/internal/limiter'))).status,404);
for(const b of [undefined,{idFromName:()=>{throw Error('outage');}}])assert.equal((await createPreoauthService(b)(new Request(origin+'/login'))).status,503);
assert.equal((await createPreoauthService({idFromName:()=>0,get:()=>({consume:async()=>false})})(new Request(origin+'/login'))).status,429);
assert.equal((await createPreoauthService({idFromName:()=>0,get:()=>({consume:()=>new Promise(()=>{})})})(new Request(origin+'/login'))).status,503);
console.log('PASS pre-OAuth config, exact routing, no credential/session/consent/MCP acceptance, metadata only, shared budgets and outage/timeout fail closed');})().catch(e=>{console.error(e);process.exitCode=1});
