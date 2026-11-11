// Local-only profile fixture. Its fake upstream/gate are never deployment inputs.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve('.sites-runtime/c1c-engineering');
for(const kind of ['baseline','candidate']){
 const dir=path.join(root,'native',kind);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'fixture.mjs'),`import {createMcpService} from '../../${kind}-service.mjs';
const origin='https://mfd-connect-staging.shanustylish777.workers.dev',base='https://gngnrmzeghjzqsmzuktl.supabase.co';
const app=createMcpService({authOrigin:origin,resource:origin+'/mcp',supabase:base,issuer:base+'/auth/v1',key:'sb_publishable_synthetic',clients:['synthetic-client'],redirects:{'synthetic-client':['https://client.invalid/callback']}},async url=>url.endsWith('/user')?Response.json({id:'synthetic-owner'}):Response.json({data:{name:'MFD STAGING A'},revision:1}),{allow:async()=>true});
export default {fetch(request){const u=new URL(request.url);return app(new Request(origin+u.pathname+u.search,request));}};
`);
 fs.writeFileSync(path.join(dir,'wrangler.json'),JSON.stringify({name:'c1c-'+kind+'-local',main:'fixture.mjs',compatibility_date:'2026-10-12',observability:{enabled:false}},null,2));
}
console.log('PASS prepared separate local-only baseline/candidate CPU fixtures');
