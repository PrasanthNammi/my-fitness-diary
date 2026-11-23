// Cycle & Health in the app (frontend/data/cycle.ts, adapters/compat.ts): only women can have it; switching on
// writes settings only; nobody who never uses it gets new diary parts; a day saves only what was set (an empty day
// is "not logged" again); one log per day; doses per medicine/day/time; delete removes every part.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-cycle-store.cjs');
esbuild.buildSync({stdin:{contents:`export {cycle,cycleAllowed,cycleOn,dayHasData} from './frontend/data/cycle';export {getDB,update} from './frontend/data/store';export {training} from './frontend/data/repositories';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
let state={profile:{onboarded:true,name:'Test',sex:'female',height:165,activity:1.55,goal:'Maintain',days:3},sessions:[],meals:[],products:[],weights:[],checkins:[],water:{},active:null,folders:[],routines:[]},v=0,subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:next=>{state=next;v++;subs.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const {cycle,cycleAllowed,cycleOn,dayHasData,getDB,training}=require(out);
const CYCLE=['cycleSettings','cycleDays','cycleMeds','cycleDoses','cycleLabs','cycleConditions'];

// Nothing appears for someone who never uses it, whatever else they change.
training.createFolder('Push');
assert.ok(CYCLE.every(k=>!(k in state)),'no cycle parts in the diary');
assert.deepEqual(getDB().cycle,{settings:null,days:[],meds:[],doses:[],labs:[],conditions:[]});
// Women only.
assert.equal(cycleAllowed({sex:'female'}),true);assert.equal(cycleAllowed({sex:'male'}),false);assert.equal(cycleAllowed(null),false);
assert.equal(cycleOn(getDB()),false,'off until switched on');
cycle.setEnabled(true);
assert.equal(cycleOn(getDB()),true);
assert.deepEqual(Object.keys(state).filter(k=>CYCLE.includes(k)),['cycleSettings'],'switching on writes the settings only');
assert.equal(state.cycleSettings.aiAccess,false,'AI access off by default');assert.equal(state.cycleSettings.reminderStyle,'discreet','discreet reminders by default');
assert.equal(cycleOn({profile:{sex:'male'},cycle:getDB().cycle}),false,'never shown for a male profile');
console.log('PASS access: only for women, off by default, AI access off and reminders discreet; no new diary parts for anyone who never uses it');

// One log per day, only what was set; an empty day goes back to "not logged".
cycle.saveDay({id:'2026-11-23',date:'2026-11-23',bleeding:'period',flow:'medium',pain:3,painSites:[],symptoms:{Fatigue:2},note:'',mood:undefined});
assert.deepEqual(state.cycleDays,[{id:'2026-11-23',date:'2026-11-23',bleeding:'period',flow:'medium',pain:3,symptoms:{Fatigue:2}}],'empty values left out');
cycle.saveDay({id:'x',date:'2026-11-20',nothing:true});
cycle.saveDay({id:'2026-11-23',date:'2026-11-23',bleeding:'spotting'});
assert.deepEqual(state.cycleDays.map(d=>[d.date,d.bleeding??(d.nothing?'nothing':'')]),[['2026-11-20','nothing'],['2026-11-23','spotting']],'replaced, in date order, id = date');
cycle.saveDay({id:'2026-11-20',date:'2026-11-20'});
assert.deepEqual(state.cycleDays.map(d=>d.date),['2026-11-23'],'a day with nothing set is removed again');
assert.equal(dayHasData({date:'d',symptoms:{}}),false);assert.equal(dayHasData({date:'d',nothing:true}),true);
console.log('PASS days: one per day, only what was set, "nothing to note" kept, an empty day becomes "not logged"');

// Medicines and doses; labs; conditions.
const m=cycle.saveMed({name:' Levothyroxine ',dose:50,unit:'µg',times:['07:00'],reminder:true});
assert.equal(m.name,'Levothyroxine');
cycle.setDose(m.id,'2026-11-23','07:00','taken');cycle.setDose(m.id,'2026-11-23','07:00','missed');
assert.deepEqual(state.cycleDoses,[{id:m.id+':2026-11-23:07:00',medId:m.id,date:'2026-11-23',time:'07:00',status:'missed'}],'one per medicine, day and time');
cycle.setDose(m.id,'2026-11-23','07:00',null);assert.ok(!('cycleDoses' in state),'the last dose cleared: the part is gone');
cycle.saveLab({test:'tsh',value:2.9,unit:'mIU/L',low:0.4,high:4,date:'2026-11-02'});
cycle.saveCondition({kind:'pcos',status:'diagnosed',since:'2021-03-01'});
assert.equal(state.cycleLabs.length,1);assert.equal(state.cycleConditions.length,1);
console.log('PASS medicines (taken/missed per day and time), lab results and conditions saved as entered');

// Delete all: every part gone, the section off.
cycle.deleteAll();
assert.ok(CYCLE.every(k=>!(k in state)),'no cycle parts left in the diary');
assert.ok(!('cycleSettings' in state),'settings removed');assert.equal(cycleOn(getDB()),false);
console.log('PASS delete all: every Cycle & Health record and setting removed');
