import { useMemo, useState } from 'react';
import { ClipboardList, Dumbbell, Plus } from 'lucide-react';
import type { ExerciseBlock, Workout } from '../../domain/types';
import { loggedBlocks, replaceExerciseBlock } from '../../domain/training';
import { ConfirmSheet, Empty, Notice, TopBar, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { workouts as workoutRepo } from '../../data/repositories';
import { goBack, navigate } from '../../lib/router';
import { ExerciseBlockView } from '../training/ExerciseBlockView';
import { ExercisePicker } from '../training/ExercisePicker';
import { joinSuperset, leaveSuperset, moveBlock, SupersetSheet, supersetLetters } from '../training/common';

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeValue = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Manual edit of a finished workout from history: details, exercises and sets. */
export function WorkoutEditor({ id }: { id: string }) {
  const w = useDB((d) => d.workouts.find((x) => x.id === id));
  const weightUnit = useDB((d) => d.settings.weightUnit);
  const back = `/training/history/${id}`;

  const [title, setTitle] = useState(w?.title ?? '');
  const [date, setDate] = useState(w ? dateValue(w.startedAt) : '');
  const [time, setTime] = useState(w ? timeValue(w.startedAt) : '');
  const [minutes, setMinutes] = useState(w ? String(Math.max(1, Math.round((w.endedAt - w.startedAt) / 60000))) : '');
  const [blocks, setBlocks] = useState<ExerciseBlock[]>(() => structuredClone(w?.exercises ?? []));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [ssFor, setSsFor] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const letters = useMemo(() => supersetLetters(blocks), [blocks]);

  if (!w) {
    return (
      <>
        <TopBar title="Workout" back="/training/history" />
        <div className="screen"><Empty icon={ClipboardList} title="Workout not found">It may have been deleted.</Empty></div>
      </>
    );
  }

  const startedAt = new Date(`${date}T${time}`).getTime();
  const mins = Number(minutes);
  const logged = loggedBlocks(blocks);
  const errors = {
    title: !title.trim() ? 'Give the workout a title.' : null,
    when: !Number.isFinite(startedAt) ? 'Enter a valid date and time.' : startedAt > Date.now() ? 'A finished workout can’t start in the future.' : null,
    minutes: !Number.isInteger(mins) || mins < 1 || mins > 1440 ? 'Enter a duration between 1 and 1440 minutes.' : null,
    blocks: !logged.length ? 'Log at least one set.' : null,
  };
  const dirty =
    title !== w.title || date !== dateValue(w.startedAt) || time !== timeValue(w.startedAt) ||
    minutes !== String(Math.max(1, Math.round((w.endedAt - w.startedAt) / 60000))) ||
    JSON.stringify(blocks) !== JSON.stringify(w.exercises);

  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const next: Workout = { ...w, title: title.trim(), startedAt, endedAt: startedAt + mins * 60000, exercises: logged };
    workoutRepo.updateWorkout(next);
    toast('Workout saved');
    navigate(back, { replace: true });
  };
  const updateBlock = (i: number, b: ExerciseBlock) => setBlocks((l) => l.map((x, j) => (j === i ? b : x)));
  const err = (m: string | null) => tried && m && <div className="err" role="alert">{m}</div>;

  return (
    <>
      <TopBar
        title="Edit Workout"
        center
        bordered
        back={back}
        onBack={() => (dirty ? setConfirmLeave(true) : goBack(back))}
        actions={<button className="btn btn-primary btn-sm" onClick={save} style={{ marginRight: 4 }}>Save</button>}
      />
      <div className="screen">
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="wo-title">Workout title</label>
            <input id="wo-title" className="input" style={{ fontWeight: 600 }} value={title} maxLength={60} aria-invalid={tried && !!errors.title} onChange={(e) => setTitle(e.target.value)} />
            {err(errors.title)}
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="wo-date">Date</label>
              <input id="wo-date" className="input" type="date" value={date} max={dateValue(Date.now())} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="wo-time">Start time</label>
              <input id="wo-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          {err(errors.when)}
          <div className="field">
            <label htmlFor="wo-minutes">Duration (minutes)</label>
            <input id="wo-minutes" className="input" inputMode="numeric" value={minutes} aria-invalid={tried && !!errors.minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
            {err(errors.minutes)}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {blocks.length === 0 ? (
            <div style={{ marginTop: 12 }}><Empty icon={Dumbbell} title="No exercises">Add the exercises you did.</Empty></div>
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
        {tried && errors.blocks && <div style={{ marginTop: 8 }}><Notice tone="error">{errors.blocks}</Notice></div>}
        <p className="small muted" style={{ margin: '10px 0 0' }}>Sets left empty are not saved.</p>
        <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setPickerOpen(true)}>
          <Plus /> Add Exercise
        </button>
      </div>

      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} added={blocks.map((x) => x.exerciseId)} onAdd={(b) => setBlocks((l) => [...l, b])} />
      {replaceId && <ExercisePicker key={replaceId} open onClose={() => setReplaceId(null)} replace initialSets={Math.max(1, blocks.find((x) => x.id === replaceId)?.sets.length ?? 3)} onAdd={(b) => {
        setBlocks((l) => replaceExerciseBlock(l, replaceId, b, false));
        setReplaceId(null); toast('Exercise replaced');
      }} />}
      <SupersetSheet open={!!ssFor} onClose={() => setSsFor(null)} list={blocks} forId={ssFor} onPick={(other) => ssFor && setBlocks((l) => joinSuperset(l, ssFor, other))} />
      <ConfirmSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Discard changes?"
        body="Your edits to this workout won’t be saved."
        confirmLabel="Discard"
        danger
        onConfirm={() => goBack(back)}
      />
    </>
  );
}
