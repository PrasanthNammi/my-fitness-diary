// What ChatGPT or Claude changed besides adding entries (connector SQL database/mcp-ai-logging.sql), kept in the
// diary's "aiChanges" so the AI list can show and undo them: water added to a day, goals and settings, a folder
// created for routines, a routine moved into a folder.
import type { AddedBy, Folder, ID, ISODate, Profile, Routine, Settings } from './types';

type Change<K extends string, T> = { id: ID; kind: K; addedBy?: AddedBy } & T;
export type SettingKey = 'goal' | 'activity' | 'training_days' | 'target_weight_kg' | 'height_cm' | 'age' | 'water_goal_ml' | 'weight_unit' | 'energy_unit' | 'length_unit' | 'default_rest_seconds';
export type AiChange =
  | Change<'water', { date: ISODate; ml: number }>
  | Change<'settings', { changes: Partial<Record<SettingKey, { from: string | number; to: string | number }>> }>
  | Change<'folder', { folderId: ID; name: string }>
  | Change<'move', { routineId: ID; name: string; from?: ID; to: ID; createdFolder?: ID; folder: string }>;

export const SETTING_LABELS: Record<SettingKey, string> = {
  goal: 'Goal', activity: 'Activity', training_days: 'Training days', target_weight_kg: 'Target weight', height_cm: 'Height', age: 'Age',
  water_goal_ml: 'Water goal', weight_unit: 'Weight unit', energy_unit: 'Energy unit', length_unit: 'Length unit', default_rest_seconds: 'Rest time',
};

/** Only well-formed changes (the list comes from the synced diary). */
export const aiChangeList = (v: unknown): AiChange[] =>
  Array.isArray(v) ? v.filter((c): c is AiChange => !!c && typeof c === 'object' && typeof c.id === 'string' && ['water', 'settings', 'folder', 'move'].includes(c.kind)) : [];

/** "Water · 500 ml", "Settings · Goal, Activity", "Folder · Arms", "Push A → Arms". */
export function aiChangeLabel(c: AiChange): string {
  if (c.kind === 'water') return `Water · ${c.ml} ml`;
  if (c.kind === 'settings') return `Settings · ${Object.keys(c.changes ?? {}).map((k) => SETTING_LABELS[k as SettingKey] ?? k).join(', ')}`;
  if (c.kind === 'folder') return `Folder · ${c.name}`;
  return `${c.name} → ${c.folder}`;
}

type Profile_ = Pick<Profile, 'goal' | 'activity' | 'trainingDaysPerWeek' | 'targetWeightKg' | 'heightCm' | 'age' | 'waterGoalMl'>;
const PROFILE: Partial<Record<SettingKey, keyof Profile_>> = {
  goal: 'goal', activity: 'activity', training_days: 'trainingDaysPerWeek', target_weight_kg: 'targetWeightKg', height_cm: 'heightCm', age: 'age', water_goal_ml: 'waterGoalMl',
};
const SETTINGS: Partial<Record<SettingKey, keyof Settings>> = {
  weight_unit: 'weightUnit', energy_unit: 'energyUnit', length_unit: 'lengthUnit', default_rest_seconds: 'defaultRestSec',
};

export type UndoTarget = { profile: Profile | null; settings: Settings; water: Record<ISODate, number>; routines: Routine[]; folders: Folder[]; aiChanges: AiChange[] };

/**
 * Undoes one AI change in `d` (a draft) and drops it from the list. Something the person changed again since is
 * left as they set it: a setting only goes back while it still has the AI's value, a routine only moves back while
 * it is still in that folder, and a folder is only removed while it holds no other routine.
 */
export function undoAiChange(d: UndoTarget, id: ID) {
  const c = d.aiChanges.find((x) => x.id === id);
  if (!c) return;
  if (c.kind === 'water') d.water[c.date] = Math.max(0, (d.water[c.date] ?? 0) - c.ml);
  else if (c.kind === 'settings') {
    for (const [k, v] of Object.entries(c.changes ?? {}) as [SettingKey, { from: string | number; to: string | number }][]) {
      const p = PROFILE[k], s = SETTINGS[k];
      if (p && d.profile && d.profile[p] === v.to) (d.profile as unknown as Record<string, unknown>)[p] = v.from;
      else if (s && d.settings[s] === v.to) (d.settings as unknown as Record<string, unknown>)[s] = v.from;
    }
  } else if (c.kind === 'folder') removeFolder(d, c.folderId, true);
  else {
    const r = d.routines.find((x) => x.id === c.routineId);
    if (r && r.folderId === c.to) r.folderId = c.from ?? null;
    if (c.createdFolder) removeFolder(d, c.createdFolder, false);
  }
  d.aiChanges = d.aiChanges.filter((x) => x.id !== id);
}

function removeFolder(d: UndoTarget, folderId: ID, emptyIt: boolean) {
  if (!emptyIt && d.routines.some((r) => r.folderId === folderId)) return;
  for (const r of d.routines) if (r.folderId === folderId) r.folderId = null;
  d.folders = d.folders.filter((f) => f.id !== folderId);
}
