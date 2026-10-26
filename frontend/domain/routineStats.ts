import type { Routine, Workout, ExerciseBlock } from './types';
import { workingVolume } from './training';

/** Prefer explicit routine identity. Legacy sessions may only have the routine title. */
export function routineSessions(routine: Routine, history: Workout[]): Workout[] {
  return history.filter(w => (w.routineId === routine.id || (!w.routineId && w.title === routine.name)) && w.exercises.some(b => b.sets.some(s => s.done))).sort((a,b) => a.startedAt-b.startedAt);
}
export function lastExerciseSession(exerciseId: string, history: Workout[]): { workout: Workout; blocks: ExerciseBlock[] } | null {
  const workout = [...history].sort((a,b)=>b.startedAt-a.startedAt).find(w => w.exercises.some(b => b.exerciseId === exerciseId && b.sets.some(s=>s.done)));
  return workout ? {workout, blocks: workout.exercises.filter(b=>b.exerciseId===exerciseId && b.sets.some(s=>s.done))} : null;
}
export function routineTrend(sessions: Workout[]) {
  const hasVolume = sessions.some(w=>workingVolume(w.exercises)>0);
  return { label: hasVolume ? 'Training volume' : 'Logged sets', unit: hasVolume ? 'kg' : 'sets', points: sessions.map(w=>({x:w.startedAt,y:hasVolume?workingVolume(w.exercises):w.exercises.reduce((n,b)=>n+b.sets.filter(s=>s.done).length,0)})) };
}
