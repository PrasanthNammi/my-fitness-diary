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
 reply=()=>Response.json(issued);
 console.log('PASS server headers, HttpOnly cookies, CSRF, PKCE, refresh, migration, sign-up resend, logout failure, proxy identity, private caching and limits');
})().catch(e=>{console.error(e);process.exit(1)});
