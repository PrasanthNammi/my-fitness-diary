// The MFD Galaxy Watch app (Android app 2.0+). The phone app relays (android/.../WatchLink.kt): this page publishes a
// small snapshot for the watch whenever the diary changes (routines, the running workout, settings), and takes the
// watch's commands from the phone app's queue, applying each one once. Protocol: android/shared/.../Sync.kt.
import { getDB, subscribe, type DB } from '../data/store';
import { exerciseName } from '../data/repositories';
import { toast } from '../components/ui';
import { appVersion, newer } from './appUpdate';
import { ask, inApp, onNative, tell } from './native';

export const WATCH_FROM = '2.0';
export const watchSupported = () => { const v = appVersion(); return inApp() && !!v && !newer(WATCH_FROM, v); };

/** The protocol version both sides speak (Sync.VERSION). */
export const SYNC_VERSION = 1;
const MAX_ROUTINES = 100, MAX_BYTES = 80_000;

type Snapshot = {
  v: number;
  units: { weight: string };
  routines: { id: string; name: string; folder: string | null; exercises: { name: string; sets: number }[] }[];
  workout: { title: string; startedAt: number; exercises: { name: string; done: number; total: number }[] } | null;
};

/** What the watch needs, kept small (a data item is limited to 100 KB). */
export function snapshot(d: DB, name: (id: string) => string = exerciseName): Snapshot {
  const folders = new Map(d.folders.map((f) => [f.id, f.name]));
  const s: Snapshot = {
    v: SYNC_VERSION,
    units: { weight: d.settings.weightUnit },
    routines: d.routines.slice(0, MAX_ROUTINES).map((r) => ({
      id: r.id, name: r.name, folder: r.folderId ? folders.get(r.folderId) ?? null : null,
      exercises: r.exercises.map((b) => ({ name: name(b.exerciseId), sets: b.sets.length })),
    })),
    workout: d.active ? {
      title: d.active.title, startedAt: d.active.startedAt,
      exercises: d.active.exercises.map((b) => ({ name: name(b.exerciseId), done: b.sets.filter((x) => x.done).length, total: b.sets.length })),
    } : null,
  };
  // Very large libraries: drop routine details before going over the limit.
  if (JSON.stringify(s).length > MAX_BYTES) s.routines = s.routines.map((r) => ({ ...r, exercises: [] }));
  return s;
}

export type WatchCommand = { v: number; id: string; type: string; [key: string]: unknown };
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
  for (const c of fresh) { try { handle(c); } catch { /* one bad command must not stop the rest */ } }
  if (fresh.length) remember(done);
  return fresh.length;
}

function handle(c: WatchCommand) {
  if (c.type === 'hello') toast('Your watch is connected');
}

let last = '', timer: ReturnType<typeof setTimeout> | undefined;
/** Starts publishing to the watch and taking its commands (Android app 2.0+ only). Returns the stop function. */
export function installWatchSync() {
  if (!watchSupported()) return () => undefined;
  const publish = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const json = JSON.stringify(snapshot(getDB()));
      if (json !== last) { last = json; tell('watchState', { json }); }
    }, 500);
  };
  const drain = () => void ask<{ commands?: unknown[] }>('watchDrain', {}, 10_000).then((r) => applyCommands(r.commands ?? [], handle)).catch(() => undefined);
  publish(); drain();
  const offStore = subscribe(publish);
  const offNative = onNative((e) => { if (e.event === 'watchPending') drain(); });
  const visible = () => { if (!document.hidden) { drain(); publish(); } };
  document.addEventListener('visibilitychange', visible);
  return () => { offStore(); offNative(); document.removeEventListener('visibilitychange', visible); clearTimeout(timer); };
}
