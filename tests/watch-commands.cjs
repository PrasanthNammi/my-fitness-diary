// Watch commands on the running workout: same rules as the phone's workout screen, and anything invalid or for
// another workout changes nothing.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-watch-commands.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/watchCommands.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const W=require(out);
let n=0;const newId=()=>'n'+(++n);
const set=(id,extra={})=>({id,type:'normal',weightKg:null,reps:null,timeSec:null,distanceKm:null,floors:null,steps:null,rpe:null,done:false,suggested:{weightKg:80,reps:8,timeSec:null,distanceKm:null},...extra});
const fresh=()=>({id:'w1',title:'Push',routineId:'r1',startedAt:0,
 exercises:[{id:'b1',exerciseId:'bench',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[set('s1',{type:'warmup',suggested:{weightKg:40,reps:10}}),set('s2'),set('s3')]},
  {id:'b2',exerciseId:'ohp',tracking:'weight_reps',restSec:60,note:'',supersetId:null,sets:[set('t1')]},
  {id:'b3',exerciseId:'plank',tracking:'time',restSec:0,note:'',supersetId:null,sets:[set('p1',{suggested:{timeSec:60}})]}],
 timers:{b1:{durationSec:90,endsAt:null,pausedRemainingSec:null},b2:{durationSec:60,endsAt:null,pausedRemainingSec:null},b3:{durationSec:0,endsAt:null,pausedRemainingSec:null}}});
const history=[{id:'old',title:'Push',routineId:'r1',startedAt:0,endedAt:1,exercises:[{id:'x',exerciseId:'ohp',tracking:'weight_reps',restSec:60,note:'',supersetId:null,sets:[{...set('o1'),weightKg:45,reps:6,done:true,suggested:undefined}]}]}];
const ctx={history,now:1_000_000,newId,exercise:id=>({bench:{id:'bench',tracking:'weight_reps'},curl:{id:'curl',tracking:'weight_reps'},run:{id:'run',tracking:'distance_time'}})[id]??null,defaultRestSec:120};
const C=(type,extra={})=>({v:1,id:'c'+(++n),type,workoutId:'w1',...extra});
const ok=(a,c)=>W.applyWorkoutCommand(a,c,ctx);

let a=fresh();
// logSet: typed values win, else faded targets, else last session; the rest timer starts.
assert.ok(ok(a,C('logSet',{block:'b1',set:'s2',values:{weightKg:82.5}})));
assert.deepEqual([a.exercises[0].sets[1].weightKg,a.exercises[0].sets[1].reps,a.exercises[0].sets[1].done],[82.5,8,true]);
assert.equal(a.timers.b1.endsAt,ctx.now+90000,'rest timer started');
a.exercises[1].sets[0].suggested={};assert.ok(ok(a,C('logSet',{block:'b2',set:'t1'})));
assert.deepEqual([a.exercises[1].sets[0].weightKg,a.exercises[1].sets[0].reps],[45,6],'from the previous session');
assert.ok(ok(a,C('logSet',{block:'b3',set:'p1'})));assert.equal(a.timers.b3.endsAt,null,'no rest timer when rest is off');
assert.ok(!ok(a,C('logSet',{block:'b1',set:'s2'})),'already logged');
const empty=fresh();empty.exercises[0].sets[2].suggested={};assert.ok(!ok(empty,C('logSet',{block:'b1',set:'s3'})),'nothing to log');assert.equal(empty.exercises[0].sets[2].done,false);
// updateSet / unlogSet / setType
assert.ok(ok(a,C('updateSet',{block:'b1',set:'s2',values:{weightKg:85,reps:7}})));assert.deepEqual([a.exercises[0].sets[1].weightKg,a.exercises[0].sets[1].reps,a.exercises[0].sets[1].done],[85,7,true]);
for(const bad of [{weightKg:-1},{reps:2.5},{weightKg:'80'},{reps:1e6},{}])assert.ok(!ok(a,C('updateSet',{block:'b1',set:'s2',values:bad})),JSON.stringify(bad));
assert.ok(ok(a,C('unlogSet',{block:'b1',set:'s2'})));assert.equal(a.exercises[0].sets[1].done,false);
assert.ok(ok(a,C('setType',{block:'b1',set:'s3',setType:'failure'})));assert.equal(a.exercises[0].sets[2].type,'failure');
assert.ok(!ok(a,C('setType',{block:'b1',set:'s3',setType:'mega'})));
// addSet copies the last set's values as faded targets; removeSet keeps at least one.
assert.ok(ok(a,C('addSet',{block:'b1'})));const added=a.exercises[0].sets.at(-1);assert.deepEqual([added.type,added.done,added.weightKg,added.suggested.weightKg,added.suggested.reps],['normal',false,null,80,8]);
assert.ok(ok(a,C('removeSet',{block:'b1',set:added.id})));assert.equal(a.exercises[0].sets.length,3);
assert.ok(ok(a,C('addSet',{block:'b1',newSet:'watch-abc12345'})));assert.equal(a.exercises[0].sets.at(-1).id,'watch-abc12345','the watch names the new set');
assert.ok(ok(a,C('addSet',{block:'b1',newSet:'watch-abc12345'})));assert.notEqual(a.exercises[0].sets.at(-1).id,'watch-abc12345','an id already used gets a fresh one');
a.exercises[0].sets.splice(3);
assert.ok(!ok(a,C('removeSet',{block:'b2',set:'t1'})),'last set stays');
// Rest ±15 s and skip.
a.timers.b1={durationSec:90,endsAt:ctx.now+30000,pausedRemainingSec:null};
assert.ok(ok(a,C('restAdjust',{block:'b1',sec:15})));assert.equal(a.timers.b1.endsAt,ctx.now+45000);
assert.ok(ok(a,C('restAdjust',{block:'b1',sec:-15})));assert.equal(a.timers.b1.endsAt,ctx.now+30000);
assert.ok(!ok(a,C('restAdjust',{block:'b1',sec:30})),'only ±15');
assert.ok(ok(a,C('restSkip',{block:'b1'})));assert.equal(a.timers.b1.endsAt,null);assert.ok(!ok(a,C('restSkip',{block:'b1'})),'nothing running');
// Exercises: add (with default rest, 3 sets), into a superset, move, superset with next, leave, remove.
assert.ok(ok(a,C('addExercise',{exercise:'curl'})));const curl=a.exercises.at(-1);assert.deepEqual([curl.exerciseId,curl.restSec,curl.sets.length,!!a.timers[curl.id]],['curl',120,3,true]);
assert.ok(ok(a,C('addExercise',{exercise:'run',sets:1})));assert.equal(a.exercises.at(-1).restSec,0,'distance has no rest');
assert.ok(!ok(a,C('addExercise',{exercise:'unknown'})));
assert.ok(ok(a,C('addExercise',{exercise:'curl',sets:2,newBlock:'watch-blk-0001',newSets:['watch-set-0001','watch-set-0002']})));assert.deepEqual([a.exercises.at(-1).id,...a.exercises.at(-1).sets.map(x=>x.id)],['watch-blk-0001','watch-set-0001','watch-set-0002'],'the watch names a new exercise and its sets');
assert.ok(ok(a,C('addExercise',{exercise:'curl',sets:1,newBlock:'watch-blk-0001',newSets:['bad id!']})));assert.ok(a.exercises.at(-1).id!=='watch-blk-0001'&&a.exercises.at(-1).sets[0].id!=='bad id!','taken or invalid ids get fresh ones');
a.exercises.splice(-2);
assert.ok(ok(a,C('addExercise',{exercise:'curl',supersetWith:'b1'})));assert.equal(a.exercises[1].exerciseId,'curl','placed right after its superset partner');assert.equal(a.exercises[0].supersetId,a.exercises[1].supersetId);
assert.ok(ok(a,C('unsuperset',{block:a.exercises[1].id})));assert.equal(a.exercises[0].supersetId,null,'a superset of one is dissolved');
assert.ok(ok(a,C('moveExercise',{block:'b1',dir:1})));assert.equal(a.exercises[1].id,'b1');assert.ok(!ok(a,C('moveExercise',{block:a.exercises[0].id,dir:-1})),'already first');
assert.ok(ok(a,C('superset',{block:'b1'})));assert.ok(a.exercises[1].supersetId&&a.exercises[1].supersetId===a.exercises[2].supersetId);
assert.ok(ok(a,C('removeExercise',{block:'b2'})));assert.ok(!a.exercises.some(x=>x.id==='b2'));assert.equal(a.timers.b2,undefined);
// Another workout, unknown command, missing ids: nothing changes.
const before=JSON.stringify(a);
for(const c of [{...C('logSet',{block:'b1',set:'s3'}),workoutId:'other'},C('explode',{block:'b1'}),C('logSet',{block:'nope',set:'s1'}),C('setType',{block:'b1',set:'nope',setType:'drop'}),C('moveExercise',{block:'b1',dir:5})])assert.ok(!ok(a,c),c.type);
assert.equal(JSON.stringify(a),before);
console.log('PASS watch commands: log (typed, faded or previous values; rest timer), edit, unlog, set types, add/remove sets, rest ±15 s and skip, add/move/remove exercises and supersets; invalid or foreign commands change nothing');
