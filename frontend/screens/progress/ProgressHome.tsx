import { useEffect, useMemo, useState } from 'react';
import { daysIntoWeek, weekdayNames } from '../../domain/week';
import { Activity, ChevronLeft, ChevronRight, Library, Moon, Pencil, Plus, Search, Trash2, Trophy, Zap } from 'lucide-react';
import type { CheckIn, Exercise } from '../../domain/types';
import { BarChart, LineChart } from '../../components/Charts';
import { ConfirmSheet, Empty, Field, InfoButton, OverflowMenu, Segmented, Sheet, TabChips, TopBar, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { body, exerciseName, exercises } from '../../data/repositories';
import { openTool } from '../../adapters/engine';
import { exerciseStats, metricLabels, setMetrics, type Metric } from '../../domain/records';
import {
  BODY_LIMITS, bodySeries, buckets, checkinNumber, isRecoveryRow, localISO, RANGES, rangeStart, recoveryCheckins, summary, workoutsInRange,
  type RangeDays, type StatMetric,
} from '../../domain/progressStats';
import { cmTo, fmtInt, fmtNum, kgTo, mss, parseDecimal, todayISO, toCm, toKg } from '../../lib/format';
import { navigate } from '../../lib/router';
import { connectHealth, syncHealth, useHealth } from '../../lib/health';
import { MuscleStats } from './MuscleStats';
import { RecoveryVitals, SourceBadge } from './RecoveryHealth';
import { takeCheckInRequest } from './RecoveryPage';
import { hm } from '../../domain/recoveryStats';
import { History } from 'lucide-react';
import { averageSeries } from '../../domain/weeklyRecap';
import { ExerciseThumb } from '../training/ExercisePicker';
import { ExercisePage } from '../training/ExercisePage';
import { Dumbbell } from 'lucide-react';

type Tab = 'summary' | 'exercises' | 'body' | 'muscles';
const TABS: { value: Tab; label: string }[] = [{ value: 'summary', label: 'Summary' }, { value: 'exercises', label: 'Exercises' }, { value: 'body', label: 'Body' }, { value: 'muscles', label: 'Statistics' }];
const day = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// The range stays the same across the four tabs (each tab is its own route) for this visit.
let lastRange: RangeDays = 90;

export function ProgressHome({ tab = 'summary', view }: { tab?: Tab; view?: string }) {
  const [range, setRangeState] = useState<RangeDays>(lastRange);
  const setRange = (r: RangeDays) => { lastRange = r; setRangeState(r); };
  const from = rangeStart(range);
  const go = (t: Tab) => navigate(t === 'summary' ? '/progress' : t === 'muscles' ? `/progress/muscles/${view ?? 'chart'}` : `/progress/${t}`, { replace: true });
  return (
    <>
      <TopBar title="Progress" actions={<button className="icon-btn" aria-label="Import workouts" title="Import workouts" onClick={() => openTool('import')}><Library /></button>} />
      <div className="screen progress-home">
        <div className="progress-range" role="group" aria-label="Time range">
          {RANGES.map((r) => <button key={r.days} type="button" aria-pressed={range === r.days} onClick={() => setRange(r.days)}>{r.label}</button>)}
        </div>
        <TabChips label="Progress view" value={tab} options={TABS} onChange={go} fill />
        {tab === 'summary' && <Summary from={from} />}
        {tab === 'exercises' && <Exercises from={from} />}
        {tab === 'body' && <Body from={from} />}
        {tab === 'muscles' && <MuscleStats view={view} days={range} />}
      </div>
    </>
  );
}

// ── Summary ────────────────────────────────────────────────────────
function Summary({ from }: { from: string | null }) {
  const all = useDB((d) => d.workouts), unit = useDB((d) => d.settings.weightUnit);
  const [metric, setMetric] = useState<StatMetric>('workouts');
  const list = useMemo(() => workoutsInRange(all, from), [all, from]);
  const s = summary(list);
  const chart = useMemo(() => buckets(list, from, metric), [list, from, metric]);
  const vol = kgTo(s.volumeKg, unit);
  return (
    <>
      <div className="progress-stats">
        <div className="card"><span className="k">Workouts</span><span className="v tnum">{s.workouts}</span></div>
        <div className="card"><span className="k">Volume</span><span className="v tnum">{unit === 'kg' ? fmtNum(vol / 1000, 1) : fmtNum(vol / 1000, 1)}<small>{unit === 'kg' ? ' t' : 'k lb'}</small></span></div>
        <div className="card"><span className="k">Time</span><span className="v tnum">{fmtNum(s.minutes / 60, 1)}<small> h</small></span></div>
      </div>
      {list.length === 0 ? (
        <Empty icon={Dumbbell} title="No workouts in this range" action={<button className="btn btn-primary" onClick={() => navigate('/training')}>Go to Training</button>} />
      ) : (
        <section className="card progress-card" aria-label="Training over time">
          <Segmented label="Chart" value={metric} onChange={setMetric} options={[{ value: 'workouts', label: 'Workouts' }, { value: 'volume', label: 'Volume' }, { value: 'minutes', label: 'Duration' }]} />
          <BarChart label={`${metric} per ${chart.byMonth ? 'month' : 'week'}`} height={170}
            bars={chart.bars.map((b) => ({ label: b.label, value: metric === 'volume' ? kgTo(b.value, unit) : metric === 'minutes' ? b.value / 60 : b.value }))}
            unit={metric === 'workouts' ? 'workouts' : metric === 'volume' ? unit : 'h'}
            format={(v) => (metric === 'volume' ? (v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : fmtInt(v)) : metric === 'minutes' ? fmtNum(v, 1) : fmtInt(v))} />
        </section>
      )}
      <Calendar />
    </>
  );
}

function Calendar() {
  const all = useDB((d) => d.workouts), unit = useDB((d) => d.settings.weightUnit);
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const byDay = useMemo(() => { const m = new Map<string, typeof all>(); for (const w of all) { const k = localISO(w.startedAt); m.set(k, [...(m.get(k) ?? []), w]); } return m; }, [all]);
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), offset = daysIntoWeek(first), days = new Date(y, mo, 0).getDate();
  const shift = (n: number) => { const d = new Date(y, mo - 1 + n, 1); const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; setMonth(m); };
  const [picked, setPicked] = useState<string | null>(null);
  const monthList = useMemo(() => all.filter((w) => localISO(w.startedAt).startsWith(month)).sort((a, b) => b.startedAt - a.startedAt), [all, month]);
  const shown = picked ? monthList.filter((w) => localISO(w.startedAt) === picked) : monthList;
  return (
    <section className="card progress-card" aria-label="Workout calendar">
      <div className="progress-cal-head">
        <button className="icon-btn" aria-label="Previous month" onClick={() => { shift(-1); setPicked(null); }}><ChevronLeft /></button>
        <span className="eyebrow">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button className="icon-btn" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => { shift(1); setPicked(null); }}><ChevronRight /></button>
      </div>
      <div className="progress-cal">
        {weekdayNames('narrow').map((d, i) => <span key={i} className="dow">{d}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={'e' + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, '0')}`, trained = byDay.has(iso);
          return <button key={iso} className={`${trained ? 'trained' : ''}${iso === today ? ' today' : ''}`} aria-pressed={iso === picked} disabled={iso > today} aria-label={`${day(iso)}${trained ? ' · workout' : ''}`} onClick={() => setPicked(picked === iso ? null : iso)}>{i + 1}</button>;
        })}
      </div>
      <span className="eyebrow">{picked ? shortDay(picked) : 'This month'} · {shown.length} {shown.length === 1 ? 'workout' : 'workouts'}</span>
      <div className="progress-day">
        {shown.map((w) => (
          <button key={w.id} className="progress-link" onClick={() => navigate(`/training/history/${w.id}`)}>
            <span className="grow"><span className="name">{w.title}</span><span className="sub tnum">{shortDay(localISO(w.startedAt))} · {Math.round((w.endedAt - w.startedAt) / 60000)} min · {w.exercises.reduce((n, b) => n + b.sets.filter((s) => s.done).length, 0)} sets</span></span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
        {!shown.length && <span className="small muted">No workouts</span>}
      </div>
    </section>
  );
}

// ── Exercises ──────────────────────────────────────────────────────
const METRIC_ORDER: Metric[] = ['weight', 'estimate', 'volume', 'reps', 'time', 'distance', 'floors', 'steps'];
function Exercises({ from }: { from: string | null }) {
  const all = useDB((d) => d.workouts), unit = useDB((d) => d.settings.weightUnit);
  const logged = useMemo(() => {
    const last = new Map<string, number>(), count = new Map<string, number>();
    for (const w of all) for (const b of w.exercises) if (b.sets.some((s) => s.done)) { last.set(b.exerciseId, Math.max(last.get(b.exerciseId) ?? 0, w.startedAt)); count.set(b.exerciseId, (count.get(b.exerciseId) ?? 0) + 1); }
    return [...last].sort((a, b) => b[1] - a[1]).map(([id]) => ({ id, sessions: count.get(id) ?? 0 }));
  }, [all]);
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('weight');
  const [details, setDetails] = useState<Exercise | null>(null);
  const id = picked && logged.some((x) => x.id === picked) ? picked : logged[0]?.id ?? null;
  const stats = useMemo(() => (id ? exerciseStats(all).get(id) : undefined), [all, id]);
  const sessions = (stats?.sessions ?? []).filter((s) => !from || localISO(s.workout.startedAt) >= from);
  const available = METRIC_ORDER.filter((m) => stats?.sessions.some(({ blocks }) => blocks.some((b) => b.sets.some((s) => setMetrics(b, s)[m] != null))));
  const m = available.includes(metric) ? metric : available[0] ?? 'reps';
  const weighty = (x: Metric) => x === 'weight' || x === 'estimate' || x === 'volume';
  const show = (v: number, x: Metric) => (weighty(x) ? kgTo(v, unit) : v);
  const unitOf = (x: Metric) => (weighty(x) ? unit : x === 'time' ? '' : x === 'distance' ? 'km' : x === 'reps' ? 'reps' : metricLabels[x].toLowerCase());
  const fmt = (v: number, x: Metric) => (x === 'time' ? mss(v) : fmtNum(v, x === 'reps' || x === 'steps' || x === 'floors' ? 0 : 1));
  const points = sessions.flatMap(({ workout, blocks }) => {
    const vals = blocks.flatMap((b) => b.sets.map((s) => setMetrics(b, s)[m]).filter((v): v is number => v != null));
    return vals.length ? [{ x: workout.startedAt, y: show(m === 'volume' ? vals.reduce((a, b) => a + b, 0) : Math.max(...vals), m) }] : [];
  });
  const ex = id ? exercises.byId(id) : undefined;
  if (!logged.length) return <Empty icon={Dumbbell} title="No exercises logged yet" action={<button className="btn btn-primary" onClick={() => navigate('/training')}>Go to Training</button>} />;
  const q = (search ?? '').trim().toLowerCase();
  return (
    <>
      <button className="card progress-exercise-pick" onClick={() => setSearch('')} aria-label={`Exercise: ${id ? exerciseName(id) : ''}. Change`}>
        <ExerciseThumb exercise={ex} />
        <span className="grow"><span className="eyebrow">Exercise</span><span className="name ellipsis">{id ? exerciseName(id) : '—'}</span></span>
        <Search aria-hidden="true" />
      </button>
      <section className="card progress-card" aria-label="Exercise trend">
        <div className="progress-chips" role="group" aria-label="Measure">
          {available.map((x) => <button key={x} type="button" className="chip" aria-pressed={x === m} onClick={() => setMetric(x)}>{x === 'weight' ? 'Heaviest' : x === 'estimate' ? 'Est. 1RM' : metricLabels[x]}</button>)}
        </div>
        <div className="progress-big tnum">{points.length ? fmt(points[points.length - 1].y, m) : '—'}<small> {unitOf(m)}</small></div>
        {points.length >= 2 ? <LineChart label={`${id ? exerciseName(id) : ''} ${metricLabels[m]}`} points={points} unit={unitOf(m)} height={150} format={(v) => fmt(v, m)} />
          : <p className="small muted">{points.length ? 'One session in this range' : 'Not logged in this range'}</p>}
      </section>
      {stats && (
        <section className="card progress-card" aria-label="Records">
          <div className="progress-card-head"><span className="eyebrow"><Trophy aria-hidden="true" className="pr-icon" />Records</span>{available.includes('estimate') && <InfoButton title="Estimated 1RM" lines={['Estimated from completed working sets of 12 reps or fewer.']} />}</div>
          {available.map((x) => { const r = stats.best.values[x]; return r ? (
            <div key={x} className="progress-record"><span>{x === 'weight' ? 'Heaviest' : x === 'estimate' ? 'Best 1RM' : `Best ${metricLabels[x].toLowerCase()}`}</span><strong className="tnum">{fmt(show(r.value, x), x)}<small> {unitOf(x)}</small></strong><time>{new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>
          ) : null; })}
          {ex && <button className="btn btn-soft btn-block progress-details" onClick={() => setDetails(ex)}>History and details<ChevronRight aria-hidden="true" /></button>}
        </section>
      )}
      <Sheet open={search !== null} onClose={() => setSearch(null)} title="Choose exercise" size="full">
        <label className="search"><Search /><input type="search" placeholder="Search your exercises" aria-label="Search your exercises" value={search ?? ''} onChange={(e) => setSearch(e.target.value)} data-autofocus /></label>
        <div className="progress-ex-list">
          {logged.filter((x) => !q || exerciseName(x.id).toLowerCase().includes(q)).map((x) => (
            <button key={x.id} className="progress-ex-row" aria-pressed={x.id === id} onClick={() => { setPicked(x.id); setSearch(null); }}>
              <ExerciseThumb exercise={exercises.byId(x.id)} /><span className="grow"><span className="name">{exerciseName(x.id)}</span><span className="sub">{x.sessions} {x.sessions === 1 ? 'session' : 'sessions'}</span></span>
            </button>
          ))}
        </div>
      </Sheet>
      {details && <ExercisePage exercise={details} onClose={() => setDetails(null)} />}
    </>
  );
}

// ── Body ───────────────────────────────────────────────────────────
type Measure = 'waist' | 'hips' | 'arms' | 'chest';
const MEASURES: Measure[] = ['waist', 'hips', 'arms', 'chest'];
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const shortDay = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** "Today" (or the chosen day) as a small chip; tapping it opens the date picker. */
function DateChip({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="date-chip">
      <span>{value === todayISO() ? 'Today' : shortDay(value)}</span>
      <input type="date" aria-label={label} max={todayISO()} value={value} onChange={(e) => onChange(e.target.value || todayISO())} />
    </label>
  );
}

function Body({ from }: { from: string | null }) {
  return <><WeightCard from={from} /><MeasurementsCard from={from} /><RecoveryCard from={from} /></>;
}

/** Latest weigh-in, goal, chart of daily weigh-ins with the 7-day average, quick entry and the list. */
function WeightCard({ from }: { from: string | null }) {
  const weights = useDB((d) => d.weights), unit = useDB((d) => d.settings.weightUnit), profile = useDB((d) => d.profile);
  const [text, setText] = useState(''), [date, setDate] = useState(todayISO()), [err, setErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
  const [allRows, setAllRows] = useState(false);
  const series = bodySeries(weights, [], 'weight', from);
  const byId = useMemo(() => new Map(weights.map((w) => [w.id, w])), [weights]);
  const fat = [...weights].reverse().find((w) => w.bodyFat != null && (!from || w.date >= from));
  const avgOf = useMemo(() => new Map(averageSeries(weights).map((r) => [r.date, r.avg])), [weights]);
  const show = (kg: number) => kgTo(kg, unit);
  const latest = series.at(-1), end = latest && avgOf.get(latest.date), start = series[0] && avgOf.get(series[0].date);
  const change = series.length > 1 && end !== undefined && start !== undefined ? show(end) - show(start) : null;
  const add = () => {
    const n = parseDecimal(text), kg = n === null ? null : toKg(n, unit), [lo, hi] = BODY_LIMITS.weight;
    if (kg === null) return setErr(`Enter your weight in ${unit}.`);
    if (kg < lo || kg > hi) return setErr('That weight looks wrong.');
    if (!date || date > todayISO()) return setErr('Choose today or an earlier day.');
    body.logWeight(date, Math.round(kg * 100) / 100); setErr(null); setText(''); setDate(todayISO()); toast('Weight logged');
  };
  return (
    <section className="card progress-card" aria-label="Weight">
      <div className="progress-card-head body-head">
        <div>
          <span className="eyebrow">Weight<InfoButton title="7-day average" lines={['The bold line averages your weigh-ins from the 7 days up to each day.', 'Faint points are the single weigh-ins. Missing days are left out, not guessed.']} /></span>
          <span className="progress-big tnum">{latest ? fmtNum(show(latest.value), 1) : '—'}<small> {unit}</small></span>
        </div>
        {profile?.targetWeightKg ? <span className="body-goal tnum">Goal {fmtNum(show(profile.targetWeightKg), 1)} {unit}</span> : null}
      </div>
      <div className="progress-sub tnum">
        {end !== undefined && <span>Avg {fmtNum(show(end), 1)} {unit}</span>}
        {change !== null && <span className={change === 0 ? '' : 'strong'}>{change > 0 ? '+' : ''}{fmtNum(change, 1)} {unit} in this range</span>}
      </div>
      {series.length >= 2 && <>
        <LineChart label="Weight" points={series.map((r) => { const a = avgOf.get(r.date); return { x: new Date(r.date + 'T12:00:00').getTime(), y: show(r.value), ...(a !== undefined ? { avg: show(a) } : {}) }; })} unit={unit} height={150} format={(v) => fmtNum(v, 1)} />
        <div className="chart-legend"><span><i className="dot" />Daily</span><span className="accent-text"><i className="line" />7-day average</span></div>
      </>}
      {fat && <div className="body-fat-row"><span className="grow">Body fat <b className="tnum">{fmtNum(fat.bodyFat!, 1)}%</b><span className="muted"> · {shortDay(fat.date)}</span></span><SourceBadge /></div>}
      <div className="quick-entry">
        <input className="input tnum" inputMode="decimal" aria-label={`Weight in ${unit}`} placeholder={`Weight (${unit})`} value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === 'Enter' && add()} aria-invalid={!!err} />
        <DateChip label="Weigh-in date" value={date} onChange={setDate} />
        <button type="button" className="round-add" aria-label="Add weight" onClick={add}><Plus /></button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="progress-history">
        {[...series].reverse().slice(0, allRows ? undefined : 8).map((r) => (
          <div key={r.id} className="progress-history-row">
            <span>{day(r.date)}</span>{byId.get(r.id)?.source === 'health' && <SourceBadge />}<strong className="tnum">{fmtNum(show(r.value), 1)} {unit}</strong>
            <button className="icon-btn" aria-label={`Remove weight from ${day(r.date)}`} onClick={() => setRemoving({ id: r.id, label: `${fmtNum(show(r.value), 1)} ${unit} · ${day(r.date)}` })}><Trash2 /></button>
          </div>
        ))}
        {!series.length && <p className="small muted">No weigh-ins in this range</p>}
        {series.length > 8 && !allRows && <button className="btn btn-link progress-more" onClick={() => setAllRows(true)}>Show all {series.length}</button>}
      </div>
      <ConfirmSheet open={!!removing} onClose={() => setRemoving(null)} danger title="Remove this weigh-in?" body={removing?.label} confirmLabel="Remove"
        onConfirm={() => { if (removing) { body.deleteWeight(removing.id); toast('Entry removed'); } }} />
    </section>
  );
}

/** Latest waist, hips, arms and chest with the change since the previous value; tap one for its chart. */
function MeasurementsCard({ from }: { from: string | null }) {
  const checkins = useDB((d) => d.checkins), lu = useDB((d) => d.settings.lengthUnit ?? 'cm');
  const len = (cm: number) => cmTo(cm, lu);
  const [adding, setAdding] = useState(false), [focus, setFocus] = useState<Measure | null>(null), [removing, setRemoving] = useState<string | null>(null), [allRows, setAllRows] = useState(false);
  // Newest first; on the same day the one entered later comes first.
  const rows = useMemo(() => checkins.map((c, i) => [c, i] as const).filter(([c]) => MEASURES.some((k) => checkinNumber(c[k]) !== null)).sort((a, b) => b[0].date.localeCompare(a[0].date) || b[1] - a[1]).map(([c]) => c), [checkins]);
  const inRange = rows.filter((r) => !from || r.date >= from);
  const values = (k: Measure) => rows.map((r) => checkinNumber(r[k])).filter((v): v is number => v !== null); // newest first
  const series = focus ? bodySeries([], checkins, focus, from) : [];
  return (
    <section className="card progress-card" aria-label="Measurements">
      <div className="progress-card-head">
        <span className="eyebrow">Measurements{rows[0] ? ` · ${shortDay(rows[0].date)}` : ''}</span>
        <button type="button" className="chip" onClick={() => setAdding(true)}><Plus />Add</button>
      </div>
      <div className="measure-grid">
        {MEASURES.map((k) => {
          const [cur, prev] = values(k), diff = cur !== undefined && prev !== undefined ? cur - prev : null;
          return (
            <button key={k} type="button" className="measure-tile" aria-pressed={focus === k} onClick={() => setFocus(focus === k ? null : k)}>
              <span className="k">{cap(k)}</span>
              <span className="v tnum">{cur !== undefined ? fmtNum(len(cur), 1) : '—'}<small> {lu}</small></span>
              {diff !== null && <span className={`d tnum ${diff <= 0 ? 'down' : 'up'}`}>{diff > 0 ? '+' : ''}{fmtNum(len(diff), 1)} {lu}</span>}
            </button>
          );
        })}
      </div>
      {focus && (series.length >= 2
        ? <LineChart label={cap(focus)} points={series.map((r) => ({ x: new Date(r.date + 'T12:00:00').getTime(), y: len(r.value) }))} unit={lu} height={140} format={(v) => fmtNum(v, 1)} />
        : <p className="small muted">{series.length ? `One ${focus} entry in this range` : `No ${focus} entries in this range`}</p>)}
      {inRange.length > 0 && <>
        <span className="eyebrow">History</span>
        <div className="progress-history">
          {inRange.slice(0, allRows ? undefined : 6).map((r) => (
            <div key={r.id} className="progress-history-row measure-row">
              <span>{shortDay(r.date)}</span>
              <span className="tnum muted">{MEASURES.filter((k) => checkinNumber(r[k]) !== null).map((k) => `${k[0].toUpperCase()} ${fmtNum(len(checkinNumber(r[k])!), 1)}`).join(' · ')}</span>
              <button className="icon-btn" aria-label={`Remove measurements from ${day(r.date)}`} onClick={() => setRemoving(r.id)}><Trash2 /></button>
            </div>
          ))}
          {inRange.length > 6 && !allRows && <button className="btn btn-link progress-more" onClick={() => setAllRows(true)}>Show all {inRange.length}</button>}
        </div>
      </>}
      <MeasurementsSheet open={adding} onClose={() => setAdding(false)} last={rows[0]} unit={lu} />
      <ConfirmSheet open={!!removing} onClose={() => setRemoving(null)} danger title="Remove these measurements?" confirmLabel="Remove"
        onConfirm={() => { if (removing) { body.removeMeasurements(removing); toast('Measurements removed'); } }} />
    </section>
  );
}

function MeasurementsSheet({ open, onClose, last, unit }: { open: boolean; onClose: () => void; last?: CheckIn; unit: 'cm' | 'in' }) {
  const blank = { waist: '', hips: '', arms: '', chest: '' };
  const [f, setF] = useState<Record<Measure, string>>(blank), [date, setDate] = useState(todayISO()), [err, setErr] = useState<string | null>(null);
  const save = () => {
    const vals: Partial<Record<Measure, number>> = {};
    for (const k of MEASURES) {
      if (!f[k].trim()) continue;
      const typed = parseDecimal(f[k]), n = typed === null ? null : toCm(typed, unit), [lo, hi] = BODY_LIMITS[k];
      if (n === null || n < lo || n > hi) return setErr(`${cap(k)} looks wrong.`);
      vals[k] = Math.round(n * 100) / 100;
    }
    if (!Object.keys(vals).length) return setErr('Enter at least one measurement.');
    if (!date || date > todayISO()) return setErr('Choose today or an earlier day.');
    body.addMeasurements(date, vals); toast('Measurements saved'); setF(blank); setErr(null); setDate(todayISO()); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="New measurements" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="grid-2">
        {MEASURES.map((k) => <Field key={k} label={`${cap(k)} (${unit})`} htmlFor={'ms-' + k}><input id={'ms-' + k} className="input tnum" inputMode="decimal" value={f[k]} placeholder={last && checkinNumber(last[k]) !== null ? fmtNum(cmTo(checkinNumber(last[k])!, unit), 1) : ''} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setErr(null); }} /></Field>)}
      </div>
      <Field label="Date" htmlFor="ms-date"><input id="ms-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
    </Sheet>
  );
}

/** Sleep, soreness and energy sliders for a day (today by default), a note, and recent check-ins. */
function RecoveryCard({ from }: { from: string | null }) {
  const checkins = useDB((d) => d.checkins);
  // Opened from Recovery or Overview to edit a day: that day, with the card in view.
  const [requested] = useState(takeCheckInRequest);
  const [date, setDate] = useState(requested ?? todayISO());
  useEffect(() => { if (requested) document.getElementById('recovery-card')?.scrollIntoView({ block: 'start' }); }, [requested]);
  const existing = checkins.find((c) => c.date === date && isRecoveryRow(c));
  const init = () => ({ sleep: checkinNumber(existing?.sleep) ?? 7, soreness: checkinNumber(existing?.soreness) ?? 2, energy: checkinNumber(existing?.energy) ?? 4, note: existing?.note ?? '' });
  const [v, setV] = useState(init);
  useEffect(() => setV(init()), [date, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [removing, setRemoving] = useState<string | null>(null);
  // Only the latest check-in here; the rest is on Progress → Recovery.
  const recent = recoveryCheckins(checkins, from).slice(0, 1);
  // The Android app: sleep and steps from Health Connect (Samsung Health…).
  const [health, refreshHealth] = useHealth();
  const [linking, setLinking] = useState(false);
  useEffect(() => { if (health === 'on') void syncHealth(); }, [health]);
  const link = async () => {
    setLinking(true);
    try {
      const r = await connectHealth();
      toast(r === 'connected' ? 'Samsung Health connected' : r === 'install' ? 'Install Health Connect from the Play Store, then tap again.' : r === 'unsupported' ? 'Health Connect isn’t available on this phone.' : 'Sleep and steps weren’t allowed.');
    } catch { toast('Couldn’t connect. Please try again.'); }
    finally { setLinking(false); refreshHealth(); }
  };
  const steps = checkinNumber(existing?.steps);
  const sliders: [keyof typeof v & ('sleep' | 'soreness' | 'energy'), string, typeof Moon, number, number, number, string][] = [
    ['sleep', 'Sleep', Moon, 3, 12, 0.5, ' h'], ['soreness', 'Soreness', Activity, 1, 5, 1, '/5'], ['energy', 'Energy', Zap, 1, 5, 1, '/5'],
  ];
  const save = () => { body.saveCheckIn({ date, sleep: v.sleep, soreness: v.soreness, energy: v.energy, note: v.note.trim() }); toast('Check-in saved'); };
  return (
    <section id="recovery-card" className="card progress-card" aria-label="Recovery check-in">
      <div className="progress-card-head"><span className="eyebrow">Recovery check-in</span><DateChip label="Check-in date" value={date} onChange={setDate} /></div>
      <RecoveryVitals date={date} />
      {sliders.map(([k, label, Icon, min, max, step, u]) => (
        <label key={k} className="slider-row">
          <span className="slider-head"><span><Icon aria-hidden="true" />{label}</span><strong className="tnum">{fmtNum(v[k], 1)}{u}</strong></span>
          <input type="range" min={min} max={max} step={step} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
        </label>
      ))}
      {steps !== null && !existing?.sleepStages && checkinNumber(existing?.restingHr) === null && checkinNumber(existing?.hrv) === null && <p className="small muted tnum" style={{ margin: 0 }}>{fmtInt(steps)} steps{health === 'on' ? ' · from Health Connect' : ''}</p>}
      {(health === 'off' || health === 'reconnect') && (
        <button type="button" className="btn btn-secondary btn-block" disabled={linking} onClick={() => void link()}>
          <Moon aria-hidden="true" />{health === 'reconnect' ? 'Reconnect Samsung Health' : 'Get sleep, steps & heart rate from Samsung Health'}
        </button>
      )}
      <input className="input" aria-label="Note" placeholder="Note (optional)" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <button type="button" className="btn btn-primary btn-block" onClick={save}>{existing ? 'Update check-in' : 'Save check-in'}</button>
      {recent.length > 0 && <div className="progress-history">
        {recent.map((c) => {
          const parts = [checkinNumber(c.sleep) !== null && `Sleep ${hm(checkinNumber(c.sleep)!)}`, checkinNumber(c.soreness) !== null && `Sore ${checkinNumber(c.soreness)}/5`, checkinNumber(c.energy) !== null && `Energy ${checkinNumber(c.energy)}/5`, checkinNumber(c.steps) !== null && `${fmtInt(checkinNumber(c.steps)!)} steps`, checkinNumber(c.restingHr) !== null && `Resting ${checkinNumber(c.restingHr)} bpm`, checkinNumber(c.hrv) !== null && `HRV ${fmtNum(checkinNumber(c.hrv)!, 0)} ms`].filter(Boolean);
          return (
            <div key={c.id} className="progress-checkin">
              <span className="grow"><span className="name">{shortDay(c.date)}</span><span className="sub tnum">{parts.join(' · ') || '—'}</span>{c.note?.trim() && <span className="note">{c.note}</span>}</span>
              <OverflowMenu small title="Check-in" actions={[{ label: 'Edit', icon: Pencil, onSelect: () => setDate(c.date) }, { label: 'Show history', icon: History, onSelect: () => navigate('/progress/recovery') }, { label: 'Delete check-in', icon: Trash2, danger: true, onSelect: () => setRemoving(c.id) }]} />
            </div>
          );
        })}
        <button className="btn btn-link progress-more" onClick={() => navigate('/progress/recovery')}>See all recovery<ChevronRight aria-hidden="true" /></button>
      </div>}
      <ConfirmSheet open={!!removing} onClose={() => setRemoving(null)} danger title="Delete this check-in?" confirmLabel="Delete"
        onConfirm={() => { if (removing) { body.deleteCheckIn(removing); toast('Check-in deleted'); } }} />
    </section>
  );
}
