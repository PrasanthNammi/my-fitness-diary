// Week start (Settings → Units): every weekly calculation follows it — Monday (default), Sunday or Saturday.
// Date strip / calendars use the same daysIntoWeek; this covers the numbers: last-week recap, weekly bars,
// muscle weeks, food week, friends' week minutes and streak, and the weekday names.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-week-start.cjs');
esbuild.buildSync({stdin:{contents:`export * as W from './frontend/domain/week';export * as R from './frontend/domain/weeklyRecap';export * as P from './frontend/domain/progressStats';export * as M from './frontend/domain/muscleStats';export * as S from './frontend/domain/socialStats';export {foodPeriod} from './frontend/domain/foodSummary';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const {W,R,P,M,S,foodPeriod}=require(out);
const at=(iso,h=12)=>new Date(`${iso}T${String(h).padStart(2,'0')}:00:00`).getTime();
const iso=t=>{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const wk=(day,mins)=>({id:day,title:'W',routineId:null,startedAt:at(day,18),endedAt:at(day,18)+mins*60000,exercises:[]});
// Wednesday 11 Nov 2026. Week containing it: Mon 9 / Sun 8 / Sat 7.
const cases=[[1,'2026-11-09','2026-11-02','2026-11-08','Mon'],[0,'2026-11-08','2026-11-01','2026-11-07','Sun'],[6,'2026-11-07','2026-10-31','2026-11-06','Sat']];
assert.equal(W.weekStartDay(),1,'Monday by default');
for(const [start,first,lastFrom,lastTo,name] of cases){
 W.setWeekStartDay(start);assert.equal(W.weekStartDay(),start);
 assert.equal(W.weekdayNames('short')[0].slice(0,3),name,'names start on '+name);assert.equal(W.weekdayNames('short').length,7);
 for(const d of ['2026-11-07','2026-11-08','2026-11-09','2026-11-11','2026-11-13']){const i=W.daysIntoWeek(new Date(d+'T12:00:00'));assert.ok(i>=0&&i<7);assert.equal(R.mondayOf(d),iso(at(d)-i*86400000))}
 assert.equal(R.mondayOf('2026-11-11'),first,'week start '+name);assert.equal(R.mondayOf(first),first,'first day maps to itself');
 const rec=R.weekRecap({today:'2026-11-11',workouts:[wk(lastFrom,30),wk(lastTo,40),wk(first,50)],diary:[],weights:[],goal:3,kcalTarget:null,proteinTarget:null});
 assert.equal(rec.from,lastFrom);assert.equal(rec.to,lastTo);assert.equal(rec.workouts,2,'last week = the 7 days before this week');
 assert.equal(iso(M.weekStart(at('2026-11-11'))),first,'muscle weeks');
 assert.equal(iso(S.mondayOf(at('2026-11-11'))),first,'friends weeks');
 const weeks=S.weeklyMinutes([wk(first,60),wk(lastTo,20)],2,at('2026-11-11'));assert.equal(iso(weeks[1].start),first);assert.deepEqual(weeks.map(w=>w.minutes),[20,60],'minutes land in the right week');
 assert.equal(S.weekStreak([wk(first,10),wk(lastFrom,10)],at('2026-11-11')),2,'streak by chosen weeks');
 const fp=foodPeriod('2026-11-11','week');assert.equal(fp.start,first);assert.equal(fp.days,7);
 const b=P.buckets([wk(first,30),wk(lastTo,30)],'2026-10-20','workouts',at('2026-11-11'));assert.ok(b.bars.every(x=>W.daysIntoWeek(new Date(x.start))===0),'weekly bars start on '+name);
 assert.equal(b.bars.at(-1).value,1);assert.equal(b.bars.at(-2).value,1);
}
W.setWeekStartDay(3);assert.equal(W.weekStartDay(),1,'unknown values fall back to Monday');W.setWeekStartDay(undefined);assert.equal(W.weekStartDay(),1);
console.log('PASS week start (Monday / Sunday / Saturday): recap last week, weekly bars, muscle weeks, food week, friends week minutes and streak, weekday names, fallback to Monday');
