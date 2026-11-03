import { useEffect, useState } from 'react';
import { ChevronDown, FolderInput, FolderPlus, Pencil, Play, Plus, SquarePen, Trash2, Type } from 'lucide-react';
import type { Folder, Routine } from '../../domain/types';
import { AiBadge, ConfirmSheet, OverflowMenu, Sheet, TopBar, toast, Field } from '../../components/ui';
import { useDB } from '../../data/store';
import { exerciseName, training, workouts } from '../../data/repositories';
import { navigate } from '../../lib/router';
import { blockSummary, FolderChoice, folderNameError, resolveFolderChoice, type FolderChoiceValue } from './common';
import { RenameSheet } from './ActiveWorkout';

export function TrainingHome() {
  const folders = useDB((d) => d.folders);
  const routines = useDB((d) => d.routines);
  const active = useDB((d) => d.active);
  const [folderSheet, setFolderSheet] = useState<{ mode: 'create' } | { mode: 'rename'; folder: Folder } | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<Folder | null>(null);
  const [pendingStart, setPendingStart] = useState<Routine | null | undefined>(undefined);

  const start = (r: Routine | null) => {
    if (active) return setPendingStart(r);
    workouts.start(r);
    navigate('/workout');
  };

  const root = routines.filter((r) => !r.folderId || !folders.some((f) => f.id === r.folderId));

  return (
    <>
      <TopBar title="Empty workout" />
      <div className="screen">
        <button className="btn btn-secondary btn-block" aria-label="Start empty workout" onClick={() => start(null)}>
          <Plus /> Start Empty Workout
        </button>

        <div className="section-title">
          <h2>Routines</h2>
          <button className="icon-btn" aria-label="New folder" onClick={() => setFolderSheet({ mode: 'create' })}>
            <FolderPlus />
          </button>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          {folders.map((f) => {
            const inFolder = routines.filter((r) => r.folderId === f.id);
            const expanded = !f.collapsed;
            return (
              <div key={f.id}>
                <div className="row" style={{ gap: 0 }}>
                  <button className="folder-head grow" aria-expanded={expanded} onClick={() => training.toggleFolder(f.id)}>
                    <ChevronDown className="chev" />
                    <span className="fname ellipsis">{f.name}</span>
                    <span className="small muted" style={{ flex: 'none' }}>({inFolder.length})</span>
                  </button>
                  <OverflowMenu
                    title={f.name}
                    label={`Folder options for ${f.name}`}
                    actions={[
                      { label: 'Rename folder', icon: Pencil, onSelect: () => setFolderSheet({ mode: 'rename', folder: f }) },
                      { label: 'Delete folder', icon: Trash2, onSelect: () => setDeleteFolder(f), danger: true },
                    ]}
                  />
                </div>
                {expanded && (
                  <div className="folder-body">
                    {inFolder.map((r) => <RoutineCard key={r.id} r={r} folders={folders} onStart={() => start(r)} />)}
                    <button className="btn btn-sm dashed-btn btn-block" onClick={() => navigate(`/training/routine/new/${f.id}`)}>
                      <Plus /> Create Routine
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {folders.length > 0 && root.length > 0 && <div className="label" style={{ marginTop: 6 }}>Other routines</div>}
          {root.map((r) => <RoutineCard key={r.id} r={r} folders={folders} onStart={() => start(r)} />)}

          {routines.length === 0 && folders.length === 0 && (
            <p className="small muted" style={{ margin: '0 0 4px' }}>Create a routine to plan workouts you repeat.</p>
          )}
          <button className="btn btn-secondary btn-block" onClick={() => navigate('/training/routine/new/root')}>
            <Plus /> Create Routine
          </button>
        </div>
      </div>

      <FolderNameSheet state={folderSheet} folders={folders} onClose={() => setFolderSheet(null)} />
      <DeleteFolderSheet folder={deleteFolder} count={deleteFolder ? routines.filter((r) => r.folderId === deleteFolder.id).length : 0} onClose={() => setDeleteFolder(null)} />
      <Sheet
        open={pendingStart !== undefined}
        onClose={() => setPendingStart(undefined)}
        title="Workout in progress"
        footer={
          <>
            <button
              className="btn btn-danger"
              onClick={() => {
                workouts.discard();
                workouts.start(pendingStart ?? null);
                setPendingStart(undefined);
                navigate('/workout');
              }}
            >
              Discard & start
            </button>
            <button className="btn btn-primary" data-autofocus onClick={() => (setPendingStart(undefined), navigate('/workout'))}>
              Resume
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          “{active?.title}” is still running. Resume it, or discard it and start a new one.
        </p>
      </Sheet>
    </>
  );
}

function RoutineCard({ r, folders, onStart }: { r: Routine; folders: Folder[]; onStart: () => void }) {
  const [rename, setRename] = useState(false);
  const [move, setMove] = useState(false);
  const [del, setDel] = useState(false);
  const preview = r.exercises.map((b) => exerciseName(b.exerciseId)).join(', ');
  return (
    <div className="card routine-card">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <button className="routine-open grow" aria-label={`View ${r.name}`} onClick={() => navigate(`/training/routine/view/${r.id}`)}>
          <div className="name ellipsis">{r.name}</div>
          <div className="meta">{blockSummary(r.exercises)}<AiBadge addedBy={r.addedBy} /></div>
        </button>
        <OverflowMenu
          small
          title={r.name}
          label={`Routine options for ${r.name}`}
          actions={[
            { label: 'Edit routine', icon: SquarePen, onSelect: () => navigate(`/training/routine/edit/${r.id}`) },
            { label: 'Rename', icon: Type, onSelect: () => setRename(true) },
            { label: 'Move to folder', icon: FolderInput, onSelect: () => setMove(true) },
            { label: 'Delete routine', icon: Trash2, onSelect: () => setDel(true), danger: true },
          ]}
        />
      </div>
      {preview && <button className="routine-open preview" aria-label={`View exercises in ${r.name}`} onClick={() => navigate(`/training/routine/view/${r.id}`)}>{preview}</button>}
      <button className="btn btn-primary btn-sm btn-block" style={{ marginTop: 10 }} onClick={onStart}>
        <Play /> Start Workout
      </button>
      <RenameSheet open={rename} onClose={() => setRename(false)} value={r.name} title="Rename routine" onSave={(v) => (training.renameRoutine(r.id, v), toast('Routine renamed'))} />
      <MoveSheet open={move} onClose={() => setMove(false)} routine={r} folders={folders} />
      <ConfirmSheet open={del} onClose={() => setDel(false)} title={`Delete “${r.name}”?`} body="Your workout history is kept." confirmLabel="Delete" danger onConfirm={() => (training.deleteRoutine(r.id), toast('Routine deleted'))} />
    </div>
  );
}

function MoveSheet({ open, onClose, routine, folders }: { open: boolean; onClose: () => void; routine: Routine; folders: Folder[] }) {
  const init = (): FolderChoiceValue => (routine.folderId ? { kind: 'folder', id: routine.folderId } : { kind: 'none' });
  const [v, setV] = useState<FolderChoiceValue>(init);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) (setV(init()), setTried(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = v.kind === 'new' ? folderNameError(v.name, folders) : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Move routine"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTried(true);
              if (err) return;
              training.moveRoutine(routine.id, resolveFolderChoice(v));
              toast('Routine moved');
              onClose();
            }}
          >
            Move
          </button>
        </>
      }
    >
      <FolderChoice value={v} onChange={setV} folders={folders} error={tried ? err : null} />
    </Sheet>
  );
}

function FolderNameSheet({ state, folders, onClose }: { state: { mode: 'create' } | { mode: 'rename'; folder: Folder } | null; folders: Folder[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (state) (setName(state.mode === 'rename' ? state.folder.name : ''), setTried(false));
  }, [state]);
  const err = folderNameError(name, folders, state?.mode === 'rename' ? state.folder.id : undefined);
  const submit = () => {
    setTried(true);
    if (err || !state) return;
    if (state.mode === 'create') (training.createFolder(name), toast('Folder created'));
    else (training.renameFolder(state.folder.id, name), toast('Folder renamed'));
    onClose();
  };
  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      title={state?.mode === 'rename' ? 'Rename folder' : 'New folder'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>{state?.mode === 'rename' ? 'Save' : 'Create'}</button>
        </>
      }
    >
      <Field label="Folder name" htmlFor="folder-name" error={tried ? err : null}>
        <input id="folder-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!err} data-autofocus onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </Field>
    </Sheet>
  );
}

function DeleteFolderSheet({ folder, count, onClose }: { folder: Folder | null; count: number; onClose: () => void }) {
  return (
    <Sheet
      open={!!folder}
      onClose={onClose}
      title={`Delete “${folder?.name ?? ''}”?`}
      footer={
        count === 0 ? (
          <>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" onClick={() => (folder && training.deleteFolder(folder.id, false), toast('Folder deleted'), onClose())}>Delete</button>
          </>
        ) : undefined
      }
    >
      {count === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>This folder is empty.</p>
      ) : (
        <div className="stack">
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>It contains {count} {count === 1 ? 'routine' : 'routines'}.</p>
          <button className="btn btn-secondary btn-block" onClick={() => (folder && training.deleteFolder(folder.id, false), toast('Folder deleted, routines kept'), onClose())}>
            Delete folder, keep routines
          </button>
          <button className="btn btn-danger btn-block" onClick={() => (folder && training.deleteFolder(folder.id, true), toast('Folder and routines deleted'), onClose())}>
            Delete folder and routines
          </button>
        </div>
      )}
    </Sheet>
  );
}
