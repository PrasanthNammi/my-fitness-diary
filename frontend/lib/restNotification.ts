// The rest timer in the phone's notification bar, shown by MFD itself (no server): a quiet
// "Resting · <exercise> · 1:25 left" updated every second while MFD is on screen, then "Rest over".
// Android pauses web apps in the background (locked, another app), so a countdown would freeze on
// a stale number: in the background the notification shows the end time instead ("ends at 10:42:15").
// Not on iPhone, which pauses web apps in the background. The server push stays as a backup.
// In the MFD Android app the notification is native: a live countdown that keeps ticking on the lock screen.
import { ios, notificationsAllowed, restAlertsOn } from './push';
import { mss } from './format';
import { inApp, tell } from './native';

/** "1:25 left" on screen; "ends at 10:42:15" in the background, which can't go stale. */
export const restingText = (endsAt: number, now: number, background: boolean) => background
  ? `ends at ${new Date(endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`
  : `${mss(Math.max(0, Math.ceil((endsAt - now) / 1000)))} left`;

const TAG = 'rest', ICON = '/legacy/icon-256.png';
const ready = () => navigator.serviceWorker?.ready;

export const restNotificationsOn = () => restAlertsOn() && notificationsAllowed() && (inApp() || (!ios() && 'serviceWorker' in navigator));

let appShown = '';
/** `background`: MFD is hidden (and may be paused), so the notification's buttons go to the server, which
 * holds the rest while MFD is away, instead of to the paused window. In the app, `ends` drives the native
 * countdown and the app itself knows whether it is in the background. */
/** For the Android app's notification: what comes next, the exercise's picture, the rest's full length, and
 *  whether to vibrate when it ends. */
export type RestExtra = { next: string | null; image: string | null; duration: number; vibrate: boolean };
export async function showResting(id: string, label: string, body: string, background = false, ends?: number, extra?: RestExtra) {
  if (inApp()) {
    const key = `${id}:${ends}:${label}:${extra?.next}:${extra?.image}`;
    if (ends != null && key !== appShown) { appShown = key; tell('rest', { id, label, ends, ...extra }); }
    return;
  }
  await (await ready())?.showNotification(`Resting · ${label}`, {
    body, tag: TAG, silent: true, renotify: false, icon: ICON,
    actions: [{ action: 'minus15', title: '−15s' }, { action: 'plus15', title: '+15s' }], data: { id, local: true, background },
  } as NotificationOptions);
}
export async function showRestOver(id: string, label: string) {
  if (inApp()) { appShown = ''; tell('restOver', { id, label }); return; }
  await (await ready())?.showNotification('Rest over', {
    body: label, tag: TAG, renotify: true, silent: false, icon: ICON, vibrate: [120, 60, 120],
    actions: [{ action: 'plus15', title: '+15s' }], data: { id, local: true, over: true },
  } as NotificationOptions);
}
export async function closeRestNotification() {
  if (inApp()) { appShown = ''; tell('restClear', { all: true }); return; }
  for (const n of (await (await ready())?.getNotifications({ tag: TAG })) ?? []) n.close();
}
/** Clears a "Resting" notification (rest skipped, paused or workout ended) but leaves a "Rest over". */
export async function closeRestingNotification() {
  if (inApp()) { appShown = ''; tell('restClear', { all: false }); return; }
  for (const n of (await (await ready())?.getNotifications({ tag: TAG })) ?? []) if (!(n.data as { over?: boolean } | null)?.over) n.close();
}
