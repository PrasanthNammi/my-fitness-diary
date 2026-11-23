// Cycle & Health numbers for the chosen Progress range (1M / 3M / 6M / 1Y / All), shared by the Cycle tab and
// Insights so both always agree. A cycle belongs to the range when it started inside it; symptoms and "days logged"
// count logged days inside the range only (a day without a log is unknown, never "no symptoms").
import type { CycleDay, ISODate, Workout } from './types';
import { addDays, daysBetween, periods } from './cycle';

export interface CycleRangeStats {
  /** Complete cycles (period start to the next period start) that started inside the range. */
  cycles: { start: ISODate; length: number }[];
  usual: number | null; shortest: number | null; longest: number | null;
  /** Usual period length (median bleeding days) of periods that started inside the range. */
  periodLen: number | null;
  logged: number; spanDays: number;
  top: (readonly [string, number])[]; logDays: number;
  byWeek: number[]; perWeek: number;
}

export const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };
const localDate = (ms: number): ISODate => { const d = new Date(ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/** `from` = first day of the range (null = all time). */
export function cycleRangeStats(days: CycleDay[], workouts: Workout[], today: ISODate, from: ISODate | null): CycleRangeStats {
  const past = days.filter((d) => d.date <= today), ps = periods(past);
  const first = from ?? past[0]?.date ?? today, spanDays = daysBetween(first, today) + 1;
  const all = ps.slice(1).map((p, i) => ({ start: ps[i]!.start, length: daysBetween(ps[i]!.start, p.start) }));
  const cycles = all.filter((c) => !from || c.start >= from), lengths = cycles.map((c) => c.length);
  const inPs = ps.filter((p) => !from || p.start >= from);
  const window = past.filter((d) => !from || d.date >= from), counts = new Map<string, number>();
  for (const d of window) for (const s of Object.keys(d.symptoms ?? {})) counts.set(s, (counts.get(s) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => [s, Math.round((n / window.length) * 100)] as const);
  // Workouts per week in each cycle week (cycles in range; weeks 1–4, week 4 includes any later days).
  const perWeek = [0, 0, 0, 0], weeks = [0, 0, 0, 0];
  for (const c of cycles) for (let w = 0; w < 4; w++) {
    const a = w * 7, b = w === 3 ? c.length : Math.min(c.length, a + 7); if (b <= a) continue; weeks[w]! += (b - a) / 7;
    const lo = addDays(c.start, a), hi = addDays(c.start, b);
    perWeek[w]! += workouts.filter((x) => { const dd = localDate(x.startedAt); return dd >= lo && dd < hi; }).length;
  }
  const wsum = weeks.reduce((a, b) => a + b, 0);
  return { cycles, usual: lengths.length ? median(lengths) : null, shortest: lengths.length ? Math.min(...lengths) : null, longest: lengths.length ? Math.max(...lengths) : null,
    periodLen: inPs.length ? median(inPs.map((p) => p.length)) : null, logged: window.length, spanDays,
    top, logDays: window.length, byWeek: perWeek.map((n, w) => (weeks[w] ? n / weeks[w]! : 0)), perWeek: wsum ? perWeek.reduce((a, b) => a + b, 0) / wsum : 0 };
}

/** "Last 3 months", "Last year", "All time"… for headings. */
export function rangeName(days: number): string {
  return ({ 30: 'Last month', 90: 'Last 3 months', 180: 'Last 6 months', 365: 'Last year' } as Record<number, string>)[days] ?? 'All time';
}
