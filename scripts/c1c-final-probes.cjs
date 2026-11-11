// C.1C final: the six reviewed C.1B non-authenticating Worker probes; output label from argv. No retries.
const fs=require('fs'),assert=require('assert/strict');const origin='https://mfd-connect-staging.shanustylish777.workers.dev';const results=[];const file='.sites-runtime/c1c-final/probes-'+(process.argv[2]||'unlabeled')+'.json';
async function check(name,path,init,status,validate){const r=await fetch(origin+path,{redirect:'manual',...init});const body=await r.text();const row={name,status:r.status,pass:false};results.push(row);fs.writeFileSync(file,JSON.stringify(results,null,2));assert.equal(r.status,status,name);await validate(r,body);row.pass=true;fs.writeFileSync(file,JSON.stringify(results,null,2));console.log('PASS '+name+' '+r.status);}
(async()=>{
await check('login','/login',{},200,(r,b)=>{assert.equal(r.headers.get('referrer-policy'),'strict-origin');assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-security-policy'),/accounts.google.com/);assert.match(b,/Continue with Google/);});
await check('callback-missing-transaction','/auth/google/callback',{},400,r=>{assert.equal(r.headers.get('x-mfd-callback-diagnostic'),'CB_TRANSACTION_REQUIRED');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('set-cookie')||'',/Max-Age=0/);});
await check('hostile-origin','/auth/google',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/x-www-form-urlencoded'},body:'csrf=synthetic'},403,()=>{});
await check('invalid-csrf','/auth/google',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:'csrf=synthetic'},400,()=>{});
await check('missing-bearer','/mcp',{},401,r=>{assert(r.headers.get('www-authenticate'));});
await check('resource-discovery','/.well-known/oauth-protected-resource',{},200,(r,b)=>{const j=JSON.parse(b);assert.equal(j.resource,origin+'/mcp');assert.deepEqual(j.authorization_servers,['https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1']);});
})().catch(e=>{console.error('STOP: '+e.message);process.exitCode=1});
