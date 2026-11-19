// Hevy-like warning on unlikely logged values (frontend/domain/unusual.ts): weight more than 1.5x the recent best
// and at least 10 kg more; reps above 100, or 20+ and more than 3x the usual. Warm-ups and old workouts don't count;
// "It's right" (unusualOk) and unticked sets never warn.
const assert=require('node:assert/strict'),esbuild=require('esbuild'),fs=require('fs'),os=require('os'),path=require('path');
const out=path.join(fs.realpathSync(os.tmpdir()),'mfd-unusual.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/unusual.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const U=require(out);fs.rmSync(out,{force:true});
const set=(kg,reps,extra={})=>({id:Math.random().toString(36),type:'normal',weightKg:kg,reps,timeSec:null,distanceKm:null,rpe:null,done:true,...extra});
const w=(n,ex,sets)=>({id:'w'+n,title:'',routineId:null,startedAt:n,endedAt:n,exercises:[{id:'b'+n,exerciseId:ex,tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets}]});
const history=[w(1,'curl',[set(30,10)]), // older than the last 5 workouts with curls: ignored
 ...[2,3,4,5,6].map(n=>w(n,'curl',[set(40,5,{type:'warmup'}),set(10,10),set(10,8)])),w(7,'bench',[set(100,5)])];
const best=U.recentBest(history,'curl');
assert.deepEqual(best,{kg:10,reps:10,usualReps:10});
const odd=(s,b=best,t='weight_reps')=>U.unusualSet(s,t,b);
assert.deepEqual(odd(set(28,8)),{field:'weightKg',value:28},'10 -> 28 warns');
assert.equal(odd(set(15,8)),null,'15 is only +5 kg');
assert.equal(odd(set(28,8,{done:false})),null,'not logged yet');
assert.equal(odd(set(28,8,{unusualOk:true})),null,'confirmed');
assert.equal(odd(set(28,8),best,'assisted_bodyweight'),null,'assistance weight is not checked');
const bench=U.recentBest(history,'bench');
assert.equal(odd(set(120,5),bench),null,'100 -> 120 does not warn');
assert.deepEqual(odd(set(160,5),bench),{field:'weightKg',value:160});
assert.deepEqual(odd(set(10,100+1)),{field:'reps',value:101});
assert.deepEqual(odd(set(10,31)),{field:'reps',value:31},'3x the usual 10');
assert.equal(odd(set(10,25)),null);
assert.equal(odd(set(500,8),U.recentBest([],'curl')),null,'no history: nothing to compare');
console.log('PASS unusual sets: big weight jumps and odd reps warn; small changes, warm-ups, old workouts, confirmed or unticked sets do not');
