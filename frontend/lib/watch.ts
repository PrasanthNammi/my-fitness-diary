// The MFD Galaxy Watch app (Android app 2.0+). The phone app relays (android/.../WatchLink.kt): this page publishes a
// small snapshot for the watch whenever the diary changes (routines, the running workout, settings), and takes the
// watch's commands from the phone app's queue, applying each one once. Protocol: android/shared/.../Sync.kt.
import { getDB, subscribe, type DB } from '../data/store';
import { exercises, workouts } from '../data/repositories';
import type { Exercise, SetEntry, SetType, TrackingMode } from '../domain/types';
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
const MAX_ROUTINES = 100, MAX_BYTES = 80_000, RECENT = 30, PER_MUSCLE = 25, APPLIED = 60;

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
};

export type Library = { byId: (id: string) => Exercise | undefined; all: () => Exercise[] };
const MUSCLES: [string, RegExp][] = [
  // Order matters: "lateral deltoid" is Shoulders, "abductors" is Legs.
  ['Shoulders', /shoulder|delt/i], ['Chest', /chest|pector/i], ['Back', /back|lat|trap|rhomb|erector/i],
  ['Legs', /quad|hamstring|glute|calf|calves|leg|adduct|abduct|hip/i], ['Arms', /bicep|tricep|forearm|arm|brach/i], ['Core', /ab|core|oblique|waist/i],
];
export const muscleGroup = (m: string) => MUSCLES.find(([, r]) => r.test(m))?.[0] ?? null;
export const weightStep = (ex: Exercise | undefined) => (ex && /barbell|smith|ez|trap bar|machine|cable|leverage|sled/i.test(ex.equipment + ' ' + ex.name) ? 2.5 : 1);
const fields = (s: Partial<SetEntry> | undefined | null): Values => ({ weightKg: s?.weightKg ?? null, reps: s?.reps ?? null, timeSec: s?.timeSec ?? null, distanceKm: s?.distanceKm ?? null });


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
  };
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
