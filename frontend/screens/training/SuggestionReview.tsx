import { useSyncExternalStore } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { InfoButton, Sheet, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { exerciseForSuggestion, exerciseName, suggestedExerciseId, suggestions } from '../../data/repositories';
import { activeSuggestion, extraTargets, fits, isExpired, matchBlock, type AiSuggestion, type TargetSet } from '../../domain/aiSuggestions';
import { aiSource } from '../../domain/aiSource';
import type { ExerciseBlock, Workout } from '../../domain/types';
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
  const fmt = (t: TargetSet) => t.kg != null ? `${fmtNum(kgTo(t.kg, unit), 2)} ${unit}${t.reps != null ? ` × ${t.reps}` : ''}`
    : t.reps != null ? `${t.reps} reps` : t.duration_seconds != null ? mss(t.duration_seconds) : t.distance_meters != null ? `${fmtNum(t.distance_meters / 1000, 2)} km` : '—';
  const close = () => openSuggestion(null);
  const status = expired || !current ? 'Expired' : s.status === 'used' ? 'Accepted' : 'Review';
  return (
    <Sheet open onClose={close} title="AI suggestions" size="full"
      headerActions={<InfoButton title="AI workout suggestions" lines={['Use only fills the faded values. A set is saved when you tick it.', 'Ticked sets and numbers you typed are never changed.', 'A newer suggestion replaces this one. Suggestions expire after the next workout of this routine or after 7 days.']} />}
      footer={!expired && current ? <>
        <button className="btn btn-secondary" onClick={() => { suggestions.dismiss(s.id); close(); toast('Suggestion dismissed'); }}>Dismiss</button>
        <button className="btn btn-primary" onClick={() => { suggestions.use(s.id); close(); toast(running ? 'Targets added as faded values' : 'Ready for your next workout'); }}>Use all</button>
      </> : undefined}>
      <p className="ai-suggest-meta"><Sparkles aria-hidden="true" />{suggestionSource(s)} · {ago(s.createdAt)} · {status}</p>
      <p className="ai-suggest-routine">{routine?.name ?? s.routineName ?? 'Routine'}</p>
      {s.note && <p className="ai-suggest-note">{s.note}</p>}
      <div className="ai-suggest-list">
        {s.exercises.map((ex) => {
          const block = matchBlock(blocks, ex, exerciseName, suggestedExerciseId), known = block ? undefined : exerciseForSuggestion(ex);
          const ok = block ? fits(block.tracking, ex.sets) : known ? fits(known.tracking, ex.sets) : false;
          const extra = running && block && ok ? extraTargets(block, ex.sets).length : 0;
          const last = lastWorking(workouts, block?.exerciseId ?? known?.id);
          return (
            <section key={ex.exercise} className="ai-suggest-ex">
              <div className="ai-suggest-ex-head"><strong className="ellipsis">{block ? exerciseName(block.exerciseId) : ex.exercise}</strong>{ex.reason && <InfoButton title={ex.exercise} lines={[ex.reason]} />}</div>
              <p className="last tnum">Last · {last.length ? last.map((x) => x.weightKg != null ? `${fmtNum(kgTo(x.weightKg, unit), 2)}${x.reps != null ? ` × ${x.reps}` : ''}` : x.reps != null ? `${x.reps} reps` : x.timeSec != null ? mss(x.timeSec) : '—').join(' · ') : '—'}</p>
              <p className="target tnum">→ {ex.sets.map(fmt).join(' · ')}</p>
              {!ok ? <p className="cant">{block || known ? 'Can’t apply to how this exercise is tracked' : 'Not in this routine'}</p>
                : !expired && current && <div className="ai-suggest-actions">
                  {block && (<button className="btn btn-soft btn-sm" onClick={() => { suggestions.use(s.id, ex.exercise); toast(running ? `${ex.exercise}: targets added` : `${ex.exercise}: ready for your next workout`); }}>Use for this exercise</button>)}
                  {extra > 0 && <button className="btn btn-secondary btn-sm" onClick={() => { suggestions.addSets(s.id, ex.exercise); toast(`${extra} set${extra === 1 ? '' : 's'} added`); }}><Plus aria-hidden="true" />Add {extra} set{extra === 1 ? '' : 's'}</button>}
                  {!block && running && known && <button className="btn btn-secondary btn-sm" onClick={() => { if (suggestions.addExercise(s.id, ex.exercise)) toast(`${known.name} added`); }}><Plus aria-hidden="true" />Add exercise</button>}
                </div>}
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Working sets of the most recent workout with this exercise. */
function lastWorking(workouts: Workout[], exerciseId?: string) {
  if (!exerciseId) return [];
  const w = [...workouts].sort((a, b) => b.endedAt - a.endedAt).find((x) => x.exercises.some((b) => b.exerciseId === exerciseId));
  return w?.exercises.find((b) => b.exerciseId === exerciseId)?.sets.filter((x) => x.done && x.type !== 'warmup') ?? [];
}
