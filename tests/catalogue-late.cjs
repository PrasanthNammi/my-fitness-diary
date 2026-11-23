// The exercise catalogue arrives after the diary. Before it, workouts use temporary "history:" exercises without
// muscles; once it has loaded, the store converts again so workouts link to catalogue exercises and Statistics can
// count muscles, even when the diary itself didn't change (an account whose exercises were linked long ago).
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os'),fs=require('fs');
const out=path.join(os.tmpdir(),'mfd-catalogue-late.cjs');
esbuild.buildSync({stdin:{contents:`export {getDB,catalogueLoaded} from './frontend/data/store';export {loadMfdCatalogue} from './frontend/catalogue/runtime';export {summarizeMuscles,rangeBounds} from './frontend/domain/muscleStats';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const now=Date.now(),set=(ex,id,g,n,type='normal')=>({exercise:ex,catalogId:id,catalogSource:'MFD',group:g,set:n,type,kg:40,reps:8,done:true,tracking:'weight_reps'});
let state={profile:{onboarded:true,name:'Test',sex:'male',height:180,activity:1.55,goal:'Maintain',days:3},meals:[],products:[],weights:[],checkins:[],water:{},active:null,folders:[],routines:[],
  sessions:[{id:'w1',name:'Upper',date:'2026-11-22',started:now-864e5,finished:now-864e5+3600e3,routineId:null,sets:[set('Bench Press (Barbell)','bench_press_barbell',0,1,'warmup'),set('Bench Press (Barbell)','bench_press_barbell',0,2),set('Bicep Curl (Barbell)','bicep_curl_barbell',1,1)]}]},v=0,subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:next=>{state=next;v++;subs.forEach(f=>f())},installCatalogue(){}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
global.fetch=async(p)=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join('public',p),'utf8'))});
const M=require(out);
(async()=>{
  const ids=()=>M.getDB().workouts[0].exercises.map(b=>b.exerciseId),counts=()=>{const r=M.rangeBounds(90),d=M.getDB();return M.summarizeMuscles(d.workouts,d.customExercises,r.start,r.end)};
  assert.ok(ids().every(id=>id.startsWith('history:')),'before the catalogue: temporary exercises');
  await M.loadMfdCatalogue();const before=v;M.catalogueLoaded();
  assert.equal(v,before,'nothing is written to the diary');
  assert.deepEqual(ids(),['bench_press_barbell','bicep_curl_barbell'],'after the catalogue: linked to catalogue exercises');
  const s=counts();assert.equal(s.sets,2,'warm-up left out');assert.equal(s.unmapped,0,'every set has a muscle');assert.ok(s.counts.chest>=1&&s.counts.biceps>=1,'chest and biceps counted');
  console.log('PASS late catalogue: workouts link to catalogue exercises once it loads (no diary change needed), so Statistics counts muscles');
})().catch(e=>{console.error(e);process.exit(1)});
