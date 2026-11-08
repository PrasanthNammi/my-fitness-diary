// 7-day weight average and the Monday recap of last week. Pure functions over the diary, unit-tested.
import type { DiaryEntry, ISODate, WeightEntry, Workout } from './types';
import { nutrientsFor } from './nutrition';
import { localISO, summary } from './progressStats';

const DAY = 86_400_000;
const at = (d: ISODate) => new Date(d + 'T12:00:00').getTime();
export const shiftISO = (d: ISODate, n: number): ISODate => localISO(at(d) + n * DAY);
/** Monday of the week containing `d`. */
export const mondayOf = (d: ISODate): ISODate => shiftISO(d, -((new Date(at(d)).getDay() + 6) % 7));

/** Average of the weigh-ins in the 7 days ending on `date` (inclusive); null without any. */
export function weightAverage(weights: WeightEntry[], date: ISODate, days = 7): number | null {
  const from = shiftISO(date, -(days - 1));
  const list = weights.filter((w) => w.date >= from && w.date <= date && Number.isFinite(w.kg));
  return list.length ? list.reduce((n, w) => n + w.kg, 0) / list.length : null;
}

/** For each weigh-in (oldest first), the 7-day average ending that day: a line that ignores day-to-day noise. */
export function averageSeries(weights: WeightEntry[]): { date: ISODate; kg: number; avg: number }[] {
  const sorted = [...weights].filter((w) => Number.isFinite(w.kg)).sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((w) => ({ date: w.date, kg: w.kg, avg: weightAverage(sorted, w.date)! }));
}

/** Latest 7-day average and how it moved over `weeks` weeks (compared with the 7 days ending that many weeks earlier). */
export function weightTrend(weights: WeightEntry[], date: ISODate, weeks = 4) {
  const upto = weights.filter((w) => w.date <= date);
  const last = upto.reduce<WeightEntry | null>((m, w) => (!m || w.date >= m.date ? w : m), null);
  const avg = last ? weightAverage(upto, last.date) : null;
  const before = last ? weightAverage(upto, shiftISO(last.date, -7 * weeks)) : null;
  return { last, avg, change: avg !== null && before !== null ? avg - before : null };
}

export interface WeekRecap {
  from: ISODate; to: ISODate;
  workouts: number; goal: number; sets: number; volumeKg: number; minutes: number;
  /** Days with any food logged, and their average calories / how many reached the protein target. */
  loggedDays: number; avgKcal: number | null; kcalTarget: number | null; proteinDays: number; proteinTarget: number | null;
  weightAvg: number | null; weightChange: number | null;
  empty: boolean;
}

/** Last week (Monday to Sunday before the week containing `today`). */
export function weekRecap(input: {
  today: ISODate; workouts: Workout[]; diary: DiaryEntry[]; weights: WeightEntry[];
  goal: number; kcalTarget: number | null; proteinTarget: number | null;
}): WeekRecap {
  const from = shiftISO(mondayOf(input.today), -7), to = shiftISO(from, 6);
  const inWeek = (d: ISODate) => d >= from && d <= to;
  const list = input.workouts.filter((w) => inWeek(localISO(w.startedAt)));
  const s = summary(list);
  const sets = list.reduce((n, w) => n + w.exercises.reduce((m, b) => m + b.sets.filter((x) => x.done && x.type !== 'warmup').length, 0), 0);
  const days = new Map<ISODate, { kcal: number; protein: number }>();
  for (const e of input.diary) {
    if (!inWeek(e.date)) continue;
    const n = nutrientsFor(e.food, e.amount, e.unit), d = days.get(e.date) ?? { kcal: 0, protein: 0 };
    days.set(e.date, { kcal: d.kcal + n.kcal, protein: d.protein + n.protein });
  }
  const logged = [...days.values()];
  const weightAvg = weightAverage(input.weights, to);
  const prev = weightAverage(input.weights, shiftISO(to, -7));
  return {
    from, to, workouts: list.length, goal: input.goal, sets, volumeKg: s.volumeKg, minutes: s.minutes,
    loggedDays: logged.length, avgKcal: logged.length ? logged.reduce((n, d) => n + d.kcal, 0) / logged.length : null, kcalTarget: input.kcalTarget,
    proteinDays: input.proteinTarget ? logged.filter((d) => d.protein >= input.proteinTarget! * 0.95).length : 0, proteinTarget: input.proteinTarget,
    weightAvg, weightChange: weightAvg !== null && prev !== null ? weightAvg - prev : null,
    empty: !list.length && !logged.length && weightAvg === null,
  };
}
