// New versions of the MFD Android app. The app is shared as an APK (no Play Store), so it can't update itself:
// the website lists the newest version in /android/latest.json, and the app (its user agent says
// "MFDAndroid/<version>") shows where to download it. Everything else in the app comes from the website and is
// always current; only the shell (notifications, sign-in hand-off) needs a new APK.
import { useEffect, useState } from 'react';
import { toast } from '../components/ui';

export type AppUpdate = { version: string; url: string };

/** The installed app's version ("1.2"), or null outside the app. */
export const appVersion = (ua = navigator.userAgent) => /\bMFDAndroid\/(\d+(?:\.\d+){0,3})\b/.exec(ua)?.[1] ?? null;

/** "1.10" is newer than "1.9". */
export function newer(a: string, b: string) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

/** Only an https link, or one on this site, may be offered as the download. */
export function parseLatest(v: unknown, installed: string): AppUpdate | null {
  if (!v || typeof v !== 'object') return null;
  const { version, url } = v as Record<string, unknown>;
  if (typeof version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(version) || typeof url !== 'string') return null;
  let link: URL;
  try { link = new URL(url, location.origin); } catch { return null; }
  if (link.protocol !== 'https:') return null;
  return newer(version, installed) ? { version, url: link.href } : null;
}

let checked: Promise<AppUpdate | null> | null = null;
export function checkAppUpdate(): Promise<AppUpdate | null> {
  const installed = appVersion();
  if (!installed) return Promise.resolve(null);
  checked ??= fetch('/android/latest.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((v) => parseLatest(v, installed)).catch(() => null);
  return checked;
}

const SEEN_KEY = 'mfd-app-update-seen';
/** Once per new version: a short message on opening MFD. The download itself is in Settings. */
export async function announceAppUpdate() {
  const update = await checkAppUpdate();
  if (!update) return;
  try { if (localStorage.getItem(SEEN_KEY) === update.version) return; localStorage.setItem(SEEN_KEY, update.version); } catch { /* shown again next time */ }
  toast(`MFD app ${update.version} is available: see Settings`);
}

export function useAppUpdate() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  useEffect(() => { let live = true; void checkAppUpdate().then((u) => { if (live) setUpdate(u); }); return () => { live = false; }; }, []);
  return update;
}
