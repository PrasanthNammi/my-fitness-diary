import { useState } from 'react';
import { Bot, ChevronRight, Droplet, Dumbbell, ExternalLink, Folder, FolderInput, Link2, ListChecks, Ruler, Scale, SlidersHorizontal, Sparkles, Undo2, Utensils, X } from 'lucide-react';
import { activeSuggestions, type AiSuggestion } from '../domain/aiSuggestions';
import { openSuggestion, suggestionSource } from '../screens/training/SuggestionReview';
import { useDB } from '../data/store';
import { aiChanges, body, diary as diaryRepo, training, workouts as workoutRepo } from '../data/repositories';
import { aiAgo, aiLastAdded, type AiAdded } from '../domain/aiActivity';
import { aiKey, hideAiActivity, hideAiSuggestion, openAiActivity, useAiActivity } from '../lib/aiRecent';
import { SwipeRow } from './SwipeRow';
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
  const settings = useDB((d) => d.settings);
  const [confirm, setConfirm] = useState<AiAdded | null>(null);
  const now = Date.now();
  const { all, recent, recentAll } = useAiActivity(now);
  const suggestionList = useDB((d) => d.aiSuggestions), workoutList = useDB((d) => d.workouts), routineList = useDB((d) => d.routines);
  // Only suggestions for routines that still exist.
  // Only suggestions for routines that still exist; an accepted one stays 12 hours (like the entries below); swiped away = hidden here.
  const active = activeSuggestions(suggestionList, workoutList, now).filter((x) => routineList.some((r) => r.id === x.routineId));
  const hiddenKeys = new Set(settings.aiHidden ?? []);
  const suggested = active.filter((x) => !hiddenKeys.has('suggestion:' + x.id) && (x.status !== 'used' || now - (x.usedAt ?? x.createdAt) < 12 * 3_600_000));
  const routineName = (x: AiSuggestion) => routineList.find((r) => r.id === x.routineId)?.name ?? x.routineName ?? 'Routine';
  const last = (name: string) => aiLastAdded(all, name);
  const Icon = { food: Utensils, workout: Dumbbell, weight: Scale, routine: ListChecks, measurement: Ruler, water: Droplet, settings: SlidersHorizontal, folder: Folder, move: FolderInput, routine_edit: ListChecks };
  const undo = (a: AiAdded) => {
    if (a.kind === 'food') diaryRepo.remove(a.id);
    else if (a.kind === 'workout') workoutRepo.deleteWorkout(a.id);
    else if (a.kind === 'weight') body.deleteWeight(a.id);
    else if (a.kind === 'routine') training.deleteRoutine(a.id);
    else if (a.kind === 'measurement') body.removeMeasurements(a.id);
    else aiChanges.undo(a.id);
    toast(`Undone: ${a.label}`);
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
          {suggested.length > 0 && <>
            <div className="eyebrow">Workout suggestions</div>
            <ul className="ai-hub-list">
              {suggested.map((x) => (
                <SwipeRow key={x.id} onOpen={() => { onClose(); openSuggestion(x.id); }} onClear={() => hideAiSuggestion(x.id, active.map((y) => y.id), settings.aiHidden)}>
                  <Sparkles aria-hidden="true" />
                  <span className="grow"><span className="row-title ellipsis">{routineName(x)}</span><span className="row-sub">{suggestionSource(x)} · {x.status === 'used' ? 'Accepted' : 'New'}</span></span>
                  <ChevronRight className="ai-hub-go" aria-hidden="true" />
                </SwipeRow>
              ))}
            </ul>
          </>}
          <div className="eyebrow">Added or changed in the last 12 hours</div>
          {recent.length ? (
            <ul className="ai-hub-list">
              {recent.map((a) => {
                const I = Icon[a.kind];
                return (
                  <SwipeRow key={aiKey(a)} onOpen={() => { onClose(); openAiActivity(a); }} onClear={() => hideAiActivity([a], recentAll, settings.aiHidden)}>
                    <I aria-hidden="true" />
                    <span className="grow"><span className="row-title ellipsis">{a.label}</span><span className="row-sub">{a.by} · {aiAgo(a.at, now)}</span></span>
                    <button className="btn btn-soft btn-sm" onClick={() => setConfirm(a)}><Undo2 aria-hidden="true" />Undo</button>
                    <button className="icon-btn ai-hub-hide" aria-label={`Clear ${a.label} from this list (keeps it)`} title="Clear (keeps it)" onClick={() => hideAiActivity([a], recentAll, settings.aiHidden)}><X aria-hidden="true" /></button>
                  </SwipeRow>
                );
              })}
            </ul>
          ) : (
            <p className="small muted ai-hub-empty">{recentAll.length ? 'All caught up.' : 'Nothing from ChatGPT or Claude today.'}</p>
          )}
          <button className="btn btn-primary btn-block" onClick={() => { onClose(); navigate('/coach'); }}><Link2 aria-hidden="true" />Connect an assistant</button>
          <a className="btn btn-soft btn-block" href={CONNECTIONS} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />Manage connections</a>
        </div>
      </Sheet>
      <ConfirmSheet open={!!confirm} onClose={() => setConfirm(null)} danger title={confirm ? `Undo what ${confirm.by} did?` : ''}
        body={confirm?.label} confirmLabel="Undo" onConfirm={() => { if (confirm) undo(confirm); setConfirm(null); }} />
    </>
  );
}
