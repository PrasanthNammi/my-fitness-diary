// MFD AI: what Gemini is told, the JSON it must answer with, and turning that answer into cards the person checks.
// Pure (no store, no network) so it can be tested. Gemini only proposes; nothing is saved until "Add".
import type { Food, ISODate, Meal } from './types';

export type Source = 'mine' | 'estimate';
/** One food on a card. Per-unit numbers, so − / + can change the amount. `food` = matched saved food (its numbers win). */
export interface FoodLine { name: string; qty: number; unit: string; grams: number; kcal: number; p: number; c: number; f: number; source: Source; food?: Food }
export interface ExSet { reps?: number; kg?: number; seconds?: number; km?: number }
export interface Ex { name: string; exerciseId?: string | null; isNew?: boolean; sets: ExSet[] }
export type Card =
  | { kind: 'food'; day: ISODate; meal: Meal; lines: FoodLine[] }
  | { kind: 'water'; day: ISODate; ml: number }
  | { kind: 'weight'; day: ISODate; kg: number; lastKg?: number; lastDate?: ISODate }
  | { kind: 'measure'; day: ISODate; values: Partial<Record<'waist' | 'chest' | 'hips' | 'arms', number>> }
  | { kind: 'checkin'; day: ISODate; sleep?: number; energy?: number; soreness?: number }
  | { kind: 'workout'; day: ISODate; title: string; minutes?: number; exercises: Ex[] }
  | { kind: 'routine'; name: string; folder: string; suggested?: boolean; exercises: Ex[] }
  | { kind: 'start'; name: string; routineId?: string | null; exercises?: number };

export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

export function systemPrompt(ctx: { today: ISODate; weekday: string; time: string; weightUnit: 'kg' | 'lb'; lengthUnit: 'cm' | 'in' }) {
  return `You are MFD AI inside My Fitness Diary, a fitness and food diary app. Your ONLY job is turning what the person writes into diary entries they will check before anything is saved.
Today is ${ctx.weekday} ${ctx.today}, local time ${ctx.time}. The person uses ${ctx.weightUnit} for weight and ${ctx.lengthUnit} for body measurements. Always answer in kg, cm, ml and grams (convert).

Rules:
- Never give advice, coaching, trends, medical, diet or nutrition guidance, and never comment on the person's choices. If the message asks for any of that, or is not something to log, return no items and reply exactly: "I only log. For trends and advice, ask ChatGPT or Claude."
- Never log or mention periods, pregnancy, medicines or other health conditions: return no items and reply "I can't log that here."
- reply: at most 8 words, friendly and plain, usually "My estimate. Look right?" or "Look right?". For a correction: "Updated. Look right?".
- day_offset: 0 = today, -1 = yesterday (only when the person says so). Never in the future.
- food: one item per meal. meal from the words, or from the time (before 11:00 breakfast, 11:00-15:59 lunch, 16:00-21:59 dinner, else snacks; "snack" = snacks). Each food: a short plain name (e.g. "Eggs, boiled", "White toast", "Banana"), qty and unit as the person said (unit like "large", "slice", "cup", "piece", "bowl"; if they gave grams or ml use unit "g" or "ml" with qty = the amount). grams_per_unit = weight of ONE unit (1 for g/ml). kcal_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit = realistic typical values for ONE unit (for g/ml: per 1 g or 1 ml). Estimate typical portions when not given.
- Drinks without calories (water, black coffee, plain tea) go in a "water" item with ml (a glass = 250 ml, a bottle = 500 ml, a cup = 240 ml); drinks with calories are food.
- weight: kg. measurements: waist_cm, chest_cm, hips_cm, arms_cm. checkin: sleep_hours, energy_1to5, soreness_1to5 (only what was said).
- workout: a finished workout. title (e.g. "Push day", or "Workout"), minutes if said. exercises with standard gym names in this style, equipment in brackets: "Bench Press (Barbell)", "Incline Bench Press (Dumbbell)", "Squat (Barbell)", "Lat Pulldown (Cable)", "Bicep Curl (Dumbbell)", "Triceps Pushdown (Cable)", "Pull Up", "Chest Dip", "Running", "Plank". One entry per set: "3x8 at 60" = three sets of reps 8, kg 60. Cardio: one set with seconds and km ("ran 5 km in 28 min" = one set km 5, seconds 1680). Bodyweight: no kg.
- routine: a saved plan (not done yet). routine_name, folder only if the person named one. To save the last workout as a routine, copy its exercises and sets. When asked to make one up, you MUST fill exercises with 4-6 sensible exercises, each with 3 sets (reps, no kg), and set drafted = true. A routine item without exercises is useless.
- start_routine: when the person wants to start or begin a workout from a routine: routine_name as they said it.
- If the person corrects something you proposed ("it was 3 eggs", "make it lunch"), answer with the full corrected item(s) and set replaces_previous = true.
- Only include fields that apply. Never invent things the person did not say, except typical portions and nutrition values.`;
}

// Standard JSON Schema (sent as responseJsonSchema: answers in ~1-2 s; the older responseSchema hung for a minute).
const num = { type: 'number' }, int = { type: 'integer' }, str = { type: 'string' };
const setSchema = { type: 'object', properties: { reps: int, kg: num, seconds: num, km: num } };
const exSchema = { type: 'object', properties: { name: str, sets: { type: 'array', minItems: 1, items: setSchema } }, required: ['name', 'sets'] };
/** One schema per kind of item (anyOf), each with the fields it must have, so a drafted routine always has exercises. */
const item = (kind: string, props: Record<string, object>, required: string[] = []) =>
  ({ type: 'object', properties: { kind: { type: 'string', enum: [kind] }, ...props }, required: ['kind', ...required] });
const day = { day_offset: int };
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: str,
    replaces_previous: { type: 'boolean' },
    items: { type: 'array', items: { anyOf: [
      item('food', { ...day, meal: { type: 'string', enum: MEALS }, foods: { type: 'array', minItems: 1, items: { type: 'object', required: ['name', 'qty', 'unit', 'grams_per_unit', 'kcal_per_unit', 'protein_per_unit', 'carbs_per_unit', 'fat_per_unit'], properties: {
        name: str, qty: num, unit: str, grams_per_unit: num, kcal_per_unit: num, protein_per_unit: num, carbs_per_unit: num, fat_per_unit: num } } } }, ['meal', 'foods']),
      item('water', { ...day, ml: num }, ['ml']),
      item('weight', { ...day, kg: num }, ['kg']),
      item('measurements', { ...day, waist_cm: num, chest_cm: num, hips_cm: num, arms_cm: num }),
      item('checkin', { ...day, sleep_hours: num, energy_1to5: int, soreness_1to5: int }),
      item('workout', { ...day, title: str, minutes: num, exercises: { type: 'array', minItems: 1, items: exSchema } }, ['title', 'exercises']),
      item('routine', { routine_name: str, folder: str, drafted: { type: 'boolean' }, exercises: { type: 'array', minItems: 1, items: exSchema } }, ['routine_name', 'exercises']),
      item('start_routine', { routine_name: str }, ['routine_name']),
    ] } },
  },
  required: ['reply', 'items'],
};

/** The answer's shape as an example, for the fallback request without a schema. */
export const RESPONSE_EXAMPLE = '{"reply":"My estimate. Look right?","replaces_previous":false,"items":[{"kind":"food","day_offset":0,"meal":"breakfast","foods":[{"name":"Eggs, boiled","qty":2,"unit":"large","grams_per_unit":50,"kcal_per_unit":78,"protein_per_unit":6.3,"carbs_per_unit":0.6,"fat_per_unit":5.3}]},{"kind":"water","ml":500},{"kind":"weight","kg":72.4},{"kind":"measurements","waist_cm":81},{"kind":"checkin","sleep_hours":7.5,"energy_1to5":4,"soreness_1to5":2},{"kind":"workout","title":"Push day","minutes":55,"exercises":[{"name":"Bench Press (Barbell)","sets":[{"reps":8,"kg":60}]}]},{"kind":"routine","routine_name":"Push A","folder":"PPL","drafted":false,"exercises":[{"name":"Bench Press (Barbell)","sets":[{"reps":8,"kg":60}]}]},{"kind":"start_routine","routine_name":"Push A"}]}';

// ── Checking Gemini's answer ─────────────────────────────────────
const n = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const s = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export function addDays(day: ISODate, d: number): ISODate {
  const t = new Date(day + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10) as ISODate;
}

export interface Parsed { reply: string; replaces: boolean; cards: Card[] }

/** Gemini's JSON → cards. Anything out of range is dropped; never a future day; at most 7 days back. */
export function parseAnswer(raw: any, today: ISODate): Parsed {
  const reply = s(raw?.reply, 140) || 'Look right?';
  const cards: Card[] = [];
  for (const it of Array.isArray(raw?.items) ? raw.items.slice(0, 8) : []) {
    const off = Math.round(n(it?.day_offset, -7, 0) ?? 0), day = addDays(today, off);
    switch (it?.kind) {
      case 'food': {
        const lines: FoodLine[] = (Array.isArray(it.foods) ? it.foods.slice(0, 12) : []).flatMap((f: any): FoodLine[] => {
          const name = s(f?.name, 60), qty = n(f?.qty, 0.01, 5000), grams = n(f?.grams_per_unit, 0.01, 3000), kcal = n(f?.kcal_per_unit, 0, 3000);
          if (!name || qty === undefined || grams === undefined || kcal === undefined) return [];
          const unit = s(f?.unit, 16).toLowerCase() || 'serving';
          return [{ name, qty, unit, grams, kcal, p: n(f?.protein_per_unit, 0, 300) ?? 0, c: n(f?.carbs_per_unit, 0, 300) ?? 0, f: n(f?.fat_per_unit, 0, 300) ?? 0, source: 'estimate' }];
        });
        if (lines.length) cards.push({ kind: 'food', day, meal: MEALS.includes(it.meal) ? it.meal : 'snacks', lines });
        break;
      }
      case 'water': { const ml = n(it.ml, 10, 5000); if (ml) cards.push({ kind: 'water', day, ml: Math.round(ml) }); break; }
      case 'weight': { const kg = n(it.kg, 20, 400); if (kg) cards.push({ kind: 'weight', day, kg: Math.round(kg * 10) / 10 }); break; }
      case 'measurements': {
        const values = Object.fromEntries((['waist', 'chest', 'hips', 'arms'] as const).map((k) => [k, n(it[`${k}_cm`], 10, 300)]).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Math.round((v as number) * 10) / 10]));
        if (Object.keys(values).length) cards.push({ kind: 'measure', day, values });
        break;
      }
      case 'checkin': {
        const sleep = n(it.sleep_hours, 0, 24), energy = n(it.energy_1to5, 1, 5), soreness = n(it.soreness_1to5, 1, 5);
        if (sleep !== undefined || energy !== undefined || soreness !== undefined) cards.push({ kind: 'checkin', day, sleep: sleep === undefined ? undefined : Math.round(sleep * 2) / 2, energy, soreness });
        break;
      }
      case 'workout': case 'routine': {
        const exercises: Ex[] = (Array.isArray(it.exercises) ? it.exercises.slice(0, 20) : []).flatMap((e: any): Ex[] => {
          const name = s(e?.name, 60);
          const sets = (Array.isArray(e?.sets) ? e.sets.slice(0, 20) : []).map((x: any): ExSet => ({ reps: n(x?.reps, 1, 500), kg: n(x?.kg, 0.1, 1000), seconds: n(x?.seconds, 1, 86400), km: n(x?.km, 0.01, 500) }))
            .filter((x: ExSet) => x.reps !== undefined || x.seconds !== undefined || x.km !== undefined);
          return name && sets.length ? [{ name, sets }] : [];
        });
        if (!exercises.length) break;
        const minutes = n(it.minutes, 1, 600);
        // A single cardio set without its time ("ran 5 km in 28 min" often comes back as minutes on the workout).
        if (it.kind === 'workout' && minutes && exercises.length === 1 && exercises[0].sets.length === 1 && exercises[0].sets[0].km && !exercises[0].sets[0].seconds) exercises[0].sets[0].seconds = minutes * 60;
        if (it.kind === 'workout') cards.push({ kind: 'workout', day, title: s(it.title, 40) || 'Workout', minutes, exercises });
        else cards.push({ kind: 'routine', name: s(it.routine_name, 40) || 'New routine', folder: s(it.folder, 40), suggested: it.drafted === true, exercises });
        break;
      }
      case 'start_routine': { const name = s(it.routine_name, 40); if (name) cards.push({ kind: 'start', name }); break; }
    }
  }
  return { reply, replaces: raw?.replaces_previous === true, cards };
}

/** A card as text for the conversation sent back to Gemini (so "it was 3 eggs" can be understood). */
export function cardSummary(c: Card): string {
  switch (c.kind) {
    case 'food': return `food ${c.meal}: ${c.lines.map((l) => `${l.qty} ${l.unit} ${l.name}`).join(', ')}`;
    case 'water': return `water ${c.ml} ml`;
    case 'weight': return `weight ${c.kg} kg`;
    case 'measure': return `measurements ${Object.entries(c.values).map(([k, v]) => `${k} ${v} cm`).join(', ')}`;
    case 'checkin': return `check-in sleep ${c.sleep ?? '-'} h, energy ${c.energy ?? '-'}, soreness ${c.soreness ?? '-'}`;
    case 'workout': case 'routine':
      return `${c.kind} ${c.kind === 'workout' ? c.title : c.name}: ${c.exercises.map((e) => `${e.name} ${e.sets.map((x) => `${x.reps ?? ''}${x.kg ? `x${x.kg}kg` : ''}${x.seconds ? ` ${x.seconds}s` : ''}${x.km ? ` ${x.km}km` : ''}`).join(',')}`).join('; ')}`;
    case 'start': return `start routine ${c.name}`;
  }
}
