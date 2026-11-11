// Synthetic preflight data only; no hosted identifiers beyond the public client/resource constants.
const assert=require('node:assert/strict'),{compare}=require('../scripts/c1c-final-preflight-compare.cjs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='fcad3c45-07cd-418a-978a-7e1d94ee0406';
const mapping={primary_uuid:A,secondary_uuid:B},h=i=>String(i).padStart(64,'0');
const session=(i,user,extra={})=>({hash:h(i),user_id:user,created_at:'2026-10-20T10:00:00Z',not_after_null:true,oauth_client:null,refresh_unrevoked:1,refresh_revoked:0,...extra});
function base(){const sessions=[session(1,A,{oauth_client:C}),session(2,B,{oauth_client:C})];for(let i=3;i<=13;i++)sessions.push(session(i,i%2?A:B));
 sessions[3]={...sessions[3],user_id:A,refresh_unrevoked:0,refresh_revoked:3};
 sessions.push(session(14,A,{created_at:'2026-10-30T16:20:00Z',refresh_unrevoked:0,refresh_revoked:2}),session(15,B,{created_at:'2026-10-30T16:22:00Z'}));
 return {observed_at:new Date().toISOString(),users:[A,B],identities:{count:4},oauth_clients:[{id:C,client_type:'public',registration_type:'manual',deleted:false}],
  oauth_consents:[{user_id:A,client_id:C,scopes:'profile',active:true},{user_id:B,client_id:C,scopes:'profile',active:true}],local_clients:[C],
  grants:[{user_id:A,client_id:C,permissions:['profile']},{user_id:B,client_id:C,permissions:['profile']}],workspaces:[{user_id:A,revision:1},{user_id:B,revision:1}],proposals:0,
  settings:[{writes_enabled:false,resource_uri:'https://mfd-connect-staging.shanustylish777.workers.dev/mcp'}],
  dispatcher:{body_md5:'2e64d4e8a8d55ca50701e764a70d0258',owner:'postgres',definer:true,config:['search_path=""'],acl:['authenticated=X/postgres','postgres=X/postgres'],anon_exec:false},
  wrapper:{body_md5:'c0586b393b1d82332c88f1b1123f57c5',owner:'postgres',definer:false,config:['search_path=""'],acl:['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres'],anon_exec:false},
  rls:[{table:'public.forma_workspaces',rls:true}],policies_md5:'p',storage:{buckets:[{id:'x',public:false}],objects:0},sessions};}
const known=Array.from({length:13},(_,i)=>h(i+1)),fail=(p,opts={})=>compare(p,{mapping,knownHashes:known,...opts}).results.filter(r=>!r.ok).map(r=>r.label);
assert.deepEqual(fail(base()),[]);
const mutate=(fn)=>{const p=base();fn(p);return p;};
assert.deepEqual(fail(mutate(p=>p.grants[1].permissions=['profile','nutrition'])),['GRANTS_PROFILE_ONLY']);
assert.deepEqual(fail(mutate(p=>p.dispatcher.acl.push('anon=X/postgres'))),['DISPATCHER_SECURITY']);
assert.deepEqual(fail(mutate(p=>p.wrapper.acl=['authenticated=X/postgres','postgres=X/postgres'])),['WRAPPER_PRESERVED']);
assert.deepEqual(fail(mutate(p=>p.dispatcher.body_md5='7d93d522e07936bca67faa53903d4868')),['DISPATCHER_BODY']);
assert.deepEqual(fail(mutate(p=>p.settings[0].writes_enabled=true)),['WRITES_FALSE']);
// Hosted jsonb returns object keys in its own order; settings must not depend on key order.
assert.deepEqual(fail(mutate(p=>p.settings=[{resource_uri:p.settings[0].resource_uri,writes_enabled:false}])),[]);
assert.deepEqual(fail(mutate(p=>p.settings.push({...p.settings[0]}))),['WRITES_FALSE']);
assert(fail(mutate(p=>p.sessions.splice(5,1))).includes('KNOWN_SESSIONS_RETAINED'));
assert(fail(mutate(p=>p.sessions[0].refresh_unrevoked=0)).includes('CONNECTION_SESSIONS_LIVE'));
assert(fail(mutate(p=>p.sessions[14].created_at='2026-11-01T10:00:00Z')).includes('UNRECORDED_ARE_STEPWISE_BATCH'));
assert(fail(mutate(p=>p.oauth_clients.push({id:'dyn',client_type:'public',registration_type:'dynamic',deleted:false}))).includes('NO_DYNAMIC_CLIENT'));
assert.deepEqual(fail(mutate(p=>p.users.push('33333333-3333-4333-8333-333333333333'))).slice(0,1),['USERS_EXACT']);
// Postcheck mode: successful completion leaves the set unchanged; a stopped run may add one secondary first-party row only.
const pre=base();assert.deepEqual(fail(base(),{previous:pre}),[]);
assert.deepEqual(fail(mutate(p=>p.sessions.push(session(99,B))),{previous:pre}),[]);
assert(fail(mutate(p=>p.sessions.push(session(99,A))),{previous:pre}).includes('ONLY_DISPOSABLE_ADDED'));
assert(fail(mutate(p=>p.sessions.splice(0,1)),{previous:pre}).includes('PREFLIGHT_SESSIONS_RETAINED'));
assert(fail(mutate(p=>p.oauth_consents[0].active=false),{previous:pre}).includes('CONSENTS_UNCHANGED'));
console.log('PASS final preflight comparator: exact users/grants/ACL/body/writes/storage/session-set checks and postcheck disposable-only delta');
