// New versions of the MFD Android app. The app is shared as an APK (no Play Store), so it can't update itself:
// the website lists the newest version in /android/latest.json, and the app (its user agent says
// "MFDAndroid/<version>") offers it in a banner (components/AppUpdateBanner.tsx). Everything else in the app comes from the website and is
// always current; only the shell (notifications, sign-in hand-off) needs a new APK.
import { ask } from './native';

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
/** Apps before 1.3: the website's /android/latest.json names the newest APK, downloaded in a browser tab. */
export function checkAppUpdate(): Promise<AppUpdate | null> {
  const installed = appVersion();
  if (!installed) return Promise.resolve(null);
  checked ??= fetch('/android/latest.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((v) => parseLatest(v, installed)).catch(() => null);
  return checked;
}

/** From this version the app updates itself (download, checks and Android's installer: Updater.kt). */
export const SELF_UPDATING = '1.3';
export const selfUpdating = (installed: string) => !newer(SELF_UPDATING, installed);

export type FoundUpdate = { version: string; native: boolean; url?: string };
/** A newer version of the installed app, or null (also outside the app). */
export async function findAppUpdate(): Promise<FoundUpdate | null> {
  const installed = appVersion();
  if (!installed) return null;
  if (selfUpdating(installed)) {
    try {
      const r = await ask<{ available?: boolean; version?: string | null }>('appUpdateCheck', {}, 30_000);
      return r.available && typeof r.version === 'string' ? { version: r.version, native: true } : null;
    } catch { return null; }
  }
  const u = await checkAppUpdate();
  return u ? { version: u.version, native: false, url: u.url } : null;
}
