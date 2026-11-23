// Cycles from the daily logs (Cycle & Health). Definitions used everywhere (see docs/cycle/EVIDENCE.md):
// - A cycle starts on the first day of a period: a day logged as "period" with no other period day in the 7 days
//   before it. Spotting, withdrawal bleeding and "not sure" never start a cycle.
// - Cycle length = days from one period's first day to the next period's first day (only complete cycles count).
// - Period length = days from a period's first day to its last period day (unlogged days inside count).
// - A day without a log is unknown ("not logged"), never "no bleeding" or "no symptoms".
import type { CycleDay, ISODate } from './types';

const DAY = 864e5;
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const daysBetween = (a: ISODate, b: ISODate) => Math.round((toMs(b) - toMs(a)) / DAY);
export const addDays = (d: ISODate, n: number): ISODate => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);

export interface Period { start: ISODate; end: ISODate; length: number }

/** The periods in the log, oldest first. */
export function periods(days: CycleDay[]): Period[] {
  const dates = [...new Set(days.filter((d) => d.bleeding === 'period').map((d) => d.date))].sort();
  const out: Period[] = [];
  for (const d of dates) {
    const last = out[out.length - 1];
    // A period day within 7 days of the last one belongs to the same period (unlogged days in between): not a new cycle.
    if (last && daysBetween(last.end, d) <= 7) { last.end = d; last.length = daysBetween(last.start, d) + 1; continue; }
    out.push({ start: d, end: d, length: 1 });
  }
  return out;
}

/** Complete cycle lengths in days, oldest first. */
export function cycleLengths(days: CycleDay[]): number[] {
  const p = periods(days);
  return p.slice(1).map((x, i) => daysBetween(p[i]!.start, x.start));
}

export interface CycleNow {
  /** Day of the current cycle (1 = first day of the last period), or null when no period is logged yet. */
  day: number | null;
  lastStart: ISODate | null;
  lastPeriod: Period | null;
  lengths: number[];
  shortest: number | null;
  longest: number | null;
  median: number | null;
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

export function cycleNow(days: CycleDay[], today: ISODate): CycleNow {
  const p = periods(days.filter((d) => d.date <= today));
  const last = p[p.length - 1] ?? null, lengths = cycleLengths(days.filter((d) => d.date <= today));
  return {
    day: last ? daysBetween(last.start, today) + 1 : null, lastStart: last?.start ?? null, lastPeriod: last, lengths,
    shortest: lengths.length ? Math.min(...lengths) : null, longest: lengths.length ? Math.max(...lengths) : null, median: median(lengths),
  };
}

/** How a calendar day looks: recorded marks only (estimates are added separately and always look different). */
export type DayMark = 'period' | 'spotting' | 'other-bleed' | 'symptoms' | 'nothing' | 'logged' | null;
export function dayMark(d: CycleDay | undefined): DayMark {
  if (!d) return null;
  if (d.bleeding === 'period') return 'period';
  if (d.bleeding === 'spotting') return 'spotting';
  if (d.bleeding === 'withdrawal' || d.bleeding === 'unsure') return 'other-bleed';
  if (d.nothing) return 'nothing';
  if ((d.symptoms && Object.keys(d.symptoms).length) || (d.pain ?? 0) > 0) return 'symptoms';
  return 'logged';
}
