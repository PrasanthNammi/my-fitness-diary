// Recovery page, Progress card and Overview card data: one row per day from the day's recovery check-in (text
// numbers from older entries read, measurement rows left out), every day of a range, history newest first in steps
// of 3, 7, 30, 90 and all, and a day against the 6 days before it.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-recovery-stats.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/recoveryStats.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const R=require(out);
const st={deep:80,light:240,rem:100,awake:20,start:1,end:2};
const rows=[
 {id:'m',date:'2026-11-10',waist:82,note:''},
 {id:'a',date:'2026-11-10',sleep:'7.5',steps:9000,restingHr:60,hrv:40,energy:4,soreness:2,note:' felt ok ',sleepStages:st},
 ...[4,5,6,7,8,9].map(d=>({id:'d'+d,date:`2026-11-0${d}`,sleep:7,steps:8000,restingHr:60,hrv:44,note:''})),
 {id:'n',date:'2026-11-11',restingHr:66,note:''},
];
assert.deepEqual(R.recoveryDay(rows,'2026-11-10'),{date:'2026-11-10',sleep:7.5,stages:st,steps:9000,restingHr:60,hrv:40,energy:4,soreness:2,note:'felt ok'},'text numbers read; the measurement row is not recovery');
assert.equal(R.recoveryDay(rows,'2026-11-12'),null);
assert.deepEqual(R.recoveryRange(rows,'2026-11-09','2026-11-12').map(x=>[x.date,!!x.day]),[['2026-11-09',true],['2026-11-10',true],['2026-11-11',true],['2026-11-12',false]],'every day, across month ends too');
assert.deepEqual(R.recoveryRange(rows,'2026-10-30','2026-11-02').map(x=>x.date),['2026-10-30','2026-10-31','2026-11-01','2026-11-02']);
console.log('PASS recovery days: one per day from the recovery check-in, older text numbers, every day of a range');

// History: newest first, limited, in steps.
assert.deepEqual(R.recoveryHistory(rows).map(d=>d.date),['2026-11-11','2026-11-10','2026-11-09','2026-11-08','2026-11-07','2026-11-06','2026-11-05','2026-11-04']);
assert.deepEqual(R.recoveryHistory(rows,3).map(d=>d.date),['2026-11-11','2026-11-10','2026-11-09']);
assert.deepEqual([...R.HISTORY_STEPS],[3,7,30,90,Infinity]);
console.log('PASS recovery history: newest first, shown 3, then 7, 30, 90 and all');

// Against the 6 days before (exact average as usual).
assert.deepEqual(R.compared(rows,'2026-11-10','hrv'),{value:40,usual:44,state:'lower'});
assert.deepEqual(R.compared(rows,'2026-11-10','sleep'),{value:7.5,usual:7,state:'higher'});
assert.deepEqual(R.compared(rows,'2026-11-10','restingHr'),{value:60,usual:60,state:'normal'});
assert.equal(R.compared(rows,'2026-11-12','hrv'),null,'no value that day');
assert.deepEqual(R.compared(rows,'2026-11-05','hrv'),{value:44,usual:null,state:null},'too few days before');
assert.equal(R.hm(7.25),'7h 15m');assert.equal(R.average([1,null,3]),2);assert.equal(R.average([null]),null);
console.log('PASS usual: a day against the 6 days before it (normal within 5 %), with the exact average');
