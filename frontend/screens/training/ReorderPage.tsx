import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Minus } from 'lucide-react';
import type { ExerciseBlock } from '../../domain/types';
import { exercises } from '../../data/repositories';
import { TopBar } from '../../components/ui';
import { ExerciseThumb } from './ExercisePicker';
import { dropIndex, moveTo } from '../../domain/reorder';
export { applyReorder } from '../../domain/reorder';

/**
 * Reorder (active workout and routine editor): drag ≡ on the right and the other exercises slide out of the way;
 * − removes one. Done keeps the new list (sets, notes and supersets move with their exercise); ← leaves it as it was.
 */
export function ReorderPage({ open, blocks, onDone, onClose }: { open: boolean; blocks: ExerciseBlock[]; onDone: (draft: ExerciseBlock[], opened: ExerciseBlock[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(blocks);
  const opened = useRef(blocks);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const rowH = useRef(60);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setDraft(blocks); opened.current = blocks; setDrag(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  if (!open) return null;

  const start = (e: React.PointerEvent, from: number) => {
    e.preventDefault();
    const row = (e.currentTarget as HTMLElement).closest('.ro-row') as HTMLElement | null;
    if (row) rowH.current = row.getBoundingClientRect().height || 60;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    setDrag({ from, to: from, dy: 0 });
    const target = e.currentTarget as HTMLElement;
    const move = (ev: PointerEvent) => { const dy = ev.clientY - y0; setDrag({ from, to: dropIndex(from, dy, rowH.current, draft.length), dy }); };
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
      const to = dropIndex(from, ev.clientY - y0, rowH.current, draft.length);
      setDraft((l) => moveTo(l, from, to)); setDrag(null);
      if (to !== from) navigator.vibrate?.(10);
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };
  const keys = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d || i + d < 0 || i + d >= draft.length) return;
    e.preventDefault();
    setDraft((l) => moveTo(l, i, i + d));
    requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>('.ro-handle')[i + d]?.focus());
  };
  const shift = (k: number) => {
    if (!drag || k === drag.from) return 0;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return -rowH.current;
    if (drag.from > drag.to && k < drag.from && k >= drag.to) return rowH.current;
    return 0;
  };

  return createPortal(
    <div className="reorder-page" role="dialog" aria-modal="true" aria-label="Reorder exercises">
      <TopBar title="Reorder" back="" onBack={onClose} center bordered />
      <div className="reorder-list" ref={listRef}>
        {draft.map((b, k) => {
          const ex = exercises.byId(b.exerciseId);
          const name = ex?.name ?? 'Unknown exercise';
          const lifted = drag?.from === k;
          return (
            <div key={b.id} className={`ro-row${lifted ? ' lift' : ''}${drag && !lifted ? ' anim' : ''}`}
              style={{ transform: lifted ? `translateY(${drag!.dy}px)` : shift(k) ? `translateY(${shift(k)}px)` : undefined }}>
              <button className="ro-remove" aria-label={`Remove ${name}`} onClick={() => setDraft((l) => l.filter((x) => x.id !== b.id))}><Minus aria-hidden="true" /></button>
              <ExerciseThumb exercise={ex} />
              <span className="ro-name ellipsis">{name}</span>
              <button className="ro-handle" aria-label={`Move ${name} (drag, or use the arrow keys)`} onPointerDown={(e) => start(e, k)} onKeyDown={(e) => keys(e, k)}>
                <Menu aria-hidden="true" />
              </button>
            </div>
          );
        })}
        {draft.length === 0 && <p className="muted ro-empty">No exercises. Done removes them all; ← keeps them.</p>}
      </div>
      <div className="reorder-foot">
        <button className="btn btn-primary btn-block" onClick={() => onDone(draft, opened.current)}>Done</button>
      </div>
    </div>,
    document.body,
  );
}
