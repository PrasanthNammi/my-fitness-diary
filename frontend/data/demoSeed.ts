// Demo account data: a profile plus several weeks of logged history so Today,
// Progress and "Previous" values have something to show. The routine library is
// intentionally left empty.

import type { DiaryEntry, ExerciseBlock, Meal, Workout } from '../domain/types';
import { addDays, todayISO, fromISODate, uid } from '../lib/format';
import { emptyDB, type DB } from './store';
import { SAMPLE_FOODS } from './foodCatalog';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function buildDemoDB(): DB {
  const db = emptyDB();
  const today = todayISO();
  const r = rng(42);
  db.account = { name: 'Alex', email: 'demo@myfitnessdiary.app', mode: 'demo', createdAt: Date.now() };
  db.signedIn = true;
  db.profile = {
    name: 'Alex',
    age: 31,
    sex: 'male',
    heightCm: 180,
    weightKg: 82.4,
    activity: 'moderate',
    goal: 'lose',
    targetWeightKg: 78,
    trainingDaysPerWeek: 4,
  };

  // Weight trend over 8 weeks
  for (let i = 56; i >= 0; i -= 2) {
    const kg = 85.2 - (56 - i) * 0.05 + (r() - 0.5) * 0.6;
    db.weights.push({ id: uid(), date: addDays(today, -i), kg: Math.round(kg * 10) / 10 });
  }

  // Workout history: Upper / Lower split, 4× week, progressive overload
  const plans: Record<string, [string, number, number, number][]> = {
    Upper: [
      ['exercisedb:0025', 60, 8, 3],
      ['exercisedb:0027', 55, 8, 3],
      ['exercisedb:0426', 18, 10, 3],
      ['exercisedb:0294', 12, 12, 2],
    ],
    Lower: [
      ['exercisedb:0043', 80, 6, 3],
      ['exercisedb:0085', 70, 8, 3],
      ['exercisedb:0739', 140, 10, 3],
      ['exercisedb:0463', 0, 0, 2],
    ],
  };
  const days = [-1, -3, -5, -6];
  let session = 0;
  for (let week = 7; week >= 0; week--) {
    for (const d of days) {
      const date = addDays(today, d - week * 7);
      if (fromISODate(date) > new Date()) continue;
      const kind = session % 2 === 0 ? 'Upper' : 'Lower';
      const progress = 7 - week;
      const start = fromISODate(date);
      start.setHours(18, 10, 0, 0);
      const blocks: ExerciseBlock[] = plans[kind].map(([exerciseId, base, reps, sets]) => {
        const isPlank = exerciseId === 'exercisedb:0463';
        const w = base ? Math.round((base + progress * 1.25) / 1.25) * 1.25 : null;
        return {
          id: uid(),
          exerciseId,
          tracking: isPlank ? 'time' : 'weight_reps',
          restSec: isPlank ? 60 : 120,
          note: '',
          supersetId: null,
          sets: [
            ...(isPlank || !w ? [] : [{ id: uid(), type: 'warmup' as const, weightKg: Math.round(w * 0.5), reps: 10, timeSec: null, distanceKm: null, rpe: null, done: true }]),
            ...Array.from({ length: sets }, (_, i) => ({
              id: uid(),
              type: 'normal' as const,
              weightKg: isPlank ? null : w,
              reps: isPlank ? null : reps - (i === sets - 1 && r() > 0.6 ? 1 : 0),
              timeSec: isPlank ? 45 + progress * 5 : null,
              distanceKm: null,
              rpe: null,
              done: true,
            })),
          ],
        };
      });
      const wo: Workout = {
        id: uid(),
        title: kind === 'Upper' ? 'Upper Body' : 'Lower Body',
        routineId: null,
        startedAt: start.getTime(),
        endedAt: start.getTime() + (52 + Math.round(r() * 15)) * 60_000,
        exercises: blocks,
      };
      db.workouts.push(wo);
      session++;
    }
  }

  // Food diary for the last 6 days, including a partly logged today
  const pick = (id: string) => SAMPLE_FOODS.find((f) => f.id === `sample:${id}`)!;
  const day: [Meal, string, number, 'g' | 'ml' | 'serving'][] = [
    ['breakfast', 'oats', 60, 'g'],
    ['breakfast', 'milk', 200, 'ml'],
    ['breakfast', 'banana', 1, 'serving'],
    ['lunch', 'chicken', 160, 'g'],
    ['lunch', 'rice', 200, 'g'],
    ['lunch', 'broccoli', 120, 'g'],
    ['snacks', 'skyr', 1, 'serving'],
    ['snacks', 'almonds', 25, 'g'],
    ['dinner', 'salmon', 150, 'g'],
    ['dinner', 'potato', 250, 'g'],
  ];
  for (let i = 5; i >= 0; i--) {
    const date = addDays(today, -i);
    const entries = i === 0 ? day.slice(0, 6) : day;
    entries.forEach(([meal, id, amount, unit], k) => {
      const e: DiaryEntry = {
        id: uid(),
        date,
        meal,
        food: pick(id),
        amount: unit === 'serving' ? amount : Math.round(amount * (0.85 + r() * 0.3)),
        unit,
        createdAt: Date.now() - i * 86400000 + k,
      };
      db.diary.push(e);
    });
    db.water[date] = i === 0 ? 1250 : 2000 + Math.round(r() * 6) * 250;
  }

  // Recovery check-ins
  for (let i = 13; i >= 0; i -= 1) {
    if (r() < 0.35) continue;
    db.checkins.push({
      id: uid(),
      date: addDays(today, -i),
      sleep: 6 + Math.round(r() * 6) / 2,
      energy: 2 + Math.round(r() * 3),
      soreness: 1 + Math.round(r() * 3),
      note: '',
    });
  }

  db.favouriteFoodIds = ['sample:oats', 'sample:chicken', 'sample:skyr'];
  return db;
}
