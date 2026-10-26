const esbuild=require('esbuild'),vm=require('vm'),assert=require('assert');
const code=esbuild.buildSync({entryPoints:['frontend/lib/imageSafety.ts'],bundle:true,format:'cjs',write:false}).outputFiles[0].text;
const c={module:{exports:{}},Uint8Array};vm.createContext(c);vm.runInContext(code,c);const {validateImageFile,assertImageDimensions}=c.module.exports;
(async()=>{
 for(const bytes of [[255,216,255,224],[137,80,78,71,13,10,26,10],Buffer.from('RIFF0000WEBP'),Buffer.from('GIF89a'),Buffer.from('0000ftypheic')])await validateImageFile(new Blob([new Uint8Array(bytes)]));
 await assert.rejects(validateImageFile(new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/png'})));
 await assert.rejects(validateImageFile(new Blob(['<html>'],{type:'image/jpeg'})));
 await assert.rejects(validateImageFile(new Blob([])));
 await assert.rejects(validateImageFile({size:21*1024*1024}));
 assertImageDimensions(8000,6000);
 for(const [w,h] of [[100000,100000],[0,100],[NaN,100],[Infinity,100]])assert.throws(()=>assertImageDimensions(w,h));
 console.log('PASS upload signatures, forged MIME rejection, size and pixel limits');
})().catch(e=>{console.error(e);process.exit(1)});
