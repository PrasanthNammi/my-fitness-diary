// Local-only fixture and SQLite namespace. Never calls Cloudflare APIs.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve('.sites-runtime/c1a4'),dir=path.join(root,'cloudflare');fs.mkdirSync(dir,{recursive:true});
const old=fs.readFileSync('.sites-runtime/c1a3/cloudflare/fixture.mjs','utf8');let prefix=old.split('\nimport worker from ')[0];
if(!prefix.includes('LOCAL SYNTHETIC FIXTURE ONLY')||prefix.includes('export default'))throw Error('Unexpected prior fixture');
prefix=prefix.replace("if(url.includes('/oauth/authorizations/'))return", "if(url.endsWith('/oauth/authorizations/local-reconnect'))return Response.json({redirect_url:'https://client.invalid/callback?code=synthetic&state=synthetic'});\n if(url.includes('/oauth/authorizations/'))return");
prefix=prefix.replace("op==='connections'?[]:","op==='authorization_binding'?{client_id:'native-local',redirect_uri:'https://client.invalid/callback'}:op==='connections'?[]:");
const env=JSON.parse(fs.readFileSync('.sites-runtime/c1a3/cloudflare/wrangler.json')).vars;
env.MFD_AUTH_ORIGIN='https://127.0.0.1:54444';env.MFD_MCP_RESOURCE_URL=env.MFD_AUTH_ORIGIN+'/mcp';
const source=prefix+`\nimport worker,{AbuseCoordinator as Base} from '../../independent/colocated-worker.js';
export class AbuseCoordinator extends Base {async snapshot(){return this.ctx.storage.sql.exec('SELECT scope, window, used FROM counters ORDER BY scope').toArray();}}
export default {async fetch(request,env){const path=new URL(request.url).pathname;
 if(path==='/__fixture/state'){const stub=env.MFD_ABUSE.get(env.MFD_ABUSE.idFromName('mfd-staging-shared-v1'));return Response.json({upstreamCalls,rows:await stub.snapshot()});}
 if(path==='/__fixture/missing-binding')return worker.fetch(new Request(new URL('/login',request.url),request),{...env,MFD_ABUSE:undefined});
 return worker.fetch(request,env);}};\n`;
fs.writeFileSync(path.join(dir,'fixture.mjs'),source);
fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({name:'mfd-colocated-local',main:'fixture.mjs',compatibility_date:'2026-10-12',vars:env,durable_objects:{bindings:[{name:'MFD_ABUSE',class_name:'AbuseCoordinator'}]},migrations:[{tag:'local-v1',new_sqlite_classes:['AbuseCoordinator']}],observability:{enabled:false}},null,2));
console.log('PASS prepared local-only colocated Worker/SQLite fixture with synthetic upstreams');
