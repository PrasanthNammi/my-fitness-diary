// Cycle & Health → Log (one day): big tiles and chips, one scroll, Save at the bottom. A day with nothing set is
// "not logged"; "Nothing to note" is its own choice. Fertility observations are recorded only.
import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleHelp, Droplet, Moon, NotebookPen, Pill, Plus, Target, Minus } from 'lucide-react';
import { useDB } from '../../data/store';
import { cycle, defaultCycleSettings } from '../../data/cycle';
import { navigate } from '../../lib/router';
import { Empty, InfoButton, Sheet, TopBar, toast } from '../../components/ui';
import { addDays, cycleNow } from '../../domain/cycle';
import type { Bleeding, CycleDay, Flow, ISODate } from '../../domain/types';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const SYMPTOMS = ['Fatigue', 'Acne', 'Bloating', 'Cramps', 'Headache', 'Hair shedding', 'Unwanted hair', 'Tender breasts', 'Nausea', 'Digestion', 'Feeling cold', 'Feeling hot'];
const SEVERITY = ['', 'mild', 'moderate', 'severe'];
const BLEEDS: { v: Bleeding; label: string; icon: ReactNode }[] = [
  { v: 'none', label: 'None', icon: <Minus /> }, { v: 'spotting', label: 'Spotting', icon: <Dots /> }, { v: 'period', label: 'Period', icon: <Droplet fill="currentColor" /> },
  { v: 'withdrawal', label: 'Withdrawal', icon: <Droplet /> }, { v: 'unsure', label: 'Not sure', icon: <CircleHelp /> }];
const FLOWS: { v: Flow; label: string; n: number }[] = [{ v: 'light', label: 'Light', n: 1 }, { v: 'medium', label: 'Medium', n: 2 }, { v: 'heavy', label: 'Heavy', n: 3 }, { v: 'very_heavy', label: 'Very heavy', n: 4 }];
const MIND: { k: 'mood' | 'energy' | 'stress' | 'focus'; label: string; words: string[] }[] = [
  { k: 'mood', label: 'Mood', words: ['awful', 'low', 'okay', 'good', 'great'] }, { k: 'energy', label: 'Energy', words: ['drained', 'low', 'okay', 'good', 'full'] },
  { k: 'stress', label: 'Stress', words: ['very stressed', 'stressed', 'some', 'little', 'calm'] }, { k: 'focus', label: 'Focus', words: ['scattered', 'hard', 'okay', 'good', 'sharp'] }];

function Dots() { return <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="8" cy="9" r="1.8" /><circle cx="15" cy="8" r="1.4" /><circle cx="11" cy="14" r="1.6" /><circle cx="16" cy="15" r="1.2" /></g></svg>; }
function Face({ level }: { level: number }) {
  const mouth = ['M8 17c2-2.6 6-2.6 8 0', 'M8.5 16.5c2-1.3 5-1.3 7 0', 'M8.5 15.5h7', 'M8.5 14.5c2 1.5 5 1.5 7 0', 'M8 14c2 3 6 3 8 0'][level];
  return <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9.5" /><path d={mouth} /></g><circle cx="9" cy="10" r="1.2" fill="currentColor" /><circle cx="15" cy="10" r="1.2" fill="currentColor" /></svg>;
}

export function CycleLog({ date }: { date?: string }) {
  const today = localToday();
  const day: ISODate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
  const saved = useDB((d) => d.cycle.days.find((x) => x.date === day)) ?? null;
  const settings = useDB((d) => d.cycle.settings) ?? defaultCycleSettings();
  const days = useDB((d) => d.cycle.days), checkin = useDB((d) => d.checkins.find((c: any) => c.date === day));
  const [draft, setDraft] = useState<CycleDay>(() => saved ? structuredClone(saved) : { id: day, date: day });
  const [sheet, setSheet] = useState<null | 'med' | 'sleep' | 'fert' | 'note' | 'more' | 'own'>(null);
  const cday = useMemo(() => cycleNow(days, day).day, [days, day]);
  const set = (patch: Partial<CycleDay>) => setDraft((d) => { const n: any = { ...d, ...patch }; delete n.nothing; for (const k of Object.keys(patch)) if ((patch as any)[k] === undefined) delete n[k]; return n; });
  const title = day === today ? 'Today' : day === addDays(today, -1) ? 'Yesterday' : new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const symptoms = useMemo(() => { const fav = settings.favourites; return [...fav, ...settings.customSymptoms.filter((s) => !fav.includes(s)), ...SYMPTOMS.filter((s) => !fav.includes(s) && !settings.customSymptoms.includes(s))]; }, [settings]);
  const save = () => { cycle.saveDay(draft); toast('Saved'); navigate('/progress/cycle'); };
  const go = (n: number) => navigate(`/progress/cycle/log/${addDays(day, n)}`, { replace: true });
  const bleeds = !!draft.bleeding && draft.bleeding !== 'none';

  return <>
    <TopBar title={title} back="/progress/cycle" actions={<span className="cy-logtools">
      <button className="icon-btn" aria-label="Previous day" onClick={() => go(-1)}><ChevronLeft /></button>
      <button className="icon-btn" aria-label="Next day" disabled={day >= today} onClick={() => go(1)}><ChevronRight /></button></span>} />
    <div className="screen cy-log">
      {cday && <p className="cy-logsub">Cycle day {cday}</p>}
      <button className={`cy-nothing${draft.nothing ? ' on' : ''}`} aria-pressed={!!draft.nothing} onClick={() => setDraft(draft.nothing ? { id: day, date: day } : { id: day, date: day, nothing: true })}>
        <Check aria-hidden="true" /><span>Nothing to note today<small>Different from skipping: skipped days stay “not logged”.</small></span>
      </button>

      <section className="cy-q"><h4>Bleeding <InfoButton title="Bleeding" label="About bleeding types" lines={[
        'Period: your menstrual bleeding. Only a period starts a new cycle.',
        'Spotting: light bleeding outside a period. It never starts a new cycle.',
        'Withdrawal: bleeding after stopping hormonal medicine, such as a pill break.',
        'Not sure: when you can’t tell; it is kept as you logged it.']} /></h4>
        <div className="cy-tiles">
          {BLEEDS.map((b) => <button key={b.v} className={draft.bleeding === b.v ? 'on' : ''} aria-pressed={draft.bleeding === b.v} onClick={() => set(draft.bleeding === b.v ? { bleeding: undefined, flow: undefined } : { bleeding: b.v, ...(b.v === 'none' ? { flow: undefined, clots: undefined } : {}) })}>{b.icon}{b.label}</button>)}
          <button className={draft.clots || draft.products ? 'on soft' : ''} onClick={() => setSheet('more')}><Plus />Clots &amp; more</button>
        </div>
      </section>

      <section className="cy-q"><h4>Flow</h4>
        <div className="cy-flows">
          {FLOWS.map((f) => <button key={f.v} disabled={!bleeds} className={draft.flow === f.v ? 'on' : ''} aria-pressed={draft.flow === f.v} onClick={() => set({ flow: draft.flow === f.v ? undefined : f.v })}>
            <span className="dd" aria-hidden="true">{Array.from({ length: f.n }, (_, i) => <Droplet key={i} fill="currentColor" />)}</span>{f.label}</button>)}
        </div>
      </section>

      <section className="cy-q"><h4>Pain <span>0 none · 10 worst</span></h4>
        <div className="cy-scale">{Array.from({ length: 11 }, (_, i) => <button key={i} className={draft.pain === i ? 'on' : ''} aria-pressed={draft.pain === i} aria-label={`Pain ${i}`} onClick={() => set({ pain: draft.pain === i ? undefined : i })}>{i}</button>)}</div>
        {(draft.pain ?? 0) > 0 && <div className="cy-chips cy-gap">
          {['Lower belly', 'Back', 'Legs', 'Head', 'Breasts'].map((s) => { const on = draft.painSites?.includes(s); return <button key={s} className={on ? 'on' : ''} aria-pressed={!!on} onClick={() => set({ painSites: on ? draft.painSites!.filter((x) => x !== s) : [...(draft.painSites ?? []), s] })}>{s}</button>; })}
          <button className={draft.painLimits ? 'on' : ''} aria-pressed={!!draft.painLimits} onClick={() => set({ painLimits: draft.painLimits ? undefined : true })}>Stopped my usual day</button>
        </div>}
      </section>

      <section className="cy-q"><h4>How your body feels <InfoButton title="Symptoms" label="About symptoms" lines={['Tap to add a symptom. Tap again to make it moderate, again for severe, and once more to remove it.', '★ marks your favourites; they come first.']} /></h4>
        <div className="cy-chips">
          {symptoms.map((s) => { const lv = draft.symptoms?.[s] ?? 0; return <button key={s} className={lv ? 'on' : ''} aria-pressed={lv > 0} aria-label={`${s}${lv ? `, ${SEVERITY[lv]}` : ''}`}
            onClick={() => { const next = { ...(draft.symptoms ?? {}) }; if (lv >= 3) delete next[s]; else next[s] = lv + 1; set({ symptoms: Object.keys(next).length ? next : undefined }); }}>
            {settings.favourites.includes(s) && <span className="star" aria-hidden="true">★</span>}{s}{lv > 0 && <span className="sev" aria-hidden="true">{'•'.repeat(lv)}</span>}</button>; })}
          <button className="add" onClick={() => setSheet('own')}>+ Your own</button>
        </div>
      </section>

      <section className="cy-q"><h4>Mind &amp; energy</h4>
        <div className="cy-faces">{MIND.map((m) => <div key={m.k} className="row"><span className="lab">{m.label}</span>
          {m.words.map((w, i) => <button key={w} className={draft[m.k] === i + 1 ? 'on' : ''} aria-pressed={draft[m.k] === i + 1} aria-label={`${m.label}: ${w}`} onClick={() => set({ [m.k]: draft[m.k] === i + 1 ? undefined : i + 1 } as any)}><Face level={i} /></button>)}</div>)}</div>
      </section>

      <section className="cy-q"><h4>More</h4>
        <div className="cy-widgets">
          <MedWidget day={day} onOpen={() => setSheet('med')} />
          <button className="cy-wd" onClick={() => setSheet('sleep')}><span className="ai"><Moon /></span><b>Sleep</b><span className="s">{sleepText(checkin?.sleep) || (draft.sleepNotes?.length ? draft.sleepNotes.join(', ') : 'Not logged')}</span></button>
          <button className="cy-wd" onClick={() => setSheet('fert')}><span className="ai"><Target /></span><b>Fertility</b><span className="s">{draft.fertility ? 'Logged' : 'Optional'}</span></button>
          <button className="cy-wd" onClick={() => setSheet('note')}><span className="ai"><NotebookPen /></span><b>Private note</b><span className="s">{draft.note ? 'Written' : 'Empty'}</span></button>
        </div>
      </section>
    </div>
    <div className="cy-savebar"><button className="btn btn-primary btn-block" onClick={save}>Save</button></div>

    <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="Clots & more">
      <div className="cy-sheet">
        <label className="cy-row"><span className="grow"><b>Clots</b></span><input type="checkbox" className="switch" checked={!!draft.clots} onChange={(e) => set({ clots: e.target.checked || undefined })} /></label>
        <label className="cy-field">Products used<input value={draft.products ?? ''} maxLength={200} placeholder="e.g. 3 pads" onChange={(e) => set({ products: e.target.value || undefined })} /></label>
      </div>
    </Sheet>
    <Sheet open={sheet === 'own'} onClose={() => setSheet(null)} title="Your own symptom"><OwnSymptom onAdd={(s) => { cycle.setSettings({ customSymptoms: [...settings.customSymptoms.filter((x) => x !== s), s] }); set({ symptoms: { ...(draft.symptoms ?? {}), [s]: 1 } }); setSheet(null); }} favourites={settings.favourites} all={symptoms} onFav={(f) => cycle.setSettings({ favourites: f })} /></Sheet>
    <Sheet open={sheet === 'med'} onClose={() => setSheet(null)} title="Medicines"><MedSheet day={day} /></Sheet>
    <Sheet open={sheet === 'sleep'} onClose={() => setSheet(null)} title="Sleep">
      <div className="cy-sheet">
        <div className="cy-field">Last night<span>{sleepText(checkin?.sleep) || 'From your recovery check-in when logged'}</span></div>
        <div className="cy-chips">{['Slept well', 'Woke often', 'Still tired'].map((s) => { const on = draft.sleepNotes?.includes(s); return <button key={s} className={on ? 'on' : ''} aria-pressed={!!on} onClick={() => set({ sleepNotes: on ? draft.sleepNotes!.filter((x) => x !== s) : [...(draft.sleepNotes ?? []), s] })}>{s}</button>; })}</div>
      </div>
    </Sheet>
    <Sheet open={sheet === 'fert'} onClose={() => setSheet(null)} title="Fertility observations">
      <div className="cy-sheet">
        <p className="cy-hint">Recorded only. MFD doesn’t work out fertile days from these; with PCOS, LH tests and temperature can be misleading. Your doctor can interpret them.</p>
        <Choice label="Ovulation (LH) test" value={draft.fertility?.lh} options={[['negative', 'Negative'], ['positive', 'Positive'], ['unclear', 'Unclear']]} onChange={(lh) => set({ fertility: tidy({ ...draft.fertility, lh: lh as any }) })} />
        <label className="cy-field">Basal body temperature<input inputMode="decimal" placeholder="36.4 °C" value={draft.fertility?.bbt ?? ''} onChange={(e) => { const v = parseFloat(e.target.value.replace(',', '.')); set({ fertility: tidy({ ...draft.fertility, bbt: v >= 34 && v <= 43 ? v : undefined }) }); }} /></label>
        <Choice label="Cervical mucus" value={draft.fertility?.mucus} options={[['dry', 'Dry'], ['sticky', 'Sticky'], ['creamy', 'Creamy'], ['watery', 'Watery'], ['egg_white', 'Egg-white']]} onChange={(m) => set({ fertility: tidy({ ...draft.fertility, mucus: m as any }) })} />
        <Choice label="Pregnancy test" value={draft.fertility?.pregnancy} options={[['negative', 'Negative'], ['positive', 'Positive']]} onChange={(p) => set({ fertility: tidy({ ...draft.fertility, pregnancy: p as any }) })} />
      </div>
    </Sheet>
    <Sheet open={sheet === 'note'} onClose={() => setSheet(null)} title="Private note">
      <textarea className="cy-note" aria-label="Private note" placeholder="Only you can see this." maxLength={4000} value={draft.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} />
    </Sheet>
  </>;
}

const sleepText = (v: unknown) => { const h = Number(v); return h > 0 ? `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min` : ''; };
const tidy = (o: Record<string, unknown>): any => { const n = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')); return Object.keys(n).length ? n : undefined; };

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (v: string | undefined) => void }) {
  return <div className="cy-choice"><span>{label}</span><div className="cy-chips">{options.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(value === v ? undefined : v)}>{l}</button>)}</div></div>;
}

function OwnSymptom({ onAdd, favourites, all, onFav }: { onAdd: (s: string) => void; favourites: string[]; all: string[]; onFav: (f: string[]) => void }) {
  const [name, setName] = useState('');
  return <div className="cy-sheet">
    <label className="cy-field">Name<input value={name} maxLength={40} placeholder="e.g. Jaw pain" onChange={(e) => setName(e.target.value)} /></label>
    <button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => onAdd(name.trim())}>Add</button>
    <p className="cy-hint">Favourites (★ first in the list):</p>
    <div className="cy-chips">{all.map((s) => { const on = favourites.includes(s); return <button key={s} className={on ? 'on' : ''} aria-pressed={on} onClick={() => onFav(on ? favourites.filter((x) => x !== s) : [...favourites, s])}>{on ? '★ ' : '☆ '}{s}</button>; })}</div>
  </div>;
}

function dueTimes(m: { times: string[] }) { return m.times.length ? m.times : [undefined as unknown as string]; }
function MedWidget({ day, onOpen }: { day: ISODate; onOpen: () => void }) {
  const meds = useDB((d) => d.cycle.meds.filter((m) => (!m.start || m.start <= day) && (!m.end || m.end >= day))), doses = useDB((d) => d.cycle.doses);
  const due = meds.flatMap((m) => dueTimes(m).map((t) => ({ m, t }))), taken = due.filter(({ m, t }) => doses.some((x) => x.medId === m.id && x.date === day && (x.time ?? undefined) === (t || undefined) && x.status === 'taken')).length;
  return <button className={`cy-wd${due.length && taken === due.length ? ' done' : ''}`} onClick={onOpen}><span className="ai"><Pill /></span><b>Medicines</b><span className="s">{due.length ? `${taken} of ${due.length} taken` : 'None added'}</span></button>;
}
function MedSheet({ day }: { day: ISODate }) {
  const meds = useDB((d) => d.cycle.meds.filter((m) => (!m.start || m.start <= day) && (!m.end || m.end >= day))), doses = useDB((d) => d.cycle.doses);
  const [adding, setAdding] = useState(false), [form, setForm] = useState({ name: '', dose: '', unit: 'mg', time: '08:00' });
  return <div className="cy-sheet">
    {meds.length === 0 && !adding && <Empty title="No medicines yet">Add a medicine to tick it off each day.</Empty>}
    {meds.flatMap((m) => dueTimes(m).map((t) => { const dose = doses.find((x) => x.medId === m.id && x.date === day && (x.time ?? undefined) === (t || undefined));
      return <div key={m.id + (t ?? '')} className="cy-med"><span className="grow"><b>{m.name}{m.dose ? ` ${m.dose}${m.unit ? ' ' + m.unit : ''}` : ''}</b><span>{t || 'Any time'}</span></span>
        <button className={dose?.status === 'missed' ? 'on miss' : ''} aria-pressed={dose?.status === 'missed'} onClick={() => cycle.setDose(m.id, day, t || undefined, dose?.status === 'missed' ? null : 'missed')}>Missed</button>
        <button className={`tick${dose?.status === 'taken' ? ' on' : ''}`} aria-pressed={dose?.status === 'taken'} aria-label={`${m.name} taken`} onClick={() => cycle.setDose(m.id, day, t || undefined, dose?.status === 'taken' ? null : 'taken')}><Check /></button></div>; }))}
    {adding ? <div className="cy-addmed">
      <label className="cy-field">Name<input value={form.name} maxLength={120} placeholder="e.g. Levothyroxine" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <div className="cy-two"><label className="cy-field">Dose<input inputMode="decimal" value={form.dose} placeholder="50" onChange={(e) => setForm({ ...form, dose: e.target.value })} /></label>
        <label className="cy-field">Unit<select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{['mg', 'µg', 'g', 'IU', 'ml', 'tablet'].map((u) => <option key={u}>{u}</option>)}</select></label></div>
      <label className="cy-field">Time<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
      <button className="btn btn-primary btn-block" disabled={!form.name.trim()} onClick={() => { const dose = parseFloat(form.dose.replace(',', '.')); cycle.saveMed({ name: form.name, ...(dose > 0 ? { dose } : {}), unit: form.unit, times: form.time ? [form.time] : [], reminder: false }); setAdding(false); setForm({ name: '', dose: '', unit: 'mg', time: '08:00' }); }}>Add medicine</button>
    </div> : <button className="btn btn-soft btn-block" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add medicine</button>}
    <p className="cy-hint">Taken and missed are saved straight away. Manage medicines in Records.</p>
  </div>;
}

/** Insights and Records come in the next steps of the build. */
export function CycleSoon({ page }: { page: string }) {
  return <><TopBar title={page === 'insights' ? 'Insights' : 'Health records'} back="/progress/cycle" /><div className="screen"><Empty title="Coming in this release">This page is being built.</Empty></div></>;
}
