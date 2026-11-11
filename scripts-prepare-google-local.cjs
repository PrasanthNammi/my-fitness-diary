// LOCAL synthetic fixture only. Never invokes a hosted API/deployment.
const fs=require('node:fs'),path=require('node:path');
const dir='.sites-runtime/c1b-google/cloudflare';fs.mkdirSync(dir,{recursive:true});
let prefix=fs.readFileSync('.sites-runtime/c1a3/cloudflare/fixture.mjs','utf8').split('\nimport worker from ')[0];
if(!prefix.includes('LOCAL SYNTHETIC FIXTURE ONLY')||!prefix.includes('globalThis.fetch=syntheticFetch'))throw Error('Unexpected fixture');
prefix=prefix.replace('let upstreamCalls=0;', 'let upstreamCalls=0;const usedCodes=new Set();');
prefix=prefix.replace("if(url.includes('/auth/v1/token?'))return", "if(url.endsWith('/auth/v1/token?grant_type=pkce')){const b=JSON.parse(init.body);if(!/^[a-f0-9]{64}$/.test(b.code_verifier)||usedCodes.has(b.auth_code)||b.auth_code==='failure')return Response.json({error:'Denied'},{status:400});usedCodes.add(b.auth_code);}\n if(url.includes('/auth/v1/token?'))return");
prefix=prefix.replace("if(url.includes('/oauth/authorizations/'))return", "if(url.endsWith('/oauth/authorizations/local-reconnect'))return Response.json({redirect_url:'https://client.invalid/callback?code=synthetic&state=synthetic'});\n if(url.includes('/oauth/authorizations/'))return");
prefix=prefix.replace("op==='connections'?[]:","op==='authorization_binding'?{client_id:'native-local',redirect_uri:'https://client.invalid/callback'}:op==='connections'?[]:");
fs.writeFileSync(dir+'/fixture.mjs',prefix+"\nimport worker,{AbuseCoordinator} from '../../independent/colocated-worker.js';\nexport {AbuseCoordinator};\nexport default {fetch(request,env){if(new URL(request.url).pathname==='/__fixture/state')return Response.json({upstreamCalls});return worker.fetch(request,env);}};\n");
const vars=JSON.parse(fs.readFileSync('.sites-runtime/c1a3/cloudflare/wrangler.json')).vars;
vars.MFD_AUTH_ORIGIN='https://127.0.0.1:54445';vars.MFD_MCP_RESOURCE_URL=vars.MFD_AUTH_ORIGIN+'/mcp';
fs.writeFileSync(dir+'/wrangler.json',JSON.stringify({name:'mfd-google-local',main:'fixture.mjs',compatibility_date:'2026-10-12',vars,durable_objects:{bindings:[{name:'MFD_ABUSE',class_name:'AbuseCoordinator'}]},migrations:[{tag:'local-google-v1',new_sqlite_classes:['AbuseCoordinator']}],observability:{enabled:false}},null,2));
console.log('PASS prepared synthetic Google local workerd fixture; upstream network prohibited');
