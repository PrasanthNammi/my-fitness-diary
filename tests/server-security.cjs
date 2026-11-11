const {buildSync}=require('esbuild'),vm=require('vm'),assert=require('assert');
const c={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,AbortSignal,crypto:require('crypto').webcrypto,atob,btoa,Date};vm.createContext(c);vm.runInContext(buildSync({entryPoints:['hosting/worker/mfd.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text,c);const handle=c.module.exports.handleMfd;
const origin='https://prasanth-nammi-portfolio.shanustylish777.chatgpt.site';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:'alice'})).toString('base64url')+'.signature';
const issued={access_token:token,refresh_token:'refresh-private',user:{id:'alice',email:'alice@example.invalid'}};
let calls=[],reply=()=>Response.json(issued);
const deps={assets:{fetch:async()=>new Response('<html>app</html>',{headers:{'Content-Type':'text/html'}})},fetch:async(url,init)=>{calls.push({url,init});return reply(url,init)}};
const req=(path,method='GET',body,headers={})=>new Request(origin+path,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const jar='__Host-mfd-access='+token+'; __Host-mfd-refresh=refresh-private';
(async()=>{
 let r=await handle(req('/'),deps);assert.equal(r.status,200);assert.equal(r.headers.get('X-Frame-Options'),'SAMEORIGIN');assert(r.headers.get('Content-Security-Policy').includes("script-src-attr 'none'"));assert(!r.headers.has('Set-Cookie'));
 r=await handle(req('/api/auth/session'),deps);assert.deepEqual(await r.json(),{session:null});assert.equal(calls.length,0);
 r=await handle(req('/api/auth/login','POST',{email:'a@b.c',password:'secret'},{Origin:'https://evil.example'}),deps);assert.equal(r.status,403);assert.equal(calls.length,0);
 r=await handle(req('/api/auth/login','POST',{email:'a@b.c',password:'secret'}),deps);assert.equal(r.status,200);const body=await r.text();assert(!body.includes(token)&&!body.includes('refresh-private'));assert(body.includes('alice'));const ck=r.headers.getSetCookie();assert.equal(ck.length,2);for(const value of ck){assert(value.includes('HttpOnly; Secure; SameSite=Lax'));assert(value.includes('Path=/'));assert(!value.includes('Domain='))}assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(r.headers.get('CDN-Cache-Control'),'no-store');
 calls=[];r=await handle(req('/api/supabase/rest/v1/forma_workspaces','GET',undefined,{Cookie:jar,Authorization:'Bearer attacker'}),deps);assert.equal(r.status,200);assert.equal(calls[0].init.headers.get('Authorization'),'Bearer '+token);assert(!calls[0].init.headers.has('cookie'));assert.equal(calls[0].url,'https://djyozltkmbzhwuvemxuy.supabase.co/rest/v1/forma_workspaces');
 calls=[];r=await handle(req('/api/supabase/auth/v1/admin/users','GET',undefined,{Cookie:jar}),deps);assert.equal(r.status,404);assert.equal(calls.length,0);
 r=await handle(req('/api/supabase/rest/v1/forma_workspaces'),deps);assert.equal(r.status,401);assert.equal(calls.length,0);
 r=await handle(req('/api/supabase/rest/v1/forma_workspaces','POST',{}, {Cookie:jar,Origin:'null'}),deps);assert.equal(r.status,403);
 r=await handle(req('/api/auth/session','GET',undefined,{Cookie:jar,'Sec-Fetch-Site':'cross-site'}),deps);assert.equal(r.status,403);
 reply=(url)=>url.includes('/user')?Response.json(issued.user):Response.json(issued);
 r=await handle(req('/api/auth/session','GET',undefined,{Cookie:'__Host-mfd-refresh=refresh-private'}),deps);assert.equal(r.status,200);assert(r.headers.getSetCookie().length===2);assert.equal((await r.json()).session.user.id,'alice');
 r=await handle(req('/api/auth/oauth','POST',{}),deps);const oauth=await r.json(),verifier=decodeURIComponent(r.headers.getSetCookie()[0].split(';')[0].split('=')[1]);const authURL=new URL(oauth.url);assert.equal(authURL.origin,'https://djyozltkmbzhwuvemxuy.supabase.co');assert.equal(authURL.searchParams.get('redirect_to'),origin+'/');assert.equal(authURL.searchParams.get('code_challenge'),require('crypto').createHash('sha256').update(verifier).digest('base64url'));assert(!JSON.stringify(oauth).includes(verifier));
 r=await handle(req('/?code=code','GET',undefined,{Cookie:'__Host-mfd-pkce='+verifier}),deps);assert.equal(r.status,303);assert.equal(r.headers.get('Location'),origin+'/');assert.equal(r.headers.getSetCookie().length,3);
 r=await handle(req('/?code=code'),deps);assert.equal(r.status,400);
 // Android app: Google finishes in a Chrome tab without the app's verifier, so the code is handed to the app
 // (site.mfd.app://auth), which completes sign-in in its own WebView. Only for Android Chrome, never inside the app,
 // never for other browsers, and only for a plain code; the browser's verifier cookie is still cleared.
 const chrome='Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
 calls=[];r=await handle(req('/?code=abc-123','GET',undefined,{'User-Agent':chrome}),deps);assert.equal(r.status,303);assert.equal(calls.length,0,'no token exchange in the browser');
 assert.equal(r.headers.get('Location'),'intent://auth?code=abc-123#Intent;scheme=site.mfd.app;package=site.mfd.app;S.browser_fallback_url='+encodeURIComponent(origin+'/')+';end');
 assert(r.headers.get('Content-Security-Policy')&&r.headers.get('Cache-Control').includes('no-store'));assert(r.headers.getSetCookie().some(v=>v.startsWith('__Host-mfd-pkce=;')));
 r=await handle(req('/?code=abc-123','GET',undefined,{'User-Agent':chrome+' MFDAndroid/1.0'}),deps);assert.equal(r.status,400,'inside the app: normal error');
 r=await handle(req('/?code=abc-123','GET',undefined,{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}),deps);assert.equal(r.status,400,'iPhone: normal error');
 r=await handle(req('/?code='+encodeURIComponent('a#Intent;end'),'GET',undefined,{'User-Agent':chrome}),deps);assert.equal(r.status,400,'odd code: no hand-off');
 calls=[];r=await handle(req('/?code=abc-123','GET',undefined,{'User-Agent':chrome,Cookie:'__Host-mfd-pkce=v'}),deps);assert.equal(r.status,303);assert.equal(r.headers.get('Location'),origin+'/','with a verifier: normal sign-in');assert.equal(calls.length,1);
 r=await handle(req('/api/auth/migrate','POST',{refresh_token:'old'}),deps);assert.equal(r.status,200);assert(!(await r.text()).includes('refresh-private'));
 reply=()=>new Response(null,{status:204});r=await handle(req('/api/auth/logout','POST',{}, {Cookie:jar}),deps);assert.equal(r.status,200);assert(r.headers.getSetCookie().every(v=>v.includes('Max-Age=0')));
 reply=()=>{throw Error('network')};r=await handle(req('/api/auth/logout','POST',{}, {Cookie:jar}),deps);assert.equal(r.status,503);assert.equal(r.headers.getSetCookie().length,0);
 r=await handle(req('/api/auth/login','POST',{email:'x'.repeat(17000)}),deps);assert.equal(r.status,413);
 const localOrigin='http://localhost:5173';
 const localDeps={...deps};
 r=await handle(new Request(localOrigin+'/api/auth/oauth',{method:'POST',headers:{Origin:localOrigin,'Content-Type':'application/json'},body:'{}'}),localDeps);
 assert.equal(r.status,200);assert.equal(new URL((await r.json()).url).searchParams.get('redirect_to'),localOrigin+'/');
 r=await handle(new Request(localOrigin+'/api/auth/login',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({email:'a@b.c',password:'secret'})}),localDeps);assert.equal(r.status,403);
 // Resend the sign-up confirmation: same-origin only, a valid email only, fresh PKCE verifier cookie, nothing leaked.
 calls=[];r=await handle(req('/api/auth/resend','POST',{email:'new@example.invalid'},{Origin:'https://evil.example'}),deps);assert.equal(r.status,403);assert.equal(calls.length,0);
 calls=[];r=await handle(req('/api/auth/resend','POST',{email:'not-an-email'}),deps);assert.equal(r.status,400);assert.equal(calls.length,0);
 calls=[];reply=()=>Response.json({});r=await handle(req('/api/auth/resend','POST',{email:'new@example.invalid'}),deps);assert.equal(r.status,200);assert.deepEqual(await r.json(),{sent:true});
 assert.equal(calls.length,1);assert(String(calls[0].url).startsWith('https://djyozltkmbzhwuvemxuy.supabase.co/auth/v1/resend?redirect_to='+encodeURIComponent(origin+'/')));
 {const sentBody=JSON.parse(calls[0].init.body);assert.equal(sentBody.type,'signup');assert.equal(sentBody.email,'new@example.invalid');assert.equal(sentBody.code_challenge_method,'s256');assert(sentBody.code_challenge.length>=43)}
 {const ck=r.headers.getSetCookie();assert.equal(ck.length,1);assert(ck[0].includes('HttpOnly; Secure; SameSite=Lax'))}
 // Forgot password: same-origin, valid email, fresh PKCE + reset marker; the emailed link lands on "Set a new password".
 calls=[];r=await handle(req('/api/auth/recover','POST',{email:'a@b.c'},{Origin:'https://evil.example'}),deps);assert.equal(r.status,403);assert.equal(calls.length,0);
 calls=[];reply=()=>Response.json({});r=await handle(req('/api/auth/recover','POST',{email:'a@b.c'}),deps);assert.equal(r.status,200);assert.deepEqual(await r.json(),{sent:true});
 assert(String(calls[0].url).startsWith('https://djyozltkmbzhwuvemxuy.supabase.co/auth/v1/recover?redirect_to='));assert.equal(JSON.parse(calls[0].init.body).code_challenge_method,'s256');
 {const ck=r.headers.getSetCookie();assert.equal(ck.length,2);assert(ck.some(v=>v.startsWith('__Host-mfd-reset=1')));for(const v of ck)assert(v.includes('HttpOnly; Secure; SameSite=Lax'))}
 reply=()=>Response.json(issued);
 r=await handle(new Request(origin+'/?code=abc',{headers:{Cookie:'__Host-mfd-pkce=verifier; __Host-mfd-reset=1'}}),deps);assert.equal(r.status,303);assert.equal(r.headers.get('Location'),origin+'/#/set-password');assert(r.headers.getSetCookie().some(v=>v.startsWith('__Host-mfd-reset=;')));
 r=await handle(new Request(origin+'/?code=abc',{headers:{Cookie:'__Host-mfd-pkce=verifier'}}),deps);assert.equal(r.headers.get('Location'),origin+'/','ordinary sign-in link goes home');
 // A new sign-in clears a pending reset marker.
 r=await handle(req('/api/auth/login','POST',{email:'a@b.c',password:'secret'},{Cookie:'__Host-mfd-reset=1'}),deps);assert(r.headers.getSetCookie().some(v=>v.startsWith('__Host-mfd-reset=;')));
 // New password: signed in only, 12+ characters, sent with the user's own token.
 calls=[];r=await handle(req('/api/auth/password','POST',{password:'long-enough-pass'}),deps);assert.equal(r.status,401);assert.equal(calls.length,0);
 calls=[];r=await handle(req('/api/auth/password','POST',{password:'short'},{Cookie:jar}),deps);assert.equal(r.status,400);assert.equal(calls.length,0);
 calls=[];reply=()=>Response.json({id:'alice'});r=await handle(req('/api/auth/password','POST',{password:'long-enough-pass'},{Cookie:jar}),deps);assert.equal(r.status,200);
 assert.equal(calls[0].url,'https://djyozltkmbzhwuvemxuy.supabase.co/auth/v1/user');assert.equal(calls[0].init.method,'PUT');assert.equal(calls[0].init.headers.get('Authorization'),'Bearer '+token);
 reply=()=>Response.json(issued);
 reply=()=>Response.json(issued);
 console.log('PASS server headers, HttpOnly cookies, CSRF, PKCE, refresh, migration, sign-up resend, password reset, logout failure, proxy identity, private caching and limits');
})().catch(e=>{console.error(e);process.exit(1)});
