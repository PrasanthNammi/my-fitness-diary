// MFD AI: quick logging in plain words ("2 eggs and toast for breakfast"). It answers with a card showing what it
// understood and, for food, the calories it ESTIMATED, and asks "Look right?". Amounts can be fixed with − / + on the
// card or by replying ("it was 3 eggs"). Nothing is saved until the person taps "Add".
// Trends and advice stay with ChatGPT or Claude (the MFD connector). Each person uses their own Gemini key, on this
// device only.
// DEMO (step 3): example conversations; not connected to a model yet.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Bot, Check, ChevronDown, Database, Dumbbell, Globe, KeyRound, Lock, Minus, Plus, Scale, Send, Sparkles, TrendingDown, Undo2, Utensils, ListChecks, Folder, X } from 'lucide-react';
import { navigate } from '../../lib/router';
import { useDB } from '../../data/store';
import { Sheet } from '../../components/ui';

/** One food on the card: amount = qty × unit; per-unit numbers so − / + recalculate. */
type Line = { name: string; qty: number; unit: string; grams: number; kcal: number; p: number; c: number; f: number; source: 'catalogue' | 'mine' | 'estimate' };
type Card =
  | { kind: 'food'; meal: string; lines: Line[] }
  | { kind: 'weight'; kg: number; lastKg: number; lastDate: string }
  | { kind: 'workout'; title: string; minutes?: number; exercises: Ex[] }
  | { kind: 'routine'; name: string; folder: string; suggested?: boolean; exercises: Ex[] };
/** One exercise: matched to the catalogue (or "new" when nothing matched); sets as done, or as targets in a routine. */
type Ex = { name: string; isNew?: boolean; sets: { reps: number; kg?: number }[] };
const S = (n: number, reps: number, kg?: number) => Array.from({ length: n }, () => ({ reps, kg }));
type State = 'ask' | 'added' | 'replaced';
type Msg = { id: string; from: 'me'; text: string } | { id: string; from: 'ai'; text: string; card?: Card; state?: State; link?: boolean };

const EGG: Line = { name: 'Eggs, boiled', qty: 2, unit: 'large', grams: 50, kcal: 77.5, p: 6.3, c: 0.6, f: 5.3, source: 'catalogue' };
const TOAST: Line = { name: 'White toast', qty: 1, unit: 'slice', grams: 30, kcal: 80, p: 2.7, c: 14.4, f: 1, source: 'estimate' };

export const MFD_AI_DEMOS: Record<string, Msg[]> = {
  ask: [
    { id: '1', from: 'me', text: '2 eggs and a slice of toast for breakfast' },
    { id: '2', from: 'ai', text: 'My estimate. Look right?', card: { kind: 'food', meal: 'Breakfast', lines: [EGG, TOAST] }, state: 'ask' }],
  fixed: [
    { id: '1', from: 'me', text: '2 eggs and a slice of toast for breakfast' },
    { id: '2', from: 'ai', text: 'My estimate. Look right?', card: { kind: 'food', meal: 'Breakfast', lines: [EGG, TOAST] }, state: 'replaced' },
    { id: '3', from: 'me', text: 'it was 3 eggs actually' },
    { id: '4', from: 'ai', text: 'Updated.', card: { kind: 'food', meal: 'Breakfast', lines: [{ ...EGG, qty: 3 }, TOAST] }, state: 'added' },
    { id: '5', from: 'me', text: 'weighed 72.4 this morning, and did bench 3x8 at 60' },
    { id: '6', from: 'ai', text: 'Two things. Look right?', card: { kind: 'weight', kg: 72.4, lastKg: 72.9, lastDate: '19 Nov' }, state: 'ask' },
    { id: '7', from: 'ai', text: '', card: { kind: 'workout', title: 'Workout', exercises: [{ name: 'Bench Press (Barbell)', sets: S(3, 8, 60) }] }, state: 'ask' }],
  gym: [
    { id: '1', from: 'me', text: 'push day done, 55 min. bench 3x8 at 60, incline db press 3x10 at 22, dips 3x12, pushdowns 3x12 at 25, lateral raises 3x15 at 8' },
    { id: '2', from: 'ai', text: '5 exercises. Look right?', card: { kind: 'workout', title: 'Push day', minutes: 55, exercises: [
      { name: 'Bench Press (Barbell)', sets: S(3, 8, 60) }, { name: 'Incline Bench Press (Dumbbell)', sets: S(3, 10, 22) },
      { name: 'Chest Dip', sets: S(3, 12) }, { name: 'Triceps Pushdown (Cable)', sets: S(3, 12, 25) }, { name: 'Lateral Raise (Dumbbell)', sets: S(3, 15, 8) }] }, state: 'added' },
    { id: '3', from: 'me', text: 'save it as a routine, Push A, in my PPL folder' }],
  routine: [
    { id: '3', from: 'me', text: 'save it as a routine, Push A, in my PPL folder' },
    { id: '4', from: 'ai', text: 'New routine. Look right?', card: { kind: 'routine', name: 'Push A', folder: 'PPL', exercises: [
      { name: 'Bench Press (Barbell)', sets: S(3, 8, 60) }, { name: 'Incline Bench Press (Dumbbell)', sets: S(3, 10, 22) },
      { name: 'Chest Dip', sets: S(3, 12) }, { name: 'Triceps Pushdown (Cable)', sets: S(3, 12, 25) }, { name: 'Lateral Raise (Dumbbell)', sets: S(3, 15, 8) }] }, state: 'ask' },
    { id: '5', from: 'me', text: 'also make me a pull routine, same style, with face pulls' },
    { id: '6', from: 'ai', text: 'A first draft. Change anything before saving.', card: { kind: 'routine', name: 'Pull A', folder: 'PPL', suggested: true, exercises: [
      { name: 'Lat Pulldown (Cable)', sets: S(3, 10) }, { name: 'Seated Cable Row', sets: S(3, 10) }, { name: 'Face Pull (Cable)', sets: S(3, 15) },
      { name: 'Bicep Curl (Dumbbell)', sets: S(3, 12) }, { name: 'Reverse Fly Machine', isNew: true, sets: S(3, 15) }] }, state: 'ask' }],
  advice: [
    { id: '1', from: 'me', text: 'how’s my protein been this month?' },
    { id: '2', from: 'ai', text: 'I only log. For trends and advice, ask ChatGPT or Claude.', link: true }],
};

const r = (n: number) => Math.round(n);
const totals = (lines: Line[]) => lines.reduce((t, l) => ({ kcal: t.kcal + l.kcal * l.qty, p: t.p + l.p * l.qty, c: t.c + l.c * l.qty, f: t.f + l.f * l.qty }), { kcal: 0, p: 0, c: 0, f: 0 });

export function MfdAi() {
  const demo = (window as unknown as { __mfdAiDemo?: { key?: boolean; msgs?: string } }).__mfdAiDemo;
  const name = useDB((d) => d.profile?.firstName || d.profile?.name || '');
  const [hasKey, setHasKey] = useState(demo?.key ?? true);
  const [msgs, setMsgs] = useState<Msg[]>(demo?.msgs === 'empty' ? [] : MFD_AI_DEMOS[demo?.msgs ?? 'ask'] ?? []);
  const [text, setText] = useState(''), [keySheet, setKeySheet] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  const patch = (id: string, p: Partial<Extract<Msg, { from: 'ai' }>>) => setMsgs((l) => l.map((m) => (m.id === id && m.from === 'ai' ? { ...m, ...p } : m)));

  return <div className="chat-screen mfdai">
    <header className="mfdai-head">
      <button className="icon-btn" aria-label="Back" onClick={() => history.length > 1 ? history.back() : navigate('/')}><ArrowLeft /></button>
      <h1><Sparkles aria-hidden="true" />MFD AI</h1>
      {hasKey ? <button className="icon-btn" aria-label="Gemini key" onClick={() => setKeySheet(true)}><KeyRound /></button> : <span className="mfdai-headpad" />}
    </header>

    <div className="mfdai-body">
      {!hasKey ? <KeySetup onDone={() => setHasKey(true)} /> : msgs.length === 0 ? (
        <div className="mfdai-hello">
          <span>Hi{name ? ` ${name}` : ''},</span>
          <h2>what did you eat, drink or do?</h2>
          <p><Check aria-hidden="true" />You check everything before it’s added</p>
        </div>
      ) : msgs.map((m) => m.from === 'me'
        ? <div key={m.id} className="mfdai-me"><p>{m.text}</p></div>
        : <div key={m.id} className={`mfdai-ai${m.state === 'replaced' ? ' old' : ''}`}>
            {m.text && <p><Sparkles className="mfdai-mark" aria-hidden="true" />{m.text}</p>}
            {m.link && <button className="mfdai-linkcard" onClick={() => navigate('/coach')}><Bot aria-hidden="true" /><span className="grow"><b>ChatGPT & Claude</b><span>Connected through MFD</span></span><ArrowUp className="mfdai-out" aria-hidden="true" /></button>}
            {m.card && <CardView card={m.card} state={m.state ?? 'ask'} onAdd={() => patch(m.id, { state: 'added' })} onUndo={() => patch(m.id, { state: 'ask' })}
              onCard={(card) => patch(m.id, { card })} onChange={() => input.current?.focus()} />}
          </div>)}
      <div ref={end} />
    </div>

    {hasKey && <form className="mfdai-composer" onSubmit={(e) => e.preventDefault()}>
      <textarea ref={input} rows={1} aria-label="Message MFD AI" placeholder="Message MFD AI" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      <button className="mfdai-send" aria-label="Send" disabled={!text.trim()}><ArrowUp /></button>
    </form>}

    <Sheet open={keySheet} onClose={() => setKeySheet(false)} title="Gemini key">
      <div className="stack">
        <div className="mfdai-keyrow"><KeyRound aria-hidden="true" /><span className="grow"><b>AIza••••••••Qx4</b><span>On this device only</span></span><span className="mfdai-ok"><Check aria-hidden="true" />Works</span></div>
        <Facts />
        <button className="btn btn-soft btn-block" onClick={() => { setKeySheet(false); setHasKey(false); }}>Remove key</button>
      </div>
    </Sheet>
  </div>;
}

function CardView({ card, state, onAdd, onUndo, onCard, onChange }: { card: Card; state: State; onAdd: () => void; onUndo: () => void; onCard: (c: Card) => void; onChange: () => void }) {
  const ask = state === 'ask';
  if (state === 'replaced') { const t = card.kind === 'food' ? totals(card.lines) : null;
    return <div className="mfdai-card replaced"><span>{card.kind === 'food' ? `${card.meal} · ≈ ${r(t!.kcal)} kcal` : 'Earlier'}</span><span>Changed</span></div>; }
  const footer = ask
    ? <div className="mfdai-actions"><button className="btn btn-soft" onClick={onChange}>Change</button><button className="btn btn-primary" onClick={onAdd}><Check aria-hidden="true" />{card.kind === 'routine' ? 'Save' : 'Add'}</button></div>
    : <div className="mfdai-added"><Check aria-hidden="true" /><span className="grow">{card.kind === 'routine' ? 'Saved to Routines' : 'Added'}</span><button className="mfdai-undo" onClick={onUndo}><Undo2 aria-hidden="true" />Undo</button></div>;

  if (card.kind === 'food') {
    const t = totals(card.lines), mac = t.p * 4 + t.c * 4 + t.f * 9 || 1;
    const setQty = (i: number, d: number) => onCard({ ...card, lines: card.lines.map((l, j) => (j === i ? { ...l, qty: Math.max(0.5, l.qty + d) } : l)) });
    const estimated = card.lines.some((l) => l.source === 'estimate');
    return <div className="mfdai-card">
      <div className="mfdai-cardtop">
        <span className="mfdai-pill"><Utensils aria-hidden="true" />{card.meal}<ChevronDown aria-hidden="true" /></span>
        <span className="mfdai-pill plain">Today</span>
        {estimated && <span className="badge ai mfdai-est">Estimate</span>}
      </div>
      <div className="mfdai-total tnum"><span className="approx">≈</span>{r(t.kcal)}<small>kcal</small></div>
      <div className="mfdai-macbar" aria-hidden="true">
        <i className="p" style={{ flexGrow: t.p * 4 / mac }} /><i className="c" style={{ flexGrow: t.c * 4 / mac }} /><i className="f" style={{ flexGrow: t.f * 9 / mac }} />
      </div>
      <div className="mfdai-macros"><span><i className="p" />{r(t.p)} g<small>protein</small></span><span><i className="c" />{r(t.c)} g<small>carbs</small></span><span><i className="f" />{r(t.f)} g<small>fat</small></span></div>
      <div className="mfdai-lines">
        {card.lines.map((l, i) => <div key={i} className="mfdai-line">
          <span className={`mfdai-src s-${l.source}`} title={l.source === 'estimate' ? 'Estimated' : l.source === 'mine' ? 'My foods' : 'Catalogue'}>{l.source === 'estimate' ? <Sparkles aria-hidden="true" /> : <Database aria-hidden="true" />}</span>
          <span className="grow"><b>{l.name}</b><span className="tnum">{r(l.qty * l.grams)} g · {r(l.qty * l.kcal)} kcal</span></span>
          {ask ? <span className="mfdai-step" role="group" aria-label={`${l.name} amount`}>
            <button aria-label="Less" onClick={() => setQty(i, -1)}><Minus /></button><b className="tnum">{l.qty}</b><button aria-label="More" onClick={() => setQty(i, 1)}><Plus /></button>
          </span> : <span className="mfdai-qty tnum">{l.qty} {l.unit}</span>}
        </div>)}
      </div>
      {footer}
    </div>;
  }
  if (card.kind === 'weight') {
    const d = Math.round((card.kg - card.lastKg) * 10) / 10;
    return <div className="mfdai-card">
      <div className="mfdai-simple"><span className="mfdai-ic k-weight"><Scale aria-hidden="true" /></span>
        <span className="grow"><span className="mfdai-eyebrow">Weight</span><b className="tnum">{card.kg}<small> kg</small></b></span>
        <span className={`mfdai-delta${d < 0 ? ' down' : ''}`}><TrendingDown aria-hidden="true" />{d > 0 ? '+' : ''}{d} kg<small>since {card.lastDate}</small></span></div>
      {footer}
    </div>;
  }
  return <ExerciseCard card={card} footer={footer} ask={ask} />;
}

/** A finished workout or a routine: a few stat tiles, then one row per exercise with its sets as compact chips. */
function ExerciseCard({ card, footer, ask }: { card: Extract<Card, { kind: 'workout' | 'routine' }>; footer: React.ReactNode; ask: boolean }) {
  const [open, setOpen] = useState(false);
  const routine = card.kind === 'routine', sets = card.exercises.reduce((n, e) => n + e.sets.length, 0);
  const vol = card.exercises.reduce((v, e) => v + e.sets.reduce((x, s) => x + s.reps * (s.kg ?? 0), 0), 0);
  const shown = open || card.exercises.length <= 4 ? card.exercises : card.exercises.slice(0, 3);
  const group = (e: Ex) => { const out: { n: number; reps: number; kg?: number }[] = [];
    for (const s of e.sets) { const l = out[out.length - 1]; if (l && l.reps === s.reps && l.kg === s.kg) l.n++; else out.push({ n: 1, ...s }); } return out; };
  return <div className="mfdai-card">
    <div className="mfdai-cardtop">
      <span className={`mfdai-pill${routine ? ' rt' : ' wk'}`}>{routine ? <ListChecks aria-hidden="true" /> : <Dumbbell aria-hidden="true" />}{routine ? 'Routine' : 'Workout'}</span>
      <span className="mfdai-pill plain">{routine ? <><Folder aria-hidden="true" />{card.folder}<ChevronDown aria-hidden="true" /></> : 'Today'}</span>
      {routine && card.suggested && <span className="badge ai mfdai-est">Draft</span>}
    </div>
    <div className="mfdai-wtitle">{card.kind === 'routine' ? card.name : card.title}</div>
    <div className="mfdai-stats tnum">
      <span><b>{card.exercises.length}</b>exercises</span><span><b>{sets}</b>sets</span>
      {routine ? <span><b>~{Math.round(sets * 2.5)}</b>min</span> : card.minutes ? <span><b>{card.minutes}</b>min</span> : null}
      {!routine && vol > 0 && <span><b>{vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol}<small> kg</small></b>volume</span>}
    </div>
    <div className="mfdai-exlist">
      {shown.map((e, i) => <div key={i} className="mfdai-exrow">
        <span className="mfdai-exnum tnum">{card.exercises.indexOf(e) + 1}</span>
        <span className="grow"><b>{e.name}{e.isNew && <span className="mfdai-new">New exercise</span>}</b>
          <span className="mfdai-setchips tnum">{group(e).map((g, j) => <span key={j}>{g.n} × {g.reps}{g.kg ? ` · ${g.kg} kg` : ''}</span>)}</span></span>
        {ask && <button className="icon-btn sm mfdai-exdel" aria-label={`Remove ${e.name}`}><X /></button>}
      </div>)}
      {!open && card.exercises.length > 4 && <button className="mfdai-more" onClick={() => setOpen(true)}>Show all {card.exercises.length}<ChevronDown aria-hidden="true" /></button>}
    </div>
    {footer}
  </div>;
}

/** What happens with the key and messages, as three short facts. */
function Facts() {
  return <div className="mfdai-facts">
    <span><Lock aria-hidden="true" />Key stays on this device</span>
    <span><Send aria-hidden="true" />Only what you type goes to Google. Never Cycle & Health</span>
    <span><Globe aria-hidden="true" />EU, UK, CH: not used to train Google’s AI. Elsewhere it may be</span>
  </div>;
}

function KeySetup({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  return <div className="mfdai-setup">
    <div className="mfdai-hello">
      <span>Set up</span>
      <h2>Add your free Gemini key</h2>
    </div>
    <section className="mfdai-card">
      <ol className="ai-steps">
        <li><b>Open aistudio.google.com/apikey</b><span className="muted small">Sign in with Google</span></li>
        <li><b>Create API key</b><span className="muted small">Copy it</span></li>
        <li><b>Paste it here</b></li>
      </ol>
      <input className="input mfdai-keyinput" aria-label="Gemini API key" placeholder="Paste your key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
      <button className="btn btn-primary btn-block" onClick={onDone}>Save and test</button>
    </section>
    <Facts />
  </div>;
}
