// The MFD Galaxy Watch app (Android app 2.0+). The phone app relays (android/.../WatchLink.kt): this page publishes a
// small snapshot for the watch whenever the diary changes (routines, the running workout, settings), and takes the
// watch's commands from the phone app's queue, applying each one once. Protocol: android/shared/.../Sync.kt.
import { useEffect, useState } from 'react';
import { getDB, subscribe, type DB } from '../data/store';
import { body, diary, exercises, workouts } from '../data/repositories';
import type { Exercise, Food, PortionUnit, SetEntry, SetType, TrackingMode } from '../domain/types';
import { allowedUnits, calculateTargets, nutrientsFor, sumNutrients } from '../domain/nutrition';
import { checkinNumber, isRecoveryRow } from '../domain/progressStats';
import { applyQuickLog, QUICK_LOGS } from '../domain/watchQuickLogs';
import { addDays, toISODate } from './format';
import { findPrevious, ordinalWithinType } from '../domain/training';
import { applyWorkoutCommand, WORKOUT_COMMANDS } from '../domain/watchCommands';
import { heartSeries } from '../domain/heartRate';
import { uid } from './format';
import { toast } from '../components/ui';
import { appVersion, newer } from './appUpdate';
import { ask, inApp, onNative, tell } from './native';
import { engine } from '../adapters/engine';

export const WATCH_FROM = '2.0';
export const watchSupported = () => { const v = appVersion(); return inApp() && !!v && !newer(WATCH_FROM, v); };

/** The protocol version both sides speak (Sync.VERSION). */
export const SYNC_VERSION = 1;
const MAX_ROUTINES = 100, MAX_BYTES = 80_000, RECENT = 30, PER_MUSCLE = 25, APPLIED = 60, RECENT_FOODS = 15, FAVOURITES = 10;

type Values = { weightKg?: number | null; reps?: number | null; timeSec?: number | null; distanceKm?: number | null };
/** `last`: the first working set of its latest session, so an exercise added on the watch starts pre-filled. */
type WatchExercise = { id: string; name: string; muscle: string; tracking: TrackingMode; last: Values | null };
export type Snapshot = {
  v: number;
  /** Ids of watch commands the phone has applied (the watch stops re-showing them as pending). */
  applied: string[];
  units: { weight: 'kg' | 'lb'; defaultRestSec: number };
  routines: { id: string; name: string; folder: string | null; exercises: { name: string; sets: number }[] }[];
  workout: null | {
    id: string; title: string; startedAt: number; routineId: string | null;
    blocks: {
      id: string; exerciseId: string; name: string; tracking: TrackingMode; restSec: number; supersetId: string | null;
      /** Weight step for the bezel, in kg (2.5 for barbells and machines, 1 otherwise). */
      step: number;
      sets: { id: string; type: SetType; done: boolean; ai: boolean; v: Values; t: Values; p: Values | null }[];
    }[];
    timers: Record<string, { endsAt: number | null; durationSec: number }>;
  };
  library: { recent: WatchExercise[]; muscles: Record<string, WatchExercise[]> };
  /** Today on the phone, for the quick logs and tiles. */
  today: {
    date: string; kcalTarget: number | null; kcalEaten: number; protein: number; proteinTarget: number | null;
    waterMl: number; waterGoalMl: number; lastWeight: { kg: number; date: string } | null;
    checkin: { energy: number | null; soreness: number | null; sleep: number | null; steps: number | null } | null;
    workoutsThisWeek: number;
    /** For the Quick start tile: the routine after the last one done (in list order), else the first. */
    nextRoutine: { id: string; name: string } | null;
  };
  /** Foods to log again without typing: recent entries and favourites, with energy and protein per unit. */
  foods: WatchFood[];
};
export type WatchFood = { ref: string; from: 'entry' | 'favourite'; name: string; amount: number; unit: PortionUnit; kcalPerUnit: number; proteinPerUnit: number; units: PortionUnit[] };

export type Library = { byId: (id: string) => Exercise | undefined; all: () => Exercise[] };
const MUSCLES: [string, RegExp][] = [
  // Order matters: "lateral deltoid" is Shoulders, "abductors" is Legs.
  ['Shoulders', /shoulder|delt/i], ['Chest', /chest|pector/i], ['Back', /back|lat|trap|rhomb|erector/i],
  ['Legs', /quad|hamstring|glute|calf|calves|leg|adduct|abduct|hip/i], ['Arms', /bicep|tricep|forearm|arm|brach/i], ['Core', /ab|core|oblique|waist/i],
];
export const muscleGroup = (m: string) => MUSCLES.find(([, r]) => r.test(m))?.[0] ?? null;
export const weightStep = (ex: Exercise | undefined) => (ex && /barbell|smith|ez|trap bar|machine|cable|leverage|sled/i.test(ex.equipment + ' ' + ex.name) ? 2.5 : 1);
const fields = (s: Partial<SetEntry> | undefined | null): Values => ({ weightKg: s?.weightKg ?? null, reps: s?.reps ?? null, timeSec: s?.timeSec ?? null, distanceKm: s?.distanceKm ?? null });


/** The routine after the last one done (list order, wrapping round); the first when none was done yet. */
export function nextRoutine(d: Pick<DB, 'routines' | 'workouts'>): { id: string; name: string } | null {
  if (!d.routines.length) return null;
  const last = [...d.workouts].filter((w) => w.routineId).sort((x, y) => y.endedAt - x.endedAt)[0];
  const i = last ? d.routines.findIndex((r) => r.id === last.routineId) : -1;
  const r = d.routines[(i + 1) % d.routines.length]!;
  return { id: r.id, name: r.name };
}

/** What the watch needs, kept small (a data item is limited to 100 KB). */
export function snapshot(d: DB, lib: Library, applied: string[] = []): Snapshot {
  const folders = new Map(d.folders.map((f) => [f.id, f.name]));
  const name = (id: string) => lib.byId(id)?.name ?? 'Unknown exercise';
  const a = d.active;
  // Recently used exercises first (from finished workouts, newest first), then the library grouped by muscle.
  const watchExercise = (e: Exercise): WatchExercise => {
    const last = findPrevious(d.workouts, e.id, 'normal', 0);
    return { id: e.id, name: e.name, muscle: e.primaryMuscle, tracking: e.tracking, last: last ? fields(last) : null };
  };
  const recentIds: string[] = [];
  for (const w of [...d.workouts].sort((x, y) => y.endedAt - x.endedAt)) for (const b of w.exercises) if (!recentIds.includes(b.exerciseId) && recentIds.length < RECENT) recentIds.push(b.exerciseId);
  const recent = recentIds.map((id) => lib.byId(id)).filter((e): e is Exercise => !!e).map(watchExercise);
  const muscles: Record<string, WatchExercise[]> = {};
  for (const e of [...recent.map((r) => lib.byId(r.id)!), ...lib.all()]) {
    const g = muscleGroup(e.primaryMuscle);
    if (!g) continue;
    const list = (muscles[g] ??= []);
    if (list.length < PER_MUSCLE && !list.some((x) => x.id === e.id)) list.push(watchExercise(e));
  }
  const s: Snapshot = {
    v: SYNC_VERSION,
    applied: applied.slice(-APPLIED),
    units: { weight: d.settings.weightUnit, defaultRestSec: d.settings.defaultRestSec },
    routines: d.routines.slice(0, MAX_ROUTINES).map((r) => ({
      id: r.id, name: r.name, folder: r.folderId ? folders.get(r.folderId) ?? null : null,
      exercises: r.exercises.map((b) => ({ name: name(b.exerciseId), sets: b.sets.length })),
    })),
    workout: a ? {
      id: a.id, title: a.title, startedAt: a.startedAt, routineId: a.routineId,
      blocks: a.exercises.map((b) => ({
        id: b.id, exerciseId: b.exerciseId, name: name(b.exerciseId), tracking: b.tracking, restSec: b.restSec, supersetId: b.supersetId,
        step: weightStep(lib.byId(b.exerciseId)),
        sets: b.sets.map((x, i) => ({
          id: x.id, type: x.type, done: x.done, ai: !!x.aiTarget, v: fields(x), t: fields(x.suggested as Partial<SetEntry> | undefined),
          p: (() => { const prev = findPrevious(d.workouts, b.exerciseId, x.type, ordinalWithinType(b.sets, i)); return prev ? fields(prev) : null; })(),
        })),
      })),
      timers: Object.fromEntries(Object.entries(a.timers).map(([k, t]) => [k, { endsAt: t.endsAt, durationSec: t.durationSec }])),
    } : null,
    library: { recent, muscles },
    today: { date: '', kcalTarget: null, kcalEaten: 0, protein: 0, proteinTarget: null, waterMl: 0, waterGoalMl: 2500, lastWeight: null, checkin: null, workoutsThisWeek: 0, nextRoutine: null },
    foods: [],
  };
  const today = toISODate(new Date());
  const eaten = sumNutrients(d.diary.filter((e) => e.date === today).map((e) => nutrientsFor(e.food, e.amount, e.unit)));
  const targets = d.profile ? calculateTargets(d.profile).targets : null;
  const lastWeight = [...d.weights].sort((x, y) => y.date.localeCompare(x.date))[0];
  const check = d.checkins.find((c) => c.date === today && isRecoveryRow(c));
  const weekStart = addDays(today, -6);
  s.today = {
    date: today, kcalTarget: targets?.kcal ?? null, kcalEaten: Math.round(eaten.kcal), protein: Math.round(eaten.protein), proteinTarget: targets?.protein ?? null,
    waterMl: d.water[today] ?? 0, waterGoalMl: d.profile?.waterGoalMl ?? 2500, lastWeight: lastWeight ? { kg: lastWeight.kg, date: lastWeight.date } : null,
    checkin: check ? { energy: checkinNumber(check.energy), soreness: checkinNumber(check.soreness), sleep: checkinNumber(check.sleep), steps: checkinNumber(check.steps) } : null,
    workoutsThisWeek: d.workouts.filter((w) => toISODate(new Date(w.startedAt)) >= weekStart).length,
    nextRoutine: nextRoutine(d),
  };
  const food = (f: Food, ref: string, from: WatchFood['from'], amount: number, unit: PortionUnit): WatchFood => {
    const one = nutrientsFor(f, 1, unit);
    return { ref, from, name: f.name, amount, unit, kcalPerUnit: Math.round(one.kcal * 1000) / 1000, proteinPerUnit: Math.round(one.protein * 1000) / 1000, units: allowedUnits(f) };
  };
  const seenFoods = new Set<string>();
  for (const e of [...d.diary].sort((x, y) => (y.date + y.createdAt).localeCompare(x.date + x.createdAt))) {
    if (s.foods.length >= RECENT_FOODS) break;
    if (seenFoods.has(e.food.id)) continue;
    seenFoods.add(e.food.id); s.foods.push(food(e.food, e.id, 'entry', e.amount, e.unit));
  }
  for (const f of (d.settings.favouriteFoods ?? []).slice(0, FAVOURITES)) if (!seenFoods.has(f.id)) { seenFoods.add(f.id); s.foods.push(food(f, f.id, 'favourite', f.refAmount, f.refUnit)); }
  // Very large libraries: drop the extras before going over the limit (the running workout always fits).
  if (JSON.stringify(s).length > MAX_BYTES) s.library.muscles = {};
  if (JSON.stringify(s).length > MAX_BYTES) s.routines = s.routines.map((r) => ({ ...r, exercises: [] }));
  return s;
}

export type { WatchCommand } from '../domain/watchCommands';
import type { WatchCommand } from '../domain/watchCommands';
const SEEN_KEY = 'mfd-watch-seen';
const seen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } };
const remember = (ids: string[]) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-500))); } catch { /* best effort */ } };

/** Applies queued watch commands once each (the id is remembered), oldest first. */
export function applyCommands(commands: unknown[], handle: (c: WatchCommand) => void) {
  const done = seen(), fresh: WatchCommand[] = [];
  for (const c of commands) {
    const cmd = c as WatchCommand;
    if (!cmd || cmd.v !== SYNC_VERSION || typeof cmd.id !== 'string' || typeof cmd.type !== 'string' || done.includes(cmd.id)) continue;
    fresh.push(cmd); done.push(cmd.id);
  }
  for (const c of fresh) { try { handle(c); } catch { /* one bad command must not stop the rest */ } markApplied(c.id); }
  if (fresh.length) remember(done);
  return fresh.length;
}

const APPLIED_KEY = 'mfd-watch-applied';
const appliedIds = (): string[] => { try { return JSON.parse(localStorage.getItem(APPLIED_KEY) || '[]'); } catch { return []; } };
const markApplied = (id: string) => { try { localStorage.setItem(APPLIED_KEY, JSON.stringify([...appliedIds(), id].slice(-APPLIED))); } catch { /* best effort */ } };

/** One watch command, on the phone's diary. Starting never replaces a running workout; finishing only the same one. */
function handle(c: WatchCommand) {
  const d = getDB();
  if (c.type === 'hello') toast('Your watch is connected');
  else if (c.type === 'startRoutine' || c.type === 'startEmpty') {
    if (d.active) toast('A workout is already running');
    else {
      const routine = c.type === 'startRoutine' ? d.routines.find((r) => r.id === c.routine) : null;
      if (c.type === 'startRoutine' && !routine) return;
      workouts.start(routine ?? null);
      toast('Workout started on your watch');
    }
  } else if (c.type === 'finish' && d.active?.id === c.workoutId) {
    if (workouts.finish()) toast('Workout saved from your watch');
  } else if (c.type === 'discard' && d.active?.id === c.workoutId) workouts.discard();
  else if ((QUICK_LOGS as readonly string[]).includes(c.type)) applyQuickLog(c, d, { logWeight: body.logWeight, setWater: diary.setWater, addFood: diary.add, saveCheckIn: body.saveCheckIn });
  else if (c.type === 'heartRate') {
    // Sent right after "finish": attaches to that saved workout (never replaces readings already there).
    const hr = heartSeries(c.series, 'watch');
    const w = d.workouts.find((x) => x.id === c.workoutId);
    if (hr && w && !w.heartRate) workouts.updateWorkout({ ...w, heartRate: hr });
  }
  else if ((WORKOUT_COMMANDS as readonly string[]).includes(c.type)) {
    workouts.mutate((a) => void applyWorkoutCommand(a, c, { history: d.workouts, now: Date.now(), newId: uid, exercise: (id) => exercises.byId(id) ?? null, defaultRestSec: d.settings.defaultRestSec }));
  }
}

let last = '', timer: ReturnType<typeof setTimeout> | undefined;
/** Starts publishing to the watch and taking its commands (Android app 2.0+ only). Returns the stop function. */
export function installWatchSync() {
  if (!watchSupported()) return () => undefined;
  const publish = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const json = JSON.stringify(snapshot(getDB(), exercises, appliedIds()));
      if (json !== last) { last = json; tell('watchState', { json }); }
    }, 500);
  };
  // Taking commands empties the phone app's queue, so only into a fully loaded diary (else they wait there).
  const drain = () => {
    const s = engine()?.peek();
    if (!s?.ready || s.starting || s.reconciling) return;
    void ask<{ commands?: unknown[] }>('watchDrain', {}, 10_000).then((r) => { if (applyCommands(r.commands ?? [], handle)) publish(); }).catch(() => undefined);
  };
  const retry = setInterval(drain, 10_000);
  publish(); drain();
  const offStore = subscribe(publish);
  const offNative = onNative((e) => { if (e.event === 'watchPending') drain(); });
  const visible = () => { if (!document.hidden) { drain(); publish(); } };
  document.addEventListener('visibilitychange', visible);
  return () => { offStore(); offNative(); document.removeEventListener('visibilitychange', visible); clearTimeout(timer); clearInterval(retry); };
}

/** The watch's live heart rate during a workout (Android app 2.0+), or null when none arrived in the last 20 s. */
export function useWatchHeart(): number | null {
  const [bpm, setBpm] = useState<number | null>(null);
  useEffect(() => {
    let stale: ReturnType<typeof setTimeout> | undefined;
    const off = onNative((e) => {
      if (e.event !== 'watchHeart' || typeof e.bpm !== 'number' || e.bpm < 30 || e.bpm > 250) return;
      setBpm(Math.round(e.bpm));
      clearTimeout(stale);
      stale = setTimeout(() => setBpm(null), 20_000);
    });
    return () => { off(); clearTimeout(stale); };
  }, []);
  return bpm;
}
