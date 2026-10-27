// Derived data hooks. Selectors read stable slices from the store, then compute with useMemo.
import { useMemo,useSyncExternalStore } from 'react';
import {selectedDay,subscribeDay} from '../lib/daySelection';
import { calculateTargets, nutrientsFor, sumNutrients, fibreSummary, type Nutrients } from '../domain/nutrition';
import type { DiaryEntry, ISODate, Meal } from '../domain/types';
import { todayISO } from '../lib/format';
import { useDB } from './store';

export function useSelectedDate(): ISODate {
  return useSyncExternalStore(subscribeDay,selectedDay);
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
    const nutrients = entries.map(entryNutrients);
    return { entries, byMeal, total: sumNutrients(nutrients), fibre: fibreSummary(nutrients) };
  }, [diary, date]);
}

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];
