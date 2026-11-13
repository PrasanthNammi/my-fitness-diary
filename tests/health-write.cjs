// Saving to Health Connect (MFD 2.0): which workouts and food are sent, sent again only when changed (with a newer
// version), removed when deleted in MFD, forgotten when they leave the window, never sent for a kind that is off,
// heart rate from Health Connect not sent back, and a diary that looks emptied all at once never wipes what was saved.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-health-write.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/healthWrite.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const H=require(out);
const DAY=86_400_000,now=new Date(2026,10,13,20,0).getTime(),today='2026-11-13';
const set=()=>({id:'s',type:'normal',weightKg:80,reps:8,timeSec:null,distanceKm:null,rpe:null,done:true});
const wo=(id,daysAgo,extra={})=>({id,title:'Push',routineId:null,startedAt:now-daysAgo*DAY-3600_000,endedAt:now-daysAgo*DAY,exercises:[{id:'b',exerciseId:'bench',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[set(),set()]}],...extra});
const oats={id:'oats',name:'Oats',origin:'custom',refAmount:100,refUnit:'g',servingSize:null,kcal:380,protein:13,carbs:60,fat:7,sugars:1,saturates:1.2,fibre:10,salt:0.02};
const meal=(id,date,extra={})=>({id,date,meal:'breakfast',food:oats,amount:80,unit:'g',createdAt:0,...extra});
const d={workouts:[wo('w1',1,{heartRate:{interval:15,bpm:[100,120],avg:110,max:120,source:'watch'}}),wo('w2',3,{heartRate:{interval:15,bpm:[90],avg:90,max:90,source:'health'}}),wo('old',40)],
 diary:[meal('e1',today,{createdAt:new Date(2026,10,13,7,42).getTime()}),meal('e2','2026-11-10'),meal('e0','2026-11-01')]};
const on={workouts:true,food:true},empty={w:{},f:{}};

let p=H.planHealthWrites(d,empty,on,now,today);
assert.deepEqual(p.workouts.map(w=>w.id),['w1','w2'],'last 30 days, newest first');
assert.deepEqual(p.workouts[0].heart,{interval:15,bpm:[100,120]},'the MFD watch heart rate');assert.equal(p.workouts[1].heart,undefined,'heart rate from Health Connect not sent back');
assert.equal(p.workouts[0].notes,'Logged in MFD · 1 exercise · 2 sets');
assert.deepEqual(p.meals.map(m=>m.id),['e1','e2'],'last 7 days');
assert.equal(p.meals[0].start,new Date(2026,10,13,7,42).getTime(),'logged that day: its time');assert.equal(p.meals[1].start,new Date(2026,10,10,8).getTime(),'else the meal time');
assert.deepEqual([p.meals[0].kcal,p.meals[0].protein,p.meals[0].carbs,p.meals[0].fat,p.meals[0].fibre],[304,10.4,48,5.6,8],'nutrients for the amount eaten');
assert.ok(p.workouts.every(w=>w.version>now)&&new Set([...p.workouts,...p.meals].map(x=>x.version)).size===4,'distinct versions newer than any before');
console.log('PASS what is sent: workouts from 30 days (MFD watch heart rate only), food from 7 days at its time, nutrients for the amount');

// Unchanged: nothing. Changed: again with a newer version. Deleted: removed. Out of the window: forgotten.
let sent=p.sent;assert.ok(H.emptyPlan(H.planHealthWrites(d,sent,on,now+1000,today)),'nothing changed, nothing sent');
const d2={...d,workouts:[{...d.workouts[0],title:'Push (heavy)'},d.workouts[1],d.workouts[2]],diary:[d.diary[0],d.diary[2]]};
p=H.planHealthWrites(d2,sent,on,now+5000,today);
assert.deepEqual(p.workouts.map(w=>[w.id,w.title]),[['w1','Push (heavy)']]);assert.ok(p.workouts[0].version>sent.w.w1[1],'newer version');
assert.deepEqual(p.remove,{workouts:[],meals:['e2']},'deleted in MFD: removed');assert.equal(p.sent.f.e2,undefined);
p=H.planHealthWrites(d,sent,on,now+31*DAY,'2026-12-14');
assert.deepEqual(p.remove,{workouts:[],meals:[]},'old ones are not removed');assert.deepEqual(Object.keys(p.sent.w).sort(),[],'… just forgotten');assert.deepEqual(Object.keys(p.sent.f),[]);
console.log('PASS updates: unchanged sends nothing, a change sends a newer version, a deletion removes, leaving the window forgets');

// A kind turned off: nothing sent or removed, and what was saved is remembered.
p=H.planHealthWrites({workouts:[],diary:d.diary},sent,{workouts:false,food:true},now+1000,today);
assert.deepEqual([p.workouts.length,p.remove.workouts.length],[0,0]);assert.deepEqual(p.sent.w,sent.w);
console.log('PASS a kind turned off sends and removes nothing, and keeps what was saved');

// Everything gone at once: removal waits.
const many={w:Object.fromEntries(Array.from({length:8},(_,i)=>['x'+i,[1,1]])),f:{}};
p=H.planHealthWrites({workouts:[],diary:[]},many,on,now,today);
assert.deepEqual(p.remove.workouts,[]);assert.equal(Object.keys(p.sent.w).length,8,'kept for later');
p=H.planHealthWrites({workouts:[],diary:[]},{w:{x1:[1,1],x2:[1,1]},f:{}},on,now,today);assert.deepEqual(p.remove.workouts,['x1','x2'],'a few deletions go through');
console.log('PASS a diary that looks emptied never wipes what was saved; ordinary deletions go through');
