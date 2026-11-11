const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild'),{DatabaseSync}=require('node:sqlite');
const context={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:require('node:crypto').webcrypto,atob,btoa,Date};
vm.createContext(context);vm.runInContext(buildSync({stdin:{contents:"export {createAuthService} from './hosting/independent/auth';export {GoogleTransactionTable} from './hosting/independent/google-transactions';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,context);
const db=new DatabaseSync(':memory:');let alarm=0;
const storage={sql:{exec(query,...args){const s=db.prepare(query);if(/^SELECT/i.test(query)){const rows=s.all(...args);return{toArray:()=>rows,one:()=>{assert.equal(rows.length,1);return rows[0];}};}s.run(...args);return{toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},setAlarm:async time=>{alarm=time;}};
const transactions=new context.module.exports.GoogleTransactionTable(storage);
const origin='https://mfd-google.invalid',base='https://gngnrmzeghjzqsmzuktl.supabase.co',next='/oauth/mcp/consent?authorization_id=pending-a';
const config={authOrigin:origin,supabase:base,issuer:base+'/auth/v1',resource:origin+'/mcp',key:'sb_publishable_synthetic',clients:['client-a'],redirects:{'client-a':['https://client.invalid/callback']}};
const expiry=Date.now()/1000+3600;
const jwt=(sub,extra={})=>'e30.'+Buffer.from(JSON.stringify({sub,iss:config.issuer,aud:'authenticated',role:'authenticated',session_id:'session-'+sub,exp:expiry,...extra})).toString('base64url')+'.synthetic';
let calls=[],returned='alice',claimsExtra={},userMismatch=false,verifiedMismatch=false,exchangeFailure=false;
const used=new Set();let expectedVerifier;
const fetcher=async(url,init={})=>{
 assert(url.startsWith(base+'/'));calls.push(url);assert.equal(init.redirect,'manual');
 if(url.endsWith('/auth/v1/user')){const t=new Headers(init.headers).get('authorization').slice(7);return Response.json({id:verifiedMismatch?'forged':JSON.parse(Buffer.from(t.split('.')[1],'base64url')).sub});}
 if(url.endsWith('/auth/v1/token?grant_type=pkce')){const data=JSON.parse(init.body);assert.match(data.code_verifier,/^[a-f0-9]{64}$/);if(expectedVerifier)assert.equal(data.code_verifier,expectedVerifier);if(exchangeFailure||used.has(data.auth_code))return Response.json({error:'signup disabled or code denied'},{status:400});used.add(data.auth_code);return Response.json({access_token:jwt(returned,claimsExtra),refresh_token:'synthetic-refresh',user:{id:userMismatch?'other':returned}});}
 if(url.includes('/oauth/authorizations/'))return Response.json({user:{id:'alice'},client:{id:'client-a',name:'Synthetic'},redirect_uri:'https://client.invalid/callback'});
 if(url.endsWith('/rest/v1/rpc/mfd_mcp'))return Response.json({});
 throw Error('Unexpected upstream');
};
const auth=context.module.exports.createAuthService(config,fetcher,{allow:async()=>true},transactions);
function merge(...jars){const m=new Map();for(const jar of jars)for(const p of jar.split('; ')){const at=p.indexOf('=');if(at>0)m.set(p.slice(0,at),p.slice(at+1));}return [...m].map(([k,v])=>k+'='+v).join('; ');}
const cookies=r=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const form=(path,body,jar='',headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',Cookie:jar,...headers},body});
async function login(jar=''){const r=await auth(new Request(origin+'/login?return_to='+encodeURIComponent(next),{headers:{Cookie:jar}}));assert.equal(r.status,200);return{jar:merge(jar,cookies(r)),csrf:/name="csrf" value="([a-f0-9]+)"/.exec(await r.text())[1]};}
async function start(access,existing){const l=await login(existing||'');if(access)l.jar=merge(l.jar,'__Host-mfd-integration-access='+access);const r=await auth(form('/auth/google',new URLSearchParams({csrf:l.csrf,return_to:next}),l.jar));assert.equal(r.status,303);const target=new URL(r.headers.get('location'));assert.equal(target.origin,base);assert.equal(target.searchParams.get('redirect_to'),origin+'/auth/google/callback');assert.equal(target.searchParams.get('code_challenge_method'),'s256');const flow=db.prepare('SELECT context FROM google_transactions ORDER BY rowid DESC LIMIT 1').get();const c=JSON.parse(flow.context);assert.equal(target.searchParams.get('code_challenge'),require('node:crypto').createHash('sha256').update(c.verifier).digest('base64url'));assert(r.headers.getSetCookie().every(v=>v.includes('Secure; HttpOnly; SameSite=Lax')&&v.includes('Path=/')&&!v.includes('Domain=')));assert(!decodeURIComponent(cookies(r)).includes('verifier'));assert(alarm>Date.now());return{jar:merge(l.jar,cookies(r)),id:c.id,verifier:c.verifier,l,r};}
const cb=(code,query='')=>new URL(origin+'/auth/google/callback?code='+encodeURIComponent(code)+query);
const callback=(u,jar)=>auth(new Request(u,{headers:{Cookie:jar}}));
(async()=>{
 let f=await start();expectedVerifier=f.verifier;let r=await callback(cb('success'),f.jar);expectedVerifier=undefined;assert.equal(r.status,303);assert.equal(r.headers.get('location'),origin+next);assert(r.headers.getSetCookie().some(v=>v.startsWith('__Host-mfd-integration-access=')&&v.includes('HttpOnly')));assert.equal(db.prepare('SELECT count(*) n FROM google_transactions').get().n,0);
 calls=[];assert.equal((await callback(cb('success'),f.jar)).status,400);assert.equal(calls.length,0);assert.equal((await callback(cb('missing'),'')).status,400);
 f=await start();calls=[];assert.equal((await callback(cb('other-browser'),f.jar.replace(/__Host-mfd-integration-browser=[a-f0-9]+/,'__Host-mfd-integration-browser='+'b'.repeat(64)))).status,400);assert.equal(calls.length,0);assert.equal(db.prepare('SELECT count(*) n FROM google_transactions').get().n,1);assert.equal((await callback(cb('correct-browser'),f.jar)).status,303);
 f=await start();db.prepare('UPDATE google_transactions SET expires=? WHERE transaction_id=?').run(1,f.id);calls=[];assert.equal((await callback(cb('expired'),f.jar)).status,400);assert.equal(calls.length,0);
 // Same browser has one pending flow; racing duplicate starts cannot replace it.
 f=await start();const results=await Promise.all([auth(form('/auth/google',new URLSearchParams({csrf:f.l.csrf,return_to:next}),f.l.jar)),auth(form('/auth/google',new URLSearchParams({csrf:f.l.csrf,return_to:next}),f.l.jar))]);assert(results.every(r=>r.status===400));assert.equal(db.prepare('SELECT count(*) n FROM google_transactions').get().n,1);
 const race=await Promise.all([callback(cb('one-winner'),f.jar),callback(cb('one-winner'),f.jar)]);assert.deepEqual(race.map(r=>r.status).sort(),[303,400]);
 for(const query of ['&state=unexpected','&code=duplicate','&return_to=https://evil.invalid','&error=access_denied']){f=await start();calls=[];r=await callback(cb('bad',query),f.jar);assert.equal(r.status,400);assert.equal(calls.length,0);assert.equal((await callback(cb('retry'),f.jar)).status,400);}
 f=await start();assert.equal((await callback(new URL(origin+'/auth/google/callback'),f.jar)).status,400);
 for(const extra of [{aud:config.resource},{iss:'https://wrong.invalid'},{client_id:'client-a'},{session_id:''},{exp:1},{nbf:Date.now()/1000+3600}]){f=await start();claimsExtra=extra;assert.equal((await callback(cb('claims-'+JSON.stringify(extra)),f.jar)).status,400);}claimsExtra={};
 f=await start();userMismatch=true;assert.equal((await callback(cb('uuid-mismatch'),f.jar)).status,400);userMismatch=false;
 f=await start();verifiedMismatch=true;assert.equal((await callback(cb('verified-mismatch'),f.jar)).status,400);verifiedMismatch=false;
 f=await start(''+jwt('alice'));returned='bob';assert.equal((await callback(cb('switch-bob'),f.jar)).status,400);
 f=await start();r=await callback(cb('bob-login'),f.jar);assert.equal(r.status,303);const bob=merge(f.jar,cookies(r));calls=[];r=await auth(new Request(origin+next,{headers:{Cookie:bob}}));assert.equal(r.status,403);assert((await r.text()).includes('Authorization account mismatch'));r=await auth(form('/oauth/mcp/consent','authorization_id=pending-a&decision=approve&permission=profile',bob));assert.equal(r.status,403);assert(!calls.some(u=>u.includes('/rest/')||u.endsWith('/consent')));returned='alice';
 f=await start(jwt('alice'));calls=[];assert.equal((await callback(cb('changed-session'),f.jar.replace(jwt('alice'),jwt('bob')))).status,400);assert.equal(calls.length,0);
 f=await start();exchangeFailure=true;assert.equal((await callback(cb('unknown-signup-disabled'),f.jar)).status,400);exchangeFailure=false;assert.equal((await callback(cb('retry-unknown'),f.jar)).status,400);
 const l=await login();r=await auth(form('/auth/google',new URLSearchParams({csrf:l.csrf,return_to:'https://evil.invalid'}),l.jar));assert.equal(r.status,400);assert.equal((await auth(form('/auth/google','csrf=bad',l.jar,{Origin:'https://evil.invalid'}))).status,403);
 // No distributed transaction implementation means no Google initiation; password form remains.
 const unavailable=context.module.exports.createAuthService(config,fetcher,{allow:async()=>true});assert.equal((await unavailable(form('/auth/google',new URLSearchParams({csrf:l.csrf,return_to:next}),l.jar))).status,400);
 const broken=context.module.exports.createAuthService(config,fetcher,{allow:async()=>true},{create:async()=>{throw Error('outage');},take:async()=>{throw Error('outage');}});calls=[];assert.equal((await broken(form('/auth/google',new URLSearchParams({csrf:l.csrf,return_to:next}),l.jar))).status,400);assert.equal(calls.length,0);
 // Exercise actual SQLite capacity and cleanup without deleting live counters/transactions.
 db.prepare('UPDATE google_transactions SET expires=1').run();await transactions.cleanup();
 for(let n=0;n<128;n++){const id=n.toString(16).padStart(64,'0');assert.equal(await transactions.create(id,{id,verifier:'c'.repeat(64),next,owner:null,session:'',expires:Date.now()+290000}),true);}
 assert.equal(await transactions.create('f'.repeat(64),{id:'e'.repeat(64),verifier:'c'.repeat(64),next,owner:null,session:'',expires:Date.now()+290000}),false);
 assert.equal(db.prepare('SELECT count(*) n FROM google_transactions').get().n,128);db.prepare('UPDATE google_transactions SET expires=1').run();await transactions.cleanup();assert.equal(db.prepare('SELECT count(*) n FROM google_transactions').get().n,0);
 console.log('PASS fixed Google callback: actual SQLite one-time/browser-bound transactions, S256 association, expiry, replay/races, strict params, identity/session/account switching, CSRF/redirect denial and synthetic signup-disabled failure');db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
