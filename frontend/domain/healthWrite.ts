// What MFD saves to Health Connect (MFD 2.0, Android app; turned on separately for workouts and food): finished
// workouts of the last 30 days with the MFD watch's heart rate, and the food diary of the last 7 days. Each is sent
// again only when it changed (a fingerprint of what is sent, kept per device), with a newer version so the phone app
// updates it in place; ones deleted in MFD are removed. Heart rate that came from Health Connect is not sent back.
import type { DiaryEntry, ISODate, Meal, Workout } from './types';
import { nutrientsFor } from './nutrition';

export const WRITE_WORKOUT_DAYS = 30;
export const WRITE_FOOD_DAYS = 7;
const MAX_WORKOUTS = 50, MAX_MEALS = 200, MAX_REMOVE = 200;
/** When a meal is placed if it wasn't logged on its own day (local hour). */
const MEAL_HOUR: Record<Meal, number> = { breakfast: 8, lunch: 13, snacks: 16, dinner: 19 };

/** Per device: what was saved, by MFD id: [fingerprint, version]. */
export type Sent = { w: Record<string, [number, number]>; f: Record<string, [number, number]> };
export type WorkoutOut = { id: string; version: number; title: string; start: number; end: number; notes: string; heart?: { interval: number; bpm: number[] } };
export type MealOut = { id: string; version: number; start: number; meal: Meal; name: string; kcal: number; protein: number; carbs: number; fat: number; sugars: number | null; saturates: number | null; fibre: number | null; salt: number | null };
export type WritePlan = { workouts: WorkoutOut[]; meals: MealOut[]; remove: { workouts: string[]; meals: string[] }; sent: Sent };

/** A small stable fingerprint of a JSON value. */
export function fingerprint(v: unknown): number {
  const s = JSON.stringify(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const localDay = (ms: number): ISODate => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const r1 = (v: number) => Math.round(v * 10) / 10;

function workoutOut(w: Workout): Omit<WorkoutOut, 'version'> {
  const sets = w.exercises.reduce((n, b) => n + b.sets.length, 0);
  const names = w.exercises.length;
  const hr = w.heartRate?.source === 'watch' ? { interval: w.heartRate.interval, bpm: w.heartRate.bpm } : undefined;
  return { id: w.id, title: w.title || 'Workout', start: w.startedAt, end: w.endedAt, notes: `Logged in MFD · ${names} exercise${names === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}`, ...(hr ? { heart: hr } : {}) };
}

function mealOut(e: DiaryEntry): Omit<MealOut, 'version'> {
  const n = nutrientsFor(e.food, e.amount, e.unit);
  const [y, m, d] = e.date.split('-').map(Number) as [number, number, number];
  const start = e.createdAt > 0 && localDay(e.createdAt) === e.date ? e.createdAt : new Date(y, m - 1, d, MEAL_HOUR[e.meal] ?? 12).getTime();
  const opt = (v: number | null) => (v === null || !Number.isFinite(v) ? null : r1(v));
  return { id: e.id, start, meal: e.meal, name: e.food.name || 'Food', kcal: r1(n.kcal), protein: r1(n.protein), carbs: r1(n.carbs), fat: r1(n.fat), sugars: opt(n.sugars), saturates: opt(n.saturates), fibre: opt(n.fibre), salt: opt(n.salt) };
}

/**
 * What to send now. `on` says which kinds are turned on (a kind turned off sends and removes nothing and its saved
 * ids are kept, so turning it back on doesn't repeat them). Items outside the window are forgotten, not removed.
 * `sent` in the result is what to keep once the phone app confirms.
 */
export function planHealthWrites(d: { workouts: Workout[]; diary: DiaryEntry[] }, sent: Sent, on: { workouts: boolean; food: boolean }, now: number, today: ISODate): WritePlan {
  const next: Sent = { w: { ...sent.w }, f: { ...sent.f } };
  const plan: WritePlan = { workouts: [], meals: [], remove: { workouts: [], meals: [] }, sent: next };
  let version = now;
  if (on.workouts) {
    const from = now - WRITE_WORKOUT_DAYS * 86_400_000;
    const all = new Set(d.workouts.map((w) => w.id));
    const recent = d.workouts.filter((w) => w.endedAt >= from && w.endedAt > w.startedAt && w.endedAt <= now + 60_000).sort((a, b) => b.endedAt - a.endedAt);
    for (const w of recent) {
      const out = workoutOut(w), h = fingerprint(out);
      if (next.w[w.id]?.[0] === h) continue;
      if (plan.workouts.length >= MAX_WORKOUTS) break;
      plan.workouts.push({ ...out, version: ++version });
      next.w[w.id] = [h, version];
    }
    const inWindow = new Set(recent.map((w) => w.id));
    for (const id of Object.keys(next.w)) {
      if (!all.has(id) && plan.remove.workouts.length < MAX_REMOVE) { plan.remove.workouts.push(id); delete next.w[id]; }
      else if (all.has(id) && !inWindow.has(id)) delete next.w[id];
    }
  }
  if (on.food) {
    const [y, m, dd] = today.split('-').map(Number) as [number, number, number];
    const from = localDay(new Date(y, m - 1, dd - (WRITE_FOOD_DAYS - 1)).getTime());
    const all = new Set(d.diary.map((e) => e.id));
    const recent = d.diary.filter((e) => e.date >= from && e.date <= today);
    for (const e of recent) {
      const out = mealOut(e), h = fingerprint(out);
      if (next.f[e.id]?.[0] === h) continue;
      if (plan.meals.length >= MAX_MEALS) break;
      plan.meals.push({ ...out, version: ++version });
      next.f[e.id] = [h, version];
    }
    const inWindow = new Set(recent.map((e) => e.id));
    for (const id of Object.keys(next.f)) {
      if (!all.has(id) && plan.remove.meals.length < MAX_REMOVE) { plan.remove.meals.push(id); delete next.f[id]; }
      else if (all.has(id) && !inWindow.has(id)) delete next.f[id];
    }
  }
  // A diary that looks emptied all at once (still loading, or another account's) never wipes what was saved: removing
  // more than 5 and more than half at a time waits instead.
  const guard = (ids: string[], before: Record<string, [number, number]>, keep: Record<string, [number, number]>) => {
    if (ids.length > 5 && ids.length > Object.keys(before).length / 2) { for (const id of ids) keep[id] = before[id]!; ids.length = 0; }
  };
  guard(plan.remove.workouts, sent.w, next.w);
  guard(plan.remove.meals, sent.f, next.f);
  return plan;
}

export const emptyPlan = (p: WritePlan) => !p.workouts.length && !p.meals.length && !p.remove.workouts.length && !p.remove.meals.length;
