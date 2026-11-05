const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const output=path.join(os.tmpdir(),'mfd-workout-edit.cjs');
esbuild.buildSync({stdin:{contents:`export * from './frontend/domain/training';export * from './frontend/adapters/compat';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:output});
const api=require(output);
const set=(id,values)=>({id,type:'normal',weightKg:null,reps:null,timeSec:null,distanceKm:null,floors:null,steps:null,rpe:null,done:false,...values});
// Empty sets are dropped, kept sets are marked logged, and exercises left without sets are removed.
const blocks=[{id:'b1',exerciseId:'bench',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[set('a',{weightKg:60,reps:8,done:true}),set('b',{reps:10,suggested:{reps:10}}),set('c',{})]},{id:'b2',exerciseId:'curl',tracking:'weight_reps',restSec:60,note:'',supersetId:null,sets:[set('d',{})]}];
const logged=api.loggedBlocks(blocks);
assert.deepEqual(logged.map(b=>b.id),['b1']);assert.deepEqual(logged[0].sets.map(s=>s.id),['a','b']);
assert.ok(logged[0].sets.every(s=>s.done&&s.suggested===undefined));assert.equal(blocks[0].sets[1].done,false,'input is not mutated');
console.log('PASS edited workouts keep only logged sets');
// The stored date follows the start time once it is edited, and is kept as stored otherwise.
const t=(s)=>new Date(s).getTime(),started=t('2026-10-01T18:00:00');
const old={sessions:[{id:'w1',name:'Push',date:'2026-10-01',started,finished:started+3600000,sets:[],source:'hevy'}],routines:[],meals:[],products:[],weights:[],checkins:[]};
const workout={id:'w1',title:'Push',routineId:null,startedAt:started,endedAt:started+3600000,exercises:[]};
const same=api.fromDB({workouts:[workout],customExercises:[]},old,new Set(['workouts'])).sessions[0];
assert.equal(same.date,'2026-10-01');assert.equal(same.source,'hevy','other stored fields are kept');
const moved=api.fromDB({customExercises:[],workouts:[{...workout,title:'Push day',startedAt:t('2026-10-03T07:30:00'),endedAt:t('2026-10-03T08:15:00')}]},old,new Set(['workouts'])).sessions[0];
assert.equal(moved.date,'2026-10-03');assert.equal(moved.name,'Push day');assert.equal(moved.finished-moved.started,45*60000);
console.log('PASS edited workout date, title and duration are stored');
