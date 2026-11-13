// Phone → watch snapshot (routines with folders and set counts, the running workout's progress, units; small enough
// for a data item) and watch → phone commands (applied once each, in order, malformed ones ignored).
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-watch-sync.cjs');
const stubs={'../adapters/engine':'export const engine=()=>null','../data/store':'export const getDB=()=>null,subscribe=()=>()=>{}','../data/repositories':'export const exercises={},workouts={},body={},diary={}','../components/ui':'export const toast=()=>{}','./native':'export const ask=async()=>({}),inApp=()=>false,onNative=()=>()=>{},tell=()=>{}','./appUpdate':'export const appVersion=()=>null,newer=()=>false'};
(async()=>{
 await esbuild.build({entryPoints:['frontend/lib/watch.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent',
  plugins:[{name:'stubs',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}))}}]});
 const store={};globalThis.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)}};
 const W=require(out);
 const set=(done)=>({done,weightKg:80,reps:8});
 const EX={bench:{id:'bench',name:'Bench Press (Barbell)',primaryMuscle:'Chest',equipment:'Barbell',tracking:'weight_reps'},ohp:{id:'ohp',name:'Shoulder Press (Dumbbell)',primaryMuscle:'Shoulders',equipment:'Dumbbell',tracking:'weight_reps'},squat:{id:'squat',name:'Squat (Barbell)',primaryMuscle:'Quadriceps',equipment:'Barbell',tracking:'weight_reps'},odd:{id:'odd',name:'Odd',primaryMuscle:'Neck',equipment:'',tracking:'reps'}};
 const lib={byId:id=>EX[id],all:()=>Object.values(EX)};
 const today=(()=>{const n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')})();
 const oats={id:'oats',name:'Oats',origin:'custom',refAmount:1,refUnit:'serving',servingSize:null,kcal:400,protein:20,carbs:60,fat:10};
 const db={profile:null,water:{[today]:750},weights:[{id:'x',date:'2026-01-01',kg:80},{id:'y',date:'2026-02-01',kg:79.5}],checkins:[{id:'c',date:today,energy:4,soreness:2,sleep:7,note:''}],
  diary:[{id:'e1',date:today,meal:'breakfast',food:oats,amount:1,unit:'serving',createdAt:2},{id:'e2',date:today,meal:'lunch',food:oats,amount:2,unit:'serving',createdAt:3}],
  settings:{weightUnit:'kg',defaultRestSec:120,favouriteFoods:[oats]},folders:[{id:'f1',name:'Push/Pull'}],workouts:[{id:'h1',title:'Push',routineId:'r1',startedAt:0,endedAt:5,exercises:[{id:'hb',exerciseId:'bench',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[{id:'hs',type:'normal',weightKg:77.5,reps:8,timeSec:null,distanceKm:null,done:true}]}]}],
  routines:[{id:'r1',name:'Push',folderId:'f1',exercises:[{exerciseId:'bench',sets:[set(),set(),set()]},{exerciseId:'ohp',sets:[set()]}]},{id:'r2',name:'Legs',folderId:null,exercises:[]}],
  active:{id:'w1',title:'Push',routineId:'r1',startedAt:1700000000000,exercises:[{id:'b1',exerciseId:'bench',tracking:'weight_reps',restSec:90,supersetId:null,sets:[{id:'s1',type:'normal',weightKg:80,reps:8,timeSec:null,distanceKm:null,done:true},{id:'s2',type:'normal',weightKg:null,reps:null,timeSec:null,distanceKm:null,done:false,aiTarget:true,suggested:{weightKg:82.5,reps:8}}]},{id:'b2',exerciseId:'ohp',tracking:'weight_reps',restSec:60,supersetId:null,sets:[{id:'t1',type:'warmup',weightKg:null,reps:null,timeSec:null,distanceKm:null,done:false}]}],timers:{b1:{durationSec:90,endsAt:1700000090000,pausedRemainingSec:null}}}};
 const s=W.snapshot(db,lib,['c1','c2']);
 assert.deepEqual(s.applied,['c1','c2']);assert.deepEqual(s.units,{weight:'kg',defaultRestSec:120});
 assert.deepEqual(s.routines,[{id:'r1',name:'Push',folder:'Push/Pull',exercises:[{name:'Bench Press (Barbell)',sets:3},{name:'Shoulder Press (Dumbbell)',sets:1}]},{id:'r2',name:'Legs',folder:null,exercises:[]}]);
 const w=s.workout;assert.deepEqual([w.id,w.title,w.routineId,w.blocks.length],['w1','Push','r1',2]);
 assert.deepEqual([w.blocks[0].name,w.blocks[0].step,w.blocks[1].step],['Bench Press (Barbell)',2.5,1],'barbell 2.5 kg steps, dumbbell 1 kg');
 assert.deepEqual(w.blocks[0].sets[0],{id:'s1',type:'normal',done:true,ai:false,v:{weightKg:80,reps:8,timeSec:null,distanceKm:null},t:{weightKg:null,reps:null,timeSec:null,distanceKm:null},p:{weightKg:77.5,reps:8,timeSec:null,distanceKm:null}});
 assert.deepEqual([w.blocks[0].sets[1].ai,w.blocks[0].sets[1].t.weightKg,w.blocks[0].sets[1].p],[true,82.5,null],'AI target faded; no 2nd set last time');
 assert.equal(w.blocks[1].sets[0].p,null,'warm-up has no previous warm-up');
 assert.deepEqual(w.timers.b1,{endsAt:1700000090000,durationSec:90});
 assert.deepEqual(s.library.recent.map(e=>e.id),['bench'],'recently used first');
 assert.deepEqual(s.library.recent[0].last,{weightKg:77.5,reps:8,timeSec:null,distanceKm:null},'last working set, to pre-fill');
 assert.deepEqual(Object.keys(s.library.muscles).sort(),['Chest','Legs','Shoulders'],'muscles grouped; unknown left out');
 assert.equal(W.snapshot({...db,active:null},lib).workout,null);
 assert.deepEqual([s.today.date,s.today.kcalEaten,s.today.protein,s.today.waterMl,s.today.waterGoalMl,s.today.lastWeight.kg],[today,1200,60,750,2500,79.5]);
 assert.deepEqual(s.today.checkin,{energy:4,soreness:2,sleep:7,steps:null});
 assert.deepEqual(s.today.nextRoutine,{id:'r2',name:'Legs'},'the routine after the last one done');
 const R=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],done=(id,t)=>({routineId:id,endedAt:t});
 assert.deepEqual(W.nextRoutine({routines:R,workouts:[]}),{id:'a',name:'A'});assert.deepEqual(W.nextRoutine({routines:R,workouts:[done('c',9),done('a',5)]}),{id:'a',name:'A'},'wraps round');
 assert.deepEqual(W.nextRoutine({routines:R,workouts:[done('gone',9)]}),{id:'a',name:'A'},'a deleted routine starts from the first');assert.equal(W.nextRoutine({routines:[],workouts:[]}),null);
 assert.deepEqual(s.foods.map(f=>[f.ref,f.from,f.amount,f.kcalPerUnit]),[['e2','entry',2,400]],'latest entry per food; a favourite already listed is not repeated');
 // A huge library stays under the data-item limit.
 const many={...db,active:null,routines:Array.from({length:150},(_,i)=>({id:'r'+i,name:'Routine '+i,folderId:null,exercises:Array.from({length:12},()=>({exerciseId:'some-long-exercise-id-'+i,sets:[set(),set(),set(),set()]}))}))};
 const big=W.snapshot(many,lib);assert.equal(big.routines.length,100);assert.ok(JSON.stringify(big).length<=80000);
 console.log('PASS watch snapshot: routines, full running workout (set types, values, faded and AI targets, previous session, rest timers, weight steps), exercise library by recent and muscle, applied commands, size limit');
 // Commands: once each, in order; malformed ignored; a failing one doesn't stop the rest.
 const got=[];const handle=c=>{if(c.type==='boom')throw Error('x');got.push(c.id)};
 const c=(id,type='hello')=>({v:1,id,type});
 assert.equal(W.applyCommands([c('aaaaaaaa1'),c('aaaaaaaa2','boom'),c('aaaaaaaa3'),{v:2,id:'bbbbbbbb1',type:'hello'},{v:1,type:'hello'},null,c('aaaaaaaa1')],handle),3);
 assert.deepEqual(got,['aaaaaaaa1','aaaaaaaa3']);
 assert.equal(W.applyCommands([c('aaaaaaaa1'),c('aaaaaaaa3'),c('aaaaaaaa4')],handle),1,'already applied ids skipped across calls');
 assert.deepEqual(got,['aaaaaaaa1','aaaaaaaa3','aaaaaaaa4']);
 console.log('PASS watch commands: applied once each in order, old versions and malformed ones ignored, one failure does not stop the rest');
 // Commands from before watch sync started (watch app testing) are dropped, as are ones without a time.
 assert.equal(W.beforeWatchSync({at:Date.UTC(2026,10,12,18,0)}),true);assert.equal(W.beforeWatchSync({}),true);assert.equal(W.beforeWatchSync({at:'x'}),true);
 assert.equal(W.beforeWatchSync({at:Date.UTC(2026,10,13,12,1)}),false);
 console.log('PASS watch test commands from before MFD 2.0 never reach the diary');
})().catch(e=>{console.error(e);process.exit(1)});
