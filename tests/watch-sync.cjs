// Phone → watch snapshot (routines with folders and set counts, the running workout's progress, units; small enough
// for a data item) and watch → phone commands (applied once each, in order, malformed ones ignored).
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-watch-sync.cjs');
const stubs={'../data/store':'export const getDB=()=>null,subscribe=()=>()=>{}','../data/repositories':'export const exerciseName=id=>"Ex "+id','../components/ui':'export const toast=()=>{}','./native':'export const ask=async()=>({}),inApp=()=>false,onNative=()=>()=>{},tell=()=>{}','./appUpdate':'export const appVersion=()=>null,newer=()=>false'};
(async()=>{
 await esbuild.build({entryPoints:['frontend/lib/watch.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent',
  plugins:[{name:'stubs',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}))}}]});
 const store={};globalThis.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)}};
 const W=require(out);
 const set=(done)=>({done,weightKg:80,reps:8});
 const db={settings:{weightUnit:'kg'},folders:[{id:'f1',name:'Push/Pull'}],
  routines:[{id:'r1',name:'Push',folderId:'f1',exercises:[{exerciseId:'bench',sets:[set(),set(),set()]},{exerciseId:'ohp',sets:[set()]}]},{id:'r2',name:'Legs',folderId:null,exercises:[]}],
  active:{title:'Push',startedAt:1700000000000,exercises:[{exerciseId:'bench',sets:[set(true),set(true),set(false)]}]}};
 const s=W.snapshot(db);
 assert.deepEqual(s,{v:1,units:{weight:'kg'},routines:[{id:'r1',name:'Push',folder:'Push/Pull',exercises:[{name:'Ex bench',sets:3},{name:'Ex ohp',sets:1}]},{id:'r2',name:'Legs',folder:null,exercises:[]}],
  workout:{title:'Push',startedAt:1700000000000,exercises:[{name:'Ex bench',done:2,total:3}]}});
 assert.equal(W.snapshot({...db,active:null}).workout,null);
 // A huge library stays under the data-item limit.
 const many={...db,routines:Array.from({length:150},(_,i)=>({id:'r'+i,name:'Routine '+i,folderId:null,exercises:Array.from({length:12},()=>({exerciseId:'some-long-exercise-id-'+i,sets:[set(),set(),set(),set()]}))}))};
 const big=W.snapshot(many);assert.equal(big.routines.length,100);assert.ok(JSON.stringify(big).length<=80000);
 console.log('PASS watch snapshot: routines with folders and set counts, running workout progress, units, stays under the size limit');
 // Commands: once each, in order; malformed ignored; a failing one doesn't stop the rest.
 const got=[];const handle=c=>{if(c.type==='boom')throw Error('x');got.push(c.id)};
 const c=(id,type='hello')=>({v:1,id,type});
 assert.equal(W.applyCommands([c('aaaaaaaa1'),c('aaaaaaaa2','boom'),c('aaaaaaaa3'),{v:2,id:'bbbbbbbb1',type:'hello'},{v:1,type:'hello'},null,c('aaaaaaaa1')],handle),3);
 assert.deepEqual(got,['aaaaaaaa1','aaaaaaaa3']);
 assert.equal(W.applyCommands([c('aaaaaaaa1'),c('aaaaaaaa3'),c('aaaaaaaa4')],handle),1,'already applied ids skipped across calls');
 assert.deepEqual(got,['aaaaaaaa1','aaaaaaaa3','aaaaaaaa4']);
 console.log('PASS watch commands: applied once each in order, old versions and malformed ones ignored, one failure does not stop the rest');
})().catch(e=>{console.error(e);process.exit(1)});
