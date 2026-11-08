// Set labelling, "previous" matching, volume and timer maths. Pure functions.

import type { ExerciseBlock, RestTimer, SetEntry, SetType, TrackingMode, Workout } from './types';

export const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: 'Warm-up',
  normal: 'Working',
  failure: 'Failure',
  drop: 'Drop Set',
};

/** Display label for each set: W, 1, 2, 3…, F, D. Working sets are numbered excluding warm-ups. */
export function setLabels(sets: SetEntry[]): string[] {
  let n = 0;
  return sets.map((s) => {
    if (s.type === 'warmup') return 'W';
    if (s.type === 'failure') return 'F';
    if (s.type === 'drop') return 'D';
    n += 1;
    return String(n);
  });
}

/** 0-based position of a set among sets of the same type. */
export function ordinalWithinType(sets: SetEntry[], index: number): number {
  const t = sets[index].type;
  let n = 0;
  for (let i = 0; i < index; i++) if (sets[i].type === t) n++;
  return n;
}

const previousIndexes=new WeakMap<Workout[],Map<string,ExerciseBlock>>();
/** Latest finished session's matching set (same exercise, type and ordinal within type). */
export function findPrevious(
  history: Workout[],
  exerciseId: string,
  type: SetType,
  ordinal: number,
): SetEntry | null {
  let index=previousIndexes.get(history);if(!index){index=new Map();for(const w of [...history].sort((a,b)=>b.endedAt-a.endedAt))for(const block of w.exercises)if(!index.has(block.exerciseId))index.set(block.exerciseId,block);previousIndexes.set(history,index)}
  return index.get(exerciseId)?.sets.filter(s=>s.type===type&&s.done)[ordinal]??null;
}

export const TRACKING_LABEL: Record<TrackingMode, string> = {
  weighted_bodyweight: 'Added weight + reps',
  assisted_bodyweight: 'Assistance + reps',
  floors_time: 'Floors + time',
  steps_time: 'Steps + time',
  weight_reps: 'Weight + reps',
  reps: 'Reps only',
  time: 'Time',
  weight_time: 'Weight + time',
  distance_time: 'Distance + time',
  weight_distance: 'Weight + distance',
};

export type Field = 'weightKg' | 'reps' | 'timeSec' | 'distanceKm' | 'floors' | 'steps';

export function trackingFields(mode: TrackingMode): Field[] {
  switch (mode) {
    case 'weighted_bodyweight':
    case 'assisted_bodyweight':
    case 'weight_reps':
      return ['weightKg', 'reps'];
    case 'reps':
      return ['reps'];
    case 'floors_time': return ['floors','timeSec'];
    case 'steps_time': return ['steps','timeSec'];
    case 'time':
      return ['timeSec'];
    case 'weight_time':
      return ['weightKg', 'timeSec'];
    case 'distance_time':
      return ['distanceKm', 'timeSec'];
    case 'weight_distance':
      return ['weightKg', 'distanceKm'];
  }
}

/** Working-set volume (kg × reps), warm-ups excluded. Only completed sets count. */
export function workingVolume(blocks: ExerciseBlock[], onlyDone = true): number {
  let v = 0;
  for (const b of blocks.filter(b=>b.tracking!=='assisted_bodyweight'))
    for (const s of b.sets) {
      if (s.type === 'warmup') continue;
      if (onlyDone && !s.done) continue;
      if (s.weightKg && s.reps) v += s.weightKg * s.reps;
    }
  return v;
}

export function countSets(blocks: ExerciseBlock[], onlyDone = false): number {
  return blocks.reduce((n, b) => n + b.sets.filter((s) => !onlyDone || s.done).length, 0);
}

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

// ── Rest timers ───────────────────────────────────────────────────
export function timerRemaining(t: RestTimer | undefined, now: number): number {
  if (!t) return 0;
  if (t.endsAt !== null) return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
  if (t.pausedRemainingSec !== null) return t.pausedRemainingSec;
  return t.durationSec;
}

export function timerState(t: RestTimer | undefined, now: number): 'idle' | 'running' | 'paused' | 'done' {
  if (!t) return 'idle';
  if (t.endsAt !== null) return t.endsAt > now ? 'running' : 'done';
  if (t.pausedRemainingSec !== null) return 'paused';
  return 'idle';
}

export const startTimer = (t: RestTimer, now: number, fromSec?: number): RestTimer => ({
  ...t,
  endsAt: now + (fromSec ?? t.durationSec) * 1000,
  pausedRemainingSec: null,
});
export const pauseTimer = (t: RestTimer, now: number): RestTimer => ({
  ...t,
  pausedRemainingSec: timerRemaining(t, now),
  endsAt: null,
});
export const resetTimer = (t: RestTimer): RestTimer => ({ ...t, endsAt: null, pausedRemainingSec: null });

export function weightHeading(mode:TrackingMode,unit:string){return mode==='weighted_bodyweight'?`+ ${unit}`:mode==='assisted_bodyweight'?`− ${unit}`:unit}

/** Never relabel completed work as a different exercise. Replacement has fresh set IDs. */
export function replaceExerciseBlock(list: ExerciseBlock[], id: string, replacement: ExerciseBlock, active: boolean): ExerciseBlock[] {
  return list.flatMap(block => {
    if (block.id !== id) return [block];
    const completed = active ? block.sets.filter(s => s.done) : [];
    const next = { ...replacement, supersetId: block.supersetId };
    return completed.length ? [{ ...block, sets: completed }, next] : [next];
  });
}

/** Planned values stay outside actual values until explicitly logged. */
export function prepareActiveSet(s: SetEntry): SetEntry {
  if (s.done || s.suggested !== undefined) return s;
  const suggested = Object.fromEntries(['weightKg','reps','timeSec','distanceKm','floors','steps'].map(f => [f, s[f as Field] ?? null]));
  return { ...s, suggested, weightKg: null, reps: null, timeSec: null, distanceKm: null, floors: null, steps: null };
}
export function prepareActiveBlock(b: ExerciseBlock): ExerciseBlock {
  const sets = b.sets.map(prepareActiveSet);
  return sets.every((s,i) => s === b.sets[i]) ? b : { ...b, sets };
}
export function logSetValues(s: SetEntry, tracking: TrackingMode, previous?: SetEntry | null): SetEntry | null {
  const next = { ...s };
  for (const f of trackingFields(tracking)) {
    const value = s[f] ?? s.suggested?.[f] ?? previous?.[f] ?? null;
    if (value === null || !Number.isFinite(value) || value < 0 || (f !== 'weightKg' && value === 0) || (['reps','floors','steps'].includes(f) && !Number.isInteger(value))) return null;
    next[f] = value;
  }
  return { ...next, done: true };
}

/** A saved workout keeps only logged sets: empty sets are dropped, then exercises left without sets. */
export function loggedBlocks(blocks: ExerciseBlock[]): ExerciseBlock[] {
  return blocks
    .map((b) => ({ ...b, sets: b.sets.filter((s) => trackingFields(b.tracking).some((f) => s[f] != null)).map((s) => ({ ...s, done: true, suggested: undefined, aiTarget: undefined })) }))
    .filter((b) => b.sets.length);
}
