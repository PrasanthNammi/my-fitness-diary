// Phone notifications through the MFD push service (via this app's /api/push/*).
// Each device turns them on separately; the rest-timer choice is kept per device.
const REST_KEY = 'mfd-push-rest', SCHEDULED_KEY = 'mfd-push-scheduled';

export type PushStatus = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';
export const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
export const android = () => /Android/i.test(navigator.userAgent);

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api/push/' + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
  if (!r.ok) throw Error(r.status === 401 ? 'Sign in again to change notifications.' : 'Notifications are unavailable right now. Please try again.');
  return r.json() as Promise<T>;
}
const subscription = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();
const keyBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), (c) => c.charCodeAt(0));

export async function pushStatus(): Promise<PushStatus> {
  if (ios() && !standalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && (await subscription()) ? 'on' : 'off';
}

/** Must run from a tap: asks permission, subscribes this device and registers it. */
export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw Error('Notifications were not allowed. You can allow them in your phone’s settings.');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>('key');
  let sub = await reg.pushManager.getSubscription();
  try { sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }); }
  catch { throw Error('This browser could not turn on notifications. Please try again, or use Chrome or Safari.'); }
  await api('devices', sub.toJSON());
}
export async function disablePush() {
  const sub = await subscription();
  if (!sub) return;
  await api('devices/remove', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* per-device convenience */ } };
// Which notifications this account gets (AI entries, friends' likes & comments, messages) lives on the server;
// the last known values are remembered here so the settings page shows them at once, then refreshed.
const PREFS_KEY = 'mfd-push-prefs';
export type PushPrefs = { ai: boolean; social: boolean; messages: boolean };
export const cachedPushPrefs = (): PushPrefs | null => { try { const v = JSON.parse(read(PREFS_KEY) || 'null'); if (v && typeof v.ai === 'boolean') return { ai: v.ai, social: v.social !== false, messages: v.messages !== false }; const old = read('mfd-push-ai'); return old ? { ai: old === 'on', social: true, messages: true } : null; } catch { return null; } };
export const pushPrefs = async (): Promise<PushPrefs> => { const p = await api<Partial<PushPrefs>>('prefs'); const v = { ai: p.ai !== false, social: p.social !== false, messages: p.messages !== false }; write(PREFS_KEY, JSON.stringify(v)); return v; };
export const setPushPrefs = async (p: Partial<PushPrefs>) => { const r = await api('prefs', p); write(PREFS_KEY, JSON.stringify({ ...(cachedPushPrefs() ?? { ai: true, social: true, messages: true }), ...p })); return r; };
export const restAlertsOn = () => read(REST_KEY) !== 'off';
export const setRestAlerts = (on: boolean) => write(REST_KEY, on ? 'on' : 'off');

/** Running rests are with the push service (MFD in the background): it owns their end times and "Rest over". */
export const restsHandedOff = () => !!read(SCHEDULED_KEY);

export type PendingRest = { id: string; ends: number; label: string };
/** App going to the background: hand running rests to the push service. */
export function scheduleRests(rests: PendingRest[]) {
  if (!rests.length || !restAlertsOn() || !('Notification' in window) || Notification.permission !== 'granted') return;
  write(SCHEDULED_KEY, '1');
  // No server "Resting" notification: on Android MFD shows its own ticking one (restNotification.ts).
  void api('rests', { rests, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, controls: false }).catch(() => write(SCHEDULED_KEY, null));
}
/** App back in front: take rests back (with any ±15 s from the notification) and cancel them there. */
export async function reclaimRests(): Promise<PendingRest[] | null> {
  if (!read(SCHEDULED_KEY)) return null;
  try {
    const { rests } = await api<{ rests: PendingRest[] }>('rests');
    await api('rests', { rests: [] });
    write(SCHEDULED_KEY, null);
    return rests;
  } catch { return null; }
}
