// Plate calculator: which plates go on each side of the bar for a target weight. Pure, so it is unit-tested.
import type { Settings } from './types';

export type Unit = 'kg' | 'lb';
export interface PlateSetup { unit: Unit; bar: number; plates: number[] }
export interface PlateLoad {
  /** Plates for ONE side, heaviest first. */
  perSide: { plate: number; count: number }[];
  /** Weight actually loaded (bar + both sides). */
  loaded: number;
  /** Target minus loaded: more than 0 when the plates can't make the exact weight. */
  short: number;
  /** The target is below the empty bar. */
  underBar: boolean;
}

export const PLATE_DEFAULTS: Record<Unit, PlateSetup> = {
  kg: { unit: 'kg', bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { unit: 'lb', bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};
/** Plates offered on the settings page (the user ticks the ones their gym has). */
export const PLATE_CHOICES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5],
  lb: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25],
};

/** The saved setup for the weight unit in use, or the standard one for that unit. */
export function plateSetup(settings: Pick<Settings, 'weightUnit' | 'plates'>): PlateSetup {
  const unit = settings.weightUnit, saved = settings.plates;
  if (saved && saved.unit === unit && saved.bar >= 0 && saved.plates.length) return { unit, bar: saved.bar, plates: [...saved.plates].sort((a, b) => b - a) };
  return PLATE_DEFAULTS[unit];
}

// Work in thousandths so 1.25 + 1.25 never turns into 2.4999….
const milli = (v: number) => Math.round(v * 1000);

/** Heaviest plates first, as many of each as fit, the same on both sides. */
export function loadBar(target: number, setup: PlateSetup): PlateLoad {
  const bar = milli(setup.bar), goal = milli(Math.max(0, target));
  if (!Number.isFinite(target)) return { perSide: [], loaded: setup.bar, short: 0, underBar: true };
  if (goal < bar) return { perSide: [], loaded: setup.bar, short: 0, underBar: true };
  let side = Math.floor((goal - bar) / 2);
  const perSide: PlateLoad['perSide'] = [];
  for (const plate of [...new Set(setup.plates)].filter((p) => p > 0).sort((a, b) => b - a)) {
    const m = milli(plate), count = Math.floor(side / m);
    if (count > 0) { perSide.push({ plate, count }); side -= count * m; }
  }
  const loadedM = bar + 2 * perSide.reduce((s, p) => s + milli(p.plate) * p.count, 0);
  return { perSide, loaded: loadedM / 1000, short: (goal - loadedM) / 1000, underBar: false };
}
