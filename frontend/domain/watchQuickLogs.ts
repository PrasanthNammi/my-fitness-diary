// The watch's quick logs on the phone's diary: weigh-in, water, logging a food again, the morning check-in. Each is
// filed under the day it was tapped on the watch (its time, in the phone's time zone), even when the phone applies it
// later. Anything invalid or unknown is ignored.
import type { Food, ISODate, Meal, PortionUnit } from './types';
import type { DB } from '../data/store';
import { allowedUnits } from './nutrition';
import { checkinNumber, isRecoveryRow } from './progressStats';
import { toISODate } from '../lib/format';
import type { WatchCommand } from './watchCommands';

export const QUICK_LOGS = ['weighIn', 'water', 'foodRelog', 'checkin'] as const;
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export type QuickLogActions = {
  logWeight: (date: ISODate, kg: number) => void;
  setWater: (date: ISODate, ml: number) => void;
  addFood: (date: ISODate, meal: Meal, food: Food, amount: number, unit: PortionUnit) => unknown;
  saveCheckIn: (c: { date: ISODate; sleep: number | null; energy: number | null; soreness: number | null; note: string }) => void;
};

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const int = (v: unknown, lo: number, hi: number) => { const x = num(v, lo, hi); return x !== null && Number.isInteger(x) ? x : null; };

/** The day a watch command was made (its `at`), else today. */
export const commandDay = (c: WatchCommand): ISODate => toISODate(new Date(num(c.at, 1, 1e14) ?? Date.now()));

/** Applies one quick log. Returns whether it did anything. */
export function applyQuickLog(c: WatchCommand, d: DB, act: QuickLogActions): boolean {
  const day = commandDay(c);
  switch (c.type) {
    case 'weighIn': {
      const kg = num(c.kg, 20, 400);
      if (kg === null) return false;
      act.logWeight(day, Math.round(kg * 100) / 100);
      return true;
    }
    case 'water': {
      // A change (+250, −250 for Undo), so two devices adding water never overwrite each other.
      const ml = int(c.ml, -5000, 5000);
      if (!ml) return false;
      act.setWater(day, Math.max(0, (d.water[day] ?? 0) + ml));
      return true;
    }
    case 'foodRelog': {
      const ref = typeof c.ref === 'string' ? c.ref : '';
      const food = c.from === 'favourite' ? d.settings.favouriteFoods?.find((f) => f.id === ref) : d.diary.find((e) => e.id === ref)?.food;
      const meal = MEALS.includes(c.meal as Meal) ? (c.meal as Meal) : null;
      const amount = num(c.amount, 0.01, 5000), unit = c.unit as PortionUnit;
      if (!food || !meal || amount === null || !allowedUnits(food).includes(unit)) return false;
      act.addFood(day, meal, structuredClone(food), Math.round(amount * 100) / 100, unit);
      return true;
    }
    case 'checkin': {
      const energy = int(c.energy, 1, 5), soreness = int(c.soreness, 1, 5);
      if (energy === null && soreness === null) return false;
      // Keep what the day's check-in already has (sleep from Samsung Health, a note).
      const existing = d.checkins.find((x) => x.date === day && isRecoveryRow(x));
      act.saveCheckIn({ date: day, sleep: checkinNumber(existing?.sleep), energy: energy ?? checkinNumber(existing?.energy), soreness: soreness ?? checkinNumber(existing?.soreness), note: existing?.note ?? '' });
      return true;
    }
    default:
      return false;
  }
}
