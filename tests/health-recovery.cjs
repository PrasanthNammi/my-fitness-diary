// Samsung Health recovery data (MFD 2.0): resting heart rate, HRV and sleep stages follow Health Connect on the day's
// check-in; weight and body fat become weigh-ins marked as from Samsung Health, never replacing a typed weight and
// never coming back once deleted; "usual" compares today with the days before.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-health-recovery.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/progressStats.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const P=require(out);
let n=0;const id=()=>'new-'+(++n);
const night={deep:72,light:250,rem:95,awake:18,start:1_762_900_000_000,end:1_762_927_000_000};

// Check-ins: vitals and stages added to the day's row (one row per day), follow Health Connect, invalid ignored.
const rows=[{id:'a',date:'2026-11-10',sleep:7,energy:4,note:'typed'},{id:'m',date:'2026-11-11',waist:82,note:''}];
assert.deepEqual(P.mergeHealthDays(rows,[{date:'2026-11-10',sleep:6,steps:null,restingHr:58,hrv:41.27,sleepStages:night},{date:'2026-11-11',sleep:null,steps:null,restingHr:61,hrv:null}],id),['2026-11-10','2026-11-11']);
const a=rows.find(r=>r.id==='a');assert.deepEqual([a.sleep,a.restingHr,a.hrv,a.sleepStages],[7,58,41.3,night],'typed sleep kept; vitals added');
assert.equal(rows.find(r=>r.id==='m').restingHr,undefined,'measurement rows untouched');
const fresh=rows.find(r=>r.date==='2026-11-11'&&r.id!=='m');assert.equal(fresh.restingHr,61);assert.ok(P.isRecoveryRow(fresh),'a vitals-only day is that day\'s recovery row');
assert.deepEqual(P.mergeHealthDays(rows,[{date:'2026-11-10',sleep:6,steps:null,restingHr:58,hrv:41.3,sleepStages:{...night}}],id),[],'same values: no write');
assert.deepEqual(P.mergeHealthDays(rows,[{date:'2026-11-10',sleep:null,steps:null,restingHr:57,hrv:null}],id),['2026-11-10']);assert.equal(a.restingHr,57,'follows Health Connect');
for(const bad of [{restingHr:20},{restingHr:'58'},{hrv:0},{hrv:400},{sleepStages:{...night,end:night.start}},{sleepStages:{...night,deep:-1}},{sleepStages:{...night,end:night.start+2*86_400_000}},{sleepStages:'x'}])
 assert.deepEqual(P.mergeHealthDays(rows,[{date:'2026-11-10',sleep:null,steps:null,...bad}],id),[],JSON.stringify(bad));
console.log('PASS recovery vitals: resting heart rate, HRV and sleep stages follow Health Connect on the day\'s row; typed sleep and measurements kept; invalid ignored');

// Weigh-ins.
const w=[{id:'t',date:'2026-11-09',kg:80.4},{id:'h',date:'2026-11-10',kg:80.1,source:'health'}];
const days=[{date:'2026-11-09',weightKg:79,bodyFat:18.24},{date:'2026-11-10',weightKg:79.85},{date:'2026-11-11',weightKg:79.6,bodyFat:18.1},{date:'2026-11-12',weightKg:500},{date:'2026-11-13',weightKg:null,bodyFat:18}];
assert.deepEqual(P.mergeHealthWeights(w,days,id),['2026-11-09','2026-11-10','2026-11-11']);
assert.deepEqual(w.map(x=>[x.date,x.kg,x.source??null,x.bodyFat??null]),[['2026-11-09',80.4,null,18.2],['2026-11-10',79.85,'health',null],['2026-11-11',79.6,'health',18.1]],'typed weight kept (body fat added); Samsung Health one follows; new day added; invalid and body-fat-only days skipped');
assert.deepEqual(P.mergeHealthWeights(w,days,id),[],'same values: no write');
const w2=[];assert.deepEqual(P.mergeHealthWeights(w2,[{date:'2026-11-11',weightKg:79.6}],id,['2026-11-11']),[]);assert.equal(w2.length,0,'a deleted Samsung Health day is not added back');
console.log('PASS weigh-ins from Samsung Health: added and followed, typed weights never replaced, deleted days stay deleted');

// Today against the days before.
assert.deepEqual(P.vsUsual([58,60,59,61,60,59,60]),{usual:60,state:'normal'});
assert.deepEqual(P.vsUsual([58,60,59,61,60,59,66]),{usual:60,state:'higher'});
assert.deepEqual(P.vsUsual([40,42,44,41,30]),{usual:42,state:'lower'});
assert.equal(P.vsUsual([60,61]),null,'needs a few days');
console.log('PASS usual: within 5 % of the previous days is normal, else higher or lower');

// Through the diary: a weight typed over a Samsung Health one becomes the person's; deleting one remembers the day.
const out2=path.join(os.tmpdir(),'mfd-health-recovery-store.cjs');
esbuild.buildSync({stdin:{contents:`export {body} from './frontend/data/repositories';export {getDB} from './frontend/data/store';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out2,logLevel:'silent'});
let state={profile:{onboarded:true,name:'T',age:30,sex:'male',height:175,weight:80,target:78,activity:1.55,goal:'Maintain',days:4},sessions:[],routines:[],folders:[],meals:[],products:[],checkins:[],water:{},active:null,
 weights:[{id:'h1',date:'2026-11-10',kg:80.1,source:'health'},{id:'h2',date:'2026-11-11',kg:79.9,source:'health',bodyFat:18}]},v=0;const subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'s',email:'t@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:nx=>{state=nx;v++;subs.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const S=require(out2);
S.body.logWeight('2026-11-10',80.5);assert.deepEqual(state.weights.find(x=>x.id==='h1'),{id:'h1',date:'2026-11-10',kg:80.5},'typed: no longer Samsung Health\'s');
S.body.deleteWeight('h2');assert.deepEqual(state.mfdSettings.healthWeightSkip,['2026-11-11']);
assert.equal(S.body.mergeHealth([{date:'2026-11-10',sleep:null,steps:null,weightKg:79},{date:'2026-11-11',sleep:null,steps:null,weightKg:79.9}]),0,'neither comes back');
assert.equal(S.body.mergeHealth([{date:'2026-11-12',sleep:null,steps:9000,weightKg:79.7,restingHr:57}]),2);assert.equal(state.weights.at(-1).source,'health');assert.equal(state.checkins[0].restingHr,57);
console.log('PASS diary: a typed weight replaces Samsung Health\'s, a deleted one is remembered, new days come in');
// A check-in saved with Health Connect's sleep unchanged keeps it Health Connect's (it can still be corrected);
// changed, the hours are the person's and never replaced.
S.body.mergeHealth([{date:'2026-11-13',sleep:6.8,steps:null}]);
S.body.saveCheckIn({date:'2026-11-13',sleep:6.8,energy:4,soreness:2,note:''});
assert.equal(state.checkins.find(c=>c.date==='2026-11-13').sleepSource,'health','unchanged: still from Health Connect');
S.body.mergeHealth([{date:'2026-11-13',sleep:7.1,steps:null}]);assert.equal(state.checkins.find(c=>c.date==='2026-11-13').sleep,7.1,'corrected');
S.body.saveCheckIn({date:'2026-11-13',sleep:8,energy:4,soreness:2,note:''});
assert.equal(state.checkins.find(c=>c.date==='2026-11-13').sleepSource,undefined,'changed by hand');
S.body.mergeHealth([{date:'2026-11-13',sleep:7.1,steps:null}]);assert.equal(state.checkins.find(c=>c.date==='2026-11-13').sleep,8,'kept');
console.log('PASS check-ins: sleep left as Health Connect gave it can still be corrected; changed by hand it is kept');
