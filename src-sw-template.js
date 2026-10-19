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
