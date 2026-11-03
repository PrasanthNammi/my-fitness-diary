const {buildSync}=require('esbuild'),vm=require('node:vm'),assert=require('node:assert/strict'),fs=require('node:fs');
const ctx={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortSignal,Date,atob,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(buildSync({stdin:{contents:`export * from './hosting/independent/colocated-config';export * from './hosting/independent/colocated-router';`,resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,ctx);
const origin='https://mfd-colocated-staging.invalid',env={...JSON.parse(fs.readFileSync('.openai/environment.json')),MFD_AUTH_ORIGIN:origin,MFD_MCP_RESOURCE_URL:origin+'/mcp',MFD_ALLOWED_CLIENT_IDS:'["local-client"]',MFD_CLIENT_REDIRECTS:'{"local-client":["https://client.invalid/callback"]}'};
const {colocatedConfig,createColocatedService}=ctx.module.exports,config=colocatedConfig(env);
let upstream=0,consumed=[];
const fetcher=async()=>{upstream++;return Response.json({id:'alice'});};
function namespace(allow){return{idFromName(name){assert.equal(name,'mfd-staging-shared-v1');return 'one-object';},get(id){assert.equal(id,'one-object');return{async consume(kind){consumed.push(kind);return allow;}};}};}
(async()=>{
 assert.throws(()=>colocatedConfig({...env,MFD_MCP_RESOURCE_URL:'https://old.invalid/mcp'}));
 assert.throws(()=>colocatedConfig({...env,MFD_MCP_WRITES:'true'}));
 let app=createColocatedService(config,namespace(true),fetcher),r;
 r=await app(new Request(origin+'/.well-known/oauth-protected-resource/mcp'));assert.equal(r.status,200);assert.equal((await r.json()).resource,origin+'/mcp');
 r=await app(new Request(origin+'/login'));assert.equal(r.status,200);
 r=await app(new Request(origin+'/mcp',{method:'POST',body:'{}'}));assert.equal(r.status,401);
 assert.deepEqual(consumed,['discovery','auth','mcp']);assert.equal(upstream,0);
 r=await app(new Request(origin+'/internal/limiter'));assert.equal(r.status,404);assert.equal(consumed.length,3);
 r=await app(new Request('https://evil.invalid/mcp',{headers:{'X-Forwarded-Host':origin}}));assert.equal(r.status,421);
 r=await app(new Request(origin+'/mcp',{headers:{Origin:'https://evil.invalid'}}));assert.equal(r.status,403);
 for(const binding of [undefined,namespace(false),{idFromName:()=>{throw Error('binding down');}}]){
  app=createColocatedService(config,binding,fetcher);upstream=0;r=await app(new Request(origin+'/login'));assert([429,503].includes(r.status));assert.equal(upstream,0);
 }
 app=createColocatedService(config,{idFromName:()=>0,get:()=>({consume:()=>new Promise(()=>{})})},fetcher);r=await app(new Request(origin+'/login'));assert.equal(r.status,503);assert.equal(upstream,0);
 console.log('PASS colocated exact audience/origin, route separation, single shared object, protected MCP, unknown routes, unavailable/denied/timed-out coordinator fail closed before upstream');
})().catch(e=>{console.error(e);process.exit(1)});
