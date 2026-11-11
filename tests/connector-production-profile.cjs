// Deployment profiles are fixed at build time: each bundle accepts only its own project and
// address. Also checks the public connector icon. Synthetic values only; no network.
const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
const load=deployment=>{
 const ctx={module:{exports:{}},URL,Response,Headers,Request,Uint8Array,atob,JSON};vm.createContext(ctx);
 vm.runInContext(buildSync({stdin:{contents:"export {colocatedConfig} from './hosting/independent/colocated-config';export {iconResponse} from './hosting/independent/icon';",resolveDir:process.cwd()},
  bundle:true,format:'cjs',platform:'neutral',mainFields:['module','main'],write:false,...(deployment?{define:{__MFD_DEPLOYMENT__:JSON.stringify(deployment)}}:{})}).outputFiles[0].text,ctx);
 return ctx.module.exports;
};
const PROD='https://djyozltkmbzhwuvemxuy.supabase.co',STAGE='https://gngnrmzeghjzqsmzuktl.supabase.co',ORIGIN='https://mfd-connect.shanustylish777.workers.dev';
const env=(supabase,origin,envName)=>({MFD_ENV:envName,MFD_MCP_WRITES:'false',MFD_SUPABASE_URL:supabase,MFD_OAUTH_ISSUER:supabase+'/auth/v1',MFD_MCP_RESOURCE_URL:origin+'/mcp',MFD_AUTH_ORIGIN:origin,
 MFD_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',MFD_ALLOWED_CLIENT_IDS:'["c1"]',MFD_CLIENT_REDIRECTS:JSON.stringify({c1:[origin+'/oauth/upstream/callback']})});
(async()=>{
 const prod=load({env:'production',supabase:PROD,origin:ORIGIN}),stage=load();
 const c=prod.colocatedConfig(env(PROD,ORIGIN,'production'));
 assert.equal(c.supabase,PROD);assert.equal(c.resource,ORIGIN+'/mcp');assert.deepEqual([...c.aiClients],['https://chatgpt.com','https://claude.ai','https://claude.com']);
 // Production bundle refuses the staging project, a staging profile, or any other address.
 assert.throws(()=>prod.colocatedConfig(env(STAGE,ORIGIN,'production')),/identity/);
 assert.throws(()=>prod.colocatedConfig(env(PROD,ORIGIN,'staging')),/profile/);
 assert.throws(()=>prod.colocatedConfig(env(PROD,'https://evil.workers.dev','production')),/origin/);
 // Staging bundle refuses production.
 assert.equal(stage.colocatedConfig(env(STAGE,'https://mfd-connect-staging.shanustylish777.workers.dev','staging')).supabase,STAGE);
 assert.throws(()=>stage.colocatedConfig(env(PROD,ORIGIN,'production')),/profile/);
 assert.throws(()=>stage.colocatedConfig(env(PROD,ORIGIN,'staging')),/identity/);
 // Icon: SVG and PNG served publicly, read-only.
 const svg=prod.iconResponse('/icon.svg','GET'),png=prod.iconResponse('/icon.png','GET');
 assert.equal(svg.headers.get('content-type'),'image/svg+xml');assert((await svg.text()).startsWith('<svg'));
 const bytes=new Uint8Array(await png.arrayBuffer());assert.deepEqual([...bytes.slice(0,4)],[0x89,0x50,0x4e,0x47]);
 assert.equal(prod.iconResponse('/icon.png','POST').status,405);assert.equal(prod.iconResponse('/other','GET'),null);
 console.log('PASS deployment profiles fixed at build time (production/staging accept only their own project and address); public SVG/PNG icon');
})().catch(e=>{console.error(e);process.exitCode=1});
