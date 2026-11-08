// Workout suggestions from ChatGPT or Claude (connector tool suggest_workout_targets). The assistant only
// proposes target sets for a routine; nothing changes until the user chooses Use, and even then the targets
// are only faded values: a set becomes real when the user ticks it. Pure functions, unit-tested.
import type { AddedBy, ExerciseBlock, SetEntry, SetType, TrackingMode, Workout } from './types';
import { trackingFields, type Field } from './training';

export type SuggestionStatus = 'pending' | 'used' | 'dismissed';
/** One target set as the connector stores it (kg, reps, seconds, metres). */
export interface TargetSet { type?: SetType | 'dropset'; kg?: number; reps?: number; duration_seconds?: number; distance_meters?: number }
/** catalogId: the routine exercise's catalogue id, attached by the connector when the name matched the routine. */
export interface SuggestedExercise { exercise: string; catalogId?: string; reason?: string; sets: TargetSet[] }
export interface AiSuggestion {
  id: string;
  routineId: string;
  routineName?: string;
  createdAt: number; // ms
  status: SuggestionStatus;
  usedAt?: number;
  /** Use for one exercise only: the names picked (absent = all). */
  usedExercises?: string[];
  addedBy?: AddedBy;
  note?: string;
  exercises: SuggestedExercise[];
}

export const SUGGESTION_DAYS = 7;
const DAY = 86_400_000;

/** Expired: older than 7 days, or a workout of this routine was finished after the suggestion arrived. */
export function isExpired(s: AiSuggestion, workouts: Workout[], now = Date.now()): boolean {
  return now - s.createdAt > SUGGESTION_DAYS * DAY || workouts.some((w) => w.routineId === s.routineId && w.endedAt > s.createdAt);
}

/** The suggestion that counts for a routine: the newest one, unless it was dismissed or has expired. */
export function activeSuggestion(list: AiSuggestion[], routineId: string | null | undefined, workouts: Workout[], now = Date.now()): AiSuggestion | null {
  if (!routineId) return null;
  const newest = list.filter((s) => s.routineId === routineId).sort((a, b) => b.createdAt - a.createdAt)[0];
  return newest && newest.status !== 'dismissed' && !isExpired(newest, workouts, now) ? newest : null;
}

/** Every routine's current suggestion (for the AI hub), newest first. */
export function activeSuggestions(list: AiSuggestion[], workouts: Workout[], now = Date.now()): AiSuggestion[] {
  const ids = [...new Set(list.map((s) => s.routineId))];
  return ids.map((id) => activeSuggestion(list, id, workouts, now)).filter((s): s is AiSuggestion => !!s).sort((a, b) => b.createdAt - a.createdAt);
}

/** App field values for a target set. */
export function targetValues(t: TargetSet): Partial<Record<Field, number>> {
  const v: Partial<Record<Field, number>> = {};
  if (t.kg != null) v.weightKg = t.kg;
  if (t.reps != null) v.reps = t.reps;
  if (t.duration_seconds != null) v.timeSec = t.duration_seconds;
  if (t.distance_meters != null) v.distanceKm = t.distance_meters / 1000;
  return v;
}

/** Targets only fit an exercise tracked with the same fields (kg × reps targets can't go on a timed exercise). */
export function fits(tracking: TrackingMode, targets: TargetSet[]): boolean {
  const fields = trackingFields(tracking) ?? [];
  return targets.length > 0 && targets.every((t) => {
    const keys = Object.keys(targetValues(t)) as Field[];
    return keys.length > 0 && keys.every((k) => fields.includes(k));
  });
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
/**
 * The block for a suggested exercise: by the catalogue id the connector attached, then by the id the app's own
 * name resolver gives (the same one that linked the routine's exercises), then by display name.
 * Routine names (as get_routines returns them) can differ from catalogue display names.
 */
export function matchBlock<B extends ExerciseBlock>(blocks: B[], exercise: string | SuggestedExercise, nameOf: (exerciseId: string) => string, resolveId?: (ex: SuggestedExercise) => string | null | undefined): B | undefined {
  const ex: SuggestedExercise = typeof exercise === 'string' ? { exercise, sets: [] } : exercise;
  if (ex.catalogId) { const b = blocks.find((x) => x.exerciseId === ex.catalogId); if (b) return b; }
  const id = resolveId?.(ex);
  if (id) { const b = blocks.find((x) => x.exerciseId === id); if (b) return b; }
  const n = norm(ex.exercise);
  return blocks.find((b) => norm(nameOf(b.exerciseId)) === n);
}

const isWarm = (t: { type?: string }) => t.type === 'warmup';
/** Connector set types to app set types ('dropset' is 'drop' in the app). */
export const setType = (t: TargetSet): SetType => (t.type === 'dropset' ? 'drop' : t.type ?? 'normal');

/**
 * Puts targets on a block as faded values: warm-up targets on warm-up sets, the rest on working sets, in order.
 * Ticked sets and values the user typed are never changed (typed values win over faded ones anyway).
 */
export function applyTargets(block: ExerciseBlock, targets: TargetSet[]): ExerciseBlock {
  const queues = { warm: targets.filter(isWarm), work: targets.filter((t) => !isWarm(t)) };
  const used = { warm: 0, work: 0 };
  const sets = block.sets.map((s): SetEntry => {
    const q = s.type === 'warmup' ? 'warm' : 'work';
    const t = queues[q][used[q]++];
    if (!t || s.done) return s;
    return { ...s, suggested: { ...(s.suggested ?? {}), ...targetValues(t) } };
  });
  return { ...block, sets };
}

/** Working target sets beyond the block's working sets. */
export function extraTargets(block: ExerciseBlock, targets: TargetSet[]): TargetSet[] {
  return targets.filter((t) => !isWarm(t)).slice(block.sets.filter((s) => s.type !== 'warmup').length);
}

/** New, unticked sets carrying the given targets as faded values. */
export function targetSets(targets: TargetSet[], newId: () => string): SetEntry[] {
  return targets.map((t) => ({
    id: newId(), type: setType(t), weightKg: null, reps: null, timeSec: null, distanceKm: null, rpe: null, done: false,
    suggested: targetValues(t),
  }));
}
