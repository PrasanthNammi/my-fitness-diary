// Cycles from daily logs (frontend/domain/cycle.ts): a cycle starts only on a period's first day (spotting,
// withdrawal bleeding and "not sure" never start one); cycle length and period length are different things; days
// without a log are unknown; the calendar marks only what was recorded.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-cycle-domain.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/cycle.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const C=require(out);
const add=(d,n)=>C.addDays(d,n),P=(d,b='period')=>({id:d,date:d,bleeding:b});
const run=(start,len)=>Array.from({length:len},(_,i)=>P(add(start,i)));
// Cycles of 34 and 41 days, periods of 5, 6 (with an unlogged day inside) and 4 days.
const days=[...run('2026-08-12',5),P('2026-08-20','spotting'),...run('2026-09-15',3),...run('2026-09-19',2),P('2026-10-01','withdrawal'),...run('2026-10-26',4),P('2026-11-10','spotting')];
assert.deepEqual(C.periods(days).map(p=>[p.start,p.length]),[['2026-08-12',5],['2026-09-15',6],['2026-10-26',4]],'periods; spotting and withdrawal never start one');
assert.deepEqual(C.cycleLengths(days),[34,41],'cycle length = first day to next first day');
const now=C.cycleNow(days,'2026-11-23');
assert.equal(now.day,29);assert.equal(now.lastStart,'2026-10-26');assert.deepEqual([now.shortest,now.longest,now.median],[34,41,37.5]);
assert.deepEqual(C.cycleNow([],'2026-11-23'),{day:null,lastStart:null,lastPeriod:null,lengths:[],shortest:null,longest:null,median:null},'nothing logged: unknown');
assert.equal(C.cycleNow(days,'2026-09-01').day,21,'only days up to today count');
assert.equal(C.cycleNow([...run('2026-11-01',3),...run('2026-11-09',2)],'2026-11-23').lengths.length,0,'bleeding again within 7 days is the same period, not a new cycle');
console.log('PASS cycles: started only by a period, lengths start to start, period length separate, unlogged days unknown');
assert.equal(C.dayMark(undefined),null,'not logged');assert.equal(C.dayMark(P('d')),'period');assert.equal(C.dayMark(P('d','spotting')),'spotting');
assert.equal(C.dayMark(P('d','withdrawal')),'other-bleed');assert.equal(C.dayMark({date:'d',nothing:true}),'nothing');
assert.equal(C.dayMark({date:'d',symptoms:{Acne:1}}),'symptoms');assert.equal(C.dayMark({date:'d',mood:3}),'logged');
console.log('PASS calendar marks: period, spotting, other bleeding, symptoms, nothing to note, logged; nothing for unlogged days');
