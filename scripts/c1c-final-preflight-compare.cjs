// C.1C final acceptance comparator for database/staging/c1c-final-preflight.readonly.sql output.
// Local only: reads a saved read-only result, prints fixed check labels, never prints identifiers beyond hashes/counts.
// --approved writes the restricted secondary-h3-completion baseline only after every check passes.
const fs=require('node:fs'),crypto=require('node:crypto');
const CLIENT='fcad3c45-07cd-418a-978a-7e1d94ee0406',RESOURCE='https://mfd-connect-staging.shanustylish777.workers.dev/mcp';
const DISPATCHER='2e64d4e8a8d55ca50701e764a70d0258',WRAPPER='c0586b393b1d82332c88f1b1123f57c5';
const BATCH_START=Date.parse('2026-10-30T15:00:00Z'),BATCH_END=Date.parse('2026-10-30T18:00:00Z');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function compare(p,{mapping,knownHashes,previous}){
 const results=[];const check=(label,ok)=>results.push({label,ok:!!ok});
 const owners=[mapping.primary_uuid,mapping.secondary_uuid].sort(),isOwner=u=>owners.includes(u);
 check('USERS_EXACT',same(p.users,owners));
 check('IDENTITIES_4',p.identities?.count===4);
 const native=p.oauth_clients||[];
 check('NATIVE_CLIENT_SOLE',native.length===1&&native[0].id===CLIENT&&!native[0].deleted&&native[0].client_type==='public');
 check('NO_DYNAMIC_CLIENT',native.every(c=>c.registration_type!=='dynamic'));
 check('LOCAL_CLIENT_SOLE',same(p.local_clients,[CLIENT]));
 const consents=(p.oauth_consents||[]).filter(c=>c.active);
 check('ACTIVE_CONSENTS_2',consents.length===2&&consents.every(c=>c.client_id===CLIENT&&isOwner(c.user_id))&&new Set(consents.map(c=>c.user_id)).size===2);
 check('GRANTS_PROFILE_ONLY',(p.grants||[]).length===2&&p.grants.every(g=>g.client_id===CLIENT&&isOwner(g.user_id)&&same(g.permissions,['profile']))&&new Set(p.grants.map(g=>g.user_id)).size===2);
 check('WORKSPACES_REV1',(p.workspaces||[]).length===2&&p.workspaces.every(w=>isOwner(w.user_id)&&w.revision===1));
 check('PROPOSALS_0',p.proposals===0);
 check('WRITES_FALSE',(p.settings||[]).length===1&&p.settings[0].writes_enabled===false&&p.settings[0].resource_uri===RESOURCE);
 const d=p.dispatcher||{},w=p.wrapper||{};
 check('DISPATCHER_BODY',d.body_md5===DISPATCHER);
 check('DISPATCHER_SECURITY',d.owner==='postgres'&&d.definer===true&&same(d.config,['search_path=""'])&&same(d.acl,['authenticated=X/postgres','postgres=X/postgres'])&&d.anon_exec===false);
 check('WRAPPER_PRESERVED',w.body_md5===WRAPPER&&w.owner==='postgres'&&w.definer===false&&same(w.config,['search_path=""'])&&same(w.acl,['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres'])&&w.anon_exec===false);
 check('RLS_ENABLED',(p.rls||[]).length>0&&p.rls.every(t=>t.rls===true));
 check('STORAGE_PRIVATE_EMPTY',(p.storage?.buckets||[]).every(b=>b.public===false)&&p.storage?.objects===0);
 const sessions=p.sessions||[],hashes=sessions.map(s=>s.hash);
 check('SESSIONS_OWNED',sessions.every(s=>isOwner(s.user_id)));
 check('KNOWN_SESSIONS_RETAINED',knownHashes.every(h=>hashes.includes(h)));
 const extra=sessions.filter(s=>!knownHashes.includes(s.hash));
 if(previous){
  const before=previous.sessions.map(s=>s.hash);
  check('PREFLIGHT_SESSIONS_RETAINED',before.every(h=>hashes.includes(h)));
  const added=sessions.filter(s=>!before.includes(s.hash));
  // Successful completion logs out its own session; a stopped run may leave one secondary disposable row.
  check('ONLY_DISPOSABLE_ADDED',added.length===0||(added.length===1&&added[0].user_id===mapping.secondary_uuid&&!added[0].oauth_client));
  check('POLICIES_UNCHANGED',p.policies_md5===previous.policies_md5);
  check('CONSENTS_UNCHANGED',same(p.oauth_consents,previous.oauth_consents));
 }else{
  check('SESSIONS_15',sessions.length===15);
  // The 30 Oct stepwise batch created exactly two first-party rows whose hashes were not recorded.
  check('UNRECORDED_ARE_STEPWISE_BATCH',extra.length===2&&extra.every(s=>!s.oauth_client&&Date.parse(s.created_at)>=BATCH_START&&Date.parse(s.created_at)<=BATCH_END));
 }
 const oauthSessions=sessions.filter(s=>s.oauth_client);
 check('CONNECTION_SESSIONS_LIVE',oauthSessions.length>=2&&oauthSessions.every(s=>s.refresh_unrevoked>=1)&&owners.every(u=>oauthSessions.some(s=>s.user_id===u)));
 const deadFamilies=sessions.filter(s=>s.refresh_unrevoked===0);
 // Expected: only the two H2 replay sessions (PRIMARY, fully revoked family).
 check('ONLY_H2_FAMILIES_REVOKED',deadFamilies.length===2&&deadFamilies.every(s=>s.user_id===mapping.primary_uuid&&!s.oauth_client&&s.refresh_revoked>0));
 return {pass:results.every(r=>r.ok),results,counts:{sessions:sessions.length,oauth_sessions:oauthSessions.length,revoked_families:deadFamilies.length,unrecorded:extra.length}};
}
module.exports={compare};
if(require.main===module){
 const [file,...flags]=process.argv.slice(2);const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const raw=JSON.parse(fs.readFileSync(file)),p=raw.preflight||raw;
 const mapping=JSON.parse(fs.readFileSync('.sites-runtime/c1b-two-user-evidence/uuid-mapping.json'));
 const knownHashes=JSON.parse(fs.readFileSync('.sites-runtime/c1c-acceptance/approved-safari-baseline.json')).existing_session_hashes;
 const prevFlag=flags.find(f=>f.startsWith('--previous='));
 const previous=prevFlag?(x=>x.preflight||x)(JSON.parse(fs.readFileSync(prevFlag.slice(11)))):undefined;
 const out=compare(p,{mapping,knownHashes,previous});
 for(const r of out.results)console.log((r.ok?'PASS ':'FAIL ')+r.label);
 console.log(JSON.stringify({pass:out.pass,...out.counts,observed_at:p.observed_at}));
 if(!out.pass){process.exitCode=1;return;}
 if(flags.includes('--approved')&&!previous){
  const ageMs=Date.now()-Date.parse(p.observed_at);if(!(ageMs>=0&&ageMs<=240000)){console.error('STOP preflight older than 4 minutes');process.exitCode=1;return;}
  const baseline={method:'secondary-h3-completion',project:'gngnrmzeghjzqsmzuktl',scope_approved:true,expiry_previously_verified:true,
   observed_at:new Date(Date.parse(p.observed_at)).toISOString(),manifest_sha256:sha('docs/artifacts/c1c-h3-completion-manifest.json'),
   expiry_evidence_sha256:sha('docs/artifacts/c1c-h3-expiry-provider-evidence.json'),session_policy_safe:true,
   policy_evidence:'Operator-confirmed 30 Oct settings (single-session OFF, timebox/inactivity never, reuse detection ON) plus user approval statement of no change since; multi-session live refresh state observed in this preflight',
   existing_session_hashes:p.sessions.map(s=>s.hash),expected_dispatcher_body:DISPATCHER};
  fs.mkdirSync('.sites-runtime/c1c-acceptance',{recursive:true});
  fs.writeFileSync('.sites-runtime/c1c-acceptance/approved-h3-completion-baseline.json',JSON.stringify(baseline),{mode:0o600,flag:'wx'});
  console.log('BASELINE WRITTEN');
 }
}
