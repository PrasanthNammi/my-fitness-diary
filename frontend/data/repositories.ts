import {selectDay} from '../lib/daySelection';
import { finishedWorkout, workoutExpired } from '../domain/workoutLimit';
import {activeRecords,metricLabels} from '../domain/records';
import {toast} from '../components/ui';
import {saveIdentity} from '../adapters/profile';
import {engine} from '../adapters/engine';
import {foodOut,foodIn} from '../adapters/compat';
import {withServingWeight} from '../domain/nutrition';
// Mock repositories backed by the local store. Each interface is what a future
// Supabase implementation would satisfy; screens only talk to these objects.

import type {
  ActiveWorkout, CheckIn, DiaryEntry, Exercise, ExerciseBlock, Folder, Food, ID, ISODate,
  Meal, PortionUnit, Profile, Routine, SetEntry, SetType, Settings, TrackingMode, Workout,
} from '../domain/types';
import { uid } from '../lib/format';
import { resolveExercise } from '../catalogue/runtime';
import { activeSuggestion, applyTargets, extraTargets, fits, matchBlock, removeTargets, targetSets, type AiSuggestion } from '../domain/aiSuggestions';
import { getDB, update } from './store';


import { startTimer, prepareActiveBlock, logSetValues, findPrevious, ordinalWithinType } from '../domain/training';

export const newSet = (type: SetType = 'normal', from?: Partial<SetEntry>): SetEntry => ({
  id: uid(),
  type,
  weightKg: from?.weightKg ?? null,
  reps: from?.reps ?? null,
  timeSec: from?.timeSec ?? null,
  distanceKm: from?.distanceKm ?? null,
  floors: from?.floors ?? null,
  steps: from?.steps ?? null,
  rpe: null,
  done: false,
});

export function newBlock(ex: Exercise, opts: { sets: number; reps: number | null; weightKg: number | null; restSec: number }): ExerciseBlock {
  return {
    id: uid(),
    exerciseId: ex.id,
    tracking: ex.tracking,
    restSec: opts.restSec,
    note: '',
    supersetId: null,
    sets: Array.from({ length: Math.max(1, opts.sets) }, () => newSet('normal', { reps: opts.reps, weightKg: opts.weightKg })),
  };
}

// ── Exercises ─────────────────────────────────────────────────────
export interface ExerciseRepository {
  all(): Exercise[];
  byId(id: ID): Exercise | undefined;
  createCustom(input: Omit<Exercise, 'id' | 'source' | 'sourceRef' | 'mediaUrl'>): Promise<Exercise>;
}
export const exercises: ExerciseRepository = {
  all: () => getDB().customExercises,
  byId: (id) => getDB().customExercises.find((e) => e.id === id),
  async createCustom(input) {const ex:Exercise={...input,id:'custom:'+uid(),source:'custom',sourceRef:null,mediaUrl:null};update(d=>void d.customExercises.push(ex));return ex;},
};
export const exerciseName = (id: ID) => exercises.byId(id)?.name ?? 'Unknown exercise';

// ── Routines & folders ────────────────────────────────────────────
export const training = {
  createFolder(name: string): Folder {
    const f: Folder = { id: uid(), name: name.trim(), collapsed: false, createdAt: Date.now() };
    update((d) => void d.folders.push(f));
    return f;
  },
  renameFolder(id: ID, name: string) {
    update((d) => {
      const f = d.folders.find((x) => x.id === id);
      if (f) f.name = name.trim();
    });
  },
  toggleFolder(id: ID) {
    update((d) => {
      const f = d.folders.find((x) => x.id === id);
      if (f) f.collapsed = !f.collapsed;
    });
  },
  /** Deleting a folder moves its routines to the root rather than deleting them. */
  deleteFolder(id: ID, deleteRoutines: boolean) {
    update((d) => {
      d.folders = d.folders.filter((f) => f.id !== id);
      if (deleteRoutines) d.routines = d.routines.filter((r) => r.folderId !== id);
      else d.routines.forEach((r) => r.folderId === id && (r.folderId = null));
    });
  },
  saveRoutine(r: Routine) {
    update((d) => {
      const i = d.routines.findIndex((x) => x.id === r.id);
      const next = { ...r, updatedAt: Date.now() };
      if (i >= 0) d.routines[i] = next;
      else d.routines.push(next);
    });
  },
  renameRoutine(id: ID, name: string) {
    update((d) => {
      const r = d.routines.find((x) => x.id === id);
      if (r) (r.name = name.trim()), (r.updatedAt = Date.now());
    });
  },
  moveRoutine(id: ID, folderId: ID | null) {
    update((d) => {
      const r = d.routines.find((x) => x.id === id);
      if (r) r.folderId = folderId;
    });
  },
  deleteRoutine(id: ID) {
    update((d) => void (d.routines = d.routines.filter((r) => r.id !== id)));
  },
};

// ── Active workout ────────────────────────────────────────────────
export const workouts = {
  start(routine: Routine | null) {
    const blocks: ExerciseBlock[] = routine
      ? structuredClone(routine.exercises).map((b) => ({ ...b, id: uid(), sets: b.sets.map((s) => ({ ...s, suggested: undefined, id: uid(), done: false })) }))
      : [];
    let plannedBlocks = blocks.map(prepareActiveBlock);
    // Targets the user accepted for this routine (Use) become the faded values of the new workout.
    const accepted = routine ? activeSuggestion(getDB().aiSuggestions, routine.id, getDB().workouts) : null;
    if (accepted?.status === 'used') plannedBlocks = withTargets(plannedBlocks, accepted, accepted.usedExercises);
    const a: ActiveWorkout = {
      id: uid(),
      title: routine?.name ?? 'Workout',
      routineId: routine?.id ?? null,
      startedAt: Date.now(),
      exercises: plannedBlocks,
      timers: Object.fromEntries(blocks.map((b) => [b.id, { durationSec: b.restSec, endsAt: null, pausedRemainingSec: null }])),
    };
    update((d) => void (d.active = a));
  },
  mutate(fn: (a: ActiveWorkout) => void) {
    if (workouts.expire()) return;
    update((d) => {
      if (d.active) fn(d.active);
    });
  },
  /** Toggling a set to done starts that exercise's rest timer. */
  toggleDone(blockId: ID, setId: ID) {
    if (workouts.expire()) return;
    update((d) => {
      const a = d.active;
      if (!a) return;
      const b = a.exercises.find((x) => x.id === blockId);
      const s = b?.sets.find((x) => x.id === setId);
      if (!b || !s) return;
      if (s.done) s.done = false;
      else {
        const previous = findPrevious(d.workouts, b.exerciseId, s.type, ordinalWithinType(b.sets, b.sets.indexOf(s)));
        const logged = logSetValues(s, b.tracking, previous);
        if (!logged) { toast('Enter the missing set values before logging'); return; }
        Object.assign(s, logged);
      }
      if (s.done && b.restSec > 0) {
        const t = a.timers[b.id] ?? { durationSec: b.restSec, endsAt: null, pausedRemainingSec: null };
        a.timers[b.id] = startTimer({ ...t, durationSec: b.restSec }, Date.now());
      }
    });
    const current=getDB();const records=activeRecords(current.workouts,current.active).get(setId);if(records?.length)toast('♛ '+records.map(r=>metricLabels[r.metric]).join(' · '));
  },
  /** Idempotent recovery for suspended tabs, offline use and stale callbacks. */
  expire(now = Date.now(), expectedId?: ID): { workout: Workout | null } | null {
    const a = getDB().active;
    if (!a || (expectedId && a.id !== expectedId) || !workoutExpired(a, now)) return null;
    const workout = finishedWorkout(a, now);
    update(d => {
      if (!d.active || d.active.id !== a.id) return;
      if (workout && !d.workouts.some(w=>w.id===workout.id)) d.workouts.push(workout);
      d.active = null;
    });
    return { workout };
  },
  discard() {
    update((d) => void (d.active = null));
  },
  /** Saves the session to history; sets that were never completed are dropped. */
  finish(): Workout | null {
    const a = getDB().active;
    if (!a || !a.exercises.some(b => b.sets.some(s => s.done))) return null;
    const w = finishedWorkout(a);
    if (!w) return null;
    update((d) => {
      if (!d.active || d.active.id !== a.id) return;
      if (!d.workouts.some(existing=>existing.id===w.id)) d.workouts.push(w);
      d.active = null;
    });
    return w;
  },
  /** Replaces a finished workout after a manual edit from history. */
  updateWorkout(w: Workout) {
    update((d) => {
      const i = d.workouts.findIndex((x) => x.id === w.id);
      if (i >= 0) d.workouts[i] = w;
    });
  },
  deleteWorkout(id: ID) {
    update((d) => void (d.workouts = d.workouts.filter((w) => w.id !== id)));
  },
};

export function routineFromWorkout(w: Workout, name: string, folderId: ID | null): Routine {
  return {
    id: uid(),
    name: name.trim(),
    folderId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    exercises: w.exercises.map((b) => ({ ...b, id: uid(), sets: b.sets.map((s) => ({ ...s, suggested: undefined, id: uid(), done: false })) })),
  };
}

// ── Foods & diary ─────────────────────────────────────────────────
export const foods = {
  all: (): Food[] => getDB().customFoods,
  byBarcode: (code: string): Food | undefined => foods.all().find((f) => f.barcode === code),
  async saveCustom(f: Food) {let p=foodOut(f),row=await engine().publish('food',f.name,f.barcode,p,(f as any).sharedId||null);return foodIn({...row.data,id:'shared-'+row.id,sharedId:row.id,creatorId:row.creator_id,name:row.name,barcode:row.barcode,source:'Community'});},

  deleteCustom(id: ID) {
    update((d) => {
      d.customFoods = d.customFoods.filter((f) => f.id !== id);
      d.favouriteFoodIds = d.favouriteFoodIds.filter((x) => x !== id);
    });
  },
  toggleFavourite(id: ID, food?: Food) {
    update((d) => {
      const adding = !d.favouriteFoodIds.includes(id);
      const item = food ?? d.customFoods.find(f=>f.id===id) ?? d.diary.find(e=>e.food.id===id)?.food;
      d.settings.favouriteFoods = (d.settings.favouriteFoods ?? []).filter(f=>f.id!==id);
      if (adding && item) d.settings.favouriteFoods.push(structuredClone(item));
      d.favouriteFoodIds = d.favouriteFoodIds.includes(id)
        ? d.favouriteFoodIds.filter((x) => x !== id)
        : [id, ...d.favouriteFoodIds];
    });
  },
};

export const diary = {
  /** Puts a removed entry back; `at` is its old position, so Undo returns it to the same place in its meal. */
  restore(entry: DiaryEntry, at?: number) { update(d=>{if(d.diary.some(e=>e.id===entry.id))return;const i=at==null?d.diary.length:Math.max(0,Math.min(at,d.diary.length));d.diary.splice(i,0,structuredClone(entry))}); },
  add(date: ISODate, meal: Meal, food: Food, amount: number, unit: PortionUnit): DiaryEntry {
    const e: DiaryEntry = { id: uid(), date, meal, food, amount, unit, createdAt: Date.now() };
    update((d) => void d.diary.push(e));
    return e;
  },
  /** Copies entries to another day or meal as new entries (same food and portion). */
  copy(entries: DiaryEntry[], date: ISODate, meal: Meal): DiaryEntry[] {
    const now = Date.now();
    const copies = entries.map((e): DiaryEntry => ({ id: uid(), date, meal, food: structuredClone(e.food), amount: e.amount, unit: e.unit, createdAt: now }));
    update((d) => void d.diary.push(...copies));
    return copies;
  },
  updateEntry(id: ID, patch: Partial<Pick<DiaryEntry, 'amount' | 'unit' | 'meal'>>) {
    update((d) => {
      const e = d.diary.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
    });
  },
  /** Sets what one serving of a food weighs on every logged copy of it and on the saved food, without changing what was already logged. */
  // `keepEntryId` is the entry being edited: it uses the new weight. Every other entry logged in servings
  // keeps its calories, so it is moved to grams at the weight it was logged with.
  setServingWeight(foodId: ID, weight: number, keepEntryId?: ID) {
    update((d) => {
      for (const e of d.diary) {
        if (e.food.id !== foodId) continue;
        const old = e.food.servingSize;
        if (e.id !== keepEntryId && e.unit === 'serving' && old && old !== weight && e.food.refUnit !== 'serving') {
          e.amount = Math.round(e.amount * old * 100) / 100;
          e.unit = e.food.refUnit;
        }
        e.food = withServingWeight(e.food, weight);
      }
      // Only touch the lists that hold this food, so nothing else is marked as changed.
      if (d.customFoods.some((f) => f.id === foodId)) d.customFoods = d.customFoods.map((f) => (f.id === foodId ? withServingWeight(f, weight) : f));
      if (d.settings.favouriteFoods?.some((f) => f.id === foodId)) d.settings.favouriteFoods = d.settings.favouriteFoods.map((f) => (f.id === foodId ? withServingWeight(f, weight) : f));
    });
  },
  remove(id: ID) {
    update((d) => void (d.diary = d.diary.filter((x) => x.id !== id)));
  },
  setWater(date: ISODate, ml: number) {
    update((d) => void (d.water[date] = Math.max(0, ml)));
  },
};

// ── Body ──────────────────────────────────────────────────────────
export const body = {
  logWeight(date: ISODate, kg: number) {
    update((d) => {
      const existing = d.weights.find((w) => w.date === date);
      if (existing) existing.kg = kg;
      else d.weights.push({ id: uid(), date, kg });
      d.weights.sort((a, b) => a.date.localeCompare(b.date));
    });
  },
  deleteWeight(id: ID) {
    update((d) => void (d.weights = d.weights.filter((w) => w.id !== id)));
  },
  /** Recovery check-in (sleep hours, energy, soreness, note). One per day: a second one updates it. */
  saveCheckIn(c: { date: ISODate; sleep: number | null; energy: number | null; soreness: number | null; note: string }) {
    update((d) => {
      const existing = d.checkins.find((x) => x.date === c.date && (x.sleep != null || x.energy != null || x.soreness != null || x.note));
      if (existing) Object.assign(existing, c);
      else d.checkins.push({ id: uid(), ...c });
      d.checkins.sort((a, b) => a.date.localeCompare(b.date));
    });
  },
  /** Removes the recovery part of a check-in; measurements on the same row stay. */
  deleteCheckIn(id: ID) {
    update((d) => {
      d.checkins = d.checkins.flatMap((x) => {
        if (x.id !== id) return [x];
        const kept = { ...x, sleep: null, steps: null, energy: null, soreness: null, note: '' };
        return ['waist', 'chest', 'hips', 'arms'].some((k) => kept[k as 'waist'] != null && kept[k as 'waist'] !== '') ? [kept] : [];
      });
    });
  },
  /** A body measurement in cm (waist, chest, hips or arms), as its own dated row like the older screen. */
  addMeasurement(date: ISODate, field: 'waist' | 'chest' | 'hips' | 'arms', cm: number) {
    update((d) => {
      d.checkins.push({ id: uid(), date, [field]: cm, note: '' });
      d.checkins.sort((a, b) => a.date.localeCompare(b.date));
    });
  },
  /** Several measurements taken together (cm), saved as one dated row; empty fields are left out. */
  addMeasurements(date: ISODate, values: Partial<Record<'waist' | 'chest' | 'hips' | 'arms', number>>) {
    const set = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null && Number.isFinite(v)));
    if (!Object.keys(set).length) return;
    update((d) => {
      d.checkins.push({ id: uid(), date, ...set, note: '' });
      d.checkins.sort((a, b) => a.date.localeCompare(b.date));
    });
  },
  /** Removes all measurements from a row (recovery values on the same row stay). */
  removeMeasurements(id: ID) {
    update((d) => {
      d.checkins = d.checkins.flatMap((x) => {
        if (x.id !== id) return [x];
        const kept = { ...x, waist: null, chest: null, hips: null, arms: null };
        const left = ['sleep', 'steps', 'energy', 'soreness'].some((k) => kept[k as 'sleep'] != null && kept[k as 'sleep'] !== '') || !!kept.note?.trim();
        return left ? [kept] : [];
      });
    });
  },
  /** Clears one measurement from a row; the row goes when nothing is left on it. */
  removeMeasurement(id: ID, field: 'waist' | 'chest' | 'hips' | 'arms') {
    update((d) => {
      d.checkins = d.checkins.flatMap((x) => {
        if (x.id !== id) return [x];
        const kept = { ...x, [field]: null };
        const left = ['waist', 'chest', 'hips', 'arms', 'sleep', 'steps', 'energy', 'soreness'].some((k) => kept[k as 'waist'] != null && kept[k as 'waist'] !== '') || !!kept.note?.trim();
        return left ? [kept] : [];
      });
    });
  },
};

// ── Profile & settings ────────────────────────────────────────────
export const profileRepo = {
  async save(p: Profile) {
    await saveIdentity(p);
    update((d) => void (d.profile = p));
  },
  updateSettings(patch: Partial<Settings>) {
    update((d) => void (d.settings = { ...d.settings, ...patch }));
  },
  setSelectedDate(date: ISODate) {
    selectDay(date);
  },
};

export const TRACKING_MODES: TrackingMode[] = ['weight_reps', 'reps', 'time', 'weight_time', 'distance_time', 'weight_distance','weighted_bodyweight','assisted_bodyweight','floors_time','steps_time'];

// ── AI workout suggestions ─────────────────────────────────────────
/** Suggested targets onto the matching exercises (all, or only the ones the user picked). */
function withTargets(blocks: ExerciseBlock[], s: AiSuggestion, only?: string[]): ExerciseBlock[] {
  let out = blocks;
  for (const ex of s.exercises) {
    if (only && !only.some((n) => n.toLowerCase() === ex.exercise.toLowerCase())) continue;
    const b = matchBlock(out, ex, exerciseName, suggestedExerciseId);
    if (b && fits(b.tracking, ex.sets)) {
      const history = getDB().workouts;
      const last = (i: number) => findPrevious(history, b.exerciseId, b.sets[i].type, ordinalWithinType(b.sets, i))?.weightKg;
      out = out.map((x) => (x === b ? applyTargets(x, ex.sets, last) : x));
    }
  }
  return out;
}
const findSuggestion = (d: { aiSuggestions: AiSuggestion[] }, id: string) => d.aiSuggestions.find((x) => x.id === id);
/**
 * App exercise id for a suggested exercise: the attached catalogue id, else the resolver that linked the routine's
 * exercises (names as the diary stores them), else an exact display-name match, else the id the app gives
 * unknown names in history.
 */
export function suggestedExerciseId(ex: { exercise: string; catalogId?: string }): string | null {
  if (ex.catalogId && exercises.byId(ex.catalogId)) return ex.catalogId;
  const links = (engine()?.peek()?.state as { mfdExerciseLinks?: Record<string, string> } | undefined)?.mfdExerciseLinks;
  const resolved = resolveExercise({ exercise: ex.exercise, catalogId: ex.catalogId }, links);
  if (resolved && exercises.byId(resolved)) return resolved;
  const n = ex.exercise.trim().toLowerCase().replace(/\s+/g, ' ');
  const byName = exercises.all().find((e) => e.name.trim().toLowerCase().replace(/\s+/g, ' ') === n);
  if (byName) return byName.id;
  const history = 'history:' + encodeURIComponent(ex.exercise.trim().toLowerCase());
  return exercises.byId(history) ? history : null;
}
export const exerciseForSuggestion = (ex: { exercise: string; catalogId?: string }) => { const id = suggestedExerciseId(ex); return id ? exercises.byId(id) : undefined; };

/** Count an exercise as used (Add exercise is a use too, so it can be taken back with Don't use). */
function markUsed(s: AiSuggestion, exercise: string) {
  const all = s.status === 'used' && !s.usedExercises;
  if (all) return;
  const picked = [...new Set([...(s.status === 'used' ? s.usedExercises ?? [] : []), exercise])];
  Object.assign(s, { status: 'used', usedAt: Date.now(), usedExercises: picked });
}
export const suggestions = {
  /**
   * Use (all, or one exercise). In this routine's running workout the targets become faded values right away;
   * otherwise they are applied when the routine is started next. Nothing is logged until a set is ticked.
   */
  use(id: string, exercise?: string) {
    update((d) => {
      const s = findSuggestion(d, id);
      if (!s) return;
      const picked = exercise ? [...new Set([...(s.status === 'used' ? s.usedExercises ?? [] : []), exercise])] : undefined;
      Object.assign(s, { status: 'used', usedAt: Date.now(), usedExercises: picked });
      if (d.active?.routineId === s.routineId) d.active.exercises = withTargets(d.active.exercises, s, exercise ? [exercise] : undefined);
    });
  },
  /**
   * Don't use one exercise after all: it leaves the used list (back to "Review" when none are left) and, in this
   * routine's running workout, its sets go back to the plan (ticked and typed sets kept).
   */
  unuse(id: string, exercise: string) {
    update((d) => {
      const s = findSuggestion(d, id);
      if (!s || s.status !== 'used') return;
      const same = (n: string) => n.toLowerCase() === exercise.toLowerCase();
      const left = (s.usedExercises ?? s.exercises.map((x) => x.exercise)).filter((n) => !same(n));
      if (left.length) Object.assign(s, { usedExercises: left });
      else Object.assign(s, { status: 'pending', usedExercises: undefined, usedAt: undefined });
      const ex = s.exercises.find((x) => same(x.exercise));
      if (ex && d.active?.routineId === s.routineId) {
        const b = matchBlock(d.active.exercises, ex, exerciseName, suggestedExerciseId);
        if (b) {
          const back = removeTargets(b);
          d.active.exercises = back ? d.active.exercises.map((x) => (x === b ? back : x)) : d.active.exercises.filter((x) => x !== b);
        }
      }
    });
  },
  /** Running workout only: extra target sets beyond the exercise's current sets, as unticked sets. */
  addSets(id: string, exercise: string) {
    update((d) => {
      const s = findSuggestion(d, id), ex = s?.exercises.find((x) => x.exercise === exercise);
      if (!s || !ex || d.active?.routineId !== s.routineId) return;
      const b = matchBlock(d.active.exercises, ex, exerciseName, suggestedExerciseId);
      if (!b || !fits(b.tracking, ex.sets)) return;
      const extra = extraTargets(b, ex.sets);
      d.active.exercises = d.active.exercises.map((x) => (x === b ? { ...x, sets: [...x.sets, ...targetSets(extra, uid)] } : x));
    });
  },
  /** Running workout only: a suggested exercise that isn't in it yet, with unticked target sets. */
  addExercise(id: string, exercise: string) {
    const ex = findSuggestion(getDB(), id)?.exercises.find((x) => x.exercise === exercise);
    const found = ex ? exerciseForSuggestion(ex) : undefined;
    if (!found) return false;
    update((d) => {
      const s = findSuggestion(d, id), ex = s?.exercises.find((x) => x.exercise === exercise);
      if (!s || !ex || d.active?.routineId !== s.routineId || !fits(found.tracking, ex.sets)) return;
      const block: ExerciseBlock = { id: uid(), exerciseId: found.id, tracking: found.tracking, restSec: d.settings.defaultRestSec, note: '', supersetId: null, sets: targetSets(ex.sets, uid) };
      d.active.exercises = [...d.active.exercises, block];
      d.active.timers = { ...d.active.timers, [block.id]: { durationSec: block.restSec, endsAt: null, pausedRemainingSec: null } };
      markUsed(s, ex.exercise);
    });
    return true;
  },
  /** The banner's ✕: remove the suggestion for good; in this routine's running workout also take the AI targets out. */
  dismiss(id: string) {
    let removed = false;
    update((d) => {
      const s = findSuggestion(d, id);
      if (!s) return;
      s.status = 'dismissed';
      if (d.active?.routineId === s.routineId) {
        const before = d.active.exercises;
        const next = before.map(removeTargets).filter((b): b is ExerciseBlock => !!b);
        removed = next.length !== before.length || next.some((b, i) => b !== before[i]);
        if (removed) {
          const kept = new Set(next.map((b) => b.id));
          d.active.exercises = next;
          d.active.timers = Object.fromEntries(Object.entries(d.active.timers).filter(([k]) => kept.has(k)));
        }
      }
    });
    return removed;
  },
};
