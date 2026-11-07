import {WorkoutClock} from './WorkoutClock';
import { prepareActiveBlock, replaceExerciseBlock } from '../../domain/training';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Dumbbell, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ExerciseBlock, RestTimer, Workout } from '../../domain/types';
import { countSets, pauseTimer, resetTimer, startTimer, workingVolume } from '../../domain/training';
import { ConfirmSheet, Empty, Field, InfoButton, Notice, Sheet, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { routineFromWorkout, training, workouts } from '../../data/repositories';
import { duration, fmtVolume } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { goBack, navigate } from '../../lib/router';
import { ExerciseBlockView } from './ExerciseBlockView';
import { ExercisePicker } from './ExercisePicker';
import {
  FolderChoice, folderNameError, joinSuperset, leaveSuperset, moveBlock, resolveFolderChoice, SupersetSheet, supersetLetters,
  type FolderChoiceValue,
} from './common';

export function ActiveWorkoutScreen() {
  const a = useDB((d) => d.active);
  const history = useDB((d) => d.workouts);
  const folders = useDB((d) => d.folders);
  const weightUnit = useDB((d) => d.settings.weightUnit);
  const now = useNow(1000, !!a);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [ssFor, setSsFor] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [saved, setSaved] = useState<Workout | null>(null);

  const letters = useMemo(() => supersetLetters(a?.exercises ?? []), [a?.exercises]);

  if (saved) return <SaveAsRoutine workout={saved} folders={folders} />;

  if (!a) {
    return (
      <div className="screen" style={{ paddingTop: 40 }}>
        <Empty icon={Dumbbell} title="No workout in progress" action={<button className="btn btn-primary" onClick={() => navigate('/training', { replace: true })}>Go to Training</button>} />
      </div>
    );
  }

  const setBlocks = (fn: (l: ExerciseBlock[]) => ExerciseBlock[]) =>
    workouts.mutate((w) => {
      w.exercises = fn(w.exercises).map(prepareActiveBlock);
      for (const b of w.exercises) if (!w.timers[b.id]) w.timers[b.id] = { durationSec: b.restSec, endsAt: null, pausedRemainingSec: null };
    });

  const onTimer = (blockId: string, action: 'start' | 'pause' | 'reset' | 'duration', sec?: number) =>
    workouts.mutate((w) => {
      const b = w.exercises.find((x) => x.id === blockId);
      if (!b) return;
      const t: RestTimer = w.timers[blockId] ?? { durationSec: b.restSec, endsAt: null, pausedRemainingSec: null };
      const n = Date.now();
      if (action === 'start') w.timers[blockId] = startTimer({ ...t, durationSec: b.restSec }, n, t.pausedRemainingSec ?? undefined);
      if (action === 'pause') w.timers[blockId] = pauseTimer(t, n);
      if (action === 'reset') w.timers[blockId] = resetTimer({ ...t, durationSec: b.restSec });
      if (action === 'duration' && sec !== undefined) {
        const delta = sec - t.durationSec;
        const next = { ...t, durationSec: sec };
        if (t.endsAt !== null && t.endsAt > n) next.endsAt = t.endsAt + delta * 1000;
        if (t.pausedRemainingSec !== null) next.pausedRemainingSec = Math.max(0, t.pausedRemainingSec + delta);
        w.timers[blockId] = next;
      }
    });

  const elapsed = Math.floor((now - a.startedAt) / 1000);
  const done = countSets(a.exercises, true);
  const total = countSets(a.exercises);

  return (
    <>
      <header className="topbar bordered wo-top">
        <button className="icon-btn" aria-label="Minimise workout" onClick={() => goBack('/training')}><ChevronDown /></button>
        <button className="wo-title" onClick={() => setRenameOpen(true)} aria-label={`Workout title: ${a.title}. Rename`}>
          <span className="ellipsis">{a.title}</span>
          <Pencil aria-hidden="true" />
        </button>
        <WorkoutClock />
        <button className="btn btn-primary btn-sm wo-finish" onClick={() => setFinishOpen(true)}>Finish</button>
      </header>
      <div className="screen wo-screen">
        <div className="wo-summary" aria-label="Workout summary">
          <div><div className="k">Duration</div><div className="v accent-text">{duration(elapsed)}</div></div>
          <div><div className="k">Volume</div><div className="v">{volumeParts(fmtVolume(workingVolume(a.exercises), weightUnit))}</div></div>
          <div><div className="k">Sets</div><div className="v">{done}<span className="muted">/{total}</span></div></div>
          <InfoButton title="Logging sets" label="How logging works" lines={[
            'Faded numbers are suggestions from last time. Type to change them, or tap ✓ to log them as they are.',
            'Tap a set number to change its type (warm-up, drop, failure) or add RPE. Tap Previous to copy last time.',
            'Only sets with ✓ are saved when you finish.',
            'A workout ends by itself after 200 minutes.',
          ]} />
        </div>

        {a.exercises.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Empty icon={Dumbbell} title="Get started">Add an exercise to start logging sets.</Empty>
          </div>
        ) : (
          a.exercises.map((b, i) => (
            <ExerciseBlockView
              key={b.id}
              mode="active"
              block={b}
              index={i}
              count={a.exercises.length}
              supersetLetter={b.supersetId ? letters[b.supersetId] ?? null : null}
              weightUnit={weightUnit}
              history={history}
              timer={a.timers[b.id]}
              now={now}
              onChange={(nb) => setBlocks((l) => l.map((x) => (x.id === nb.id ? nb : x)))}
              onReplace={() => setReplaceId(b.id)}
              onRemove={() => setBlocks((l) => leaveSuperset(l, b.id).filter((x) => x.id !== b.id))}
              onMove={(dir) => setBlocks((l) => moveBlock(l, i, dir))}
              onSuperset={() => setSsFor(b.id)}
              onUnsuperset={() => setBlocks((l) => leaveSuperset(l, b.id))}
              onToggleDone={(setId) => workouts.toggleDone(b.id, setId)}
              onTimer={(action, sec) => onTimer(b.id, action, sec)}
            />
          ))
        )}

        <div className="wo-actions">
          <button className="btn btn-primary btn-block" onClick={() => setPickerOpen(true)}><Plus aria-hidden="true" /> Add exercise</button>
          <button className="btn btn-danger-soft btn-block" onClick={() => setConfirmDiscard(true)}><Trash2 aria-hidden="true" /> Discard workout</button>
        </div>
      </div>

      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={(b) => setBlocks((l) => [...l, b])} />
      {replaceId && <ExercisePicker key={replaceId} open onClose={() => setReplaceId(null)} replace initialSets={Math.max(1, a.exercises.find(x => x.id === replaceId)?.sets.filter(s => !s.done).length ?? 3)} onAdd={b => {
        workouts.mutate(w => { w.exercises = replaceExerciseBlock(w.exercises, replaceId, prepareActiveBlock(b), true); delete w.timers[replaceId]; for (const x of w.exercises) if (!w.timers[x.id]) w.timers[x.id] = { durationSec: x.restSec, endsAt: null, pausedRemainingSec: null }; });
        setReplaceId(null); toast('Exercise replaced');
      }} />}
      <SupersetSheet open={!!ssFor} onClose={() => setSsFor(null)} list={a.exercises} forId={ssFor} onPick={(o) => ssFor && setBlocks((l) => joinSuperset(l, ssFor, o))} />
      <ConfirmSheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard workout?"
        body="All sets logged in this workout will be lost."
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          workouts.discard();
          toast('Workout discarded');
          navigate('/training', { replace: true });
        }}
      />
      <RenameSheet open={renameOpen} onClose={() => setRenameOpen(false)} value={a.title} onSave={(t) => workouts.mutate((w) => void (w.title = t))} />
      <FinishSheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        done={done}
        total={total}
        onFinish={() => {
          const w = workouts.finish();
          if (!w) return;
          if (a.routineId === null) setSaved(w);
          else {
            toast('Workout saved');
            navigate(`/progress/session/${w.id}`, { replace: true });
          }
        }}
      />
    </>
  );
}

function FinishSheet({ open, onClose, done, total, onFinish }: { open: boolean; onClose: () => void; done: number; total: number; onFinish: () => void }) {
  const none = done === 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={none ? 'No completed sets' : 'Finish workout?'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Keep going</button>
          {!none && <button className="btn btn-primary" data-autofocus onClick={() => (onClose(), onFinish())}>Finish</button>}
        </>
      }
    >
      {none ? (
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>Tick off at least one set to save this workout, or discard it.</p>
      ) : done < total ? (
        <Notice tone="warn">{total - done} unfinished {total - done === 1 ? 'set' : 'sets'} won’t be saved.</Notice>
      ) : (
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>All {total} sets are complete.</p>
      )}
    </Sheet>
  );
}

function RenameSheet({ open, onClose, value, onSave, title = 'Workout title' }: { open: boolean; onClose: () => void; value: string; onSave: (v: string) => void; title?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => void (open && setV(value)), [open, value]);
  const err = !v.trim() ? 'Enter a title.' : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!!err} onClick={() => (onSave(v.trim()), onClose())}>Save</button>
        </>
      }
    >
      <input className="input" aria-label={title} value={v} maxLength={60} onChange={(e) => setV(e.target.value)} data-autofocus onKeyDown={(e) => e.key === 'Enter' && !err && (onSave(v.trim()), onClose())} />
    </Sheet>
  );
}
export { RenameSheet };

/** After an unplanned workout: offer to keep it as a routine. */
function SaveAsRoutine({ workout, folders }: { workout: Workout; folders: import('../../domain/types').Folder[] }) {
  const [name, setName] = useState(workout.title === 'Workout' ? '' : workout.title);
  const [folder, setFolder] = useState<FolderChoiceValue>({ kind: 'none' });
  const [tried, setTried] = useState(false);
  const nameErr = !name.trim() ? 'Enter a routine name.' : null;
  const folderErr = folder.kind === 'new' ? folderNameError(folder.name, folders) : null;
  const goSummary = () => navigate(`/progress/session/${workout.id}`, { replace: true });
  return (
    <Sheet
      open
      onClose={goSummary}
      title="Workout saved"
      footer={
        <>
          <button className="btn btn-secondary" onClick={goSummary}>Not now</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setTried(true);
              if (nameErr || folderErr) return;
              training.saveRoutine(routineFromWorkout(workout, name, resolveFolderChoice(folder)));
              toast('Saved as routine');
              goSummary();
            }}
          >
            Save routine
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Save this workout as a routine to repeat it later?</p>
        <Field label="Routine name" htmlFor="sr-name" error={tried ? nameErr : null}>
          <input id="sr-name" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!nameErr} />
        </Field>
        <FolderChoice value={folder} onChange={setFolder} folders={folders} error={tried ? folderErr : null} />
      </div>
    </Sheet>
  );
}

/** "12,450 kg" as a number with a smaller unit, so the stat card stays on one line. */
function volumeParts(text: string) {
  const i = text.lastIndexOf(' ');
  return i < 0 ? text : <>{text.slice(0, i)}<span className="u">{text.slice(i)}</span></>;
}
