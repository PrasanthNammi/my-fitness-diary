// Cycle & Health → Insights: four tiles, cycle lengths as bars (normal band, median), the most frequent symptoms
// (out of logged days only) and, if switched on, workouts by cycle week. Explanations sit behind ⓘ.
import { useMemo, useState, type ReactNode } from 'react';
import { Dumbbell, Moon, Scale } from 'lucide-react';
import { useDB } from '../../data/store';
import { Empty, InfoButton, TopBar } from '../../components/ui';
import type { ISODate } from '../../domain/types';
import { median, rangeName } from '../../domain/cycleRange';
import { cyclePatterns, MAX_DAY, type CyclePatterns } from '../../domain/cyclePatterns';
import { rangeStart, type RangeDays } from '../../domain/progressStats';
import { getProgressRange, setProgressRange } from '../../lib/progressRange';
import { RangePicker } from '../progress/RangePicker';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export function CycleInsights() {
  const days = useDB((d) => d.cycle.days), compare = useDB((d) => !!d.cycle.settings?.compare), workouts = useDB((d) => d.workouts),
    weights = useDB((d) => d.weights), checkins = useDB((d) => d.checkins);
  const [range, setRangeState] = useState<RangeDays>(getProgressRange());
  const setRange = (r: RangeDays) => { setProgressRange(r); setRangeState(r); };
  const today = localToday();
  const p = useMemo(() => cyclePatterns(days, workouts, weights, checkins, today, rangeStart(range)), [days, workouts, weights, checkins, today, range]);
  const hasPeriod = p.periodDays.some((x) => x.n), hasMood = p.weeks.some((w) => w.n), hasBody = compare && p.body.some((b) => (b.workouts ?? 0) > 0 || b.weight !== null || b.sleep !== null);

  return <>
    <TopBar title="Insights" back="/progress/cycle" />
    <div className="screen cy-insights">
      <RangePicker value={range} onChange={setRange} />
      {p.cycles === 0 ? <Empty title={`No cycle in ${rangeName(range).toLowerCase()}`}>Patterns appear once a period is logged in this range.</Empty> : <>
        <p className="cy-ins-sub">Patterns across your cycle · {p.cycles} {p.cycles === 1 ? 'cycle' : 'cycles'} · {rangeName(range).toLowerCase()}</p>
        {p.symptoms.length > 0 && <section className="cy-sec"><div className="cy-sech"><h3>Symptoms by cycle day <InfoButton title="Symptoms by cycle day" label="About this chart" lines={[
          'Each row is a symptom, each column a day of your cycle (day 1 = first day of your period).',
          'The darker the square, the more often you logged that symptom on that cycle day. Grey: no logs on that day yet.',
          'Only days you logged count. A pattern to show your doctor, not a diagnosis.']} /></h3></div>
          <div className="card cy-chartcard"><SymptomMap p={p} /></div></section>}
        {hasPeriod && <section className="cy-sec"><div className="cy-sech"><h3>Your period, day by day <InfoButton title="Your period, day by day" label="About this chart" lines={[
          'Average flow (light to very heavy) and pain (0–10) on each day of your periods, from the days where you recorded them.']} /></h3></div>
          <div className="card cy-chartcard"><PeriodDays p={p} /></div></section>}
        {hasMood && <section className="cy-sec"><div className="cy-sech"><h3>Mood & energy <InfoButton title="Mood & energy by cycle week" label="About this chart" lines={[
          'Your average mood, energy and calm (1–5) in each week of your cycles. Week 4 includes any later days.', 'Only days where you logged them count.']} /></h3></div>
          <div className="card cy-chartcard"><MoodWeeks p={p} /></div></section>}
        {hasBody && <section className="cy-sec"><div className="cy-sech"><h3>Body & training <InfoButton title="Body & training by cycle week" label="About this comparison" lines={[
          'Workouts per week, your average weight and sleep in each week of your complete cycles (week 4 includes any later days).', 'For your own comparison; one doesn’t cause the other.']} /></h3></div>
          <BodyWeeks p={p} /></section>}
      </>}
    </div>
  </>;
}

function SymptomMap({ p }: { p: CyclePatterns }) {
  const L = 78, W = 334, cw = (W - L) / MAX_DAY, rh = 22, H = p.symptoms.length * rh + 22;
  return <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.symptoms.map((s) => `${s.name}: most often on cycle days ${s.byDay.map((v, i) => [v ?? 0, i + 1] as const).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]).sort((a, b) => a - b).join(', ')}`).join('; ')}>
    {p.symptoms.map((s, r) => <g key={s.name}>
      <text x="0" y={r * rh + 15} fontSize="11.5" fontWeight="700" fill="var(--ink)">{s.name.length > 11 ? s.name.slice(0, 10) + '…' : s.name}</text>
      {s.byDay.map((v, i) => <rect key={i} x={L + i * cw + 0.6} y={r * rh + 3} width={cw - 1.2} height={rh - 6} rx="2"
        fill={v === null ? 'var(--surface-2)' : 'var(--brand)'} fillOpacity={v === null ? 1 : 0.1 + 0.9 * v} />)}
    </g>)}
    {[1, 7, 14, 21, 28, 35].map((d) => <text key={d} x={d === 35 ? W : L + (d - 0.5) * cw} y={H - 4} textAnchor={d === 35 ? 'end' : 'middle'} fontSize="10" fill="var(--muted)">{d}</text>)}
  </svg>;
}

function PeriodDays({ p }: { p: CyclePatterns }) {
  const W = 334, H = 150, L = 40, cw = (W - L) / 7, bw = Math.min(16, cw * 0.32), fy = (v: number) => 60 - (v / 4) * 48, py = (v: number) => 118 - (v / 10) * 48;
  return <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.periodDays.map((d, i) => `Day ${i + 1}: flow ${d.flow?.toFixed(1) ?? 'not logged'}, pain ${d.pain?.toFixed(1) ?? 'not logged'}`).join('; ')}>
    <text x="0" y="40" fontSize="11" fontWeight="700" fill="var(--muted)">Flow</text>
    <text x="0" y="98" fontSize="11" fontWeight="700" fill="var(--muted)">Pain</text>
    {p.periodDays.map((d, i) => { const x = L + i * cw + cw / 2; return <g key={i}>
      {d.flow !== null && <rect x={x - bw / 2} y={fy(d.flow)} width={bw} height={60 - fy(d.flow)} rx="4" fill="var(--brand)" />}
      {d.pain !== null && <><rect x={x - bw / 2} y={py(d.pain)} width={bw} height={118 - py(d.pain)} rx="4" fill="var(--brand-2)" />
        <text x={x} y={py(d.pain) - 4} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--ink)">{Math.round(d.pain)}</text></>}
      <text x={x} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--muted)">{i === 0 ? 'Day 1' : i + 1}</text>
    </g>; })}
    <line x1={L} x2={W} y1="60" y2="60" stroke="var(--line)" /><line x1={L} x2={W} y1="118" y2="118" stroke="var(--line)" />
  </svg>;
}

const LINES = [['mood', 'Mood', 'var(--brand)'], ['energy', 'Energy', 'var(--ink)'], ['calm', 'Calm', 'var(--faint)']] as const;
function MoodWeeks({ p }: { p: CyclePatterns }) {
  const W = 334, H = 150, L = 26, x = (i: number) => L + 18 + i * ((W - L - 36) / 3), y = (v: number) => 112 - ((v - 1) / 4) * 96;
  return <><svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={LINES.map(([k, n]) => `${n}: ${p.weeks.map((w) => w[k]?.toFixed(1) ?? '–').join(', ')}`).join('; ')}>
    {[1, 3, 5].map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x="2" y={y(v) + 4} fontSize="10" fill="var(--faint)">{v}</text></g>)}
    {LINES.map(([k, , c]) => { const pts = p.weeks.map((w, i) => (w[k] === null ? null : [x(i), y(w[k]!)] as const)).filter(Boolean) as (readonly [number, number])[];
      return <g key={k}><polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={c} strokeWidth="2.5" strokeLinejoin="round" strokeDasharray={k === 'calm' ? '5 4' : undefined} />
        {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r="3.5" fill={c} />)}</g>; })}
    {[0, 1, 2, 3].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--muted)">Week {i + 1}</text>)}
  </svg><div className="cy-legend">{LINES.map(([k, n, c]) => <span key={k}><i style={{ background: c }} />{n}</span>)}</div></>;
}

function BodyWeeks({ p }: { p: CyclePatterns }) {
  const rows: [string, ReactNode, (number | null)[], (v: number) => string][] = [
    ['Workouts / week', <Dumbbell key="d" />, p.body.map((b) => b.workouts), (v) => v.toFixed(1)],
    ['Weight', <Scale key="s" />, p.body.map((b) => b.weight), (v) => `${v.toFixed(1)} kg`],
    ['Sleep', <Moon key="m" />, p.body.map((b) => b.sleep), (v) => `${v.toFixed(1)} h`]];
  return <div className="cy-bodyweeks">{rows.filter(([name, , vs]) => (name.startsWith('Workouts') ? vs.some((v) => (v ?? 0) > 0) : vs.some((v) => v !== null))).map(([name, icon, vs, fmt]) => {
    // Bars from zero for workouts only; weight and sleep as plain numbers (bars would exaggerate 0.1 kg).
    const bars = name.startsWith('Workouts'), hi = Math.max(...vs.map((v) => v ?? 0), 0.1);
    return <div key={name} className="card cy-wide"><span className="cy-ic">{icon}</span><span className="grow"><b>{name}</b><span>weeks 1–4</span></span>
      <span className="cy-wkv" aria-label={`${name}, weeks 1 to 4: ${vs.map((v) => (v === null ? 'no data' : fmt(v))).join(', ')}`}>{vs.map((v, i) =>
        <span key={i}>{bars && <i style={{ height: `${v === null ? 3 : Math.max(3, (v / hi) * 34)}px`, opacity: v === null ? 0.3 : 1 }} />}<small className={bars ? '' : 'big'}>{v === null ? '–' : fmt(v).replace(' kg', '').replace(' h', '')}</small></span>)}</span></div>;
  })}</div>;
}

export function Bars({ lengths, starts }: { lengths: number[]; starts: ISODate[] }) {
  const W = 330, H = 170, P = 26, max = Math.max(60, Math.ceil(Math.max(...lengths) / 10) * 10), n = lengths.length, bw = (W - P - 6) / n, y = (v: number) => H - 24 - (v / max) * (H - 38), med = median(lengths);
  return <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cycle lengths: ${lengths.join(', ')} days; usual ${med}`}>
    <rect x={P} y={y(38)} width={W - P - 4} height={y(24) - y(38)} rx="8" fill="var(--surface-2)" />
    {[0, 20, 40, 60, 80].filter((v) => v <= max).map((v) => <text key={v} x="2" y={y(v) + 4} fontSize="10" fill="var(--faint)">{v}</text>)}
    <line x1={P} x2={W - 4} y1={y(med)} y2={y(med)} stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 4" />
    {lengths.map((c, i) => { const w = Math.min(bw * 0.64, 40), x = P + i * bw + (bw - w) / 2, inN = c >= 24 && c <= 38, s = starts[i];
      return <g key={i}><rect x={x} y={y(c)} width={w} height={y(0) - y(c)} rx={Math.min(10, w / 2.4)} fill={inN ? 'var(--brand-2)' : 'var(--brand)'} />
        <text x={x + w / 2} y={y(c) - 6} textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--ink)">{c}</text>
        {s && <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--muted)">{new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short' })}</text>}</g>; })}
  </svg>;
}

export function Ring({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 18;
  return <svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="18" fill="none" stroke="var(--surface-2)" strokeWidth="5" />
    <circle cx="23" cy="23" r="18" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 23 23)" />
    <text x="23" y="27" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ink)">{pct}%</text></svg>;
}
