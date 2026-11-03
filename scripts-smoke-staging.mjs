import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5173';
async function request(path,options){const response=await fetch(origin+path,{redirect:'manual',...options});assert(response.headers.get('x-content-type-options')==='nosniff');return response}
let response=await request('/');assert.equal(response.status,200);assert((await response.text()).includes('mfd-engine'));
for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']){
 response=await request(path);assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.resource,'https://mfd-oauth-testing.paleriver512.chatgpt.site/mcp');
 assert.deepEqual(body.authorization_servers,['https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1']);
}
response=await request('/api/auth/session');assert.deepEqual(await response.json(),{session:null});
response=await request('/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);
response=await request('/mcp',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
response=await request('/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:42,password:42})});assert.equal(response.status,400);
response=await request('/oauth/mcp/consent?authorization_id=synthetic');assert.equal(response.status,401);
for(const file of ['/react/main.js','/vendor/supabase.js','/legacy/vendor/supabase.js']){
 response=await request(file);assert.equal(response.status,200);
 const text=await response.text();assert(text.includes('gngnrmzeghjzqsmzuktl'));assert(!text.includes('djyozltkmbzhwuvemxuy'));
}
// These routes must not enter a Next.js optimizer or application OG generator.
for(const path of ['/_next/image?url=%2Ffavicon.svg&w=256&q=75','/opengraph-image']){
 response=await request(path);assert.equal(response.status,404);
}
// MFD's root serves its static diary shell, not a Next Server Action handler.
response=await request('/',{method:'POST',headers:{'Next-Action':'synthetic-unregistered-action','Content-Type':'text/plain'},body:'[]'});
assert.equal(response.status,200);assert((await response.text()).includes('mfd-engine'));
assert(!response.headers.get('content-type')?.includes('text/x-component'));
let barcode;
for(const file of ['/legacy/vendor/barcode.js','/vendor/barcode.js']){
 response=await request(file);assert.equal(response.status,200);
 const text=await response.text();assert(text.includes('MFDBarcodeReader'));
 if(barcode)assert.equal(text,barcode);barcode=text;
}
console.log('PASS local built Worker: diary HTML, both discovery aliases, anonymous session, missing bearer, hostile origin, invalid credentials payload, consent authentication served staging/barcode bundles and unavailable Next optimizer/OG/action paths');
