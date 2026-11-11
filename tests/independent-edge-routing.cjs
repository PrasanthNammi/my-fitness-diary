const {buildSync}=require('esbuild'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={module:{exports:{}},Request,URL};vm.createContext(c);vm.runInContext(buildSync({entryPoints:['hosting/independent/edge-routing.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text,c);
const config={resource:'https://gngnrmzeghjzqsmzuktl.supabase.co/functions/v1/mfd-mcp/mcp'};
for(const suffix of ['/mcp','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']){
 const r=c.module.exports.edgeRequest(new Request('http://127.0.0.1:8081/mfd-mcp'+suffix,{headers:{Origin:'https://evil.invalid','X-Forwarded-Host':'evil.invalid','X-Forwarded-Proto':'https',Authorization:'Bearer synthetic'}}),config);
 assert.equal(r.url,'https://gngnrmzeghjzqsmzuktl.supabase.co/functions/v1/mfd-mcp'+suffix);assert.equal(r.headers.get('origin'),'https://evil.invalid');assert.equal(r.headers.get('authorization'),'Bearer synthetic');
}
for(const address of ['http://evil.invalid:8081/mfd-mcp/mcp','http://127.0.0.1:8082/mfd-mcp/mcp','http://localhost:8081/mfd-mcp/mcp','http://127.0.0.1:8081/other/mcp','http://127.0.0.1:8081/functions/v1/mfd-mcp/mcp'])assert.equal(c.module.exports.edgeRequest(new Request(address,{headers:{'X-Forwarded-Host':'gngnrmzeghjzqsmzuktl.supabase.co'}}),config),null);
const direct=new Request(config.resource);assert.equal(c.module.exports.edgeRequest(direct,config),direct);
console.log('PASS exact native Edge route mapping, fixed public resource, preserved Origin/Bearer, forged-forwarded and unknown-authority rejection');
