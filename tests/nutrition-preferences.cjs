const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-nutrition-preferences.cjs');esbuild.buildSync({stdin:{contents:`export * from './frontend/adapters/compat';export * from './frontend/domain/nutrition';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out});
const api=require(out),raw={profile:{onboarded:true,name:'Test',age:26,sex:'male',height:175,weight:70,target:70,activity:1.55,goal:'Maintain',days:4},sessions:[],routines:[],folders:[],meals:[],products:[],weights:[],checkins:[],water:{},active:{id:'test',name:'Warm-up',started:1000,sets:[]}};
const read=s=>api.toDB({state:s,ready:true,user:null},{exercises:[],foods:[]});let db=read(raw);
assert.equal(api.calculateTargets(db.profile).targets.waterMl,2500);db.profile.waterGoalMl=3200;
const food=api.foodIn({id:'remote:1',name:'Oats',basis:100,cal:370,p:12,c:60,f:7,fiber:10});db.settings.favouriteFoods=[food];db.favouriteFoodIds=[food.id];db.active.clock={mode:'timer',durationSec:75,valueMs:75000,startedAt:2000};
const persisted=JSON.parse(JSON.stringify(api.fromDB(db,raw,new Set(['profile','settings','favouriteFoodIds','active']))));db=read(persisted);
assert.equal(api.calculateTargets(db.profile).targets.waterMl,3200);assert.equal(db.settings.favouriteFoods[0].name,'Oats');assert.equal(db.favouriteFoodIds[0],food.id);assert.equal(db.active.clock.startedAt,2000);assert.deepEqual(db.active.exercises,[]);assert.equal(api.nutrientsFor(food,50,'g').fibre,5);assert.equal(api.sumNutrients([api.nutrientsFor({...food,fibre:null},50,'g')]).fibre,null);
console.log('PASS water goal, favourite food snapshot and independent clock survive reload; fibre scales with portions and missing data remains unknown');

const bread=api.nutrientsFor({...food,fibre:4},75,'g'), unknown=api.nutrientsFor({...food,fibre:null},200,'g');
assert.deepEqual(api.fibreSummary([bread,unknown]),{grams:3,missing:1});
assert.deepEqual(api.fibreSummary([unknown]),{grams:null,missing:1});
assert.deepEqual(api.fibreSummary([]),{grams:0,missing:0});
assert.deepEqual(api.fibreSummary([api.nutrientsFor({...food,fibre:0},100,'g')]),{grams:0,missing:0});
console.log('PASS partial daily fibre: known bread value retained beside missing values, portion scaling, empty diary and explicit zero');
