// The diary's offline copy on this device ("forma.account.<user>", its ".journal" and ".resolved"), kept in the
// browser's database storage (IndexedDB) instead of localStorage. localStorage holds about 5 MB per site, counted
// twice for each character, and a diary with years of workouts plus its journal no longer fitted ("Browser storage
// is full"). IndexedDB allows hundreds of MB. Reads stay instant: everything is loaded into memory once at start
// (MFDDevice.ready, awaited before sign-in is handled) and writes go to the database in the background.
// Old copies are moved out of localStorage on first start. Without IndexedDB, localStorage is used as before.
(function () {
  const DB = 'mfd-device', STORE = 'kv', mem = new Map();
  let db = null;
  const ours = (k) => typeof k === 'string' && k.startsWith('forma.account.');
  const open = () => new Promise((done) => {
    try {
      if (!window.indexedDB) return done(null);
      const r = window.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => done(r.result);
      r.onerror = r.onblocked = () => done(null);
    } catch { done(null); }
  });
  const readAll = (d) => new Promise((done) => {
    try {
      const out = [], c = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      c.onsuccess = () => { const x = c.result; if (x) { out.push([x.key, x.value]); x.continue(); } else done(out); };
      c.onerror = () => done(null);
    } catch { done(null); }
  });
  const write = (d, k, v) => new Promise((done) => {
    try {
      const tx = d.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
      if (v === null) st.delete(k); else st.put(v, k);
      tx.oncomplete = () => done(true);
      tx.onerror = tx.onabort = () => done(false);
    } catch { done(false); }
  });
  let late = false;
  const load = (async () => {
    const d = await open();
    const rows = d && await readAll(d);
    if (!rows) return false;
    for (const [k, v] of rows) mem.set(k, v);
    let keys = [];
    try { keys = Object.keys(localStorage).filter(ours); } catch { /* storage blocked */ }
    for (const k of keys) {
      if (late) return false;
      const v = localStorage.getItem(k);
      // A copy already in the database is newer (localStorage only had it before this change).
      if (!mem.has(k) && v !== null) { if (!await write(d, k, v)) continue; mem.set(k, v); }
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    if (late) return false; // gave up waiting: this page keeps using localStorage
    db = d;
    return true;
  })();
  // The app waits for this before signing in; a browser that never answers must not stop it (3 s, then as before).
  const ready = Promise.race([load, new Promise((done) => setTimeout(() => { late = true; done(false); }, 3000))]);
  window.MFDDevice = {
    ready,
    get(k) { return db && ours(k) ? (mem.has(k) ? mem.get(k) : null) : localStorage.getItem(k); },
    set(k, v) {
      if (!(db && ours(k))) return localStorage.setItem(k, v);
      v = String(v); mem.set(k, v);
      write(db, k, v).then((ok) => { if (!ok && typeof window.MFDDevice.onError === 'function') window.MFDDevice.onError(); });
    },
    remove(k) { if (db && ours(k)) { mem.delete(k); write(db, k, null); } else localStorage.removeItem(k); },
  };
})();
