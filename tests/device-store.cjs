// public/legacy/device-store.js: the offline copy of the diary lives in IndexedDB, not localStorage (whose ~5 MB
// filled up: "Browser storage is full"). Old copies move out of localStorage on first start; a full localStorage no
// longer matters; the copy survives a restart; other keys stay in localStorage; without IndexedDB nothing changes.
require('fake-indexeddb/auto');
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const code=fs.readFileSync('public/legacy/device-store.js','utf8');
function local(full=false){const m=new Map();return{m,api:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{if(full)throw new Error('QuotaExceededError');m.set(k,String(v))},removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size}}};}
function start(ls,idb=indexedDB){const window={indexedDB:idb};const ctx={window,localStorage:new Proxy(ls.api,{ownKeys:()=>[...ls.m.keys()],getOwnPropertyDescriptor:(t,k)=>ls.m.has(k)?{enumerable:true,configurable:true,value:ls.m.get(k)}:Reflect.getOwnPropertyDescriptor(t,k)}),Promise,Object,String,Map,setTimeout};
 vm.runInNewContext(code,ctx);return window.MFDDevice;}
const settle=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const U='forma.account.u1',big=JSON.stringify({document:{sessions:'x'.repeat(3_000_000)},revision:7});
 let ls=local();ls.m.set(U,big);ls.m.set('mfd-theme','dark');
 let d=start(ls);assert.equal(await d.ready,true);
 assert.equal(d.get(U),big,'the old copy is read');assert.equal(ls.m.has(U),false,'and moved out of localStorage');assert.equal(ls.m.get('mfd-theme'),'dark','other keys stay');
 // localStorage full: the diary copy still saves (it no longer goes there).
 ls=local(true);d=start(ls);await d.ready;
 d.set(U+'.journal','{"patch":1}');d.set(U,'{"revision":8}');await settle();
 d=start(local());await d.ready;
 assert.deepEqual([d.get(U),d.get(U+'.journal')],['{"revision":8}','{"patch":1}'],'kept across a restart');
 d.remove(U+'.journal');await settle();d=start(local());await d.ready;assert.equal(d.get(U+'.journal'),null,'removed');
 {const full=start(local(true));await full.ready;assert.throws(()=>full.set('mfd-other','1'),/Quota/,'other keys still use localStorage');}
 // A newer copy in the database wins over a stale one left in localStorage.
 ls=local();ls.m.set(U,'{"revision":1}');d=start(ls);await d.ready;assert.equal(d.get(U),'{"revision":8}');assert.equal(ls.m.has(U),false);
 // No IndexedDB: localStorage as before.
 ls=local();d=start(ls,null);assert.equal(await d.ready,false);d.set(U,'a');assert.equal(ls.m.get(U),'a');
 // A browser whose database never answers: after 3 s the app goes on with localStorage.
 ls=local();d=start(ls,{open:()=>({})});const t0=Date.now();assert.equal(await d.ready,false);assert.ok(Date.now()-t0>=2900);d.set(U,'b');assert.equal(ls.m.get(U),'b');
 console.log('PASS device store: offline copy in IndexedDB, moved out of localStorage, survives restarts and a full localStorage; fallback unchanged');
})().catch(e=>{console.error(e);process.exit(1);});
