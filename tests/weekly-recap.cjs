// 7-day weight average (window, missing days, noise), the trend change, the average line, and the
// Monday recap of last week: Monday–Sunday bounds, workouts and working sets, average calories over
// logged days, protein days, weight average and its change, and an empty week.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-weekly-recap.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/weeklyRecap.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,loader:{'.svg':'text'}});
const {weightAverage,averageSeries,weightTrend,weekRecap,mondayOf,shiftISO}=require(out);
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-9,`${m}: ${a} vs ${b}`);
const W=(date,kg)=>({id:date,date,kg});

// Dates: Monday 2026-11-02 … Sunday 2026-11-08; today Monday 2026-11-09.
assert.equal(mondayOf('2026-11-08'),'2026-11-02');assert.equal(mondayOf('2026-11-02'),'2026-11-02');assert.equal(mondayOf('2026-11-09'),'2026-11-09');
assert.equal(shiftISO('2026-03-28',2),'2026-03-30','across the clock change');

// Average: only weigh-ins in the 7 days ending the date; missing days are simply not counted.
const ws=[W('2026-10-25',75),W('2026-11-02',73),W('2026-11-04',74),W('2026-11-08',72)];
near(weightAverage(ws,'2026-11-08'),(73+74+72)/3,'7-day window');
near(weightAverage(ws,'2026-10-31'),75,'only the old one');assert.equal(weightAverage(ws,'2026-11-01'),null,'25 Oct is outside the 7 days ending 1 Nov');
assert.equal(weightAverage(ws,'2026-10-20'),null,'none before');
// A noisy morning moves the average much less than the day's number.
const noisy=[W('2026-11-01',72),W('2026-11-02',72),W('2026-11-03',72),W('2026-11-04',74)];
assert.ok(weightAverage(noisy,'2026-11-04')-72<0.6,'one heavy morning barely moves the average');
const series=averageSeries([...ws].reverse());assert.deepEqual(series.map(s=>s.date),ws.map(w=>w.date),'oldest first');near(series.at(-1).avg,(73+74+72)/3,'line ends on the latest average');
// Trend: latest average vs the 7 days ending 4 weeks before the latest weigh-in.
const long=[];for(let i=0;i<35;i++)long.push(W(shiftISO('2026-10-05',i),80-i*0.1));
const t=weightTrend(long,'2026-11-30');near(t.avg,(80-34*0.1+80-28*0.1)/2,'avg');near(t.change,-2.8,'4 weeks of -0.1/day');assert.equal(t.last.date,'2026-11-08');
assert.equal(weightTrend([W('2026-11-08',72)],'2026-11-08').change,null,'no change without older data');
assert.equal(weightTrend([],'2026-11-08').avg,null);

// Recap of last week, seen on Monday 2026-11-09 (and any day that week).
const food={id:'f',name:'F',brand:null,barcode:null,origin:'custom',refAmount:100,refUnit:'g',servingSize:null,servingLabel:null,kcal:200,protein:20,carbs:10,fat:5,fibre:null};
const E=(date,g)=>({id:date+g,date,meal:'lunch',food,amount:g,unit:'g',createdAt:0});
const set=(done,type='normal')=>({id:Math.random()+'',type,weightKg:50,reps:10,timeSec:null,distanceKm:null,rpe:null,done});
const wo=(day,h=18)=>({id:day,title:'W',routineId:null,startedAt:new Date(day+'T'+String(h).padStart(2,'0')+':00:00').getTime(),endedAt:new Date(day+'T'+String(h).padStart(2,'0')+':45:00').getTime(),exercises:[{id:'b',exerciseId:'x',sets:[set(true,'warmup'),set(true),set(true),set(false)],restSec:90,note:'',tracking:'weight_reps'}]});
const input={today:'2026-11-09',goal:4,kcalTarget:2000,proteinTarget:150,
 workouts:[wo('2026-11-01'),wo('2026-11-02',7),wo('2026-11-05'),wo('2026-11-08',23),wo('2026-11-09')],
 diary:[E('2026-11-02',1000),E('2026-11-02',500),E('2026-11-03',700),E('2026-11-08',300),E('2026-11-01',5000),E('2026-11-09',5000)],
 weights:[W('2026-10-27',74),W('2026-10-30',74.4),W('2026-11-03',73.6),W('2026-11-07',73.4)]};
const r=weekRecap(input);
assert.equal(r.from,'2026-11-02');assert.equal(r.to,'2026-11-08');
assert.equal(r.workouts,3,'Mon 07:00, Thu, Sun 23:00 count; the Sunday before and today do not');assert.equal(r.sets,6,'working sets done, warm-ups and undone left out');
assert.equal(r.minutes,135);assert.equal(r.volumeKg,3000);
assert.equal(r.loggedDays,3);near(r.avgKcal,(3000+1400+600)/3,'average over logged days only');
assert.equal(r.proteinDays,1,'protein days: Monday 300 g yes, Tuesday 140 g is under 95% of 150 (142.5), Sunday 60 g no');
near(r.weightAvg,73.5,'avg of the week');near(r.weightChange,73.5-74.2,'vs the week before');
assert.equal(weekRecap({...input,today:'2026-11-15'}).from,'2026-11-02','any day of the week shows the same recap');
const empty=weekRecap({...input,today:'2026-12-07'});assert.equal(empty.empty,true);assert.equal(empty.avgKcal,null);assert.equal(empty.weightChange,null);
console.log('PASS weekly recap: 7-day weight average window and noise, average line, 4-week trend, last week Monday–Sunday, workouts and working sets, average calories over logged days, protein days, weight average and change, empty week');
