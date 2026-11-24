// MFD AI: quick logging in plain words ("2 eggs and toast, 500 ml water"). It turns a message into cards; nothing is
// saved until the person taps "Add to diary". Trends and advice stay with ChatGPT or Claude (the MFD connector).
// Each person uses their own Gemini key, kept on this device only.
// DEMO (step 3): the screens with example replies; not connected to a model yet.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Check, Droplet, Dumbbell, KeyRound, Pencil, Ruler, Scale, Sparkles, Utensils } from 'lucide-react';
import { navigate } from '../../lib/router';
import { Sheet } from '../../components/ui';

type Item = { kind: 'food' | 'water' | 'weight' | 'measure' | 'workout'; title: string; sub: string };
type Msg =
  | { id: string; from: 'me'; text: string }
  | { id: string; from: 'ai'; text: string; items?: Item[]; where?: string; added?: boolean };

const ICON = { food: Utensils, water: Droplet, weight: Scale, measure: Ruler, workout: Dumbbell } as const;

/** Example conversation for the demo (window.__mfdAiDemo can replace it in the local preview). */
const DEMO: Msg[] = [
  { id: '1', from: 'me', text: '2 eggs and a slice of toast for breakfast, and 500 ml water' },
  { id: '2', from: 'ai', text: 'Here’s what I’d add to today:', where: 'Breakfast · Tue 24 Nov', added: true, items: [
    { kind: 'food', title: 'Eggs, boiled · 2 large', sub: '155 kcal · 13 g protein' },
    { kind: 'food', title: 'White toast · 1 slice', sub: '80 kcal · 3 g protein' },
    { kind: 'water', title: 'Water · 500 ml', sub: 'Today 1.2 → 1.7 L' }] },
  { id: '3', from: 'me', text: 'weighed 72.4 this morning. also did bench 3x8 at 60' },
  { id: '4', from: 'ai', text: 'Got it. Check these before I add them:', where: 'Tue 24 Nov', items: [
    { kind: 'weight', title: 'Weight · 72.4 kg', sub: 'Morning · last 72.9 kg on 19 Nov' },
    { kind: 'workout', title: 'Bench Press (Barbell) · 3 × 8 × 60 kg', sub: 'New workout, today · 1,440 kg volume' }] },
  { id: '5', from: 'me', text: 'how’s my protein been this month?' },
  { id: '6', from: 'ai', text: 'I only log things. For trends and advice, ask ChatGPT or Claude: they can read your diary through the MFD connector (Settings → AI assistants).' },
];

export function MfdAi() {
  const demo = (window as unknown as { __mfdAiDemo?: { key: boolean; msgs?: Msg[] } }).__mfdAiDemo;
  const [hasKey, setHasKey] = useState(demo?.key ?? true);
  const [msgs, setMsgs] = useState<Msg[]>(demo?.msgs ?? DEMO);
  const [text, setText] = useState(''), [keySheet, setKeySheet] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);
  const add = (id: string) => setMsgs((l) => l.map((m) => (m.id === id && m.from === 'ai' ? { ...m, added: true } : m)));

  return <div className="chat-screen mfdai">
    <header className="chat-head">
      <button className="icon-btn" aria-label="Back" onClick={() => history.length > 1 ? history.back() : navigate('/')}><ArrowLeft /></button>
      <span className="mfdai-avatar" aria-hidden="true"><Sparkles /></span>
      <span className="grow"><span className="name">MFD AI</span><span className="sub">Logs to your diary · you check first</span></span>
      {hasKey && <button className="icon-btn" aria-label="Gemini key" onClick={() => setKeySheet(true)}><KeyRound /></button>}
    </header>

    <div className="chat-body">
      {!hasKey ? <KeySetup onDone={() => setHasKey(true)} /> : msgs.length === 0 ? (
        <div className="mfdai-empty">
          <span className="mfdai-avatar lg" aria-hidden="true"><Sparkles /></span>
          <h2>What did you eat, drink or do?</h2>
          <p>Write it like a text to a friend. You check everything before it goes into your diary.</p>
        </div>
      ) : msgs.map((m) => m.from === 'me'
        ? <div key={m.id} className="chat-msg mine"><p className="chat-bubble">{m.text}</p></div>
        : <div key={m.id} className="mfdai-reply">
            <p>{m.text}</p>
            {m.items && <div className="card mfdai-card">
              <div className="mfdai-where">{m.where}</div>
              {m.items.map((it, i) => { const I = ICON[it.kind]; return (
                <div key={i} className="mfdai-item"><span className={`mfdai-ic k-${it.kind}`}><I aria-hidden="true" /></span>
                  <span className="grow"><b>{it.title}</b><span>{it.sub}</span></span></div>); })}
              {m.added
                ? <div className="mfdai-done"><Check aria-hidden="true" /><span className="grow">Added to your diary</span><button className="btn btn-ghost btn-sm">Undo</button></div>
                : <div className="mfdai-actions"><button className="btn btn-secondary"><Pencil aria-hidden="true" />Edit</button><button className="btn btn-primary" onClick={() => add(m.id)}>Add to diary</button></div>}
            </div>}
          </div>)}
      <div ref={end} />
    </div>

    {hasKey && <form className="chat-input" onSubmit={(e) => e.preventDefault()}>
      <input className="input" aria-label="Message MFD AI" placeholder="Message MFD AI"
        value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      <button className="round-icon accent" aria-label="Send" disabled={!text.trim()}><ArrowUp /></button>
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

function KeySetup({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  return <div className="mfdai-setup">
    <span className="mfdai-avatar lg" aria-hidden="true"><Sparkles /></span>
    <h2>Set up MFD AI</h2>
    <p className="mfdai-lead">MFD AI runs on Google Gemini with your own free key. It takes about two minutes, once on each device.</p>
    <section className="card card-pad stack-sm">
      <ol className="ai-steps">
        <li><b>Open Google AI Studio</b><span className="muted small">aistudio.google.com/apikey · sign in with your Google account</span></li>
        <li><b>Create API key</b><span className="muted small">Then copy it</span></li>
        <li><b>Paste it here</b><span className="muted small">Saved on this device only, never on MFD’s server</span></li>
      </ol>
      <input className="input mfdai-keyinput" aria-label="Gemini API key" placeholder="Paste your key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
      <button className="btn btn-primary btn-block" onClick={onDone}>Save and test</button>
    </section>
    <p className="mfdai-note"><b>What’s sent:</b> only what you type, today’s date and your units, from this device straight to Google. Never your diary history or Cycle & Health.</p>
    <p className="mfdai-note"><b>Google’s free tier:</b> in the EU, UK and Switzerland, Google doesn’t use it to improve its products. Elsewhere it may, and people at Google may read it, so don’t type private things.</p>
  </div>;
}
