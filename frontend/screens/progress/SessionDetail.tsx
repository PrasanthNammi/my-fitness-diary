import { useState } from 'react';
import { ClipboardList, Pencil, Trash2 } from 'lucide-react';
import { setLabels, trackingFields, workingVolume } from '../../domain/training';
import { ConfirmSheet, Empty, OverflowMenu, TopBar, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { exerciseName, exercises, workouts as workoutRepo } from '../../data/repositories';
import { ExerciseThumb } from '../training/ExercisePicker';
import { volumeParts } from '../training/ActiveWorkout';
import { duration, fmtNum, fmtVolume, kgTo, longDate, mss } from '../../lib/format';
import { navigate } from '../../lib/router';

/** One finished workout from history: totals and every logged set, with Edit and Delete. */
export function SessionDetail({ id }: { id: string }) {
  const w = useDB((d) => d.workouts.find((x) => x.id === id));
  const unit = useDB((d) => d.settings.weightUnit);
  const [del, setDel] = useState(false);
  if (!w) {
    return (
      <>
        <TopBar title="Workout" back="/training/history" />
        <div className="screen"><Empty icon={ClipboardList} title="Workout not found">It may have been deleted.</Empty></div>
      </>
    );
  }
  const sets = w.exercises.reduce((n, b) => n + b.sets.length, 0);
  return (
    <>
      <TopBar title={w.title} back="/training/history" bordered actions={<>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/training/history/${w.id}/edit`)}><Pencil /> Edit</button>
        <OverflowMenu title={w.title} actions={[{ label: 'Edit workout', icon: Pencil, onSelect: () => navigate(`/training/history/${w.id}/edit`) }, { label: 'Delete workout', icon: Trash2, danger: true, onSelect: () => setDel(true) }]} />
      </>} />
      <div className="screen">
        <p className="small muted" style={{ margin: '10px 0 6px' }}>{longDate(w.startedAt)}</p>
        <div className="wo-summary three">
          <div><div className="k">Duration</div><div className="v">{duration((w.endedAt - w.startedAt) / 1000)}</div></div>
          <div><div className="k">Volume</div><div className="v">{volumeParts(fmtVolume(workingVolume(w.exercises), unit))}</div></div>
          <div><div className="k">Sets</div><div className="v">{sets}</div></div>
        </div>
        {w.exercises.map((b) => {
          const labels = setLabels(b.sets);
          return (
            <section key={b.id} className="ex-block" aria-label={exerciseName(b.exerciseId)}>
              <div className="session-ex-head"><ExerciseThumb exercise={exercises.byId(b.exerciseId)} /><span className="ex-name">{exerciseName(b.exerciseId)}</span></div>
              {b.note && <p className="small muted" style={{ margin: '0 0 4px' }}>{b.note}</p>}
              {b.sets.map((s, i) => (
                <div key={s.id} className="row tnum" style={{ minHeight: 28, fontSize: 14 }}>
                  <span className={`set-label ${s.type}`} style={{ width: 28, height: 24 }}>{labels[i]}</span>
                  <span>
                    {trackingFields(b.tracking)
                      .map((f) => {
                        const v = s[f];
                        if (v == null) return null;
                        if (f === 'weightKg') return `${fmtNum(kgTo(v, unit), 2)} ${unit}`;
                        if (f === 'reps') return `${v} reps`;
                        if (f === 'timeSec') return mss(v);
                        return `${fmtNum(v, 2)} km`;
                      })
                      .filter(Boolean)
                      .join(b.tracking === 'weight_reps' ? ' × ' : ' · ')}
                    {s.rpe !== null && <span className="muted"> @ RPE {s.rpe}</span>}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <ConfirmSheet open={del} onClose={() => setDel(false)} title="Delete this workout?" body="It will be removed from your history and progress charts." confirmLabel="Delete" danger onConfirm={() => {
        workoutRepo.deleteWorkout(w.id);
        toast('Workout deleted');
        navigate('/training/history', { replace: true });
      }} />
    </>
  );
}
