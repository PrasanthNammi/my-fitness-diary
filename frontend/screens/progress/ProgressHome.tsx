import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Library, Plus, Search, Trash2, Trophy } from 'lucide-react';
import type { Exercise } from '../../domain/types';
import { BarChart, LineChart } from '../../components/Charts';
import { ConfirmSheet, Empty, Field, InfoButton, OverflowMenu, Segmented, Sheet, TopBar, toast } from '../../components/ui';
import { useDB } from '../../data/store';
import { body, exerciseName, exercises } from '../../data/repositories';
import { openTool } from '../../adapters/engine';
import { exerciseStats, metricLabels, setMetrics, type Metric } from '../../domain/records';
import {
  BODY_FIELDS, BODY_LIMITS, bodySeries, buckets, checkinNumber, localISO, RANGES, rangeStart, recoveryCheckins, summary, workoutsInRange,
  type BodyField, type RangeDays, type StatMetric,
} from '../../domain/progressStats';
import { fmtInt, fmtNum, kgTo, mss, parseDecimal, todayISO, toKg } from '../../lib/format';
import { navigate } from '../../lib/router';
import { ExerciseThumb } from '../training/ExercisePicker';
import { ExercisePage } from '../training/ExercisePage';
import { Dumbbell } from 'lucide-react';

type Tab = 'summary' | 'exercises' | 'body';
const day = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function ProgressHome({ tab = 'summary' }: { tab?: Tab }) {
  const [range, setRange] = useState<RangeDays>(90);
  const from = rangeStart(range);
  return (
    <>
      <TopBar title="Progress" actions={<button className="icon-btn" aria-label="Import workouts" title="Import workouts" onClick={() => openTool('import')}><Library /></button>} />
      <div className="screen progress-home">
        <Segmented label="Progress view" value={tab} onChange={(v) => navigate(v === 'summary' ? '/progress' : `/progress/${v}`, { replace: true })}
          options={[{ value: 'summary', label: 'Summary' }, { value: 'exercises', label: 'Exercises' }, { value: 'body', label: 'Body' }]} />
        <div className="progress-range" role="group" aria-label="Time range">
          {RANGES.map((r) => <button key={r.days} type="button" aria-pressed={range === r.days} onClick={() => setRange(r.days)}>{r.label}</button>)}
        </div>
        {tab === 'summary' && <Summary from={from} />}
        {tab === 'exercises' && <Exercises from={from} />}
        {tab === 'body' && <Body from={from} />}
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
      <section className="card progress-card" aria-label="Muscles">
        <span className="eyebrow">Muscles</span>
        {([['chart', 'Balance'], ['body', 'Body map'], ['sets', 'Trends']] as const).map(([view, label]) => (
          <button key={view} className="progress-link" onClick={() => navigate(`/progress/muscles/${view}`)}><span>{label}</span><ChevronRight aria-hidden="true" /></button>
        ))}
      </section>
    </>
  );
}

function Calendar() {
  const all = useDB((d) => d.workouts), unit = useDB((d) => d.settings.weightUnit);
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [chosen, setChosen] = useState(today);
  const byDay = useMemo(() => { const m = new Map<string, typeof all>(); for (const w of all) { const k = localISO(w.startedAt); m.set(k, [...(m.get(k) ?? []), w]); } return m; }, [all]);
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), offset = (first.getDay() + 6) % 7, days = new Date(y, mo, 0).getDate();
  const shift = (n: number) => { const d = new Date(y, mo - 1 + n, 1); const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; setMonth(m); setChosen(m === today.slice(0, 7) ? today : `${m}-01`); };
  const picked = byDay.get(chosen) ?? [];
  return (
    <section className="card progress-card" aria-label="Workout calendar">
      <div className="progress-cal-head">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></button>
        <strong>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button className="icon-btn" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => shift(1)}><ChevronRight /></button>
      </div>
      <div className="progress-cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="dow">{d}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={'e' + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, '0')}`, trained = byDay.has(iso);
          return <button key={iso} className={trained ? 'trained' : ''} aria-pressed={iso === chosen} disabled={iso > today} aria-label={`${day(iso)}${trained ? ' · workout' : ''}`} onClick={() => setChosen(iso)}>{i + 1}</button>;
        })}
      </div>
      <div className="progress-day">
        {picked.length ? picked.map((w) => (
          <button key={w.id} className="progress-link" onClick={() => navigate(`/training/history/${w.id}`)}>
            <span className="grow"><span className="name">{w.title}</span><span className="sub tnum">{Math.round((w.endedAt - w.startedAt) / 60000)} min · {w.exercises.reduce((n, b) => n + b.sets.filter((s) => s.done).length, 0)} sets</span></span>
            <ChevronRight aria-hidden="true" />
          </button>
        )) : <span className="small muted">{day(chosen)} · no workout</span>}
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
function Body({ from }: { from: string | null }) {
  const weights = useDB((d) => d.weights), checkins = useDB((d) => d.checkins), unit = useDB((d) => d.settings.weightUnit), profile = useDB((d) => d.profile);
  const [field, setField] = useState<BodyField>('weight');
  const [adding, setAdding] = useState(false);
  const [checkin, setCheckin] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);
  const [removingCheckin, setRemovingCheckin] = useState<string | null>(null);
  const [allRows, setAllRows] = useState(false);
  const series = bodySeries(weights, checkins, field, from);
  const u = field === 'weight' ? unit : 'cm';
  const show = (v: number) => (field === 'weight' ? kgTo(v, unit) : v);
  const latest = series.at(-1), change = series.length > 1 ? show(series.at(-1)!.value) - show(series[0].value) : null;
  const label = BODY_FIELDS.find((f) => f.key === field)!.label;
  const recovery = recoveryCheckins(checkins, from).slice(0, 7);
  return (
    <>
      <div className="progress-chips" role="group" aria-label="Measurement">
        {BODY_FIELDS.map((f) => <button key={f.key} type="button" className="chip" aria-pressed={f.key === field} onClick={() => setField(f.key)}>{f.label}</button>)}
      </div>
      <section className="card progress-card" aria-label={label}>
        <div className="progress-card-head">
          <span className="progress-big tnum">{latest ? fmtNum(show(latest.value), 1) : '—'}<small> {u}</small></span>
          <button className="btn btn-primary btn-sm progress-add" onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add</button>
        </div>
        <div className="progress-sub tnum">
          {change !== null && <span className={change === 0 ? '' : 'strong'}>{change > 0 ? '+' : ''}{fmtNum(change, 1)} {u} in this range</span>}
          {field === 'weight' && profile?.targetWeightKg ? <span>Goal {fmtNum(kgTo(profile.targetWeightKg, unit), 1)} {unit}</span> : null}
        </div>
        {series.length >= 2 && <LineChart label={label} points={series.map((r) => ({ x: new Date(r.date + 'T12:00:00').getTime(), y: show(r.value) }))} unit={u} height={150} format={(v) => fmtNum(v, 1)} />}
        <div className="progress-history">
          {[...series].reverse().slice(0, allRows ? undefined : 8).map((r) => (
            <div key={r.id + field} className="progress-history-row">
              <span>{day(r.date)}</span><strong className="tnum">{fmtNum(show(r.value), 1)} {u}</strong>
              <button className="icon-btn" aria-label={`Remove ${label.toLowerCase()} from ${day(r.date)}`} onClick={() => setRemoving({ id: r.id, label: `${fmtNum(show(r.value), 1)} ${u} · ${day(r.date)}` })}><Trash2 /></button>
            </div>
          ))}
          {!series.length && <p className="small muted">No {label.toLowerCase()} entries in this range</p>}
          {series.length > 8 && !allRows && <button className="btn btn-link progress-more" onClick={() => setAllRows(true)}>Show all {series.length}</button>}
        </div>
      </section>
      <section className="card progress-card" aria-label="Recovery">
        <div className="progress-card-head"><span className="eyebrow">Recovery</span><button className="btn btn-soft btn-sm progress-add" onClick={() => setCheckin(true)}><Plus aria-hidden="true" />Check in</button></div>
        {recovery.length ? recovery.map((c) => {
          const parts = [checkinNumber(c.sleep) !== null && `Sleep ${fmtNum(checkinNumber(c.sleep)!, 1)} h`, checkinNumber(c.energy) !== null && `Energy ${checkinNumber(c.energy)}/5`, checkinNumber(c.soreness) !== null && `Soreness ${checkinNumber(c.soreness)}/5`, checkinNumber(c.steps) !== null && `${fmtInt(checkinNumber(c.steps)!)} steps`].filter(Boolean);
          return (
            <div key={c.id} className="progress-checkin">
              <span className="grow"><span className="name">{day(c.date)}</span><span className="sub tnum">{parts.join(' · ') || '—'}</span>{c.note?.trim() && <span className="note">{c.note}</span>}</span>
              <OverflowMenu small title="Check-in" actions={[{ label: 'Delete check-in', icon: Trash2, danger: true, onSelect: () => setRemovingCheckin(c.id) }]} />
            </div>
          );
        }) : <p className="small muted">No check-ins in this range</p>}
      </section>
      <MeasureSheet open={adding} onClose={() => setAdding(false)} field={field} label={label} unit={u} />
      <CheckInSheet open={checkin} onClose={() => setCheckin(false)} />
      <ConfirmSheet open={!!removing} onClose={() => setRemoving(null)} danger title={`Remove this ${label.toLowerCase()} entry?`} body={removing?.label} confirmLabel="Remove"
        onConfirm={() => { if (!removing) return; if (field === 'weight') body.deleteWeight(removing.id); else body.removeMeasurement(removing.id, field); toast('Entry removed'); }} />
      <ConfirmSheet open={!!removingCheckin} onClose={() => setRemovingCheckin(null)} danger title="Delete this check-in?" confirmLabel="Delete"
        onConfirm={() => { if (removingCheckin) { body.deleteCheckIn(removingCheckin); toast('Check-in deleted'); } }} />
    </>
  );
}

function MeasureSheet({ open, onClose, field, label, unit }: { open: boolean; onClose: () => void; field: BodyField; label: string; unit: string }) {
  const [v, setV] = useState(''), [date, setDate] = useState(todayISO()), [tried, setTried] = useState(false);
  const n = parseDecimal(v);
  const asStored = n === null ? null : field === 'weight' ? toKg(n, unit as 'kg' | 'lb') : n;
  const [lo, hi] = BODY_LIMITS[field];
  const err = asStored === null ? `Enter your ${label.toLowerCase()}.` : asStored < lo || asStored > hi ? 'That value looks wrong.' : null;
  const dateErr = !date ? 'Choose a date.' : date > todayISO() ? 'The date can’t be in the future.' : null;
  const save = () => {
    setTried(true);
    if (err || dateErr || asStored === null) return;
    if (field === 'weight') body.logWeight(date, Math.round(asStored * 10) / 10);
    else body.addMeasurement(date, field, Math.round(asStored * 10) / 10);
    toast(`${label} saved`); setV(''); setTried(false); onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Add ${label.toLowerCase()}`} footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="grid-2">
        <Field label={`${label} (${unit})`} htmlFor="pm-v" error={tried ? err : null}><input id="pm-v" className="input tnum" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} data-autofocus aria-invalid={tried && !!err} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
        <Field label="Date" htmlFor="pm-d" error={tried ? dateErr : null}><input id="pm-d" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

function CheckInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sleep, setSleep] = useState(''), [energy, setEnergy] = useState<number | null>(null), [soreness, setSoreness] = useState<number | null>(null), [note, setNote] = useState(''), [date, setDate] = useState(todayISO()), [tried, setTried] = useState(false);
  const hours = sleep.trim() ? parseDecimal(sleep) : null;
  const err = sleep.trim() && (hours === null || hours < 0 || hours > 24) ? 'Enter hours between 0 and 24.' : null;
  const empty = !sleep.trim() && energy === null && soreness === null && !note.trim();
  const save = () => {
    setTried(true);
    if (err || empty) return;
    body.saveCheckIn({ date, sleep: hours, energy, soreness, note: note.trim() });
    toast('Check-in saved'); setSleep(''); setEnergy(null); setSoreness(null); setNote(''); setTried(false); onClose();
  };
  const scale = (label: string, value: number | null, set: (n: number | null) => void) => (
    <div className="field"><span className="label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-pressed={value === n} onClick={() => set(value === n ? null : n)}>{n}</button>)}</div>
    </div>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Check in" footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="stack">
        <div className="grid-2">
          <Field label="Sleep (hours)" htmlFor="ci-sleep" error={tried ? err : null}><input id="ci-sleep" className="input tnum" inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="7.5" /></Field>
          <Field label="Date" htmlFor="ci-date"><input id="ci-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        {scale('Energy', energy, setEnergy)}
        {scale('Soreness', soreness, setSoreness)}
        <Field label="Note" htmlFor="ci-note"><textarea id="ci-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {tried && empty && <p className="err" role="alert">Add at least one value or a note.</p>}
      </div>
    </Sheet>
  );
}
