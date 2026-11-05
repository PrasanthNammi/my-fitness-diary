import {selectDay} from '../lib/daySelection';
import { finishedWorkout, workoutExpired } from '../domain/workoutLimit';
import {activeRecords,metricLabels} from '../domain/records';
import {toast} from '../components/ui';
import {saveIdentity} from '../adapters/profile';
import {engine} from '../adapters/engine';
import {foodOut,foodIn} from '../adapters/compat';
// Mock repositories backed by the local store. Each interface is what a future
// Supabase implementation would satisfy; screens only talk to these objects.

import type {
  ActiveWorkout, CheckIn, DiaryEntry, Exercise, ExerciseBlock, Folder, Food, ID, ISODate,
  Meal, PortionUnit, Profile, Routine, SetEntry, SetType, Settings, TrackingMode, Workout,
} from '../domain/types';
import { uid } from '../lib/format';
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
    const plannedBlocks = blocks.map(prepareActiveBlock);
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
  restore(entry: DiaryEntry) { update(d=>{if(!d.diary.some(e=>e.id===entry.id))d.diary.push(structuredClone(entry))}); },
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
  saveCheckIn(c: Omit<CheckIn, 'id'>) {
    update((d) => {
      const existing = d.checkins.find((x) => x.date === c.date);
      if (existing) Object.assign(existing, c);
      else d.checkins.push({ ...c, id: uid() });
      d.checkins.sort((a, b) => a.date.localeCompare(b.date));
    });
  },
  deleteCheckIn(id: ID) {
    update((d) => void (d.checkins = d.checkins.filter((x) => x.id !== id)));
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
