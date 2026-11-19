// One set as the synced diary stores it (kg, duration_seconds, distance_meters…) → the app's SetEntry. Used when the
// diary is loaded (adapters/compat.ts) and when an AI routine edit is undone (aiChanges.ts restores the sets it kept).
import type { SetEntry } from './types';

export function setFromRow(s: any, fallbackId: string): SetEntry {
  return {
    id: s.id || fallbackId, type: s.type === 'dropset' ? 'drop' : s.type || 'normal', weightKg: s.kg ?? null, reps: s.reps ?? null,
    timeSec: s.duration_seconds ?? null, distanceKm: s.distance_meters == null ? null : s.distance_meters / 1000, floors: s.floors ?? null,
    steps: s.steps ?? null, rpe: s.rpe ?? null, suggested: s.mfdSuggested, ...(s.mfdAi ? { aiTarget: true, aiPrev: s.mfdAiPrev ?? null } : {}),
    ...(s.mfdAiAdded ? { aiAdded: true } : {}), ...(typeof s.mfdDoneAt === 'number' ? { doneAt: s.mfdDoneAt } : {}), ...(s.mfdUnusualOk ? { unusualOk: true } : {}), done: s.done !== false,
  } as SetEntry;
}
