// Reordering exercises (the Reorder page in the active workout and the routine editor) and folders/routines.
import type { ExerciseBlock } from './types';
import { leaveSuperset } from './supersets';

/** Where a dragged row lands: rows it passes shift one place the other way. Pure, for tests. */
export function dropIndex(from: number, dy: number, rowHeight: number, count: number) {
  return Math.max(0, Math.min(count - 1, from + Math.round(dy / rowHeight)));
}
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

/**
 * The list after Done: `current` (the latest, e.g. a set ticked on the watch meanwhile) in the order of `draft`;
 * exercises removed on the page leave their superset first; any added meanwhile stay, at the end.
 */
export function applyReorder(current: ExerciseBlock[], opened: ExerciseBlock[], draft: ExerciseBlock[]): ExerciseBlock[] {
  const kept = new Set(draft.map((b) => b.id)), seen = new Set(opened.map((b) => b.id));
  let l = current;
  for (const b of opened) if (!kept.has(b.id)) l = leaveSuperset(l, b.id).filter((x) => x.id !== b.id);
  const byId = new Map(l.map((b) => [b.id, b]));
  return [...draft.map((b) => byId.get(b.id)).filter((b): b is ExerciseBlock => !!b), ...l.filter((b) => !seen.has(b.id))];
}

