// Cycle & Health → Insights: WHEN things happen within a cycle (the Cycle tab shows how long and how regular).
// Every number describes logged days only (a day without a log is unknown, never "no symptoms"); nothing here
// predicts or diagnoses. Cycles count when they started inside the chosen range (null = all time).
import type { CheckIn, CycleDay, ISODate, WeightEntry, Workout } from './types';
import { daysBetween, periods } from './cycle';

export const MAX_DAY = 35;                         // the symptom map shows cycle days 1–35 (later days are left out)
const FLOW: Record<string, number> = { light: 1, medium: 2, heavy: 3, very_heavy: 4 };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const localDate = (ms: number): ISODate => { const d = new Date(ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const num = (v: unknown) => { const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : null; };

export interface CyclePatterns {
  /** Cycles looked at (started in range). */
  cycles: number;
  /** Top symptoms: share (0–1) of logged days on each cycle day 1…MAX_DAY that had it; null = no logged day there. */
  symptoms: { name: string; byDay: (number | null)[] }[];
  /** Logged days on each cycle day 1…MAX_DAY. */
  loggedByDay: number[];
  /** Period day 1…7: average flow (1 light … 4 very heavy) and pain (0–10) on days that recorded them. */
  periodDays: { flow: number | null; pain: number | null; n: number }[];
  /** Cycle weeks 1–4 (week 4 includes any later days): average mood, energy and calm (stress 1 very stressed … 5 calm). */
  weeks: { mood: number | null; energy: number | null; calm: number | null; n: number }[];
  /** Cycle weeks 1–4: workouts per week, average weight (kg) and sleep (h). */
  body: { workouts: number | null; weight: number | null; sleep: number | null }[];
}

/** Which cycle (start) and cycle day a date belongs to, for cycles that have a next period (complete) or the current one. */
function locate(starts: ISODate[], today: ISODate) {
  return (date: ISODate): { start: ISODate; day: number } | null => {
    if (date > today) return null;
    let lo = -1; for (let i = 0; i < starts.length && starts[i]! <= date; i++) lo = i;
    return lo < 0 ? null : { start: starts[lo]!, day: daysBetween(starts[lo]!, date) + 1 };
  };
}

export function cyclePatterns(days: CycleDay[], workouts: Workout[], weights: WeightEntry[], checkins: CheckIn[], today: ISODate, from: ISODate | null): CyclePatterns {
  const ps = periods(days.filter((d) => d.date <= today)), starts = ps.map((p) => p.start), where = locate(starts, today);
  const inRange = (start: ISODate) => !from || start >= from, used = new Set(starts.filter(inRange));
  const week = (day: number) => Math.min(3, Math.floor((day - 1) / 7));

  // Symptoms by cycle day.
  const loggedByDay = Array(MAX_DAY).fill(0) as number[], counts = new Map<string, number[]>(), total = new Map<string, number>();
  const moods = [0, 1, 2, 3].map(() => ({ mood: [] as number[], energy: [] as number[], calm: [] as number[], n: 0 }));
  const pd = Array.from({ length: 7 }, () => ({ flow: [] as number[], pain: [] as number[], n: 0 }));
  for (const d of days) {
    const at = where(d.date); if (!at || !used.has(at.start)) continue;
    if (at.day <= MAX_DAY) {
      loggedByDay[at.day - 1]!++;
      for (const s of Object.keys(d.symptoms ?? {})) { const c = counts.get(s) ?? Array(MAX_DAY).fill(0); c[at.day - 1]++; counts.set(s, c); total.set(s, (total.get(s) ?? 0) + 1); }
    }
    const w = moods[week(at.day)]!; let any = false;
    if (d.mood) { w.mood.push(d.mood); any = true; } if (d.energy) { w.energy.push(d.energy); any = true; } if (d.stress) { w.calm.push(d.stress); any = true; }
    if (any) w.n++;
    const p = ps.find((x) => x.start === at.start);
    if (p && d.date <= p.end && at.day <= 7 && d.bleeding === 'period') {
      const slot = pd[at.day - 1]!; slot.n++;
      if (d.flow && FLOW[d.flow]) slot.flow.push(FLOW[d.flow]!); if (typeof d.pain === 'number') slot.pain.push(d.pain);
    }
  }
  const top = [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);

  // Body & training by cycle week: only cycles in range that are complete (whole weeks known).
  const wk = [0, 1, 2, 3].map(() => ({ workouts: 0, days: 0, weight: [] as number[], sleep: [] as number[] }));
  for (let i = 1; i < ps.length; i++) {
    const start = ps[i - 1]!.start; if (!used.has(start)) continue;
    const len = daysBetween(start, ps[i]!.start);
    for (let k = 1; k <= len; k++) wk[week(k)]!.days++;
  }
  const complete = new Set(ps.slice(0, -1).map((p) => p.start).filter((s) => used.has(s)));
  for (const w of workouts) { const at = where(localDate(w.startedAt)); if (at && complete.has(at.start)) wk[week(at.day)]!.workouts++; }
  for (const x of weights) { const at = where(x.date); const kg = num(x.kg); if (at && complete.has(at.start) && kg) wk[week(at.day)]!.weight.push(kg); }
  for (const c of checkins) { const at = where(c.date); const h = num(c.sleep); if (at && complete.has(at.start) && h) wk[week(at.day)]!.sleep.push(h); }

  return {
    cycles: used.size,
    symptoms: top.map((name) => ({ name, byDay: counts.get(name)!.map((n, i) => (loggedByDay[i] ? n / loggedByDay[i]! : null)) })),
    loggedByDay,
    periodDays: pd.map((x) => ({ flow: avg(x.flow), pain: avg(x.pain), n: x.n })),
    weeks: moods.map((w) => ({ mood: avg(w.mood), energy: avg(w.energy), calm: avg(w.calm), n: w.n })),
    body: wk.map((w) => ({ workouts: w.days ? (w.workouts / w.days) * 7 : null, weight: avg(w.weight), sleep: avg(w.sleep) })),
  };
}
