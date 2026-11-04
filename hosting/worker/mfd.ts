const SUPABASE='https://djyozltkmbzhwuvemxuy.supabase.co';
const KEY='sb_publishable_nH3vRaPWVxxY636AThDN5A_ZIlQGghL';
const ACCESS='__Host-mfd-access',REFRESH='__Host-mfd-refresh',PKCE='__Host-mfd-pkce';
const ORIGIN='https://prasanth-nammi-portfolio.shanustylish777.chatgpt.site';
const MAX_BODY=6*1024*1024;
export const CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; media-src 'self' blob:; connect-src 'self' https://world.openfoodfacts.org; frame-src 'self'; frame-ancestors 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests";
type Deps={fetch:typeof fetch;assets:{fetch:(request:Request)=>Promise<Response>};origin?:string};
class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
function cookie(name:string,value:string,age=2592000){return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`}
function cookies(request:Request){const out=new Map<string,string>();for(const part of (request.headers.get('cookie')||'').split(';')){const i=part.indexOf('=');if(i<0)continue;try{const key=part.slice(0,i).trim();if(out.has(key))throw new HttpError(400,'Duplicate session cookie');out.set(key,decodeURIComponent(part.slice(i+1)))}catch(e){if(e instanceof HttpError)throw e}}return out}
function safeUser(user:any){return user?.id?{id:user.id,email:user.email||'',user_metadata:{}}:null}
function json(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function expiresSoon(token:string){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000<Date.now()+60000}catch{return true}}
async function readBody(request:Request,limit=MAX_BODY){if(Number(request.headers.get('content-length'))>limit)throw new HttpError(413,'Request too large');if(!request.body)return new Uint8Array();const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'Request too large')}chunks.push(value)}const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}return out}
async function readJSON(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON required');try{return JSON.parse(new TextDecoder().decode(await readBody(request,16384)))}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Invalid JSON')}}
export async function handleMfd(request:Request,deps:Deps){
 const url=new URL(request.url);
 // Only an explicit loopback host may use a local redirect/CSRF origin.
 // Public deployments retain their fixed, trusted production origin.
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const origin=deps.origin||(loopback?url.origin:ORIGIN),setCookies:string[]=[];
 const api=url.pathname.startsWith('/api/');
 function clearSession(){setCookies.push(cookie(ACCESS,'',0),cookie(REFRESH,'',0))}
 function saveSession(data:any){if(!data?.access_token||!data.refresh_token||!data.user?.id)throw new HttpError(502,'Invalid authentication response');setCookies.push(cookie(ACCESS,data.access_token),cookie(REFRESH,data.refresh_token));return data.access_token as string}
 async function upstream(path:string,options:RequestInit={},token?:string){const headers=new Headers(options.headers);headers.set('apikey',KEY);headers.set('Authorization','Bearer '+(token||KEY));const response=await deps.fetch(SUPABASE+path,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(20000)});return response}
 async function authCall(path:string,body?:any,token?:string){const r=await upstream('/auth/v1/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},token);const data=await r.json() as any;if(!r.ok)throw new HttpError(r.status, data.msg||data.message||data.error_description||'Authentication failed');return data}
 let result:Response;
 try{
  const jar=cookies(request);
  const isCallback=request.method==='GET'&&(url.pathname==='/'||url.pathname==='/legacy/index.html')&&url.searchParams.has('code');
  if(api){
   const reqOrigin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
   if(site==='cross-site'||(reqOrigin&&reqOrigin!==origin)||(!['GET','HEAD'].includes(request.method)&&reqOrigin!==origin))throw new HttpError(403,'Same-origin request required');
   if(!['GET','HEAD','POST','PATCH','PUT','DELETE'].includes(request.method))throw new HttpError(405,'Method not allowed');
  }
  async function token(){let access=jar.get(ACCESS);if(!access||expiresSoon(access)){const refresh=jar.get(REFRESH);if(!refresh)throw new HttpError(401,'Sign in required');try{const data=await authCall('token?grant_type=refresh_token',{refresh_token:refresh});access=saveSession(data)}catch(e){if(e instanceof HttpError&&[400,401,403].includes(e.status))clearSession();throw e}}return access!}
  if(isCallback){
   const verifier=jar.get(PKCE);setCookies.push(cookie(PKCE,'',0));
   if(!verifier)throw new HttpError(400,'Sign-in expired. Please start sign-in again.');
   saveSession(await authCall('token?grant_type=pkce',{auth_code:url.searchParams.get('code'),code_verifier:verifier}));
   result=new Response(null,{status:303,headers:{Location:origin+'/'}});
  }else if(url.pathname==='/api/auth/session'&&request.method==='GET'){
   if(!jar.has(ACCESS)&&!jar.has(REFRESH))result=json({session:null});
   else{const access=await token();try{const user=await authCall('user',undefined,access);result=json({session:{user:safeUser(user)}})}catch(e){if(e instanceof HttpError&&[401,403].includes(e.status))clearSession();throw e}}
  }else if(url.pathname==='/api/auth/login'&&request.method==='POST'){
   const {email,password}=await readJSON(request);if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>4096)throw new HttpError(400,'Invalid credentials');
   const data=await authCall('token?grant_type=password',{email,password});saveSession(data);result=json({session:{user:safeUser(data.user)}});
  }else if(url.pathname==='/api/auth/signup'&&request.method==='POST'){
   const {email,password}=await readJSON(request);if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length<12||password.length>4096)throw new HttpError(400,'Use a valid email and a password of at least 12 characters');
   const verifier=b64(crypto.getRandomValues(new Uint8Array(32))),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
   const data=await authCall('signup?redirect_to='+encodeURIComponent(origin+'/'),{email,password,code_challenge:challenge,code_challenge_method:'s256'});setCookies.push(cookie(PKCE,verifier,3600));if(data.access_token)saveSession(data);result=json({session:data.access_token?{user:safeUser(data.user)}:null});
  }else if(url.pathname==='/api/auth/oauth'&&request.method==='POST'){
   const verifier=b64(crypto.getRandomValues(new Uint8Array(32))),challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));setCookies.push(cookie(PKCE,verifier,600));
   const dest=new URL('/auth/v1/authorize',SUPABASE);dest.search=new URLSearchParams({provider:'google',redirect_to:origin+'/',code_challenge:challenge,code_challenge_method:'s256'}).toString();result=json({url:dest.href});
  }else if(url.pathname==='/api/auth/migrate'&&request.method==='POST'){
   const {refresh_token}=await readJSON(request);if(typeof refresh_token!=='string'||refresh_token.length>4096)throw new HttpError(400,'Invalid session');
   const data=await authCall('token?grant_type=refresh_token',{refresh_token});saveSession(data);result=json({session:{user:safeUser(data.user)}});
  }else if(url.pathname==='/api/auth/logout'&&request.method==='POST'){
   if(jar.has(ACCESS)||jar.has(REFRESH)){try{const access=await token();const r=await upstream('/auth/v1/logout?scope=local',{method:'POST'},access);if(!r.ok&&![401,403,404].includes(r.status))throw new HttpError(502,'Could not sign out. Please retry.')}catch(e){if(!(e instanceof HttpError)||![400,401,403].includes(e.status))throw e}}clearSession();setCookies.push(cookie(PKCE,'',0));result=json({session:null});
  }else if(url.pathname.startsWith('/api/supabase/')){
   const path=url.pathname.slice('/api/supabase'.length);const decoded=decodeURIComponent(path);
   if(!/^\/(rest\/v1\/|storage\/v1\/(object|render\/image)\/)/.test(path)||decoded.includes('..')||decoded.includes('\\')||decoded.includes('//'))throw new HttpError(404,'Unknown API');
   const access=await token(),headers=new Headers();for(const name of ['content-type','accept','prefer','range','range-unit','if-match','if-none-match','x-upsert']){const value=request.headers.get(name);if(value)headers.set(name,value)}
   const body=['GET','HEAD'].includes(request.method)?undefined:await readBody(request);const r=await upstream(path+url.search,{method:request.method,headers,body},access);const out=new Headers();for(const name of ['content-type','content-range','range-unit','retry-after']){const value=r.headers.get(name);if(value)out.set(name,value)}result=new Response(r.body,{status:r.status,headers:out});
  }else if(api)throw new HttpError(404,'Unknown API');
  else result=await deps.assets.fetch(request);
 }catch(e){const known=e instanceof HttpError;result=json({error:known?e.message:'Service unavailable. Please retry.'},known?e.status:503)}
 const headers=new Headers(result.headers);
 headers.set('Content-Security-Policy',CSP);headers.set('X-Content-Type-Options','nosniff');headers.set('X-Frame-Options','SAMEORIGIN');headers.set('Referrer-Policy','no-referrer');headers.set('Strict-Transport-Security','max-age=31536000');headers.set('Permissions-Policy','camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=()');
 if(api||setCookies.length||url.search){headers.set('Cache-Control','private, no-store');headers.set('CDN-Cache-Control','no-store');headers.set('Pragma','no-cache');headers.set('Vary','Cookie, Origin')}
 for(const value of setCookies)headers.append('Set-Cookie',value);
 return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
}
