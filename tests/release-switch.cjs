// MFD 3.0 switched on per person (frontend/lib/release.ts): off unless this device remembers "on"; the import frame
// sees the same answer; after sign-in the server's answer (mfd3_enabled) is checked and the app reloads only when it
// changed; an error or offline keeps the remembered answer.
const assert = require('node:assert/strict'), esbuild = require('esbuild'), path = require('path'), os = require('os'), fs = require('fs');
const out = path.join(fs.realpathSync(os.tmpdir()), 'mfd-release-switch.cjs');
esbuild.buildSync({ entryPoints: ['frontend/lib/release.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent' });

function load({ stored, answer, error }) {
  const store = new Map(stored == null ? [] : [['mfd3', stored]]), calls = { reload: 0, rpc: [] };
  // Node has its own localStorage; replace it for this test.
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, configurable: true, writable: true });
  globalThis.location = { reload: () => { calls.reload++; } };
  const supabase = { rpc: async (name) => { calls.rpc.push(name); return error ? { data: null, error: { message: 'offline' } } : { data: answer, error: null }; } };
  globalThis.document = { getElementById: () => ({ contentWindow: { MFDBridge: { client: () => supabase } } }) };
  delete require.cache[out];
  return { api: require(out), store, calls };
}

(async () => {
  let t = load({ stored: null, answer: false });
  assert.equal(t.api.MFD3, false, 'off by default');
  assert.deepEqual(globalThis.mfdRelease, { mfd3: false }, 'import frame sees the same');
  await t.api.refreshMfd3();
  assert.deepEqual([t.calls.rpc, t.calls.reload], [['mfd3_enabled'], 0], 'asked; same answer: no reload');

  t = load({ stored: null, answer: true });
  await t.api.refreshMfd3();
  assert.deepEqual([t.store.get('mfd3'), t.calls.reload], ['1', 1], 'switched on: remembered and reloaded once');

  t = load({ stored: '1', answer: true });
  assert.equal(t.api.MFD3, true, 'remembered on');
  assert.deepEqual(globalThis.mfdRelease, { mfd3: true });
  await t.api.refreshMfd3();
  assert.equal(t.calls.reload, 0, 'still on: no reload');

  t = load({ stored: '1', answer: false });
  await t.api.refreshMfd3();
  assert.deepEqual([t.store.get('mfd3'), t.calls.reload], ['0', 1], 'switched off again: reloads to today\'s app');

  t = load({ stored: '1', error: true });
  await t.api.refreshMfd3();
  assert.deepEqual([t.api.MFD3, t.store.get('mfd3'), t.calls.reload], [true, '1', 0], 'offline: keeps the remembered answer');

  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => { throw new Error('blocked'); } }, configurable: true, writable: true });
  delete require.cache[out];
  assert.equal(require(out).MFD3, false, 'storage blocked: off');

  fs.rmSync(out, { force: true });
  console.log('release switch: off unless remembered; import frame agrees; reload only when the server\'s answer changes; offline keeps it');
})().catch((e) => { console.error(e); process.exit(1); });
