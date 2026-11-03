// Generates only ignored, localhost/synthetic fixtures. Never links or deploys.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve('.sites-runtime/c1a3'),native=path.join(root,'native/supabase');
if(!fs.readFileSync(path.join(native,'config.toml'),'utf8').includes('project_id = "mfd-c1a3-native"'))throw Error('Initialize the dedicated unlinked local project first');
const base='https://gngnrmzeghjzqsmzuktl.supabase.co';
const env={MFD_ENV:'staging',MFD_SUPABASE_URL:base,MFD_OAUTH_ISSUER:base+'/auth/v1',MFD_MCP_RESOURCE_URL:base+'/functions/v1/mfd-mcp/mcp',MFD_AUTH_ORIGIN:'https://127.0.0.1:54443',MFD_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_native_fixture',MFD_ALLOWED_CLIENT_IDS:'["native-local"]',MFD_CLIENT_REDIRECTS:'{"native-local":["https://client.invalid/callback"]}',MFD_MCP_WRITES:'false'};
const fixture=`// LOCAL SYNTHETIC FIXTURE ONLY. No network upstreams are permitted.
const base=${JSON.stringify(base)};
const claims={sub:'native-alice',iss:base+'/auth/v1',aud:'authenticated',role:'authenticated',session_id:'native-session'};
const jwt=c=>'e30.'+btoa(JSON.stringify({...c,exp:Date.now()/1000+3600})).replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_')+'.synthetic';
let upstreamCalls=0;
async function syntheticFetch(input,init={}){
 const url=String(input);if(!url.startsWith(base+'/'))throw Error('Network forbidden');upstreamCalls++;
 if(url.endsWith('/auth/v1/user')){
  const token=new Headers(init.headers).get('authorization')?.slice(7);
  if(!token?.endsWith('.synthetic'))return Response.json({error:'Invalid credential'},{status:401});
  return Response.json({id:'native-alice'});
 }
 if(url.includes('/auth/v1/token?'))return Response.json({access_token:jwt(claims),refresh_token:'native-synthetic-refresh',user:{id:'native-alice'}});
 if(url.includes('/oauth/authorizations/'))return url.endsWith('/consent')?Response.json({redirect_url:'https://client.invalid/callback?code=synthetic&state=synthetic'}):Response.json({user:{id:'native-alice'},client:{id:'native-local',name:'Native fixture'},redirect_uri:'https://client.invalid/callback'});
 if(url.endsWith('/rest/v1/rpc/mfd_mcp')){const op=JSON.parse(init.body).operation;return Response.json(op==='connections'?[]:op==='profile'?{revision:1,data:{name:'Native Alice'}}:{});}
 if(url.includes('/user/oauth/grants'))return init.method==='DELETE'?new Response(null,{status:204}):Response.json([]);
 if(url.includes('/logout'))return new Response(null,{status:204});
 throw Error('Unexpected fixture path');
}
globalThis.fetch=syntheticFetch;
`;
for(const name of ['mfd-probe','mfd-gated','mfd-mcp'])fs.mkdirSync(path.join(native,'functions',name),{recursive:true});
const probe=`Deno.serve(request=>{const url=new URL(request.url);return Response.json({origin:url.origin,path:url.pathname,host:request.headers.get('host'),forwarded_host:request.headers.get('x-forwarded-host'),forwarded_proto:request.headers.get('x-forwarded-proto')})});\n`;
fs.writeFileSync(path.join(native,'functions/mfd-probe/index.ts'),probe);
fs.writeFileSync(path.join(native,'functions/mfd-gated/index.ts'),probe);
fs.writeFileSync(path.join(native,'functions/mfd-mcp/index.ts'),fixture+fs.readFileSync('.sites-runtime/independent/edge.js','utf8'));
const configPath=path.join(native,'config.toml');let text=fs.readFileSync(configPath,'utf8');
if(!text.includes('[functions.mfd-probe]'))text+='\n[functions.mfd-probe]\nverify_jwt = false\n[functions.mfd-gated]\nverify_jwt = true\n[functions.mfd-mcp]\nverify_jwt = false\n';
fs.writeFileSync(configPath,text);
fs.writeFileSync(path.join(root,'native/fixture.env'),Object.entries(env).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});
const cf=path.join(root,'cloudflare');fs.mkdirSync(cf,{recursive:true});
fs.writeFileSync(path.join(cf,'fixture.mjs'),fixture+`\nimport worker from '../../independent/auth-worker.js';\nexport default {fetch(request,env){if(new URL(request.url).pathname==='/__fixture/state')return Response.json({upstreamCalls});return worker.fetch(request,env);}};\n`);
fs.writeFileSync(path.join(cf,'wrangler.json'),JSON.stringify({name:'mfd-auth-local-rehearsal',main:'fixture.mjs',compatibility_date:'2026-10-12',vars:env,dev:{ip:'127.0.0.1',port:54443,local_protocol:'https'},observability:{enabled:false}},null,2));
console.log('PASS prepared ignored native Edge and workerd fixtures; synthetic fetch only; dedicated local config; no hosted changes');
