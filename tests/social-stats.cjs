// Friend statistics: records (first time is not a record; warm-ups ignored; later sets in the same workout),
// muscle split shares, hours per week and streak, periods, totals and % change, exercises in common and the
// per-exercise head-to-head by tracking type.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-social-stats.cjs');
esbuild.buildSync({stdin:{contents:`export * from './frontend/domain/socialStats';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const S=require(out);
const at=(iso,h=18)=>new Date(`${iso}T${String(h).padStart(2,'0')}:00:00`).getTime();
let n=0;const set=(kg,reps,type='normal',extra={})=>({id:'s'+(++n),type,done:true,weightKg:kg,reps,timeSec:null,distanceKm:null,rpe:null,floors:null,steps:null,...extra});
const block=(exerciseId,sets,tracking='weight_reps')=>({id:'b'+(++n),exerciseId,tracking,restSec:90,note:'',supersetId:null,sets});
const workout=(iso,mins,blocks)=>({id:'w'+iso+(++n),title:'W',routineId:null,startedAt:at(iso),endedAt:at(iso)+mins*60000,exercises:blocks});
const ex=(id,muscle)=>({id,name:id,primaryMuscle:muscle,secondaryMuscles:[],equipment:'',source:'mfd',sourceRef:null,tracking:'weight_reps',mediaUrl:null});
const exercises=[ex('bench','chest'),ex('row','lats'),ex('curl','biceps'),ex('squat','quadriceps'),ex('plank','abdominals'),ex('press','shoulders'),ex('mystery','')];

// Records
const w1=workout('2026-10-01',60,[block('bench',[set(40,10,'warmup'),set(80,8),set(80,8)])]);
const w2=workout('2026-10-08',60,[block('bench',[set(100,1,'warmup'),set(82.5,8),set(85,5),set(70,12)])]);
const w3=workout('2026-10-15',60,[block('bench',[set(80,6)]),block('pushups',[set(null,20)],'reps')]);
const w4=workout('2026-10-22',60,[block('pushups',[set(null,25)],'reps')]);
const r=S.recordSets([w3,w1,w2,w4]);// order doesn't matter
assert.equal([...w1.exercises[0].sets].filter(s=>r.has(s.id)).length,0,'first time is not a record');
assert.equal(r.has(w2.exercises[0].sets[0].id),false,'warm-up 100 kg ignored');
assert.deepEqual(r.get(w2.exercises[0].sets[1].id),['1RM','Heaviest','Volume'],'82.5×8 beats 80×8 on all three');
assert.deepEqual(r.get(w2.exercises[0].sets[2].id),['Heaviest'],'85×5 heavier; e1RM 99.2 < 104.5 from 82.5×8, volume 425 < 660');
assert.deepEqual(r.get(w2.exercises[0].sets[3].id),['Volume'],'70×12 = 840 kg, more than 660');
assert.equal(S.recordCount(w2,r),3);assert.equal(S.recordCount(w3,r),0,'80×6 and the first push-ups are no records');
assert.deepEqual(r.get(w4.exercises[0].sets[0].id),['Most reps'],'reps-only exercise: more reps');

// Muscle split
const split=S.muscleSplit([workout('2026-11-01',60,[block('bench',[set(80,8),set(80,8)]),block('row',[set(60,10),set(60,10)]),block('curl',[set(20,10),set(20,10),set(20,10),set(20,10)]),block('mystery',[set(10,10)])])],exercises);
assert.deepEqual(Object.keys(split),['Back','Chest','Core','Shoulders','Arms','Legs']);
assert.equal(split.Arms,0.5);assert.equal(split.Chest,0.25);assert.equal(split.Back,0.25);assert.equal(split.Legs,0,'unmapped exercise skipped');
assert.deepEqual(S.muscleSplit([],exercises),{Back:0,Chest:0,Core:0,Shoulders:0,Arms:0,Legs:0});

// Hours per week + streak (now = Sunday 8 Nov 2026)
const now=at('2026-11-08',20);
const hist=[workout('2026-11-08',60,[]),workout('2026-11-02',30,[]),workout('2026-10-28',45,[]),workout('2026-10-14',50,[])];
const weeks=S.weeklyMinutes(hist,4,now);
assert.deepEqual(weeks.map(w=>w.minutes),[50,0,45,90],'oldest first, this week last (Mon 2 + Sun 8)');
assert.equal(new Date(weeks[3].start).getDay(),1,'weeks start on Monday');
assert.equal(S.weekStreak(hist,now),2,'this week and last week; the gap stops it');
assert.equal(S.weekStreak(hist.slice(1),at('2026-11-09',9)),2,'empty current week counts back from last week');
assert.equal(S.weekStreak([],now),0);

// Periods, totals, % change
assert.deepEqual(S.inPeriod([workout('2026-10-09',1,[]),workout('2026-10-10',1,[])],'30d',now).map(w=>new Date(w.startedAt).getDate()),[10],'last 30 days = 10 Oct … 8 Nov');assert.equal(S.inPeriod(hist,'all',now).length,4);
const t=S.totals([w1,w2]);assert.equal(t.count,2);assert.equal(t.minutes,120);assert.equal(t.volume,80*8*2+82.5*8+85*5+70*12,'warm-ups not counted');
assert.equal(S.pctChange(13,15),-13);assert.equal(S.pctChange(0,0),0);assert.equal(S.pctChange(5,0),100);assert.equal(S.pctChange(93,56),66);

// Exercises in common + head-to-head
const mine=[w1,w2,workout('2026-10-20',30,[block('plank',[set(null,null,'normal',{timeSec:60})],'time')])];
const theirs=[workout('2026-10-21',40,[block('bench',[set(90,5)]),block('plank',[set(null,null,'normal',{timeSec:90})],'time'),block('row',[set(70,8)])])];
assert.deepEqual(S.commonExercises(mine,theirs),['bench','plank']);
const m=S.exerciseMetrics('bench',mine,theirs);
assert.deepEqual(m.map(x=>x.label),['One rep max (estimated)','Heaviest weight','Best set (volume)']);
assert.equal(m[1].mine,85);assert.equal(m[1].theirs,90);assert.equal(m[2].mine,840);assert.equal(m[2].theirs,450);
assert.ok(Math.abs(m[0].mine-104.5)<1e-9&&Math.abs(m[0].theirs-105)<1e-9,'Epley: 82.5×8 = 104.5, 90×5 = 105');
assert.equal(S.leader(m),'friend','headline metric decides');assert.equal(S.leader([]),null);
const p=S.exerciseMetrics('plank',mine,theirs);assert.deepEqual(p.map(x=>[x.label,x.mine,x.theirs]),[['Longest time',60,90]]);
const reps=S.exerciseMetrics('pushups',[w3,w4],[workout('2026-10-23',20,[block('pushups',[set(null,15),set(null,15)],'reps')])]);
assert.deepEqual(reps.map(x=>[x.label,x.mine,x.theirs]),[['Best set (reps)',25,15],['Most reps in a session',25,30]]);
console.log('PASS social stats: records (first time not a record, warm-ups ignored, per metric), muscle split, hours per week, streak, periods, totals, % change, exercises in common, head-to-head by tracking type');
