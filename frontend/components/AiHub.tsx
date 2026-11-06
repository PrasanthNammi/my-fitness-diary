import { useState } from 'react';
import { Bot, Dumbbell, ExternalLink, Link2, ListChecks, Scale, Undo2, Utensils } from 'lucide-react';
import { useDB } from '../data/store';
import { entryNutrients } from '../data/selectors';
import { body, diary as diaryRepo, training, workouts as workoutRepo } from '../data/repositories';
import { aiAdded, aiAddedRecently, aiAgo, aiLastAdded, type AiAdded, type AiCandidate } from '../domain/aiActivity';
import { fmtEnergy, fmtWeight } from '../lib/format';
import { navigate } from '../lib/router';
import { ConfirmSheet, Sheet, toast } from './ui';

// The connector's own page: which assistants can use the diary, and removing their access.
const CONNECTIONS = 'https://mfd-connect.shanustylish777.workers.dev/oauth/mcp/connections';

/**
 * What ChatGPT and Claude did with the diary, from the "added by" mark on each entry: the last
 * 24 hours with Undo, and when each assistant last added something. Whether an assistant is still
 * connected is only known to the connector, so that lives on its page (Manage connections).
 */
export function AiHub({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useDB((d) => d.diary), sessions = useDB((d) => d.workouts), weights = useDB((d) => d.weights), routines = useDB((d) => d.routines);
  const settings = useDB((d) => d.settings);
  const [confirm, setConfirm] = useState<AiAdded | null>(null);
  const now = Date.now();
  const all = aiAdded([
    ...entries.map((e): AiCandidate => ({ id: e.id, kind: 'food', label: `${e.food.name} · ${fmtEnergy(entryNutrients(e).kcal, settings.energyUnit)}`, addedBy: e.addedBy })),
    ...sessions.map((w): AiCandidate => ({ id: w.id, kind: 'workout', label: w.title, addedBy: w.addedBy })),
    ...weights.map((w): AiCandidate => ({ id: w.id, kind: 'weight', label: `Weight · ${fmtWeight(w.kg, settings.weightUnit)}`, addedBy: w.addedBy })),
    ...routines.map((r): AiCandidate => ({ id: r.id, kind: 'routine', label: `Routine · ${r.name}`, addedBy: r.addedBy })),
  ]);
  const recent = aiAddedRecently(all, now);
  const last = (name: string) => aiLastAdded(all, name);
  const Icon = { food: Utensils, workout: Dumbbell, weight: Scale, routine: ListChecks };
  const undo = (a: AiAdded) => {
    if (a.kind === 'food') diaryRepo.remove(a.id);
    else if (a.kind === 'workout') workoutRepo.deleteWorkout(a.id);
    else if (a.kind === 'weight') body.deleteWeight(a.id);
    else training.deleteRoutine(a.id);
    toast(`Removed what ${a.by} added`);
  };
  return (
    <>
      {/* One sheet at a time: the hub steps aside while an Undo is confirmed, then comes back. */}
      <Sheet open={open && !confirm} onClose={onClose} title="AI assistants" label="AI assistants">
        <div className="ai-hub">
          <div className="ai-hub-apps">
            {['ChatGPT', 'Claude'].map((name) => {
              const t = last(name);
              return (
                <div key={name} className="ai-hub-app">
                  <Bot aria-hidden="true" />
                  <strong>{name}</strong>
                  <span>{t ? `Last added ${aiAgo(t, now)}` : 'Nothing added yet'}</span>
                </div>
              );
            })}
          </div>
          <div className="eyebrow">Added in the last 24 hours</div>
          {recent.length ? (
            <ul className="ai-hub-list">
              {recent.map((a) => {
                const I = Icon[a.kind];
                return (
                  <li key={a.kind + a.id}>
                    <I aria-hidden="true" />
                    <span className="grow"><span className="row-title ellipsis">{a.label}</span><span className="row-sub">{a.by} · {aiAgo(a.at, now)}</span></span>
                    <button className="btn btn-soft btn-sm" onClick={() => setConfirm(a)}><Undo2 aria-hidden="true" />Undo</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="small muted ai-hub-empty">Nothing from ChatGPT or Claude today.</p>
          )}
          <button className="btn btn-primary btn-block" onClick={() => { onClose(); navigate('/coach'); }}><Link2 aria-hidden="true" />Connect an assistant</button>
          <a className="btn btn-soft btn-block" href={CONNECTIONS} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Manage connections</a>
        </div>
      </Sheet>
      <ConfirmSheet open={!!confirm} onClose={() => setConfirm(null)} danger title={confirm ? `Remove what ${confirm.by} added?` : ''}
        body={confirm?.label} confirmLabel="Remove" onConfirm={() => { if (confirm) undo(confirm); setConfirm(null); }} />
    </>
  );
}
