const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const output=path.join(os.tmpdir(),'mfd-set-logging.cjs');
esbuild.buildSync({stdin:{contents:`export * from './frontend/domain/training';export * from './frontend/adapters/compat';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:output});
const api=require(output),fields=['weightKg','reps','timeSec','distanceKm','floors','steps'];
const set={id:'s',type:'normal',weightKg:50,reps:10,timeSec:null,distanceKm:null,floors:null,steps:null,rpe:null,done:false};
const planned=api.prepareActiveSet(set);assert.equal(planned.weightKg,null);assert.equal(planned.reps,null);assert.equal(planned.suggested.weightKg,50);assert.equal(api.prepareActiveSet(planned),planned);
assert.equal(api.workingVolume([{sets:[planned]}]),0);
const logged=api.logSetValues({...planned,reps:9},'weight_reps');assert.equal(logged.weightKg,50);assert.equal(logged.reps,9);assert.equal(logged.done,true);assert.equal(set.done,false);
assert.equal(api.logSetValues({...planned,reps:-1},'weight_reps'),null);assert.equal(api.logSetValues({...planned,reps:2.5},'weight_reps'),null);
for(const mode of ['weight_reps','reps','time','weight_time','distance_time','weight_distance','weighted_bodyweight','assisted_bodyweight','floors_time','steps_time']){
 const original={...set,...Object.fromEntries(fields.map(f=>[f,12]))};const p=api.prepareActiveSet(original);for(const f of fields)assert.equal(p[f],null);assert(api.logSetValues(p,mode)?.done,mode);
}
const row={exercise:'Bench',group:0,set:1,type:'normal',kg:50,reps:10,done:false,id:'first'};
const raw={profile:{},sessions:[{id:'history',name:'Past',date:'2026-10-01',started:1,finished:2,sets:[{...row,done:true}]}],routines:[],folders:[],active:{id:'active',name:'Push',started:123,sets:[row,{...row,id:'second',set:2},{...row,id:'other',group:1,exercise:'Shoulder'}]},meals:[],weights:[],checkins:[],water:{}};
const read=state=>api.toDB({state,ready:true,user:null},{exercises:[],foods:[]});
let db=read(raw);assert.equal(db.workouts[0].exercises[0].sets[0].weightKg,50);assert.equal(db.active.exercises[0].sets[0].weightKg,null);
db.active.exercises[0].sets[0].reps=8;
let persisted=JSON.parse(JSON.stringify(api.fromDB(db,raw,new Set(['active']))));db=read(persisted);
assert.equal(db.active.exercises[0].sets[0].reps,8);assert.equal(db.active.exercises[0].sets[0].weightKg,null);assert.equal(db.active.exercises[0].sets[0].suggested.weightKg,50);
// Delete the first set; remaining ID and suggestions survive canonical roundtrip.
db.active.exercises[0].sets.splice(0,1);persisted=api.fromDB(db,persisted,new Set(['active']));db=read(persisted);assert.equal(db.active.exercises[0].sets.length,1);assert.equal(db.active.exercises[0].sets[0].id,'second');assert.equal(db.active.exercises[0].sets[0].done,false);
const confirmed=api.logSetValues(db.active.exercises[0].sets[0],'weight_reps');db.active.exercises[0].sets[0]=confirmed;
const finished=db.active.exercises.map(b=>({...b,sets:b.sets.filter(s=>s.done)})).filter(b=>b.sets.length);
assert.equal(finished.length,1);assert.equal(finished[0].sets.length,1);assert.equal(api.workingVolume(finished),500);
console.log('PASS faded suggestions, explicit confirmation, all tracking modes, draft persistence, deletion roundtrip, untouched exercise exclusion, unchanged history');
