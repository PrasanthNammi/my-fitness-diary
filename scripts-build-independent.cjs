const fs=require('node:fs'),path=require('node:path'),{buildSync}=require('esbuild');
const out='.sites-runtime/independent';fs.mkdirSync(out,{recursive:true});
for(const [entry,name] of [['edge','edge.js'],['auth-worker','auth-worker.js'],['colocated-worker','colocated-worker.js'],['preoauth-worker','preoauth-worker.js']]){
 const result=buildSync({entryPoints:[`hosting/independent/${entry}.ts`],bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2022',external:['cloudflare:workers'],write:false});
 const text=result.outputFiles[0].text;
 if(text.includes('djyozltkmbzhwuvemxuy')||/sb_secret_[\w-]+|-----BEGIN [\w ]*PRIVATE KEY-----/.test(text))throw Error('Unsafe integration artifact');
 if(!text.includes('gngnrmzeghjzqsmzuktl'))throw Error('Missing staging identity');
 fs.writeFileSync(path.join(out,name),text);
 console.log(`PASS isolated ${name}: ${Buffer.byteLength(text)} bytes; staging-only artifact scan`);
}

// Production connector: same code, deployment profile fixed at build time (see hosting/independent/config.ts).
const production={env:'production',supabase:'https://djyozltkmbzhwuvemxuy.supabase.co',origin:'https://mfd-connect.shanustylish777.workers.dev',app:'https://prasanth-nammi-portfolio.shanustylish777.chatgpt.site'};
{
 const result=buildSync({entryPoints:['hosting/independent/colocated-worker.ts'],bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2022',external:['cloudflare:workers'],define:{__MFD_DEPLOYMENT__:JSON.stringify(production)},write:false});
 const text=result.outputFiles[0].text;
 if(/sb_secret_[\w-]+|-----BEGIN [\w ]*PRIVATE KEY-----/.test(text))throw Error('Unsafe production artifact');
 if(!text.includes(JSON.stringify(production.supabase))||!text.includes(production.origin))throw Error('Missing production identity');
 fs.writeFileSync(path.join(out,'colocated-worker.production.js'),text);
 console.log(`PASS production colocated-worker.production.js: ${Buffer.byteLength(text)} bytes; production profile fixed at build time`);
}
