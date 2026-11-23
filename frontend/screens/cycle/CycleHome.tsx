// Cycle & Health home (in Progress): cycle day and timeline, the estimate line (step 5 fills it), three actions
// (Log today, Insights, Records) and the month calendar. Recorded, estimated and unknown always look different.
import { useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, FileHeart, Plus } from 'lucide-react';
import { useDB } from '../../data/store';
import { navigate } from '../../lib/router';
import { InfoButton } from '../../components/ui';
import { cycleNow, dayMark, daysBetween } from '../../domain/cycle';
import type { CycleDay, ISODate } from '../../domain/types';
import { estimateNext, type Estimate } from '../../domain/cyclePredict';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const short = (d: ISODate) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function CycleHome() {
  const days = useDB((d) => d.cycle.days), weekStart = useDB((d) => d.settings.weekStart ?? 1);
  const today = localToday();
  const now = useMemo(() => cycleNow(days, today), [days, today]);
  const est = useMemo(() => estimateNext(days, today), [days, today]);
  return (
    <div className="cycle-home">
      <section className="cy-hero">
        {now.day ? <>
          <div className="cy-daylbl">Cycle day</div>
          <div className="cy-daynum tnum">{now.day}<small>since {short(now.lastStart!)}</small></div>
          {now.shortest !== null && <div className="cy-range">Your cycles: {now.shortest === now.longest ? `${now.shortest}` : `${now.shortest}–${now.longest}`} days</div>}
          <Timeline day={now.day} periodDays={now.lastPeriod?.length ?? 0} est={est} lastStart={now.lastStart!} />
        </> : <>
          <div className="cy-daylbl">Cycle & Health</div>
          <div className="cy-empty-title">Log your period to start</div>
          <div className="cy-range">Your cycle day and estimates appear once your first period is logged.</div>
        </>}
        <EstimateLine est={est} />
      </section>
      <div className="cy-acts">
        <button className="cy-act main" onClick={() => navigate(`/progress/cycle/log/${today}`)}><span className="ai"><Plus /></span>Log today</button>
        <button className="cy-act" onClick={() => navigate('/progress/cycle/insights')}><span className="ai"><BarChart3 /></span>Insights</button>
        <button className="cy-act" onClick={() => navigate('/progress/cycle/records')}><span className="ai"><FileHeart /></span>Records</button>
      </div>
      <Calendar days={days} today={today} est={est} weekStart={weekStart} />
    </div>
  );
}

function Timeline({ day, periodDays, est, lastStart }: { day: number; periodDays: number; est: Estimate; lastStart: ISODate }) {
  const from = est.state === 'range' ? daysBetween(lastStart, est.from) + 1 : null, to = est.state === 'range' ? daysBetween(lastStart, est.to) + 1 : null;
  const max = Math.max(35, day + 3, (to ?? 0) + 3), W = 340, x = (d: number) => 8 + (Math.min(d, max) / max) * (W - 16);
  return (
    <svg className="cy-line" viewBox={`0 0 ${W} 64`} role="img" aria-label={`Cycle day ${day}. Period on days 1 to ${periodDays}.${from ? ` Next period estimated between day ${from} and day ${to}.` : ''}`}>
      <rect x={x(0)} y="22" width={x(max) - x(0)} height="14" rx="7" fill="var(--surface-2)" />
      <rect x={x(0)} y="22" width={x(day) - x(0)} height="14" rx="7" fill="var(--accent-soft)" />
      {periodDays > 0 && <rect x={x(0)} y="22" width={Math.max(14, x(periodDays) - x(0))} height="14" rx="7" fill="var(--accent)" />}
      {from !== null && to !== null && <rect x={x(from)} y="16" width={Math.max(26, x(to) - x(from))} height="26" rx="13" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 5" />}
      <circle cx={x(day)} cy="29" r="11" fill="var(--ink)" /><circle cx={x(day)} cy="29" r="4" fill="var(--bg)" />
      <text x={x(0)} y="12" fontSize="11" fontWeight="700" fill="var(--accent)">Period</text>
      <text x={x(0)} y="58" fontSize="11" fontWeight="700" fill="var(--muted)">Day 1</text>
      <text x={x(day)} y="58" fontSize="11" fontWeight="800" fill="var(--text)" textAnchor="middle">Today</text>
      {from !== null && to !== null && <text x={(x(from) + x(to)) / 2} y="58" fontSize="11" fontWeight="700" fill="var(--accent)" textAnchor="middle">likely next</text>}
    </svg>
  );
}

function EstimateLine({ est }: { est: Estimate }) {
  return (
    <div className="cy-est">
      <span className="cy-dash" aria-hidden="true" />
      <span className="grow">{est.state === 'range' ? <>Next period <b>{short(est.from)} – {short(est.to)}</b></> : <>Next period: <b>not enough data yet</b></>}</span>
      <InfoButton title="About this estimate" label="About this estimate" lines={est.about} />
    </div>
  );
}

function Calendar({ days, today, est, weekStart }: { days: CycleDay[]; today: ISODate; est: Estimate; weekStart: 0 | 1 | 6 }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const first = month + '-01', dow = new Date(first + 'T12:00:00').getDay(), lead = (dow - weekStart + 7) % 7;
  const monthLen = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  const names = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + ((weekStart + i) % 7))).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }));
  const shift = (n: number) => { const d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const title = new Date(first + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <section className="cy-cal" aria-label="Calendar">
      <div className="cy-cal-head">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></button>
        <h3>{title}</h3>
        <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></button>
      </div>
      <div className="cy-grid">
        {names.map((n, i) => <span key={i} className="cy-dw" aria-hidden="true">{n}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={'b' + i} />)}
        {Array.from({ length: monthLen }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}` as ISODate, mark = dayMark(byDate.get(date));
          const inEst = est.state === 'range' && date >= est.from && date <= est.to && !byDate.get(date)?.bleeding;
          const cls = ['cy-d', mark ? `m-${mark}` : '', inEst ? 'est' : '', date === today ? 'today' : '', date > today ? 'future' : ''].filter(Boolean).join(' ');
          const what = mark === 'period' ? 'period' : mark === 'spotting' ? 'spotting' : mark === 'other-bleed' ? 'other bleeding' : mark === 'symptoms' ? 'symptoms logged' : mark === 'nothing' ? 'nothing to note' : mark === 'logged' ? 'logged' : 'not logged';
          return <button key={date} className={cls} disabled={date > today && !inEst} aria-label={`${short(date)}: ${what}${inEst ? ', estimated period' : ''}`}
            onClick={() => date <= today && navigate(`/progress/cycle/log/${date}`)}><span className="c">{i + 1}</span></button>;
        })}
      </div>
      <div className="cy-key">
        <span><i className="k-per" />Period</span><span><i className="k-spot" />Spotting</span><span><i className="k-est" />Estimated</span>
        <span><i className="k-sym" />Symptoms</span><span><i className="k-ok" />Nothing to note</span>
      </div>
    </section>
  );
}
