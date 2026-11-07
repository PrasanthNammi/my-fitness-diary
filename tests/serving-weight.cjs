// Serving weight: a food logged per serving (or per gram) can be given what one serving weighs, so both
// units work; nutrition stays the same, the weight survives saving and loading, and every logged copy updates.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-serving-weight.cjs');
esbuild.buildSync({stdin:{contents:`export {withServingWeight,allowedUnits,nutrientsFor} from './frontend/domain/nutrition';export {foodIn,foodOut} from './frontend/adapters/compat';export {diary} from './frontend/data/repositories';export {getDB,update} from './frontend/data/store';`,resolveDir:process.cwd(),loader:'ts'},loader:{'.svg':'text'},bundle:true,platform:'node',format:'cjs',outfile:out});
// A stand-in for the signed-in sync engine (same as tests/food-actions.cjs): it holds the stored diary document.
let state={profile:{onboarded:true,name:'Test',age:26,sex:'male',height:175,weight:70,target:70,activity:1.55,goal:'Maintain',days:4},sessions:[],routines:[],folders:[],meals:[],products:[],weights:[],checkins:[],water:{},active:null},v=0,subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:next=>{state=next;v++;subs.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const {withServingWeight,allowedUnits,nutrientsFor,foodIn,foodOut,diary,getDB,update}=require(out);
const base={brand:null,barcode:null,origin:'custom',servingSize:null,servingLabel:null,sugars:null,saturates:null,fibre:3,salt:null,ingredients:null};
const close=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-9,`${msg}: ${a} vs ${b}`);

// 1. Per-serving food becomes per-gram with the same nutrition.
const banana={...base,id:'banana',name:'Banana',refAmount:1,refUnit:'serving',kcal:105,protein:1,carbs:27,fat:0};
assert.deepEqual(allowedUnits(banana),['serving'],'servings only before');
const b2=withServingWeight(banana,120);
assert.deepEqual(allowedUnits(b2),['g','serving'],'both units after');
assert.equal(b2.refUnit,'g');assert.equal(b2.refAmount,120);assert.equal(b2.servingSize,120);
close(nutrientsFor(b2,1,'serving').kcal,105,'1 serving unchanged');
close(nutrientsFor(b2,2,'serving').kcal,210,'2 servings unchanged');
close(nutrientsFor(b2,120,'g').kcal,105,'120 g = 1 serving');
close(nutrientsFor(b2,60,'g').fibre,1.5,'fibre scales');
// A label for 2 servings (basis 2) keeps its meaning too.
const twoServ={...banana,id:'two',refAmount:2,kcal:210};
close(nutrientsFor(withServingWeight(twoServ,120),1,'serving').kcal,105,'basis 2 servings');

// 2. Per-gram food gains servings.
const rice={...base,id:'rice',name:'Rice',refAmount:100,refUnit:'g',kcal:130,protein:2.7,carbs:28,fat:.3};
assert.deepEqual(allowedUnits(rice),['g'],'grams only before');
const r2=withServingWeight(rice,150);
assert.deepEqual(allowedUnits(r2),['g','serving']);
close(nutrientsFor(r2,1,'serving').kcal,195,'1 serving of 150 g');
close(nutrientsFor(r2,100,'g').kcal,130,'grams unchanged');

// 3. Invalid weights change nothing.
for(const w of [0,-5,NaN,Infinity])assert.equal(withServingWeight(rice,w),rice,'ignored '+w);

// 4. Saving and loading keeps the weight; foods without one stay as before.
const back=foodIn(foodOut(r2));
assert.equal(back.servingSize,150);assert.equal(back.servingLabel,'serving');
assert.equal(foodIn(foodOut(rice)).servingSize,null);
assert.equal('servingSize' in foodOut(rice),false,'no new key for foods without a serving weight');

// 5. The stored diary: meals keep the right calories after the conversion.
update(d=>{d.customFoods=[banana];});
const e1=diary.add('2026-11-07','breakfast',banana,2,'serving'),e2=diary.add('2026-11-08','snacks',banana,1,'serving'),other=diary.add('2026-11-07','lunch',rice,200,'g');
diary.setServingWeight('banana',120);
const db=getDB(),byId=id=>db.diary.find(e=>e.id===id);
assert.equal(byId(e1.id).food.servingSize,120);assert.equal(byId(e2.id).food.servingSize,120);
assert.equal(byId(other.id).food.servingSize,null,'other foods untouched');
assert.equal(db.customFoods[0].servingSize,120,'saved food updated');
close(nutrientsFor(byId(e1.id).food,byId(e1.id).amount,byId(e1.id).unit).kcal,210,'logged entry calories unchanged');
const m1=state.meals.find(m=>m.id===e1.id);
close(m1.cal,210,'stored meal calories');assert.equal(m1.labelFood.servingSize,120,'stored label keeps the weight');

// 6. Changing the weight later (a bigger serving when bulking): the entry being edited uses the new weight,
//    every other entry logged in servings keeps its calories by moving to grams at its old weight.
diary.setServingWeight('banana',150,e1.id);
const db2=getDB(),get=id=>db2.diary.find(e=>e.id===id),kcal=e=>nutrientsFor(e.food,e.amount,e.unit).kcal;
assert.equal(get(e1.id).unit,'serving');assert.equal(get(e1.id).amount,2);close(kcal(get(e1.id)),262.5,'edited entry: 2 servings of 150 g');
assert.equal(get(e2.id).unit,'g');assert.equal(get(e2.id).amount,120);close(kcal(get(e2.id)),105,'other entry keeps its calories');
assert.equal(get(e2.id).food.servingSize,150,'other entry knows the new weight');
close(state.meals.find(m=>m.id===e2.id).cal,105,'stored meal for the other entry unchanged');
close(state.meals.find(m=>m.id===e1.id).cal,262.5,'stored meal for the edited entry');
// Setting the same weight again changes nothing.
diary.setServingWeight('banana',150);assert.equal(getDB().diary.find(e=>e.id===e1.id).unit,'serving','same weight leaves servings alone');
console.log('PASS serving weight: per-serving and per-gram foods gain the other unit with unchanged nutrition, invalid weights ignored, saved and loaded, every logged copy and the saved food updated, stored meal calories unchanged; a later weight change keeps the calories of other entries (moved to grams) and applies to the edited entry');
