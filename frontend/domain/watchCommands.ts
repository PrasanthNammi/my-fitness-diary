// What a command from the MFD watch does to the running workout. Pure: it changes the ActiveWorkout it is given
// (inside workouts.mutate), using the same rules as the phone's workout screen (logging fills empty values from the
// faded targets and the previous session, a logged set starts the rest timer, supersets stay together). A command
// for another workout, a missing exercise or set, or with invalid values changes nothing.
import type { ActiveWorkout, ExerciseBlock, SetEntry, SetType, TrackingMode, Workout } from './types';
import { findPrevious, logSetValues, ordinalWithinType, prepareActiveBlock, resetTimer, startTimer } from './training';
import { joinSuperset, leaveSuperset } from './supersets';

export type WatchCommand = { v: number; id: string; type: string; [key: string]: unknown };
export type WatchCtx = {
  history: Workout[];
  now: number;
  newId: () => string;
  exercise: (id: string) => { id: string; tracking: TrackingMode } | null;
  defaultRestSec: number;
};

/** Commands that change the running workout (the rest — start, finish, quick logs — are handled by the page). */
export const WORKOUT_COMMANDS = ['logSet', 'updateSet', 'unlogSet', 'setType', 'addSet', 'removeSet', 'restAdjust', 'restSkip', 'addExercise', 'removeExercise', 'moveExercise', 'superset', 'unsuperset'] as const;
const SET_TYPES: SetType[] = ['warmup', 'normal', 'failure', 'drop'];
const LIMITS = { weightKg: [0, 1000], reps: [0, 1000], timeSec: [0, 86_400], distanceKm: [0, 1000] } as const;
type Field = keyof typeof LIMITS;

/** Valid set values from a command (unknown fields and out-of-range values are dropped). */
export function setValues(v: unknown): Partial<Pick<SetEntry, Field>> {
  const out: Partial<Pick<SetEntry, Field>> = {};
  if (!v || typeof v !== 'object') return out;
  for (const f of Object.keys(LIMITS) as Field[]) {
    const x = (v as Record<string, unknown>)[f];
    if (typeof x !== 'number' || !Number.isFinite(x) || x < LIMITS[f][0] || x > LIMITS[f][1]) continue;
    if ((f === 'reps' || f === 'timeSec') && !Number.isInteger(x)) continue;
    out[f] = f === 'weightKg' ? Math.round(x * 1000) / 1000 : f === 'distanceKm' ? Math.round(x * 1000) / 1000 : x;
  }
  return out;
}

const str = (v: unknown) => (typeof v === 'string' && v.length <= 100 ? v : null);
const timerFor = (a: ActiveWorkout, b: ExerciseBlock) => a.timers[b.id] ?? { durationSec: b.restSec, endsAt: null, pausedRemainingSec: null };

/** Applies `c` to `a`. Returns whether anything changed. */
export function applyWorkoutCommand(a: ActiveWorkout, c: WatchCommand, ctx: WatchCtx): boolean {
  if (c.workoutId !== a.id) return false;
  const b = a.exercises.find((x) => x.id === str(c.block));
  const s = b?.sets.find((x) => x.id === str(c.set));
  switch (c.type) {
    case 'logSet': {
      if (!b || !s || s.done) return false;
      const draft = { ...s, ...setValues(c.values) };
      const previous = findPrevious(ctx.history, b.exerciseId, draft.type, ordinalWithinType(b.sets, b.sets.indexOf(s)));
      const logged = logSetValues(draft, b.tracking, previous);
      if (!logged) return false;
      Object.assign(s, logged);
      if (b.restSec > 0) a.timers[b.id] = startTimer({ ...timerFor(a, b), durationSec: b.restSec }, ctx.now);
      return true;
    }
    case 'updateSet': {
      const v = setValues(c.values);
      if (!b || !s || !Object.keys(v).length) return false;
      Object.assign(s, v);
      return true;
    }
    case 'unlogSet':
      if (!s?.done) return false;
      s.done = false;
      return true;
    case 'setType': {
      const t = c.setType as SetType;
      if (!s || !SET_TYPES.includes(t) || s.type === t) return false;
      s.type = t;
      return true;
    }
    case 'addSet': {
      if (!b || b.sets.length >= 50) return false;
      const last = b.sets[b.sets.length - 1];
      const planned = (f: Field) => last ? last[f] ?? last.suggested?.[f] ?? null : null;
      // The watch names the new set (so its next taps on it match before the phone answers); else a fresh id.
      const wanted = str(c.newSet), id = wanted && /^[\w-]{8,64}$/.test(wanted) && !a.exercises.some((x) => x.sets.some((y) => y.id === wanted)) ? wanted : ctx.newId();
      b.sets.push({ id, type: 'normal', weightKg: null, reps: null, timeSec: null, distanceKm: null, floors: null, steps: null, rpe: null, done: false,
        suggested: { weightKg: planned('weightKg'), reps: planned('reps'), timeSec: planned('timeSec'), distanceKm: planned('distanceKm') } });
      return true;
    }
    case 'removeSet':
      if (!b || !s || b.sets.length <= 1) return false;
      b.sets.splice(b.sets.indexOf(s), 1);
      return true;
    case 'restAdjust': {
      const sec = c.sec;
      const t = b && a.timers[b.id];
      if (!b || !t || t.endsAt === null || (sec !== 15 && sec !== -15)) return false;
      const base = sec > 0 ? Math.max(t.endsAt, ctx.now) : t.endsAt;
      a.timers[b.id] = { ...t, endsAt: Math.max(ctx.now, base + sec * 1000), pausedRemainingSec: null };
      return true;
    }
    case 'restSkip': {
      const t = b && a.timers[b.id];
      if (!b || !t || (t.endsAt === null && t.pausedRemainingSec === null)) return false;
      a.timers[b.id] = resetTimer(t);
      return true;
    }
    case 'addExercise': {
      const ex = ctx.exercise(str(c.exercise) ?? '');
      if (!ex || a.exercises.length >= 40) return false;
      const sets = typeof c.sets === 'number' && Number.isInteger(c.sets) ? Math.min(10, Math.max(1, c.sets)) : 3;
      // The watch names the new exercise and its sets (so its next taps match before the phone answers).
      const used = new Set(a.exercises.flatMap((x) => [x.id, ...x.sets.map((y) => y.id)]));
      const free = (v: unknown) => { const id = str(v); return id && /^[\w-]{8,64}$/.test(id) && !used.has(id) ? (used.add(id), id) : ctx.newId(); };
      const setIds = Array.isArray(c.newSets) ? c.newSets : [];
      const block = prepareActiveBlock({ id: free(c.newBlock), exerciseId: ex.id, tracking: ex.tracking, restSec: ex.tracking === 'distance_time' ? 0 : ctx.defaultRestSec, note: '', supersetId: null,
        sets: Array.from({ length: sets }, (_, i) => ({ id: free(setIds[i]), type: 'normal' as SetType, weightKg: null, reps: null, timeSec: null, distanceKm: null, floors: null, steps: null, rpe: null, done: false })) });
      a.exercises.push(block);
      a.timers[block.id] = { durationSec: block.restSec, endsAt: null, pausedRemainingSec: null };
      // Added from inside a superset: joins it, right after that exercise.
      const into = a.exercises.find((x) => x.id === str(c.supersetWith));
      if (into) a.exercises = joinSuperset(a.exercises, into.id, block.id);
      return true;
    }
    case 'removeExercise':
      if (!b) return false;
      a.exercises = leaveSuperset(a.exercises, b.id).filter((x) => x.id !== b.id);
      delete a.timers[b.id];
      return true;
    case 'moveExercise': {
      const i = b ? a.exercises.indexOf(b) : -1, j = i + (c.dir === 1 ? 1 : c.dir === -1 ? -1 : 0);
      if (i < 0 || j === i || j < 0 || j >= a.exercises.length) return false;
      [a.exercises[i], a.exercises[j]] = [a.exercises[j]!, a.exercises[i]!];
      return true;
    }
    case 'superset': {
      const next = b ? a.exercises[a.exercises.indexOf(b) + 1] : undefined;
      if (!b || !next || (b.supersetId && b.supersetId === next.supersetId)) return false;
      a.exercises = joinSuperset(a.exercises, b.id, next.id);
      return true;
    }
    case 'unsuperset':
      if (!b?.supersetId) return false;
      a.exercises = leaveSuperset(a.exercises, b.id);
      return true;
    default:
      return false;
  }
}
