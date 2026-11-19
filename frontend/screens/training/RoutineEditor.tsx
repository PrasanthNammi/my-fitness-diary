import { replaceExerciseBlock } from '../../domain/training';
import {resolveExercise} from '../../catalogue/runtime';
import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Plus } from 'lucide-react';
import type { ExerciseBlock, Routine } from '../../domain/types';
import { ConfirmSheet, Empty, Notice, TopBar, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { training } from '../../data/repositories';
import { goBack, navigate } from '../../lib/router';
import { uid } from '../../lib/format';
import { ExerciseBlockView } from './ExerciseBlockView';
import { ExercisePicker } from './ExercisePicker';
import {
  FolderChoice, folderNameError, joinSuperset, leaveSuperset, moveBlock, resolveFolderChoice, SupersetSheet, supersetLetters,
  type FolderChoiceValue,
} from './common';

export function RoutineEditor({ routineId, folderId }: { routineId: string | null; folderId: string | null }) {
  const routines = useDB((d) => d.routines);
  const catalogue=useDB(d=>d.customExercises);
  const folders = useDB((d) => d.folders);
  const weightUnit = useDB((d) => d.settings.weightUnit);
  const existing = routineId ? routines.find((r) => r.id === routineId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [blocks, setBlocks] = useState<ExerciseBlock[]>(() => structuredClone(existing?.exercises ?? []));
  const [folder, setFolder] = useState<FolderChoiceValue>(() => {
    const fid = existing ? existing.folderId : folderId;
    return fid && folders.some((f) => f.id === fid) ? { kind: 'folder', id: fid } : { kind: 'none' };
  });
  useEffect(()=>{setBlocks(current=>{let changed=false;const next=current.map(b=>{const saved=existing?.exercises.find(x=>x.id===b.id);const resolved=b.exerciseId.startsWith('history:')?resolveExercise({exercise:decodeURIComponent(b.exerciseId.slice(8))}):saved?.exerciseId;if(resolved&&resolved!==b.exerciseId){changed=true;return {...b,exerciseId:resolved}}return b});return changed?next:current})},[catalogue]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [ssFor, setSsFor] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const letters = useMemo(() => supersetLetters(blocks), [blocks]);
  const nameErr = !name.trim() ? 'Give the routine a name.' : null;
  const folderErr = folder.kind === 'new' ? folderNameError(folder.name, folders) : null;
  const blocksErr = blocks.length === 0 ? 'Add at least one exercise.' : null;
  const dirty =
    name !== (existing?.name ?? '') ||
    JSON.stringify(blocks) !== JSON.stringify(existing?.exercises ?? []) ||
    (folder.kind === 'folder' ? folder.id : folder.kind === 'new' ? 'new' : null) !== (existing ? existing.folderId : folderId);

  if (routineId && !existing) {
    return (
      <>
        <TopBar title="Routine" back="/training" />
        <div className="screen"><Empty icon={Dumbbell} title="Routine not found">It may have been deleted.</Empty></div>
      </>
    );
  }

  const save = () => {
    setTried(true);
    if (nameErr || folderErr || blocksErr) return;
    const r: Routine = {
      id: existing?.id ?? uid(),
      name: name.trim(),
      folderId: resolveFolderChoice(folder),
      exercises: blocks,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    training.saveRoutine(r);
    toast(existing ? 'Routine saved' : 'Routine created');
    navigate('/training', { replace: true });
  };

  const updateBlock = (i: number, b: ExerciseBlock) => setBlocks((l) => l.map((x, j) => (j === i ? b : x)));

  return (
    <>
      <TopBar
        title={existing ? 'Edit Routine' : 'Create Routine'}
        center
        bordered
        back="/training"
        onBack={() => (dirty ? setConfirmLeave(true) : goBack('/training'))}
        actions={<button className="btn btn-primary btn-sm" onClick={save} style={{ marginRight: 4 }}>Save</button>}
      />
      <div className="screen">
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="routine-name">Routine title</label>
            <input
              id="routine-name"
              className="input"
              style={{ fontWeight: 600 }}
              value={name}
              maxLength={60}
              placeholder="e.g. Push Day"
              aria-invalid={tried && !!nameErr}
              onChange={(e) => setName(e.target.value)}
            />
            {tried && nameErr && <div className="err" role="alert">{nameErr}</div>}
          </div>
          <FolderChoice value={folder} onChange={setFolder} folders={folders} error={tried ? folderErr : null} />
        </div>

        <div style={{ marginTop: 12 }}>
          {blocks.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <Empty icon={Dumbbell} title="No exercises yet">Add exercises to build this routine.</Empty>
            </div>
          ) : (
            blocks.map((b, i) => (
              <ExerciseBlockView
                key={b.id}
                mode="editor"
                block={b}
                index={i}
                count={blocks.length}
                supersetLetter={b.supersetId ? letters[b.supersetId] ?? null : null}
                weightUnit={weightUnit}
                onChange={(nb) => updateBlock(i, nb)}
                onReplace={() => setReplaceId(b.id)}
              onRemove={() => setBlocks((l) => leaveSuperset(l, b.id).filter((x) => x.id !== b.id))}
                onMove={(dir) => setBlocks((l) => moveBlock(l, i, dir))}
                onSuperset={() => setSsFor(b.id)}
                onUnsuperset={() => setBlocks((l) => leaveSuperset(l, b.id))}
              />
            ))
          )}
        </div>
        {tried && blocksErr && <div style={{ marginTop: 8 }}><Notice tone="error">{blocksErr}</Notice></div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setPickerOpen(true)}>
          <Plus /> Add Exercise
        </button>
      </div>

      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} added={blocks.map((x) => x.exerciseId)} addedIn="routine" onAdd={(b) => setBlocks((l) => [...l, b])} />
      {replaceId && <ExercisePicker key={replaceId} open onClose={() => setReplaceId(null)} replace initialSets={Math.max(1, blocks.find(x => x.id === replaceId)?.sets.filter(s => !s.done).length ?? 3)} onAdd={b => {
        setBlocks(l => replaceExerciseBlock(l, replaceId, b, false));
        setReplaceId(null); toast('Exercise replaced');
      }} />}
      <SupersetSheet open={!!ssFor} onClose={() => setSsFor(null)} list={blocks} forId={ssFor} onPick={(other) => ssFor && setBlocks((l) => joinSuperset(l, ssFor, other))} />
      <ConfirmSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Discard changes?"
        body="Your edits to this routine won’t be saved."
        confirmLabel="Discard"
        danger
        onConfirm={() => goBack('/training')}
      />
    </>
  );
}
