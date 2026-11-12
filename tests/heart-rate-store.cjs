// Workout heart rate: a series from the watch is checked (interval, length, human range; average and max recomputed),
// survives saving and loading through the stored diary shape, and is never lost when a workout is edited.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-heart-rate-store.cjs');
esbuild.buildSync({stdin:{contents:`export {heartSeries} from './frontend/domain/heartRate';export {workouts} from './frontend/data/repositories';export {getDB} from './frontend/data/store';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const set=(i,kg,reps)=>({id:'s'+i,exercise:'Bench Press',catalogId:'bench',group:0,set:i,type:'normal',kg,reps,done:true});
let state={profile:{onboarded:true,name:'Test',age:26,sex:'male',height:175,weight:70,target:70,activity:1.55,goal:'Maintain',days:4},
 sessions:[{id:'w1',name:'Push',routineId:null,date:'2026-11-12',started:1_700_000_000_000,finished:1_700_003_600_000,sets:[set(1,80,8),set(2,80,8)]},
  {id:'w2',name:'Pull',routineId:null,date:'2026-11-11',started:1_699_900_000_000,finished:1_699_903_000_000,sets:[set(1,60,10)],heartRate:{interval:15,bpm:[90,100],avg:95,max:100,source:'watch'}}],
 routines:[],folders:[],meals:[],products:[],weights:[],checkins:[],water:{},active:null},v=0,subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:next=>{state=next;v++;subs.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const {heartSeries,workouts,getDB}=require(out);

// Checking a series.
assert.deepEqual(heartSeries({interval:15,bpm:[95,120,0,168,999,'x']},'watch'),{interval:15,bpm:[95,120,0,168,0,0],avg:128,max:168,source:'watch'});
for(const bad of [null,{},{interval:0,bpm:[90]},{interval:61,bpm:[90]},{interval:1.5,bpm:[90]},{interval:15,bpm:[]},{interval:15,bpm:[0,0,999]},{interval:15,bpm:Array(2001).fill(90)},{interval:15,bpm:'90'}])
 assert.equal(heartSeries(bad,'watch'),null,JSON.stringify(bad)?.slice(0,60));
console.log('PASS heart-rate series: interval 1–60 s, at most 2000 points, readings outside 30–250 dropped, average and max recomputed');

// Loading: a stored series comes through; a workout without one has none.
assert.deepEqual(getDB().workouts.find(w=>w.id==='w2').heartRate,{interval:15,bpm:[90,100],avg:95,max:100,source:'watch'});
assert.equal(getDB().workouts.find(w=>w.id==='w1').heartRate,undefined);
// Saving: attaching one stores it in the diary document, next to the sets.
const hr=heartSeries({interval:15,bpm:[100,140,150]},'watch');
workouts.updateWorkout({...getDB().workouts.find(w=>w.id==='w1'),heartRate:hr});
assert.deepEqual(state.sessions.find(s=>s.id==='w1').heartRate,hr,'stored');
assert.equal(state.sessions.find(s=>s.id==='w1').sets.length,2,'sets untouched');
// Editing the workout later (title) keeps the series.
workouts.updateWorkout({...getDB().workouts.find(w=>w.id==='w1'),title:'Push (heavy)'});
assert.deepEqual(state.sessions.find(s=>s.id==='w1').heartRate,hr,'kept after an edit');
assert.deepEqual(getDB().workouts.find(w=>w.id==='w1').heartRate,hr,'loads back');
console.log('PASS workout heart rate: loaded from and saved to the stored diary, kept when the workout is edited');
