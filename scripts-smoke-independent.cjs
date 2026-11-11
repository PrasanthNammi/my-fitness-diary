// Loopback-only rehearsal of actual generated bundles with synthetic Auth/RPC.
// Never connects to Supabase or creates hosted accounts.
const http=require('node:http'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const base='https://gngnrmzeghjzqsmzuktl.supabase.co',resource=base+'/functions/v1/mfd-mcp/mcp';
const env={MFD_ENV:'staging',MFD_SUPABASE_URL:base,MFD_OAUTH_ISSUER:base+'/auth/v1',MFD_MCP_RESOURCE_URL:resource,MFD_AUTH_ORIGIN:'https://mfd-auth-staging.invalid',MFD_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',MFD_ALLOWED_CLIENT_IDS:'["synthetic-client"]',MFD_CLIENT_REDIRECTS:'{"synthetic-client":["https://client.invalid/callback"]}',MFD_MCP_WRITES:'false'};
const claims={sub:'synthetic-user',iss:env.MFD_OAUTH_ISSUER,aud:resource,role:'authenticated',client_id:'synthetic-client',session_id:'synthetic-session',exp:Date.now()/1000+3600};
const bearer='e30.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.synthetic';
let edge;
const context={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextDecoder,TextEncoder,Uint8Array,AbortSignal,Date,atob,crypto:require('node:crypto').webcrypto,Deno:{env:{toObject:()=>env},serve:handler=>{edge=handler;}},fetch:async(url,init)=>{
 assert(url.startsWith(base));assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+bearer);
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'synthetic-user'});
 if(url.endsWith('/rest/v1/rpc/mfd_mcp'))return Response.json({data:{name:'Synthetic'},revision:1});
 throw Error('Unexpected synthetic upstream');
}};
vm.createContext(context);
vm.runInContext(transformSync(fs.readFileSync('.sites-runtime/independent/edge.js','utf8'),{format:'cjs'}).code,context);
vm.runInContext(transformSync(fs.readFileSync('.sites-runtime/independent/auth-worker.js','utf8'),{format:'cjs'}).code,context);
const auth=context.module.exports.default;
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const part of req)chunks.push(part);
  const isAuth=req.url.startsWith('/auth/');const target=isAuth?env.MFD_AUTH_ORIGIN+req.url.slice(5):base+req.url;
  const request=new Request(target,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
  const response=isAuth?await auth.fetch(request,env):await edge(request);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Smoke adapter error');}
});
(async()=>{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const origin='http://127.0.0.1:'+server.address().port,prefix='/functions/v1/mfd-mcp';let r;
  r=await fetch(origin+prefix+'/.well-known/oauth-protected-resource/mcp');assert.equal((await r.json()).resource,resource);
  r=await fetch(origin+prefix+'/mcp',{method:'POST',body:'{}'});assert.equal(r.status,401);
  const headers={Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
  for(const method of ['initialize','tools/list']){r=await fetch(origin+prefix+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method})});assert((await r.json()).result);}
  r=await fetch(origin+prefix+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_profile'}})});assert((await r.json()).result.content[0].text.includes('Synthetic'));
  r=await fetch(origin+'/auth/login');assert.equal(r.status,200);assert((await r.text()).includes('name="csrf"'));assert(r.headers.get('set-cookie').includes('HttpOnly'));
  r=await fetch(origin+'/auth/oauth/mcp/connections');assert.equal(r.status,401);
  console.log('PASS 7 loopback requests against generated MCP/auth bundles; synthetic upstream only; no hosted access');
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
