// Keeps the Android app's Cycle & Health reminders in step with the diary: whenever medicines, reminder settings or
// the estimate change, the website sends the new plan to the app, which schedules them on the phone (local alarms;
// nothing goes through a server). In a browser this does nothing.
import { getDB, subscribe } from '../data/store';
import { estimateNext } from '../domain/cyclePredict';
import { reminderPlan } from '../domain/cycleReminders';
import type { CycleData } from '../domain/types';
import { inApp, tell } from './native';

const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
let lastCycle: CycleData | null = null, lastDay = '', lastSent = '';

function check() {
  const c = getDB().cycle, day = localToday();
  if (c === lastCycle && day === lastDay) return;
  lastCycle = c; lastDay = day;
  const plan = JSON.stringify(reminderPlan(c, c.settings?.enabled && c.settings.periodSoon ? estimateNext(c.days, day) : { state: 'insufficient', about: [] }, day));
  if (plan === lastSent) return;
  lastSent = plan;
  tell('cycleReminders', { plan });
}

/** Starts watching (once, in the Android app only). */
export function startCycleReminders() {
  if (!inApp()) return () => {};
  check();
  const unsub = subscribe(check), timer = setInterval(check, 30 * 60_000);   // a new day can move the estimate
  return () => { unsub(); clearInterval(timer); };
}
