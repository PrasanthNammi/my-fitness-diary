// Progress screen numbers: pure functions over the diary, so they can be tested without the app.
import type { CheckIn, ISODate, WeightEntry, Workout } from './types';
import { daysIntoWeek } from './week';
import { workingVolume } from './training';

export type RangeDays = 30 | 90 | 180 | 365 | 0; // 0 = all time
export const RANGES: { days: RangeDays; label: string }[] = [
  { days: 30, label: '1M' }, { days: 90, label: '3M' }, { days: 180, label: '6M' }, { days: 365, label: '1Y' }, { days: 0, label: 'All' },
];

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date of a timestamp, YYYY-MM-DD. */
export const localISO = (t: number): ISODate => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** First day included in a range ending today (null = all time). */
export function rangeStart(days: RangeDays, now = Date.now()): ISODate | null {
  return days ? localISO(now - (days - 1) * DAY) : null;
}
export const inRange = (date: ISODate, from: ISODate | null) => !from || date >= from;

export function workoutsInRange(list: Workout[], from: ISODate | null): Workout[] {
  return list.filter((w) => inRange(localISO(w.startedAt), from)).sort((a, b) => a.startedAt - b.startedAt);
}
export const minutesOf = (w: Workout) => Math.max(0, (w.endedAt - w.startedAt) / 60000);

export function summary(list: Workout[]) {
  return {
    workouts: list.length,
    volumeKg: list.reduce((n, w) => n + workingVolume(w.exercises), 0),
    minutes: list.reduce((n, w) => n + minutesOf(w), 0),
  };
}

export type StatMetric = 'workouts' | 'volume' | 'minutes';
const valueOf = (w: Workout, m: StatMetric) => (m === 'workouts' ? 1 : m === 'volume' ? workingVolume(w.exercises) : minutesOf(w));
const monday = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - daysIntoWeek(d)); return d; };

/**
 * Totals per week (from the chosen week start) for ranges up to 6 months, per month for longer ones, from the
 * start of the range (or the first workout for "All") to today. Empty weeks/months count as 0.
 */
export function buckets(list: Workout[], from: ISODate | null, metric: StatMetric, now = Date.now()) {
  const firstT = from ? new Date(from + 'T00:00:00').getTime() : list.length ? Math.min(...list.map((w) => w.startedAt)) : now;
  const spanDays = (now - firstT) / DAY;
  const byMonth = spanDays > 190;
  const out: { label: string; start: number; value: number }[] = [];
  if (byMonth) {
    const d = new Date(firstT); d.setHours(0, 0, 0, 0); d.setDate(1);
    while (d.getTime() <= now) {
      const start = d.getTime(); d.setMonth(d.getMonth() + 1);
      out.push({ label: new Date(start).toLocaleDateString(undefined, { month: 'short' }), start, value: 0 });
    }
  } else {
    for (let d = monday(firstT); d.getTime() <= now; d.setDate(d.getDate() + 7)) {
      out.push({ label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), start: d.getTime(), value: 0 });
    }
  }
  for (const w of list) {
    let i = out.length - 1;
    while (i > 0 && w.startedAt < out[i].start) i--;
    if (out[i] && w.startedAt >= out[i].start) out[i].value += valueOf(w, metric);
  }
  return { byMonth, bars: out };
}

export type BodyField = 'weight' | 'waist' | 'chest' | 'hips' | 'arms';
export const BODY_FIELDS: { key: BodyField; label: string }[] = [
  { key: 'weight', label: 'Weight' }, { key: 'waist', label: 'Waist' }, { key: 'chest', label: 'Chest' }, { key: 'hips', label: 'Hips' }, { key: 'arms', label: 'Arms' },
];
/** Valid entry range per field (kg for weight, cm otherwise), the same limits the older screen used. */
export const BODY_LIMITS: Record<BodyField, [number, number]> = { weight: [20, 400], waist: [1, 300], chest: [1, 300], hips: [1, 300], arms: [1, 300] };

const num = (v: unknown) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Dated values of one body measurement, oldest first. Weight comes from weigh-ins, the rest from check-ins. */
export function bodySeries(weights: WeightEntry[], checkins: CheckIn[], field: BodyField, from: ISODate | null) {
  const rows = field === 'weight'
    ? weights.map((w) => ({ id: w.id, date: w.date, value: num(w.kg) }))
    : checkins.map((c) => ({ id: c.id, date: c.date, value: num(c[field]) }));
  return rows.filter((r): r is { id: string; date: ISODate; value: number } => r.value !== null && inRange(r.date, from)).sort((a, b) => a.date.localeCompare(b.date));
}

/** A check-in row with recovery data (sleep, energy, soreness, steps or a note), not only measurements. */
export const isRecoveryRow = (c: CheckIn) => num(c.sleep) !== null || num(c.energy) !== null || num(c.soreness) !== null || num(c.steps) !== null || !!c.note?.trim();

export type HealthDay = { date: ISODate; sleep: number | null; steps: number | null };
/**
 * Applies Health Connect days to check-ins (mutating `rows`): steps follow Health Connect; sleep only fills a day
 * that has none, so hours typed or adjusted by hand are never replaced. Invalid values are ignored. Returns the
 * dates that changed (none: nothing was touched).
 */
export function mergeHealthDays(rows: CheckIn[], days: HealthDay[], newId: () => string): ISODate[] {
  const changed: ISODate[] = [];
  for (const x of days) {
    if (typeof x?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) continue;
    const sleep = typeof x.sleep === 'number' && x.sleep >= 0.5 && x.sleep <= 18 ? Math.round(x.sleep * 10) / 10 : null;
    const steps = typeof x.steps === 'number' && Number.isInteger(x.steps) && x.steps > 0 && x.steps <= 200_000 ? x.steps : null;
    let row = rows.find((c) => c.date === x.date && isRecoveryRow(c));
    const setSteps = steps !== null && num(row?.steps) !== steps, setSleep = sleep !== null && num(row?.sleep) === null;
    if (!setSteps && !setSleep) continue;
    if (!row) { row = { id: newId(), date: x.date, note: '' }; rows.push(row); }
    if (setSteps) row.steps = steps;
    if (setSleep) row.sleep = sleep;
    changed.push(x.date);
  }
  if (changed.length) rows.sort((a, b) => a.date.localeCompare(b.date));
  return changed;
}

/** Recovery check-ins (sleep, energy, soreness, steps or a note), newest first. Measurement-only rows are left out. */
export function recoveryCheckins(checkins: CheckIn[], from: ISODate | null) {
  return checkins
    .filter((c) => inRange(c.date, from) && isRecoveryRow(c))
    .sort((a, b) => b.date.localeCompare(a.date));
}
export { num as checkinNumber };
