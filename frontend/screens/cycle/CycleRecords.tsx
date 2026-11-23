// Cycle & Health → Health records: conditions, thyroid results (TSH / Free T4 / Free T3 over time, each with the
// report's own range) and medicines. MFD shows results; it never interprets them.
import { useMemo, useState } from 'react';
import { Pill, Plus, Trash2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { cycle } from '../../data/cycle';
import { ConfirmSheet, InfoButton, Sheet, TopBar, toast } from '../../components/ui';
import type { HealthCondition, ISODate, LabResult, Medication } from '../../domain/types';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const KIND: Record<HealthCondition['kind'], string> = { pcos: 'PCOS', hypothyroidism: 'Hypothyroidism', hyperthyroidism: 'Hyperthyroidism', thyroid_other: 'Thyroid condition', other: 'Other' };
const TEST: Record<LabResult['test'], { label: string; unit: string; low?: number; high?: number }> = {
  tsh: { label: 'TSH', unit: 'mIU/L' }, ft4: { label: 'Free T4', unit: 'pmol/L' }, ft3: { label: 'Free T3', unit: 'pmol/L' }, other: { label: 'Other', unit: '' } };
const yearOf = (d?: string) => d?.slice(0, 4);

export function CycleRecords() {
  const conditions = useDB((d) => d.cycle.conditions), labs = useDB((d) => d.cycle.labs), meds = useDB((d) => d.cycle.meds), doses = useDB((d) => d.cycle.doses);
  const [editCond, setEditCond] = useState<Partial<HealthCondition> | null>(null), [editLab, setEditLab] = useState<Partial<LabResult> | null>(null), [editMed, setEditMed] = useState<Partial<Medication> | null>(null);
  const [test, setTest] = useState<LabResult['test']>('tsh'), [span, setSpan] = useState<'1y' | 'all'>('1y');
  const today = localToday(), month = today.slice(0, 7);
  return <>
    <TopBar title="Health records" back="/progress/cycle" />
    <div className="screen cy-records">
      <section className="cy-sec"><div className="cy-sech"><h3>Conditions</h3><button className="cy-link" onClick={() => setEditCond({ kind: 'pcos', status: 'diagnosed' })}><Plus aria-hidden="true" />Add</button></div>
        {conditions.length === 0 ? <p className="cy-hint">Add conditions your doctor diagnosed or that you suspect, such as PCOS or a thyroid condition.</p> :
          <div className="card cy-list">{conditions.map((c) => <button key={c.id} className="cy-li" onClick={() => setEditCond(c)}><span className="grow"><b>{c.kind === 'other' && c.name ? c.name : KIND[c.kind]}</b><span>{c.status === 'diagnosed' ? 'Diagnosed' : 'Suspected'}{c.since ? ` · since ${yearOf(c.since)}` : ''}</span></span><span className={`cy-tag${c.status === 'diagnosed' ? ' on' : ''}`}>{c.status === 'diagnosed' ? 'Diagnosed' : 'Suspected'}</span></button>)}</div>}
      </section>

      <section className="cy-sec"><div className="cy-sech"><h3>Thyroid <InfoButton title="Reading your thyroid chart" label="How to read this chart" lines={[
          'Along the bottom: the date of each test. Results sit at their real dates, so the gaps show how often you were tested. 1Y shows the last year; All shows everything.',
          'Up the side: the result, in the unit from your lab report: TSH in mIU/L, Free T4 and Free T3 usually in pmol/L.',
          'Each dot is one result. The green band is the reference range printed on that lab’s report. Ranges differ between labs, and during pregnancy or treatment your doctor may use a different target, so the band is a guide, not a goal.',
          'TSH is the signal your brain sends to the thyroid; Free T4 and Free T3 are thyroid hormones in the blood. Doctors usually read them together.',
          'Results can change with the time of day, a recent dose of thyroid medicine, illness and biotin supplements. Ask your doctor how to prepare for a test.',
          'MFD shows your results; it doesn’t interpret them. Talk to your doctor about what they mean for you.']} /></h3>
          <button className="cy-link" onClick={() => setEditLab({ test, date: today, unit: TEST[test].unit })}><Plus aria-hidden="true" />Result</button></div>
        <div className="card card-pad cy-thy">
          <div className="cy-seg" role="tablist" aria-label="Test">{(['tsh', 'ft4', 'ft3'] as const).map((t) => <button key={t} role="tab" aria-selected={test === t} className={test === t ? 'on' : ''} onClick={() => setTest(t)}>{TEST[t].label}</button>)}</div>
          <LabChart labs={labs.filter((l) => l.test === test)} span={span} today={today} onPick={setEditLab} />
          <div className="cy-thyfoot"><span>{labs.find((l) => l.test === test)?.unit ?? TEST[test].unit} · green = lab range</span>
            <span className="cy-span">{(['1y', 'all'] as const).map((s) => <button key={s} aria-pressed={span === s} className={span === s ? 'on' : ''} onClick={() => setSpan(s)}>{s === '1y' ? '1Y' : 'All'}</button>)}</span></div>
        </div>
        {labs.some((l) => l.test === 'other') && <div className="card cy-list cy-gap">{labs.filter((l) => l.test === 'other').map((l) => <button key={l.id} className="cy-li" onClick={() => setEditLab(l)}><span className="grow"><b>{l.name || 'Result'}</b><span>{l.date}</span></span><span className="tnum">{l.value} {l.unit}</span></button>)}</div>}
      </section>

      <section className="cy-sec"><div className="cy-sech"><h3>Medicines</h3><button className="cy-link" onClick={() => setEditMed({ times: ['08:00'], reminder: false, unit: 'mg' })}><Plus aria-hidden="true" />Add</button></div>
        {meds.length === 0 ? <p className="cy-hint">Add medicines to tick them off each day in Log.</p> :
          <div className="card cy-list">{meds.map((m) => { const mine = doses.filter((x) => x.medId === m.id && x.date.startsWith(month)); const taken = mine.filter((x) => x.status === 'taken').length;
            return <button key={m.id} className="cy-li" onClick={() => setEditMed(m)}><span className="cy-ic"><Pill /></span><span className="grow"><b>{m.name}{m.dose ? ` ${m.dose} ${m.unit ?? ''}` : ''}</b><span>{m.times.length ? m.times.join(', ') : 'Any time'}{m.end && m.end < today ? ' · ended' : ''}</span></span>{mine.length > 0 && <span className="tnum cy-count">{taken}/{mine.length}</span>}</button>; })}</div>}
        <p className="cy-hint cy-gap">Taken this month, from your log. MFD doesn’t give medicine advice: follow your prescription and your doctor.</p>
      </section>
    </div>

    <ConditionSheet value={editCond} onClose={() => setEditCond(null)} />
    <LabSheet value={editLab} onClose={() => setEditLab(null)} />
    <MedEditSheet value={editMed} onClose={() => setEditMed(null)} />
  </>;
}

/** Results at their real dates: a year or less → month labels, longer → year labels. */
function LabChart({ labs, span, today, onPick }: { labs: LabResult[]; span: '1y' | 'all'; today: ISODate; onPick: (l: LabResult) => void }) {
  const sorted = useMemo(() => [...labs].sort((a, b) => a.date.localeCompare(b.date)), [labs]);
  if (!sorted.length) return <p className="cy-hint cy-chart-empty">No results yet. Add one from your lab report.</p>;
  const end = Date.parse(today), from = span === '1y' ? end - 365 * 864e5 : Date.parse(sorted[0]!.date);
  const pts = sorted.filter((l) => Date.parse(l.date) >= from);
  if (!pts.length) return <p className="cy-hint cy-chart-empty">No results in the last year. Tap All to see older ones.</p>;
  const W = 330, H = 160, P = 28, R = 14, t0 = Math.min(from, Date.parse(pts[0]!.date)), t1 = Math.max(end, t0 + 864e5);
  const x = (d: string) => P + (Date.parse(d) - t0) / (t1 - t0) * (W - P - R);
  const latest = pts[pts.length - 1]!, hi = Math.max(...pts.map((p) => Math.max(p.value, p.high ?? 0))), max = hi <= 0 ? 1 : hi * 1.25;
  const y = (v: number) => H - 22 - (v / max) * (H - 36);
  const step = max > 40 ? 10 : max > 12 ? 5 : max > 6 ? 2 : 1;
  const long = t1 - t0 > 400 * 864e5, ticks: [number, string][] = [];
  if (long) for (let yr = new Date(t0).getFullYear() + 1; yr <= new Date(t1).getFullYear(); yr++) ticks.push([Date.UTC(yr, 0, 1), String(yr)]);
  else { const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); while (d.getTime() <= t1) { if (d.getUTCMonth() % 2 === 0) ticks.push([d.getTime(), d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })]); d.setUTCMonth(d.getUTCMonth() + 1); } }
  const xt = (t: number) => P + (t - t0) / (t1 - t0) * (W - P - R);
  return (
    <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${pts.length} results: ${pts.map((p) => `${p.date} ${p.value}`).join(', ')}`}>
      {latest.low !== undefined && latest.high !== undefined && <rect x={P} y={y(latest.high)} width={W - P - 6} height={Math.max(2, y(latest.low) - y(latest.high))} rx="8" fill="var(--success-soft)" />}
      {Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step).map((v) => <text key={v} x="2" y={y(v) + 4} fontSize="10" fill="var(--faint)">{v}</text>)}
      {ticks.map(([t, l]) => <g key={t}><line x1={xt(t)} x2={xt(t)} y1={H - 20} y2={H - 16} stroke="var(--faint)" /><text x={xt(t)} y={H - 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--muted)">{l}</text></g>)}
      <polyline points={pts.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <g key={p.id} onClick={() => onPick(p)} style={{ cursor: 'pointer' }}>
        <circle cx={x(p.date)} cy={y(p.value)} r={pts.length > 8 ? 4.5 : 5.5} fill="var(--surface)" stroke="var(--brand)" strokeWidth="3" />
        {(pts.length <= 8 || i === 0 || i === pts.length - 1) && <text x={x(p.date)} y={y(p.value) - 10} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ink)">{p.value}</text>}
      </g>)}
    </svg>
  );
}

function ConditionSheet({ value, onClose }: { value: Partial<HealthCondition> | null; onClose: () => void }) {
  const [v, setV] = useState<Partial<HealthCondition>>({}), [del, setDel] = useState(false), open = !!value;
  const key = value ? value.id ?? 'new' : '';
  const [seen, setSeen] = useState(''); if (key !== seen) { setSeen(key); setV(value ?? {}); }
  return <Sheet open={open} onClose={onClose} title={v.id ? 'Condition' : 'Add condition'}>
    <div className="cy-sheet">
      <div className="cy-chips">{(Object.keys(KIND) as HealthCondition['kind'][]).map((k) => <button key={k} className={v.kind === k ? 'on' : ''} aria-pressed={v.kind === k} onClick={() => setV({ ...v, kind: k })}>{KIND[k]}</button>)}</div>
      {v.kind === 'other' && <label className="cy-field">Name<input value={v.name ?? ''} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value || undefined })} /></label>}
      <div className="cy-seg">{(['diagnosed', 'suspected'] as const).map((s) => <button key={s} className={v.status === s ? 'on' : ''} onClick={() => setV({ ...v, status: s })}>{s === 'diagnosed' ? 'Diagnosed' : 'Suspected'}</button>)}</div>
      <label className="cy-field">Since<input type="date" value={v.since ?? ''} onChange={(e) => setV({ ...v, since: e.target.value || undefined })} /></label>
      <label className="cy-field cy-col">Notes<textarea value={v.note ?? ''} maxLength={1000} onChange={(e) => setV({ ...v, note: e.target.value || undefined })} /></label>
      <button className="btn btn-primary btn-block" disabled={!v.kind} onClick={() => { cycle.saveCondition({ status: 'diagnosed', ...v } as HealthCondition); toast('Saved'); onClose(); }}>Save</button>
      {v.id && <button className="btn btn-soft btn-block cy-delete" onClick={() => setDel(true)}><Trash2 aria-hidden="true" />Remove</button>}
    </div>
    <ConfirmSheet open={del} onClose={() => setDel(false)} danger title="Remove this condition?" confirmLabel="Remove" onConfirm={() => { cycle.removeCondition(v.id!); setDel(false); onClose(); }} />
  </Sheet>;
}

function LabSheet({ value, onClose }: { value: Partial<LabResult> | null; onClose: () => void }) {
  const [v, setV] = useState<Partial<LabResult> & { valueText?: string; lowText?: string; highText?: string }>({}), [del, setDel] = useState(false);
  const key = value ? value.id ?? 'new' + value.test : '';
  const [seen, setSeen] = useState(''); if (key !== seen) { setSeen(key); setV(value ? { ...value, valueText: value.value?.toString() ?? '', lowText: value.low?.toString() ?? '', highText: value.high?.toString() ?? '' } : {}); }
  const num = (s?: string) => { const n = parseFloat((s ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : undefined; };
  const val = num(v.valueText), lo = num(v.lowText), hi = num(v.highText), ok = !!v.test && val !== undefined && !!v.date && (lo === undefined || hi === undefined || lo <= hi);
  return <Sheet open={!!value} onClose={onClose} title={v.id ? 'Lab result' : 'Add result'}>
    <div className="cy-sheet">
      <div className="cy-seg">{(Object.keys(TEST) as LabResult['test'][]).map((t) => <button key={t} className={v.test === t ? 'on' : ''} onClick={() => setV({ ...v, test: t, unit: v.unit || TEST[t].unit })}>{TEST[t].label}</button>)}</div>
      {v.test === 'other' && <label className="cy-field">Test name<input value={v.name ?? ''} maxLength={80} placeholder="e.g. Ferritin" onChange={(e) => setV({ ...v, name: e.target.value || undefined })} /></label>}
      <div className="cy-two"><label className="cy-field">Result<input inputMode="decimal" value={v.valueText ?? ''} onChange={(e) => setV({ ...v, valueText: e.target.value })} /></label>
        <label className="cy-field">Unit<input value={v.unit ?? ''} maxLength={20} onChange={(e) => setV({ ...v, unit: e.target.value || undefined })} /></label></div>
      <p className="cy-hint">Reference range, as printed on your report:</p>
      <div className="cy-two"><label className="cy-field">From<input inputMode="decimal" value={v.lowText ?? ''} onChange={(e) => setV({ ...v, lowText: e.target.value })} /></label>
        <label className="cy-field">To<input inputMode="decimal" value={v.highText ?? ''} onChange={(e) => setV({ ...v, highText: e.target.value })} /></label></div>
      <label className="cy-field">Date<input type="date" value={v.date ?? ''} max={localToday()} onChange={(e) => setV({ ...v, date: e.target.value || undefined })} /></label>
      <button className="btn btn-primary btn-block" disabled={!ok} onClick={() => { cycle.saveLab({ id: v.id, test: v.test!, value: val!, date: v.date!, ...(v.name ? { name: v.name } : {}), ...(v.unit ? { unit: v.unit } : {}), ...(lo !== undefined ? { low: lo } : {}), ...(hi !== undefined ? { high: hi } : {}), ...(v.note ? { note: v.note } : {}) } as LabResult); toast('Saved'); onClose(); }}>Save</button>
      {v.id && <button className="btn btn-soft btn-block cy-delete" onClick={() => setDel(true)}><Trash2 aria-hidden="true" />Remove</button>}
    </div>
    <ConfirmSheet open={del} onClose={() => setDel(false)} danger title="Remove this result?" confirmLabel="Remove" onConfirm={() => { cycle.removeLab(v.id!); setDel(false); onClose(); }} />
  </Sheet>;
}

function MedEditSheet({ value, onClose }: { value: Partial<Medication> | null; onClose: () => void }) {
  const [v, setV] = useState<Partial<Medication> & { doseText?: string }>({}), [del, setDel] = useState(false);
  const key = value ? value.id ?? 'new' : '';
  const [seen, setSeen] = useState(''); if (key !== seen) { setSeen(key); setV(value ? { ...value, doseText: value.dose?.toString() ?? '' } : {}); }
  const dose = parseFloat((v.doseText ?? '').replace(',', '.'));
  return <Sheet open={!!value} onClose={onClose} title={v.id ? 'Medicine' : 'Add medicine'}>
    <div className="cy-sheet">
      <label className="cy-field">Name<input value={v.name ?? ''} maxLength={120} placeholder="e.g. Levothyroxine" onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <div className="cy-two"><label className="cy-field">Dose<input inputMode="decimal" value={v.doseText ?? ''} onChange={(e) => setV({ ...v, doseText: e.target.value })} /></label>
        <label className="cy-field">Unit<select value={v.unit ?? 'mg'} onChange={(e) => setV({ ...v, unit: e.target.value })}>{['mg', 'µg', 'g', 'IU', 'ml', 'tablet'].map((u) => <option key={u}>{u}</option>)}</select></label></div>
      <label className="cy-field">Time<input type="time" value={v.times?.[0] ?? ''} onChange={(e) => setV({ ...v, times: e.target.value ? [e.target.value] : [] })} /></label>
      <div className="cy-two"><label className="cy-field">Start<input type="date" value={v.start ?? ''} onChange={(e) => setV({ ...v, start: e.target.value || undefined })} /></label>
        <label className="cy-field">End<input type="date" value={v.end ?? ''} min={v.start} onChange={(e) => setV({ ...v, end: e.target.value || undefined })} /></label></div>
      <label className="cy-row"><span className="grow"><b>Reminder</b><span>Discreet by default (Settings → Cycle & Health)</span></span><input type="checkbox" className="switch" checked={!!v.reminder} onChange={(e) => setV({ ...v, reminder: e.target.checked })} /></label>
      <button className="btn btn-primary btn-block" disabled={!v.name?.trim() || (!!v.start && !!v.end && v.end < v.start)} onClick={() => { cycle.saveMed({ id: v.id, name: v.name!, times: v.times ?? [], reminder: !!v.reminder, ...(dose > 0 ? { dose } : {}), ...(v.unit ? { unit: v.unit } : {}), ...(v.start ? { start: v.start } : {}), ...(v.end ? { end: v.end } : {}), ...(v.notes ? { notes: v.notes } : {}) }); toast('Saved'); onClose(); }}>Save</button>
      {v.id && <button className="btn btn-soft btn-block cy-delete" onClick={() => setDel(true)}><Trash2 aria-hidden="true" />Remove</button>}
    </div>
    <ConfirmSheet open={del} onClose={() => setDel(false)} danger title="Remove this medicine?" body="Its taken/missed history stays in your log." confirmLabel="Remove" onConfirm={() => { cycle.removeMed(v.id!); setDel(false); onClose(); }} />
  </Sheet>;
}

