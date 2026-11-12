// Heart rate during workouts: checking a series from the watch (or Health Connect) and summarising it.
import type { HeartRateSeries } from './types';

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
