const esbuild=require('esbuild'),fs=require('node:fs');
async function buildBarcode(){
 await esbuild.build({entryPoints:['src/barcode-client.js'],bundle:true,minify:true,format:'iife',platform:'browser',outfile:'public/legacy/vendor/barcode.js'});
 fs.copyFileSync('public/legacy/vendor/barcode.js','public/vendor/barcode.js');
}
module.exports=buildBarcode;
if(require.main===module)buildBarcode().catch(error=>{console.error(error);process.exitCode=1});
