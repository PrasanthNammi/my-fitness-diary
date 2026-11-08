// /api/push/*: forwards to the MFD push service with the user's session; same-origin only; fixed paths.
const {buildSync}=require('esbuild'),vm=require('vm'),assert=require('assert');
const c={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortSignal,crypto:require('crypto').webcrypto,atob,btoa,Date};vm.createContext(c);vm.runInContext(buildSync({entryPoints:['hosting/worker/mfd.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text,c);const handle=c.module.exports.handleMfd;
const origin='https://prasanth-nammi-portfolio.shanustylish777.chatgpt.site',PUSH='https://mfd-connect.shanustylish777.workers.dev';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:'alice'})).toString('base64url')+'.signature';
let calls=[];const deps={assets:{fetch:async()=>new Response('app')},fetch:async(url,init)=>{calls.push({url,init});return Response.json({ok:true,key:'BKEY'})}};
const jar='__Host-mfd-access='+token+'; __Host-mfd-refresh=refresh-private';
const req=(path,method='GET',body,headers={})=>new Request(origin+path,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
(async()=>{
 let r=await handle(req('/api/push/key'),deps);assert.equal(r.status,200);assert.equal(calls[0].url,PUSH+'/push/key');assert(!new Headers(calls[0].init.headers).has('Authorization'),'public key needs no session');
 calls=[];r=await handle(req('/api/push/rests','POST',{rests:[]}),deps);assert.equal(r.status,401);assert.equal(calls.length,0,'no session: nothing forwarded');
 calls=[];r=await handle(req('/api/push/rests','POST',{rests:[{id:'b1',ends:1,label:'Bench'}],tz:'Europe/Berlin'},{Cookie:jar}),deps);assert.equal(r.status,200);
 assert.equal(calls[0].url,PUSH+'/push/rests');assert.equal(new Headers(calls[0].init.headers).get('Authorization'),'Bearer '+token);assert.deepEqual(JSON.parse(calls[0].init.body),{rests:[{id:'b1',ends:1,label:'Bench'}],tz:'Europe/Berlin'});
 assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 calls=[];r=await handle(req('/api/push/rests','POST',{rests:[]},{Cookie:jar,Origin:'https://evil.example'}),deps);assert.equal(r.status,403);assert.equal(calls.length,0,'cross-site requests are refused');
 for(const p of ['/api/push/social','/api/push/other','/api/push/rests%2Fadjust','/api/push/rests/','/api/push/devices/remove/x']){calls=[];r=await handle(req(p,'POST',{},{Cookie:jar}),deps);assert.equal(r.status,404,p);assert.equal(calls.length,0,p)}
 calls=[];r=await handle(req('/api/push/rests','DELETE',undefined,{Cookie:jar}),deps);assert.equal(r.status,404);assert.equal(calls.length,0);
 calls=[];r=await handle(new Request(origin+'/api/push/prefs',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain',Cookie:jar},body:'x'}),deps);assert.equal(r.status,415);assert.equal(calls.length,0,'JSON only');
 console.log('PASS push proxy: session forwarded, same-origin only, fixed paths, JSON only');
})().catch(e=>{console.error(e);process.exit(1)});
