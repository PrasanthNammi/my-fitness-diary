import { Footprints, HeartPulse, Moon, Waves } from 'lucide-react';
import { useDB } from '../../data/store';
import { checkinNumber, isRecoveryRow, vsUsual } from '../../domain/progressStats';
import type { CheckIn } from '../../domain/types';
import { addDays, fmtInt, fmtNum, todayISO } from '../../lib/format';

const STAGES = [['deep', 'Deep', 'var(--protein)'], ['light', 'Light', 'var(--water)'], ['rem', 'REM', 'var(--drop)'], ['awake', 'Awake', 'var(--faint)']] as const;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;

export function SourceBadge() {
  return <span className="health-badge">Samsung Health</span>;
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), W = 64, H = 22;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo || 1)) * (H - 4) - 2).toFixed(1)}`).join(' ');
  return <svg width={W} height={H} aria-hidden="true" className="sparkline"><polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function VitalRow({ icon, label, unit, values, color }: { icon: React.ReactNode; label: string; unit: string; values: number[]; color: string }) {
  const c = vsUsual(values), today = values[values.length - 1]!;
  return (
    <div className="vital-row">
      <span className="vital-icon" style={{ color }}>{icon}</span>
      <div className="grow"><p className="vital-label">{label}</p><p className="vital-value tnum">{fmtNum(today, 0)} <small>{unit}</small></p></div>
      <Sparkline values={values} color={color} />
      {c && <span className={`vital-chip ${c.state}`}>{c.state === 'normal' ? 'Normal' : c.state === 'higher' ? 'Higher' : 'Lower'} · usual {c.usual}</span>}
    </div>
  );
}

/** Samsung Health's side of a day's recovery: last night's sleep by stage, steps, and resting heart rate and HRV
 *  against the 6 days before. Nothing when that day has none of these. */
export function RecoveryVitals({ date }: { date: string }) {
  const checkins = useDB((d) => d.checkins);
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const rowFor = (day: string): CheckIn | undefined => checkins.find((c) => c.date === day && isRecoveryRow(c));
  const series = (k: 'restingHr' | 'hrv') => {
    const today = checkinNumber(rowFor(date)?.[k]);
    return today === null ? [] : week.flatMap((day) => { const v = checkinNumber(rowFor(day)?.[k]); return v === null ? [] : [v]; });
  };
  const row = rowFor(date), stages = row?.sleepStages ?? null, steps = checkinNumber(row?.steps);
  const resting = series('restingHr'), hrv = series('hrv');
  if (!stages && !resting.length && !hrv.length) return null;
  const asleep = stages ? stages.deep + stages.light + stages.rem : 0, total = stages ? asleep + stages.awake : 0;
  const stepsAvg = week.slice(0, 6).flatMap((day) => { const v = checkinNumber(rowFor(day)?.steps); return v === null ? [] : [v]; });
  return (
    <div className="recovery-vitals">
      {stages && (
        <div className="sleep-box">
          <div className="sleep-head"><Moon aria-hidden="true" /><b className="grow">{date === todayISO() ? 'Last night' : 'Sleep'}</b><b className="tnum">{hm(asleep)}</b></div>
          <p className="sleep-window tnum">{clock(stages.start)} – {clock(stages.end)}</p>
          <div className="sleep-bar" aria-hidden="true">{STAGES.map(([k, , c]) => stages[k] > 0 && <span key={k} style={{ width: `${(stages[k] / total) * 100}%`, background: c }} />)}</div>
          <div className="sleep-legend">{STAGES.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l} {hm(stages[k]).replace(/^0h /, '')}</span>)}</div>
        </div>
      )}
      {steps !== null && (
        <div className="vital-row">
          <span className="vital-icon" style={{ color: 'var(--fibre)' }}><Footprints /></span>
          <div className="grow"><p className="vital-label">Steps{date === todayISO() ? ' today' : ''}</p><p className="vital-value tnum">{fmtInt(steps)}{stepsAvg.length > 0 && <small> · usual {fmtInt(Math.round(stepsAvg.reduce((a, b) => a + b, 0) / stepsAvg.length))}</small>}</p></div>
        </div>
      )}
      {resting.length > 0 && <VitalRow icon={<HeartPulse />} label="Resting heart rate" unit="bpm" values={resting} color="var(--failure)" />}
      {hrv.length > 0 && <VitalRow icon={<Waves />} label="HRV" unit="ms" values={hrv} color="var(--ai)" />}
      <p className="vitals-note">From Samsung Health · compared with your last 6 days</p>
    </div>
  );
}
