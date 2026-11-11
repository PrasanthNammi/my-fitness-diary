// Local owned-flow bridge. New Chrome process/private context only; never attaches to a user's browser.
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {browserProxy}=require('./c1c-browser-proxy.cjs');
const AUTH='https://gngnrmzeghjzqsmzuktl.supabase.co',CALLBACK='https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback';
async function ownedBrowser({fixtureOrigin,timeoutMs=300000,recordAuthRequest=()=>{}}={}){
 if(fixtureOrigin&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixtureOrigin))throw Error('BROWSER_FIXTURE_ORIGIN');
 const proxy=fixtureOrigin?null:await browserProxy();
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-c1c-owned-'));const args=['--remote-debugging-pipe','--user-data-dir='+dir,'--no-first-run','--no-default-browser-check','--disable-sync','--disable-background-networking','--disable-breakpad','--disable-crash-reporter','--disable-logging',...(fixtureOrigin?['--headless=new','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost']:['--proxy-server='+proxy.url,'--proxy-bypass-list=<-loopback>']),'about:blank'];
 const child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args,{stdio:['ignore','ignore','ignore','pipe','pipe']});let serial=0,buffer='',closed=false,handler;const pending=new Map();const context={};let fatal=()=>{};
 const failAll=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('BROWSER_CLOSED'));}pending.clear();fatal(Error('BROWSER_CLOSED'));};child.on('error',failAll);child.on('exit',failAll);
 function send(method,params={},sessionId){if(closed)return Promise.reject(Error('BROWSER_CLOSED'));return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('BROWSER_COMMAND_TIMEOUT'));},15000);pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
 child.stdio[4].on('data',b=>{buffer+=b.toString();for(;;){const at=buffer.indexOf('\0');if(at<0)break;const raw=buffer.slice(0,at);buffer=buffer.slice(at+1);let m;try{m=JSON.parse(raw);}catch{failAll();return;}if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('BROWSER_PROTOCOL')):p.resolve(m.result);}}else if(handler)handler(m).catch(()=>failAll());}});
 let browserContextId,sessionId,frame;
 try{({browserContextId}=await send('Target.createBrowserContext',{disposeOnDetach:true}));const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});({sessionId}=await send('Target.attachToTarget',{targetId,flatten:true}));await send('Page.enable',{},sessionId);frame=(await send('Page.getFrameTree',{},sessionId)).frameTree.frame.id;}catch{closed=true;child.kill('SIGTERM');if(proxy)await proxy.close();throw Error('BROWSER_SETUP');}
 async function close(){if(closed)return;try{await send('Target.disposeBrowserContext',{browserContextId});}catch{}closed=true;child.kill('SIGTERM');failAll();if(proxy)await proxy.close();}
 return {context,close,async authorize(url){const u=new URL(url);if(fixtureOrigin?u.origin!==fixtureOrigin:u.origin!==AUTH||u.pathname!=='/auth/v1/authorize')throw Error('BROWSER_START_TARGET');
  return new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>finish(Error('BROWSER_FLOW_TIMEOUT')),timeoutMs);function finish(e,v){if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(v);}fatal=e=>finish(e);
  handler=async m=>{if(m.sessionId!==sessionId||m.method!=='Fetch.requestPaused')return;const p=m.params;let dest;try{dest=new URL(p.request.url);}catch{return finish(Error('BROWSER_REQUEST_URL'));}
   if(dest.origin+dest.pathname===CALLBACK){await send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'},sessionId);if(p.frameId!==frame||p.resourceType!=='Document'||p.request.method!=='GET')return finish(Error('BROWSER_CALLBACK_CONTEXT'));return finish(null,{url:p.request.url,context,mainFrame:true,method:'GET'});}
   const google=dest.protocol==='https:'&&['google.com','gstatic.com','googleusercontent.com'].some(d=>dest.hostname===d||dest.hostname.endsWith('.'+d));
   const auth=dest.origin===AUTH&&['/auth/v1/authorize','/auth/v1/callback'].includes(dest.pathname);
   const allowed=fixtureOrigin?dest.origin===fixtureOrigin:google||auth;
   if(!allowed){await send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'},sessionId);return finish(Error('BROWSER_UNEXPECTED_TARGET'));}
   if(auth)recordAuthRequest(p.request.url);await send('Fetch.continueRequest',{requestId:p.requestId},sessionId);
  };
  send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},sessionId).then(()=>send('Page.navigate',{url},sessionId)).catch(()=>finish(Error('BROWSER_NAVIGATION')));
  });
 }};
}
module.exports={ownedBrowser};
