// MFD AI: Gemini's answer → cards (out-of-range values dropped, never a future day, advice gives no cards), the model
// pick from the key's list, and "Add" / Undo for every card on an example diary (estimate vs saved food, water,
// weight, workout, routine with a new folder, start a routine), plus the CSP that lets the app reach Gemini.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os'),fs=require('fs');
const out=path.join(os.tmpdir(),'mfd-ai-test.cjs');
esbuild.buildSync({stdin:{contents:`export {parseAnswer,systemPrompt,RESPONSE_SCHEMA,cardSummary} from './frontend/domain/mfdAi';export {pickFlash,flashOrder,maskedKey,saveGeminiKey,geminiErrorText,geminiErrorDetail,geminiKey,geminiJson,alternate,jsonIn} from './frontend/lib/gemini';export {applyCard,resolveCard} from './frontend/lib/mfdAiApply';export {getDB} from './frontend/data/store';export {nutrientsFor} from './frontend/domain/nutrition';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const ex=(id,name)=>({id,name,primaryMuscle:'Chest',secondaryMuscles:[],equipment:'Barbell',tracking:'weight_reps',source:'mfd',sourceRef:null,mediaUrl:null});
let state={profile:{onboarded:true,name:'Test',sex:'male',height:180,activity:1.55,goal:'Maintain',days:3},sessions:[],meals:[],products:[],weights:[{id:'w1',date:'2026-11-19',kg:72.9}],checkins:[],water:{},active:null,folders:[],routines:[],
  mfdExercises:[ex('bench','Bench Press (Barbell)'),ex('pulldown','Lat Pulldown (Cable)')]},v=0,subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:next=>{state=next;v++;subs.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const M=require(out);
const T='2026-11-24';

// Parsing.
let p=M.parseAnswer({reply:'My estimate. Look right?',items:[{kind:'food',meal:'breakfast',foods:[{name:'Eggs, boiled',qty:2,unit:'large',grams_per_unit:50,kcal_per_unit:77.5,protein_per_unit:6.3,carbs_per_unit:0.6,fat_per_unit:5.3},{name:'',qty:1,unit:'x',grams_per_unit:1,kcal_per_unit:1},{name:'Huge',qty:1,unit:'x',grams_per_unit:1,kcal_per_unit:99999}]},
  {kind:'water',ml:500},{kind:'weight',kg:72.4},{kind:'weight',kg:5},{kind:'food',day_offset:3,meal:'lunch',foods:[{name:'Rice',qty:150,unit:'g',grams_per_unit:1,kcal_per_unit:1.3}]},{kind:'checkin',sleep_hours:7.3,energy_1to5:4,soreness_1to5:9},{kind:'measurements',waist_cm:81},{kind:'nonsense'}]},T);
assert.equal(p.cards.length,6,'bad food lines, a 5 kg weight and unknown kinds are dropped');
assert.deepEqual(p.cards[0].lines.map(l=>l.name),['Eggs, boiled'],'empty name and 99999 kcal dropped');
assert.equal(p.cards[0].meal,'breakfast');assert.equal(p.cards[0].lines[0].source,'estimate');
assert.equal(p.cards[3].day,T,'a future day becomes today');assert.equal(p.cards[3].kind,'food');
assert.deepEqual(p.cards[4],{kind:'checkin',day:T,sleep:7.5,energy:4,soreness:undefined},'sleep in half hours; soreness 9 dropped');
assert.deepEqual(p.cards[5].values,{waist:81});
p=M.parseAnswer({reply:'I only log. For trends and advice, ask ChatGPT or Claude.',items:[]},T);assert.equal(p.cards.length,0);
p=M.parseAnswer({reply:'Updated.',replaces_previous:true,items:[{kind:'food',day_offset:-1,foods:[{name:'Toast',qty:1,unit:'slice',grams_per_unit:30,kcal_per_unit:80}]}]},T);
assert.equal(p.replaces,true);assert.equal(p.cards[0].day,'2026-11-23','yesterday');assert.equal(p.cards[0].meal,'snacks','no meal → snacks');
p=M.parseAnswer({reply:'',items:[{kind:'workout',title:'Push',minutes:55,exercises:[{name:'Bench Press (Barbell)',sets:[{reps:8,kg:60},{reps:8,kg:60},{reps:0}]},{name:'Nothing',sets:[]}]},{kind:'routine',routine_name:'Push A',folder:'PPL',drafted:true,exercises:[{name:'Mystery Move',sets:[{reps:10}]},{name:'Bench Press (Barbell)',sets:[{reps:8}]}]},{kind:'start_routine',routine_name:'push a'}]},T);
assert.equal(p.reply,'Look right?');assert.equal(p.cards[0].exercises.length,1);assert.equal(p.cards[0].exercises[0].sets.length,2,'reps 0 dropped');
assert.equal(p.cards[1].suggested,true);assert.equal(p.cards[2].kind,'start');
assert.match(M.cardSummary(p.cards[0]),/Bench Press \(Barbell\) 8x60kg,8x60kg/);
assert.match(M.systemPrompt({today:T,weekday:'Tuesday',time:'08:10',weightUnit:'lb',lengthUnit:'in'}),/uses lb for weight and in for body measurements/);
assert.ok(M.RESPONSE_SCHEMA.properties.items.items.properties.kind.enum.includes('start_routine'));

// Model pick and key display.
assert.equal(M.pickFlash(['models/gemini-2.0-flash','models/gemini-2.5-flash','models/gemini-2.5-flash-lite','models/gemini-3.0-flash-preview','models/gemini-2.5-pro','models/gemini-3-flash']),'gemini-2.5-flash','stable 2.5 Flash first');
assert.deepEqual(M.flashOrder(['models/gemini-2.0-flash','models/gemini-2.5-flash','models/gemini-2.5-flash-lite','models/gemini-3-flash','models/gemini-2.5-pro']),['gemini-2.5-flash','gemini-3-flash','gemini-2.0-flash','gemini-2.5-flash-lite']);
assert.equal(M.pickFlash(['models/gemini-3-flash','models/gemini-2.0-flash']),'gemini-3-flash','newest when 2.5 is missing');
assert.equal(M.pickFlash(['models/gemini-2.5-pro']),null);
assert.equal(M.maskedKey('AIzaSyABCDEFGHIJKLMNOPQRSTUVWQx4'),'AIza••••••••Qx4');

// Keys: new "AQ." keys (with dots) are accepted and checked with Google in the header, never the URL; junk is refused before any call.
(async()=>{
const store={};global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
const calls=[];global.fetch=async(u,o)=>{calls.push({u,o});return {ok:true,status:200,json:async()=>({models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3-flash',supportedGenerationMethods:['generateContent']}]})}};
await M.saveGeminiKey('  AQ.Ab8RN6Jv18XdfLCkU65yUBA6iZ0VSywH_test-key  ');
assert.equal(calls.length,1);assert.equal(calls[0].o.headers['x-goog-api-key'],'AQ.Ab8RN6Jv18XdfLCkU65yUBA6iZ0VSywH_test-key');assert.ok(!calls[0].u.includes('AQ.'),'key not in the URL');
assert.equal(M.geminiKey(),'AQ.Ab8RN6Jv18XdfLCkU65yUBA6iZ0VSywH_test-key');assert.equal(store['mfd-ai-gemini-model'],'gemini-2.5-flash');assert.equal(store['mfd-ai-gemini-models'],JSON.stringify(['gemini-2.5-flash','gemini-3-flash']));
await assert.rejects(M.saveGeminiKey('my key is secret!'),e=>e.kind==='format');assert.equal(calls.length,1,'no call for junk');
global.fetch=async()=>({ok:false,status:401,json:async()=>({error:{details:[{reason:'ACCESS_TOKEN_TYPE_UNSUPPORTED'}]}})});
await assert.rejects(M.saveGeminiKey('AQ.Ab8RN6Jv18XdfLCkU65yUBA6iZ0VSywH'),e=>e.kind==='keytype'&&/limit it to the Gemini API/.test(M.geminiErrorText(e)));
// Busy (503): one retry on the same model, then the next Flash model; a 400 (schema refused) → asked again without it; fenced JSON read.
const seen=[];global.fetch=async(u,o)=>{const b=JSON.parse(o.body);seen.push({m:u.split('/models/')[1].split(':')[0],schema:!!b.generationConfig.responseSchema});
  if(seen.length<=2)return {ok:false,status:503,json:async()=>({error:{message:'This model is currently experiencing high demand.'}})};
  if(seen.length===3)return {ok:false,status:400,json:async()=>({error:{message:'Unknown name "responseSchema"'}})};
  return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'```json\n{"reply":"Hi","items":[]}\n```'}]}}]})}};
const ans=await M.geminiJson({system:'s',schema:{type:'OBJECT'},turns:[{role:'model',text:'x'},{role:'user',text:'a'},{role:'user',text:'b'}]});
assert.deepEqual(ans,{reply:'Hi',items:[]});
assert.deepEqual(seen,[{m:'gemini-2.5-flash',schema:true},{m:'gemini-2.5-flash',schema:true},{m:'gemini-3-flash',schema:true},{m:'gemini-3-flash',schema:false}]);
assert.equal(store['mfd-ai-gemini-model'],'gemini-2.5-flash','a busy spike does not change the chosen model');
global.fetch=async()=>({ok:false,status:503,json:async()=>({error:{message:'high demand'}})});
await assert.rejects(M.geminiJson({system:'s',schema:{},turns:[{role:'user',text:'a'}]}),e=>e.kind==='busy'&&/very busy/.test(M.geminiErrorText(e))&&M.geminiErrorDetail(e)==='');
assert.deepEqual(M.alternate([{role:'model',text:'x'},{role:'user',text:'a'},{role:'user',text:'b'},{role:'model',text:''}]),[{role:'user',text:'a\nb'}]);
global.fetch=async()=>({ok:false,status:500,json:async()=>({error:{message:'Internal error for key AQ.Ab8secret123'}})});
await assert.rejects(M.geminiJson({system:'s',schema:{},turns:[{role:'user',text:'a'}]}),e=>{const d=M.geminiErrorDetail(e);assert.equal(d,'500 · Internal error for key …');return true});
global.fetch=undefined;
console.log('PASS MFD AI keys: AQ. keys, header only, clear errors, busy models (retry, next Flash), 400 schema, fenced JSON, alternating turns, no key in error details');
})().catch(e=>{console.error(e);process.exit(1)});

// Add and Undo on the example diary.
const food=M.resolveCard(M.parseAnswer({reply:'',items:[{kind:'food',meal:'breakfast',foods:[{name:'Eggs, boiled',qty:2,unit:'large',grams_per_unit:50,kcal_per_unit:77.5,protein_per_unit:6.3,carbs_per_unit:0.6,fat_per_unit:5.3},{name:'Rice',qty:150,unit:'g',grams_per_unit:1,kcal_per_unit:1.3}]}]},T).cards[0]);
let a=M.applyCard(food);let d=M.getDB();
assert.equal(d.diary.length,2);
const kcal=d.diary.map(e=>Math.round(M.nutrientsFor(e.food,e.amount,e.unit).kcal));assert.deepEqual(kcal,[155,195],'estimates keep their numbers (servings and grams)');
assert.equal(d.diary[0].meal,'breakfast');assert.equal(d.diary[0].addedBy,undefined,'the person added it, not an assistant');
// The same food again now matches the saved (eaten) one.
const again=M.resolveCard(M.parseAnswer({reply:'',items:[{kind:'food',foods:[{name:'eggs boiled',qty:3,unit:'large',grams_per_unit:55,kcal_per_unit:90}]}]},T).cards[0]);
assert.equal(again.lines[0].source,'mine');assert.equal(Math.round(again.lines[0].kcal),78,'saved food numbers win over a new estimate');
a.undo();assert.equal(M.getDB().diary.length,0,'Undo removes both');

a=M.applyCard({kind:'water',day:T,ml:500});assert.equal(M.getDB().water[T],500);M.applyCard({kind:'water',day:T,ml:250});a.undo();assert.equal(M.getDB().water[T],250);

const wc=M.resolveCard({kind:'weight',day:T,kg:72.4});assert.equal(wc.lastKg,72.9);
a=M.applyCard(wc);assert.equal(M.getDB().weights.find(w=>w.date===T).kg,72.4);a.undo();assert.equal(M.getDB().weights.some(w=>w.date===T),false);

const wk=M.resolveCard({kind:'workout',day:T,title:'Push',minutes:40,exercises:[{name:'bench press barbell',sets:[{reps:8,kg:60},{reps:8,kg:60}]},{name:'Mystery Move',sets:[{reps:10}]}]});
assert.equal(wk.exercises[0].exerciseId,'bench');assert.equal(wk.exercises[1].isNew,true);
a=M.applyCard(wk);let w=M.getDB().workouts.at(-1);
assert.equal(w.exercises.length,1,'unknown exercise left out');assert.ok(w.exercises[0].sets.every(s=>s.done&&s.reps===8&&s.weightKg===60));assert.equal(Math.round((w.endedAt-w.startedAt)/60000),40);
a.undo();assert.equal(M.getDB().workouts.length,0);
assert.throws(()=>M.applyCard(M.resolveCard({kind:'workout',day:T,title:'X',exercises:[{name:'Mystery Move',sets:[{reps:1}]}]})),/catalogue/);

const rt=M.resolveCard({kind:'routine',name:'Pull A',folder:'PPL',exercises:[{name:'Lat Pulldown (Cable)',sets:[{reps:10},{reps:10}]}]});
a=M.applyCard(rt);d=M.getDB();assert.equal(d.folders.length,1);assert.equal(d.routines[0].folderId,d.folders[0].id);assert.ok(d.routines[0].exercises[0].sets.every(s=>!s.done));
const st=M.resolveCard({kind:'start',name:'pull a'});assert.equal(st.routineId,d.routines[0].id);assert.equal(st.exercises,1);
const sa=M.applyCard(st);assert.equal(M.getDB().active.title,'Pull A');
assert.throws(()=>M.applyCard(st),/already running/);
sa.undo();assert.equal(M.getDB().active,null);
a.undo();d=M.getDB();assert.equal(d.routines.length,0);assert.equal(d.folders.length,0,'a folder made for it goes too');
assert.equal(M.resolveCard({kind:'start',name:'leg day'}).routineId,null);

// The app may call Gemini (CSP), nothing else new.
for(const f of ['public/index.html','hosting/worker/mfd.ts'])assert.match(fs.readFileSync(f,'utf8'),/connect-src 'self' https:\/\/world\.openfoodfacts\.org https:\/\/generativelanguage\.googleapis\.com;/,f);
console.log('PASS MFD AI: answer parsing and limits, model pick, add + undo for food (estimate and saved), water, weight, workout, routine with folder, start routine; CSP allows Gemini');
