// A Hevy-like check on logged sets: a weight or reps value that is very unlikely for this person and exercise
// (usually a typo: 28 instead of 12, 100 instead of 10). The set stays logged; the app shows a warning on it until
// the person edits it or says it's right (SetEntry.unusualOk).
import type { ID, SetEntry, TrackingMode, Workout } from './types';

/** Recent working sets of an exercise: the heaviest one and the usual (median) reps, from its last 5 workouts. */
export type RecentBest = { kg: number | null; reps: number | null; usualReps: number | null };

const RECENT = 5;
const WEIGHT_MODES: TrackingMode[] = ['weight_reps', 'weighted_bodyweight'];

export function recentBest(history: Workout[], exerciseId: ID): RecentBest {
  const sets: SetEntry[] = [];
  let workouts = 0;
  for (const w of [...history].sort((a, b) => b.endedAt - a.endedAt)) {
    const own = w.exercises.filter((b) => b.exerciseId === exerciseId).flatMap((b) => b.sets.filter((s) => s.done && s.type !== 'warmup'));
    if (!own.length) continue;
    sets.push(...own);
    if (++workouts >= RECENT) break;
  }
  return summary(sets);
}

function summary(sets: SetEntry[]): RecentBest {
  const withKg = sets.filter((s) => s.weightKg != null && s.weightKg > 0);
  const top = withKg.reduce<SetEntry | null>((m, s) => (!m || s.weightKg! > m.weightKg! ? s : m), null);
  const reps = sets.map((s) => s.reps).filter((r): r is number => r != null && r > 0).sort((a, b) => a - b);
  return { kg: top?.weightKg ?? null, reps: top?.reps ?? null, usualReps: reps.length ? reps[Math.floor(reps.length / 2)]! : null };
}

export type Unusual = { field: 'weightKg' | 'reps'; value: number };

/**
 * Weight: more than 1.5× the recent best and at least 10 kg more (10 → 28 warns; 100 → 120 doesn't).
 * Reps: above 100, or at least 20 and more than 3× the usual reps.
 */
export function unusualSet(s: SetEntry, tracking: TrackingMode, best: RecentBest): Unusual | null {
  if (!s.done || s.unusualOk) return null;
  if (WEIGHT_MODES.includes(tracking) && s.weightKg != null && best.kg != null && s.weightKg > best.kg * 1.5 && s.weightKg - best.kg >= 10) return { field: 'weightKg', value: s.weightKg };
  if (s.reps != null && (s.reps > 100 || (best.usualReps != null && s.reps >= 20 && s.reps > best.usualReps * 3))) return { field: 'reps', value: s.reps };
  return null;
}
