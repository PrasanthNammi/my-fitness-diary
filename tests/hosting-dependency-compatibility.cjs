const assert=require('node:assert/strict');
const path=require('node:path');
const {realpathSync}=require('node:fs');
const {createRequire}=require('node:module');
(async()=>{
 const {invocationSchema,driverMessageSchema}=await import('../hosting/scripts/connector-preview/protocol.mjs');
 assert(invocationSchema.safeParse({connectorId:'synthetic',actionName:'read',arguments:{limit:2}}).success);
 assert(!invocationSchema.safeParse({connectorId:'synthetic',actionName:'read',arguments:[],account:'forged'}).success);
 assert(driverMessageSchema.safeParse({jsonrpc:'2.0',id:'11111111-1111-4111-8111-111111111111',result:{status:'success'}}).success);
 const wranglerRequire=createRequire(realpathSync(path.resolve('hosting/node_modules/wrangler/package.json')));
 const miniflareRequire=createRequire(wranglerRequire.resolve('miniflare/package.json'));
 const undici=miniflareRequire('undici');
 assert.equal(miniflareRequire('undici/package.json').version,'7.30.1');
 for(const key of ['FormData','Headers','Pool','Request','Response','fetch','getGlobalDispatcher'])assert.equal(typeof undici[key],'function',key);
 // data: is handled in-process; no network connection or account is involved.
 assert.equal(await(await undici.fetch('data:text/plain,mfd-synthetic')).text(),'mfd-synthetic');
 const vinextRequire=createRequire(realpathSync('hosting/node_modules/vinext/package.json'));
 const ogRequire=createRequire(vinextRequire.resolve('@vercel/og'));
 const fontRequire=createRequire(ogRequire.resolve('satori'));
 const fflate=fontRequire('fflate');assert(realpathSync(fontRequire.resolve('fflate')).includes('fflate@0.7.5/'));
 const archive=fflate.zipSync({'synthetic.txt':fflate.strToU8('mfd-fixture')});
 assert.equal(fflate.strFromU8(fflate.unzipSync(archive)['synthetic.txt']),'mfd-fixture');
 console.log('PASS Zod 4 request validation, Miniflare Undici APIs/data fetch and Satori fflate ZIP round-trip');
})().catch(error=>{console.error(error);process.exitCode=1});
