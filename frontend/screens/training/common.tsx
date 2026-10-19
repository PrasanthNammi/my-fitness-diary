import { useState } from 'react';
import { Check, FolderPlus } from 'lucide-react';
import type { ExerciseBlock, Folder } from '../../domain/types';
import { Sheet } from '../../components/ui';
import { exerciseName, training } from '../../data/repositories';
import { uid } from '../../lib/format';

// ── Block list helpers shared by the routine editor and active workout ──
export function moveBlock(list: ExerciseBlock[], index: number, dir: -1 | 1): ExerciseBlock[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export function supersetLetters(list: ExerciseBlock[]): Record<string, string> {
  const map: Record<string, string> = {};
  let n = 0;
  for (const b of list) {
    if (!b.supersetId) continue;
    const members = list.filter((x) => x.supersetId === b.supersetId).length;
    if (members < 2) continue;
    if (!map[b.supersetId]) map[b.supersetId] = String.fromCharCode(65 + n++);
  }
  return map;
}

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

export function SupersetSheet({
  open, onClose, list, forId, onPick,
}: { open: boolean; onClose: () => void; list: ExerciseBlock[]; forId: string | null; onPick: (otherId: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Superset with">
      <div className="option-list">
        {list
          .filter((b) => b.id !== forId)
          .map((b) => (
            <button
              key={b.id}
              className="option"
              onClick={() => {
                onPick(b.id);
                onClose();
              }}
            >
              <span className="strong ellipsis">{exerciseName(b.exerciseId)}</span>
            </button>
          ))}
      </div>
    </Sheet>
  );
}

// ── Folder choice: none / existing / new ──────────────────────────
export type FolderChoiceValue = { kind: 'none' } | { kind: 'folder'; id: string } | { kind: 'new'; name: string };

export function folderChoiceLabel(v: FolderChoiceValue, folders: Folder[]): string {
  if (v.kind === 'none') return 'No folder';
  if (v.kind === 'new') return v.name.trim() ? `New: ${v.name.trim()}` : 'New folder';
  return folders.find((f) => f.id === v.id)?.name ?? 'No folder';
}

/** Validates and resolves a choice into a folder id, creating the folder if needed. */
export function resolveFolderChoice(v: FolderChoiceValue): string | null {
  if (v.kind === 'none') return null;
  if (v.kind === 'folder') return v.id;
  return training.createFolder(v.name).id;
}

export function folderNameError(name: string, folders: Folder[], exceptId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter a folder name.';
  if (n.length > 40) return 'Keep it under 40 characters.';
  if (folders.some((f) => f.id !== exceptId && f.name.toLowerCase() === n.toLowerCase())) return 'A folder with this name already exists.';
  return null;
}

export function FolderChoice({
  value, onChange, folders, error,
}: { value: FolderChoiceValue; onChange: (v: FolderChoiceValue) => void; folders: Folder[]; error?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field">
      <label htmlFor="folder-choice">Folder</label>
      <button id="folder-choice" type="button" className="select-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="ellipsis">{folderChoiceLabel(value, folders)}</span>
        <FolderPlus />
      </button>
      {value.kind === 'new' && (
        <input
          className="input"
          aria-label="New folder name"
          placeholder="New folder name"
          value={value.name}
          aria-invalid={!!error}
          onChange={(e) => onChange({ kind: 'new', name: e.target.value })}
          autoFocus
        />
      )}
      {error && <div className="err" role="alert">{error}</div>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose folder">
        <div className="option-list">
          <button className="option" aria-pressed={value.kind === 'none'} onClick={() => (onChange({ kind: 'none' }), setOpen(false))}>
            <span className="strong">No folder</span>
            {value.kind === 'none' && <Check className="check" />}
          </button>
          {folders.map((f) => (
            <button key={f.id} className="option" aria-pressed={value.kind === 'folder' && value.id === f.id} onClick={() => (onChange({ kind: 'folder', id: f.id }), setOpen(false))}>
              <span className="strong ellipsis">{f.name}</span>
              {value.kind === 'folder' && value.id === f.id && <Check className="check" />}
            </button>
          ))}
          <button className="option" aria-pressed={value.kind === 'new'} onClick={() => (onChange({ kind: 'new', name: value.kind === 'new' ? value.name : '' }), setOpen(false))}>
            <FolderPlus size={18} /> <span className="strong">New folder…</span>
          </button>
        </div>
      </Sheet>
    </div>
  );
}

export function blockSummary(list: ExerciseBlock[]): string {
  const sets = list.reduce((n, b) => n + b.sets.length, 0);
  return `${list.length} ${list.length === 1 ? 'exercise' : 'exercises'} · ${sets} ${sets === 1 ? 'set' : 'sets'}`;
}
