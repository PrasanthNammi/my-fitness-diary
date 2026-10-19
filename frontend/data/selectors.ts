// Derived data hooks. Selectors read stable slices from the store, then compute with useMemo.
import { useMemo } from 'react';
import { calculateTargets, nutrientsFor, sumNutrients, type Nutrients } from '../domain/nutrition';
import type { DiaryEntry, ISODate, Meal } from '../domain/types';
import { todayISO } from '../lib/format';
import { useDB } from './store';

export function useSelectedDate(): ISODate {
  const d = useDB((db) => db.selectedDate);
  return d ?? todayISO();
}

export function useTargets() {
  const profile = useDB((d) => d.profile);
  return useMemo(() => (profile ? calculateTargets(profile) : null), [profile]);
}

export const entryNutrients = (e: DiaryEntry): Nutrients => nutrientsFor(e.food, e.amount, e.unit);

export function useDay(date: ISODate) {
  const diary = useDB((d) => d.diary);
  return useMemo(() => {
    const entries = diary.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt);
    const byMeal: Record<Meal, DiaryEntry[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    entries.forEach((e) => byMeal[e.meal].push(e));
    return { entries, byMeal, total: sumNutrients(entries.map(entryNutrients)) };
  }, [diary, date]);
}

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];
