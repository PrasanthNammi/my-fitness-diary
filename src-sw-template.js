/* Only public, versioned app assets enter this cache. Never cache auth or user API responses. */
const CACHE='mfd-shell-__VERSION__';
const ASSETS=__ASSETS__;
const CORE=__CORE__;
const ALLOWED=new Set(ASSETS);
// Navigation fetches use manual redirects: a cached followed-redirect response is invalid.
function reusable(response){return new Response(response.body,{status:response.status,statusText:response.statusText,headers:response.headers})}
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(CORE.map(async path=>{const response=await fetch(new Request(path,{cache:'reload'}));if(!response.ok)throw Error('App cache unavailable');await cache.put(path,reusable(response))}))))});
// Let an existing workout keep its current version; activate after its windows close.
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('mfd-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.search||request.headers.has('Authorization'))return;
 const path=url.pathname==='/'?'/index.html':url.pathname==='/legacy/'?'/legacy/index.html':url.pathname;
 if(!ALLOWED.has(path))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE),hit=await cache.match(path);if(hit)return hit;const response=await fetch(request);if(response.ok&&response.type!=='opaque')await cache.put(path,reusable(response.clone()));return reusable(response)})());
});

// Every open top-level MFD window must checkpoint and agree before early activation.
self.addEventListener('message',event=>{
 if(event.data?.type!=='MFD_REQUEST_UPDATE')return;
 event.waitUntil((async()=>{const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>client.frameType==='top-level');if(!windows.length)return;
 const ready=await Promise.all(windows.map(client=>new Promise(resolve=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();resolve(false)},1500);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.ready===true)};client.postMessage({type:'MFD_CHECK_READY'},[channel.port2])})));if(ready.every(Boolean))await self.skipWaiting();})());
});

// Phone notifications (rest timer, "AI added"), sent through the MFD push service.
// Messages carry only display text; buttons call this origin's API with the user's session.
const ACTION_LABELS={minus15:'−15s',plus15:'+15s'};
self.addEventListener('push',event=>{
 let m={};try{m=event.data?event.data.json():{}}catch{}
 const actions=(Array.isArray(m.actions)?m.actions:[]).filter(a=>ACTION_LABELS[a]).map(a=>({action:a,title:ACTION_LABELS[a]}));
 event.waitUntil((async()=>{
 // The app already announced this rest's end itself: the server's backup replaces it quietly.
 const quiet=!!m.silent||(m.tag==='rest'&&(await self.registration.getNotifications({tag:'rest'})).some(n=>n.data?.over&&n.data?.id===m.id));
 await self.registration.showNotification(String(m.title||'My Fitness Diary').slice(0,120),{body:String(m.body||'').slice(0,200),tag:String(m.tag||'mfd'),renotify:!quiet,silent:quiet,icon:'/legacy/icon-256.png',vibrate:quiet?undefined:[120,60,120],actions,data:{id:typeof m.id==='string'?m.id:null,over:m.title==='Rest over',url:m.tag==='rest'?'/#/workout':typeof m.url==='string'&&/^\/#\/[\w\/.:%-]{1,200}$/.test(m.url)?m.url:'/'}})})());
});
self.addEventListener('notificationclick',event=>{
 const n=event.notification,{id,url}=n.data||{};
 // −15s / +15s keep the notification: it is updated in place, so the notification shade stays open.
 if((event.action==='plus15'||event.action==='minus15')&&id){
  const sec=event.action==='plus15'?15:-15;
  // An open MFD window owns the timer (and its ticking notification); otherwise ask the push service.
  event.waitUntil((async()=>{const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(w=>new URL(w.url).origin===self.location.origin);
   if(windows.length){for(const w of windows)w.postMessage({type:'MFD_REST_ADJUST',id,sec});return}
   await fetch('/api/push/rests/adjust',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,sec})}).catch(()=>{})})());
  return}
 n.close();
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const open=windows.find(w=>new URL(w.url).origin===self.location.origin);if(open){await open.focus();if(url&&url!=='/')open.postMessage({type:'MFD_OPEN',url});return}await self.clients.openWindow(url||'/')})());
});
