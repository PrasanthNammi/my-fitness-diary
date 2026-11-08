// suggest_workout_targets on embedded PostgreSQL, on top of the production connector script:
// consent ("log_routines") required, routine by exact name (case-insensitive), validated targets, idempotent
// request_id, shared daily limit, writes switch, newest 30 kept, other users untouched, nothing else in the
// diary changes (routines, workouts, meals), and every other operation still goes through mfd_mcp.dispatch.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const as='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',bs='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',RES='https://mfd-connect.invalid/mcp';
const diary=name=>({profile:{name,cal:2200,protein:130,carbs:260,fat:70,days:3},checkins:[],chat:[],weights:[],meals:[{id:name+'-m',date:'2026-10-01',cal:500,p:30,c:50,f:10}],
 routines:[{id:name+'-r1',name:'Upper 1',exercises:[{name:'Bench Press',sets:3,reps:8,kg:60}]},{id:name+'-r2',name:'Lower 1',exercises:[{name:'Squat',sets:3,reps:5,kg:80}]}],
 sessions:[{id:name+'-s',date:'2026-10-02',name:'Upper 1',started:1,finished:2,sets:[{exercise:'Bench Press',kg:60,reps:8,done:true}]}]});
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create schema auth;
 create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table auth.refresh_tokens(id bigserial primary key,session_id uuid,user_id varchar(255),revoked boolean);
 create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
 insert into auth.users values('${alice}'),('${bob}'); insert into auth.sessions values('${as}','${alice}'),('${bs}','${bob}');
 insert into auth.refresh_tokens(session_id,user_id,revoked) values('${as}','${alice}',false),('${bs}','${bob}',false);`);
 await db.exec(readFileSync('database/schema.sql','utf8'));
 await db.exec(readFileSync('database/sync-observability.sql','utf8'));
 await db.exec(readFileSync('database/production/mcp-production.sql','utf8'));
 const suggestSql=readFileSync('database/mcp-suggest-targets.sql','utf8');
 await db.exec(suggestSql);await db.exec(suggestSql); // safe to re-run
 await db.exec(`insert into mfd_mcp.clients values('worker'); update mfd_mcp.settings set resource_uri='${RES}';`);
 for(const [u,name] of [[alice,'alice'],[bob,'bob']])await db.query('insert into public.forma_workspaces(user_id,payload) values($1,$2::jsonb)',[u,JSON.stringify(diary(name))]);
 async function as_(user,worker){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:user===alice?as:bs,...(worker?{client_id:'worker',aud:RES}:{aud:'authenticated'})})]);await db.exec('set role authenticated');}
 const rpc=async(op,args={})=>(await db.query('select public.mfd_mcp($1,$2::jsonb) as r',[op,JSON.stringify(args)])).rows[0].r;
 const sql=async q=>{await db.exec('reset role');return (await db.query(q)).rows;};
 const doc=async u=>(await sql(`select payload,revision from public.forma_workspaces where user_id='${u}'`))[0];
 const a=args=>({connection:'app-a',...args});
 const good={routine:'upper 1',note:'Small step up.',exercises:[{exercise:'Bench Press',reason:'8 reps on every set.',sets:[{type:'warmup',kg:30,reps:8},{kg:62.5,reps:8},{kg:62.5,reps:7}]},{exercise:'Plank',sets:[{duration_seconds:60}]}]};

 // Consent: reading or other write permissions are not enough.
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','routines','log_workouts']});
 await as_(alice,true);await assert.rejects(rpc('suggest_workout_targets',a(good)),/Consent required/);
 await as_(alice);await rpc('consent',{client_id:'app-a',permissions:['workouts','routines','log_workouts','log_routines']});
 // Writes switched off.
 await sql('update mfd_mcp.settings set writes_enabled=false');await as_(alice,true);
 await assert.rejects(rpc('suggest_workout_targets',a(good)),/turned off/);
 await sql('update mfd_mcp.settings set writes_enabled=true');
 // Browser session (no worker client) cannot call it; a missing connection is refused.
 await as_(alice);await assert.rejects(rpc('suggest_workout_targets',a(good)),/Invalid audience/);
 await as_(alice,true);await assert.rejects(rpc('suggest_workout_targets',{...good}),/Connection required/);

 const before=await doc(alice);
 const r=await rpc('suggest_workout_targets',a({...good,request_id:'s-1'}));
 assert.equal(r.routine,'Upper 1');assert.equal(r.exercises,2);assert.ok(r.id&&r.revision===Number(before.revision)+1);
 const after=await doc(alice),s=after.payload.aiSuggestions;
 assert.equal(s.length,1);
 const e=s[0];
 assert.equal(e.routineId,'alice-r1');assert.equal(e.routineName,'Upper 1');assert.equal(e.status,'pending');assert.equal(e.note,'Small step up.');
 assert.ok(Math.abs(e.createdAt-Date.now())<60000,'createdAt is now (ms)');
 assert.deepEqual(e.exercises,[{exercise:'Bench Press',reason:'8 reps on every set.',sets:[{type:'warmup',kg:30,reps:8},{kg:62.5,reps:8},{kg:62.5,reps:7}]},{exercise:'Plank',sets:[{duration_seconds:60}]}]);
 assert.equal(e.addedBy.connection,'app-a');assert.equal(e.addedBy.request,'s-1');
 // Nothing else in the diary changed.
 for(const k of ['routines','sessions','meals','profile','weights'])assert.deepEqual(after.payload[k],before.payload[k],k+' untouched');
 // Same request_id: no duplicate, no new revision.
 const dup=await rpc('suggest_workout_targets',a({...good,request_id:'s-1'}));assert.equal(dup.duplicate,true);assert.equal(dup.id,r.id);
 assert.equal(Number((await doc(alice)).revision),Number(after.revision));
 // Bob untouched.
 assert.equal((await doc(bob)).payload.aiSuggestions,undefined,'other users untouched');

 // Validation.
 const bad=[
  {...good,routine:'Push Day'},{...good,routine:''},{...good,routine:5},{...good,exercises:[]},{...good,note:'x'.repeat(301)},
  {...good,exercises:[{exercise:'',sets:[{reps:5}]}]},{...good,exercises:[{exercise:'Bench Press',sets:[]}]},
  {...good,exercises:[{exercise:'Bench Press',sets:[{}]}]},{...good,exercises:[{exercise:'Bench Press',sets:[{kg:-1,reps:5}]}]},
  {...good,exercises:[{exercise:'Bench Press',sets:[{kg:60,reps:5.5}]}]},{...good,exercises:[{exercise:'Bench Press',sets:[{kg:'heavy',reps:5}]}]},
  {...good,exercises:[{exercise:'Bench Press',sets:[{kg:60,reps:5,type:'super'}]}]},{...good,exercises:[{exercise:'Bench Press',reason:'x'.repeat(301),sets:[{reps:5}]}]},
  {...good,exercises:[{exercise:'Bench Press',sets:Array(21).fill({reps:5})}]},{...good,request_id:'bad id!'},
 ];
 for(const x of bad)await assert.rejects(rpc('suggest_workout_targets',a(x)),/Invalid|not found/,JSON.stringify(x).slice(0,80));
 await assert.rejects(rpc('suggest_workout_targets',a({...good,routine:'Push Day'})),/Routine "Push Day" not found; use get_routines/);

 // Newest 30 kept.
 await sql(`delete from mfd_mcp.write_counts`);
 for(let i=0;i<31;i++){if(i===15)await sql('delete from mfd_mcp.write_counts');await rpc('suggest_workout_targets',a({...good,routine:i%2?'Lower 1':'Upper 1',note:'n'+i}));}
 const many=(await doc(alice)).payload.aiSuggestions;assert.equal(many.length,30,'capped at 30');assert.equal(many.at(-1).note,'n30','newest last');assert.ok(!many.some(x=>x.id===r.id),'oldest dropped');
 // Shared daily limit (30 per app per day, counted with the other add tools).
 await sql('delete from mfd_mcp.write_counts');for(let i=0;i<30;i++)await rpc('suggest_workout_targets',a(good));
 await assert.rejects(rpc('suggest_workout_targets',a(good)),/Daily limit/);
 const today=(await sql("select (now() at time zone 'UTC')::date::text d"))[0].d;await as_(alice,true);
 await assert.rejects(rpc('log_workout',a({date:today,exercises:[{exercise:'Squat',sets:[{kg:80,reps:5}]}]})),/Daily limit/,'the limit is shared');
 // Everything else still goes to the dispatcher.
 const routines=await rpc('routines',a({}));assert.equal(routines.data.length,2,'reads still work');
 await assert.rejects(rpc('nonsense',a({})),/Unknown operation|Consent required/);
 // Revoked consent stops it immediately.
 await sql(`delete from mfd_mcp.write_counts`);await as_(alice);await rpc('revoke',{client_id:'app-a'});await as_(alice,true);
 await assert.rejects(rpc('suggest_workout_targets',a(good)),/Consent required/);
 console.log('PASS suggest_workout_targets: consent and audience checks, writes switch, routine by name, stored shape, nothing else changed, idempotent request_id, other users untouched, validation, newest 30 kept, shared daily limit, dispatcher unchanged, revoke');
})().catch(e=>{console.error(e);process.exit(1)});
