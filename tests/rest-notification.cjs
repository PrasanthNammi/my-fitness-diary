// Rest timer in the notification bar. On screen it counts down ("1:25 left"); in the background Android pauses
// MFD, so it shows the end time ("ends at …"), which can't go stale. In the background, −15s / +15s go to the push
// service (which holds the rest then), not to the possibly paused window.
const assert = require('assert/strict'), esbuild = require('esbuild'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');

const out = path.join(os.tmpdir(), 'mfd-rest-notification.cjs');
esbuild.buildSync({ entryPoints: ['frontend/lib/restNotification.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error' });
const { restingText } = require(out);
const now = Date.UTC(2026, 10, 11, 10, 40, 0), ends = now + 85_000;
assert.equal(restingText(ends, now, false), '1:25 left');
assert.equal(restingText(ends, now + 84_100, false), '0:01 left', 'rounds up');
assert.equal(restingText(ends, ends + 5000, false), '0:00 left', 'never negative');
const bg = restingText(ends, now, true);
assert.match(bg, /^ends at /);
assert.equal(restingText(ends, now + 30_000, true), bg, 'background text does not change while time passes (cannot go stale)');
assert.notEqual(restingText(ends + 15_000, now, true), bg, 'moving the end time changes it');

// Service worker: where a −15s / +15s press goes.
async function press(data, windows) {
  const posted = [], fetched = [], listeners = {};
  const self = {
    addEventListener: (t, f) => { listeners[t] = f; }, location: { origin: 'https://mfd.example' },
    clients: { matchAll: async () => windows.map((url) => ({ url, postMessage: (m) => posted.push(m) })) },
    registration: {},
  };
  const sandbox = { self, URL, fetch: async (u, o) => { fetched.push([u, JSON.parse(o.body)]); return { ok: true }; }, MessageChannel, setTimeout, clearTimeout, Set };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src-sw-template.js', 'utf8').replace('__VERSION__', 'test').replace('__ASSETS__', '[]').replace('__CORE__', '[]'), sandbox);
  let wait;
  listeners.notificationclick({ action: 'plus15', notification: { data, close() {} }, waitUntil: (p) => { wait = p; } });
  await wait;
  return JSON.parse(JSON.stringify({ posted, fetched })); // plain objects (the worker runs in its own realm)
}
(async () => {
  const open = ['https://mfd.example/#/workout'];
  let r = await press({ id: 'b1', local: true, background: false }, open);
  assert.deepEqual(r.posted, [{ type: 'MFD_REST_ADJUST', id: 'b1', sec: 15 }], 'on screen: the window adjusts');
  assert.equal(r.fetched.length, 0);
  r = await press({ id: 'b1', local: true, background: true }, open);
  assert.equal(r.posted.length, 0, 'background: not sent to the paused window');
  assert.deepEqual(r.fetched, [['/api/push/rests/adjust', { id: 'b1', sec: 15 }]], 'background: the push service adjusts');
  // A rest notification sent by the push service (MFD was away) keeps its buttons on the push service.
  const shown = [];
  {
    const listeners = {}, self = { addEventListener: (t, f) => { listeners[t] = f; }, location: { origin: 'https://mfd.example' }, clients: { matchAll: async () => [] },
      registration: { getNotifications: async () => [], showNotification: async (title, o) => { shown.push(o.data); } } };
    const sandbox = { self, URL, MessageChannel, setTimeout, clearTimeout, Set }; vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync('src-sw-template.js', 'utf8').replace('__VERSION__', 'test').replace('__ASSETS__', '[]').replace('__CORE__', '[]'), sandbox);
    let wait; listeners.push({ data: { json: () => ({ title: 'Resting · Bench', body: 'ends at 10:42:15', tag: 'rest', id: 'b1', silent: true, actions: ['minus15', 'plus15'] }) }, waitUntil: (p) => { wait = p; } }); await wait;
  }
  assert.equal(shown[0].background, true, 'server rest notification is marked as background');
  r = await press(JSON.parse(JSON.stringify(shown[0])), open);
  assert.equal(r.posted.length, 0); assert.equal(r.fetched.length, 1, 'its buttons go to the push service');
  r = await press({ id: 'b1' }, []);
  assert.deepEqual(r.fetched, [['/api/push/rests/adjust', { id: 'b1', sec: 15 }]], 'no window: the push service adjusts');
  console.log('PASS rest notification: countdown on screen, fixed end time in the background, ±15s routed to the push service when hidden');
})().catch((e) => { console.error(e); process.exit(1); });
