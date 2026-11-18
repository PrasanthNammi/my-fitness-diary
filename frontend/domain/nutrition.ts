// Nutrition target calculation. Pure functions — no UI, no storage.
//
// Method
//  1. Basal metabolic rate (BMR): Mifflin–St Jeor equation.
//  2. Total daily energy expenditure (TDEE) = BMR × activity factor.
//  3. Goal adjustment applied to TDEE, with a safety floor.
//  4. Protein set per kg body weight by goal; fat as a share of energy;
//     carbohydrate fills the remaining energy.
//  5. Water: 35 ml per kg body weight.

import type { ActivityLevel, Food, Goal, NutritionTargets, PortionUnit, Profile, WeightEntry } from './types';

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary', hint: 'Desk job, little exercise' },
  light: { factor: 1.375, label: 'Lightly active', hint: 'Exercise 1–3 days a week' },
  moderate: { factor: 1.55, label: 'Moderately active', hint: 'Exercise 3–5 days a week' },
  very: { factor: 1.725, label: 'Very active', hint: 'Hard exercise 6–7 days a week' },
  extra: { factor: 1.9, label: 'Extremely active', hint: 'Physical job plus training' },
};

export const GOALS: Record<Goal, { label: string; kcalAdjust: number; proteinPerKg: number; fatShare: number }> = {
  lose: { label: 'Lose fat', kcalAdjust: -0.2, proteinPerKg: 2.0, fatShare: 0.25 },
  maintain: { label: 'Maintain weight', kcalAdjust: 0, proteinPerKg: 1.6, fatShare: 0.3 },
  gain: { label: 'Build muscle', kcalAdjust: 0.1, proteinPerKg: 1.8, fatShare: 0.25 },
  recomp: { label: 'Recomposition', kcalAdjust: -0.1, proteinPerKg: 2.0, fatShare: 0.25 },
};

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
const MIN_KCAL = { male: 1500, female: 1200 } as const;

export interface TargetBreakdown {
  targets: NutritionTargets;
  bmr: number;
  activityFactor: number;
  tdee: number;
  goalAdjustPct: number;
  floorApplied: boolean;
  proteinPerKg: number;
  fatShare: number;
}

export function bmrMifflinStJeor(p: Pick<Profile, 'sex' | 'weightKg' | 'heightCm' | 'age'>): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

/**
 * The profile targets are worked out from. From MFD 3.0 (latestWeighIn) the weight is the latest weigh-in, so
 * targets follow progress; the weight typed at onboarding is only used until the first weigh-in.
 */
export function profileForTargets(p: Profile, weights: readonly WeightEntry[], latestWeighIn: boolean): Profile {
  if (!latestWeighIn) return p;
  let last: WeightEntry | undefined;
  for (const w of weights) if (Number.isFinite(w.kg) && w.kg >= 20 && w.kg <= 400 && (!last || w.date > last.date)) last = w;
  return last ? { ...p, weightKg: last.kg } : p;
}

export function calculateTargets(p: Profile): TargetBreakdown {
  const bmr = bmrMifflinStJeor(p);
  const activityFactor = ACTIVITY_FACTORS[p.activity].factor;
  const tdee = bmr * activityFactor;
  const goal = GOALS[p.goal];
  let kcal = tdee * (1 + goal.kcalAdjust);
  const floor = MIN_KCAL[p.sex];
  const floorApplied = kcal < floor;
  if (floorApplied) kcal = floor;
  kcal = Math.round(kcal / 10) * 10;

  const protein = Math.round(p.weightKg * goal.proteinPerKg);
  const fat = Math.round((kcal * goal.fatShare) / KCAL_PER_G.fat);
  const carbs = Math.max(0, Math.round((kcal - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs));
  const waterMl = Number.isFinite(p.waterGoalMl) && p.waterGoalMl! >= 250 && p.waterGoalMl! <= 10000 ? p.waterGoalMl! : 2500;

  return {
    targets: { kcal, protein, carbs, fat, waterMl },
    bmr: Math.round(bmr),
    activityFactor,
    tdee: Math.round(tdee),
    goalAdjustPct: goal.kcalAdjust * 100,
    floorApplied,
    proteinPerKg: goal.proteinPerKg,
    fatShare: goal.fatShare,
  };
}

// ── Portion maths ─────────────────────────────────────────────────
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugars: number | null;
  saturates: number | null;
  fibre: number | null;
  salt: number | null;
}

export function allowedUnits(food: Food): PortionUnit[] {
  if (food.refUnit === 'serving') return ['serving'];
  return food.servingSize ? [food.refUnit, 'serving'] : [food.refUnit];
}

/**
 * Records what one serving weighs, so the food can be logged in servings and in grams (or ml).
 * A per-serving food becomes a per-gram food with the same nutrition: N servings still give the
 * same calories. Returns the food unchanged for a weight that is not a positive number.
 */
export function withServingWeight(food: Food, weight: number): Food {
  if (!(weight > 0) || !Number.isFinite(weight)) return food;
  if (food.refUnit === 'serving') {
    return { ...food, refUnit: 'g', refAmount: food.refAmount * weight, servingSize: weight, servingLabel: food.servingLabel ?? 'serving' };
  }
  return { ...food, servingSize: weight, servingLabel: food.servingLabel ?? 'serving' };
}

/** Converts a portion into the food's reference unit. */
export function portionInRefUnits(food: Food, amount: number, unit: PortionUnit): number {
  if (unit === food.refUnit) return amount;
  if (unit === 'serving' && food.servingSize) return amount * food.servingSize;
  return amount;
}

export function nutrientsFor(food: Food, amount: number, unit: PortionUnit): Nutrients {
  const f = portionInRefUnits(food, amount, unit) / food.refAmount;
  const opt = (v: number | null) => (v === null ? null : v * f);
  return {
    kcal: food.kcal * f,
    protein: food.protein * f,
    carbs: food.carbs * f,
    fat: food.fat * f,
    sugars: opt(food.sugars),
    saturates: opt(food.saturates),
    fibre: opt(food.fibre),
    salt: opt(food.salt),
  };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugars: 0, saturates: 0, fibre: 0, salt: 0 };
  for (const n of list) {
    out.kcal += n.kcal;
    out.protein += n.protein;
    out.carbs += n.carbs;
    out.fat += n.fat;
    for (const k of ['sugars', 'saturates', 'fibre', 'salt'] as const) {
      const v = n[k];
      out[k] = out[k] === null || v === null ? null : (out[k] as number) + v;
    }
  }
  return out;
}

export const KJ_PER_KCAL = 4.184;
export const kjToKcal = (kj: number) => kj / KJ_PER_KCAL;
export const kcalToKj = (kcal: number) => kcal * KJ_PER_KCAL;

/** Sum reported fibre without treating unreported nutrition as zero. */
export function fibreSummary(list: Nutrients[]) {
  const known = list.filter(n => n.fibre !== null && Number.isFinite(n.fibre));
  return { grams: known.length || !list.length ? known.reduce((sum,n)=>sum+n.fibre!,0) : null, missing: list.length-known.length };
}

/** Daily fibre target: 14 g per 1,000 kcal (the usual guideline), rounded. */
export const fibreTarget = (kcal: number) => Math.round((kcal / 1000) * 14);
