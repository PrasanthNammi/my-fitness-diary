import { useEffect } from 'react';
import type { AddedBy } from '../domain/types';
import { aiSource } from '../domain/aiSource';
import { useDB } from '../data/store';
import { toast } from './ui';

const KEY = 'mfd-ai-seen';
const DAY = 86400000;

/** One short message when ChatGPT or Claude has added entries since this device last looked. */
export function AiAddedNotice() {
  const diary = useDB((d) => d.diary), workouts = useDB((d) => d.workouts), weights = useDB((d) => d.weights), routines = useDB((d) => d.routines);
  useEffect(() => {
    let seen: number;
    try { seen = Number(localStorage.getItem(KEY)) || Date.now() - DAY; } catch { return; }
    const added = [...diary, ...workouts, ...weights, ...routines]
      .map((e) => (e as { addedBy?: AddedBy }).addedBy)
      .filter((b): b is AddedBy => !!b?.at && Date.parse(b.at) > seen);
    if (!added.length) return;
    const bySource = new Map<string, number>();
    for (const b of added) bySource.set(aiSource(b) ?? 'AI assistant', (bySource.get(aiSource(b) ?? 'AI assistant') ?? 0) + 1);
    toast([...bySource].map(([name, n]) => `${name} added ${n} ${n === 1 ? 'entry' : 'entries'}`).join(' · '));
    try { localStorage.setItem(KEY, String(Math.max(...added.map((b) => Date.parse(b.at!))))); } catch { /* per-device convenience only */ }
  }, [diary, workouts, weights, routines]);
  return null;
}
