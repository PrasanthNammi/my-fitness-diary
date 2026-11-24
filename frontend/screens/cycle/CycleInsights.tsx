// Cycle & Health → Insights: four tiles, cycle lengths as bars (normal band, median), the most frequent symptoms
// (out of logged days only) and, if switched on, workouts by cycle week. Explanations sit behind ⓘ.
import { useMemo, useState, type ReactNode } from 'react';
import { Dumbbell, Moon, Scale } from 'lucide-react';
import { useDB } from '../../data/store';
import { Empty, InfoButton, TopBar } from '../../components/ui';
import type { ISODate } from '../../domain/types';
import { median, rangeName } from '../../domain/cycleRange';
import { cyclePatterns, MAX_DAY, type CyclePatterns } from '../../domain/cyclePatterns';
import { cycleNow } from '../../domain/cycle';
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
  const now = useMemo(() => cycleNow(days, today), [days, today]);
  const periodLen = Math.max(1, p.periodDays.filter((x) => x.n).length);
  const hasPeriod = p.periodDays.some((x) => x.n), hasMood = p.weeks.some((w) => w.n), hasBody = compare && p.body.some((b) => (b.workouts ?? 0) > 0 || b.weight !== null || b.sleep !== null);

  return <>
    <TopBar title="Insights" back="/progress/cycle" />
    <div className="screen cy-insights">
      <RangePicker value={range} onChange={setRange} />
      {p.cycles === 0 ? <Empty title={`No cycle in ${rangeName(range).toLowerCase()}`}>Patterns appear once a period is logged in this range.</Empty> : <>
        <p className="cy-ins-sub">Patterns across your cycle · {p.cycles} {p.cycles === 1 ? 'cycle' : 'cycles'} · {rangeName(range).toLowerCase()}</p>
        {p.symptoms.length > 0 && <section className="cy-sec"><div className="cy-sech"><h3>Your cycle ring <InfoButton title="Your cycle ring" label="How to read it" lines={[
          'Your cycle drawn as a circle: day 1 (the first day of your period) at the top, going clockwise. The orange outer arc is your usual period; the dark dot is today.',
          'Each coloured ring is one symptom (key below). The brighter the ring, the more often you logged that symptom on that day.',
          'Read it like a clock: from today’s dot you can see which symptoms often come next.',
          'Only days you logged count. A pattern to show your doctor, not a diagnosis.']} /></h3></div>
          <div className="card cy-chartcard"><CycleRing p={p} today={now.day} periodLen={periodLen} /></div></section>}
        {p.symptoms.length > 0 && <section className="cy-sec"><div className="cy-sech"><h3>Symptom waves <InfoButton title="Symptom waves" label="How to read it" lines={[
          'Each line is one symptom. The higher the line on a day, the more often you logged that symptom on that day of your cycle (share of your logged days, averaged over 5 days).',
          'Peaks show when a symptom is most likely, for example acne building up before a period.',
          'Gaps are days with no logs yet. Only days you logged count.']} /></h3></div>
          <div className="card cy-chartcard"><SymptomWaves p={p} periodLen={periodLen} /></div></section>}
        {hasPeriod && <section className="cy-sec"><div className="cy-sech"><h3>Flow and pain <InfoButton title="Flow and pain, day by day" label="How to read it" lines={[
          'Bars: how heavy your flow usually is on each day of your period (light, medium, heavy, very heavy).',
          'Line: your average pain that day, from 0 (none) to 10 (worst), with the number on each dot.',
          'Together they show whether the heaviest days are also the most painful, which is useful to tell your doctor.',
          'Only days where you recorded flow or pain count.']} /></h3></div>
          <div className="card cy-chartcard"><FlowPain p={p} /></div></section>}
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

// Orange is the period's colour, so symptoms use the app's other chart colours.
const SYM_COLORS = ['var(--ai)', 'var(--fibre)', 'var(--fat)', 'var(--carbs)', 'var(--water)'];

/** The cycle as a ring: day 1 at the top, clockwise; one ring per symptom (brighter = more often); period arc and today's dot. */
function CycleRing({ p, today, periodLen }: { p: CyclePatterns; today: number | null; periodLen: number }) {
  const W = 360, H = 350, cx = W / 2, cy = 175, step = (2 * Math.PI) / MAX_DAY, a = (d: number) => -Math.PI / 2 + (d - 1) * step;
  const pt = (r: number, t: number) => `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  const arc = (r1: number, r2: number, a1: number, a2: number) => `M${pt(r2, a1)}A${r2} ${r2} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${pt(r2, a2)}L${pt(r1, a2)}A${r1} ${r1} 0 ${a2 - a1 > Math.PI ? 1 : 0} 0 ${pt(r1, a1)}Z`;
  const rp = 62 + p.symptoms.length * 19 + 6, tt = today ? a(Math.min(today, MAX_DAY)) + step / 2 : 0;
  return <>
    <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cycle ring: ${p.symptoms.map((s) => s.name).join(', ')}${today ? `; today is cycle day ${today}` : ''}`}>
      {p.symptoms.map((s, i) => s.byDay.map((v, d) => <path key={s.name + d} d={arc(62 + i * 19, 77 + i * 19, a(d + 1) + 0.02, a(d + 2) - 0.02)}
        fill={v === null || v < 0.06 ? 'var(--line)' : SYM_COLORS[i]} opacity={v === null ? 0.35 : v < 0.06 ? 0.7 : (0.18 + 0.82 * v).toFixed(2)} />))}
      <path d={arc(rp, rp + 9, a(1), a(periodLen + 1))} fill="var(--brand)" />
      {today && <circle cx={cx + (rp + 4) * Math.cos(tt)} cy={cy + (rp + 4) * Math.sin(tt)} r="9" fill="var(--ink)" stroke="var(--surface)" strokeWidth="3" />}
      {today && <><text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--ink)">Day {today}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="12" fill="var(--muted)">today</text></>}
      {[1, 7, 14, 21, 28].map((d) => <text key={d} x={cx + 50 * Math.cos(a(d) + step / 2)} y={cy + 50 * Math.sin(a(d) + step / 2) + 4} textAnchor="middle" fontSize="10" fill="var(--faint)">{d}</text>)}
    </svg>
    <div className="cy-legend cy-legend-wrap"><span><i style={{ background: 'var(--brand)' }} />Period (outer arc)</span>
      {p.symptoms.map((s, i) => <span key={s.name}><i style={{ background: SYM_COLORS[i] }} />{s.name}{i === 0 ? ' (inner ring)' : ''}</span>)}</div>
  </>;
}

/** How often each symptom happens on each cycle day (3-day average of logged days), as smooth lines; gaps where nothing is logged. */
export function SymptomWaves({ p, periodLen }: { p: CyclePatterns; periodLen: number }) {
  const W = 340, H = 200, L = 34, T = 10, B = 26, x = (d: number) => L + (d - 1) * ((W - L - 6) / (MAX_DAY - 1)), y = (v: number) => H - B - v * (H - B - T);
  // Average of the logged days within ±2 days (bridges a day or two without logs; longer gaps stay gaps).
  const smooth = (v: (number | null)[]) => v.map((_, i) => { const w = v.slice(Math.max(0, i - 2), i + 3).filter((z): z is number => z !== null && z !== undefined); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; });
  // Smooth curve; control points kept between 0% and 100% so it never dips below the axis.
  const cl = (v: number) => Math.min(y(0), Math.max(y(1), v)).toFixed(1);
  const curve = (pts: [number, number][]) => pts.map((q, i) => { if (!i) return `M${q[0].toFixed(1)} ${q[1].toFixed(1)}`; const p0 = pts[i - 2] ?? pts[i - 1]!, p1 = pts[i - 1]!, p3 = pts[i + 1] ?? q;
    return `C${(p1[0] + (q[0] - p0[0]) / 6).toFixed(1)} ${cl(p1[1] + (q[1] - p0[1]) / 6)} ${(q[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${cl(q[1] - (p3[1] - p1[1]) / 6)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`; }).join('');
  // Runs of known days become separate curves (a day with no logs is a gap, never 0).
  const runs = (v: (number | null)[]) => { const out: [number, number][][] = []; let cur: [number, number][] = []; v.forEach((z, i) => { if (z === null) { if (cur.length) out.push(cur); cur = []; } else cur.push([x(i + 1), y(z)]); }); if (cur.length) out.push(cur); return out; };
  return <>
    <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.symptoms.map((s) => `${s.name}: most often around day ${s.byDay.reduce<number>((m, v, i, arr) => ((v ?? 0) > (arr[m] ?? 0) ? i : m), 0) + 1}`).join('; ')}>
      <rect x={x(1)} y={T} width={x(periodLen + 0.5) - x(1)} height={H - B - T} rx="6" fill="var(--surface-2)" />
      {[0, 0.5, 1].map((v) => <g key={v}><line x1={L} x2={W - 6} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--faint)">{v * 100}%</text></g>)}
      {p.symptoms.map((s, i) => runs(smooth(s.byDay)).map((r, k) => <path key={s.name + k} d={curve(r)} fill="none" stroke={SYM_COLORS[i]} strokeWidth="2.6" strokeLinecap="round" />))}
      {[1, 7, 14, 21, 28, 35].map((d) => <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--faint)">{d}</text>)}
    </svg>
    <div className="cy-legend cy-legend-wrap">{p.symptoms.map((s, i) => <span key={s.name}><i style={{ background: SYM_COLORS[i] }} />{s.name}</span>)}</div>
  </>;
}

/** Period days 1…7: average flow as bars, average pain (0–10) as a line with the value on each dot. */
export function FlowPain({ p }: { p: CyclePatterns }) {
  const days = p.periodDays.map((d, i) => ({ ...d, day: i + 1 })).filter((d) => d.n), n = Math.max(1, days.length);
  const W = 340, H = 210, L = 66, R = 26, T = 22, B = 28, slot = (W - L - R) / n, cxs = (i: number) => L + slot * i + slot / 2;
  const yf = (v: number) => H - B - (v / 4) * (H - B - T), yp = (v: number) => H - B - (v / 10) * (H - B - T);
  const pains = days.map((d, i) => (d.pain === null ? null : ([cxs(i), yp(d.pain)] as const)));
  return <>
    <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={days.map((d) => `Day ${d.day}: flow ${d.flow?.toFixed(1) ?? 'not logged'}, pain ${d.pain?.toFixed(1) ?? 'not logged'}`).join('; ')}>
      {['light', 'medium', 'heavy', 'very heavy'].map((lab, i) => <g key={lab}><line x1={L} x2={W - R} y1={yf(i + 1)} y2={yf(i + 1)} stroke="var(--line)" />
        <text x={L - 8} y={yf(i + 1) + 4} textAnchor="end" fontSize="10.5" fill="var(--muted)">{lab}</text></g>)}
      {[0, 5, 10].map((v) => <text key={v} x={W - R + 7} y={yp(v) + 4} fontSize="10" fill="var(--faint)">{v}</text>)}
      <text x={W - R + 7} y={T - 8} fontSize="10" fill="var(--faint)">pain</text>
      {days.map((d, i) => d.flow !== null && <rect key={'f' + i} x={cxs(i) - slot * 0.26} y={yf(d.flow)} width={slot * 0.52} height={yf(0) - yf(d.flow)} rx="9" fill="var(--brand-2)" />)}
      <polyline points={pains.filter(Boolean).map((q) => q!.join(',')).join(' ')} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      {pains.map((q, i) => q && <g key={'p' + i}><circle cx={q[0]} cy={q[1]} r="12" fill="var(--ink)" />
        <text x={q[0]} y={q[1] + 4.5} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="var(--surface)">{Math.round(days[i]!.pain!)}</text></g>)}
      {days.map((d, i) => <text key={'d' + i} x={cxs(i)} y={H - 7} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--muted)">{d.day === 1 ? 'Day 1' : d.day}</text>)}
    </svg>
    <div className="cy-legend cy-legend-wrap"><span><i style={{ background: 'var(--brand-2)' }} />Flow (bars)</span><span><i style={{ background: 'var(--ink)', borderRadius: '50%' }} />Pain 0–10 (line)</span></div>
  </>;
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
