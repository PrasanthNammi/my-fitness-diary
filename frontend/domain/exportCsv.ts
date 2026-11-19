// Export as spreadsheets (Settings → Export): one CSV file per area the person picks, for a date range. CSV opens in
// Excel, Google Sheets and Numbers; the workouts file can also be written in the layout Hevy and Strong import.
// Numbers are written as logged (kg exactly; lb to 2 decimals); text that a spreadsheet would run as a formula
// (=, +, -, @ at the start) is escaped.
import type { CheckIn, DiaryEntry, Folder, ID, ISODate, Routine, SetEntry, WeightEntry, Workout } from './types';
import { nutrientsFor } from './nutrition';

export type ExportArea = 'workouts' | 'nutrition' | 'body' | 'recovery' | 'routines';
export const EXPORT_AREAS: ExportArea[] = ['workouts', 'nutrition', 'body', 'recovery', 'routines'];
export type WorkoutFormat = 'mfd' | 'hevy';
/** Inclusive; null = no limit. Routines have no date and are always exported whole. */
export type DateRange = { from: ISODate | null; to: ISODate | null };
export type ExportData = {
  workouts: Workout[]; routines: Routine[]; folders: Folder[]; diary: DiaryEntry[]; weights: WeightEntry[]; checkins: CheckIn[];
  water: Record<ISODate, number>; unit: 'kg' | 'lb'; exerciseName: (id: ID) => string;
};
export type ExportFile = { name: string; text: string; rows: number };

const LB = 2.20462;
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localTime = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Hevy's own export: "19 Nov 2026, 07:31" (local time). */
const hevyTime = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${localTime(ms)}`; };
const mss = (sec: number) => `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60))}`;

/** A number as logged (no float noise), or empty. */
export const num = (v: unknown, decimals = 3): string => {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || (typeof v === 'string' && v.trim() === '')) return '';
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
};
const weight = (kg: number | null | undefined, unit: 'kg' | 'lb') => (kg == null ? '' : unit === 'kg' ? num(kg) : num(kg * LB, 2));

/** One CSV cell: quoted when needed; text that starts like a formula is prefixed with ' so spreadsheets show it as text. */
export function cell(v: string | number | null | undefined): string {
  let s = v == null ? '' : typeof v === 'number' ? num(v) : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** With a byte-order mark so Excel reads accents (é, ü) correctly. */
export const csv = (head: string[], rows: (string | number | null | undefined)[][]) =>
  '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const inRange = (date: ISODate, r: DateRange) => (!r.from || date >= r.from) && (!r.to || date <= r.to);
const setType = (s: SetEntry) => (s.type === 'warmup' ? 'warm-up' : s.type === 'drop' ? 'drop set' : s.type);

function workouts(d: ExportData, r: DateRange, format: WorkoutFormat): string[][] {
  const out: string[][] = [];
  const list = d.workouts.filter((w) => inRange(localDate(w.startedAt), r)).sort((a, b) => a.startedAt - b.startedAt);
  for (const w of list) {
    w.exercises.forEach((b) => {
      const done = b.sets.filter((s) => s.done);
      done.forEach((s, i) => {
        const name = d.exerciseName(b.exerciseId);
        if (format === 'hevy') out.push([w.title, hevyTime(w.startedAt), hevyTime(w.endedAt), '', name, b.supersetId ?? '', b.note ?? '', String(i),
          s.type === 'drop' ? 'dropset' : s.type, weight(s.weightKg, d.unit), num(s.reps), num(s.distanceKm), num(s.timeSec, 0), num(s.rpe)]);
        else out.push([localDate(w.startedAt), localTime(w.startedAt), w.title, name, String(i + 1), setType(s), weight(s.weightKg, d.unit), num(s.reps),
          s.timeSec == null ? '' : mss(s.timeSec), num(s.distanceKm), num(s.floors), num(s.steps), num(s.rpe), b.note ?? '']);
      });
    });
  }
  return out;
}

function nutrition(d: ExportData, r: DateRange): string[][] {
  const order = { breakfast: 0, lunch: 1, dinner: 2, snacks: 3 } as const;
  const rows: [string, number, string[]][] = d.diary.filter((e) => inRange(e.date, r)).map((e) => {
    const n = nutrientsFor(e.food, e.amount, e.unit);
    return [e.date, order[e.meal] ?? 9, [e.date, e.meal === 'snacks' ? 'Snacks' : e.meal[0]!.toUpperCase() + e.meal.slice(1), e.food.name, e.food.brand ?? '', num(e.amount), e.unit,
      num(n.kcal, 1), num(n.protein, 1), num(n.carbs, 1), num(n.fat, 1), num(n.fibre, 1), num(n.sugars, 1), num(n.saturates, 1), num(n.salt, 2)]];
  });
  for (const [date, ml] of Object.entries(d.water)) if (ml > 0 && inRange(date, r)) rows.push([date, 10, [date, 'Water', 'Water', '', num(ml), 'ml', '', '', '', '', '', '', '', '']]);
  return rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]).map((x) => x[2]);
}

function body(d: ExportData, r: DateRange): string[][] {
  const days = new Map<ISODate, string[]>();
  const row = (date: ISODate) => days.get(date) ?? (days.set(date, [date, '', '', '', '', '', '', '']), days.get(date)!);
  for (const w of d.weights) if (inRange(w.date, r)) { const x = row(w.date); x[1] = weight(w.kg, d.unit); x[2] = num(w.bodyFat, 1); x[7] = w.source === 'health' ? 'Health Connect' : 'MFD'; }
  for (const c of d.checkins) {
    if (!inRange(c.date, r) || [c.waist, c.chest, c.hips, c.arms].every((v) => num(v) === '')) continue;
    const x = row(c.date); x[3] = num(c.waist, 1); x[4] = num(c.chest, 1); x[5] = num(c.hips, 1); x[6] = num(c.arms, 1); if (!x[7]) x[7] = 'MFD';
  }
  return [...days.values()].sort((a, b) => a[0]!.localeCompare(b[0]!));
}

function recovery(d: ExportData, r: DateRange): string[][] {
  return d.checkins.filter((c) => inRange(c.date, r) && [c.sleep, c.steps, c.energy, c.soreness, c.restingHr, c.hrv].some((v) => num(v) !== '') || (inRange(c.date, r) && c.sleepStages))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => [c.date, num(c.sleep, 2), num(c.sleepStages?.deep, 0), num(c.sleepStages?.light, 0), num(c.sleepStages?.rem, 0), num(c.sleepStages?.awake, 0),
      c.sleepStages ? localTime(c.sleepStages.start) : '', c.sleepStages ? localTime(c.sleepStages.end) : '', num(c.steps, 0), num(c.restingHr, 0), num(c.hrv, 0),
      num(c.energy, 0), num(c.soreness, 0), c.note ?? '']);
}

function routines(d: ExportData): string[][] {
  const folder = new Map(d.folders.map((f) => [f.id, f.name]));
  return d.routines.flatMap((rt) => rt.exercises.flatMap((b, i) => b.sets.map((s, k) => [folder.get(rt.folderId ?? '') ?? '', rt.name, String(i + 1), d.exerciseName(b.exerciseId),
    String(k + 1), setType(s), weight(s.weightKg, d.unit), num(s.reps), s.timeSec == null ? '' : mss(s.timeSec), num(s.distanceKm), num(b.restSec, 0), b.note ?? ''])));
}

const HEAD = (unit: 'kg' | 'lb'): Record<ExportArea | 'hevy', string[]> => ({
  workouts: ['date', 'start_time', 'workout', 'exercise', 'set', 'type', `weight_${unit}`, 'reps', 'time', 'distance_km', 'floors', 'steps', 'rpe', 'exercise_notes'],
  hevy: ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', unit === 'kg' ? 'weight_kg' : 'weight_lbs',
    'reps', 'distance_km', 'duration_seconds', 'rpe'],
  nutrition: ['date', 'meal', 'food', 'brand', 'amount', 'unit', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'sugars_g', 'saturated_fat_g', 'salt_g'],
  body: ['date', `weight_${unit}`, 'body_fat_%', 'waist_cm', 'chest_cm', 'hips_cm', 'arms_cm', 'source'],
  recovery: ['date', 'sleep_h', 'deep_min', 'light_min', 'rem_min', 'awake_min', 'bedtime', 'wake_time', 'steps', 'resting_hr', 'hrv_ms', 'energy_1_5', 'soreness_1_5', 'note'],
  routines: ['folder', 'routine', 'order', 'exercise', 'set', 'type', `target_weight_${unit}`, 'target_reps', 'target_time', 'target_distance_km', 'rest_s', 'notes'],
});

/** "2026-08-21_to_2026-11-19", "until_2026-11-19", "all-time". */
export const rangeLabel = (r: DateRange) => (r.from && r.to ? `${r.from}_to_${r.to}` : r.from ? `from_${r.from}` : r.to ? `until_${r.to}` : 'all-time');

/** The files for the picked areas (in a fixed order). */
export function exportFiles(d: ExportData, areas: ExportArea[], r: DateRange, format: WorkoutFormat): ExportFile[] {
  const head = HEAD(d.unit), label = rangeLabel(r);
  return EXPORT_AREAS.filter((a) => areas.includes(a)).map((a) => {
    const rows = a === 'workouts' ? workouts(d, r, format) : a === 'nutrition' ? nutrition(d, r) : a === 'body' ? body(d, r) : a === 'recovery' ? recovery(d, r) : routines(d);
    const hevy = a === 'workouts' && format === 'hevy';
    return { name: `mfd-${a}${hevy ? '-hevy-format' : ''}_${a === 'routines' ? 'all' : label}.csv`, text: csv(hevy ? head.hevy : head[a], rows), rows: rows.length };
  });
}
