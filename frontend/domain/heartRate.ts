// Heart rate during workouts: checking a series from the watch (or Health Connect) and summarising it.
import type { HeartRateSeries, Workout } from './types';

const MAX_POINTS = 2000; // 8 h at 15 s

/** A valid series, or null. bpm values outside 30–250 count as "no reading" (0). Average and max are recomputed. */
export function heartSeries(v: unknown, source: HeartRateSeries['source']): HeartRateSeries | null {
  if (!v || typeof v !== 'object') return null;
  const { interval, bpm } = v as { interval?: unknown; bpm?: unknown };
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1 || interval > 60) return null;
  if (!Array.isArray(bpm) || !bpm.length || bpm.length > MAX_POINTS) return null;
  const clean = bpm.map((x) => (typeof x === 'number' && Number.isFinite(x) && x >= 30 && x <= 250 ? Math.round(x) : 0));
  const read = clean.filter((x) => x > 0);
  if (!read.length) return null;
  return { interval, bpm: clean, avg: Math.round(read.reduce((a, b) => a + b, 0) / read.length), max: Math.max(...read), source };
}

// ── Summaries for the workout screens ────────────────────────────────────────

/** Five zones as a share of maximum heart rate (below zone 1 counts as zone 1). */
export const HR_ZONES = [
  { z: 1, label: 'Warm up', from: 0.5 },
  { z: 2, label: 'Easy', from: 0.6 },
  { z: 3, label: 'Aerobic', from: 0.7 },
  { z: 4, label: 'Threshold', from: 0.8 },
  { z: 5, label: 'Max', from: 0.9 },
] as const;

/** Estimated maximum heart rate (220 − age). */
export const maxHeartRate = (age?: number | null) => 220 - Math.min(90, Math.max(13, Math.round(age || 30)));

/** Zone index 0–4 for a reading. */
export const zoneIndex = (bpm: number, max: number) => {
  for (let i = HR_ZONES.length - 1; i > 0; i--) if (bpm >= HR_ZONES[i]!.from * max) return i;
  return 0;
};

/** Readings with their time (seconds from the start, middle of each step); steps without a reading are left out. */
export const heartPoints = (hr: HeartRateSeries) =>
  hr.bpm.flatMap((bpm, i) => (bpm > 0 ? [{ t: (i + 0.5) * hr.interval, bpm }] : []));

/** Seconds spent in each zone. */
export function zoneSeconds(hr: HeartRateSeries, max: number): number[] {
  const out = HR_ZONES.map(() => 0);
  for (const bpm of hr.bpm) if (bpm > 0) out[zoneIndex(bpm, max)]! += hr.interval;
  return out;
}

/** Average and maximum between two times (seconds from the start), or null without readings. */
export function heartBetween(hr: HeartRateSeries, from: number, to: number): { avg: number; max: number } | null {
  const x = heartPoints(hr).filter((p) => p.t >= from && p.t < to).map((p) => p.bpm);
  return x.length ? { avg: Math.round(x.reduce((a, b) => a + b, 0) / x.length), max: Math.max(...x) } : null;
}

export type ExerciseSection = { exerciseId: string; start: number; end: number };
/** When each exercise was done, from the times its sets were logged (seconds from the start). Runs of the same
 *  exercise form one section, from the set logged before it (or the start) to its last set; supersets alternate.
 *  Workouts logged before set times were kept have none. */
export function exerciseSections(w: Pick<Workout, 'startedAt' | 'endedAt' | 'exercises'>): ExerciseSection[] {
  const end = Math.max(0, (w.endedAt - w.startedAt) / 1000);
  const logged = w.exercises
    .flatMap((b) => b.sets.flatMap((s) => (typeof s.doneAt === 'number' && s.doneAt >= w.startedAt && s.doneAt <= w.endedAt + 60_000 ? [{ exerciseId: b.exerciseId, t: Math.min(end, (s.doneAt - w.startedAt) / 1000) }] : [])))
    .sort((a, b) => a.t - b.t);
  const out: ExerciseSection[] = [];
  let from = 0;
  for (const s of logged) {
    const last = out[out.length - 1];
    if (last && last.exerciseId === s.exerciseId) last.end = s.t;
    else out.push({ exerciseId: s.exerciseId, start: from, end: s.t });
    from = s.t;
  }
  return out.filter((s) => s.end > s.start);
}

/** Calories from average heart rate, body weight, age and sex (Keytel et al., 2005), or null when not enough to go on. */
export function estimateKcal(avgBpm: number, minutes: number, kg: number | null | undefined, age: number | null | undefined, sex: 'male' | 'female' | null | undefined): number | null {
  if (!avgBpm || !kg || !age || minutes <= 0) return null;
  const perMin = sex === 'female' ? (-20.4022 + 0.4472 * avgBpm - 0.1263 * kg + 0.074 * age) / 4.184 : (-55.0969 + 0.6309 * avgBpm + 0.1988 * kg + 0.2017 * age) / 4.184;
  return Math.max(0, Math.round(perMin * minutes));
}

/** A series from Health Connect readings ([seconds from the start, bpm]), when they cover at least half of the
 *  workout's minutes (a watch's occasional all-day readings are too sparse to draw), else null. */
export function seriesFromSamples(samples: unknown, durationSec: number, interval = 15): HeartRateSeries | null {
  if (!Array.isArray(samples) || durationSec <= 0) return null;
  const n = Math.min(MAX_POINTS, Math.floor(durationSec / interval) + 1);
  const sum = new Array<number>(n).fill(0), count = new Array<number>(n).fill(0), minutes = new Set<number>();
  for (const p of samples) {
    if (!Array.isArray(p)) continue;
    const [t, bpm] = p as unknown[];
    if (typeof t !== 'number' || typeof bpm !== 'number' || t < 0 || t > durationSec || bpm < 30 || bpm > 250) continue;
    const i = Math.min(n - 1, Math.floor(t / interval));
    sum[i] += bpm; count[i] += 1; minutes.add(Math.floor(t / 60));
  }
  if (minutes.size < Math.max(2, Math.ceil(durationSec / 60) / 2)) return null;
  return heartSeries({ interval, bpm: sum.map((s, i) => (count[i] ? s / count[i]! : 0)) }, 'health');
}
