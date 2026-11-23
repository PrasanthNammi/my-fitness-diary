// Cycle & Health reminders: what the MFD Android app schedules on the phone (local alarms; nothing goes through a
// server). The wording follows the person's chosen style, and the lock screen always shows only "MFD · Reminder":
//   discreet  — "MFD" / "Reminder" (nothing about health; the default)
//   private   — "Medicine reminder" / "Cycle reminder" (clear, without names or dates)
//   detailed  — the medicine's name and dose, or the estimated dates
// Never a fertile window or "safe days" (see docs/cycle/EVIDENCE.md).
import type { CycleData, CycleSettings, ISODate } from './types';
import type { Estimate } from './cyclePredict';

export type ReminderStyle = CycleSettings['reminderStyle'];
/** `done`: the label of the notification's button that records the dose (medicines only). */
export interface DailyReminder { id: string; time: string; title: string; text: string; open: string; start?: ISODate; end?: ISODate; done?: string }
export interface OnceReminder { id: string; date: ISODate; time: string; title: string; text: string; open: string }
export interface ReminderPlan { daily: DailyReminder[]; once: OnceReminder[]; lockScreen: string }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const short = (d: ISODate) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const addDays = (d: ISODate, n: number): ISODate => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export function words(style: ReminderStyle, kind: 'med' | 'period' | 'log', detail: string) {
  if (style === 'detailed') return { title: kind === 'med' ? 'Medicine' : kind === 'period' ? 'Your cycle' : 'Cycle log', text: detail };
  if (style === 'private') return { title: kind === 'med' ? 'Medicine reminder' : 'Cycle reminder', text: kind === 'log' ? 'Time to log your day' : kind === 'med' ? 'Time for your medicine' : 'Your period may start soon' };
  return { title: 'MFD', text: 'Reminder' };
}

/** The reminders to schedule now. `est` is today's estimate; `today` the local date. */
export function reminderPlan(c: CycleData, est: Estimate, today: ISODate): ReminderPlan {
  const s = c.settings, empty: ReminderPlan = { daily: [], once: [], lockScreen: 'MFD · Reminder' };
  if (!s?.enabled) return empty;
  const style = s.reminderStyle ?? 'discreet', daily: DailyReminder[] = [], once: OnceReminder[] = [];
  if (s.medReminders) for (const m of c.meds) {
    if (!m.reminder || (m.end && m.end < today)) continue;
    for (const t of m.times ?? []) {
      if (!TIME.test(t)) continue;
      const dose = m.dose ? ` ${m.dose}${m.unit ? ' ' + m.unit : ''}` : '';
      daily.push({ id: `med:${m.id}:${t}`, time: t, ...words(style, 'med', `${m.name}${dose} at ${t}`), open: '/#/progress/cycle', done: style === 'discreet' ? 'Done' : 'Taken',
        ...(m.start ? { start: m.start } : {}), ...(m.end ? { end: m.end } : {}) });
    }
  }
  if (s.logReminder && TIME.test(s.logReminder))
    daily.push({ id: 'log', time: s.logReminder, ...words(style, 'log', 'How was your day? Log it in a few taps'), open: `/#/progress/cycle/log/${today}` });
  // Two days before the estimated range starts (or today, if that has passed and the range hasn't), at 09:00.
  if (s.periodSoon && est.state === 'range' && est.to >= today) {
    const date = addDays(est.from, -2) < today ? today : addDays(est.from, -2);
    once.push({ id: `period:${est.from}`, date, time: '09:00', ...words(style, 'period', `Your next period is likely ${short(est.from)} – ${short(est.to)} (an estimate)`), open: '/#/progress/cycle' });
  }
  return { daily, once, lockScreen: 'MFD · Reminder' };
}
