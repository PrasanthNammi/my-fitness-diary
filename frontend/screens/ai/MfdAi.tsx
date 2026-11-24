// MFD AI: quick logging in plain words ("2 eggs and toast for breakfast"). It answers with a card: what it understood
// and, for food, the calories it ESTIMATED, then asks "Does this look right?". Nothing is saved until the person says
// yes; "Change" lets them correct it in their own words ("it was 3 eggs") and the card is redone.
// Trends and advice stay with ChatGPT or Claude (the MFD connector). Each person uses their own Gemini key, on this
// device only.
// DEMO (step 3): example conversations; not connected to a model yet.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Check, Dumbbell, KeyRound, Scale, Sparkles, Undo2 } from 'lucide-react';
import { navigate } from '../../lib/router';
import { useDB } from '../../data/store';
import { Sheet } from '../../components/ui';

type Line = { name: string; amount: string; kcal?: number; source?: 'mine' | 'catalogue' | 'estimate' };
type Card =
  | { kind: 'food'; meal: string; lines: Line[]; kcal: number; p: number; c: number; f: number; estimated: boolean }
  | { kind: 'weight'; value: string; note: string }
  | { kind: 'workout'; title: string; sets: string; note: string };
type State = 'ask' | 'added' | 'replaced';
type Msg = { id: string; from: 'me'; text: string } | { id: string; from: 'ai'; text: string; card?: Card; state?: State };

const EGGS2: Card = { kind: 'food', meal: 'Breakfast', estimated: true, kcal: 235, p: 16, c: 15, f: 11, lines: [
  { name: 'Eggs, boiled', amount: '2 large · 100 g', kcal: 155, source: 'catalogue' },
  { name: 'White toast', amount: '1 slice · 30 g', kcal: 80, source: 'estimate' }] };
const EGGS3: Card = { ...EGGS2, kcal: 313, p: 22, c: 15, f: 16, lines: [{ ...EGGS2.lines[0], amount: '3 large · 150 g', kcal: 233 }, EGGS2.lines[1]] };

export const MFD_AI_DEMOS: Record<string, Msg[]> = {
  ask: [
    { id: '1', from: 'me', text: '2 eggs and a slice of toast for breakfast' },
    { id: '2', from: 'ai', text: 'I estimated this from typical portions. Does it look right?', card: EGGS2, state: 'ask' }],
  fixed: [
    { id: '1', from: 'me', text: '2 eggs and a slice of toast for breakfast' },
    { id: '2', from: 'ai', text: 'I estimated this from typical portions. Does it look right?', card: EGGS2, state: 'replaced' },
    { id: '3', from: 'me', text: 'it was 3 eggs actually' },
    { id: '4', from: 'ai', text: 'Updated to 3 eggs. Add it now?', card: EGGS3, state: 'added' },
    { id: '5', from: 'me', text: 'weighed 72.4 this morning, and did bench 3x8 at 60' },
    { id: '6', from: 'ai', text: 'Two things to add. Right?', card: { kind: 'weight', value: '72.4 kg', note: 'This morning · last 72.9 kg on 19 Nov' }, state: 'ask' },
    { id: '7', from: 'ai', text: '', card: { kind: 'workout', title: 'Bench Press (Barbell)', sets: '3 × 8 × 60 kg', note: 'New workout today · 1,440 kg volume' }, state: 'ask' }],
  advice: [
    { id: '1', from: 'me', text: 'how’s my protein been this month?' },
    { id: '2', from: 'ai', text: 'I’m only for logging, so I don’t read your diary. For trends and advice, ask ChatGPT or Claude: they can read it through the MFD connector.' }],
};

export function MfdAi() {
  const demo = (window as unknown as { __mfdAiDemo?: { key?: boolean; msgs?: string } }).__mfdAiDemo;
  const name = useDB((d) => d.profile?.firstName || d.profile?.name || '');
  const [hasKey, setHasKey] = useState(demo?.key ?? true);
  const [msgs, setMsgs] = useState<Msg[]>(demo?.msgs === 'empty' ? [] : MFD_AI_DEMOS[demo?.msgs ?? 'ask'] ?? []);
  const [text, setText] = useState(''), [keySheet, setKeySheet] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  const setState = (id: string, state: State) => setMsgs((l) => l.map((m) => (m.id === id && m.from === 'ai' ? { ...m, state } : m)));

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
          <p>Write it like a message to a friend. I’ll show you what I understood before anything goes into your diary.</p>
        </div>
      ) : msgs.map((m) => m.from === 'me'
        ? <div key={m.id} className="mfdai-me"><p>{m.text}</p></div>
        : <div key={m.id} className={`mfdai-ai${m.state === 'replaced' ? ' old' : ''}`}>
            {m.text && <p><Sparkles className="mfdai-mark" aria-hidden="true" />{m.text}</p>}
            {m.card && <CardView card={m.card} state={m.state ?? 'ask'} onYes={() => setState(m.id, 'added')} onUndo={() => setState(m.id, 'ask')}
              onChange={() => { setText(''); input.current?.focus(); }} />}
          </div>)}
      <div ref={end} />
    </div>

    {hasKey && <form className="mfdai-composer" onSubmit={(e) => e.preventDefault()}>
      <textarea ref={input} rows={1} aria-label="Message MFD AI" placeholder="Message MFD AI" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      <button className="mfdai-send" aria-label="Send" disabled={!text.trim()}><ArrowUp /></button>
    </form>}

    <Sheet open={keySheet} onClose={() => setKeySheet(false)} title="Gemini key">
      <div className="stack">
        <div className="mfdai-keyrow"><KeyRound aria-hidden="true" /><span className="grow"><b>AIza••••••••Qx4</b><span>Saved on this device only</span></span><span className="mfdai-ok"><Check aria-hidden="true" />Works</span></div>
        <p className="mfdai-note">MFD sends only what you type, today’s date and your units, straight from this device to Google. Never your diary history or Cycle & Health.</p>
        <button className="btn btn-soft btn-block" onClick={() => { setKeySheet(false); setHasKey(false); }}>Remove key</button>
      </div>
    </Sheet>
  </div>;
}

function CardView({ card, state, onYes, onUndo, onChange }: { card: Card; state: State; onYes: () => void; onUndo: () => void; onChange: () => void }) {
  if (state === 'replaced') return <div className="mfdai-card replaced"><span>{card.kind === 'food' ? `${card.meal} · ≈ ${card.kcal} kcal` : 'Earlier version'}</span><span>Changed below</span></div>;
  const actions = state === 'added'
    ? <div className="mfdai-added"><Check aria-hidden="true" /><span className="grow">Added{card.kind === 'food' ? ` to ${card.meal}` : ''}</span><button className="mfdai-undo" onClick={onUndo}><Undo2 aria-hidden="true" />Undo</button></div>
    : <div className="mfdai-actions"><button className="btn btn-soft" onClick={onChange}>Change</button><button className="btn btn-primary" onClick={onYes}>Yes, add it</button></div>;
  if (card.kind === 'food') return (
    <div className="mfdai-card">
      <div className="mfdai-cardtop"><span className="mfdai-eyebrow">{card.meal} · today</span>{card.estimated && <span className="badge ai"><Sparkles aria-hidden="true" />Estimated</span>}</div>
      <div className="mfdai-total tnum">{card.estimated && <span className="approx">≈</span>}{card.kcal}<small>kcal</small></div>
      <div className="mfdai-macros"><span><i className="p" />P {card.p} g</span><span><i className="c" />C {card.c} g</span><span><i className="f" />F {card.f} g</span></div>
      <div className="mfdai-lines">
        {card.lines.map((l, i) => <div key={i} className="mfdai-line"><span className="grow"><b>{l.name}</b><span>{l.amount}{l.source === 'mine' ? ' · My foods' : l.source === 'catalogue' ? ' · from the catalogue' : ' · estimated'}</span></span>
          {l.kcal !== undefined && <span className="tnum mfdai-kcal">{l.kcal}<small> kcal</small></span>}</div>)}
      </div>
      {actions}
    </div>);
  const Icon = card.kind === 'weight' ? Scale : Dumbbell;
  return (
    <div className="mfdai-card">
      <div className="mfdai-simple"><span className={`mfdai-ic k-${card.kind}`}><Icon aria-hidden="true" /></span>
        <span className="grow"><span className="mfdai-eyebrow">{card.kind === 'weight' ? 'Weight' : card.title}</span>
          <b className="tnum">{card.kind === 'weight' ? card.value : card.sets}</b><span className="sub">{card.note}</span></span></div>
      {actions}
    </div>);
}

function KeySetup({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  return <div className="mfdai-setup">
    <div className="mfdai-hello">
      <span>Set up</span>
      <h2>MFD AI uses your own free Gemini key.</h2>
      <p>About two minutes, once on each device.</p>
    </div>
    <section className="mfdai-card">
      <ol className="ai-steps">
        <li><b>Open Google AI Studio</b><span className="muted small">aistudio.google.com/apikey · sign in with your Google account</span></li>
        <li><b>Tap Create API key</b><span className="muted small">and copy it</span></li>
        <li><b>Paste it here</b><span className="muted small">Saved on this device only, never on MFD’s server</span></li>
      </ol>
      <input className="input mfdai-keyinput" aria-label="Gemini API key" placeholder="Paste your key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
      <button className="btn btn-primary btn-block" onClick={onDone}>Save and test</button>
    </section>
    <p className="mfdai-note"><b>What’s sent:</b> only what you type, today’s date and your units, from this device straight to Google. Never your diary history or Cycle & Health.</p>
    <p className="mfdai-note"><b>Google’s free tier:</b> in the EU, UK and Switzerland, Google doesn’t use it to improve its products. Elsewhere it may, and people at Google may read it, so don’t type private things.</p>
  </div>;
}
