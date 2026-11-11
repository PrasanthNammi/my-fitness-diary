const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const child=spawnSync(process.execPath,['--require','./tests/no-network.cjs','scripts-smoke-c1c-manual-e2e.cjs'],{encoding:'utf8'});
assert.equal(child.status,0,child.stderr);const out=JSON.parse(child.stdout);
assert.equal(out.result,'PASS');assert.equal(out.actual_safari,false);assert.equal(out.hosted_requests,0);
assert.equal(out.manual_handoff_simulated,true);assert.equal(out.runner_requests,21);
assert.equal(out.preserved_original_synthetic_sessions,2);assert.equal(out.synthetic_grants_and_fixtures_unchanged,true);
for(const label of ['ISSUED_SIGNATURE_primary','CROSS_OWNER_DENIED_primary','CROSS_OWNER_DENIED_secondary','PROFILE_ONLY_secondary',
 'OLD_NONPARENT_REJECTED','REPLAY_SESSION_RPC_DENIED','GENUINE_EXPIRY_DENIED','SIGNED_OUT_RPC_DENIED'])assert(out.passed_checks.includes(label));
console.log('PASS manual-handoff modeled lifecycle with real SDK S256/ES256/PostgreSQL ownership and unchanged original sessions/grants; no live provider');
