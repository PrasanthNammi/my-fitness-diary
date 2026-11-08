// AI workout suggestions: newest per routine wins, dismissed and expired ones (7 days, or a workout of the
// routine finished after arrival) don't count; exercises matched by name; targets only become faded values,
// never touching ticked sets or typed values; warm-ups keep their own targets; extra sets; tracking fit.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-ai-suggestions.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/aiSuggestions.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,loader:{'.svg':'text'}});
const S=require(out);
const DAY=864e5,now=Date.UTC(2026,10,9,12);
const sug=(id,routineId,ageDays,status='pending',exercises=[])=>({id,routineId,createdAt:now-ageDays*DAY,status,exercises});
const wo=(routineId,endedAgoDays)=>({id:'w'+Math.random(),routineId,startedAt:now-endedAgoDays*DAY-3600e3,endedAt:now-endedAgoDays*DAY,title:'',exercises:[]});

// Newest per routine; older ones are replaced even if pending.
let list=[sug('a','r1',3),sug('b','r1',1),sug('c','r2',2,'used')];
assert.equal(S.activeSuggestion(list,'r1',[],now).id,'b','newest wins');
assert.equal(S.activeSuggestion(list,'r2',[],now).id,'c','used still counts until it expires');
assert.equal(S.activeSuggestion(list,'r3',[],now),null);assert.equal(S.activeSuggestion(list,null,[],now),null);
// Dismissed newest: nothing (the older one does not come back).
assert.equal(S.activeSuggestion([sug('a','r1',3),sug('b','r1',1,'dismissed')],'r1',[],now),null,'dismissed hides, older does not return');
// Expiry: 7 days, or a workout of that routine finished after it arrived.
assert.equal(S.activeSuggestion([sug('a','r1',7.5)],'r1',[],now),null,'older than 7 days');
assert.equal(S.activeSuggestion([sug('a','r1',6.9)],'r1',[],now).id,'a');
assert.equal(S.activeSuggestion([sug('a','r1',2)],'r1',[wo('r1',1)],now),null,'used up by a later workout of the routine');
assert.equal(S.activeSuggestion([sug('a','r1',2)],'r1',[wo('r1',3),wo('r2',1)],now).id,'a','earlier workout or other routine does not expire it');
assert.deepEqual(S.activeSuggestions([sug('a','r1',3),sug('b','r2',1),sug('c','r3',1,'dismissed')],[],now).map(s=>s.id),['b','a'],'hub list newest first');

// Values and fit.
assert.deepEqual(S.targetValues({kg:62.5,reps:8}),{weightKg:62.5,reps:8});
assert.deepEqual(S.targetValues({duration_seconds:60,distance_meters:1500}),{timeSec:60,distanceKm:1.5});
assert.equal(S.fits('weight_reps',[{kg:60,reps:8}]),true);assert.equal(S.fits('reps',[{reps:12}]),true);
assert.equal(S.fits('time',[{kg:60,reps:8}]),false,'kg x reps cannot go on a timed exercise');assert.equal(S.fits('weight_reps',[]),false);
assert.equal(S.setType({type:'dropset'}),'drop');assert.equal(S.setType({}),'normal');

// Matching by name (case and spaces ignored).
const names={x1:'Bench Press',x2:'Overhead  Press (Barbell)'};const nameOf=id=>names[id];
const blocks=[{id:'b1',exerciseId:'x1'},{id:'b2',exerciseId:'x2'}];
assert.equal(S.matchBlock(blocks,' bench press ',nameOf).id,'b1');assert.equal(S.matchBlock(blocks,'overhead press (barbell)',nameOf).id,'b2');assert.equal(S.matchBlock(blocks,'Squat',nameOf),undefined);

// Routine names can differ from display names ("Shoulder Press" is the routine's name for Overhead Press (Barbell)).
const named={overhead_press_barbell:'Overhead Press (Barbell)',incline_bench_press_dumbbell:'Incline Bench Press (Dumbbell)',lateral_raise:'Lateral Raise (Dumbbell)'};
const rb=[{id:'o',exerciseId:'overhead_press_barbell'},{id:'i',exerciseId:'incline_bench_press_dumbbell'},{id:'l',exerciseId:'lateral_raise'}];
assert.equal(S.matchBlock(rb,{exercise:'Shoulder Press',catalogId:'overhead_press_barbell',sets:[]},id=>named[id]).id,'o','by attached catalogue id');
const resolve=ex=>({'lateral raise':'lateral_raise','incline dumbbell press':'incline_bench_press_dumbbell'})[ex.exercise.toLowerCase()];
assert.equal(S.matchBlock(rb,{exercise:'Lateral Raise',sets:[]},id=>named[id],resolve).id,'l','by the app resolver');
assert.equal(S.matchBlock(rb,{exercise:'Incline Dumbbell Press',catalogId:'not-there',sets:[]},id=>named[id],resolve).id,'i','stale catalogue id falls back to the resolver');
assert.equal(S.matchBlock(rb,{exercise:'overhead press (barbell)',sets:[]},id=>named[id],()=>null).id,'o','display name last');
assert.equal(S.matchBlock(rb,{exercise:'Shoulder Press',sets:[]},id=>named[id],()=>null),undefined,'no id and a different name: not matched');

// Applying: faded values only; ticked sets and typed values untouched; warm-ups matched separately.
const set=(id,type,extra={})=>({id,type,weightKg:null,reps:null,timeSec:null,distanceKm:null,rpe:null,done:false,...extra});
const block={id:'b1',exerciseId:'x1',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[
 set('w','warmup',{suggested:{weightKg:20,reps:10}}),set('s1','normal',{done:true,weightKg:60,reps:8}),set('s2','normal',{weightKg:65}),set('s3','normal',{suggested:{weightKg:60,reps:8}})]};
const targets=[{type:'warmup',kg:30,reps:8},{kg:62.5,reps:8},{kg:62.5,reps:8},{kg:62.5,reps:7},{kg:60,reps:10}];
const r=S.applyTargets(block,targets);
assert.deepEqual(r.sets[0].suggested,{weightKg:30,reps:8},'warm-up target on the warm-up');
assert.deepEqual(r.sets[1],block.sets[1],'ticked set untouched (no AI mark)');assert.equal(r.sets[3].aiTarget,true,'AI mark on targeted sets');
assert.equal(r.sets[2].weightKg,65,'typed value kept');assert.deepEqual(r.sets[2].suggested,{weightKg:62.5,reps:8},'faded target beside it');
assert.deepEqual(r.sets[3].suggested,{weightKg:62.5,reps:7});assert.equal(r.sets[3].weightKg,null,'still only faded');assert.equal(r.sets[3].done,false);
assert.equal(block.sets[3].suggested.weightKg,60,'original not mutated');
assert.deepEqual(S.extraTargets(block,targets),[{kg:60,reps:10}],'one working target beyond the 3 working sets');
let n=0;const added=S.targetSets([{kg:60,reps:10,type:'dropset'}],()=>'n'+(++n));
assert.deepEqual(added,[{id:'n1',type:'drop',weightKg:null,reps:null,timeSec:null,distanceKm:null,rpe:null,done:false,suggested:{weightKg:60,reps:10},aiTarget:true,aiAdded:true}],'new sets are unticked with faded targets, marked as AI-added');
// Dismiss after use: plan values back, AI-added sets gone unless ticked or typed, ticked kept, marks cleared.
const plan={id:'p',exerciseId:'x1',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[set('a','normal',{suggested:{weightKg:60,reps:8}}),set('b','normal',{suggested:{weightKg:60,reps:8}}),set('c','normal',{suggested:{weightKg:60,reps:8}})]};
const t1=[{kg:62.5,reps:8},{kg:62.5,reps:8},{kg:62.5,reps:7}];
let ap=S.applyTargets(plan,t1);assert.deepEqual(ap.sets[0].aiPrev,{weightKg:60,reps:8},'plan remembered');
// A second suggestion on top keeps the ORIGINAL plan to go back to.
ap=S.applyTargets(ap,[{kg:65,reps:6},{kg:65,reps:6},{kg:65,reps:6}]);assert.deepEqual(ap.sets[0].suggested,{weightKg:65,reps:6});assert.deepEqual(ap.sets[0].aiPrev,{weightKg:60,reps:8},'original plan, not the first suggestion');
// Tick set a, type in set b, add two AI sets (one typed in).
let n2=0;const extra=S.targetSets([{kg:60,reps:10},{kg:60,reps:10}],()=>'e'+(++n2));extra[1]={...extra[1],reps:9};
const working={...ap,sets:[{...ap.sets[0],done:true,weightKg:65,reps:6},{...ap.sets[1],weightKg:64},ap.sets[2],...extra]};
const back=S.removeTargets(working);
assert.equal(back.sets.length,4,'untouched AI set removed, typed-in AI set kept');
assert.deepEqual([back.sets[0].done,back.sets[0].weightKg,back.sets[0].aiTarget,back.sets[0].aiPrev],[true,65,undefined,undefined],'ticked set kept as logged, mark cleared');
assert.equal(back.sets[1].weightKg,64,'typed value kept');assert.deepEqual(back.sets[1].suggested,{weightKg:60,reps:8},'faded back to the plan');
assert.deepEqual(back.sets[2].suggested,{weightKg:60,reps:8});assert.equal(back.sets[2].aiTarget,undefined);
assert.equal(back.sets[3].reps,9);assert.equal(back.sets[3].suggested,undefined);assert.equal(back.sets[3].aiAdded,undefined,'typed-in AI set stays as a normal set');
assert.equal(S.removeTargets(plan),plan,'no AI marks: same block');
const aiOnly={...plan,sets:S.targetSets([{kg:80,reps:5}],()=>'z')};assert.equal(S.removeTargets(aiOnly),null,'AI-added exercise with nothing logged goes away');
const aiLogged={...plan,sets:[{...S.targetSets([{kg:80,reps:5}],()=>'z')[0],done:true,weightKg:80,reps:5}]};assert.equal(S.removeTargets(aiLogged).sets.length,1,'AI-added exercise with a ticked set stays');
const three={exercises:[{exercise:'Bench Press'},{exercise:'Row'},{exercise:'Press'}]};
assert.equal(S.acceptedCount({...three,status:'pending'}),'0/3');assert.equal(S.acceptedCount({...three,status:'used'}),'3/3','Use all');
assert.equal(S.acceptedCount({...three,status:'used',usedExercises:['bench press']}),'1/3');assert.equal(S.acceptedCount({...three,status:'used',usedExercises:['Bench Press','Row']}),'2/3');
console.log('PASS ai suggestions: dismiss restores the plan (ticked/typed kept, AI-added removed, original plan after two suggestions), newest per routine, dismissed/7-day/used-by-workout expiry, name matching, faded-only targets (ticked and typed untouched), warm-ups separate, extra sets, tracking fit');
