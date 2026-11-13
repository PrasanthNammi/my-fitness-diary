import { useMemo, useState } from 'react';
import { Activity, ChevronDown, Footprints, HeartPulse, Moon, Pencil, Waves, Zap } from 'lucide-react';
import { useDB } from '../../data/store';
import { Empty, OverflowMenu, Segmented, TopBar } from '../../components/ui';
import { BarChart, LineChart } from '../../components/Charts';
import { average, compared, hm, HISTORY_STEPS, recoveryHistory, recoveryRange, shiftDay, type Metric, type RecoveryDay } from '../../domain/recoveryStats';
import { fmtInt, fmtNum, todayISO } from '../../lib/format';
import { navigate } from '../../lib/router';
import { Sparkline } from './RecoveryHealth';

const STAGES = [['deep', 'Deep', 'var(--protein)'], ['light', 'Light', 'var(--water)'], ['rem', 'REM', 'var(--drop)'], ['awake', 'Awake', 'var(--faint)']] as const;
const RANGES = [['7', '7 days'], ['30', '30 days'], ['90', '90 days']] as const;
const short = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const weekday = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const ms = (d: string) => new Date(d + 'T12:00:00').getTime();

let requested: string | null = null;
/** Opens a day's check-in on Progress → Body (the card there takes the day once). */
export const editCheckIn = (date: string) => { requested = date; navigate('/progress/body'); };
export const takeCheckInRequest = () => { const d = requested; requested = null; return d; };

/** A day's value against the days before: "Normal · usual 60", "Higher · usual 44". `good` says which way is better. */
export function UsualChip({ state, usual, good, fmt = fmtInt }: { state: 'normal' | 'higher' | 'lower' | null; usual: number | null; good?: 'higher' | 'lower'; fmt?: (v: number) => string }) {
  if (!state || usual === null) return null;
  const tone = state === 'normal' ? 'normal' : good && state === good ? 'good' : 'watch';
  return <span className={`usual-chip ${tone}`}>{state === 'normal' ? 'Normal' : state === 'higher' ? 'Higher' : 'Lower'} · usual {fmt(usual)}</span>;
}

/** One measure for a day: value, unit, a 7-day line and the comparison with the person's usual. */
export function MetricTile({ icon, label, value, unit, color, line, cmp, good, fmt }: {
  icon: React.ReactNode; label: string; value: string | null; unit?: string; color: string; line: number[];
  cmp: ReturnType<typeof compared>; good?: 'higher' | 'lower'; fmt?: (v: number) => string;
}) {
  return (
    <div className="metric-tile">
      <div className="metric-head"><span className="metric-icon" style={{ color }}>{icon}</span><span className="metric-label">{label}</span></div>
      <div className="metric-value tnum">{value ?? '—'}{value && unit && <small> {unit}</small>}</div>
      <div className="metric-foot">{line.length > 1 ? <Sparkline values={line} color={color} /> : <span />}{cmp && <UsualChip state={cmp.state} usual={cmp.usual} good={good} fmt={fmt} />}</div>
    </div>
  );
}

/** Sleep per night, stacked by stage (or plain hours when a night has no stages); tap a night for its details. */
function SleepChart({ days }: { days: { date: string; day: RecoveryDay | null }[] }) {
  const nights = days.map((d) => ({ date: d.date, hours: d.day?.sleep ?? (d.day?.stages ? (d.day.stages.deep + d.day.stages.light + d.day.stages.rem) / 60 : null), stages: d.day?.stages ?? null }));
  const [sel, setSel] = useState<number | null>(null);
  const withSleep = nights.map((n, i) => [n, i] as const).filter(([n]) => n.hours !== null);
  if (!withSleep.length) return <p className="small muted">No sleep in this range.</p>;
  const s = sel ?? withSleep[withSleep.length - 1]![1], night = nights[s]!;
  const W = 340, H = 150, pad = { l: 30, r: 6, t: 10, b: 22 };
  const hi = Math.max(9, Math.ceil(Math.max(...withSleep.map(([n]) => n.hours! + (n.stages ? n.stages.awake / 60 : 0))))), bw = (W - pad.l - pad.r) / nights.length;
  const y = (h: number) => pad.t + (1 - h / hi) * (H - pad.t - pad.b);
  const avg = average(nights.map((n) => n.hours));
  return (
    <figure className="sleep-chart">
      <div className="chart-tip tnum"><span className="strong">{night.hours !== null ? hm(night.hours) : '—'}</span> <span className="muted">· {weekday(night.date)}</span>
        {night.stages && <span className="muted"> · deep {Math.round(night.stages.deep)}m · REM {Math.round(night.stages.rem)}m</span>}</div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sleep per night, average ${avg ? hm(avg) : 'unknown'}`}>
        {[0, 3, 6, 9].filter((t) => t <= hi).map((t) => <g key={t}><line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} /><text x={pad.l - 6} y={y(t) + 4} textAnchor="end">{t}h</text></g>)}
        {avg !== null && <line x1={pad.l} x2={W - pad.r} y1={y(avg)} y2={y(avg)} stroke="var(--ink-3)" strokeDasharray="4 4" />}
        {nights.map((n, i) => {
          if (n.hours === null) return null;
          const x = pad.l + i * bw + bw * 0.16, w = Math.max(2, bw * 0.68), dim = i === s ? 1 : 0.75;
          if (!n.stages) return <rect key={i} x={x} y={y(n.hours)} width={w} height={H - pad.b - y(n.hours)} rx={2} fill="var(--protein)" opacity={dim * 0.6} onPointerDown={() => setSel(i)} />;
          let base = 0;
          return <g key={i} onPointerDown={() => setSel(i)} opacity={dim}>{STAGES.map(([k, , c]) => { const h = n.stages![k] / 60, top = base + h; const r = <rect key={k} x={x} y={y(top)} width={w} height={Math.max(0, y(base) - y(top))} fill={c} />; base = top; return r; })}</g>;
        })}
        <text x={pad.l} y={H - 6}>{short(nights[0]!.date)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end">{short(nights[nights.length - 1]!.date)}</text>
      </svg>
      <div className="sleep-legend">{STAGES.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}</span>)}<span className="muted">- - average {avg ? hm(avg) : ''}</span></div>
    </figure>
  );
}

/** Energy and soreness check-ins (1–5) as dots per day. */
function FeltChart({ days }: { days: { date: string; day: RecoveryDay | null }[] }) {
  const rows = [['energy', 'Energy', 'var(--success)'], ['soreness', 'Soreness', 'var(--warmup)']] as const;
  if (!days.some((d) => d.day?.energy != null || d.day?.soreness != null)) return <p className="small muted">No check-ins in this range. Rate your energy and soreness on Progress → Body.</p>;
  const W = 340, rowH = 46, pad = { l: 70, r: 8 }, bw = (W - pad.l - pad.r) / days.length;
  return (
    <svg className="chart felt-chart" viewBox={`0 0 ${W} ${rowH * 2 + 10}`} role="img" aria-label="Energy and soreness check-ins">
      {rows.map(([k, label, c], r) => (
        <g key={k}>
          <text x={0} y={r * rowH + 26}>{label}</text>
          <line className="grid" x1={pad.l} x2={W - pad.r} y1={r * rowH + 22} y2={r * rowH + 22} />
          {days.map((d, i) => { const v = d.day?.[k]; return v == null ? null : <circle key={i} cx={pad.l + i * bw + bw / 2} cy={r * rowH + 22} r={2 + v * 1.6} fill={c} opacity={0.35 + v * 0.13}><title>{`${label} ${v}/5 · ${short(d.date)}`}</title></circle>; })}
        </g>
      ))}
    </svg>
  );
}

/** Progress → Recovery: today's measures, trends over 7–90 days, and every day in detail. */
export function RecoveryPage() {
  const checkins = useDB((d) => d.checkins);
  const [range, setRange] = useState<'7' | '30' | '90'>('7');
  const [step, setStep] = useState(0);
  const today = todayISO();
  const days = useMemo(() => recoveryRange(checkins, shiftDay(today, -(Number(range) - 1)), today), [checkins, range, today]);
  // One more than shown, to know whether "Show more" has anything to add.
  const shown = HISTORY_STEPS[step]!;
  const history = useMemo(() => recoveryHistory(checkins, shown + 1), [checkins, shown]);
  const latest = history[0]?.date ?? today;
  const week = recoveryRange(checkins, shiftDay(latest, -6), latest);
  const line = (m: Metric) => week.flatMap((d) => (d.day?.[m] != null ? [d.day[m] as number] : []));
  const series = (m: Metric) => days.flatMap((d) => (d.day?.[m] != null ? [{ x: ms(d.date), y: d.day[m] as number, label: weekday(d.date) }] : []));
  const day = history[0] ?? null;
  const steps = days.map((d) => ({ label: short(d.date), value: d.day?.steps ?? 0 }));
  const rhr = series('restingHr'), hrv = series('hrv');

  if (!history.length) {
    return (<><TopBar title="Recovery" back="/progress/body" bordered /><div className="screen"><Empty icon={Moon} title="No recovery yet">Check in on Progress → Body, or connect Samsung Health in Settings → Health &amp; devices.</Empty></div></>);
  }
  return (
    <>
      <TopBar title="Recovery" back="/progress/body" bordered />
      <div className="screen recovery-page">
        <section className="card card-pad">
          <div className="rp-head"><span className="eyebrow">{latest === today ? 'Today' : weekday(latest)}</span>
            <OverflowMenu small title="Recovery" actions={[{ label: 'Edit check-in', icon: Pencil, onSelect: () => editCheckIn(latest) }]} /></div>
          <div className="metric-grid">
            <MetricTile icon={<Moon />} label="Sleep" value={day?.sleep != null ? hm(day.sleep) : null} color="var(--protein)" line={line('sleep')} cmp={compared(checkins, latest, 'sleep')} good="higher" fmt={hm} />
            <MetricTile icon={<Footprints />} label="Steps" value={day?.steps != null ? fmtInt(day.steps) : null} color="var(--fibre)" line={line('steps')} cmp={compared(checkins, latest, 'steps')} good="higher" />
            <MetricTile icon={<HeartPulse />} label="Resting HR" value={day?.restingHr != null ? fmtInt(day.restingHr) : null} unit="bpm" color="var(--failure)" line={line('restingHr')} cmp={compared(checkins, latest, 'restingHr')} good="lower" />
            <MetricTile icon={<Waves />} label="HRV" value={day?.hrv != null ? fmtNum(day.hrv, 0) : null} unit="ms" color="var(--ai)" line={line('hrv')} cmp={compared(checkins, latest, 'hrv')} good="higher" />
          </div>
          {(day?.energy != null || day?.soreness != null) && <div className="felt-row">
            {day?.energy != null && <span><Zap aria-hidden="true" />Energy <b>{day.energy}/5</b></span>}
            {day?.soreness != null && <span><Activity aria-hidden="true" />Soreness <b>{day.soreness}/5</b></span>}
          </div>}
          {day?.note && <p className="rp-note">“{day.note}”</p>}
        </section>

        <Segmented label="Range" value={range} onChange={(v) => setRange(v as typeof range)} options={RANGES.map(([v, l]) => ({ value: v, label: l }))} />

        <section className="card card-pad"><p className="rp-title"><Moon aria-hidden="true" />Sleep</p><SleepChart days={days} /></section>
        {steps.some((s) => s.value > 0) && <section className="card card-pad"><p className="rp-title"><Footprints aria-hidden="true" />Steps <span className="muted">· avg {fmtInt(average(days.map((d) => d.day?.steps ?? null)) ?? 0)}</span></p><BarChart bars={steps} unit="steps" label="Steps per day" height={150} /></section>}
        {rhr.length > 1 && <section className="card card-pad"><p className="rp-title"><HeartPulse aria-hidden="true" />Resting heart rate <span className="muted">· lower is usually better</span></p><LineChart points={rhr} unit="bpm" label="Resting heart rate" height={150} format={(v) => fmtNum(v, 0)} color="var(--failure)" /></section>}
        {hrv.length > 1 && <section className="card card-pad"><p className="rp-title"><Waves aria-hidden="true" />Heart-rate variability <span className="muted">· higher is usually better</span></p><LineChart points={hrv} unit="ms" label="Heart-rate variability" height={150} format={(v) => fmtNum(v, 0)} color="var(--ai)" /></section>}
        <section className="card card-pad"><p className="rp-title"><Zap aria-hidden="true" />How you felt</p><FeltChart days={days} /></section>

        <section className="card card-pad">
          <p className="rp-title">History</p>
          {history.slice(0, shown).map((d) => (
            <div key={d.date} className="rp-day">
              <div className="rp-day-head"><b>{weekday(d.date)}</b><OverflowMenu small title={weekday(d.date)} actions={[{ label: 'Edit check-in', icon: Pencil, onSelect: () => editCheckIn(d.date) }]} /></div>
              {d.stages && <div className="sleep-bar" aria-hidden="true">{STAGES.map(([k, , c]) => d.stages![k] > 0 && <span key={k} style={{ width: `${(d.stages![k] / (d.stages!.deep + d.stages!.light + d.stages!.rem + d.stages!.awake)) * 100}%`, background: c }} />)}</div>}
              <div className="rp-chips tnum">
                {d.sleep != null && <span><Moon aria-hidden="true" />{hm(d.sleep)}</span>}
                {d.steps != null && <span><Footprints aria-hidden="true" />{fmtInt(d.steps)}</span>}
                {d.restingHr != null && <span><HeartPulse aria-hidden="true" />{fmtInt(d.restingHr)} bpm</span>}
                {d.hrv != null && <span><Waves aria-hidden="true" />{fmtNum(d.hrv, 0)} ms</span>}
                {d.energy != null && <span><Zap aria-hidden="true" />{d.energy}/5</span>}
                {d.soreness != null && <span><Activity aria-hidden="true" />{d.soreness}/5</span>}
              </div>
              {d.note && <p className="rp-note">“{d.note}”</p>}
            </div>
          ))}
          {history.length > shown && <button className="btn btn-link progress-more" onClick={() => setStep((i) => Math.min(i + 1, HISTORY_STEPS.length - 1))}>Show more<ChevronDown aria-hidden="true" /></button>}
        </section>
      </div>
    </>
  );
}
