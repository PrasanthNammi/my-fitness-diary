import type { AddedBy } from './types';
import { aiSource } from './aiSource';

export type AiAddedKind = 'food' | 'workout' | 'weight' | 'routine' | 'measurement' | 'water' | 'settings' | 'folder' | 'move' | 'routine_edit';
export type AiAdded = { id: string; kind: AiAddedKind; label: string; by: string; at: number };
export type AiCandidate = { id: string; kind: AiAddedKind; label: string; addedBy?: AddedBy };
const DAY = 43200000; // 12 hours

/** Entries an assistant added (those with a valid "added by" time), newest first. */
export function aiAdded(candidates: AiCandidate[]): AiAdded[] {
  const out: AiAdded[] = [];
  for (const c of candidates) {
    const at = c.addedBy?.at ? Date.parse(c.addedBy.at) : NaN;
    if (Number.isFinite(at)) out.push({ id: c.id, kind: c.kind, label: c.label, by: aiSource(c.addedBy) ?? 'AI assistant', at });
  }
  return out.sort((a, b) => b.at - a.at);
}
/** The last 24 hours, as listed in the AI hub with Undo. Future times (clock skew) count as now. */
export const aiAddedRecently = (all: AiAdded[], now: number) => all.filter((a) => now - a.at < DAY);
/** When an assistant last added something (0 if never). */
export const aiLastAdded = (all: AiAdded[], name: string) => all.reduce((m, a) => (a.by === name ? Math.max(m, a.at) : m), 0);
/** "5 min ago", "3 h ago", "2 d ago". */
export function aiAgo(t: number, now: number) {
  const m = Math.max(1, Math.round((now - t) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
