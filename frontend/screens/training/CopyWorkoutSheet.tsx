import { useState } from 'react';
import { FolderPlus, Play } from 'lucide-react';
import type { Exercise, Workout } from '../../domain/types';
import { Field, Sheet, toast } from '../../components/ui';
import { update, useDB } from '../../data/store';
import { routineFromWorkout, training, workouts } from '../../data/repositories';
import { navigate } from '../../lib/router';
import { FolderChoice, folderNameError, resolveFolderChoice, type FolderChoiceValue } from './common';

type Step = 'choose' | 'save' | 'replace';

/**
 * Copy a finished workout (your own from History, or a friend's from the feed):
 * save it as a routine in a folder of your choice, or start a workout with it right away.
 * `extraExercises` are exercises the copy needs that may not be in your catalogue yet (a friend's custom ones).
 */
export function CopyWorkoutSheet({ workout, extraExercises = [], onClose }: { workout: Workout | null; extraExercises?: Exercise[]; onClose: () => void }) {
  const folders = useDB((d) => d.folders);
  const active = useDB((d) => d.active);
  const [step, setStep] = useState<Step>('choose');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState<FolderChoiceValue>({ kind: 'none' });
  const [tried, setTried] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (workout && shownFor !== workout.id) {
    setShownFor(workout.id); setStep('choose'); setName(workout.title === 'Workout' ? '' : workout.title); setFolder({ kind: 'none' }); setTried(false);
  }
  if (!workout) return null;

  const addExercises = () => {
    if (!extraExercises.length) return;
    update((d) => { for (const e of extraExercises) if (!d.customExercises.some((x) => x.id === e.id)) d.customExercises.push(e); });
  };
  const close = () => { setShownFor(null); onClose(); };
  const nameErr = !name.trim() ? 'Enter a routine name.' : null;
  const folderErr = folder.kind === 'new' ? folderNameError(folder.name, folders) : null;
  const save = () => {
    setTried(true);
    if (nameErr || folderErr) return;
    addExercises();
    const folderId = resolveFolderChoice(folder);
    training.saveRoutine(routineFromWorkout(workout, name, folderId));
    const where = folderId ? folders.find((f) => f.id === folderId)?.name ?? (folder.kind === 'new' ? folder.name.trim() : null) : null;
    toast(where ? `Saved to ${where}` : 'Saved as routine');
    close();
  };
  const start = (replace: boolean) => {
    if (active && !replace) return setStep('replace');
    if (active) workouts.discard();
    addExercises();
    workouts.startFrom(workout);
    close();
    navigate('/workout');
  };

  const title = step === 'save' ? 'Save as routine' : step === 'replace' ? 'Workout in progress' : 'Copy workout';
  const footer = step === 'save' ? (
    <>
      <button className="btn btn-secondary" onClick={() => setStep('choose')}>Back</button>
      <button className="btn btn-primary" onClick={save}>Save routine</button>
    </>
  ) : step === 'replace' ? (
    <>
      <button className="btn btn-danger" onClick={() => start(true)}>Discard & start</button>
      <button className="btn btn-primary" data-autofocus onClick={() => setStep('choose')}>Keep current</button>
    </>
  ) : undefined;

  return (
    <Sheet open onClose={close} title={title} footer={footer} label="Copy workout">
      {step === 'choose' && (
        <div className="option-list copy-choices">
          <button className="option copy-choice" onClick={() => setStep('save')}>
            <span className="copy-choice-icon"><FolderPlus aria-hidden="true" /></span>
            <span className="copy-choice-text"><span className="strong">Save as routine</span><span className="small muted">Pick a folder or make a new one</span></span>
          </button>
          <button className="option copy-choice" onClick={() => start(false)}>
            <span className="copy-choice-icon"><Play aria-hidden="true" /></span>
            <span className="copy-choice-text"><span className="strong">Start workout now</span><span className="small muted">Same exercises and sets</span></span>
          </button>
        </div>
      )}
      {step === 'save' && (
        <div className="stack">
          <Field label="Routine name" htmlFor="copy-name" error={tried ? nameErr : null}>
            <input id="copy-name" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!nameErr} />
          </Field>
          <FolderChoice value={folder} onChange={setFolder} folders={folders} error={tried ? folderErr : null} />
        </div>
      )}
      {step === 'replace' && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>“{active?.title}” is still running. Discard it and start this one?</p>
      )}
    </Sheet>
  );
}
