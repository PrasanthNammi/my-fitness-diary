import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ClipboardList, Dumbbell, Folder as FolderIcon, FolderInput, FolderPlus, Pencil, Play, Plus, SquarePen, Trash2, Type } from 'lucide-react';
import type { Folder, Routine } from '../../domain/types';
import { AiBadge, ConfirmSheet, Empty, OverflowMenu, Segmented, Sheet, TabChips, TopBar, toast, Field } from '../../components/ui';
import { useDB } from '../../data/store';
import { exerciseName, exercises, training, workouts } from '../../data/repositories';
import { countSets, workingVolume } from '../../domain/training';
import { duration, fmtVolume } from '../../lib/format';
import { ExerciseThumb } from './ExercisePicker';
import { navigate } from '../../lib/router';
import { blockSummary, FolderChoice, folderNameError, resolveFolderChoice, type FolderChoiceValue } from './common';
import { RenameSheet } from './ActiveWorkout';

export function TrainingHome({ tab = 'routines' }: { tab?: 'routines' | 'history' }) {
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
      <TopBar title="Training" />
      <div className="screen training-home">
        <TabChips label="Training view" value={tab} onChange={(v) => navigate(v === 'history' ? '/training/history' : '/training', { replace: true })}
          options={[{ value: 'routines', label: 'Routines' }, { value: 'history', label: 'History' }]} />

        {tab === 'history' ? <WorkoutHistory onStart={() => start(null)} /> : <>
          <button className="start-hero" onClick={() => start(null)}>
            <span className="start-hero-icon"><Play aria-hidden="true" /></span>
            <span className="start-hero-label">Start empty workout</span>
          </button>
          <div className="training-actions">
            <button className="btn btn-soft" onClick={() => navigate('/training/routine/new/root')}><Plus aria-hidden="true" />New routine</button>
            <button className="btn btn-soft" onClick={() => setFolderSheet({ mode: 'create' })}><FolderPlus aria-hidden="true" />New folder</button>
          </div>

          {folders.map((f) => {
            const inFolder = routines.filter((r) => r.folderId === f.id);
            const expanded = !f.collapsed;
            return (
              <section key={f.id} className="folder-section">
                <div className="folder-row">
                  <button className="folder-toggle" aria-expanded={expanded} onClick={() => training.toggleFolder(f.id)}>
                    <FolderIcon className="folder-icon" aria-hidden="true" />
                    <span className="folder-name ellipsis">{f.name}</span>
                    <span className="count-chip">{inFolder.length}</span>
                    <ChevronDown className={`chev${expanded ? '' : ' closed'}`} aria-hidden="true" />
                  </button>
                  <OverflowMenu
                    small
                    title={f.name}
                    label={`Folder options for ${f.name}`}
                    actions={[
                      { label: 'New routine here', icon: Plus, onSelect: () => navigate(`/training/routine/new/${f.id}`) },
                      { label: 'Rename folder', icon: Pencil, onSelect: () => setFolderSheet({ mode: 'rename', folder: f }) },
                      { label: 'Delete folder', icon: Trash2, onSelect: () => setDeleteFolder(f), danger: true },
                    ]}
                  />
                </div>
                {expanded && (
                  <div className="routine-list">
                    {inFolder.map((r) => <RoutineCard key={r.id} r={r} folders={folders} onStart={() => start(r)} />)}
                    {inFolder.length === 0 && (
                      <button className="folder-empty" onClick={() => navigate(`/training/routine/new/${f.id}`)}><Plus aria-hidden="true" />Create routine</button>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {root.length > 0 && (
            <section className="folder-section">
              {folders.length > 0 && <div className="folder-row"><span className="folder-toggle static"><FolderIcon className="folder-icon" aria-hidden="true" /><span className="folder-name">Other routines</span><span className="count-chip">{root.length}</span></span></div>}
              <div className="routine-list">
                {root.map((r) => <RoutineCard key={r.id} r={r} folders={folders} onStart={() => start(r)} />)}
              </div>
            </section>
          )}

          {routines.length === 0 && folders.length === 0 && (
            <Empty icon={Dumbbell} title="No routines yet" action={<button className="btn btn-primary" onClick={() => navigate('/training/routine/new/root')}><Plus aria-hidden="true" />Create routine</button>} />
          )}
        </>}
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
  const preview = r.exercises.map((b) => exerciseName(b.exerciseId)).join(' · ');
  const thumbs = r.exercises.slice(0, 3);
  const view = () => navigate(`/training/routine/view/${r.id}`);
  return (
    <div className="card routine-card">
      <div className="routine-card-head">
        <button className="routine-open" aria-label={`View ${r.name}`} onClick={view}>
          {thumbs.length > 0 && <span className="thumb-stack" aria-hidden="true">{thumbs.map((b) => <ExerciseThumb key={b.id} exercise={exercises.byId(b.exerciseId)} />)}</span>}
          <span className="routine-card-text">
            <span className="name ellipsis">{r.name}</span>
            <span className="meta">{blockSummary(r.exercises)}<AiBadge addedBy={r.addedBy} /></span>
          </span>
        </button>
        <OverflowMenu
          small
          title={r.name}
          label={`Routine options for ${r.name}`}
          actions={[
            { label: 'Start workout', icon: Play, onSelect: onStart },
            { label: 'Edit routine', icon: SquarePen, onSelect: () => navigate(`/training/routine/edit/${r.id}`) },
            { label: 'Rename', icon: Type, onSelect: () => setRename(true) },
            { label: 'Move to folder', icon: FolderInput, onSelect: () => setMove(true) },
            { label: 'Delete routine', icon: Trash2, onSelect: () => setDel(true), danger: true },
          ]}
        />
      </div>
      {preview && <button className="routine-open preview" aria-label={`View exercises in ${r.name}`} onClick={view}>{preview}</button>}
      <button className="btn btn-dark btn-block routine-start" onClick={onStart}>
        <Play aria-hidden="true" /><span className="ellipsis">Start {r.name}</span>
      </button>
      <RenameSheet open={rename} onClose={() => setRename(false)} value={r.name} title="Rename routine" onSave={(v) => (training.renameRoutine(r.id, v), toast('Routine renamed'))} />
      <MoveSheet open={move} onClose={() => setMove(false)} routine={r} folders={folders} />
      <ConfirmSheet open={del} onClose={() => setDel(false)} title={`Delete “${r.name}”?`} body="Your workout history is kept." confirmLabel="Delete" danger onConfirm={() => (training.deleteRoutine(r.id), toast('Routine deleted'))} />
    </div>
  );
}

const HISTORY_PAGE = 30;
/** Finished workouts, newest first, grouped by month; shows 30 at a time so long histories stay fast. */
function WorkoutHistory({ onStart }: { onStart: () => void }) {
  const all = useDB((d) => d.workouts);
  const unit = useDB((d) => d.settings.weightUnit);
  const [shown, setShown] = useState(HISTORY_PAGE);
  const list = useMemo(() => [...all].sort((a, b) => b.startedAt - a.startedAt), [all]);
  if (!list.length) return <Empty icon={ClipboardList} title="No workouts yet" action={<button className="btn btn-primary" onClick={onStart}><Play aria-hidden="true" />Start a workout</button>} />;
  const monthOf = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const counts = new Map<string, number>();
  for (const w of list) counts.set(monthOf(w.startedAt), (counts.get(monthOf(w.startedAt)) ?? 0) + 1);
  let previous = '';
  return (
    <div className="history-list">
      {list.slice(0, shown).map((w) => {
        const month = monthOf(w.startedAt), head = month !== previous;
        previous = month;
        const sets = countSets(w.exercises, true);
        return (
          <div key={w.id}>
            {head && <div className="eyebrow history-month">{month} · {counts.get(month)} {counts.get(month) === 1 ? 'workout' : 'workouts'}</div>}
            <button className="card history-card" onClick={() => navigate(`/training/history/${w.id}`)}>
              <span className="history-card-top">
                <span className="name ellipsis">{w.title}</span>
                <span className="date">{new Date(w.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              </span>
              <span className="history-stats tnum">
                <span><b>{duration((w.endedAt - w.startedAt) / 1000)}</b></span>
                <span><b>{fmtVolume(workingVolume(w.exercises), unit)}</b></span>
                <span><b>{sets}</b> {sets === 1 ? 'set' : 'sets'}</span>
                <AiBadge addedBy={w.addedBy} />
              </span>
              <span className="history-exercises ellipsis">{w.exercises.map((b) => exerciseName(b.exerciseId)).join(' · ')}</span>
            </button>
          </div>
        );
      })}
      {shown < list.length && <button className="btn btn-soft btn-block" onClick={() => setShown((n) => n + HISTORY_PAGE)}>Show more</button>}
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
