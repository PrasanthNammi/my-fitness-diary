const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const child=spawnSync(process.execPath,['--require','./tests/no-network.cjs','scripts-smoke-c1c-safari-e2e.cjs'],{encoding:'utf8'});
assert.equal(child.status,0,child.stderr);const p=JSON.parse(child.stdout);
assert.equal(p.native_safari_bridge_simulated,true);assert.equal(p.actual_safari,false);assert.equal(p.hosted_requests,0);
assert.equal(p.preparation_recovery_before_auth,true);assert.equal(p.retained_replayed_session_row,true);assert.equal(p.installed_replay_guard,true);assert.equal(p.runner_requests,23);assert.equal(p.preserved_original_synthetic_sessions,2);assert.equal(p.synthetic_grants_and_fixtures_unchanged,true);
for(const name of ['ISSUED_SIGNATURE_primary','CROSS_OWNER_DENIED_secondary','OLD_NONPARENT_REJECTED','REPLAY_SESSION_RPC_DENIED','GENUINE_EXPIRY_DENIED','SIGNED_OUT_RPC_DENIED'])assert(p.passed_checks.includes(name));
console.log('PASS Safari-capture modeled end-to-end SDK/ES256/RLS/lifecycle chain, original state preserved; real provider/native Safari not claimed');
