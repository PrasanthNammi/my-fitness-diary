// Cycle & Health in the MFD Android app (2.1+): reminders on the phone, and period days from Health Connect (asked
// for separately, only when "Periods from Health Connect" is switched on). Days read are added only on dates without
// a log in MFD and are marked as from Health Connect (cycle.importHealthPeriods); MFD never writes cycle data there.
import { cycle } from '../data/cycle';
import { getDB } from '../data/store';
import { appVersion, newer } from './appUpdate';
import { addDays, todayISO } from './format';
import { ask, inApp } from './native';

export const CYCLE_APP_FROM = '2.1.0';
/** This app can schedule reminders and read periods (the Android app, 2.1 or later). */
export const cycleAppSupported = () => { const v = appVersion(); return inApp() && !!v && !newer(CYCLE_APP_FROM, v); };

export async function connectCyclePeriods(): Promise<'connected' | 'denied' | 'install' | 'unsupported'> {
  if (!cycleAppSupported()) return 'unsupported';
  const r = await ask<{ granted?: boolean; state?: string }>('healthCycleConnect', {}, 600_000);
  return r.granted ? 'connected' : r.state === 'install' ? 'install' : r.state === 'unsupported' ? 'unsupported' : 'denied';
}

let lastRead = 0;
/** Reads the last 400 days (at most every 10 minutes unless forced); returns how many days were added. */
export async function syncCyclePeriods(force = false): Promise<number> {
  const s = getDB().cycle.settings;
  if (!s?.enabled || !s.healthSync || !cycleAppSupported() || (!force && Date.now() - lastRead < 10 * 60_000)) return 0;
  lastRead = Date.now();
  const to = todayISO(), from = addDays(to, -400);
  const r = await ask<{ days?: { date: string; flow: 'light' | 'medium' | 'heavy' | null }[]; error?: string }>('healthCycleRead', { from, to });
  if (!r.days) return 0;
  return cycle.importHealthPeriods(r.days.map((d) => ({ date: d.date, ...(d.flow ? { flow: d.flow } : {}) })));
}

/** Saves a file: the Android app's "save to…" picker, or a download in the browser. */
export async function saveFile(name: string, mime: string, bytes: Uint8Array): Promise<boolean> {
  if (inApp()) {
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return !!(await ask<{ saved?: boolean }>('save', { name, mime, base64: btoa(s) }, 600_000)).saved;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}
