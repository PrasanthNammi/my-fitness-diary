// Cycle & Health → Report for your doctor: one printable page (Print / Save as PDF) with what the person recorded in
// the chosen range: cycles, conditions, medicines, lab results with each report's own range, and frequent symptoms.
// It states facts only: no interpretation, no diagnosis, no fertile days (docs/cycle/EVIDENCE.md).
import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useDB } from '../../data/store';
import { TopBar, toast } from '../../components/ui';
import { cycleRangeStats, rangeName } from '../../domain/cycleRange';
import { periods } from '../../domain/cycle';
import { rangeStart, type RangeDays } from '../../domain/progressStats';
import type { CycleDay, ISODate } from '../../domain/types';
import { getProgressRange, setProgressRange } from '../../lib/progressRange';
import { ask, inApp } from '../../lib/native';
import { cycleAppSupported } from '../../lib/cycleHealth';
import { RangePicker } from '../progress/RangePicker';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const long = (d?: ISODate) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const FLOW = ['light', 'medium', 'heavy', 'very_heavy'];
const LAB: Record<string, string> = { tsh: 'TSH', ft4: 'Free T4', ft3: 'Free T3' };
const COND: Record<string, string> = { pcos: 'PCOS', hypothyroidism: 'Hypothyroidism', hyperthyroidism: 'Hyperthyroidism', thyroid_other: 'Thyroid condition' };

export function CycleReport() {
  const c = useDB((d) => d.cycle), workouts = useDB((d) => d.workouts), profile = useDB((d) => d.profile);
  const [range, setRangeState] = useState<RangeDays>(getProgressRange() === 30 ? 365 : getProgressRange());
  const setRange = (r: RangeDays) => { setProgressRange(r); setRangeState(r); };
  const today = localToday(), from = rangeStart(range);
  const st = useMemo(() => cycleRangeStats(c.days, workouts, today, from), [c.days, workouts, today, from]);
  const rows = useMemo(() => {
    const byDate = new Map(c.days.map((d) => [d.date, d] as const));
    return periods(c.days.filter((d) => d.date <= today)).filter((p) => !from || p.start >= from).map((p, i, all) => {
      const inP: CycleDay[] = []; for (const [date, d] of byDate) if (date >= p.start && date <= p.end) inP.push(d);
      const flow = Math.max(-1, ...inP.map((d) => FLOW.indexOf(d.flow ?? ''))), pain = Math.max(-1, ...inP.map((d) => d.pain ?? -1));
      const next = all[i + 1];
      return { start: p.start, len: next ? Math.round((Date.parse(next.start) - Date.parse(p.start)) / 864e5) : null, days: p.length,
        flow: flow >= 0 ? FLOW[flow]!.replace('_', ' ') : '', pain: pain >= 0 ? pain : null };
    });
  }, [c.days, today, from]);
  const labs = c.labs.filter((l) => !from || l.date >= from).sort((a, b) => b.date.localeCompare(a.date));
  const since90 = new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10);
  const meds = c.meds.map((m) => { const ds = c.doses.filter((x) => x.medId === m.id && x.date >= since90); return { m, taken: ds.filter((x) => x.status === 'taken').length, missed: ds.filter((x) => x.status === 'missed').length }; });

  async function print() {
    if (!inApp()) return window.print();
    if (!cycleAppSupported()) return toast('Update the MFD app to print (Settings → Health & devices → Phone app)');
    try { await ask('print', { name: 'MFD cycle report' }); } catch { toast('Could not open printing'); }
  }

  return <>
    <TopBar title="Report for your doctor" back="/settings/cycle" />
    <div className="screen cy-report-screen">
      <div className="no-print"><RangePicker value={range} onChange={setRange} />
        <button className="btn btn-primary btn-block cy-print" onClick={print}><Printer aria-hidden="true" />Print or save as PDF</button></div>
      <article className="cy-report">
        <h1>Cycle &amp; Health summary</h1>
        <p className="cy-rmeta">{profile?.name ? `${profile.name} · ` : ''}{rangeName(range)} ({from ? `${long(from)} – ` : 'up to '}{long(today)}) · made {long(today)} with My Fitness Diary</p>
        <p className="cy-rnote">Recorded by the person in the app. Not a diagnosis; dates logged from memory may be approximate. Days without a log are unknown.</p>

        <h2>Cycles</h2>
        {st.usual !== null ? <p>Usual cycle <b>{st.usual} days</b> · shortest–longest <b>{st.shortest === st.longest ? st.shortest : `${st.shortest}–${st.longest}`} days</b> · {st.cycles.length} complete {st.cycles.length === 1 ? 'cycle' : 'cycles'} · usual period <b>{st.periodLen ?? '–'} days</b></p>
          : <p>No complete cycle in this range.</p>}
        {rows.length > 0 && <table><thead><tr><th>Period started</th><th>Cycle length</th><th>Bleeding days</th><th>Heaviest flow</th><th>Most pain (0–10)</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.start}><td>{long(r.start)}</td><td>{r.len ?? 'ongoing'}</td><td>{r.days}</td><td>{r.flow}</td><td>{r.pain ?? ''}</td></tr>)}</tbody></table>}

        {c.conditions.length > 0 && <><h2>Conditions</h2>
          <ul>{c.conditions.map((x) => <li key={x.id}>{x.kind === 'other' ? x.name : COND[x.kind]} · {x.status}{x.since ? ` since ${long(x.since)}` : ''}{x.note ? ` · ${x.note}` : ''}</li>)}</ul></>}

        {meds.length > 0 && <><h2>Medicines</h2>
          <table><thead><tr><th>Medicine</th><th>Dose</th><th>Times</th><th>From – to</th><th>Last 90 days</th></tr></thead>
            <tbody>{meds.map(({ m, taken, missed }) => <tr key={m.id}><td>{m.name}</td><td>{m.dose ? `${m.dose} ${m.unit ?? ''}` : ''}</td><td>{m.times.join(', ')}</td>
              <td>{m.start ? long(m.start) : ''}{m.end ? ` – ${long(m.end)}` : ''}</td><td>{taken || missed ? `${taken} taken, ${missed} missed` : 'not logged'}</td></tr>)}</tbody></table></>}

        {labs.length > 0 && <><h2>Lab results</h2>
          <table><thead><tr><th>Date</th><th>Test</th><th>Result</th><th>Lab’s range</th></tr></thead>
            <tbody>{labs.map((l) => <tr key={l.id}><td>{long(l.date)}</td><td>{l.test === 'other' ? l.name : LAB[l.test]}</td><td>{l.value} {l.unit ?? ''}</td>
              <td>{l.low != null || l.high != null ? `${l.low ?? ''}–${l.high ?? ''} ${l.unit ?? ''}` : ''}</td></tr>)}</tbody></table>
          <p className="cy-rnote">Each range is the one printed on that lab’s report.</p></>}

        {st.top.length > 0 && <><h2>Most frequent symptoms</h2>
          <p>{st.top.map(([s, p]) => `${s} ${p}%`).join(' · ')} <span className="cy-rnote">(share of {st.logDays} logged days)</span></p></>}
      </article>
    </div>
  </>;
}
