// The rest timer in the phone's notification bar, shown by MFD itself (no server): a quiet
// "Resting · <exercise> · 1:25 left" updated every second, then "Rest over" on the second.
// Not on iPhone, which pauses web apps in the background. The server push stays as a backup.
import { ios, restAlertsOn } from './push';
import { mss } from './format';

const TAG = 'rest', ICON = '/legacy/icon-256.png';
const ready = () => navigator.serviceWorker?.ready;

export const restNotificationsOn = () => 'Notification' in window && Notification.permission === 'granted' && restAlertsOn() && !ios() && 'serviceWorker' in navigator;

export async function showResting(id: string, label: string, leftSec: number) {
  await (await ready())?.showNotification(`Resting · ${label}`, {
    body: `${mss(leftSec)} left`, tag: TAG, silent: true, renotify: false, icon: ICON,
    actions: [{ action: 'minus15', title: '−15s' }, { action: 'plus15', title: '+15s' }], data: { id, local: true },
  } as NotificationOptions);
}
export async function showRestOver(id: string, label: string) {
  await (await ready())?.showNotification('Rest over', {
    body: label, tag: TAG, renotify: true, silent: false, icon: ICON, vibrate: [120, 60, 120],
    actions: [{ action: 'plus15', title: '+15s' }], data: { id, local: true, over: true },
  } as NotificationOptions);
}
export async function closeRestNotification() {
  for (const n of (await (await ready())?.getNotifications({ tag: TAG })) ?? []) n.close();
}
/** Clears a "Resting" notification (rest skipped, paused or workout ended) but leaves a "Rest over". */
export async function closeRestingNotification() {
  for (const n of (await (await ready())?.getNotifications({ tag: TAG })) ?? []) if (!(n.data as { over?: boolean } | null)?.over) n.close();
}
