// Cycle "Right now" pause: cycles that overlap a past pause are left out of the estimate; after a pause ends, the
// estimate restarts only once a period is logged on or after that day; without a pause nothing changes.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-cycle-pause.cjs');
esbuild.buildSync({stdin:{contents:`export {estimateNext,lengthsOutsidePause} from './frontend/domain/cyclePredict';export {cycleLengths} from './frontend/domain/cycle';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const M=require(out);
const add=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
const days=[];const period=(start,len=4)=>{for(let i=0;i<len;i++)days.push({id:add(start,i),date:add(start,i),bleeding:'period'})};
// Own cycles of 30 days from Jan; on the pill from 1 Apr (withdrawal bleeds every 28 days); stopped 1 Aug; first period after on 20 Aug.
let d='2026-01-01';for(let i=0;i<4;i++){period(d);d=add(d,30)}           // Jan 1, Jan 31, Mar 2, Apr 1
for(let x='2026-04-29';x<'2026-08-01';x=add(x,28))period(x);              // withdrawal bleeds
const pause={since:'2026-04-01',until:'2026-08-01'};
const all=M.cycleLengths(days);assert.ok(all.includes(28),'the pill bleeds would count as 28-day cycles');
const kept=M.lengthsOutsidePause(days,pause);assert.deepEqual(kept,[30,30,30],'only the own cycles before the pause are kept');
// After the pause, before a new period: no estimate, it says it restarts.
let e=M.estimateNext(days,'2026-08-10',pause);assert.equal(e.state,'insufficient');assert.equal(e.restart,true);assert.match(e.about[0],/Estimates start again/);
// First period after: estimates come back (3 own cycles before the pause), from the new period.
period('2026-08-20');e=M.estimateNext(days,'2026-08-25',pause);assert.equal(e.state,'range');assert.ok(e.from>'2026-09-10'&&e.from<'2026-09-25',e.from);
assert.ok(!M.lengthsOutsidePause(days,pause).some(x=>x===28),'the cycle across the pause stays out');
// Without a pause: the same as before.
assert.deepEqual(M.lengthsOutsidePause(days,undefined),M.cycleLengths(days));assert.deepEqual(M.lengthsOutsidePause(days,{since:'2026-04-01'}),M.cycleLengths(days),'still paused: nothing left out here (the screen hides the estimate)');
assert.notEqual(M.estimateNext(days,'2026-08-25').state,'insufficient');
console.log('PASS cycle pause: paused cycles left out (pill bleeds), restart only after the next period, no change without a pause');
