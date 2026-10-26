import type { ActiveWorkout, Workout } from './types';
export const MAX_WORKOUT_MINUTES = 200;
export const MAX_WORKOUT_MS = MAX_WORKOUT_MINUTES * 60 * 1000;
export function workoutDeadline(a: Pick<ActiveWorkout, 'startedAt'>): number {
  return a.startedAt + MAX_WORKOUT_MS;
}
export function workoutExpired(a: ActiveWorkout, now = Date.now()): boolean {
  return Number.isFinite(a.startedAt) && a.startedAt > 0 && now >= workoutDeadline(a);
}
/** Completed work only, capped at the deadline even after days offline. */
export function finishedWorkout(a: ActiveWorkout, now = Date.now()): Workout | null {
  const exercises = a.exercises.map(b=>({...b,sets:b.sets.filter(s=>s.done)})).filter(b=>b.sets.length);
  if (!exercises.length) return null;
  return { id:a.id,title:a.title.trim()||'Workout',routineId:a.routineId,startedAt:a.startedAt,endedAt:Math.max(a.startedAt, Math.min(now,workoutDeadline(a))),exercises };
}
