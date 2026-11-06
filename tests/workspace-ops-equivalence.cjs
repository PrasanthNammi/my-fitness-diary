// JavaScript (public/legacy/workspace-ops.js) and SQL (database/workspace-delta.sql) must agree:
// for thousands of generated document pairs, the operations computed by either side, applied by
// either side, rebuild the target exactly. Compaction gives the same document and import rows on
// both sides. Invalid operations fail on both sides.
// Needs the test database (database/tests/run.sh starts it; CI runs it); skipped otherwise.
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),{execFileSync}=require('child_process');
const testdb=require('./lib/testdb.cjs');
if(!testdb.available){console.log('SKIP workspace ops equivalence (run database/tests/run.sh, or set MFD_TEST_DB)');process.exit(0)}
const ctx={structuredClone};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/legacy/workspace-ops.js','utf8'),ctx);const O=ctx.MFDWorkspaceOps;
const psql=testdb.sql;

// ---- generator ------------------------------------------------------------------------------------
let seed=Number(process.env.SEED||20261106);const rnd=()=>((seed=(seed*1103515245+12345)%2147483648)/2147483648);
const pick=a=>a[Math.floor(rnd()*a.length)],chance=p=>rnd()<p,int=n=>Math.floor(rnd()*n);
const scalar=()=>pick([null,true,false,0,1,-3,2.5,72.3,0.1+0.2,1e6,'','a','Bench Press','ü','x"y','{','[]',String(int(1000))]);
function value(d=0){const r=rnd();if(d>2||r<0.5)return scalar();if(r<0.75){const o={};for(let i=int(4);i>0;i--)o[pick(['a','b','c','name','kg','reps','notes'])]=value(d+1);return o}return Array.from({length:int(4)},()=>value(d+1))}
function set(){const s={id:'s'+int(1e6),exercise:pick(['Bench','Squat','Row']),kg:chance(0.1)?null:pick([20,60,62.5]),reps:pick([5,8,10,null]),type:pick(['normal','warmup']),done:chance(0.9)};
 for(const f of O.NULL_FIELDS)if(chance(0.6))s[f]=chance(0.85)?null:pick([1,2,'ss1']);return s}
let nextId=0;const id=()=>pick(['w','m','r'])+(nextId++);
function session(){const s={id:chance(0.97)?id():undefined,name:pick(['Upper','Lower','Push']),started:1.7e12+int(1e9),sets:Array.from({length:int(5)},set)};if(chance(0.3))s.hevyRows=chance(0.1)?null:Array.from({length:int(3)},()=>({title:'Upper',set_index:int(5),weight_kg:pick([40,'42.5',null])}));if(s.id===undefined)delete s.id;return s}
function doc(){const d={profile:{name:'Test',onboarded:true},meals:Array.from({length:int(4)},()=>({id:id(),name:pick(['Oats','Rice']),kcal:int(600)})),weights:[],checkins:[],chat:[],
 sessions:Array.from({length:int(6)},session),routines:Array.from({length:int(3)},()=>({id:id(),name:'R',exercises:[{name:'Bench',sets:3,setDetails:Array.from({length:int(3)},set)}]})),foodFavorites:['a','b'],water:{'2026-11-06':750}};
 if(chance(0.3))d.active={id:'act',sets:Array.from({length:int(4)},set)};else d.active=null;if(chance(0.2))d.misc=value();return d}
function mutate(d){const b=structuredClone(d);for(let n=int(5)+1;n>0;n--){const k=pick(['sessions','meals','routines','profile','water','foodFavorites','active','misc','extra','weights']);const r=rnd();
  if(Array.isArray(b[k])&&r<0.75){const l=b[k];const m=rnd();
   if(m<0.2)l.push(k==='sessions'?session():{id:id(),name:'new',kcal:int(600)});
   else if(m<0.35&&l.length)l.splice(int(l.length),1);
   else if(m<0.55&&l.length){const i=int(l.length);if(l[i]&&typeof l[i]==='object'){l[i]={...l[i],name:pick(['Edited','X']),kcal:int(900)};if(Array.isArray(l[i].sets)&&l[i].sets.length)l[i].sets[0]={...l[i].sets[0],kg:999}}}
   else if(m<0.7&&l.length>1){const i=int(l.length),j=int(l.length);[l[i],l[j]]=[l[j],l[i]]}
   else if(m<0.8)l.reverse();
   else if(m<0.9&&l.length)l.push(structuredClone(l[0]));// duplicate id: not keyed any more
   else l.unshift(k==='sessions'?session():{id:id(),name:'first'});}
  else if(r<0.85)b[k]=value();
  else if(r<0.95)delete b[k];
  else b[k]=chance(0.5)?[]:{};}
 return b}
const cases=[];for(let n=0;n<Number(process.env.CASES||1500);n++){const a=doc();cases.push([a,chance(0.05)?structuredClone(a):mutate(a)])}
// Operations that must be rejected (or produce identical results) on both sides.
const badOps=[[{k:'sessions',i:'missing',d:true}],[{k:'sessions',o:['nope']}],[{k:'profile',i:'x',v:{id:'x'}}],[{k:'meals',i:'m1',v:{id:'other'}}],[{x:1}],[{k:'sessions',i:'w1'}],[{k:1,v:2}],[{k:'meals',o:[]}]];

// ---- run SQL in one batch --------------------------------------------------------------------------
const lit=v=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const jsOps=cases.map(([a,b])=>O.diff(a,b));
let sql=`create temp table c(n int,a jsonb,b jsonb,ops jsonb);
create function pg_temp.try_apply(d jsonb,o jsonb) returns jsonb language plpgsql as $$begin return jsonb_build_object('ok',mfd_private.workspace_apply(d,o));exception when others then return jsonb_build_object('error',sqlerrm);end$$;\n`;
cases.forEach(([a,b],n)=>{sql+=`insert into c values(${n},${lit(a)},${lit(b)},${lit(jsOps[n])});\n`});
badOps.forEach((ops,n)=>{sql+=`insert into c values(${-1-n},${lit(cases[0][0])},null,${lit(ops)});\n`});
sql+=`select json_build_object('n',n,'sqlOps',case when b is null then null else mfd_private.workspace_diff(a,b) end,
 'sqlApplySql',case when b is null then null else pg_temp.try_apply(a,mfd_private.workspace_diff(a,b)) end,
 'sqlApplyJs',pg_temp.try_apply(a,ops),'compact',(select row_to_json(x) from mfd_private.workspace_compact(a) x))::text from c order by n;`;
const rows=psql(sql).trim().split('\n').map(l=>JSON.parse(l));
const byN=new Map(rows.map(r=>[r.n,r]));

// ---- compare -----------------------------------------------------------------------------------
let checked=0;const opCounts={item:0,order:0,whole:0,remove:0};
cases.forEach(([a,b],n)=>{const r=byN.get(n),ops=jsOps[n];
 for(const op of ops){if('o' in op)opCounts.order++;else if('i' in op)opCounts.item++;else if(op.d)opCounts.remove++;else opCounts.whole++}
 assert.ok(O.equal(O.apply(a,ops),b),`case ${n}: JS apply(JS diff) != target`);
 assert.ok(r.sqlApplySql.ok!==undefined&&O.equal(r.sqlApplySql.ok,b),`case ${n}: SQL apply(SQL diff) != target ${JSON.stringify(r.sqlApplySql.error||'')}`);
 assert.ok(r.sqlApplyJs.ok!==undefined&&O.equal(r.sqlApplyJs.ok,b),`case ${n}: SQL apply(JS diff) != target ${JSON.stringify(r.sqlApplyJs.error||'')}`);
 assert.ok(O.equal(O.apply(a,r.sqlOps),b),`case ${n}: JS apply(SQL diff) != target`);
 if(O.equal(a,b))assert.equal(ops.length,0,`case ${n}: equal documents need no operations`);
 const c=O.compact(a);assert.ok(O.equal(c.document,r.compact.document),`case ${n}: compaction differs`);assert.ok(O.equal(c.imports,r.compact.imports),`case ${n}: import rows differ`);
 const twice=O.compact(c.document);assert.ok(twice.document===c.document&&Object.keys(twice.imports).length===0,`case ${n}: compaction not idempotent`);
 // Nothing but the listed null fields and moved rows disappears.
 const restored=structuredClone(c.document);for(const s of restored.sessions||[])if(s&&c.imports[String(s.id)]!==undefined)s.hevyRows=c.imports[String(s.id)];
 const strip=d=>JSON.parse(JSON.stringify(d,(k,v)=>O.NULL_FIELDS.includes(k)&&v===null?undefined:(k==='hevyRows'&&v===null?undefined:v)));
 assert.ok(O.equal(strip(restored),strip(a)),`case ${n}: compaction lost data`);
 checked++});
badOps.forEach((ops,n)=>{const r=byN.get(-1-n);let js;try{js={ok:O.apply(cases[0][0],ops)}}catch(e){js={error:e.message}}
 assert.equal('error' in js,'error' in r.sqlApplyJs,`bad op ${n}: JS ${JSON.stringify(js.error)} vs SQL ${JSON.stringify(r.sqlApplyJs.error)}`);
 if(js.ok)assert.ok(O.equal(js.ok,r.sqlApplyJs.ok))});
assert.ok(opCounts.item>500&&opCounts.order>50&&opCounts.whole>200&&opCounts.remove>20,'generator covers every kind of operation: '+JSON.stringify(opCounts));
console.log(`PASS workspace ops: ${checked} document pairs, JS/SQL diff×apply in all 4 combinations, compaction equal+idempotent+lossless, ${badOps.length} invalid changes rejected alike (${JSON.stringify(opCounts)})`);
