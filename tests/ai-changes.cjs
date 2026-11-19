// Undoing what ChatGPT or Claude changed (domain/aiChanges.ts): water, goals and settings, folders, moved routines.
// What the person changed again since is left as they set it.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-aic-'));esbuild.buildSync({entryPoints:['frontend/domain/aiChanges.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'a.cjs')});
const A=require(path.join(dir,'a.cjs'));fs.rmSync(dir,{recursive:true,force:true});
const by={connection:'https://claude.ai/x',at:'2026-11-16T10:00:00Z'};
const base=()=>({profile:{name:'A',age:30,sex:'male',heightCm:180,weightKg:80,activity:'very',goal:'lose',targetWeightKg:75,trainingDaysPerWeek:4,waterGoalMl:3000},
 settings:{weightUnit:'kg',energyUnit:'kcal',defaultRestSec:120},water:{'2026-11-16':750},
 folders:[{id:'f1',name:'PPL'},{id:'f2',name:'Arms'}],routines:[{id:'r1',name:'Push A',folderId:'f1'},{id:'r2',name:'Upper',folderId:'f2'},{id:'r3',name:'Legs',folderId:'f2'}],
 aiChanges:[
  {id:'w',kind:'water',date:'2026-11-16',ml:500,addedBy:by},
  {id:'s',kind:'settings',changes:{goal:{from:'maintain',to:'lose'},activity:{from:'moderate',to:'very'},default_rest_seconds:{from:90,to:120},water_goal_ml:{from:2500,to:2800}},addedBy:by},
  {id:'f',kind:'folder',folderId:'f2',name:'Arms',addedBy:by},
  {id:'m',kind:'move',routineId:'r1',name:'Push A',to:'f1',folder:'PPL',addedBy:by},
  {id:'m2',kind:'move',routineId:'r3',name:'Legs',from:'f1',to:'f2',createdFolder:'f2',folder:'Arms',addedBy:by},
  {id:'bad',kind:'delete_everything'}]});

assert.deepEqual(A.aiChangeList(base().aiChanges).map(c=>c.id),['w','s','f','m','m2'],'unknown kinds ignored');
assert.deepEqual(A.aiChangeList(null),[]);
assert.deepEqual(base().aiChanges.slice(0,5).map(A.aiChangeLabel),['Water · 500 ml','Settings · Goal, Activity, Rest time, Water goal','Folder · Arms','Push A → PPL','Legs → Arms']);

let d=base();A.undoAiChange(d,'w');assert.equal(d.water['2026-11-16'],250);assert.ok(!d.aiChanges.some(c=>c.id==='w'),'dropped from the list');
d=base();d.water['2026-11-16']=200;A.undoAiChange(d,'w');assert.equal(d.water['2026-11-16'],0,'never below 0');

d=base();A.undoAiChange(d,'s');
assert.deepEqual([d.profile.goal,d.profile.activity,d.settings.defaultRestSec],['maintain','moderate',90]);
assert.equal(d.profile.waterGoalMl,3000,'changed again by the person since: kept');

d=base();A.undoAiChange(d,'m');assert.equal(d.routines[0].folderId,null,'moved back out of the folder');
d=base();d.routines[0].folderId='f2';A.undoAiChange(d,'m');assert.equal(d.routines[0].folderId,'f2','moved again by the person: kept');
d=base();A.undoAiChange(d,'m2');assert.equal(d.routines[2].folderId,'f1');assert.ok(d.folders.some(f=>f.id==='f2'),'folder kept while another routine is in it');
d=base();d.routines[1].folderId=null;A.undoAiChange(d,'m2');assert.ok(!d.folders.some(f=>f.id==='f2'),'empty created folder removed');

d=base();A.undoAiChange(d,'f');assert.ok(!d.folders.some(f=>f.id==='f2'));assert.deepEqual(d.routines.map(r=>r.folderId),['f1',null,null],'its routines stay, unfiled');
d=base();A.undoAiChange(d,'nope');assert.equal(d.aiChanges.length,6,'unknown id: nothing happens');
console.log('PASS AI changes: listed with plain labels; Undo puts water, settings, folders and moved routines back, keeping what the person changed since');

// A routine edit (rename, Bench 3 → 7 sets incl. 2 warm-ups, Treadmill added): undone part by part, only where the
// routine is still as the AI left it.
const edited=()=>{const set=(id,type,w)=>({id,type,weightKg:w,reps:8,timeSec:null,distanceKm:null,done:true});
 return {...base(),routines:[{id:'r1',name:'Push Day',folderId:null,exercises:[
  {id:'r1:0',exerciseId:'bench',sets:[set('n1','warmup',null),set('n2','warmup',null),...[3,4,5,6,7].map(k=>set('n'+k,'normal',60))]},{id:'r1:1',exerciseId:'treadmill',sets:[]}]}],
 aiChanges:[{id:'e',kind:'routine_edit',routineId:'r1',name:'Push Day',renamedFrom:'Push A',added:1,addedNames:['Treadmill'],count:2,
  sets:[{index:0,exercise:'Bench Press',after:7,before:[{id:'a',kg:60,reps:8,type:'normal'},{id:'b',kg:62.5,reps:6,type:'dropset'},{kg:60,reps:8,type:'normal'}]}],addedBy:by}]};};
assert.equal(A.aiChangeLabel(edited().aiChanges[0]),'Push Day · renamed, sets, +1 exercise');
d=edited();A.undoAiChange(d,'e');
assert.equal(d.routines[0].name,'Push A');assert.equal(d.routines[0].exercises.length,1,'added exercise removed');
assert.deepEqual(d.routines[0].exercises[0].sets.map(s=>[s.id,s.type,s.weightKg,s.reps]),[['a','normal',60,8],['b','drop',62.5,6],['r1:0:2','normal',60,8]],'sets as before');
d=edited();d.routines[0].name='My Push';d.routines[0].exercises[0].sets.pop();d.routines[0].exercises.push({id:'r1:2',exerciseId:'fly',sets:[]});A.undoAiChange(d,'e');
assert.deepEqual([d.routines[0].name,d.routines[0].exercises.length,d.routines[0].exercises[0].sets.length],['My Push',3,6],'changed again by the person: kept');
console.log('PASS AI routine edit: undo restores the name, the sets and removes added exercises, unless the person changed them since');
