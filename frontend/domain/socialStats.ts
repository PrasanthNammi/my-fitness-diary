// Friend statistics (feed card, workout page, profile, comparison). Pure functions over finished workouts in the
// app's own shape, so a friend's shared workouts and your own history are measured the same way. Unit-tested.
import type { Exercise, ExerciseBlock, TrackingMode, Workout } from './types';
import { RADAR_GROUPS, muscleMapping } from './muscleStats';
import { setMetrics, type Metric } from './records';
import { workingVolume } from './training';

const DAY = 86_400_000;
const startOfDay = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
export const mondayOf = (t: number) => { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };

const working = (b: ExerciseBlock) => b.sets.filter((s) => s.done && s.type !== 'warmup');
export const workSets = (w: Workout) => w.exercises.reduce((n, b) => n + working(b).length, 0);
export const minutesOf = (w: Workout) => Math.max(0, Math.round((w.endedAt - w.startedAt) / 60000));

// ── Records ──────────────────────────────────────────────────────
/** Record names shown on a set, by metric. */
export const RECORD_LABEL: Partial<Record<Metric, string>> = { estimate: '1RM', weight: 'Heaviest', volume: 'Volume', reps: 'Most reps', time: 'Longest', distance: 'Farthest' };
const RECORD_METRICS: Record<string, Metric[]> = {
  weight_reps: ['estimate', 'weight', 'volume'], weighted_bodyweight: ['estimate', 'weight', 'volume'],
  reps: ['reps'], assisted_bodyweight: ['reps'], time: ['time'], weight_time: ['weight', 'time'],
  distance_time: ['distance'], weight_distance: ['weight', 'distance'], floors_time: [], steps_time: [],
};
/**
 * Sets that beat everything the same person logged earlier for that exercise (oldest first through history).
 * The very first time an exercise appears is not a record (nothing to beat yet). Key: set id → record labels.
 */
export function recordSets(history: Workout[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const best = new Map<string, Partial<Record<Metric, number>>>();
  for (const w of [...history].sort((a, b) => a.startedAt - b.startedAt)) {
    // Within one workout, compare against what came before this workout (and earlier sets of it).
    for (const b of w.exercises) {
      const metrics = RECORD_METRICS[b.tracking] ?? [];
      const prev = best.get(b.exerciseId);
      const cur = { ...prev };
      for (const s of working(b)) {
        const m = setMetrics(b, s);
        const won: string[] = [];
        for (const k of metrics) {
          const v = m[k]; if (v === undefined) continue;
          const before = cur[k];
          if (prev !== undefined && before !== undefined && v > before + 1e-8) won.push(RECORD_LABEL[k]!);
          if (before === undefined || v > before) cur[k] = v;
        }
        if (won.length) out.set(s.id, won);
      }
      best.set(b.exerciseId, cur);
    }
  }
  return out;
}
export const recordCount = (w: Workout, records: Map<string, string[]>) => w.exercises.reduce((n, b) => n + b.sets.filter((s) => records.has(s.id)).length, 0);

// ── Muscle split ─────────────────────────────────────────────────
export const MUSCLE_GROUPS = RADAR_GROUPS.map(([name]) => name);
/** Share of working sets per muscle group (Back, Chest, Core, Shoulders, Arms, Legs), 0–1, summing to 1 when anything maps. */
export function muscleSplit(workouts: Workout[], exercises: Exercise[]): Record<string, number> {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const groupOf = new Map<string, string>(); for (const [g, ms] of RADAR_GROUPS) for (const m of ms) groupOf.set(m, g);
  const counts: Record<string, number> = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0]));
  for (const w of workouts) for (const b of w.exercises) {
    const n = working(b).length; if (!n) continue;
    const groups = [...new Set(muscleMapping(byId.get(b.exerciseId)).primary.map((m) => groupOf.get(m)).filter((g): g is string => !!g))];
    for (const g of groups) counts[g] += n / groups.length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, total ? counts[g] / total : 0]));
}

// ── Time ─────────────────────────────────────────────────────────
/** Minutes trained per calendar week (Monday first), oldest first, ending with the current week. */
export function weeklyMinutes(workouts: Workout[], weeks = 12, now = Date.now()) {
  const current = mondayOf(now);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(current, -7 * (weeks - 1 - i)), end = addDays(start, 7);
    return { start, minutes: workouts.filter((w) => w.startedAt >= start && w.startedAt < end).reduce((n, w) => n + minutesOf(w), 0) };
  });
}
/** Weeks in a row with at least one workout, counting back from this week (or last week if this one is still empty). */
export function weekStreak(workouts: Workout[], now = Date.now()) {
  const weeks = new Set(workouts.map((w) => mondayOf(w.startedAt)));
  let week = mondayOf(now); if (!weeks.has(week)) week = addDays(week, -7);
  let n = 0; while (weeks.has(week)) { n++; week = addDays(week, -7); }
  return n;
}

// ── Comparison ───────────────────────────────────────────────────
export type Period = '30d' | '3m' | '1y' | 'all';
export const PERIODS: { value: Period; label: string }[] = [{ value: '30d', label: '30 days' }, { value: '3m', label: '3 months' }, { value: '1y', label: 'Year' }, { value: 'all', label: 'All time' }];
export const PERIOD_TITLE: Record<Period, string> = { '30d': 'Last 30 days', '3m': 'Last 3 months', '1y': 'Last 12 months', all: 'All time' };
const PERIOD_DAYS: Record<Period, number> = { '30d': 30, '3m': 91, '1y': 365, all: Infinity };
export function inPeriod(workouts: Workout[], p: Period, now = Date.now()) {
  if (p === 'all') return workouts;
  const start = startOfDay(now) - (PERIOD_DAYS[p] - 1) * DAY;
  return workouts.filter((w) => w.startedAt >= start);
}
export const totals = (ws: Workout[]) => ({ count: ws.length, minutes: ws.reduce((n, w) => n + minutesOf(w), 0), volume: ws.reduce((n, w) => n + workingVolume(w.exercises), 0) });
/** You relative to the friend, in whole percent (0 when both are 0, 100 when only you have any). */
export const pctChange = (mine: number, theirs: number) => (theirs === 0 ? (mine === 0 ? 0 : 100) : Math.round(((mine - theirs) / theirs) * 100));

const loggedIds = (ws: Workout[]) => new Set(ws.flatMap((w) => w.exercises.filter((b) => working(b).length).map((b) => b.exerciseId)));
/** Exercises you both logged (working sets) in these workouts, most-logged-by-both first. */
export function commonExercises(mine: Workout[], theirs: Workout[]) {
  const a = loggedIds(mine), b = loggedIds(theirs);
  const sessions = (ws: Workout[], id: string) => ws.filter((w) => w.exercises.some((x) => x.exerciseId === id && working(x).length)).length;
  return [...a].filter((id) => b.has(id)).sort((x, y) => sessions(mine, y) + sessions(theirs, y) - sessions(mine, x) - sessions(theirs, x));
}

export type ExerciseMetric = { label: string; kind: 'kg' | 'reps' | 'sec' | 'km'; mine: number; theirs: number };
/** Head-to-head numbers for one exercise; which ones depend on how it's tracked. */
export function exerciseMetrics(exerciseId: string, mine: Workout[], theirs: Workout[]): ExerciseMetric[] {
  const blocks = (ws: Workout[]) => ws.flatMap((w) => w.exercises.filter((b) => b.exerciseId === exerciseId));
  const a = blocks(mine), b = blocks(theirs);
  const tracking: TrackingMode = (a[0] ?? b[0])?.tracking ?? 'weight_reps';
  const best = (bs: ExerciseBlock[], k: Metric) => Math.max(0, ...bs.flatMap((x) => working(x).map((s) => setMetrics(x, s)[k] ?? 0)));
  const perSession = (ws: Workout[]) => Math.max(0, ...ws.map((w) => w.exercises.filter((x) => x.exerciseId === exerciseId).reduce((n, x) => n + working(x).reduce((m, s) => m + (s.reps ?? 0), 0), 0)));
  if (tracking === 'weight_reps' || tracking === 'weighted_bodyweight') return [
    { label: 'One rep max (estimated)', kind: 'kg', mine: best(a, 'estimate'), theirs: best(b, 'estimate') },
    { label: 'Heaviest weight', kind: 'kg', mine: best(a, 'weight'), theirs: best(b, 'weight') },
    { label: 'Best set (volume)', kind: 'kg', mine: best(a, 'volume'), theirs: best(b, 'volume') },
  ];
  if (tracking === 'reps' || tracking === 'assisted_bodyweight') return [
    { label: 'Best set (reps)', kind: 'reps', mine: best(a, 'reps'), theirs: best(b, 'reps') },
    { label: 'Most reps in a session', kind: 'reps', mine: perSession(mine), theirs: perSession(theirs) },
  ];
  if (tracking === 'distance_time' || tracking === 'weight_distance') return [{ label: 'Longest distance', kind: 'km', mine: best(a, 'distance'), theirs: best(b, 'distance') }];
  if (tracking === 'weight_time') return [{ label: 'Heaviest weight', kind: 'kg', mine: best(a, 'weight'), theirs: best(b, 'weight') }, { label: 'Longest time', kind: 'sec', mine: best(a, 'time'), theirs: best(b, 'time') }];
  return [{ label: 'Longest time', kind: 'sec', mine: best(a, 'time'), theirs: best(b, 'time') }];
}
/** Who leads on the first (headline) metric. */
export const leader = (m: ExerciseMetric[]): 'me' | 'friend' | null => (!m[0] || m[0].mine === m[0].theirs ? null : m[0].mine > m[0].theirs ? 'me' : 'friend');
