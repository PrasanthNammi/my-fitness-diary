import { useEffect, useState, useSyncExternalStore } from 'react';

/** Re-renders every `ms` while enabled; returns Date.now(). */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(q).matches,
  );
}

/**
 * Tracks the on-screen keyboard via visualViewport and exposes it as --kb so
 * sheets lift above it, and keeps the focused input scrolled into view.
 */
export function installKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (!t.matches('input, textarea, select')) return;
    setTimeout(() => t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 260);
  });
}

/**
 * Keeps the screen on while `on` (Screen Wake Lock). Browsers release the lock when the app is hidden,
 * so it is taken again when the app comes back. Does nothing where the browser has no wake lock.
 */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void>; released: boolean }> } }).wakeLock;
    if (!on || !api) return;
    let lock: { release(): Promise<void>; released: boolean } | null = null, stopped = false;
    const take = () => {
      if (stopped || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      api.request('screen').then((l) => { if (stopped) void l.release().catch(() => {}); else lock = l; }).catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { stopped = true; document.removeEventListener('visibilitychange', take); void lock?.release().catch(() => {}); };
  }, [on]);
}
