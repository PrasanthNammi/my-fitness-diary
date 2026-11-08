// Progress screen numbers and body storage: ranges, totals, weekly/monthly buckets, body series from weigh-ins
// and check-ins (including older text values), recovery list, and adding/removing measurements and check-ins
// in the same stored shape the older screen used.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-progress-stats.cjs');
esbuild.buildSync({stdin:{contents:`export * from './frontend/domain/progressStats';export {body} from './frontend/data/repositories';export {getDB} from './frontend/data/store';`,resolveDir:process.cwd(),loader:'ts'},loader:{'.svg':'text'},bundle:true,platform:'node',format:'cjs',outfile:out});
let state={profile:{onboarded:true,name:'Test',age:26,sex:'male',height:175,weight:70,target:70,activity:1.55,goal:'Maintain',days:4},sessions:[],routines:[],folders:[],meals:[],products:[],weights:[],checkins:[{id:'old',date:'2026-10-01',sleep:'7.5',steps:'9000',waist:'82',note:'from the older screen'}],water:{},active:null},v=0;
const listeners=new Set();const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set:next=>{state=next;v++;listeners.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const P=require(out),{body,getDB}=P;
const at=(iso,h=18)=>new Date(`${iso}T${String(h).padStart(2,'0')}:00:00`).getTime();
const set=(kg,reps)=>({id:Math.random().toString(36),type:'normal',done:true,weightKg:kg,reps,timeSec:null,distanceKm:null,rpe:null,floors:null,steps:null});
const workout=(iso,mins,kg)=>({id:iso,title:'W',routineId:null,startedAt:at(iso),endedAt:at(iso)+mins*60000,exercises:[{id:'b',exerciseId:'x',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[set(kg,10),{...set(kg,10),done:false}]}]});
const now=at('2026-11-07',20);

// Range start: 30 days ends today and includes today; "All" has no start.
assert.equal(P.rangeStart(30,now),'2026-10-09');assert.equal(P.rangeStart(0,now),null);
assert.equal(P.localISO(at('2026-11-07',0)),'2026-11-07','local date, not UTC');

const list=[workout('2026-11-06',60,100),workout('2026-11-02',45,80),workout('2026-10-20',30,50),workout('2026-06-01',50,40)];
const r30=P.workoutsInRange(list,P.rangeStart(30,now));
assert.deepEqual(r30.map(w=>w.id),['2026-10-20','2026-11-02','2026-11-06'],'in range, oldest first');
const s=P.summary(r30);assert.equal(s.workouts,3);assert.equal(s.volumeKg,(100+80+50)*10,'only completed working sets');assert.equal(s.minutes,135);

// Weekly buckets for a month, Monday starts, empty weeks kept, totals add up.
const wk=P.buckets(r30,P.rangeStart(30,now),'workouts',now);
assert.equal(wk.byMonth,false);assert.ok(wk.bars.length>=5&&wk.bars.length<=6,'about five weeks');
assert.equal(wk.bars.reduce((n,b)=>n+b.value,0),3);assert.ok(wk.bars.every(b=>new Date(b.start).getDay()===1),'weeks start on Monday');
assert.equal(wk.bars.at(-1).value,2,'this week: Mon 2 Nov and Fri 6 Nov');
const vol=P.buckets(r30,P.rangeStart(30,now),'volume',now);assert.equal(vol.bars.reduce((n,b)=>n+b.value,0),2300);
// A year groups by month; "All" starts at the first workout.
const yr=P.buckets(P.workoutsInRange(list,P.rangeStart(365,now)),P.rangeStart(365,now),'minutes',now);
assert.equal(yr.byMonth,true);assert.equal(yr.bars.reduce((n,b)=>n+b.value,0),185);
const all=P.buckets(list,null,'workouts',now);assert.equal(all.bars[0].value,1,'first month holds the first workout');
assert.equal(P.buckets([],null,'workouts',now).bars.length,1,'no workouts: one empty bucket, no crash');

// Body series: weight from weigh-ins, measurements from check-ins; older text values read as numbers.
const weights=[{id:'w2',date:'2026-11-01',kg:72.3},{id:'w1',date:'2026-10-01',kg:73}];
const checkins=[{id:'c1',date:'2026-10-05',waist:'82.5'},{id:'c2',date:'2026-11-03',waist:81},{id:'c3',date:'2026-11-04',sleep:7,energy:4},{id:'c4',date:'2026-11-05',waist:''}];
assert.deepEqual(P.bodySeries(weights,checkins,'weight',null).map(r=>r.value),[73,72.3],'oldest first');
assert.deepEqual(P.bodySeries(weights,checkins,'waist',null).map(r=>r.value),[82.5,81],'text and empty values handled');
assert.deepEqual(P.bodySeries(weights,checkins,'waist','2026-11-01').map(r=>r.id),['c2'],'range applies');
assert.deepEqual(P.recoveryCheckins(checkins,null).map(c=>c.id),['c3'],'measurement-only rows are not recovery check-ins');

// Storage: measurements and check-ins keep the older shape on the stored diary.
body.addMeasurement('2026-11-07','arms',36.5);
const arm=state.checkins.find(c=>c.arms===36.5);assert.ok(arm,'stored as its own dated row');assert.equal(arm.date,'2026-11-07');
body.saveCheckIn({date:'2026-11-07',sleep:7.5,energy:4,soreness:2,note:'legs'});
body.saveCheckIn({date:'2026-11-07',sleep:8,energy:5,soreness:1,note:''});
const today=getDB().checkins.filter(c=>c.date==='2026-11-07');
assert.equal(today.filter(c=>c.sleep!=null).length,1,'one recovery check-in per day: the second updates it');
assert.equal(today.find(c=>c.sleep!=null).sleep,8);assert.equal(today.find(c=>c.arms!=null).arms,36.5,'measurement row untouched');
// Removing the waist from the older row keeps its sleep, steps and note.
body.removeMeasurement('old','waist');
const old=state.checkins.find(c=>c.id==='old');assert.ok(old,'row kept');assert.equal(old.waist,null);assert.equal(old.note,'from the older screen');
// Deleting its recovery part leaves nothing, so the row goes.
body.deleteCheckIn('old');assert.equal(state.checkins.some(c=>c.id==='old'),false,'empty row removed');
body.removeMeasurement(arm.id,'arms');assert.equal(state.checkins.some(c=>c.id===arm.id),false,'measurement-only row removed');
// Several measurements in one row (Lovable form); empty ones left out; nothing saved when all empty; removing the row's measurements keeps its recovery values.
const n0=state.checkins.length;body.addMeasurements('2026-11-06',{});assert.equal(state.checkins.length,n0,'nothing to save');
body.addMeasurements('2026-11-06',{waist:83,hips:97.5,arms:undefined});const multi=state.checkins.find(c=>c.date==='2026-11-06'&&c.waist===83);
assert.ok(multi&&multi.hips===97.5&&!('arms' in multi),'one row, empty field left out');
body.removeMeasurements(multi.id);assert.equal(state.checkins.some(c=>c.id===multi.id),false,'measurement-only row removed');
bridge.set({...state,checkins:[...state.checkins,{id:'mix',date:'2026-10-02',sleep:'6',chest:'100',hips:'99',note:''}]});
body.removeMeasurements('mix');const kept=state.checkins.find(c=>c.id==='mix');assert.ok(kept,'row with recovery values stays');assert.ok(kept.chest==null&&kept.hips==null,'measurements cleared');assert.equal(Number(kept.sleep),6,'sleep kept');
console.log('PASS progress stats: local ranges, totals from completed sets, Monday weeks and months with empty buckets, body series from weigh-ins and check-ins (old text values), recovery list, measurements and check-ins stored in the older shape with partial removal');
