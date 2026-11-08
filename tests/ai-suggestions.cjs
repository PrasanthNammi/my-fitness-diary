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

// Applying: faded values only; ticked sets and typed values untouched; warm-ups matched separately.
const set=(id,type,extra={})=>({id,type,weightKg:null,reps:null,timeSec:null,distanceKm:null,rpe:null,done:false,...extra});
const block={id:'b1',exerciseId:'x1',tracking:'weight_reps',restSec:90,note:'',supersetId:null,sets:[
 set('w','warmup',{suggested:{weightKg:20,reps:10}}),set('s1','normal',{done:true,weightKg:60,reps:8}),set('s2','normal',{weightKg:65}),set('s3','normal',{suggested:{weightKg:60,reps:8}})]};
const targets=[{type:'warmup',kg:30,reps:8},{kg:62.5,reps:8},{kg:62.5,reps:8},{kg:62.5,reps:7},{kg:60,reps:10}];
const r=S.applyTargets(block,targets);
assert.deepEqual(r.sets[0].suggested,{weightKg:30,reps:8},'warm-up target on the warm-up');
assert.deepEqual(r.sets[1],block.sets[1],'ticked set untouched');
assert.equal(r.sets[2].weightKg,65,'typed value kept');assert.deepEqual(r.sets[2].suggested,{weightKg:62.5,reps:8},'faded target beside it');
assert.deepEqual(r.sets[3].suggested,{weightKg:62.5,reps:7});assert.equal(r.sets[3].weightKg,null,'still only faded');assert.equal(r.sets[3].done,false);
assert.equal(block.sets[3].suggested.weightKg,60,'original not mutated');
assert.deepEqual(S.extraTargets(block,targets),[{kg:60,reps:10}],'one working target beyond the 3 working sets');
let n=0;const added=S.targetSets([{kg:60,reps:10,type:'dropset'}],()=>'n'+(++n));
assert.deepEqual(added,[{id:'n1',type:'drop',weightKg:null,reps:null,timeSec:null,distanceKm:null,rpe:null,done:false,suggested:{weightKg:60,reps:10}}],'new sets are unticked with faded targets');
console.log('PASS ai suggestions: newest per routine, dismissed/7-day/used-by-workout expiry, name matching, faded-only targets (ticked and typed untouched), warm-ups separate, extra sets, tracking fit');
