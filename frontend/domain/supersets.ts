// Supersets in a list of exercise blocks (used by the workout screens and the watch).
import type { ExerciseBlock } from './types';
import { uid } from '../lib/format';

export function joinSuperset(list: ExerciseBlock[], aId: string, bId: string): ExerciseBlock[] {
  const a = list.find((x) => x.id === aId);
  const b = list.find((x) => x.id === bId);
  const sid = a?.supersetId ?? b?.supersetId ?? uid();
  const moved = list.map((x) => (x.id === aId || x.id === bId ? { ...x, supersetId: sid } : x));
  // Keep superset members adjacent: place b right after a.
  const bi = moved.findIndex((x) => x.id === bId);
  const bBlock = moved[bi];
  const without = moved.filter((x) => x.id !== bId);
  const ai = without.findIndex((x) => x.id === aId);
  without.splice(ai + 1, 0, bBlock);
  return without;
}

export function leaveSuperset(list: ExerciseBlock[], id: string): ExerciseBlock[] {
  const sid = list.find((x) => x.id === id)?.supersetId;
  let next = list.map((x) => (x.id === id ? { ...x, supersetId: null } : x));
  if (sid && next.filter((x) => x.supersetId === sid).length < 2) next = next.map((x) => (x.supersetId === sid ? { ...x, supersetId: null } : x));
  return next;
}
