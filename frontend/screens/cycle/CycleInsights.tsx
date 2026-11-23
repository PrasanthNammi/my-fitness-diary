// Cycle & Health → Insights: four tiles, cycle lengths as bars (normal band, median), the most frequent symptoms
// (out of logged days only) and, if switched on, workouts by cycle week. Explanations sit behind ⓘ.
import { useMemo, useState } from 'react';
import { CalendarCheck, Droplet, Dumbbell, MoveHorizontal, RefreshCw } from 'lucide-react';
import { useDB } from '../../data/store';
import { Empty, InfoButton, TopBar } from '../../components/ui';
import type { ISODate } from '../../domain/types';
import { cycleRangeStats, median, rangeName } from '../../domain/cycleRange';
import { rangeStart, type RangeDays } from '../../domain/progressStats';
import { getProgressRange, setProgressRange } from '../../lib/progressRange';
import { RangePicker } from '../progress/RangePicker';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export function CycleInsights() {
  const days = useDB((d) => d.cycle.days), compare = useDB((d) => !!d.cycle.settings?.compare), workouts = useDB((d) => d.workouts);
  const [range, setRangeState] = useState<RangeDays>(getProgressRange());
  const setRange = (r: RangeDays) => { setProgressRange(r); setRangeState(r); };
  const today = localToday();
  const st = useMemo(() => cycleRangeStats(days, workouts, today, rangeStart(range)), [days, workouts, today, range]);
  const lengths = st.cycles.slice(-12).map((c) => c.length), starts = st.cycles.slice(-12).map((c) => c.start);

  return <>
    <TopBar title="Insights" back="/progress/cycle" />
    <div className="screen cy-insights">
      <RangePicker value={range} onChange={setRange} />
      {lengths.length === 0 ? <Empty title={`No full cycle in ${rangeName(range).toLowerCase()}`}>{range === 30 ? 'A month rarely holds a full cycle: try 3M or longer.' : 'Insights appear after a full cycle, from one period to the next.'}</Empty> : <>
        <div className="cy-tiles2">
          <div className="cy-st"><span className="ai"><RefreshCw /></span><b className="tnum">{median(lengths)} <small>d</small></b><span>Usual cycle</span></div>
          <div className="cy-st"><span className="ai"><MoveHorizontal /></span><b className="tnum">{st.shortest === st.longest ? st.shortest : `${st.shortest}–${st.longest}`}</b><span>Range</span></div>
          <div className="cy-st"><span className="ai"><Droplet /></span><b className="tnum">{st.periodLen ?? '–'} <small>d</small></b><span>Period</span></div>
          <div className="cy-st"><span className="ai"><CalendarCheck /></span><b className="tnum">{st.logged}{range ? <small>/{range}</small> : null}</b><span>Days logged</span></div>
        </div>
        <section className="cy-sec"><div className="cy-sech"><h3>Cycle length <InfoButton title="Cycle length" label="About this chart" lines={[
          'Each bar is one complete cycle that started in the chosen range: from the first day of a period to the first day of the next.',
          'The shaded band is the normal range of 24–38 days (FIGO 2018). Cycles outside it are a deeper orange.',
          'The dashed line is your usual (median) cycle.',
          'Cycles that vary by more than 7–9 days are called irregular. This is a pattern to show your doctor, not a diagnosis.']} /></h3></div>
          <div className="card cy-chartcard"><Bars lengths={lengths} starts={starts} /></div>
        </section>
        {st.top.length > 0 && <section className="cy-sec"><div className="cy-sech"><h3>Most frequent <InfoButton title="Most frequent symptoms" label="About these numbers" lines={[`Share of your logged days in the chosen range with each symptom (${st.logDays} logged days).`, 'Days you didn’t log are left out, never counted as “no symptoms”.']} /></h3></div>
          <div className="cy-sym4">{st.top.map(([s, p]) => <div key={s} className="cy-sy"><Ring pct={p} />{s}</div>)}</div>
        </section>}
        {compare && st.perWeek > 0 && <section className="cy-sec"><div className="cy-sech"><h3>Training <InfoButton title="Training by cycle week" label="About this comparison" lines={['Workouts per week in each week of your cycles in the chosen range (weeks 1–4; week 4 includes any later days).', 'For your own comparison; one doesn’t cause the other.']} /></h3></div>
          <div className="card cy-wide"><span className="cy-ic"><Dumbbell /></span><span className="grow"><b>{st.perWeek.toFixed(1)} workouts / week</b><span>by cycle week</span></span>
            <span className="cy-wk" aria-label={`Weeks 1 to 4: ${st.byWeek.map((x) => x.toFixed(1)).join(', ')}`}>{st.byWeek.map((x, i) => <i key={i} style={{ height: `${Math.max(4, Math.min(40, (x / Math.max(...st.byWeek, 0.1)) * 40))}px` }} />)}</span></div>
        </section>}
      </>}
    </div>
  </>;
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
