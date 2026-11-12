// Watch quick logs on the phone: weigh-in, water (a change, never an overwrite), logging a food again (only foods the
// person has, in a unit the food allows), the morning check-in (keeps sleep and note). Filed under the day tapped.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-watch-quicklogs.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/watchQuickLogs.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const Q=require(out);
const oats={id:'oats',name:'Oats with milk',origin:'custom',refAmount:1,refUnit:'serving',servingSize:null,kcal:420,protein:18,carbs:60,fat:10};
const egg={id:'egg',name:'Egg',origin:'custom',refAmount:100,refUnit:'g',servingSize:50,kcal:143,protein:13,carbs:1,fat:10};
const at=new Date(2026,10,12,8,30).getTime(),day='2026-11-12';
const d=()=>({water:{[day]:500},diary:[{id:'e1',date:'2026-11-11',meal:'breakfast',food:oats,amount:1,unit:'serving',createdAt:1}],settings:{favouriteFoods:[egg]},
 checkins:[{id:'c1',date:day,sleep:7.2,steps:3000,note:'slept well'},{id:'m1',date:day,waist:80,note:''}]});
const calls=[];const act={logWeight:(...a)=>calls.push(['weight',...a]),setWater:(...a)=>calls.push(['water',...a]),addFood:(...a)=>calls.push(['food',a[0],a[1],a[2].id,a[3],a[4]]),saveCheckIn:c=>calls.push(['checkin',c])};
const C=(type,x)=>({v:1,id:'q'+Math.random(),type,at,...x});
assert.ok(Q.applyQuickLog(C('weighIn',{kg:81.349}),d(),act));
assert.ok(Q.applyQuickLog(C('water',{ml:250}),d(),act));assert.ok(Q.applyQuickLog(C('water',{ml:-1000}),d(),act));
assert.ok(Q.applyQuickLog(C('foodRelog',{from:'entry',ref:'e1',meal:'breakfast',amount:1.5,unit:'serving'}),d(),act));
assert.ok(Q.applyQuickLog(C('foodRelog',{from:'favourite',ref:'egg',meal:'snacks',amount:2,unit:'serving'}),d(),act));
assert.ok(Q.applyQuickLog(C('checkin',{energy:4,soreness:2}),d(),act));
assert.deepEqual(calls,[['weight',day,81.35],['water',day,750],['water',day,0],['food',day,'breakfast','oats',1.5,'serving'],['food',day,'snacks','egg',2,'serving'],
 ['checkin',{date:day,sleep:7.2,energy:4,soreness:2,note:'slept well'}]],'filed under the day tapped; water as a change, never below 0; check-in keeps sleep and note');
calls.length=0;
for(const [t,x] of [['weighIn',{kg:5}],['weighIn',{kg:'80'}],['water',{ml:0}],['water',{ml:2.5}],['foodRelog',{from:'entry',ref:'nope',meal:'lunch',amount:1,unit:'serving'}],
 ['foodRelog',{from:'entry',ref:'e1',meal:'brunch',amount:1,unit:'serving'}],['foodRelog',{from:'entry',ref:'e1',meal:'lunch',amount:100,unit:'g'}],['foodRelog',{from:'favourite',ref:'egg',meal:'lunch',amount:0,unit:'g'}],
 ['checkin',{energy:9}],['checkin',{}],['explode',{}]])assert.ok(!Q.applyQuickLog(C(t,x),d(),act),t+' '+JSON.stringify(x));
assert.equal(calls.length,0,'invalid quick logs change nothing');
assert.equal(Q.commandDay({at:new Date(2026,10,11,23,59).getTime()}),'2026-11-11','a late-night log stays on its day even if applied the next morning');
console.log('PASS watch quick logs: weigh-in, water as a change, food again (own foods, allowed units), check-in keeping sleep and note, the day tapped; invalid ones ignored');
