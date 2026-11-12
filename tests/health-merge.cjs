// Health Connect → recovery check-ins: steps follow Health Connect, sleep only fills empty days (hand-entered or
// adjusted hours are never replaced), measurement rows are left alone, invalid values ignored, no change = no write.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-health-merge.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/progressStats.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const P=require(out);
let n=0;const id=()=>'new-'+(++n);
const rows=[
 {id:'a',date:'2026-11-06',sleep:6.5,energy:4,soreness:2,note:'typed by hand'},
 {id:'m',date:'2026-11-07',waist:82,note:''},              // measurements only
 {id:'b',date:'2026-11-08',steps:3000,note:''},             // steps from an earlier sync
];
const changed=P.mergeHealthDays(rows,[
 {date:'2026-11-06',sleep:7.9,steps:10234},  // sleep typed: kept; steps added
 {date:'2026-11-07',sleep:7.24,steps:null},  // new recovery row beside the measurement row
 {date:'2026-11-08',sleep:null,steps:8800},  // steps updated
 {date:'2026-11-09',sleep:null,steps:null},  // nothing: no row
 {date:'2026-11-10',sleep:0.2,steps:0},      // nap and zero: ignored
 {date:'2026-11-11',sleep:40,steps:999999},  // impossible: ignored
 {date:'bad',sleep:7,steps:100},{},null,
],id);
assert.deepEqual(changed,['2026-11-06','2026-11-07','2026-11-08']);
assert.deepEqual(rows.find(r=>r.id==='a'),{id:'a',date:'2026-11-06',sleep:6.5,energy:4,soreness:2,note:'typed by hand',steps:10234});
assert.deepEqual(rows.find(r=>r.id==='m'),{id:'m',date:'2026-11-07',waist:82,note:''},'measurement row untouched');
assert.deepEqual(rows.find(r=>r.id==='new-1'),{id:'new-1',date:'2026-11-07',note:'',sleep:7.2});
assert.equal(rows.find(r=>r.id==='b').steps,8800);
assert.equal(rows.length,4,'no rows for empty or invalid days');
assert.deepEqual(rows.map(r=>r.date),[...rows.map(r=>r.date)].sort(),'kept in date order');
// The same data again changes nothing (so nothing is written or synced).
assert.deepEqual(P.mergeHealthDays(rows,[{date:'2026-11-06',sleep:7.9,steps:10234},{date:'2026-11-07',sleep:8,steps:null},{date:'2026-11-08',sleep:null,steps:8800}],id),[]);
// A later night: sleep fills the day once, then stays as entered.
const later=P.mergeHealthDays(rows,[{date:'2026-11-08',sleep:6.8,steps:8800}],id);assert.deepEqual(later,['2026-11-08']);assert.equal(rows.find(r=>r.id==='b').sleep,6.8);
rows.find(r=>r.id==='b').sleep=7.5; // adjusted by hand
assert.deepEqual(P.mergeHealthDays(rows,[{date:'2026-11-08',sleep:6.8,steps:8800}],id),[]);assert.equal(rows.find(r=>r.id==='b').sleep,7.5);
// Rows with only steps count as recovery check-ins (shown in the list, found by Save).
assert.ok(P.isRecoveryRow({id:'s',date:'2026-11-01',steps:5}));assert.ok(!P.isRecoveryRow({id:'w',date:'2026-11-01',waist:80,note:''}));
console.log('PASS Health Connect merge: steps follow Health Connect, sleep fills empty days only, hand-entered values kept, measurements untouched, invalid values ignored, repeats change nothing');
