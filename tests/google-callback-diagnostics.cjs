const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync}=require('esbuild');
const ctx={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,Date,atob,btoa,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(buildSync({stdin:{contents:"export {createAuthService} from './hosting/independent/auth';export {callbackCodes} from './hosting/independent/google-diagnostics';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,ctx);
const origin='https://diagnostic.invalid',base='https://gngnrmzeghjzqsmzuktl.supabase.co',id='a'.repeat(64),browser='b'.repeat(64),privateSentinel='DO-NOT-REFLECT-secret-credential',config={authOrigin:origin,supabase:base,issuer:base+'/auth/v1',resource:origin+'/mcp',key:'sb_publishable_synthetic',clients:['client-a'],redirects:{'client-a':['https://client.invalid/callback']}};
const claims=()=>({sub:'synthetic-alice',iss:config.issuer,aud:'authenticated',role:'authenticated',session_id:'synthetic-session',exp:Date.now()/1000+3600});
const jwt=x=>'e30.'+Buffer.from(JSON.stringify(x)).toString('base64url')+'.synthetic';
const codes=new Set();
async function run(code,options={}){
 let taken=0,exchanges=0,userCalls=0;
 const c=claims();Object.assign(c,options.claims||{});
 const token=options.token||jwt(c);
 const flow={id,verifier:'c'.repeat(64),next:'/oauth/mcp/connections',owner:null,session:'',expires:Date.now()+240000,...options.flow};
 const tx={create:async()=>true,take:async()=>{taken++;if(options.takeThrows)throw Error(privateSentinel);return options.absent?null:flow;}};
 const fetcher=async url=>{if(url.endsWith('grant_type=pkce')){exchanges++;if(options.exchangeThrows)throw Error(privateSentinel);if(options.exchangeStatus)return new Response(privateSentinel,{status:400});if(options.exchangeJson)return new Response(privateSentinel);return Response.json(options.exchangeData||{access_token:token,refresh_token:'synthetic-refresh',user:{id:options.exchangeOwner||'synthetic-alice'}});}if(url.endsWith('/auth/v1/user')){userCalls++;if(options.userThrows)throw Error(privateSentinel);if(options.userStatus)return new Response(privateSentinel,{status:403});if(options.userJson)return new Response(privateSentinel);return Response.json(options.userData||{id:'synthetic-alice'});}throw Error(privateSentinel);};
 const app=ctx.module.exports.createAuthService(config,fetcher,{allow:async()=>true},options.noTransactions?undefined:tx);
 const jar=options.jar===undefined?'__Host-mfd-integration-google='+id+'; __Host-mfd-integration-browser='+browser:options.jar;
 const r=await app(new Request(origin+'/auth/google/callback'+(options.query===undefined?'?code=synthetic-code':options.query),{headers:{Cookie:jar}}));
 assert.equal(r.status,code?400:303);assert.equal(r.headers.get('X-MFD-Callback-Diagnostic'),code||null);
 const text=await r.text();assert(!text.includes(privateSentinel));assert(!text.includes('synthetic-code'));assert(!text.includes(browser));assert(!text.includes(token));assert(!text.includes(flow.verifier));assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert(r.headers.getSetCookie().some(x=>x.startsWith('__Host-mfd-integration-google=;')&&x.includes('Max-Age=0')));
 if(code){codes.add(code);assert(text.includes(code));assert(!r.headers.getSetCookie().some(x=>x.startsWith('__Host-mfd-integration-access=')));}
 else assert(r.headers.getSetCookie().some(x=>x.startsWith('__Host-mfd-integration-access=')));
 if(options.beforeExchange)assert.equal(exchanges,0);if(options.noTake)assert.equal(taken,0);
 return {taken,exchanges,userCalls};
}
(async()=>{
 await run(null);
 await run('CB_COOKIES',{jar:'duplicate=one; duplicate=two',noTake:true,beforeExchange:true});
 await run('CB_COOKIES',{jar:'malformed=%ZZ',noTake:true,beforeExchange:true});
 await run('CB_TRANSACTION_REQUIRED',{jar:'',noTake:true,beforeExchange:true});
 await run('CB_TRANSACTION_REQUIRED',{noTransactions:true,noTake:true,beforeExchange:true});
 await run('CB_TRANSACTION_TAKE',{takeThrows:true,beforeExchange:true});
 for(const o of [{absent:true},{flow:{id:'bad'}},{flow:{verifier:'bad'}},{flow:{expires:1}},{flow:{expires:Date.now()+900000}},{flow:{owner:'alice',session:''}}])await run('CB_CONTEXT',{...o,beforeExchange:true});
 for(const query of ['?code=x&code=y','?code=x&state=unexpected','?return_to=bad'])await run('CB_PARAMETERS',{query,beforeExchange:true});
 for(const query of ['?error=access_denied','?error_code=denied','?code=x#fragment'])await run('CB_CANCELLED',{query,beforeExchange:true});
 for(const query of ['','?code=','?code=%20','?code='+ 'a'.repeat(2049)])await run('CB_CODE',{query,beforeExchange:true});
 await run('CB_CONTINUATION',{flow:{next:'https://evil.invalid/'},beforeExchange:true});
 await run('CB_SESSION_BINDING',{flow:{owner:'alice',session:'d'.repeat(64)},beforeExchange:true});
 const existingToken=jwt(claims());
 await run('CB_EXISTING_IDENTITY',{jar:'__Host-mfd-integration-google='+id+'; __Host-mfd-integration-browser='+browser+'; __Host-mfd-integration-access='+existingToken,flow:{owner:'other',session:require('crypto').createHash('sha256').update(existingToken).digest('hex')},beforeExchange:true});
 await run('CB_EXCHANGE_REQUEST',{exchangeThrows:true});
 await run('CB_EXCHANGE_STATUS',{exchangeStatus:true});
 await run('CB_EXCHANGE_JSON',{exchangeJson:true});
 await run('CB_EXCHANGE_FIELDS',{exchangeData:{access_token:'synthetic-only'}});
 await run('CB_USER_REQUEST',{userThrows:true});await run('CB_USER_STATUS',{userStatus:true});await run('CB_USER_JSON',{userJson:true});
 await run('CB_CLAIMS_JSON',{token:'malformed'});await run('CB_SUBJECT',{userData:{}});await run('CB_SUBJECT',{claims:{sub:'other'}});
 for(const [code,extra] of [['CB_ISSUER',{iss:'https://wrong.invalid'}],['CB_AUDIENCE',{aud:['authenticated','other']}],['CB_AUDIENCE',{aud:[config.resource]}],['CB_AUDIENCE',{aud:config.resource}],['CB_ROLE',{role:'anon'}],['CB_CLIENT',{client_id:null}],['CB_CLIENT',{client_id:'client-a'}],['CB_SESSION',{session_id:''}],['CB_SESSION',{session_id:123}],['CB_EXPIRY',{exp:1}],['CB_EXPIRY',{exp:'invalid'}],['CB_NOT_BEFORE',{nbf:Date.now()/1000+3600}],['CB_NOT_BEFORE',{nbf:'invalid'}]])await run(code,{claims:extra});
 await run('CB_ACCOUNT',{exchangeOwner:'synthetic-bob'});
 // Unexpected exceptions use a fixed phase, never their message; response-build failure is injectable only in this fixture.
 const original=ctx.Response;ctx.Response=class extends original {constructor(body,init){if(init?.status===303&&init.headers?.Location)throw Error(privateSentinel);super(body,init);}};
 await run('CB_RESPONSE');ctx.Response=original;
 const covered=[...ctx.module.exports.callbackCodes].filter(x=>!['CB_REQUEST'].includes(x));assert.deepEqual([...codes].sort(),covered.sort());
 console.log('PASS fixed callback diagnostic codes: success, all reachable rejection categories, unchanged strict claims, no secret reflection or session installation on failures');
})().catch(e=>{console.error(e);process.exitCode=1});
