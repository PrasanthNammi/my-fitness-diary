// Synthetic application-contract tests; never a hosted-provider lifecycle claim.
const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
const ctx={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:require('node:crypto').webcrypto,atob,btoa,Date};vm.createContext(ctx);vm.runInContext(buildSync({stdin:{contents:"export {createAuthService} from './hosting/independent/auth';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,ctx);
const origin='https://consent.invalid',base='https://gngnrmzeghjzqsmzuktl.supabase.co',callback='https://client.invalid/callback',config={authOrigin:origin,supabase:base,issuer:base+'/auth/v1',resource:origin+'/mcp',clients:['synthetic-client'],redirects:{'synthetic-client':[callback]},key:'sb_publishable_synthetic'};
const claims={sub:'alice',aud:'authenticated',iss:config.issuer,role:'authenticated',session_id:'synthetic-session',exp:Date.now()/1000+3600};const token='e30.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic';
let permissions=['profile','nutrition'],nativeFailure=false,localFailure=false,used=false,redirectOnly=false,owner='alice',approvalCalls=0,saveCalls=0;
const fetcher=async(url,init={})=>{assert(url.startsWith(base+'/'));assert.equal(init.redirect,'manual');
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'alice'});
 if(url.includes('/oauth/authorizations/')){if(init.method==='POST'){approvalCalls++;if(nativeFailure||used)return Response.json({error:'denied'},{status:409});used=true;return Response.json({redirect_url:callback+'?code=synthetic&state=synthetic'});}return Response.json(redirectOnly?{redirect_url:callback+'?code=synthetic&state=synthetic'}:{client:{id:'synthetic-client'},user:{id:owner},redirect_uri:callback});}
 const b=JSON.parse(init.body||'{}');if(b.operation==='authorization_binding')return Response.json({client_id:'synthetic-client',redirect_uri:callback});
 assert.equal(b.operation,'consent');saveCalls++;if(localFailure)return Response.json({error:'denied'},{status:503});permissions=Array.from(b.args.permissions);return Response.json({});};
const auth=ctx.module.exports.createAuthService(config,fetcher,{allow:async()=>true});
const post=(body,headers={})=>auth(new Request(origin+'/oauth/mcp/consent',{method:'POST',headers:{Origin:origin,Cookie:'__Host-mfd-integration-access='+token,'Content-Type':'application/x-www-form-urlencoded',...headers},body}));
const approve='authorization_id=synthetic&decision=approve&permission=profile';
(async()=>{
 assert.equal((await post(approve)).status,303);assert.deepEqual(permissions,['profile']); // reduction replaces rather than unions
 const saved=saveCalls;assert.equal((await post(approve+'&permission=nutrition')).status,503);assert.equal(saveCalls,saved);assert.deepEqual(permissions,['profile']); // native replay refusal
 used=false;redirectOnly=true;assert.equal((await auth(new Request(origin+'/oauth/mcp/consent?authorization_id=synthetic&permission=nutrition',{headers:{Cookie:'__Host-mfd-integration-access='+token}}))).status,303);assert.deepEqual(permissions,['profile']);assert.equal(saveCalls,saved);redirectOnly=false;
 const count=approvalCalls;for(const suffix of ['','&permission=admin','&permission=apply_water_goal']){const body='authorization_id=synthetic&decision=approve'+suffix;assert.equal((await post(body)).status,400);}assert.equal(approvalCalls,count);
 for(const headers of [{Origin:'https://attacker.invalid'},{Origin:'null'},{Origin:''},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await post(approve+'&permission=nutrition',headers)).status,403);assert.deepEqual(permissions,['profile']);assert.equal(saveCalls,saved);
 owner='bob';assert.equal((await post(approve+'&permission=nutrition')).status,403);owner='alice';assert.deepEqual(permissions,['profile']);
 nativeFailure=true;assert.equal((await post(approve+'&permission=nutrition')).status,503);nativeFailure=false;assert.equal(saveCalls,saved);assert.deepEqual(permissions,['profile']);
 localFailure=true;used=false;assert.equal((await post(approve+'&permission=nutrition')).status,503);assert.deepEqual(permissions,['profile']);localFailure=false;
 used=false;assert.equal((await post('authorization_id=synthetic&decision=deny&permission=nutrition')).status,303);assert.deepEqual(permissions,['profile']);
 console.log('PASS synthetic consent reduction, no expansion on reconnect/denial/native or local failure, native replay refusal, owner/Origin/permission rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
