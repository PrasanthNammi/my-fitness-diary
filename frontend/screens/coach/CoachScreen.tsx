import { useEffect, useRef, useState } from 'react';
import { Send, Settings2, Trash2 } from 'lucide-react';
import { coach, COACH_PROMPTS, type CoachContext } from '../../adapters/coach';
import { Notice, OverflowMenu, Spinner, TopBar } from '../../components/ui';
import { getDB, update, useDB } from '../../data/store';
import { GOALS } from '../../domain/nutrition';
import { entryNutrients, useTargets } from '../../data/selectors';
import { addDays, todayISO, toISODate, uid } from '../../lib/format';
import { navigate } from '../../lib/router';

function buildContext(): CoachContext {
  const db = getDB();
  const today = todayISO();
  const from7 = addDays(today, -6);
  const days = new Set<string>();
  let kcal = 0, protein = 0;
  db.diary.filter((e) => e.date >= from7 && e.date <= today).forEach((e) => {
    days.add(e.date);
    const n = entryNutrients(e);
    kcal += n.kcal;
    protein += n.protein;
  });
  const w = db.weights;
  const last = w[w.length - 1];
  const ref = w.filter((x) => x.date <= addDays(today, -28)).pop();
  return {
    workoutsLast14d: db.workouts.filter((x) => toISODate(new Date(x.startedAt)) >= addDays(today, -13)).length,
    avgKcalLast7d: days.size ? kcal / days.size : null,
    kcalTarget: null,
    proteinAvg7d: days.size ? protein / days.size : null,
    proteinTarget: null,
    weightChange28dKg: last && ref ? last.kg - ref.kg : null,
    goalLabel: db.profile ? GOALS[db.profile.goal].label : null,
  };
}

export function CoachScreen() {
  const thread = useDB((d) => d.coachThread);
  const config = useDB((d) => d.settings.coach);
  const targets = useTargets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [thread.length, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText('');
    setError(null);
    update((d) => void d.coachThread.push({ id: uid(), role: 'user', text: question, sample: false, createdAt: Date.now() }));
    setBusy(true);
    try {
      const ctx = { ...buildContext(), kcalTarget: targets?.targets.kcal ?? null, proteinTarget: targets?.targets.protein ?? null };
      const reply = await coach.reply(question, ctx, config);
      update((d) => void d.coachThread.push({ id: uid(), role: 'coach', text: reply, sample: !coach.connected, createdAt: Date.now() }));
    } catch {
      setError('The coach couldn’t reply. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Coach" back="/today" bordered actions={
        <OverflowMenu title="Coach" actions={[
          { label: 'Coach settings', icon: Settings2, onSelect: () => navigate('/settings/coach') },
          { label: 'Clear conversation', icon: Trash2, danger: true, disabled: thread.length === 0, onSelect: () => update((d) => void (d.coachThread = [])) },
        ]} />
      } />
      <div className="screen">
        <div style={{ margin: '10px 0 12px' }}>
          <Notice tone="warn">Preview: replies are sample responses, not analysis of your data.</Notice>
        </div>
        <div className="chat" aria-live="polite">
          {thread.length === 0 && (
            <div className="stack-sm">
              <p className="small muted" style={{ margin: '0 0 4px' }}>Ask about your training, nutrition or recovery.</p>
              <div className="chips">
                {COACH_PROMPTS.map((p) => <button key={p} className="chip" onClick={() => ask(p)}>{p}</button>)}
              </div>
            </div>
          )}
          {thread.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              {m.role === 'coach' && m.sample && <span className="bubble-tag">Sample response</span>}
              {m.text}
            </div>
          ))}
          {busy && <div className="bubble coach"><Spinner /></div>}
          {error && <Notice tone="error">{error}</Notice>}
          <div ref={end} />
        </div>
        <form className="composer" onSubmit={(e) => (e.preventDefault(), ask(text))}>
          <input className="input" placeholder="Ask your coach" value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" />
          <button className="btn btn-primary" type="submit" aria-label="Send" disabled={!text.trim() || busy} style={{ flex: 'none', width: 48, padding: 0 }}><Send /></button>
        </form>
      </div>
    </>
  );
}
