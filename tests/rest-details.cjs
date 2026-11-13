// The rest notification's "Next: …": the next set of this exercise with its weight and reps (typed, else the faded
// target), the superset partner's next set, the next exercise, or the last set.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-rest-details.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/restDetails.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const {restNext}=require(out);
const set=(done,extra={})=>({id:Math.random().toString(36).slice(2),type:'normal',weightKg:null,reps:null,timeSec:null,distanceKm:null,rpe:null,done,...extra});
const blk=(id,ex,sets,extra={})=>({id,exerciseId:ex,tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets,...extra});
const names={rdl:'Romanian Deadlift',curl:'Leg Curl',plank:'Plank',calf:'Calf Raise'},name=id=>names[id];
const a={id:'w',title:'Lower',routineId:null,startedAt:0,timers:{},exercises:[
 blk('b1','rdl',[set(true,{weightKg:85,reps:6}),set(false,{suggested:{weightKg:89,reps:6}}),set(false)]),
 blk('b2','curl',[set(true),set(false,{weightKg:40,reps:10})],{supersetId:'s'}),blk('b3','calf',[set(true),set(false,{reps:15})],{supersetId:'s'}),
 blk('b4','plank',[set(true)],{tracking:'time'}),blk('b5','calf',[set(false)])]};
assert.equal(restNext(a,'b1','kg',name),'Next: Set 2 of 3 · 89 kg × 6','the faded target when nothing is typed');
assert.match(restNext(a,'b1','lb',name),/^Next: Set 2 of 3 · 196\.2\d? lb × 6$/,'in the chosen unit');
assert.equal(restNext(a,'b2','kg',name),'Next: Calf Raise · Set 2 of 2 · 15 reps','superset partner next');
assert.equal(restNext(a,'b3','kg',name),'Next: Leg Curl · Set 2 of 2 · 40 kg × 10','wraps round the superset');
assert.equal(restNext(a,'b4','kg',name),'Next: Calf Raise','next exercise with sets to do');
assert.equal(restNext({...a,exercises:[a.exercises[3]]},'b4','kg',name),'Last set done');
assert.equal(restNext(a,'nope','kg',name),null);
console.log('PASS rest notification next: next set with weight and reps, superset partner, next exercise, last set');
