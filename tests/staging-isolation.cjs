const {buildSync}=require('esbuild'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortSignal,crypto:require('node:crypto').webcrypto,atob,btoa,Date};
vm.createContext(c);vm.runInContext(buildSync({entryPoints:['hosting/worker/mfd.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text,c);
const handle=c.module.exports.handleMfd,config=require('../.openai/environment.json');
const calls=[],deps={assets:{fetch:async()=>new Response('app')},fetch:async(url)=>{calls.push(url);return Response.json({})}};
(async()=>{
 for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']){
  const r=await handle(new Request(config.MFD_SITE_ORIGIN+path),deps),body=await r.json();
  assert.equal(r.status,200);assert.equal(body.resource,config.MFD_MCP_RESOURCE_URL);assert.deepEqual(body.authorization_servers,[config.MFD_OAUTH_ISSUER]);
  console.log('PASS discovery '+path+' '+JSON.stringify(body));
 }
 const r=await handle(new Request(config.MFD_SITE_ORIGIN+'/api/auth/migrate',{method:'POST',headers:{Origin:config.MFD_SITE_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:'synthetic-old-token'})}),deps);
 assert.equal(r.status,403);assert.equal(calls.length,0);
 for(const [key,value] of [['MFD_SUPABASE_URL','https://production.example'],['MFD_OAUTH_ISSUER','https://production.example/auth/v1'],['MFD_SITE_ORIGIN','https://production.example'],['MFD_MCP_RESOURCE_URL','https://production.example/mcp'],['MFD_SUPABASE_PUBLISHABLE_KEY','sb_secret_fake']]){
  await assert.rejects(()=>handle(new Request(config.MFD_SITE_ORIGIN+'/'),{...deps,env:{[key]:value}}));
 }
 console.log('PASS staging rejects production overrides, secret keys and session migration before upstream requests');
})().catch(e=>{console.error(e);process.exit(1)});
