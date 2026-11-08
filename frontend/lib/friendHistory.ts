// A friend's full workout history, for records, the hours chart and the comparison.
// The first time it's needed it downloads in pages of 200; it's then kept on this device (IndexedDB, per account)
// and later checks download only workouts changed or removed since the last check — like the feed.
import type { Exercise, Workout } from '../domain/types';
import type { FeedRow } from './socialFeed';
import { engine } from '../adapters/engine';
import { toDB } from '../adapters/compat';

const PAGE = 200, FRESH = 60_000, OVERLAP = 30_000;
type Saved = { rows: FeedRow[]; cursor: string | null };
const memory = new Map<string, { rows: FeedRow[]; cursor: string | null; at: number }>();
const pending = new Map<string, Promise<FeedRow[]>>();
const ms = (iso?: string | null) => (iso ? Date.parse(iso) : 0);
const latest = (times: (string | null | undefined)[], start: string | null) => times.reduce<string | null>((m, t) => (t && ms(t) > ms(m) ? t : m), start);

// ── IndexedDB (optional: without it, history stays in memory for the session) ──
let dbPromise: Promise<IDBDatabase | null> | null = null;
function idb() {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open('mfd-friend-history', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('owners');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}
async function readSaved(id: string): Promise<Saved | null> {
  const db = await idb(); if (!db) return null;
  return new Promise((resolve) => { try { const r = db.transaction('owners').objectStore('owners').get(id); r.onsuccess = () => resolve((r.result as Saved) ?? null); r.onerror = () => resolve(null); } catch { resolve(null); } });
}
async function writeSaved(id: string, value: Saved | null) {
  const db = await idb(); if (!db) return;
  try { const s = db.transaction('owners', 'readwrite').objectStore('owners'); if (value) s.put(value, id); else s.delete(id); } catch { /* best effort */ }
}

async function all(query: (from: number, to: number) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Every shared workout of `owner`, newest first. `me` keeps each account's saved copies apart. */
export function friendHistory(c: any, me: string, owner: string, force = false): Promise<FeedRow[]> {
  const id = me + ':' + owner;
  const hit = memory.get(id);
  if (hit && !force && Date.now() - hit.at < FRESH) return Promise.resolve(hit.rows);
  const running = pending.get(id); if (running) return running;
  const load = (async () => {
    const saved = hit ?? (await readSaved(id));
    let rows: FeedRow[], cursor: string | null;
    if (!saved?.cursor) {
      rows = await all((a, b) => c.from('mfd_social_workouts').select('*').eq('owner_id', owner).order('started_at', { ascending: false }).range(a, b));
      cursor = latest(rows.map((r) => r.updated_at), null);
    } else {
      const since = new Date(ms(saved.cursor) - OVERLAP).toISOString();
      const [changed, removed] = await Promise.all([
        all((a, b) => c.from('mfd_social_workouts').select('*').eq('owner_id', owner).gt('updated_at', since).order('updated_at').range(a, b)),
        all((a, b) => c.from('mfd_social_removals').select('*').eq('kind', 'workout').eq('owner_id', owner).gt('removed_at', since).order('removed_at').range(a, b)),
      ]);
      const byId = new Map(saved.rows.map((r) => [r.workout_id, r]));
      for (const r of changed as FeedRow[]) byId.set(r.workout_id, r);
      for (const x of removed) { const r = byId.get(x.workout_id); if (r && ms(r.updated_at) <= ms(x.removed_at)) byId.delete(x.workout_id); }
      rows = [...byId.values()].sort((a, b) => ms(b.started_at) - ms(a.started_at));
      cursor = latest([...changed.map((r: FeedRow) => r.updated_at), ...removed.map((x: any) => x.removed_at)], saved.cursor);
    }
    memory.set(id, { rows, cursor, at: Date.now() });
    void writeSaved(id, { rows, cursor });
    return rows;
  })().finally(() => pending.delete(id));
  pending.set(id, load);
  return load;
}
export const cachedHistory = (me: string, owner: string) => memory.get(me + ':' + owner)?.rows ?? null;
/** When someone is no longer a friend (or on sign-out), forget their saved history on this device. */
export function forgetHistory(me: string, owner: string) { memory.delete(me + ':' + owner); void writeSaved(me + ':' + owner, null); }

/** Shared workouts → the app's workout shape (same exercise ids as your own diary where the catalogue matches). */
const converted = new WeakMap<FeedRow[], { workouts: Workout[]; exercises: Exercise[] }>();
export function toWorkouts(rows: FeedRow[]): { workouts: Workout[]; exercises: Exercise[] } {
  const hit = converted.get(rows); if (hit) return hit;
  const e = engine(); if (!e || !rows.length) return { workouts: [], exercises: [] };
  const original = e.peek();
  const db = toDB({ ...original, state: { ...original.state, sessions: rows.map((r) => r.data), routines: [], active: null, meals: [] } }, e.catalogue());
  const out = { workouts: db.workouts, exercises: db.customExercises };
  converted.set(rows, out);
  return out;
}
