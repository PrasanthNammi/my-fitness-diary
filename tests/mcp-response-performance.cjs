const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
let reads=0,clones=0,rpcStatus=200,upstream=[];
class ObservedResponse extends Response {
 static json(value,init={}){return new ObservedResponse(JSON.stringify(value),{...init,headers:{'Content-Type':'application/json',...init.headers}});}
 clone(){clones++;throw Error('Response tee is forbidden in the MCP adapter');}
 text(){reads++;return super.text();}
}
const ctx={module:{exports:{}},Request,Response:ObservedResponse,Headers,URL,TextEncoder,TextDecoder,Uint8Array,AbortSignal,atob,Date,crypto:require('crypto').webcrypto};
vm.createContext(ctx);vm.runInContext(buildSync({stdin:{contents:"export {createMcpService} from './hosting/independent/service';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,ctx);
const origin='https://mfd-connect-staging.shanustylish777.workers.dev',base='https://gngnrmzeghjzqsmzuktl.supabase.co';
const cfg={authOrigin:origin,resource:origin+'/mcp',supabase:base,issuer:base+'/auth/v1',key:'sb_publishable_synthetic',clients:['local'],redirects:{local:['https://client.invalid/callback']}};
const jwt='e30.'+Buffer.from(JSON.stringify({sub:'a',iss:cfg.issuer,aud:cfg.resource,role:'authenticated',client_id:'local',session_id:'session-a',exp:Date.now()/1000+3600})).toString('base64url')+'.synthetic';
const service=ctx.module.exports.createMcpService(cfg,async(url)=>{upstream.push(url);return url.endsWith('/user')?ObservedResponse.json({id:'a'}):ObservedResponse.json(rpcStatus===200?{data:{name:'MFD STAGING A'},revision:1}:{error:'denied'},{status:rpcStatus});},{allow:async()=>true});
const req=(method,name='get_profile')=>new Request(cfg.resource,{method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{name}})});
(async()=>{
 for(const method of ['tools/call','initialize','ping']){reads=0;upstream=[];const r=await service(req(method));assert.equal(r.status,200);assert.equal(reads,0);const p=await r.json();assert(p.result);assert.equal(upstream.filter(u=>u.endsWith('/user')).length,1);assert.equal(upstream.filter(u=>u.endsWith('/rpc/mfd_mcp')).length,method==='tools/call'?1:0);if(method==='tools/call')assert.equal(JSON.parse(p.result.content[0].text).data.name,'MFD STAGING A');}
 reads=0;const list=await service(req('tools/list'));assert.equal(reads,1);const tools=(await list.json()).result.tools;assert.equal(tools.length,5);assert(tools.every(t=>t.securitySchemes[0].type==='oauth2'&&t.annotations.readOnlyHint));
 for(const status of [401,403]){rpcStatus=status;reads=0;const r=await service(req('tools/call','get_nutrition'));assert.equal(reads,1);const p=await r.json();assert.equal(p.result.isError,true);assert(p.result._meta['mcp/www_authenticate'][0].includes('insufficient_scope'));}
 rpcStatus=429;reads=0;const throttled=await service(req('tools/call'));assert.equal(throttled.status,429);assert.equal(reads,0);assert.equal(throttled.headers.get('retry-after'),'60');
 rpcStatus=200;const bad=await service(req('tools/call','apply_water_goal'));assert.equal((await bad.json()).error.code,-32602);assert.equal(clones,0);
 console.log('PASS MCP response fast path: no tee, unchanged verified-user/live-RPC checks, five read-only OAuth tools, permission challenges and throttling');
})().catch(e=>{console.error(e);process.exitCode=1});
