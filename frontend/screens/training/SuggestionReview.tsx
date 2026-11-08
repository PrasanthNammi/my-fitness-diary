import { useSyncExternalStore } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import { InfoButton, Sheet, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { exerciseForSuggestion, exerciseName, exercises, suggestedExerciseId, suggestions } from '../../data/repositories';
import { ExerciseThumb } from './ExercisePicker';
import { findPrevious, trackingFields } from '../../domain/training';
import { acceptedCount, activeSuggestion, extraTargets, fits, isExpired, matchBlock, setType, type AiSuggestion } from '../../domain/aiSuggestions';
import { aiSource } from '../../domain/aiSource';
import type { ExerciseBlock } from '../../domain/types';
import { fmtNum, kgTo, mss } from '../../lib/format';

// One review sheet for the whole app (opened from a routine card, the workout or the AI hub).
let openId: string | null = null;
const listeners = new Set<() => void>();
export function openSuggestion(id: string | null) { openId = id; listeners.forEach((f) => f()); }
const useOpenId = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => openId);

const ago = (t: number) => { const d = Math.floor((Date.now() - t) / 86_400_000); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`; };
export const suggestionSource = (s: AiSuggestion) => aiSource(s.addedBy) ?? 'AI';

/** "AI suggestions · ChatGPT" on a routine card while that routine has a suggestion. */
export function SuggestionChip({ routineId }: { routineId: string }) {
  const list = useDB((d) => d.aiSuggestions), workouts = useDB((d) => d.workouts);
  const s = activeSuggestion(list, routineId, workouts);
  if (!s) return null;
  return <button type="button" className="ai-suggest-chip" onClick={(e) => { e.stopPropagation(); openSuggestion(s.id); }}><Sparkles aria-hidden="true" />AI suggestions · {suggestionSource(s)}</button>;
}

export function SuggestionHost() {
  const id = useOpenId();
  const list = useDB((d) => d.aiSuggestions);
  const s = id ? list.find((x) => x.id === id) : undefined;
  return s ? <Review s={s} /> : null;
}

function Review({ s }: { s: AiSuggestion }) {
  const all = useDB((d) => d.aiSuggestions), unit = useDB((d) => d.settings.weightUnit), active = useDB((d) => d.active), routines = useDB((d) => d.routines), workouts = useDB((d) => d.workouts);
  const routine = routines.find((r) => r.id === s.routineId);
  const running = active?.routineId === s.routineId ? active : null;
  const blocks: ExerciseBlock[] = running?.exercises ?? routine?.exercises ?? [];
  const expired = isExpired(s, workouts) || s.status === 'dismissed';
  const current = activeSuggestion(all, s.routineId, workouts)?.id === s.id;
  const close = () => openSuggestion(null);
  const allUsed = s.status === 'used' && (!s.usedExercises || s.exercises.every((x) => s.usedExercises!.some((n) => n.toLowerCase() === x.exercise.toLowerCase())));
  const live = !expired && current;
  const w = (kg: number | null | undefined) => (kg == null ? '–' : fmtNum(kgTo(kg, unit), 2));
  return (
    <Sheet open onClose={close} title={routine?.name ?? s.routineName ?? 'AI suggestions'} size="full" hideClose
      headerActions={<InfoButton title="AI suggestions" lines={[...(s.note ? [s.note] : []), 'Used targets appear as faded values. A set is saved only when you tick it.', 'Expires after this routine’s next workout or in 7 days.']} />}
      footer={live ? <>
        {!allUsed && <button className="btn btn-secondary" onClick={close}>Dismiss</button>}
        {allUsed
          ? <button className="btn btn-primary" onClick={close}>Done</button>
          : <button className="btn btn-primary" onClick={() => { suggestions.use(s.id); close(); toast(running ? 'Targets added' : 'Ready for your next workout'); }}>Use all</button>}
      </> : <button className="btn btn-secondary" onClick={close}>Dismiss</button>}>
      <div className="ai-review-meta">
        <span className="ai-suggest-meta"><Sparkles aria-hidden="true" />{suggestionSource(s)} · {ago(s.createdAt)}</span>
        <span className={`ai-review-count${s.status === 'used' && live ? ' on' : ''}`}>{!live ? 'Expired' : s.status === 'used' ? `${acceptedCount(s)} Accepted` : `${s.exercises.length} exercises`}</span>
      </div>
      <div className="ai-suggest-list">
        {s.exercises.map((ex) => {
          const block = matchBlock(blocks, ex, exerciseName, suggestedExerciseId), known = block ? undefined : exerciseForSuggestion(ex);
          const exercise = block ? exercises.byId(block.exerciseId) : known;
          const ok = block ? fits(block.tracking, ex.sets) : known ? fits(known.tracking, ex.sets) : false;
          const extra = running && block && ok ? extraTargets(block, ex.sets).length : 0;
          const used = s.status === 'used' && (!s.usedExercises || s.usedExercises.some((n) => n.toLowerCase() === ex.exercise.toLowerCase()));
          const weighted = trackingFields(exercise?.tracking ?? 'weight_reps')?.includes('weightKg');
          let work = 0; const count: Record<string, number> = {};
          const rows = ex.sets.map((t) => {
            const type = setType(t), n = count[type] ?? 0; count[type] = n + 1;
            const prev = exercise ? findPrevious(workouts, exercise.id, type, n) : null;
            const kg = t.kg ?? (weighted ? prev?.weightKg ?? null : null);
            return { label: type === 'warmup' ? 'W' : String(++work), type, prev, kg, reps: t.reps, time: t.duration_seconds };
          });
          const name = exercise?.name ?? ex.exercise;
          return (
            <section key={ex.exercise} className={`ai-suggest-ex${ok && block ? '' : ' off'}${used ? ' used' : ''}`}>
              <div className="ai-suggest-ex-head">
                <ExerciseThumb exercise={exercise} />
                <span className="ai-ex-name"><strong>{name}</strong>{ex.reason && <InfoButton title={name} lines={[ex.reason]} />}</span>
                {ok && live && block && <button type="button" className="ai-ex-toggle" aria-pressed={used} aria-label={used ? `Don’t use targets for ${name}` : `Use targets for ${name}`}
                  onClick={() => (used ? suggestions.unuse(s.id, ex.exercise) : suggestions.use(s.id, ex.exercise))}>{used ? <><Check aria-hidden="true" />Using</> : 'Use'}</button>}
                {!block && <span className="ai-ex-tag">Not in routine</span>}
              </div>
              {ok ? (
                <div className="ai-sets" role="table" aria-label={`${name}: last time and suggested`}>
                  <div className="ai-sets-head" role="row"><span role="columnheader">Set</span><span role="columnheader">Last</span><span aria-hidden="true" /><span role="columnheader">Suggested</span></div>
                  {rows.map((r, k) => {
                    const lastText = r.prev ? (r.time != null ? mss(r.prev.timeSec ?? 0) : `${weighted ? `${w(r.prev.weightKg)} × ` : ''}${r.prev.reps ?? '–'}`) : '—';
                    const kgUp = r.prev?.weightKg != null && r.kg != null && r.kg !== r.prev.weightKg, repsUp = r.prev?.reps != null && r.reps != null && r.reps !== r.prev.reps;
                    return (
                      <div key={k} className="ai-sets-row" role="row">
                        <span role="cell" className={`ai-set-label ${r.type}`}>{r.label}</span>
                        <span role="cell" className="ai-set-last tnum">{lastText}</span>
                        <span aria-hidden="true" className="ai-set-arrow">→</span>
                        <span role="cell" className="ai-set-new tnum">{r.time != null ? <b>{mss(r.time)}</b> : weighted && r.kg != null ? <><b className={kgUp ? 'chg' : ''}>{w(r.kg)}</b> × <b className={repsUp ? 'chg' : ''}>{r.reps ?? '–'}</b></> : <><b className={repsUp ? 'chg' : ''}>{r.reps ?? '–'}</b> reps</>}</span>
                      </div>
                    );
                  })}
                  {weighted && <span className="ai-sets-unit">{unit}</span>}
                </div>
              ) : <p className="cant">{block ? 'Tracked differently in this routine' : 'Not in the exercise list'}</p>}
              {live && (extra > 0 || (!block && running && known)) && (
                <div className="ai-suggest-actions">
                  {extra > 0 && <button className="btn-link" onClick={() => { suggestions.addSets(s.id, ex.exercise); toast(`${extra} set${extra === 1 ? '' : 's'} added`); }}><Plus aria-hidden="true" />{extra} set{extra === 1 ? '' : 's'}</button>}
                  {!block && running && known && ok && <button className="btn-link" onClick={() => { if (suggestions.addExercise(s.id, ex.exercise)) toast(`${known.name} added`); }}><Plus aria-hidden="true" />Add to workout</button>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
