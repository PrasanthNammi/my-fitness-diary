// Workout heart-rate screens: zones (220 − age), time in zones, calories estimate, when each exercise was done
// (from set times, which survive saving and come from the watch's own clock), and Health Connect readings that are
// only used when dense enough to draw.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-heart-rate-summary.cjs');
esbuild.buildSync({stdin:{contents:`export * from './frontend/domain/heartRate';export {applyWorkoutCommand} from './frontend/domain/watchCommands';export {toDB,fromDB} from './frontend/adapters/compat';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
global.window={addEventListener(){}};
const H=require(out);

// Zones and time in zones.
assert.equal(H.maxHeartRate(26),194);assert.equal(H.maxHeartRate(null),190);assert.equal(H.maxHeartRate(5),207,'age kept in a sensible range');
assert.deepEqual([60,97,117,136,156,175,190].map(b=>H.zoneIndex(b,194)),[0,0,1,2,3,4,4]);
const hr=H.heartSeries({interval:15,bpm:[100,120,0,140,160,180]},'watch');
assert.deepEqual(H.zoneSeconds(hr,194),[15,15,15,15,15],'gaps not counted');
assert.deepEqual(H.heartPoints(hr).map(p=>p.t),[7.5,22.5,52.5,67.5,82.5]);
assert.deepEqual(H.heartBetween(hr,15,60),{avg:130,max:140});assert.equal(H.heartBetween(hr,30,45),null);
console.log('PASS heart-rate zones: 220 − age, five zones, time in each, gaps left out');

// Calories (Keytel 2005): needs weight and age.
assert.equal(H.estimateKcal(130,60,80,30,'male'),Math.round((-55.0969+0.6309*130+0.1988*80+0.2017*30)/4.184*60));
assert.ok(H.estimateKcal(130,60,60,30,'female')<H.estimateKcal(130,60,80,30,'male'));
assert.equal(H.estimateKcal(130,60,null,30,'male'),null);assert.equal(H.estimateKcal(40,1,50,20,'female'),0,'never negative');
console.log('PASS calorie estimate from heart rate, weight, age and sex');

// When each exercise was done.
const T0=1_700_000_000_000,s=(id,at)=>({id,type:'normal',weightKg:80,reps:8,timeSec:null,distanceKm:null,rpe:null,done:true,...(at===undefined?{}:{doneAt:T0+at*1000})});
const w={startedAt:T0,endedAt:T0+1800_000,exercises:[
 {id:'b1',exerciseId:'bench',sets:[s('a',120),s('b',300),s('c',480)]},
 {id:'b2',exerciseId:'row',sets:[s('d',700),s('e',900)]},{id:'b3',exerciseId:'curl',sets:[s('f',1000),s('g',1200)]},{id:'b4',exerciseId:'dip',sets:[s('h',1100),s('i',1300)]},
 {id:'b5',exerciseId:'old',sets:[s('j'),s('k',-5),s('l',99999)]}]};
assert.deepEqual(H.exerciseSections(w),[{exerciseId:'bench',start:0,end:480},{exerciseId:'row',start:480,end:900},{exerciseId:'curl',start:900,end:1000},{exerciseId:'dip',start:1000,end:1100},{exerciseId:'curl',start:1100,end:1200},{exerciseId:'dip',start:1200,end:1300}],'superset alternates; sets without a time (or outside the workout) ignored');
assert.deepEqual(H.exerciseSections({...w,exercises:[{exerciseId:'x',sets:[s('z')]}]}),[]);
console.log('PASS exercise sections from set times, supersets alternate, old workouts have none');

// Set times: from the watch's clock (within the workout), removed when unlogged, kept through save and load.
const a={id:'w1',title:'Push',routineId:null,startedAt:T0,exercises:[{id:'b1',exerciseId:'bench',tracking:'weight_reps',restSec:0,note:'',supersetId:null,sets:[{...s('a'),done:false},{...s('b'),done:false}]}],timers:{}};
const ctx={history:[],now:T0+600_000,newId:()=>'n1',exercise:()=>null,defaultRestSec:90};
assert.ok(H.applyWorkoutCommand(a,{v:1,id:'c1',type:'logSet',workoutId:'w1',block:'b1',set:'a',at:T0+300_000},ctx));assert.equal(a.exercises[0].sets[0].doneAt,T0+300_000,'watch time');
assert.ok(H.applyWorkoutCommand(a,{v:1,id:'c2',type:'logSet',workoutId:'w1',block:'b1',set:'b',at:T0+9e9},ctx));assert.equal(a.exercises[0].sets[1].doneAt,ctx.now,'a time in the future is not trusted');
assert.ok(H.applyWorkoutCommand(a,{v:1,id:'c3',type:'unlogSet',workoutId:'w1',block:'b1',set:'b'},ctx));assert.equal(a.exercises[0].sets[1].doneAt,undefined);
const workout={id:'w1',title:'Push',routineId:null,startedAt:T0,endedAt:T0+1800_000,exercises:a.exercises.map(b=>({...b,sets:[b.sets[0]]})),heartRate:hr};
const legacy=H.fromDB({workouts:[workout],customExercises:[]},{sessions:[]},new Set(['workouts']));
assert.equal(legacy.sessions[0].sets[0].mfdDoneAt,T0+300_000,'stored');
const back=H.toDB({state:{profile:{},sessions:legacy.sessions,routines:[],meals:[],weights:[],checkins:[],water:{}},user:null},{exercises:[],foods:[]});
assert.equal(back.workouts[0].exercises[0].sets[0].doneAt,T0+300_000,'loaded back');assert.deepEqual(back.workouts[0].heartRate,hr);
console.log('PASS set times: from the watch (never in the future), cleared on unlog, kept through save and load');

// Health Connect readings ([seconds, bpm]): used when they cover at least half the minutes.
const dense=Array.from({length:120},(_,i)=>[i*5,100+(i%10)]);   // 10 minutes, every 5 s
const series=H.seriesFromSamples(dense,600);
assert.equal(series.source,'health');assert.equal(series.interval,15);assert.equal(series.bpm.length,41);assert.equal(series.max,108,'15 s steps are averages');
assert.equal(H.seriesFromSamples([[0,80],[300,85],[599,90]],600),null,'all-day readings every few minutes are too sparse');
assert.equal(H.seriesFromSamples([[0,'x'],[5,999],[-5,90]],600),null);assert.equal(H.seriesFromSamples(null,600),null);
console.log('PASS Health Connect workout readings: dense ones become a 15 s series, sparse or invalid ones are ignored');
