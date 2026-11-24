// MFD AI: quick logging in plain words ("2 eggs and toast for breakfast"). Gemini (the person's own key, called from
// this device) turns a message into cards; food comes as an ESTIMATE unless a saved food matches. The person checks
// each card (− / + amounts, meal, ✕ exercises, folder) and nothing is saved until "Add". Corrections can be typed
// ("it was 3 eggs"). Trends and advice stay with ChatGPT or Claude (the MFD connector).
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Bot, Check, ChevronDown, ChevronRight, Database, Droplet, Dumbbell, ExternalLink, Folder, Globe, History, KeyRound, ListChecks, Lock, MessageSquare, Minus, Moon, Play, Plus, RotateCcw, Ruler, Scale, Send, Sparkles, Timer, Trash2, Undo2, Utensils, X } from 'lucide-react';
import { navigate } from '../../lib/router';
import { useDB } from '../../data/store';
import { Sheet, toast } from '../../components/ui';
import { todayISO } from '../../lib/format';
import { forgetGeminiKey, geminiErrorDetail, geminiErrorText, geminiJson, geminiKey, maskedKey, saveGeminiKey, type Turn } from '../../lib/gemini';
import { applyCard, folderNames, resolveCard, type Applied } from '../../lib/mfdAiApply';
import { chatDay, deleteAllChats, deleteChat, loadChats, saveChat, type StoredChat } from '../../lib/mfdAiChats';
import { SwipeRow } from '../../components/SwipeRow';
import { MEALS, MEAL_LABEL, RESPONSE_EXAMPLE, RESPONSE_SCHEMA, addDays, cardSummary, parseAnswer, systemPrompt, type Card, type Ex, type FoodLine } from '../../domain/mfdAi';
import type { ISODate, Meal } from '../../domain/types';

type CardState = { card: Card; state: 'ask' | 'added' | 'replaced'; error?: string };
type Msg = { id: string; from: 'me'; text: string } | { id: string; from: 'ai'; text: string; cards?: CardState[]; link?: boolean; error?: boolean; retry?: string; detail?: string };

const r = (x: number) => Math.round(x);
const newId = () => Math.random().toString(36).slice(2, 10);
const totals = (lines: FoodLine[]) => lines.reduce((t, l) => ({ kcal: t.kcal + l.kcal * l.qty, p: t.p + l.p * l.qty, c: t.c + l.c * l.qty, f: t.f + l.f * l.qty }), { kcal: 0, p: 0, c: 0, f: 0 });
const dayLabel = (d: ISODate) => (d === todayISO() ? 'Today' : d === addDays(todayISO(), -1) ? 'Yesterday' : new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
const undos = new Map<string, Applied>();   // this session only: Undo after a reload or in an old chat isn't offered
const time = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

type Demo = { key?: boolean; msgs?: Msg[]; chats?: StoredChat<Msg>[]; history?: boolean };
const demoOf = () => (window as unknown as { __mfdAiDemo?: Demo }).__mfdAiDemo;

/** Every visit starts a NEW chat; earlier ones (last 7 days, this device only) are in History. */
export function MfdAi() {
  const demo = demoOf();
  const name = useDB((d) => d.profile?.firstName || d.profile?.name || '');
  const settings = useDB((d) => d.settings);
  const [key, setKey] = useState<string | null>(demo ? (demo.key === false ? null : 'AIzaDemoKeyForThePreview00Qx4') : geminiKey());
  const [chatId, setChatId] = useState(newId);
  const [msgs, setMsgsState] = useState<Msg[]>(() => demo?.msgs ?? []);
  const [chats, setChats] = useState<StoredChat<Msg>[]>(() => demo?.chats ?? loadChats<Msg>());
  const [slow, setSlow] = useState(false);
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [historyOpen, setHistoryOpen] = useState(!!demo?.history), [hint, setHint] = useState('');
  const input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null), abort = useRef<AbortController | null>(null), idRef = useRef(chatId);
  idRef.current = chatId;
  const setMsgs = (fn: (m: Msg[]) => Msg[]) => setMsgsState((m) => { const n = fn(m); if (!demo) saveChat(idRef.current, n); return n; });
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { setSlow(false); if (!busy) return; const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, [busy]);
  useEffect(() => { const t = input.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; } }, [text]);

  const patchCard = (mid: string, i: number, p: Partial<CardState>) => setMsgs((l) => l.map((m) => (m.id === mid && m.from === 'ai' && m.cards ? { ...m, cards: m.cards.map((c, j) => (j === i ? { ...c, ...p } : c)) } : m)));

  /** Sends a message. A retry re-sends the same message in place: no second bubble, the old error goes. */
  async function send(retryOf?: Msg) {
    const said = (retryOf && retryOf.from === 'ai' ? retryOf.retry ?? '' : text).trim();
    if (!said || busy) return;
    const now = new Date(), today = todayISO();
    const before = retryOf ? msgs.filter((m) => m.id !== retryOf.id) : msgs;
    // The last few turns, so corrections ("it was 3 eggs") are understood. Cards go back as short text; errors are left out.
    const past = (retryOf ? before.slice(0, -1) : before).slice(-10);
    const history: Turn[] = past.flatMap((m): Turn[] => m.from === 'me' ? [{ role: 'user', text: m.text }]
      : m.error ? [] : [{ role: 'model', text: `${m.text}${m.cards?.length ? `\nProposed: ${m.cards.filter((c) => c.state !== 'replaced').map((c) => `${cardSummary(c.card)} [${c.state === 'added' ? 'added' : 'not added yet'}]`).join(' | ')}` : ''}` }]);
    setMsgs(() => (retryOf ? before : [...before, { id: newId(), from: 'me', text: said }]));
    if (!retryOf) setText('');
    setBusy(true); setHint('');
    abort.current = new AbortController();
    try {
      const answer = await geminiJson<unknown>({ signal: abort.current.signal, schema: RESPONSE_SCHEMA, example: RESPONSE_EXAMPLE, turns: [...history, { role: 'user', text: said }],
        system: systemPrompt({ today, weekday: now.toLocaleDateString('en-GB', { weekday: 'long' }), time: now.toTimeString().slice(0, 5), weightUnit: settings.weightUnit ?? 'kg', lengthUnit: settings.lengthUnit ?? 'cm' }) });
      const p = parseAnswer(answer, today);
      const cards = p.cards.map((c) => ({ card: resolveCard(c), state: 'ask' as const }));
      setMsgs((l) => [...(p.replaces ? l.map((m) => (m.from === 'ai' && m.cards ? { ...m, cards: m.cards.map((c) => (c.state === 'ask' ? { ...c, state: 'replaced' as const } : c)) } : m)) : l),
        { id: newId(), from: 'ai', text: p.reply, cards, link: !cards.length && /chatgpt|claude/i.test(p.reply) }]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.warn('MFD AI', e);
      setMsgs((l) => [...l, { id: newId(), from: 'ai', text: geminiErrorText(e), error: true, retry: said, detail: geminiErrorDetail(e) }]);
    } finally { setBusy(false); }
  }

  function add(mid: string, i: number, c: CardState) {
    try { const a = applyCard(c.card); undos.set(`${mid}:${i}`, a); patchCard(mid, i, { state: 'added', error: undefined }); if (c.card.kind === 'start') navigate('/workout'); }
    catch (e) { patchCard(mid, i, { error: (e as Error).message || 'Could not add this' }); }
  }
  function undo(mid: string, i: number) {
    const a = undos.get(`${mid}:${i}`); if (!a) return;
    try { a.undo(); undos.delete(`${mid}:${i}`); patchCard(mid, i, { state: 'ask' }); toast('Undone'); } catch { toast('Could not undo. Change it in the app.'); }
  }
  const change = () => { setHint('What should change?'); input.current?.focus(); };
  const openHistory = () => { if (!demo) setChats(loadChats<Msg>()); setHistoryOpen(true); };
  const openChat = (c: StoredChat<Msg>) => { abort.current?.abort(); setBusy(false); setChatId(c.id); setMsgsState(c.msgs); setHistoryOpen(false); };
  const newChat = () => { abort.current?.abort(); setBusy(false); setChatId(newId()); setMsgsState([]); setText(''); setHistoryOpen(false); setTimeout(() => input.current?.focus(), 50); };

  return <div className="chat-screen mfdai">
    <header className="mfdai-head">
      <button className="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : navigate('/'))}><ArrowLeft /></button>
      <h1><Sparkles aria-hidden="true" />MFD AI</h1>
      {key ? <button className="icon-btn" aria-label="Chat history and Gemini key" onClick={openHistory}><History /></button> : <span className="mfdai-headpad" />}
    </header>

    <div className="mfdai-body" aria-live="polite">
      {!key ? <KeySetup onDone={() => setKey(geminiKey())} /> : msgs.length === 0 ? (
        <div className="mfdai-hello">
          <span>Hi{name ? ` ${name}` : ''},</span>
          <h2>what did you eat, drink or do?</h2>
          <p><Check aria-hidden="true" />You check everything before it’s added</p>
        </div>
      ) : msgs.map((m) => m.from === 'me'
        ? <div key={m.id} className="mfdai-me"><p>{m.text}</p></div>
        : <div key={m.id} className={`mfdai-ai${m.cards?.length && m.cards.every((c) => c.state === 'replaced') ? ' old' : ''}${m.error ? ' err' : ''}`}>
            <p><Sparkles className="mfdai-mark" aria-hidden="true" />{m.text}</p>
            {m.error && m.detail && <small className="mfdai-errdetail">Google: {m.detail}</small>}
            {m.error && m.retry && m === msgs[msgs.length - 1] && <button className="mfdai-retry" disabled={busy} onClick={() => void send(m)}><RotateCcw aria-hidden="true" />Try again</button>}
            {m.link && <button className="mfdai-linkcard" onClick={() => navigate('/coach')}><Bot aria-hidden="true" /><span className="grow"><b>ChatGPT & Claude</b><span>Connected through MFD</span></span><ExternalLink className="mfdai-out" aria-hidden="true" /></button>}
            {m.cards?.map((c, i) => <CardView key={i} c={c} canUndo={undos.has(`${m.id}:${i}`)} onEdit={(card) => patchCard(m.id, i, { card })}
              onAdd={() => add(m.id, i, c)} onUndo={() => undo(m.id, i)} onChange={change} />)}
          </div>)}
      {busy && <div className="mfdai-ai"><p className="mfdai-thinking" aria-label="MFD AI is thinking"><Sparkles className="mfdai-mark" aria-hidden="true" /><i /><i /><i /></p>
        {slow && <small className="mfdai-slow">Gemini is slower right now. Free keys get about 20 fast answers a day; this can take up to a minute.</small>}</div>}
      <div ref={end} />
    </div>

    {key && <form className="mfdai-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <textarea ref={input} rows={1} aria-label="Message MFD AI" placeholder={hint || 'Message MFD AI'} value={text} maxLength={1000} autoFocus={!demo && msgs.length === 0}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); void send(); } }} />
      <button className="mfdai-send" aria-label="Send" disabled={!text.trim() || busy}><ArrowUp /></button>
    </form>}

    <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Chats">
      <div className="stack mfdai-history">
        <button className="btn btn-primary btn-block" onClick={newChat}><Plus aria-hidden="true" />New chat</button>
        {chats.length === 0 ? <p className="mfdai-note">No earlier chats. Chats are kept on this device for 7 days.</p> : <>
          {[...new Set(chats.map((c) => chatDay(c.updatedAt)))].map((day) => <section key={day}>
            <div className="mfdai-eyebrow">{day}</div>
            <ul className="mfdai-chats">
              {chats.filter((c) => chatDay(c.updatedAt) === day).map((c) => <SwipeRow key={c.id} label={`Open chat: ${c.title}`} clearLabel="Delete"
                className={c.id === chatId ? 'current' : ''} onOpen={() => openChat(c)} onClear={() => { deleteChat(c.id); setChats((l) => l.filter((x) => x.id !== c.id)); if (c.id === chatId) setMsgsState([]); }}>
                <span className="mfdai-chatrow"><span className="mfdai-chatic"><MessageSquare aria-hidden="true" /></span>
                  <span className="grow"><b>{c.title}</b><span>{c.added ? `${c.added} added · ` : ''}{time(c.updatedAt)}</span></span><ChevronRight className="chev" aria-hidden="true" /></span>
              </SwipeRow>)}
            </ul>
          </section>)}
          <p className="mfdai-note">Kept on this device for 7 days after the last message. Swipe left to delete one. What you added stays in your diary.</p>
          <button className="btn btn-soft btn-block" onClick={() => { deleteAllChats(); setChats([]); setMsgsState([]); setChatId(newId()); }}><Trash2 aria-hidden="true" />Delete all chats</button>
        </>}
        <div className="mfdai-keyrow"><KeyRound aria-hidden="true" /><span className="grow"><b>{key ? maskedKey(key) : ''}</b><span>Gemini key · on this device only</span></span>
          <button className="mfdai-undo" onClick={() => { forgetGeminiKey(); setKey(null); setHistoryOpen(false); }}>Remove</button></div>
        <Facts />
      </div>
    </Sheet>
  </div>;
}

function Actions({ c, canUndo, onAdd, onUndo, onChange, label = 'Add', done = 'Added' }: { c: CardState; canUndo: boolean; onAdd: () => void; onUndo: () => void; onChange: () => void; label?: string; done?: string }) {
  if (c.state === 'added') return <div className="mfdai-added"><Check aria-hidden="true" /><span className="grow">{done}</span>{canUndo && <button className="mfdai-undo" onClick={onUndo}><Undo2 aria-hidden="true" />Undo</button>}</div>;
  return <>
    {c.error && <p className="mfdai-carderr" role="alert">{c.error}</p>}
    <div className="mfdai-actions"><button className="btn btn-soft" onClick={onChange}>Change</button><button className="btn btn-primary" onClick={onAdd}>{label === 'Start' ? <Play aria-hidden="true" /> : <Check aria-hidden="true" />}{label}</button></div>
  </>;
}

function CardView({ c, canUndo, onEdit, onAdd, onUndo, onChange }: { c: CardState; canUndo: boolean; onEdit: (card: Card) => void; onAdd: () => void; onUndo: () => void; onChange: () => void }) {
  const card = c.card, ask = c.state === 'ask', act = { c, canUndo, onAdd, onUndo, onChange };
  if (c.state === 'replaced') return <div className="mfdai-card replaced"><span>{card.kind === 'food' ? `${MEAL_LABEL[card.meal]} · ≈ ${r(totals(card.lines).kcal)} kcal` : cardSummary(card).slice(0, 40)}</span><span>Changed</span></div>;

  if (card.kind === 'food') {
    const t = totals(card.lines), mac = t.p * 4 + t.c * 4 + t.f * 9 || 1, estimated = card.lines.some((l) => l.source === 'estimate');
    const step = (l: FoodLine) => (l.unit === 'g' || l.unit === 'ml' ? 10 : l.qty < 1 || l.unit === 'cup' ? 0.5 : 1);
    const setQty = (i: number, d: number) => onEdit({ ...card, lines: card.lines.map((l, j) => (j === i ? { ...l, qty: Math.max(step(l), Math.round((l.qty + d) * 100) / 100) } : l)) });
    return <div className="mfdai-card">
      <div className="mfdai-cardtop">
        <label className="mfdai-pill mfdai-select"><Utensils aria-hidden="true" />{MEAL_LABEL[card.meal]}{ask && <ChevronDown aria-hidden="true" />}
          {ask && <select aria-label="Meal" value={card.meal} onChange={(e) => onEdit({ ...card, meal: e.target.value as Meal })}>{MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select>}</label>
        <span className="mfdai-pill plain">{dayLabel(card.day)}</span>
        {estimated && <span className="badge ai mfdai-est">Estimate</span>}
      </div>
      <div className="mfdai-total tnum">{estimated && <span className="approx">≈</span>}{r(t.kcal)}<small>kcal</small></div>
      <div className="mfdai-macbar" aria-hidden="true"><i className="p" style={{ flexGrow: (t.p * 4) / mac }} /><i className="c" style={{ flexGrow: (t.c * 4) / mac }} /><i className="f" style={{ flexGrow: (t.f * 9) / mac }} /></div>
      <div className="mfdai-macros"><span><i className="p" />{r(t.p)} g<small>protein</small></span><span><i className="c" />{r(t.c)} g<small>carbs</small></span><span><i className="f" />{r(t.f)} g<small>fat</small></span></div>
      <div className="mfdai-lines">
        {card.lines.map((l, i) => { const g = l.unit === 'g' || l.unit === 'ml'; return <div key={i} className="mfdai-line">
          <span className={`mfdai-src s-${l.source}`} title={l.source === 'estimate' ? 'Estimated' : 'Your food'}>{l.source === 'estimate' ? <Sparkles aria-hidden="true" /> : <Database aria-hidden="true" />}</span>
          <span className="grow"><b>{l.name}</b><span className="tnum">{g ? `${r(l.qty)} ${l.unit}` : `${r(l.qty * l.grams)} g`} · {r(l.qty * l.kcal)} kcal</span></span>
          {ask ? <span className="mfdai-step" role="group" aria-label={`${l.name} amount`}>
            <button aria-label="Less" onClick={() => setQty(i, -step(l))}><Minus /></button><b className="tnum">{g ? r(l.qty) : l.qty}</b><button aria-label="More" onClick={() => setQty(i, step(l))}><Plus /></button>
          </span> : <span className="mfdai-qty tnum">{g ? `${r(l.qty)} ${l.unit}` : `${l.qty} ${l.unit}`}</span>}
        </div>; })}
      </div>
      <Actions {...act} />
    </div>;
  }
  if (card.kind === 'workout' || card.kind === 'routine') return <ExerciseCard card={card} ask={ask} onEdit={onEdit} actions={<Actions {...act} label={card.kind === 'routine' ? 'Save' : 'Add'} done={card.kind === 'routine' ? 'Saved to Routines' : 'Added'} />} />;
  if (card.kind === 'start') return <div className="mfdai-card">
    <div className="mfdai-simple"><span className="mfdai-ic k-workout"><Play aria-hidden="true" /></span>
      <span className="grow"><span className="mfdai-eyebrow">Start workout</span><b className="mfdai-ex">{card.name}</b>
        <span className="sub">{card.routineId ? `${card.exercises} exercises · from your routines` : 'No routine with this name in Training'}</span></span></div>
    {card.routineId ? <Actions {...act} label="Start" done="Started" /> : <div className="mfdai-actions one"><button className="btn btn-soft" onClick={() => navigate('/training')}>Open Training</button></div>}
  </div>;

  // Simple cards: one big value, or a few chips.
  const s = card.kind === 'weight' ? { icon: <Scale />, k: 'weight', label: 'Weight', value: <>{card.kg}<small> kg</small></>, chips: [] as string[],
      side: card.lastKg !== undefined ? <span className={`mfdai-delta${card.kg < card.lastKg ? ' down' : ''}`}>{card.kg >= card.lastKg ? '+' : ''}{Math.round((card.kg - card.lastKg) * 10) / 10} kg<small>since {dayLabel(card.lastDate!)}</small></span> : null }
    : card.kind === 'water' ? { icon: <Droplet />, k: 'water', label: 'Water', value: <>{card.ml}<small> ml</small></>, chips: [], side: null }
    : card.kind === 'measure' ? { icon: <Ruler />, k: 'measure', label: 'Measurements', value: null, side: null, chips: Object.entries(card.values).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v} cm`) }
    : { icon: <Moon />, k: 'checkin', label: 'Recovery', value: null, side: null,
        chips: [card.sleep !== undefined && `Sleep ${card.sleep} h`, card.energy !== undefined && `Energy ${card.energy}/5`, card.soreness !== undefined && `Soreness ${card.soreness}/5`].filter(Boolean) as string[] };
  return <div className="mfdai-card">
    <div className="mfdai-simple"><span className={`mfdai-ic k-${s.k}`} aria-hidden="true">{s.icon}</span>
      <span className="grow"><span className="mfdai-eyebrow">{s.label} · {dayLabel(card.day)}</span>{s.value && <b className="tnum">{s.value}</b>}
        {s.chips.length > 0 && <span className="mfdai-setchips big tnum">{s.chips.map((x) => <span key={x}>{x}</span>)}</span>}</span>
      {s.side}</div>
    <Actions {...act} />
  </div>;
}

/** A finished workout or a routine: stat tiles, then one row per exercise with its sets as chips. */
function ExerciseCard({ card, ask, onEdit, actions }: { card: Extract<Card, { kind: 'workout' | 'routine' }>; ask: boolean; onEdit: (c: Card) => void; actions: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const routine = card.kind === 'routine', sets = card.exercises.reduce((n, e) => n + e.sets.length, 0);
  const vol = card.exercises.reduce((v, e) => v + e.sets.reduce((x, s) => x + (s.reps ?? 0) * (s.kg ?? 0), 0), 0);
  const shown = open || card.exercises.length <= 4 ? card.exercises : card.exercises.slice(0, 3);
  const unknown = card.exercises.filter((e) => e.isNew).length;
  const folders = folderNames();
  const group = (e: Ex) => {
    const out: { n: number; label: string }[] = [];
    for (const x of e.sets) {
      const label = [x.reps !== undefined ? `${x.reps}` : '', x.kg ? `${x.kg} kg` : '', x.seconds ? `${Math.round(x.seconds / 60)} min` : '', x.km ? `${x.km} km` : ''].filter(Boolean).join(' · ');
      const last = out[out.length - 1]; if (last && last.label === label) last.n++; else out.push({ n: 1, label });
    }
    return out;
  };
  const remove = (e: Ex) => onEdit({ ...card, exercises: card.exercises.filter((x) => x !== e) });
  return <div className="mfdai-card">
    <div className="mfdai-cardtop">
      <span className={`mfdai-pill${routine ? ' rt' : ' wk'}`}>{routine ? <ListChecks aria-hidden="true" /> : <Dumbbell aria-hidden="true" />}{routine ? 'Routine' : 'Workout'}</span>
      {routine ? <label className="mfdai-pill plain mfdai-select"><Folder aria-hidden="true" />{card.folder || 'No folder'}{ask && <ChevronDown aria-hidden="true" />}
        {ask && <select aria-label="Folder" value={card.folder} onChange={(e) => onEdit({ ...card, folder: e.target.value })}>
          <option value="">No folder</option>{[...new Set([...folders, ...(card.folder ? [card.folder] : [])])].map((f) => <option key={f} value={f}>{folders.includes(f) ? f : `${f} (new)`}</option>)}</select>}</label>
        : <span className="mfdai-pill plain">{dayLabel(card.day)}{card.minutes ? ` · ${card.minutes} min` : ''}</span>}
      {routine && card.suggested && <span className="badge ai mfdai-est">Draft</span>}
    </div>
    <div className="mfdai-wtitle">{routine ? card.name : card.title}</div>
    <div className="mfdai-stats tnum">
      <span><b>{card.exercises.length}</b>exercises</span><span><b>{sets}</b>sets</span>
      {routine ? <span><b>~{Math.round(sets * 2.5)}</b>min</span> : vol > 0 ? <span><b>{vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : r(vol)}<small> kg</small></b>volume</span> : null}
    </div>
    <div className="mfdai-exlist">
      {shown.map((e) => <div key={e.name + card.exercises.indexOf(e)} className="mfdai-exrow">
        <span className="mfdai-exnum tnum">{card.exercises.indexOf(e) + 1}</span>
        <span className="grow"><b>{e.name}{e.isNew && <span className="mfdai-new">Not in catalogue</span>}</b>
          <span className="mfdai-setchips tnum">{group(e).map((g, j) => <span key={j}>{g.n} × {g.label}</span>)}</span></span>
        {ask && card.exercises.length > 1 && <button className="icon-btn sm mfdai-exdel" aria-label={`Remove ${e.name}`} onClick={() => remove(e)}><X /></button>}
      </div>)}
      {!open && card.exercises.length > 4 && <button className="mfdai-more" onClick={() => setOpen(true)}>Show all {card.exercises.length}<ChevronDown aria-hidden="true" /></button>}
    </div>
    {ask && unknown > 0 && <p className="mfdai-carderr soft">{unknown === 1 ? 'One exercise isn’t' : `${unknown} exercises aren’t`} in the catalogue and will be left out. Add {unknown === 1 ? 'it' : 'them'} in Training first, or remove {unknown === 1 ? 'it' : 'them'} here.</p>}
    {actions}
  </div>;
}

/** What happens with the key and messages, as three short facts. */
function Facts() {
  return <div className="mfdai-facts">
    <span><Lock aria-hidden="true" />Key stays on this device</span>
    <span><Send aria-hidden="true" />Only what you type goes to Google. Never your diary or Cycle & Health</span>
    <span><Globe aria-hidden="true" />EU, UK, CH: not used to train Google’s AI. Elsewhere it may be</span>
    <span><Timer aria-hidden="true" />Free key: about 20 fast answers a day, then slower ones</span>
  </div>;
}

function KeySetup({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await saveGeminiKey(key); toast('MFD AI is ready'); onDone(); } catch (e) { setError(geminiErrorText(e)); } finally { setBusy(false); }
  }
  return <div className="mfdai-setup">
    <div className="mfdai-hello"><span>Set up</span><h2>Add your free Gemini key</h2></div>
    <section className="mfdai-card">
      <ol className="ai-steps">
        <li><b><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Open aistudio.google.com/apikey <ExternalLink aria-hidden="true" /></a></b><span className="muted small">Sign in with Google</span></li>
        <li><b>Create API key</b><span className="muted small">Copy it</span></li>
        <li><b>Paste it here</b></li>
      </ol>
      <form onSubmit={(e) => { e.preventDefault(); if (key.trim() && !busy) void save(); }}>
        <input className="input mfdai-keyinput" aria-label="Gemini API key" placeholder="Paste your key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy} />
        {error && <p className="mfdai-carderr" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={!key.trim() || busy}>{busy ? 'Checking with Google…' : 'Save and test'}</button>
      </form>
    </section>
    <Facts />
  </div>;
}
