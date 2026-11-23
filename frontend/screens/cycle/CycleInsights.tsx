// Cycle & Health → Insights: four tiles, cycle lengths as bars (normal band, median), the most frequent symptoms
// (out of logged days only) and, if switched on, workouts by cycle week. Explanations sit behind ⓘ.
import { useMemo } from 'react';
import { CalendarCheck, Droplet, Dumbbell, MoveHorizontal, RefreshCw } from 'lucide-react';
import { useDB } from '../../data/store';
import { Empty, InfoButton, TopBar } from '../../components/ui';
import { addDays, cycleLengths, daysBetween, periods } from '../../domain/cycle';
import type { ISODate } from '../../domain/types';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };
const localDate = (ms: number): ISODate => { const d = new Date(ms); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export function CycleInsights() {
  const days = useDB((d) => d.cycle.days), compare = useDB((d) => !!d.cycle.settings?.compare), workouts = useDB((d) => d.workouts);
  const today = localToday();
  const data = useMemo(() => {
    const ps = periods(days), lengths = cycleLengths(days), recent = ps.slice(-9);
    const since = addDays(today, -59), logged = days.filter((d) => d.date >= since && d.date <= today).length;
    const window = days.filter((d) => d.date >= addDays(today, -89) && d.date <= today), counts = new Map<string, number>();
    for (const d of window) for (const s of Object.keys(d.symptoms ?? {})) counts.set(s, (counts.get(s) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => [s, Math.round((n / window.length) * 100)] as const);
    // Workouts per week in each cycle week (complete cycles only; weeks 1–4, week 4 includes any later days).
    const perWeek = [0, 0, 0, 0], weeks = [0, 0, 0, 0];
    for (let i = 1; i < ps.length; i++) {
      const start = ps[i - 1]!.start, len = daysBetween(start, ps[i]!.start);
      for (let w = 0; w < 4; w++) { const from = w * 7, to = w === 3 ? len : Math.min(len, from + 7); if (to <= from) continue; weeks[w]! += (to - from) / 7;
        perWeek[w]! += workouts.filter((x) => { const dd = localDate(x.startedAt); return dd >= addDays(start, from) && dd < addDays(start, to); }).length; }
    }
    const byWeek = perWeek.map((n, w) => (weeks[w] ? n / weeks[w]! : 0));
    return { lengths: lengths.slice(-8), months: recent.slice(0, -1).slice(-8).map((p) => p.start), periodLen: ps.length ? median(ps.map((p) => p.length)) : null,
      logged, top, logDays: window.length, byWeek, total: weeks.reduce((a, b) => a + b, 0) ? perWeek.reduce((a, b) => a + b, 0) / weeks.reduce((a, b) => a + b, 0) : 0 };
  }, [days, workouts, today]);

  return <>
    <TopBar title="Insights" back="/progress/cycle" />
    <div className="screen cy-insights">
      {data.lengths.length === 0 ? <Empty title="Not enough data yet">Insights appear after your first full cycle, from one period to the next.</Empty> : <>
        <div className="cy-tiles2">
          <div className="cy-st"><span className="ai"><RefreshCw /></span><b className="tnum">{median(data.lengths)} <small>d</small></b><span>Usual cycle</span></div>
          <div className="cy-st"><span className="ai"><MoveHorizontal /></span><b className="tnum">{Math.min(...data.lengths) === Math.max(...data.lengths) ? Math.min(...data.lengths) : `${Math.min(...data.lengths)}–${Math.max(...data.lengths)}`}</b><span>Range</span></div>
          <div className="cy-st"><span className="ai"><Droplet /></span><b className="tnum">{data.periodLen ?? '–'} <small>d</small></b><span>Period</span></div>
          <div className="cy-st"><span className="ai"><CalendarCheck /></span><b className="tnum">{data.logged}<small>/60</small></b><span>Days logged</span></div>
        </div>
        <section className="cy-sec"><div className="cy-sech"><h3>Cycle length <InfoButton title="Cycle length" label="About this chart" lines={[
          'Each bar is one complete cycle: from the first day of a period to the first day of the next.',
          'The shaded band is the normal range of 24–38 days (FIGO 2018). Cycles outside it are a deeper orange.',
          'The dashed line is your usual (median) cycle.',
          'Cycles that vary by more than 7–9 days are called irregular. This is a pattern to show your doctor, not a diagnosis.']} /></h3></div>
          <div className="card cy-chartcard"><Bars lengths={data.lengths} starts={data.months} /></div>
        </section>
        {data.top.length > 0 && <section className="cy-sec"><div className="cy-sech"><h3>Most frequent <InfoButton title="Most frequent symptoms" label="About these numbers" lines={[`Share of your logged days in the last 90 days with each symptom (${data.logDays} logged days).`, 'Days you didn’t log are left out, never counted as “no symptoms”.']} /></h3></div>
          <div className="cy-sym4">{data.top.map(([s, p]) => <div key={s} className="cy-sy"><Ring pct={p} />{s}</div>)}</div>
        </section>}
        {compare && data.total > 0 && <section className="cy-sec"><div className="cy-sech"><h3>Training <InfoButton title="Training by cycle week" label="About this comparison" lines={['Workouts per week in each week of your cycles (weeks 1–4; week 4 includes any later days).', 'For your own comparison; one doesn’t cause the other.']} /></h3></div>
          <div className="card cy-wide"><span className="cy-ic"><Dumbbell /></span><span className="grow"><b>{data.total.toFixed(1)} workouts / week</b><span>by cycle week</span></span>
            <span className="cy-wk" aria-label={`Weeks 1 to 4: ${data.byWeek.map((x) => x.toFixed(1)).join(', ')}`}>{data.byWeek.map((x, i) => <i key={i} style={{ height: `${Math.max(4, Math.min(40, (x / Math.max(...data.byWeek, 0.1)) * 40))}px` }} />)}</span></div>
        </section>}
      </>}
    </div>
  </>;
}

function Bars({ lengths, starts }: { lengths: number[]; starts: ISODate[] }) {
  const W = 330, H = 170, P = 26, max = Math.max(60, Math.ceil(Math.max(...lengths) / 10) * 10), n = lengths.length, bw = (W - P - 6) / n, y = (v: number) => H - 24 - (v / max) * (H - 38), med = median(lengths);
  return <svg className="cy-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cycle lengths: ${lengths.join(', ')} days; usual ${med}`}>
    <rect x={P} y={y(38)} width={W - P - 4} height={y(24) - y(38)} rx="8" fill="var(--surface-2)" />
    {[0, 20, 40, 60, 80].filter((v) => v <= max).map((v) => <text key={v} x="2" y={y(v) + 4} fontSize="10" fill="var(--faint)">{v}</text>)}
    <line x1={P} x2={W - 4} y1={y(med)} y2={y(med)} stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 4" />
    {lengths.map((c, i) => { const x = P + i * bw + bw * 0.18, w = bw * 0.64, inN = c >= 24 && c <= 38, s = starts[i];
      return <g key={i}><rect x={x} y={y(c)} width={w} height={y(0) - y(c)} rx={Math.min(10, w / 2.4)} fill={inN ? 'var(--brand-2)' : 'var(--brand)'} />
        <text x={x + w / 2} y={y(c) - 6} textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--ink)">{c}</text>
        {s && <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--muted)">{new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short' })}</text>}</g>; })}
  </svg>;
}

function Ring({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 18;
  return <svg viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="18" fill="none" stroke="var(--surface-2)" strokeWidth="5" />
    <circle cx="23" cy="23" r="18" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 23 23)" />
    <text x="23" y="27" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ink)">{pct}%</text></svg>;
}
