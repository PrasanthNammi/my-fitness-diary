// The watch strip on the running workout: connecting → connected while the watch answers → not reached after 20 s.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-wl-'));esbuild.buildSync({entryPoints:['frontend/domain/watchLink.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'w.cjs')});
const W=require(path.join(dir,'w.cjs'));fs.rmSync(dir,{recursive:true,force:true});
const s=(now,attempt,here)=>W.watchLinkState(now*1000,attempt*1000,here===null?null:here*1000);
assert.equal(s(0,0,null),'connecting','just asked the watch to open');
assert.equal(s(19,0,null),'connecting');
assert.equal(s(20,0,null),'lost','no answer in 20 s');
assert.equal(s(5,0,3),'connected','the watch answered');
assert.equal(s(22,0,3),'connected','answers last 20 s');
assert.equal(s(23,0,3),'connecting','gone quiet: connecting again');
assert.equal(s(42,0,3),'connecting');
assert.equal(s(43,0,3),'lost','still quiet 20 s later');
assert.equal(s(50,45,3),'connecting','Try again starts a new 20 s');
assert.equal(s(51,45,51),'connected');
console.log('PASS watch strip: connecting, connected while the watch answers, not reached after 20 s, Try again');
