const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const output=path.join(os.tmpdir(),'mfd-muscle-stats.cjs');esbuild.buildSync({entryPoints:['frontend/domain/muscleStats.ts'],bundle:true,platform:'node',format:'cjs',outfile:output});
const {summarizeMuscles,muscleMapping,rangeBounds,muscleBuckets,shiftDays,weekStart,normalizeMuscle}=require(output);
const t=new Date(2026,9,20,12).getTime(),bounds=rangeBounds(7,t);
const bench={id:'bench',name:'Bench press',primaryMuscle:'Chest',secondaryMuscles:['Triceps','Shoulders','Triceps','Chest'],entry:{muscle_groups:{primary:['chest','chest'],secondary:['triceps','shoulders','chest','triceps']}}};
const set=(id,done=true,type='normal')=>({id,done,type,weightKg:50,reps:10});const workout=(id,start,sets,ex='bench')=>({id,startedAt:start,endedAt:start+3600000,exercises:[{exerciseId:ex,tracking:'weight_reps',sets}]});
const history=[workout('a',t,[set('1'),set('2'),set('3'),set('warm',true,'warmup'),set('draft',false)]),workout('unknown',t,[set('u')],'missing'),workout('previous',bounds.start-1,[set('p')]),workout('end',bounds.end,[set('future')]),workout('start',bounds.start,[set('edge')])];
const original=JSON.stringify(history),exercises=[bench];const r=summarizeMuscles(history,exercises,bounds.start,bounds.end);
assert.equal(r.sets,5);assert.equal(r.counts.chest,4);assert.equal(r.counts.triceps,2);assert.equal(r.counts.shoulders,2);assert.equal(r.unmapped,1);assert.deepEqual(r.missing,[['missing',1]]);assert.equal(r.volume,2500);assert.equal(r.sessions,3);assert.equal(r.duration,3*3600000);assert.equal(JSON.stringify(history),original);
assert.deepEqual(muscleMapping(bench),{primary:['chest'],secondary:['triceps','shoulders']});assert.equal(normalizeMuscle('Upper Back'),'upper_back');assert.equal(normalizeMuscle('legs'),null);assert.equal(normalizeMuscle('unknown'),null);
assert.deepEqual(muscleMapping({primaryMuscle:'Quadriceps',secondaryMuscles:['Glutes']}),{primary:['quadriceps'],secondary:['glutes']});assert.equal(summarizeMuscles([],[],0,Infinity).sets,0);
for(const mode of ['week','month']){const buckets=muscleBuckets(history,exercises,bounds.start,bounds.end,mode);assert.equal(buckets.reduce((s,b)=>s+b.counts.chest,0),4);assert.ok(buckets.every((b,i)=>i===0||b.time>buckets[i-1].time))}
assert.equal(new Date(weekStart(t)).getDay(),1);assert.equal(shiftDays(bounds.start,7),bounds.end);assert.equal(shiftDays(bounds.previousStart,7),bounds.start);
// Adjacent periods never double-count the boundary; same account inputs only.
assert.equal(summarizeMuscles(history,exercises,bounds.previousStart,bounds.start).counts.chest,1);assert.equal(summarizeMuscles([workout('warm',t,[set('warm',true,'warmup')])],exercises,bounds.start,bounds.end).sessions,0);
// Real catalogue mappings: all groups recognized, no duplicate muscle credit within a set.
const fs=require('fs'),catalogue=JSON.parse(fs.readFileSync('public/catalogue/mfd_exercises.json','utf8'));
for(const e of catalogue.exercises){for(const key of [...e.muscle_groups.primary,...e.muscle_groups.secondary])assert.ok(normalizeMuscle(key),'Unrecognized catalogue muscle '+key)}
const source=fs.readFileSync('frontend/App.tsx','utf8');assert.ok(source.includes("if (b === 'muscles')"));
console.log('PASS muscle statistics: completed working sets, secondary credit, deduplication, unknown mapping, exact date boundaries, weekly/monthly buckets, empty states, immutable history and catalogue coverage');
// Anatomy stays a neutral base with dynamic regions and is cached on demand.
assert.ok(fs.existsSync('public/legacy/anatomy/muscles-neutral.svg'));
const sw=fs.readFileSync('public/sw.js','utf8'),assets=JSON.parse(sw.match(/const ASSETS=(.*);/)[1]),core=JSON.parse(sw.match(/const CORE=(.*);/)[1]);
assert.ok(assets.includes('/legacy/anatomy/muscles-neutral.svg'));assert.ok(!core.includes('/legacy/anatomy/muscles-neutral.svg'));
assert.ok(fs.readFileSync('frontend/screens/progress/MuscleAnatomy.tsx','utf8').includes('counts[m]>0'));
console.log('PASS dynamic anatomy and lazy offline-cache inclusion');
