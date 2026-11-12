// Android app updates: the installed version comes from the app's user agent, versions compare numerically,
// and /android/latest.json may only offer an https download that is newer than the installed app.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-app-update.cjs');
(async()=>{
await esbuild.build({entryPoints:['frontend/lib/appUpdate.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent',
 plugins:[{name:'ui',setup(b){b.onResolve({filter:/components\/ui$/},()=>({path:'ui',namespace:'ui'}));b.onLoad({filter:/.*/,namespace:'ui'},()=>({contents:'export const toast=()=>{}'}));b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'ui-react'}));b.onLoad({filter:/.*/,namespace:'ui-react'},()=>({contents:'export const useEffect=()=>{},useState=v=>[v,()=>{}]'}))}}]});
globalThis.location={origin:'https://mfd.example'};
const U=require(out);
assert.equal(U.appVersion('Mozilla/5.0 (Linux; Android 16; wv) Chrome/140 Mobile Safari/537.36 MFDAndroid/1.2'),'1.2');
assert.equal(U.appVersion('Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile Safari/537.36'),null,'browser');
assert.ok(U.newer('1.10','1.9'));assert.ok(U.newer('1.2.1','1.2'));assert.ok(U.newer('2','1.9'));
assert.ok(!U.newer('1.2','1.2'));assert.ok(!U.newer('1.2','1.2.0'));assert.ok(!U.newer('1.1','1.2'));
assert.deepEqual(U.parseLatest({version:'1.3',url:'https://drive.example/file/abc'},'1.2'),{version:'1.3',url:'https://drive.example/file/abc'});
assert.deepEqual(U.parseLatest({version:'1.3',url:'/android/MyFitnessDiary-1.3.apk'},'1.2'),{version:'1.3',url:'https://mfd.example/android/MyFitnessDiary-1.3.apk'});
assert.equal(U.parseLatest({version:'1.2',url:'https://x.example/a'},'1.2'),null,'same version');
assert.equal(U.parseLatest({version:'1.1',url:'https://x.example/a'},'1.2'),null,'older');
for(const bad of [null,'1.3',{version:'1.3'},{version:'v1.3',url:'https://x.example'},{version:'1.3',url:'http://x.example/a'},{version:'1.3',url:'javascript:alert(1)'},{version:'1.3',url:42}])
 assert.equal(U.parseLatest(bad,'1.2'),null,JSON.stringify(bad));
assert.ok(U.selfUpdating('1.3'));assert.ok(U.selfUpdating('1.10'));assert.ok(U.selfUpdating('2'));assert.ok(!U.selfUpdating('1.2'));assert.ok(!U.selfUpdating('1.0'));
console.log('PASS app updates: version from the app, numeric comparison, only newer https downloads offered; apps from 1.3 update themselves');
})().catch(e=>{console.error(e);process.exit(1)});
