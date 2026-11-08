// Cloud sync as the app shows it: one honest status, a Sync now that reports what happened, and the wake-up
// that tells the sync engine (in its own frame, which doesn't see focus) that the app is in use again.
import { engine } from '../adapters/engine';
import { toast } from '../components/ui';

export type SyncKind = 'saved' | 'saving' | 'retrying' | 'offline' | 'attention';
export type SyncView = { kind: SyncKind; label: string };

/** What the sync engine is doing, in plain words. */
export function syncView(): SyncView {
  const s = engine()?.peek();
  if (!s?.user) return { kind: 'saved', label: 'Not signed in' };
  const pending = s.dirty || s.conflict;
  if (s.busy || (pending && !s.retryCount)) return { kind: 'saving', label: 'Saving changes…' };
  if (pending && s.offline) return { kind: 'offline', label: 'No connection · saved on this device, uploads when back online' };
  if (pending) return { kind: 'retrying', label: 'Not saved to the cloud yet · retrying automatically' };
  if (s.error) return { kind: 'attention', label: 'Sync needs attention · ' + s.error };
  return { kind: 'saved', label: 'All changes saved to the cloud' };
}
/** Stable string for useSyncExternalStore. */
export const syncKey = () => { const v = syncView(); return v.kind + '|' + v.label; };

let running: Promise<boolean> | null = null;
/** Sync now with feedback: "Syncing…", then the result. Shares a run already in progress. */
export function syncNow(): Promise<boolean> {
  const e = engine();
  if (!e) return Promise.resolve(false);
  if (running) return running;
  toast('Syncing…');
  running = (async () => {
    let ok = false;
    try { ok = await e.syncNow(); } catch { ok = false; }
    const v = syncView();
    if (ok || v.kind === 'saved') toast('All changes saved ✓');
    else if (v.kind === 'offline') toast('No connection. Your changes are safe on this device and upload automatically.');
    else if (v.kind === 'attention') toast(v.label);
    else toast('Couldn’t reach the cloud yet. Retrying automatically.');
    return ok;
  })().finally(() => { running = null; });
  return running;
}

/** App in use again → wake the engine; app hidden → send pending changes now. Installed once. */
let installed = false;
export function installSyncWake() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const wake = () => { try { engine()?.wake?.(); } catch { /* engine not ready yet */ } };
  const flush = () => { try { engine()?.flush?.(); } catch { /* engine not ready yet */ } };
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('online', wake);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => (document.hidden ? flush() : wake()));
  // Tapping a notification while MFD is open: go to what it was about (only in-app links).
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    const url = e.data?.type === 'MFD_OPEN' ? e.data.url : null;
    if (typeof url === 'string' && /^\/#\/[\w/.:%-]{1,200}$/.test(url)) location.hash = url.slice(2);
  });
}
