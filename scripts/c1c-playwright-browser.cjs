// Candidate only. Playwright owns a new browser/context; its CDP session pauses every redirect hop.
const {runtime}=require('./c1c-playwright-runtime.cjs');const {browserProxy}=require('./c1c-browser-proxy-v2.cjs');const {AUTH,classify,callbackCode}=require('./c1c-browser-policy.cjs');const {Diagnostic,record,networkCode}=require('./c1c-safe-diagnostics.cjs');
async function ownedBrowser({timeoutMs=300000,recordAuthRequest=()=>{},onDiagnostic=()=>{},fixture}={}){
 if(fixture?.networkOrigin&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(fixture.networkOrigin))throw new Diagnostic('BROWSER_SETUP_FAILED');
 const surfaceOf=value=>{if(fixture?.networkOrigin){try{const u=new URL(value);if(u.origin===fixture.networkOrigin)return classify(AUTH+u.pathname+u.search+u.hash);}catch{}}return classify(value);};
 const emit=d=>{try{onDiagnostic(record(d));}catch{}};let browser,context,page,cdp,mainFrame,proxy,started=false,settled=false,closed=false,captured=false,timer,rejectFlow,resolveFlow;
 const fail=d=>{if(settled||closed)return;settled=true;clearTimeout(timer);emit(d);if(rejectFlow)rejectFlow(d);};
 try{const {chromium}=runtime();proxy=await browserProxy({offline:!!fixture,onDiagnostic:emit});browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:!!fixture,proxy:{server:proxy.url,bypass:fixture?.networkOrigin?'127.0.0.1,localhost':'<-loopback>'},args:['--disable-sync','--disable-background-networking','--disable-breakpad','--disable-crash-reporter','--disable-logging']});context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false,ignoreHTTPSErrors:false});page=await context.newPage();cdp=await context.newCDPSession(page);await cdp.send('Page.enable');mainFrame=(await cdp.send('Page.getFrameTree')).frameTree.frame.id;}
 catch(e){if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(proxy)await proxy.close();const d=e instanceof Diagnostic?e:new Diagnostic('BROWSER_LAUNCH_FAILED');emit(d);throw d;}
 const intentionalAbort=new Set();
 const capability={};const details=(p,surface=surfaceOf(p.request.url))=>({surface,frame:p.frameId===mainFrame?'main':'child',method:['GET','POST'].includes(p.request.method)?p.request.method:'OTHER',kind:(p.resourceType||'other').toLowerCase()});
 const abort=p=>{intentionalAbort.add(p.request.url);return cdp.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'});};
 async function takeCallback(p,url,fromResponse){const d=details(p,'worker_callback');if(p.frameId!==mainFrame||p.resourceType!=='Document'||p.request.method!=='GET'){await abort(p);fail(new Diagnostic('BROWSER_CALLBACK_CONTEXT',d));return;}
  // Response-stage capture is allowed only from our staging Auth, never a provider/foreign redirect.
  if(fromResponse&&!['auth_authorize','auth_callback'].includes(surfaceOf(p.request.url))){await abort(p);fail(new Diagnostic('BROWSER_CALLBACK_CONTEXT',d));return;}
  const parsed=callbackCode(url);if(!parsed||parsed.cancelled){await abort(p);fail(new Diagnostic(parsed?.cancelled?'BROWSER_CALLBACK_CANCELLED':'BROWSER_CALLBACK_PARAMETERS',d));return;}
  captured=true;await abort(p);if(settled||closed)return;settled=true;clearTimeout(timer);resolveFlow({url,context:capability,mainFrame:true,method:'GET'});
 }
 context.on('page',p=>{if(p!==page){p.close().catch(()=>{});fail(new Diagnostic('BROWSER_EXTRA_PAGE'));}});context.on('close',()=>fail(new Diagnostic('BROWSER_CLOSED')));browser.on('disconnected',()=>fail(new Diagnostic('BROWSER_CLOSED')));page.on('download',()=>fail(new Diagnostic('BROWSER_DOWNLOAD_DENIED')));page.on('close',()=>fail(new Diagnostic('BROWSER_CLOSED')));
 page.on('requestfailed',req=>{if(captured||settled||closed||intentionalAbort.has(req.url()))return;fail(new Diagnostic(networkCode(req.failure()?.errorText),{surface:surfaceOf(req.url()),method:['GET','POST'].includes(req.method())?req.method():'OTHER',kind:req.resourceType()}));});page.on('websocket',()=>fail(new Diagnostic('BROWSER_WEBSOCKET_DENIED')));
 cdp.on('Page.frameRequestedNavigation',p=>{if(p.frameId===mainFrame&&classify(p.url)==='worker_callback'){const u=new URL(p.url);if(u.hash||u.username||u.password)fail(new Diagnostic('BROWSER_CALLBACK_PARAMETERS',{surface:'worker_callback',frame:'main',kind:'document'}));}});
 cdp.on('Fetch.requestPaused',p=>{(async()=>{const d=details(p);if(settled||closed){await abort(p).catch(()=>{});return;}
  const responseStage=p.responseStatusCode!==undefined||p.responseErrorReason!==undefined;
  if(responseStage){
   if(p.responseStatusCode>=400&&p.frameId===mainFrame&&p.resourceType==='Document'){await abort(p);fail(new Diagnostic('BROWSER_HTTP_FAILED',{...d,status:p.responseStatusCode}));return;}
   if(p.responseStatusCode>=300&&p.responseStatusCode<400){const h=p.responseHeaders?.find(h=>h.name.toLowerCase()==='location');if(h){let target;try{target=new URL(h.value,p.request.url).href;}catch{await abort(p);fail(new Diagnostic('BROWSER_TARGET_DENIED',d));return;}const surface=surfaceOf(target);if(surface==='worker_callback'){await takeCallback(p,target,true);return;}if(!['auth_authorize','auth_callback','google'].includes(surface)){await abort(p);fail(new Diagnostic('BROWSER_TARGET_DENIED',details(p,surface)));return;}}}
   await cdp.send('Fetch.continueResponse',{requestId:p.requestId});return;
  }
  if(d.surface==='auth_auxiliary_icon'&&p.request.method==='GET'&&['Image','Other'].includes(p.resourceType)){await abort(p);emit(new Diagnostic('BROWSER_AUXILIARY_BLOCKED',d));return;}
  if(d.surface==='worker_callback'){await takeCallback(p,p.request.url,false);return;}
  // Unrelated embedded documents remain denied; they cannot exchange or navigate the owned callback.
  // Only top-level/callback violations terminate the owned flow. No request is continued here.
  if(d.surface==='other'&&d.frame==='child'&&p.resourceType==='Document'&&p.request.method==='GET'){await abort(p);emit(new Diagnostic('BROWSER_EMBEDDED_BLOCKED',d));return;}
  if(!['auth_authorize','auth_callback','google'].includes(d.surface)){await abort(p);fail(new Diagnostic('BROWSER_TARGET_DENIED',d));return;}
  if(d.surface.startsWith('auth_')){if(!['GET','POST'].includes(p.request.method)){await abort(p);fail(new Diagnostic('BROWSER_AUTH_METHOD',d));return;}recordAuthRequest();}
  if(fixture?.networkOrigin&&new URL(p.request.url).origin===fixture.networkOrigin){await cdp.send('Fetch.continueRequest',{requestId:p.requestId,interceptResponse:true});return;}
  if(fixture){const r=await fixture.respond({surface:d.surface,path:new URL(p.request.url).pathname,kind:d.kind,frame:d.frame,method:d.method});if(!r){await abort(p);fail(new Diagnostic('BROWSER_ROUTE_FAILED',d));return;}if(r.abort){await cdp.send('Fetch.failRequest',{requestId:p.requestId,errorReason:r.abort==='connectionrefused'?'ConnectionRefused':'Failed'});return;}
   const hs={...(r.contentType?{'content-type':r.contentType}:{}),...r.headers};
   // Mock redirects are handled before fulfillment because synthetic CDP fulfillment has no response pause.
   if(r.status>=300&&r.status<400&&hs.location){const target=new URL(hs.location,p.request.url).href,surface=surfaceOf(target);if(surface==='worker_callback'){await takeCallback(p,target,true);return;}if(!['auth_authorize','auth_callback','google'].includes(surface)){await abort(p);fail(new Diagnostic('BROWSER_TARGET_DENIED',details(p,surface)));return;}}
   if(r.status>=400&&p.frameId===mainFrame&&p.resourceType==='Document'){await abort(p);fail(new Diagnostic('BROWSER_HTTP_FAILED',{...d,status:r.status}));return;}
   await cdp.send('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:r.status||200,responseHeaders:Object.entries(hs).map(([name,value])=>({name,value:String(value)})),body:Buffer.from(r.body||'').toString('base64')});return;
  }
  await cdp.send('Fetch.continueRequest',{requestId:p.requestId,interceptResponse:true});
 })().catch(e=>fail(e instanceof Diagnostic?e:new Diagnostic('BROWSER_ROUTE_FAILED',details(p))));});
 return {context:capability,async close(){if(closed)return;if(started&&!settled)fail(new Diagnostic('BROWSER_CLOSED'));closed=true;clearTimeout(timer);intentionalAbort.clear();await context.close().catch(()=>{});await browser.close().catch(()=>{});await proxy.close();},async authorize(url){if(started)throw new Diagnostic(captured?'BROWSER_CALLBACK_REPLAY':'BROWSER_ALREADY_USED');if(closed)throw new Diagnostic('BROWSER_CLOSED');if(surfaceOf(url)!=='auth_authorize'||(!fixture?.networkOrigin&&new URL(url).origin!==AUTH))throw new Diagnostic('BROWSER_START_TARGET');started=true;
  return new Promise((resolve,reject)=>{resolveFlow=resolve;rejectFlow=reject;timer=setTimeout(()=>fail(new Diagnostic('BROWSER_TIMEOUT')),timeoutMs);cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]}).then(()=>page.goto(url,{waitUntil:'domcontentloaded',timeout:timeoutMs})).catch(()=>{if(!captured&&!settled&&!closed)fail(new Diagnostic('BROWSER_NAVIGATION_FAILED'));});});}};
}
module.exports={ownedBrowser};
