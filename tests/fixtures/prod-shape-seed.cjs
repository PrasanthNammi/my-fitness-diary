// Writes SQL that inserts six diaries shaped like production (synthetic content).
const n0={v:0},id=p=>p+(++n0.v);
function set(g,i){return {id:id('set'),exercise:['Bench Press','Squat','Lat Pulldown','Row'][g%4],catalogId:'bench_press',catalogSource:'MFD',legacyCatalogId:'legacy_bench',tracking:'weight_reps',type:i===0?'warmup':'normal',group:g,set:i+1,kg:i===3?null:60+i*2.5,reps:8,done:true,notes:'',sourceSetIndex:i,rpe:i===2?8:null,floors:null,steps:null,custom_metric:null,distance_meters:null,duration_seconds:g===7?60:null,superset_id:g===1?'ss1':null}}
function session(k,hevy){const sets=[];for(let g=0;g<8;g++)for(let i=0;i<4;i++)sets.push(set(g,i));const s={id:'w'+k,name:'Upper '+k,date:'2025-01-01',started:1.7e12+k*86400000,finished:1.7e12+k*86400000+3600000,sets};
 if(hevy){s.importKey='hevy-'+k;s.importTimezone='Europe/Berlin';s.hevyRows=sets.map((x,i)=>({title:s.name,exercise_title:x.exercise,set_index:String(i),set_type:x.type,weight_kg:String(x.kg??''),reps:'8',rpe:''}))}return s}
function diary(sessions,hevy){return {profile:{name:'T',onboarded:true},meals:Array.from({length:45},(_,i)=>({id:'m'+i,name:'Food',kcal:300,sugar:null})),weights:[{id:'kg1',kg:72.3}],checkins:[],chat:[],
 routines:[{id:'r1',name:'Upper',exercises:[{name:'Bench',sets:2,reps:8,kg:60,setDetails:[set(0,0),set(0,1)]},{name:'Row',sets:3,reps:8,kg:40}]}],sessions:Array.from({length:sessions},(_,k)=>session(k,k<hevy)),active:sessions===7?{id:'act',sets:[set(0,0)]}:null,water:{d:750},mfdExercises:[],folders:[]}}
const lit=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
let out='';for(const [n,h] of [[277,262],[133,135],[7,0],[4,0],[0,0],[0,0]]){const u=require('crypto').randomUUID();out+=`insert into auth.users(id) values('${u}');insert into public.forma_workspaces(user_id,payload,revision) values('${u}',${lit(diary(n,Math.min(n,h)))},${10+n});\n`}
process.stdout.write(out);
