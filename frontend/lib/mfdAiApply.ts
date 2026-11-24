// MFD AI cards against the person's own diary, on this device: saved foods replace estimates, exercise names are
// matched to the catalogue, routines and folders are found by name. Then "Add" writes through the normal
// repositories, and each add returns its own Undo. Nothing here is sent anywhere.
import { getDB, update } from '../data/store';
import { body, diary, exercises as exRepo, newSet, suggestedExerciseId, training, workouts } from '../data/repositories';
import { nutrientsFor } from '../domain/nutrition';
import type { Card, Ex, FoodLine } from '../domain/mfdAi';
import type { ExerciseBlock, Food, PortionUnit, Routine, Workout } from '../domain/types';
import { uid } from './format';

const norm = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (x: string) => new Set(norm(x).split(' ').filter((w) => w.length > 1));
const plural = (w: string) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
function similar(a: string, b: string) {
  const A = new Set([...words(a)].map(plural)), B = new Set([...words(b)].map(plural));
  if (!A.size || !B.size) return 0;
  let both = 0; A.forEach((w) => { if (B.has(w)) both++; });
  return both / Math.max(A.size, B.size);
}

// ── Food ───────────────────────────────────────────────────────────
/** The person's own foods: saved, favourites and anything eaten in the last 90 days (newest first). */
function ownFoods(): Food[] {
  const d = getDB(), seen = new Set<string>(), out: Food[] = [];
  const add = (f: Food | undefined) => { if (f && !seen.has(norm(f.name))) { seen.add(norm(f.name)); out.push(f); } };
  d.customFoods.forEach(add); (d.settings.favouriteFoods ?? []).forEach(add);
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  [...d.diary].filter((e) => e.date >= since).sort((a, b) => b.createdAt - a.createdAt).forEach((e) => add(e.food));
  return out;
}
/** Diary amount for a line: servings when the food counts in servings, else grams/ml. */
function portion(f: Food, l: FoodLine, qty = l.qty): { amount: number; unit: PortionUnit } {
  if (f.refUnit === 'serving') return { amount: qty, unit: 'serving' };
  if (l.unit === 'g' || l.unit === 'ml') return { amount: qty, unit: f.refUnit };
  if (f.servingSize) return { amount: qty * (l.grams / f.servingSize), unit: 'serving' };
  return { amount: qty * l.grams, unit: f.refUnit };
}
/** Uses a saved food's own numbers when one matches the name closely. */
export function matchFood(l: FoodLine): FoodLine {
  let best: Food | undefined, score = 0;
  for (const f of ownFoods()) { const s = norm(f.name) === norm(l.name) ? 1 : similar(f.name, l.name); if (s > score) { score = s; best = f; } }
  if (!best || score < 0.75) return l;
  const one = portion(best, l, 1), nu = nutrientsFor(best, one.amount, one.unit);
  return { ...l, name: best.name, kcal: nu.kcal, p: nu.protein, c: nu.carbs, f: nu.fat, source: 'mine', food: best };
}
/** The estimate as a diary food (its own snapshot, like every diary entry). */
function estimateFood(l: FoodLine): { food: Food; amount: number; unit: PortionUnit } {
  const byWeight = l.unit === 'g' || l.unit === 'ml';
  const base: Food = { id: 'ai-' + uid(), name: l.name, brand: null, barcode: null, origin: 'custom', refAmount: byWeight ? 100 : 1,
    refUnit: byWeight ? (l.unit as 'g' | 'ml') : 'serving', servingSize: byWeight ? null : l.grams, servingLabel: byWeight ? null : `1 ${l.unit}`,
    kcal: 0, protein: 0, carbs: 0, fat: 0, sugars: null, saturates: null, fibre: null, salt: null, ingredients: null };
  const k = byWeight ? 100 : 1;
  return { food: { ...base, kcal: l.kcal * k, protein: l.p * k, carbs: l.c * k, fat: l.f * k }, amount: l.qty, unit: byWeight ? (l.unit as PortionUnit) : 'serving' };
}

// ── Exercises, routines, folders ──────────────────────────────────
export function matchExercise(e: Ex): Ex {
  let id = suggestedExerciseId({ exercise: e.name });
  if (!id) {
    let score = 0;
    for (const x of exRepo.all()) { const s = similar(x.name, e.name); if (s > score) { score = s; id = x.id; } }
    if (score < 0.67) id = null;
  }
  const ex = id ? exRepo.byId(id) : undefined;
  return { ...e, exerciseId: ex?.id ?? null, name: ex?.name ?? e.name, isNew: !ex };
}
export const findRoutine = (name: string): Routine | undefined => {
  let best: Routine | undefined, score = 0;
  for (const r of getDB().routines) { const s = norm(r.name) === norm(name) ? 1 : similar(r.name, name); if (s > score) { score = s; best = r; } }
  return score >= 0.5 ? best : undefined;
};
export const folderNames = () => getDB().folders.map((f) => f.name);

/** Fills in what only the diary knows: matched foods/exercises/routines and the last weight. */
export function resolveCard(c: Card): Card {
  switch (c.kind) {
    case 'food': return { ...c, lines: c.lines.map(matchFood) };
    case 'workout': return { ...c, exercises: c.exercises.map(matchExercise) };
    case 'routine': {
      const f = c.folder ? getDB().folders.find((x) => norm(x.name) === norm(c.folder)) : undefined;
      return { ...c, folder: f?.name ?? c.folder, exercises: c.exercises.map(matchExercise) };
    }
    case 'weight': { const last = [...getDB().weights].filter((w) => w.date < c.day).pop(); return last ? { ...c, lastKg: last.kg, lastDate: last.date } : c; }
    case 'start': { const r = findRoutine(c.name); return r ? { ...c, name: r.name, routineId: r.id, exercises: r.exercises.length } : { ...c, routineId: null }; }
    default: return c;
  }
}

function blocks(exs: Ex[], done: boolean): ExerciseBlock[] {
  return exs.filter((e) => e.exerciseId).map((e) => {
    const ex = exRepo.byId(e.exerciseId!)!;
    return { id: uid(), exerciseId: ex.id, tracking: ex.tracking, restSec: 90, note: '', supersetId: null,
      sets: e.sets.map((x) => ({ ...newSet('normal', { reps: x.reps ?? null, weightKg: x.kg ?? null, timeSec: x.seconds ?? null, distanceKm: x.km ?? null }), done })) };
  });
}

export type Applied = { undo: () => void; message: string; open?: string };

/** Writes one confirmed card. Returns how to take it back. Throws a readable Error when it can't be added. */
export function applyCard(c: Card): Applied {
  switch (c.kind) {
    case 'food': {
      const ids = c.lines.map((l) => {
        const e = l.food ? { food: l.food, ...portion(l.food, l) } : estimateFood(l);
        return diary.add(c.day, c.meal, e.food, Math.round(e.amount * 100) / 100, e.unit).id;
      });
      return { undo: () => ids.forEach((id) => diary.remove(id)), message: 'Added', open: `/food/${c.day}` };
    }
    case 'water': {
      const before = getDB().water[c.day] ?? 0;
      diary.setWater(c.day, before + c.ml);
      return { undo: () => diary.setWater(c.day, Math.max(0, (getDB().water[c.day] ?? 0) - c.ml)), message: 'Added' };
    }
    case 'weight': {
      const prev = getDB().weights.find((w) => w.date === c.day);
      body.logWeight(c.day, c.kg);
      return { undo: () => { if (prev) body.logWeight(c.day, prev.kg); else { const w = getDB().weights.find((x) => x.date === c.day); if (w) body.deleteWeight(w.id); } }, message: 'Added' };
    }
    case 'measure': {
      const before = new Set(getDB().checkins.map((x) => x.id));
      body.addMeasurements(c.day, c.values);
      const row = getDB().checkins.find((x) => !before.has(x.id));
      return { undo: () => row && body.removeMeasurements(row.id), message: 'Added' };
    }
    case 'checkin': {
      const prev = getDB().checkins.find((x) => x.date === c.day && (x.sleep != null || x.energy != null || x.soreness != null));
      const num = (v: unknown) => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(v));
      const old = { sleep: num(prev?.sleep), energy: num(prev?.energy), soreness: num(prev?.soreness), note: prev?.note ?? '' };
      body.saveCheckIn({ date: c.day, sleep: c.sleep ?? old.sleep, energy: c.energy ?? old.energy, soreness: c.soreness ?? old.soreness, note: old.note });
      return { undo: () => { if (prev) body.saveCheckIn({ date: c.day, ...old }); else { const r = getDB().checkins.find((x) => x.date === c.day && x.sleep != null); if (r) body.deleteCheckIn(r.id); } }, message: 'Added' };
    }
    case 'workout': {
      const b = blocks(c.exercises, true);
      if (!b.length) throw new Error('None of these exercises are in the catalogue yet');
      const end = c.day === new Date().toISOString().slice(0, 10) ? Date.now() : Date.parse(c.day + 'T18:00:00');
      const w: Workout = { id: uid(), title: c.title, routineId: null, startedAt: end - (c.minutes ?? 45) * 60000, endedAt: end, exercises: b };
      update((d) => void d.workouts.push(w));
      return { undo: () => workouts.deleteWorkout(w.id), message: 'Added', open: `/training/history/${w.id}` };
    }
    case 'routine': {
      const b = blocks(c.exercises, false);
      if (!b.length) throw new Error('None of these exercises are in the catalogue yet');
      let folder = c.folder ? getDB().folders.find((f) => norm(f.name) === norm(c.folder)) : undefined, made = false;
      if (c.folder && !folder) { folder = training.createFolder(c.folder); made = true; }
      const r: Routine = { id: uid(), name: c.name, folderId: folder?.id ?? null, exercises: b, createdAt: Date.now(), updatedAt: Date.now() };
      training.saveRoutine(r);
      return { undo: () => { training.deleteRoutine(r.id); if (made && folder) training.deleteFolder(folder.id, false); }, message: 'Saved to Routines', open: `/training/routine/view/${r.id}` };
    }
    case 'start': {
      const r = c.routineId ? getDB().routines.find((x) => x.id === c.routineId) : undefined;
      if (!r) throw new Error('No routine with that name');
      if (getDB().active) throw new Error('A workout is already running. Finish or discard it first.');
      workouts.start(r);
      return { undo: () => workouts.discard(), message: 'Started', open: '/workout' };
    }
  }
}
