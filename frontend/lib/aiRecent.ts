// What ChatGPT and Claude added or changed in the last 24 hours (food, workouts, weights, routines, measurements, and
// water, settings and folders from aiChanges), minus what the user
// hid. Shared by the AI assistants sheet and the single banner on Overview. Hiding never undoes anything; the
// hidden list syncs with the settings and keeps only keys that are still recent, so it stays tiny.
import { useDB } from '../data/store';
import { entryNutrients } from '../data/selectors';
import { profileRepo } from '../data/repositories';
import { aiAdded, aiAddedRecently, type AiAdded, type AiCandidate } from '../domain/aiActivity';
import { aiChangeLabel } from '../domain/aiChanges';
import { fmtEnergy, fmtWeight } from './format';

const fmtLength = (cm: number, unit?: 'cm' | 'in') => (unit === 'in' ? `${Math.round((cm / 2.54) * 10) / 10} in` : `${Math.round(cm * 10) / 10} cm`);

export const aiKey = (a: AiAdded) => a.kind + ':' + a.id;

export function useAiActivity(now = Date.now()) {
  const entries = useDB((d) => d.diary), sessions = useDB((d) => d.workouts), weights = useDB((d) => d.weights), routines = useDB((d) => d.routines);
  const checkins = useDB((d) => d.checkins), changes = useDB((d) => d.aiChanges);
  const settings = useDB((d) => d.settings);
  const all = aiAdded([
    ...entries.map((e): AiCandidate => ({ id: e.id, kind: 'food', label: `${e.food.name} · ${fmtEnergy(entryNutrients(e).kcal, settings.energyUnit)}`, addedBy: e.addedBy })),
    ...sessions.map((w): AiCandidate => ({ id: w.id, kind: 'workout', label: w.title, addedBy: w.addedBy })),
    ...weights.map((w): AiCandidate => ({ id: w.id, kind: 'weight', label: `Weight · ${fmtWeight(w.kg, settings.weightUnit)}`, addedBy: w.addedBy })),
    ...routines.map((r): AiCandidate => ({ id: r.id, kind: 'routine', label: `Routine · ${r.name}`, addedBy: r.addedBy })),
    ...checkins.filter((c) => c.addedBy).map((c): AiCandidate => ({ id: c.id, kind: 'measurement', label: `Measurements · ${(['waist', 'chest', 'hips', 'arms'] as const).filter((k) => c[k] != null && c[k] !== '').map((k) => `${k[0]!.toUpperCase()}${k.slice(1)} ${fmtLength(Number(c[k]), settings.lengthUnit)}`).join(', ')}`, addedBy: c.addedBy })),
    ...changes.map((c): AiCandidate => ({ id: c.id, kind: c.kind, label: aiChangeLabel(c), addedBy: c.addedBy })),
  ]);
  const recent = aiAddedRecently(all, now);
  const hidden = new Set(settings.aiHidden ?? []);
  return { all, recent: recent.filter((a) => !hidden.has(aiKey(a))), recentAll: recent };
}

/** Hide entries from the AI lists (no undo). Keeps only keys of entries that are still recent. */
export function hideAiActivity(items: AiAdded[], recentAll: AiAdded[], current: string[] | undefined) {
  const still = new Set(recentAll.map(aiKey));
  const next = [...new Set([...(current ?? []).filter((k) => still.has(k)), ...items.map(aiKey)])];
  profileRepo.updateSettings({ aiHidden: next });
}

/** Who added (names always in the same order) and what: "3 new entries", or the entry itself when there's one. */
export function aiSummary(items: AiAdded[]) {
  const by = [...new Set(items.map((a) => a.by))].sort();
  const who = by.length <= 1 ? by[0] ?? 'Your AI assistant' : by.slice(0, -1).join(', ') + ' and ' + by.at(-1);
  return { who, what: items.length === 1 ? items[0]!.label : `${items.length} new entries`, text: `${who} ${items.every((a) => a.kind === 'settings' || a.kind === 'move' || a.kind === 'folder') ? 'changed' : 'added'} ${items.length === 1 ? items[0]!.label : `${items.length} entries`}` };
}
export const openAiHub = () => window.dispatchEvent(new Event('mfd-ai-hub'));
