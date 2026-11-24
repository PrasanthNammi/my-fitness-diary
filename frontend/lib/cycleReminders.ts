// Keeps the Android app's Cycle & Health reminders in step with the diary: whenever medicines, reminder settings or
// the estimate change, the website sends the new plan to the app, which schedules them on the phone (local alarms;
// nothing goes through a server). In a browser this does nothing.
import { getDB, subscribe } from '../data/store';
import { cycle } from '../data/cycle';
import { cycleAppSupported } from './cycleHealth';
import { estimateNext } from '../domain/cyclePredict';
import { reminderPlan } from '../domain/cycleReminders';
import type { CycleData } from '../domain/types';
import { ask, inApp, onNative, tell } from './native';

const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
let lastCycle: CycleData | null = null, lastDay = '', lastSent = '';

function check() {
  const c = getDB().cycle, day = localToday();
  if (c === lastCycle && day === lastDay) return;
  lastCycle = c; lastDay = day;
  const plan = JSON.stringify(reminderPlan(c, c.settings?.enabled && c.settings.periodSoon && !c.settings.pause ? estimateNext(c.days, day, { since: c.settings.pauseSince, until: c.settings.pauseUntil }) : { state: 'insufficient', about: [] }, day));
  if (plan === lastSent) return;
  lastSent = plan;
  tell('cycleReminders', { plan });
}

/** Doses marked "Taken" on a reminder notification (kept by the app until the page collects them). */
export async function collectTaken() {
  if (!cycleAppSupported()) return 0;
  const r = await ask<{ taken?: { medId: string; date: string; time: string }[] }>('cycleTakenDrain', {}, 15_000);
  let n = 0;
  for (const t of r.taken ?? []) {
    if (!getDB().cycle.meds.some((m) => m.id === t.medId) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !/^\d{2}:\d{2}$/.test(t.time)) continue;
    if (cycle.doseOf(t.medId, t.date, t.time)?.status !== 'taken') { cycle.setDose(t.medId, t.date, t.time, 'taken'); n++; }
  }
  return n;
}

/** Starts watching (once, in the Android app only). */
export function startCycleReminders() {
  if (!inApp()) return () => {};
  check();
  collectTaken().catch(() => {});
  const unsub = subscribe(check), timer = setInterval(check, 30 * 60_000);   // a new day can move the estimate
  const off = onNative((e) => { if (e.event === 'cycleTaken') collectTaken().catch(() => {}); });
  return () => { unsub(); clearInterval(timer); off(); };
}
