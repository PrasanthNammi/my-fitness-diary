// Recovery per day, for the Recovery page, the Progress card and the Overview card: one row per day from the
// day's recovery check-in (typed values and Samsung Health ones), and how a day compares with the days before.
import type { CheckIn, ISODate, SleepStages } from './types';
import { checkinNumber, isRecoveryRow, vsUsual } from './progressStats';

export type RecoveryDay = {
  date: ISODate;
  sleep: number | null; // hours
  stages: SleepStages | null;
  steps: number | null;
  restingHr: number | null;
  hrv: number | null;
  energy: number | null; // 1–5
  soreness: number | null; // 1–5
  note: string;
};
export type Metric = 'sleep' | 'steps' | 'restingHr' | 'hrv' | 'energy' | 'soreness';

const shift = (d: ISODate, n: number): ISODate => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return t.toISOString().slice(0, 10);
};

// The day's recovery check-in by date, built once per check-in list (lookups stay fast with long histories).
const indexes = new WeakMap<CheckIn[], Map<ISODate, CheckIn>>();
function byDate(checkins: CheckIn[]) {
  let m = indexes.get(checkins);
  if (!m) { m = new Map(); for (const c of checkins) if (!m.has(c.date) && isRecoveryRow(c)) m.set(c.date, c); indexes.set(checkins, m); }
  return m;
}

/** The day's recovery values, or null when there are none. */
export function recoveryDay(checkins: CheckIn[], date: ISODate): RecoveryDay | null {
  const c = byDate(checkins).get(date);
  if (!c) return null;
  const stages = c.sleepStages && typeof c.sleepStages === 'object' ? c.sleepStages : null;
  return {
    date, sleep: checkinNumber(c.sleep), stages, steps: checkinNumber(c.steps), restingHr: checkinNumber(c.restingHr), hrv: checkinNumber(c.hrv),
    energy: checkinNumber(c.energy), soreness: checkinNumber(c.soreness), note: c.note?.trim() ?? '',
  };
}

/** Every day from `from` to `to` (oldest first); days without values are null. */
export function recoveryRange(checkins: CheckIn[], from: ISODate, to: ISODate): { date: ISODate; day: RecoveryDay | null }[] {
  const out: { date: ISODate; day: RecoveryDay | null }[] = [];
  for (let d = from; d <= to && out.length < 400; d = shift(d, 1)) out.push({ date: d, day: recoveryDay(checkins, d) });
  return out;
}

/** Days with values, newest first. */
export const recoveryHistory = (checkins: CheckIn[], limit = Infinity) =>
  [...byDate(checkins).keys()].sort((a, b) => b.localeCompare(a)).slice(0, limit).map((date) => recoveryDay(checkins, date)!);

/** History shown on the Recovery page: 3 days, then 7, 30, 90 and everything, one "Show more" at a time. */
export const HISTORY_STEPS = [3, 7, 30, 90, Infinity] as const;

/** A day's value against the 6 days before it ("usual"), or null when either is missing or there are too few days. */
export function compared(checkins: CheckIn[], date: ISODate, metric: Metric) {
  const today = recoveryDay(checkins, date)?.[metric] ?? null;
  if (today === null) return null;
  const before = Array.from({ length: 6 }, (_, i) => recoveryDay(checkins, shift(date, i - 6))?.[metric] ?? null).filter((v): v is number => v !== null);
  const c = vsUsual([...before, today]);
  // The exact average (sleep shows it in hours and minutes); vsUsual's state says normal, higher or lower.
  return c ? { value: today, usual: before.reduce((x, y) => x + y, 0) / before.length, state: c.state } : { value: today, usual: null, state: null };
}

/** Average of the values that exist, or null. */
export const average = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Hours and minutes ("7h 05m"). */
export const hm = (hours: number) => { const m = Math.round(hours * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };

export { shift as shiftDay };
