// Synthetic Auth contract model only: real ES256 signatures, no network or hosted tokens.
const assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),{buildSync}=require('esbuild');
const context={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:crypto.webcrypto,atob,btoa,Date};vm.createContext(context);vm.runInContext(buildSync({stdin:{contents:"export {createAuthService} from './hosting/independent/auth';export {createMcpService} from './hosting/independent/service';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,context);
const o='https://acceptance.invalid',base='https://gngnrmzeghjzqsmzuktl.supabase.co',config={authOrigin:o,supabase:base,issuer:base+'/auth/v1',resource:o+'/mcp',clients:['synthetic-client'],redirects:{'synthetic-client':['https://client.invalid/callback']},key:'sb_publishable_synthetic'};
const key=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),rogue=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const sign=(claims,k=key)=>{const data=encode({alg:'ES256',kid:'local-ephemeral'})+'.'+encode(claims);return data+'.'+crypto.sign('sha256',Buffer.from(data),{key:k.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');};
const sessions=new Map([['oa','alice'],['ob','bob'],['ba','alice']]),grants=new Map([['alice',['profile']],['bob',['profile']]]),refresh=new Map([['synthetic-r0','ba']]);
const claim=(sub,session_id,aud=config.resource)=>({sub,session_id,aud,iss:config.issuer,role:'authenticated',...(aud===config.resource?{client_id:'synthetic-client'}:{}),exp:Math.floor(Date.now()/1000)+3600});
const alice=sign(claim('alice','oa')),bob=sign(claim('bob','ob')),browser=sign(claim('alice','ba','authenticated'));
function verified(token){try{const [h,p,s]=token.split('.');if(JSON.parse(Buffer.from(h,'base64url')).alg!=='ES256'||!crypto.verify('sha256',Buffer.from(h+'.'+p),{key:key.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')))return null;const c=JSON.parse(Buffer.from(p,'base64url'));return sessions.get(c.session_id)===c.sub?c:null;}catch{return null;}}
let rpcCalls=0,nativeFails=false,alreadyConsented=false,sequence=0,newOAuth;
const fake=async(url,init={})=>{assert(url.startsWith(base+'/'));assert.equal(init.redirect,'manual');const token=new Headers(init.headers).get('authorization')?.slice(7),c=verified(token);
 if(url.endsWith('/auth/v1/user'))return c?Response.json({id:c.sub}):Response.json({error:'Denied'},{status:401});
 if(url.endsWith('/token?grant_type=refresh_token')){const old=JSON.parse(init.body).refresh_token,s=refresh.get(old);if(!s)return Response.json({error:'refresh reuse after simulated grace'},{status:400});refresh.delete(old);const r='synthetic-r'+(++sequence);refresh.set(r,s);return Response.json({access_token:sign(claim(sessions.get(s),s,'authenticated')),refresh_token:r,user:{id:sessions.get(s)}});}
 if(!c)return Response.json({error:'Denied'},{status:401});
 if(url.includes('/oauth/authorizations/')){if(init.method==='POST'){newOAuth='oa-reconnect';sessions.set(newOAuth,'alice');return Response.json({redirect_url:'https://client.invalid/callback?code=synthetic-code&state=synthetic'});}return alreadyConsented?Response.json({redirect_url:'https://client.invalid/callback?code=synthetic-code&state=synthetic'}):Response.json({user:{id:'alice'},client:{id:'synthetic-client',name:'Synthetic'},redirect_uri:'https://client.invalid/callback'});}
 if(url.endsWith('/rest/v1/rpc/mfd_mcp')){rpcCalls++;const {operation,args}=JSON.parse(init.body);if(operation==='authorization_binding')return Response.json(grants.has(c.sub)?{client_id:'synthetic-client',redirect_uri:'https://client.invalid/callback'}:{error:'No local consent'},{status:grants.has(c.sub)?200:403});if(operation==='connections')return Response.json([]);if(operation==='revoke'){grants.delete(c.sub);return Response.json({});}if(operation==='consent'){grants.set(c.sub,args.permissions);return Response.json({});}if(!grants.get(c.sub)?.includes(operation))return Response.json({error:'Consent required'},{status:403});return Response.json({data:{name:c.sub==='alice'?'MFD STAGING A':'MFD STAGING B'},revision:1});}
 if(url.includes('/user/oauth/grants')){if(init.method==='DELETE'){if(nativeFails)return Response.json({error:'Synthetic outage'},{status:503});sessions.delete('oa');return new Response(null,{status:204});}return Response.json([]);}
 if(url.includes('/logout')){sessions.delete(c.session_id);for(const [r,s] of refresh)if(s===c.session_id)refresh.delete(r);return new Response(null,{status:204});}throw Error('Unmodeled upstream');};
const gate={allow:async()=>true},mcp=context.module.exports.createMcpService(config,fake,gate),auth=context.module.exports.createAuthService(config,fake,gate);
const req=(token,name='get_profile',args={})=>new Request(o+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
const cookie=token=>'__Host-mfd-integration-access='+token;
const post=(path,body,token=browser)=>new Request(o+path,{method:'POST',headers:{Origin:o,Cookie:cookie(token),'Content-Type':'application/x-www-form-urlencoded'},body});
(async()=>{
 for(const [t,name] of [[alice,'MFD STAGING A'],[bob,'MFD STAGING B']]){const r=await mcp(req(t));assert.equal(JSON.parse((await r.json()).result.content[0].text).data.name,name);}
 for(const t of [sign(claim('alice','oa'),rogue),alice.split('.').slice(0,2).join('.')+'.invalid',alice.split('.')[0]+'.'+encode({...claim('alice','oa'),sub:'bob'})+'.'+alice.split('.')[2],sign({...claim('alice','oa'),exp:1}),sign({...claim('alice','oa'),nbf:Date.now()/1000+100}),sign({...claim('alice','oa'),aud:'authenticated'}),sign({...claim('alice','oa'),aud:'https://old.invalid/mcp'}),sign({...claim('alice','oa'),iss:'https://wrong.invalid'}),sign({...claim('alice','oa'),client_id:'other'}),sign({...claim('alice','oa'),session_id:'ob'})]){const before=rpcCalls;assert.equal((await mcp(req(t))).status,401);assert.equal(rpcCalls,before);}
 let r=await mcp(req(alice,'get_profile',{user_id:'bob'}));assert.equal((await r.json()).error.code,-32602);
 r=await mcp(req(alice,'get_nutrition'));let j=await r.json();assert(j.result.isError);assert(j.result._meta['mcp/www_authenticate'][0].includes('insufficient_scope'));
 r=await mcp(req(alice,'apply_water_goal'));assert.equal((await r.json()).error.code,-32602);
 assert.equal((await mcp(new Request(o+'/mcp',{method:'POST',headers:{Cookie:cookie(browser)},body:'{}'}))).status,401);
 // Expired first-party access token refreshes; model rejects old refresh after its simulated reuse grace.
 const expired=sign({...claim('alice','ba','authenticated'),exp:1}),jar=cookie(expired)+'; __Host-mfd-integration-refresh=synthetic-r0';
 r=await auth(new Request(o+'/oauth/mcp/connections',{headers:{Cookie:jar}}));assert.equal(r.status,200);assert(r.headers.getSetCookie().some(c=>c.startsWith('__Host-mfd-integration-refresh=synthetic-r1;')));
 r=await auth(new Request(o+'/oauth/mcp/connections',{headers:{Cookie:jar}}));assert.equal(r.status,401);assert(r.headers.getSetCookie().some(c=>c.startsWith('__Host-mfd-integration-access=;')&&c.includes('Max-Age=0')));
 // Native revoke failure still removes local permission; a cryptographically valid old OAuth token cannot read data.
 nativeFails=true;r=await auth(post('/oauth/mcp/connections','client_id=synthetic-client'));assert.equal(r.status,503);assert(!grants.has('alice'));assert(verified(alice));
 r=await mcp(req(alice));assert((await r.json()).result.isError);assert.equal((await mcp(req(bob))).status,200);
 nativeFails=false;assert.equal((await auth(post('/oauth/mcp/connections','client_id=synthetic-client'))).status,200);assert.equal((await mcp(req(alice))).status,401);
 // Reconnect with fresh explicit consent; old revoked session stays invalid.
 r=await auth(post('/oauth/mcp/consent','authorization_id=synthetic&decision=approve&permission=profile'));assert.equal(r.status,303);assert.deepEqual(grants.get('alice'),['profile']);assert.equal((await mcp(req(sign(claim('alice',newOAuth))))).status,200);assert.equal((await mcp(req(alice))).status,401);
 // Existing consent reconnect uses same-owner binding; no re-consent or permission expansion.
 alreadyConsented=true;r=await auth(new Request(o+'/oauth/mcp/consent?authorization_id=synthetic',{headers:{Cookie:cookie(browser)}}));assert.equal(r.status,303);assert.deepEqual(grants.get('alice'),['profile']);
 r=await auth(post('/logout',''));assert.equal(r.status,200);assert(r.headers.getSetCookie().some(c=>c.includes('Max-Age=0')));assert(!sessions.has('ba'));assert(![...refresh.values()].includes('ba'));
 console.log('PASS local ES256 trust-boundary/claims/owner/section tests and modeled refresh-reuse, revoke-outage, old-token denial, fresh-consent reconnect and logout; secure existing-consent reconnect verified');
})().catch(e=>{console.error(e);process.exitCode=1});
