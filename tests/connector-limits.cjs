// Connector request limits (hosting/independent/coordinator.ts + colocated-router.ts):
// per connection and per address instead of one budget shared by everyone (26 Nov 2026:
// one AI chat used 29 of the shared 30/minute and was refused; a stranger could lock everyone out).
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{buildSync}=require('esbuild'),{DatabaseSync}=require('node:sqlite');
let now=Date.UTC(2026,10,26,12,0,0);
const context={module:{exports:{}},Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:require('node:crypto').webcrypto,atob,btoa,setTimeout,clearTimeout,require:m=>{assert.equal(m,'cloudflare:workers');return{DurableObject:class{constructor(ctx,env){this.ctx=ctx;this.env=env;}}};},Date:class extends Date{static now(){return now;}}};
vm.createContext(context);
vm.runInContext(buildSync({stdin:{contents:"export {AbuseCoordinator,PER_KEY,TOTAL} from './hosting/independent/coordinator';export {createColocatedService,callerKeys} from './hosting/independent/colocated-router';export {colocatedConfig} from './hosting/independent/colocated-config';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false,external:['cloudflare:workers']}).outputFiles[0].text,context);
const {AbuseCoordinator,PER_KEY,TOTAL,createColocatedService,callerKeys,colocatedConfig}=context.module.exports;
function coordinator(){
 const db=new DatabaseSync(':memory:');
 const storage={sql:{exec(query,...args){const s=db.prepare(query);if(/^SELECT/i.test(query)){const rows=s.all(...args);return{toArray:()=>rows};}s.run(...args);return{toArray:()=>[]};}},transactionSync(fn){db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {c:new AbuseCoordinator({storage},{}),db};
}
async function run(c,n,...args){let ok=0;for(let i=0;i<n;i++)if(await c.consume(...args))ok++;return ok;}
(async()=>{
 let {c,db}=coordinator();
 // 1. A stranger flooding anonymously cannot block a signed-in person.
 assert.equal(await run(c,1000,'anon','stranger'),PER_KEY.anon);
 assert.equal(await run(c,1000,'auth','stranger'),PER_KEY.auth);
 assert.equal(await run(c,1000,'discovery','stranger'),PER_KEY.discovery);
 assert.equal(await run(c,PER_KEY.mcp,'mcp','openai-server','alice'),PER_KEY.mcp,'signed-in user unaffected by the flood');
 // 2. One busy chat is limited on its own; another person on the same AI server is not.
 assert.equal(await c.consume('mcp','openai-server','alice'),false);
 assert.equal(await run(c,PER_KEY.mcp,'mcp','openai-server','bob'),PER_KEY.mcp);
 // 3. One address can't fake its way past with many invented connections.
 let made=2*PER_KEY.mcp,k=0;while(await c.consume('mcp','openai-server','fake'+k++))made++;
 assert.equal(made,PER_KEY.address);
 assert.equal(await c.consume('mcp','claude-server','carol'),true,'other address unaffected');
 // 4. An address sending many refused tokens is blocked; others are not.
 for(let i=0;i<PER_KEY.failures;i++)await c.failed('guesser');
 assert.equal(await c.consume('mcp','guesser','x'),false);
 assert.equal(await c.consume('mcp','claude-server','carol'),true);
 // 5. Anonymous totals across many addresses stop at the stored total; signed-in traffic continues.
 ({c,db}=coordinator());
 let anon=0;for(let i=0;i<TOTAL.anon+50;i++)if(await c.consume('anon','addr'+i))anon++;
 assert.equal(anon,TOTAL.anon);
 assert.equal(await c.consume('mcp','addr1','dave'),true,'botnet of anonymous requests cannot block signed-in users');
 // 6. Privacy: only per-kind totals are stored; no addresses or connections.
 const rows=db.prepare('SELECT scope FROM counters').all().map(r=>r.scope).sort();
 assert.deepEqual(rows,['anon']);
 // 7. A new minute starts fresh; a clock going backwards does not.
 assert.equal(await c.consume('anon','addr0'),false);
 now-=120_000;assert.equal(await c.consume('anon','addr0'),false,'backward clock keeps the window');
 now+=180_000;assert.equal(await c.consume('anon','addr0'),true,'next minute');
 assert.equal(await run(c,PER_KEY.mcp,'mcp','addr1','dave'),PER_KEY.mcp);
 // 8. Old stored rows from the previous version are accepted.
 ({c,db}=coordinator());db.exec("CREATE TABLE IF NOT EXISTS counters (scope TEXT PRIMARY KEY, window INTEGER NOT NULL, used INTEGER NOT NULL)");
 db.exec(`INSERT INTO counters VALUES('global',${Math.floor(now/60000)},30),('mcp',${Math.floor(now/60000)},25)`);
 assert.equal(await c.consume('mcp','a','eve'),true,'old shared 30/minute counter no longer applies');
 await assert.rejects(c.consume('everything','a'),/Unknown budget/);
 // 9. Router: who is asking. Token secrets are never part of the key; refreshed tokens keep the same key.
 const h=(t,ip='1.2.3.4')=>new Request('https://x.invalid/mcp',{headers:{...(t?{authorization:'Bearer '+t}:{}),'cf-connecting-ip':ip}});
 const a1=await callerKeys(h('user1:grant1:secretA')),a2=await callerKeys(h('user1:grant1:secretB')),b=await callerKeys(h('user1:grant2:secretA'));
 assert.equal(a1.connection,a2.connection);assert.notEqual(a1.connection,b.connection);assert.equal(a1.address,b.address);
 assert.ok(!/secret|user1|1\.2\.3\.4/.test(JSON.stringify([a1,b])),'only hashes');
 assert.equal((await callerKeys(h())).connection,undefined);
 // 10. Router sends the right budget, and reports refused tokens.
 const origin='https://mfd-colocated-staging.invalid',env={...JSON.parse(fs.readFileSync('hosting/independent/environment.json')),MFD_AUTH_ORIGIN:origin,MFD_MCP_RESOURCE_URL:origin+'/mcp',MFD_ALLOWED_CLIENT_IDS:'["local-client"]',MFD_CLIENT_REDIRECTS:'{"local-client":["https://client.invalid/callback"]}'};
 const calls=[],failed=[];
 const ns={idFromName:()=>'one',get:()=>({consume:async(...a)=>{calls.push(a);return true;},failed:async a=>{failed.push(a);}})};
 const app=createColocatedService(colocatedConfig(env),ns,async()=>Response.json({}));
 await app.guard(new Request(origin+'/mcp',{method:'POST',headers:{authorization:'Bearer u:g:s','cf-connecting-ip':'9.9.9.9'}}),true);
 await app.guard(new Request(origin+'/mcp',{method:'POST',headers:{'cf-connecting-ip':'9.9.9.9'}}),true);
 assert.deepEqual(calls.map(c=>[c[0],!!c[1],!!c[2]]),[['mcp',true,true],['anon',true,false]]);
 await app.refused(new Request(origin+'/mcp',{headers:{authorization:'Bearer u:g:s','cf-connecting-ip':'9.9.9.9'}}));
 await app.refused(new Request(origin+'/mcp',{headers:{'cf-connecting-ip':'9.9.9.9'}}));
 assert.equal(failed.length,1);assert.equal(failed[0],calls[0][1]);
 console.log('PASS connector limits: per connection + per address, stranger floods and anonymous botnets cannot block signed-in users, one busy chat limited alone, invented connections capped per address, refused-token block, only per-kind totals stored, minute windows and backward clock, old rows accepted, token secrets never keyed, router budgets and refusal reports');
})().catch(e=>{console.error(e);process.exit(1)});
