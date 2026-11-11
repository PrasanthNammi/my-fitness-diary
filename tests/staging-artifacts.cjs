const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {verify}=require('../scripts-verify-staging.cjs');
const {buildSync}=require('esbuild');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-artifacts-'));
try{
 const file=path.join(directory,'worker.js');
 // Inspect actual bundled Worker configuration before any app is served.
 fs.writeFileSync(file,buildSync({entryPoints:['hosting/worker/mfd.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text);
 verify([directory]);
 fs.appendFileSync(file,'\n// djyozltkmbzhwuvemxuy');
 assert.throws(()=>verify([directory]),/Forbidden production reference/);
 fs.writeFileSync(file,'// no deployment config');
 assert.throws(()=>verify([directory]),/No staging project/);
 fs.writeFileSync(file,'// gngnrmzeghjzqsmzuktl sb_secret_synthetic');
 assert.throws(()=>verify([directory]),/Secret key/);
 console.log('PASS artifact gate rejects production, missing staging and secret-key references');
}finally{fs.rmSync(directory,{recursive:true,force:true})}
