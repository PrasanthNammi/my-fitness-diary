// Cycle & Health, step 7: reminders (what the phone schedules, in each style; the lock screen never shows health
// details; ended medicines and missing settings give nothing), period days from Health Connect (only on days without
// a log in MFD, marked; editing one makes it the person's own; nothing new = no save), and the export (one CSV per
// kind of record, everything included).
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-cycle-step7.cjs');
esbuild.buildSync({stdin:{contents:`export {reminderPlan,words} from './frontend/domain/cycleReminders';export {cycleExportFiles} from './frontend/domain/cycleExport';export {cycle} from './frontend/data/cycle';export {getDB} from './frontend/data/store';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
let state={profile:{onboarded:true,name:'Test',sex:'female',height:165,activity:1.55,goal:'Maintain',days:3},sessions:[],meals:[],products:[],weights:[],checkins:[],water:{},active:null,folders:[],routines:[]},v=0,subs=[];
const bridge={peek:()=>({state,ready:true,version:v,dataVersion:v,user:{id:'synthetic',email:'test@example.invalid'}}),catalogue:()=>({foods:[],exercises:[]}),subscribe:f=>{subs.push(f);return()=>{}},set:next=>{state=next;v++;subs.forEach(f=>f())}};
global.document={getElementById:()=>({contentWindow:{MFDBridge:bridge}})};global.window={addEventListener(){}};
const M=require(out);

// Reminders.
const settings=(x)=>({enabled:true,reminderStyle:'discreet',lockDetails:false,aiAccess:false,compare:false,healthSync:false,medReminders:true,periodSoon:true,favourites:[],customSymptoms:[],...x});
const med={id:'m1',name:'Levothyroxine',dose:50,unit:'µg',times:['07:00','bad'],reminder:true};
const est={state:'range',from:'2026-12-01',to:'2026-12-10',median:'2026-12-05',about:[],record:{errors:[],within:0,checked:0}};
const data=(s,meds=[med])=>({settings:s,days:[],meds,doses:[],labs:[],conditions:[]});
let p=M.reminderPlan(data(settings({})),est,'2026-11-23');
assert.deepEqual(p.daily.map(d=>[d.id,d.time,d.title,d.text]),[['med:m1:07:00','07:00','MFD','Reminder']],'discreet: nothing about health; invalid time skipped');
assert.deepEqual(p.once.map(o=>[o.date,o.time,o.title,o.text]),[['2026-11-29','09:00','MFD','Reminder']],'period soon: two days before the range');
assert.equal(p.lockScreen,'MFD · Reminder');
p=M.reminderPlan(data(settings({reminderStyle:'private'})),est,'2026-11-23');
assert.equal(p.daily[0].title,'Medicine reminder');assert.ok(!JSON.stringify(p).includes('Levothyroxine'),'private: no medicine name');assert.ok(!/Dec/.test(JSON.stringify(p.once)),'private: no dates');
p=M.reminderPlan(data(settings({reminderStyle:'detailed',logReminder:'21:30'})),est,'2026-11-23');
assert.equal(p.daily[0].text,'Levothyroxine 50 µg at 07:00');assert.match(p.once[0].text,/1 Dec – 10 Dec/);assert.equal(p.daily[1].id,'log');assert.equal(p.daily[1].open,'/#/progress/cycle/log/2026-11-23');
assert.ok(!/fertil|ovulat|safe/i.test(JSON.stringify(p)),'never fertile days');
assert.equal(M.reminderPlan(data(settings({}),[{...med,end:'2026-11-01'}]),est,'2026-11-23').daily.length,0,'ended medicine: no reminder');
assert.equal(M.reminderPlan(data(settings({medReminders:false,periodSoon:false})),est,'2026-11-23').daily.length,0,'switched off');
assert.equal(M.reminderPlan(data(settings({enabled:false})),est,'2026-11-23').daily.length,0,'Cycle & Health off: nothing');
assert.equal(M.reminderPlan(data(null),est,'2026-11-23').once.length,0);
assert.equal(M.reminderPlan(data(settings({})),{...est,from:'2026-11-20',to:'2026-11-28'},'2026-11-23').once[0].date,'2026-11-23','range already started: today');
assert.equal(M.reminderPlan(data(settings({})),{state:'insufficient',about:[]},'2026-11-23').once.length,0,'no estimate: no period reminder');
console.log('PASS reminders: discreet by default (nothing about health), private without names or dates, detailed with them; lock screen always neutral; ended or switched-off ones not scheduled; never fertile days');

// Health Connect periods.
M.cycle.setEnabled(true);
M.cycle.saveDay({id:'2026-11-02',date:'2026-11-02',bleeding:'spotting',note:'own'});
const before=v;
assert.equal(M.cycle.importHealthPeriods([{date:'2026-11-01',flow:'heavy'},{date:'2026-11-02',flow:'light'},{date:'bad'}]),1);
assert.equal(v,before+1,'one save');
const day=(d)=>state.cycleDays.find(x=>x.date===d);
assert.deepEqual(day('2026-11-01'),{id:'2026-11-01',date:'2026-11-01',bleeding:'period',flow:'heavy',source:'health_connect'});
assert.equal(day('2026-11-02').bleeding,'spotting','a day logged in MFD is never overwritten');
const v2=v;assert.equal(M.cycle.importHealthPeriods([{date:'2026-11-01'}]),0);assert.equal(v,v2,'nothing new: no save');
M.cycle.saveDay({...M.cycle.dayOf('2026-11-01'),pain:4});
assert.equal(day('2026-11-01').source,undefined,'edited in MFD: the person\'s own log');
console.log('PASS Health Connect periods: only on days without a log, marked as from Health Connect, never overwrite; editing makes it the person\'s own; nothing new means no save');

// Export.
M.cycle.importHealthPeriods([{date:'2026-10-05',flow:'medium'}]);
const files=M.cycleExportFiles({...M.getDB().cycle,meds:[med],doses:[{id:'d',medId:'m1',date:'2026-11-20',time:'07:00',status:'taken'}],labs:[{id:'l',test:'ft4',value:13,unit:'pmol/L',low:12,high:22,date:'2026-11-03'}],conditions:[{id:'c',kind:'pcos',status:'diagnosed'}]});
assert.deepEqual(files.map(f=>f.name),['cycle-days.csv','medicines.csv','medicine-doses.csv','lab-results.csv','conditions.csv','cycle-settings.csv']);
const text=(n)=>files.find(f=>f.name===n).text;
assert.match(text('cycle-days.csv'),/2026-10-05,,period,medium,.*Health Connect/);assert.match(text('cycle-days.csv'),/2026-11-01,,period,heavy,,,4,.*MFD/);assert.match(text('cycle-days.csv'),/2026-11-02,.*spotting.*own,MFD/);
assert.match(text('medicine-doses.csv'),/2026-11-20,07:00,Levothyroxine,taken/);assert.match(text('lab-results.csv'),/Free T4,13,pmol\/L,12,22/);assert.match(text('conditions.csv'),/pcos,diagnosed/);
console.log('PASS export: one spreadsheet per kind of record (days, medicines, doses, labs, conditions, settings), with where each day came from');
