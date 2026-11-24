// Cycle & Health home (in Progress): cycle day and timeline, the estimate line (step 5 fills it), three actions
// (Log today, Insights, Records) and the month calendar. Recorded, estimated and unknown always look different.
import { useEffect, useMemo, useState } from 'react';
import { syncCyclePeriods } from '../../lib/cycleHealth';
import { BarChart3, CalendarCheck, ChevronLeft, ChevronRight, Droplet, FileHeart, MoveHorizontal, PauseCircle, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useDB } from '../../data/store';
import { navigate } from '../../lib/router';
import { InfoButton } from '../../components/ui';
import { cycleNow, dayMark, daysBetween } from '../../domain/cycle';
import type { CycleDay, ISODate } from '../../domain/types';
import { estimateNext, lengthsOutsidePause, type Estimate } from '../../domain/cyclePredict';
import { cycleRangeStats, rangeName } from '../../domain/cycleRange';
import { rangeStart, type RangeDays } from '../../domain/progressStats';
import { Bars, Ring } from './CycleInsights';
import { PAUSE_ABOUT, pauseLabel } from '../../domain/cyclePause';
import type { CyclePause } from '../../domain/types';

const localToday = (): ISODate => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const short = (d: ISODate) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function CycleHome({ range = 90 }: { range?: RangeDays }) {
  const days = useDB((d) => d.cycle.days), weekStart = useDB((d) => d.settings.weekStart ?? 1);
  const today = localToday();
  const now = useMemo(() => cycleNow(days, today), [days, today]);
  const cs = useDB((d) => d.cycle.settings), pause = cs?.pause;
  const real = useMemo(() => estimateNext(days, today, { since: cs?.pauseSince, until: cs?.pauseUntil }), [days, today, cs?.pauseSince, cs?.pauseUntil]);
  // Own cycles only: those overlapping a past pause (pill bleeds, pregnancy, breastfeeding) are left out.
  const own = useMemo(() => lengthsOutsidePause(days.filter((d) => d.date <= today), { since: cs?.pauseSince, until: cs?.pauseUntil }).filter((x) => x > 0 && x <= 150), [days, today, cs?.pauseSince, cs?.pauseUntil]);
  const lo = own.length ? Math.min(...own) : 0, hi = own.length ? Math.max(...own) : 0;
  const est: Estimate = pause ? { state: 'insufficient', about: [] } : real;   // paused: no estimate anywhere
  useEffect(() => { syncCyclePeriods().catch(() => {}); }, []);   // period days from Health Connect, when switched on
  return (
    <div className="cycle-home">
      <section className="cy-hero">
        {now.day ? <>
          <div className="cy-daylbl">Cycle day</div>
          <div className="cy-daynum tnum">{now.day}<small>since {short(now.lastStart!)}</small></div>
          {own.length > 0 && !pause && <div className="cy-range">Your cycles: {lo === hi ? `${lo}` : `${lo}–${hi}`} days{hi - lo > 9 ? ' · they vary a lot' : ''}</div>}
          <Timeline day={now.day} periodDays={now.lastPeriod?.length ?? 0} est={est} lastStart={now.lastStart!} />
        </> : <>
          <div className="cy-daylbl">Cycle & Health</div>
          <div className="cy-empty-title">Log your period to start</div>
          <div className="cy-range">Your cycle day and estimates appear once your first period is logged.</div>
        </>}
        {pause ? <PausedLine pause={pause} /> : <EstimateLine est={est} />}
      </section>
      <div className="cy-acts">
        <button className="cy-act main" onClick={() => navigate(`/progress/cycle/log/${today}`)}><span className="ai"><Plus /></span>Log today</button>
        <button className="cy-act" onClick={() => navigate('/progress/cycle/insights')}><span className="ai"><BarChart3 /></span>Insights</button>
        <button className="cy-act" onClick={() => navigate('/progress/cycle/records')}><span className="ai"><FileHeart /></span>Records</button>
      </div>
      <Calendar days={days} today={today} est={est} weekStart={weekStart} paused={!!pause} />
      <InRange range={range} today={today} />
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
      {periodDays > 0 && <rect x={x(0)} y="22" width={Math.max(14, x(periodDays) - x(0))} height="14" rx="7" fill="var(--brand)" />}
      {from !== null && to !== null && <rect x={x(from)} y="16" width={Math.max(26, x(to) - x(from))} height="26" rx="13" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeDasharray="6 5" />}
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
      <span className="grow">{est.state === 'range' ? <>Next period <b>{short(est.from)} – {short(est.to)}</b></> : est.restart ? <>Estimates restart <b>after your next period</b></> : <>Next period: <b>not enough data yet</b></>}</span>
      <InfoButton title="About this estimate" label="About this estimate" lines={est.about} />
    </div>
  );
}

function PausedLine({ pause }: { pause: CyclePause }) {
  return (
    <div className="cy-est cy-paused">
      <button type="button" className="cy-pausebtn" onClick={() => navigate('/settings/cycle')}>
        <PauseCircle aria-hidden="true" /><span className="grow">Estimates paused · <b>{pauseLabel(pause)}</b></span>
      </button>
      <InfoButton title="Why estimates are paused" label="Why estimates are paused" lines={[...PAUSE_ABOUT, 'Change it in Cycle & Health settings → Right now.']} />
    </div>
  );
}

function Calendar({ days, today, est, weekStart, paused }: { days: CycleDay[]; today: ISODate; est: Estimate; weekStart: 0 | 1 | 6; paused: boolean }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  const first = month + '-01', dow = new Date(first + 'T12:00:00').getDay(), lead = (dow - weekStart + 7) % 7;
  const monthLen = new Date(y, m, 0).getDate(), prevLen = new Date(y, m - 1, 0).getDate(), trail = (7 - ((lead + monthLen) % 7)) % 7;
  const names = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + ((weekStart + i) % 7))).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' }));
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const title = new Date(first + 'T12:00:00').toLocaleDateString('en-GB', y === +today.slice(0, 4) ? { month: 'long' } : { month: 'long', year: 'numeric' });
  return (
    <section className="cy-cal" aria-label="Calendar">
      <div className="cy-cal-head">
        <h3>{title}</h3>
        <span className="cy-cal-nav">
          {month !== today.slice(0, 7) && <button className="cy-link" onClick={() => setMonth(today.slice(0, 7))}>Today</button>}
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></button>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></button>
        </span>
      </div>
      <div className="cy-grid">
        {names.map((n, i) => <span key={i} className="cy-dw" aria-hidden="true">{n}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={'b' + i} className="cy-d out" aria-hidden="true"><span className="c">{prevLen - lead + i + 1}</span></span>)}
        {Array.from({ length: monthLen }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}` as ISODate, mark = dayMark(byDate.get(date));
          const inEst = est.state === 'range' && date >= est.from && date <= est.to && !byDate.get(date)?.bleeding;
          const cls = ['cy-d', mark ? `m-${mark}` : '', inEst ? 'est' : '', date === today ? 'today' : '', date > today ? 'future' : ''].filter(Boolean).join(' ');
          const what = mark === 'period' ? 'period' : mark === 'spotting' ? 'spotting' : mark === 'other-bleed' ? 'other bleeding' : mark === 'symptoms' ? 'symptoms logged' : mark === 'nothing' ? 'nothing to note' : mark === 'logged' ? 'logged' : 'not logged';
          return <button key={date} className={cls} disabled={date > today && !inEst} aria-label={`${short(date)}: ${what}${inEst ? ', estimated period' : ''}`}
            onClick={() => date <= today && navigate(`/progress/cycle/log/${date}`)}><span className="c">{i + 1}</span></button>;
        })}
        {Array.from({ length: trail }, (_, i) => <span key={'a' + i} className="cy-d out" aria-hidden="true"><span className="c">{i + 1}</span></span>)}
      </div>
      <div className="cy-key">
        <span><i className="k-per" />Period</span><span><i className="k-spot" />Spotting</span>{!paused && <span><i className="k-est" />Estimated</span>}
        <span><i className="k-sym" />Symptoms</span><span><i className="k-ok" />Nothing to note</span>
        <InfoButton title="The calendar" label="About the calendar" lines={[
          'Period (solid orange): a day you logged as your period.',
          'Spotting (dots in a circle): light bleeding outside your period. It never starts a new cycle.',
          'Estimated (dashed circle): when your next period is likely, from the estimate. Not a logged day.',
          'Symptoms (grey dot): a logged day without bleeding where you noted a symptom or pain.',
          'Nothing to note (green dot): you logged that the day was fine.',
          'No mark: not logged, so unknown (never counted as “no symptoms”). Tap a past day to log it.']} />
      </div>
    </section>
  );
}

// The chosen range (1M … All): a few tiles, cycle lengths and top symptoms. 1M rarely holds a full cycle, so it shows
// this cycle so far instead of an empty chart.
function InRange({ range, today }: { range: RangeDays; today: ISODate }) {
  const days = useDB((d) => d.cycle.days), workouts = useDB((d) => d.workouts);
  const st = useMemo(() => cycleRangeStats(days, workouts, today, rangeStart(range)), [days, workouts, today, range]);
  const now = useMemo(() => cycleNow(days, today), [days, today]);
  if (!days.length) return null;
  const month = range === 30, symptomDays = days.filter((d) => d.date <= today && d.date >= (rangeStart(range) ?? '') && Object.keys(d.symptoms ?? {}).length).length;
  const span = st.shortest === null ? '–' : st.shortest === st.longest ? `${st.shortest}` : `${st.shortest}–${st.longest}`;
  return <section className="cy-sec cy-inrange" aria-label={rangeName(range)}>
    <div className="cy-sech"><h3>{month ? 'This cycle so far' : rangeName(range)} <InfoButton title={month ? 'This cycle so far' : rangeName(range)} label="About these numbers" lines={[
      month ? 'A month rarely holds a full cycle, so 1M shows the cycle you are in now and your logs from the last 30 days.' : 'Cycles that started in this range, from the first day of a period to the first day of the next.',
      'Days you didn’t log are left out, never counted as “no symptoms”.', 'Change the range at the top: 1M, 3M, 6M, 1Y or All.']} /></h3>
      {!month && st.cycles.length > 0 && <button className="cy-link" onClick={() => navigate('/progress/cycle/insights')}>More</button>}</div>
    <div className="cy-tiles2">
      {month ? <>
        <div className="cy-st"><span className="ai"><RefreshCw /></span><b className="tnum">{now.day ?? '–'}</b><span>Cycle day</span></div>
        <div className="cy-st"><span className="ai"><Droplet /></span><b className="tnum">{now.lastPeriod && now.lastPeriod.start >= (rangeStart(range) ?? '') ? now.lastPeriod.length : '–'} <small>d</small></b><span>Period</span></div>
        <div className="cy-st"><span className="ai"><CalendarCheck /></span><b className="tnum">{st.logged}<small>/30</small></b><span>Days logged</span></div>
        <div className="cy-st"><span className="ai"><Sparkles /></span><b className="tnum">{symptomDays}</b><span>Days with symptoms</span></div>
      </> : <>
        <div className="cy-st"><span className="ai"><RefreshCw /></span><b className="tnum">{st.usual ?? '–'} <small>d</small></b><span>Usual cycle · {st.cycles.length} {st.cycles.length === 1 ? 'cycle' : 'cycles'}</span></div>
        <div className="cy-st"><span className="ai"><MoveHorizontal /></span><b className="tnum">{span}</b><span>Shortest–longest</span></div>
        <div className="cy-st"><span className="ai"><Droplet /></span><b className="tnum">{st.periodLen ?? '–'} <small>d</small></b><span>Period</span></div>
        <div className="cy-st"><span className="ai"><CalendarCheck /></span><b className="tnum">{st.logged}{range ? <small>/{range}</small> : null}</b><span>Days logged</span></div>
      </>}
    </div>
    {!month && st.cycles.length >= 2 && <div className="card cy-chartcard"><Bars lengths={st.cycles.slice(-12).map((c) => c.length)} starts={st.cycles.slice(-12).map((c) => c.start)} /></div>}
    {st.top.length > 0 && <div className="cy-sym4">{st.top.map(([s, p]) => <div key={s} className="cy-sy"><Ring pct={p} />{s}</div>)}</div>}
  </section>;
}
