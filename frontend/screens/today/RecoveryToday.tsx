import { ChevronRight, Footprints, HeartPulse, Moon, Pencil, Waves } from 'lucide-react';
import { useDB } from '../../data/store';
import { OverflowMenu } from '../../components/ui';
import { compared, hm, recoveryDay, recoveryRange, shiftDay, type Metric } from '../../domain/recoveryStats';
import { fmtInt, fmtNum, todayISO } from '../../lib/format';
import { navigate } from '../../lib/router';
import { editCheckIn, MetricTile } from '../progress/RecoveryPage';

/** Overview: the day's recovery (sleep, steps, resting heart rate, HRV, energy and soreness) at a glance. */
export function RecoveryToday({ date }: { date: string }) {
  const checkins = useDB((d) => d.checkins);
  const day = recoveryDay(checkins, date);
  const week = recoveryRange(checkins, shiftDay(date, -6), date);
  const line = (m: Metric) => week.flatMap((d) => (d.day?.[m] != null ? [d.day[m] as number] : []));
  const isToday = date === todayISO();
  return (
    <section className="card overview-card recovery-today" aria-label="Recovery">
      <div className="overview-card-head">
        <span className="eyebrow"><Moon aria-hidden="true" className="recovery-icon" />Recovery</span>
        <OverflowMenu small title="Recovery" actions={[
          { label: 'Open recovery', icon: ChevronRight, onSelect: () => navigate('/progress/recovery') },
          { label: day ? 'Edit check-in' : 'Check in', icon: Pencil, onSelect: () => editCheckIn(date) },
        ]} />
      </div>
      {!day ? (
        <button className="recovery-empty" onClick={() => editCheckIn(date)}>
          <span className="grow"><b>{isToday ? 'How do you feel today?' : 'No check-in on this day'}</b><span className="small muted">Sleep, energy and soreness. Samsung Health fills sleep and steps.</span></span>
          <span className="btn btn-secondary btn-sm">Check in</span>
        </button>
      ) : (
        <button className="recovery-body" onClick={() => navigate('/progress/recovery')} aria-label="Open recovery">
          <div className="metric-grid compact">
            <MetricTile icon={<Moon />} label="Sleep" value={day.sleep != null ? hm(day.sleep) : null} color="var(--protein)" line={line('sleep')} cmp={compared(checkins, date, 'sleep')} good="higher" fmt={hm} />
            <MetricTile icon={<Footprints />} label="Steps" value={day.steps != null ? fmtInt(day.steps) : null} color="var(--fibre)" line={line('steps')} cmp={compared(checkins, date, 'steps')} good="higher" />
            <MetricTile icon={<HeartPulse />} label="Resting HR" value={day.restingHr != null ? fmtInt(day.restingHr) : null} unit="bpm" color="var(--failure)" line={line('restingHr')} cmp={compared(checkins, date, 'restingHr')} good="lower" />
            <MetricTile icon={<Waves />} label="HRV" value={day.hrv != null ? fmtNum(day.hrv, 0) : null} unit="ms" color="var(--ai)" line={line('hrv')} cmp={compared(checkins, date, 'hrv')} good="higher" />
          </div>
          {(day.energy != null || day.soreness != null) && <p className="recovery-felt small tnum">{[day.energy != null && `Energy ${day.energy}/5`, day.soreness != null && `Soreness ${day.soreness}/5`].filter(Boolean).join(' · ')}</p>}
        </button>
      )}
    </section>
  );
}
