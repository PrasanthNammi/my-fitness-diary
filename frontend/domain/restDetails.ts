// What the rest notification says comes next: the next set of this exercise ("Set 2 of 3 · 89 kg × 6"), the
// partner exercise's next set in a superset, the next exercise, or that this was the last set.
import type { ActiveWorkout, ExerciseBlock, SetEntry } from './types';
import { fmtNum, kgTo } from '../lib/format';

const fmt = (v: number) => fmtNum(v, 2);
const mss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function setText(b: ExerciseBlock, s: SetEntry, unit: 'kg' | 'lb') {
  const at = <K extends 'weightKg' | 'reps' | 'timeSec' | 'distanceKm'>(k: K) => s[k] ?? s.suggested?.[k] ?? null;
  const kg = at('weightKg'), reps = at('reps'), time = at('timeSec'), km = at('distanceKm');
  const weight = kg !== null && kg > 0 ? `${fmt(kgTo(kg, unit))} ${unit}` : null;
  const parts = b.tracking === 'weight_reps' && weight && reps !== null ? [`${weight} × ${reps}`]
    : [weight, reps !== null ? `${reps} reps` : null, time !== null ? mss(time) : null, km !== null ? `${fmt(km)} km` : null].filter(Boolean);
  return [`Set ${b.sets.indexOf(s) + 1} of ${b.sets.length}`, ...parts].join(' · ');
}

/** "Next: …" for the rest after a set of `blockId`, or null when the block isn't in the workout. */
export function restNext(a: ActiveWorkout, blockId: string, unit: 'kg' | 'lb', name: (exerciseId: string) => string): string | null {
  const i = a.exercises.findIndex((b) => b.id === blockId);
  if (i < 0) return null;
  const b = a.exercises[i]!, pending = (x: ExerciseBlock) => x.sets.find((s) => !s.done);
  // In a superset the partner exercise comes next (in order, wrapping round), then this one again.
  const group = b.supersetId ? a.exercises.filter((x) => x.supersetId === b.supersetId) : [b];
  const at = group.indexOf(b), order = [...group.slice(at + 1), ...group.slice(0, at + 1)];
  for (const x of order) {
    const s = pending(x);
    if (s) return x === b ? `Next: ${setText(x, s, unit)}` : `Next: ${name(x.exerciseId)} · ${setText(x, s, unit)}`;
  }
  const after = a.exercises.slice(i + 1).find((x) => pending(x) && !(b.supersetId && x.supersetId === b.supersetId));
  return after ? `Next: ${name(after.exerciseId)}` : 'Last set done';
}
