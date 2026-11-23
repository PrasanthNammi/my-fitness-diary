// Training order: pinned folders (stored, so every phone and the tables keep it), folders and routines moved up and
// down within their group or folder, and the Reorder page's rules (where a dragged row lands, removed exercises leave
// their superset, anything added meanwhile is kept).
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-training-order.cjs');
esbuild.buildSync({stdin:{contents:`export {training} from './frontend/data/repositories';export {getDB} from './frontend/data/store';export * from './frontend/domain/reorder';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const r=(id,name,folderId)=>({id,name,folderId,exercises:[]});
let state={profile:{onboarded:true,name:'Test',sex:'male',height:175,activity:1.55,goal:'Maintain',days:4},sessions:[],meals:[],products:[],weights:[],checkins:[],water:{},active:null,
 folders:[{id:'a',name:'hevy-trainer'},{id:'b',name:'hevy-trainer-2'},{id:'c',name:'Mobility'}],folderOpen:{a:true,b:true,c:true},
 routines:[r('a1','Upper 1','a'),r('b1','Upper 1','b'),r('a2','Lower 1','a'),r('x1','Loose',null),r('b2','Lower 1','b'),r('a3','Upper 2','a'),r('x2','Gone folder','zzz')]},v=0,subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:next=>{state=next;v++;subs.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const {training,getDB,dropIndex,moveTo,applyReorder}=require(out);
const names=(folder)=>getDB().routines.filter(x=>(x.folderId&&getDB().folders.some(f=>f.id===x.folderId)?x.folderId:null)===folder).map(x=>x.id);

// Pin: stored with the folder (the diary keeps it; unpinning removes it again), and only there.
training.pinFolder('c',true);
assert.deepEqual(state.folders.find(f=>f.id==='c'),{id:'c',name:'Mobility',pinned:true},'pinned is saved in the diary');
assert.equal(getDB().folders.find(f=>f.id==='c').pinned,true,'and read back');
// Folders move within their group: the pinned one alone can't move; the others swap past it.
training.moveFolder('c',-1);assert.deepEqual(state.folders.map(f=>f.id),['a','b','c'],'a pinned folder moves only among pinned ones');
training.moveFolder('b',-1);assert.deepEqual(state.folders.map(f=>f.id),['b','a','c']);
training.moveFolder('b',-1);assert.deepEqual(state.folders.map(f=>f.id),['b','a','c'],'already first');
training.moveFolder('a',1);assert.deepEqual(state.folders.map(f=>f.id),['b','a','c'],'the pinned one is not in its group');
training.pinFolder('c',false);
assert.deepEqual(state.folders.find(f=>f.id==='c'),{id:'c',name:'Mobility'},'unpinned: nothing left behind');
training.moveFolder('a',1);assert.deepEqual(state.folders.map(f=>f.id),['b','c','a']);
console.log('PASS folders: pin to top is saved with the folder (and removed on unpin); move up/down stays within pinned or other folders');

// Routines move within their own folder (or "no folder", which includes routines of a deleted folder).
assert.deepEqual(names('a'),['a1','a2','a3']);
training.moveRoutineOrder('a3',-1);assert.deepEqual(names('a'),['a1','a3','a2'],'up past the routine above in the same folder');
training.moveRoutineOrder('a3',-1);assert.deepEqual(names('a'),['a3','a1','a2']);
training.moveRoutineOrder('a3',-1);assert.deepEqual(names('a'),['a3','a1','a2'],'already first');
assert.deepEqual(names('b'),['b1','b2'],'other folders untouched');
training.moveRoutineOrder('x2',-1);assert.deepEqual(names(null),['x2','x1'],'routines without a (live) folder move among themselves');
assert.deepEqual(state.routines.filter(x=>x.folderId==='a').map(x=>x.id),['a3','a1','a2'],'the order is saved in the diary');
console.log('PASS routines: move up/down within their folder, saved; other folders untouched');

// The Reorder page.
assert.equal(dropIndex(2,0,60,6),2);assert.equal(dropIndex(2,-65,60,6),1);assert.equal(dropIndex(2,-500,60,6),0);assert.equal(dropIndex(2,95,60,6),4);assert.equal(dropIndex(2,999,60,6),5);
assert.deepEqual(moveTo(['A','B','C','D'],3,0),['D','A','B','C'],'dragged up: the ones above drop below');
assert.deepEqual(moveTo(['A','B','C','D'],0,2),['B','C','A','D']);
const b=(id,ss,sets=1)=>({id,exerciseId:'e'+id,supersetId:ss,sets:Array.from({length:sets},(_,i)=>({id:id+i})),restSec:90,note:''});
const opened=[b('1',null),b('2','s'),b('3','s'),b('4',null)];
// Meanwhile a set was ticked on the watch (block 1 changed) and an exercise added (5).
const current=[{...b('1',null),sets:[{id:'1x',done:true}]},b('2','s'),b('3','s'),b('4',null),b('5',null)];
const next=applyReorder(current,opened,[opened[3],opened[0],opened[1]]);   // 3 removed, 4 to the top
assert.deepEqual(next.map(x=>x.id),['4','1','2','5'],'new order, removed one gone, the added one kept at the end');
assert.deepEqual(next[1].sets,[{id:'1x',done:true}],'the latest sets are kept');
assert.equal(next.find(x=>x.id==='2').supersetId??null,null,'a superset left with one exercise is undone');
assert.deepEqual(applyReorder(opened,opened,opened),opened,'nothing changed');
console.log('PASS Reorder page: drag lands where the finger stops, others shift; Done keeps the latest sets, removes and unlinks supersets, keeps anything added meanwhile');
