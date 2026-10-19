import { useMemo, useState } from 'react';
import { Activity, BarChart3, ChevronRight, ClipboardList, HeartPulse, Plus, Scale, Sparkles, Trash2 } from 'lucide-react';
import type { Workout } from '../../domain/types';
import { e1rm, setLabels, trackingFields, workingVolume } from '../../domain/training';
import { ConfirmSheet, Empty, Field, OverflowMenu, Segmented, SelectField, Sheet, TopBar, toast } from '../../components/ui';
import { BarChart, LineChart } from '../../components/Charts';
import { useDB } from '../../data/store';
import { body, exerciseName, workouts as workoutRepo } from '../../data/repositories';
import { addDays, duration, fmtNum, fmtVolume, kgTo, longDate, mss, parseDecimal, round1, shortDate, todayISO, toISODate, toKg, fmtInt, fromISODate } from '../../lib/format';
import { navigate } from '../../lib/router';

type Tab = 'history' | 'exercises' | 'volume' | 'body';
type Range = '4w' | '12w' | '6m' | 'all';
const RANGE_DAYS: Record<Range, number | null> = { '4w': 28, '12w': 84, '6m': 182, all: null };

export function ProgressScreen() {
  const [tab, setTab] = useState<Tab>('history');
  const [range, setRange] = useState<Range>('12w');
  const all = useDB((d) => d.workouts);
  const from = RANGE_DAYS[range] === null ? null : addDays(todayISO(), -RANGE_DAYS[range]!);
  const inRange = useMemo(
    () => all.filter((w) => !from || toISODate(new Date(w.startedAt)) >= from).sort((a, b) => b.startedAt - a.startedAt),
    [all, from],
  );

  return (
    <>
      <TopBar title="Progress" actions={<button className="icon-btn" aria-label="Open coach" onClick={() => navigate('/coach')}><Sparkles /></button>} />
      <div className="screen stack">
        <Segmented label="Progress view" value={tab} onChange={setTab} options={[
          { value: 'history', label: 'History' },
          { value: 'exercises', label: 'Exercises' },
          { value: 'volume', label: 'Volume' },
          { value: 'body', label: 'Body' },
        ]} />
        <div className="chips" role="group" aria-label="Date range">
          {(['4w', '12w', '6m', 'all'] as Range[]).map((r) => (
            <button key={r} className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r === 'all' ? 'All time' : r.toUpperCase().replace('W', ' wk').replace('M', ' mo')}
            </button>
          ))}
        </div>
        {tab === 'history' && <History list={inRange} />}
        {tab === 'exercises' && <Exercises list={inRange} />}
        {tab === 'volume' && <Volume list={inRange} range={range} />}
        {tab === 'body' && <Body from={from} />}
      </div>
    </>
  );
}

function History({ list }: { list: Workout[] }) {
  const unit = useDB((d) => d.settings.weightUnit);
  if (!list.length) return <Empty icon={ClipboardList} title="No workouts in this range">Finished workouts appear here.</Empty>;
  const groups = new Map<string, Workout[]>();
  list.forEach((w) => {
    const k = new Date(w.startedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    groups.set(k, [...(groups.get(k) ?? []), w]);
  });
  return (
    <>
      {[...groups].map(([month, ws]) => (
        <section key={month}>
          <div className="label" style={{ margin: '4px 0 6px' }}>{month} · {ws.length} {ws.length === 1 ? 'workout' : 'workouts'}</div>
          <div className="list">
            {ws.map((w) => (
              <button key={w.id} className="list-row" onClick={() => navigate(`/progress/session/${w.id}`)}>
                <div className="grow">
                  <div className="row-title ellipsis">{w.title}</div>
                  <div className="row-sub ellipsis">{shortDate(w.startedAt)} · {duration((w.endedAt - w.startedAt) / 1000)} · {fmtVolume(workingVolume(w.exercises), unit)} · {w.exercises.length} ex</div>
                </div>
                <ChevronRight className="chev" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

type Metric = 'e1rm' | 'top' | 'reps' | 'volume';
function Exercises({ list }: { list: Workout[] }) {
  const unit = useDB((d) => d.settings.weightUnit);
  const exIds = useMemo(() => {
    const count = new Map<string, number>();
    list.forEach((w) => w.exercises.forEach((b) => count.set(b.exerciseId, (count.get(b.exerciseId) ?? 0) + 1)));
    return [...count].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [list]);
  const [exId, setExId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('e1rm');
  const id = exId && exIds.includes(exId) ? exId : exIds[0] ?? null;

  const rows = useMemo(() => {
    if (!id) return [];
    return [...list]
      .reverse()
      .map((w) => {
        const b = w.exercises.find((x) => x.exerciseId === id);
        if (!b) return null;
        const work = b.sets.filter((s) => s.type !== 'warmup' && s.done);
        const best = work.reduce((m, s) => Math.max(m, s.weightKg && s.reps ? e1rm(s.weightKg, s.reps) : 0), 0);
        const top = work.reduce((m, s) => Math.max(m, s.weightKg ?? 0), 0);
        const reps = work.reduce((m, s) => m + (s.reps ?? 0), 0);
        const time = work.reduce((m, s) => m + (s.timeSec ?? 0), 0);
        return { w, best, top, reps, time, volume: workingVolume([b]), sets: work.length };
      })
      .filter((r): r is NonNullable<typeof r> => !!r);
  }, [list, id]);

  if (!exIds.length) return <Empty icon={Activity} title="No exercise data in this range">Log workouts to see performance over time.</Empty>;
  const timeBased = rows.every((r) => r.best === 0 && r.reps === 0);
  const m: Metric = timeBased ? 'reps' : metric;
  const val = (r: (typeof rows)[number]) =>
    timeBased ? r.time : m === 'e1rm' ? kgTo(r.best, unit) : m === 'top' ? kgTo(r.top, unit) : m === 'reps' ? r.reps : kgTo(r.volume, unit);
  const chartUnit = timeBased ? 's' : m === 'reps' ? 'reps' : unit;

  return (
    <div className="stack">
      <SelectField label="Exercise" value={id} options={exIds.map((x) => ({ value: x, label: exerciseName(x) }))} onChange={setExId} />
      {!timeBased && (
        <Segmented label="Metric" value={metric} onChange={setMetric} options={[
          { value: 'e1rm', label: 'Est. 1RM' }, { value: 'top', label: 'Top set' }, { value: 'volume', label: 'Volume' }, { value: 'reps', label: 'Reps' },
        ]} />
      )}
      <div className="card card-pad">
        {rows.length >= 2 ? (
          <LineChart label={`${exerciseName(id!)} ${m}`} points={rows.map((r) => ({ x: r.w.startedAt, y: val(r) }))} unit={chartUnit} format={(v) => (timeBased ? mss(v) : fmtNum(v, m === 'reps' || m === 'volume' ? 0 : 1))} />
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Log this exercise in at least two sessions to see a trend.</p>
        )}
        {!timeBased && m === 'e1rm' && <p className="xs muted" style={{ margin: '6px 0 0' }}>Estimated one-rep max (Epley) from working sets.</p>}
      </div>
      <div className="list">
        {[...rows].reverse().slice(0, 8).map((r) => (
          <button key={r.w.id} className="list-row" onClick={() => navigate(`/progress/session/${r.w.id}`)}>
            <div className="grow">
              <div className="row-title">{shortDate(r.w.startedAt)}</div>
              <div className="row-sub">{r.sets} working sets{timeBased ? ` · ${mss(r.time)}` : ` · top ${fmtNum(kgTo(r.top, unit), 2)} ${unit} · ${r.reps} reps`}</div>
            </div>
            <ChevronRight className="chev" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Volume({ list, range }: { list: Workout[]; range: Range }) {
  const unit = useDB((d) => d.settings.weightUnit);
  const weeks = useMemo(() => {
    const n = range === '4w' ? 4 : range === '12w' ? 12 : range === '6m' ? 26 : Math.max(4, Math.ceil((Date.now() - Math.min(...list.map((w) => w.startedAt), Date.now())) / (7 * 86400000)));
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return Array.from({ length: n }, (_, i) => {
      const start = new Date(monday);
      start.setDate(start.getDate() - (n - 1 - i) * 7);
      const end = start.getTime() + 7 * 86400000;
      const ws = list.filter((w) => w.startedAt >= start.getTime() && w.startedAt < end);
      return { label: shortDate(start.getTime()), value: kgTo(ws.reduce((v, w) => v + workingVolume(w.exercises), 0), unit), sessions: ws.length };
    });
  }, [list, range, unit]);
  const total = weeks.reduce((v, w) => v + w.value, 0);
  if (!list.length) return <Empty icon={BarChart3} title="No volume in this range">Volume counts completed working sets (weight × reps).</Empty>;
  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="stat-grid">
          <div className="stat"><div className="k">Total</div><div className="v">{fmtInt(total)}<span className="small muted"> {unit}</span></div></div>
          <div className="stat"><div className="k">Weekly avg</div><div className="v">{fmtInt(total / weeks.length)}</div></div>
          <div className="stat"><div className="k">Sessions</div><div className="v">{list.length}</div></div>
        </div>
      </div>
      <div className="card card-pad">
        <BarChart label="Weekly working-set volume" bars={weeks} unit={unit} />
        <p className="xs muted" style={{ margin: '6px 0 0' }}>Weekly working-set volume (weight × reps). Warm-ups excluded.</p>
      </div>
    </div>
  );
}

function Body({ from }: { from: string | null }) {
  const weights = useDB((d) => d.weights);
  const checkins = useDB((d) => d.checkins);
  const unit = useDB((d) => d.settings.weightUnit);
  const [weighOpen, setWeighOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [delCheck, setDelCheck] = useState<string | null>(null);
  const ws = weights.filter((w) => !from || w.date >= from);
  const cs = checkins.filter((c) => !from || c.date >= from).slice().reverse();

  return (
    <div className="stack">
      <div className="section-title" style={{ margin: 0 }}>
        <h2>Weight</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => setWeighOpen(true)}><Plus /> Log weight</button>
      </div>
      {ws.length >= 2 ? (
        <div className="card card-pad">
          <LineChart label="Body weight" points={ws.map((w) => ({ x: fromISODate(w.date).getTime(), y: kgTo(w.kg, unit) }))} unit={unit} />
        </div>
      ) : (
        <Empty icon={Scale} title={ws.length ? 'One entry so far' : 'No weight entries'}>Log your weight to see a trend.</Empty>
      )}
      {ws.length > 0 && (
        <div className="list">
          {[...ws].reverse().slice(0, 5).map((w) => (
            <div key={w.id} className="list-row">
              <div className="grow"><div className="row-title tnum">{fmtNum(kgTo(w.kg, unit), 1)} {unit}</div><div className="row-sub">{longDate(fromISODate(w.date).getTime())}</div></div>
              <OverflowMenu small title="Weight entry" actions={[{ label: 'Delete entry', icon: Trash2, danger: true, onSelect: () => (body.deleteWeight(w.id), toast('Entry deleted')) }]} />
            </div>
          ))}
        </div>
      )}

      <div className="section-title" style={{ margin: '8px 0 0' }}>
        <h2>Recovery check-ins</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => setCheckOpen(true)}><Plus /> Check in</button>
      </div>
      {cs.length === 0 ? (
        <Empty icon={HeartPulse} title="No check-ins">Rate sleep, energy, soreness and stress to spot patterns.</Empty>
      ) : (
        <div className="list">
          {cs.slice(0, 10).map((c) => (
            <div key={c.id} className="list-row">
              <div className="grow">
                <div className="row-title">{longDate(fromISODate(c.date).getTime())}</div>
                <div className="row-sub tnum">Sleep {c.sleep}/5 · Energy {c.energy}/5 · Soreness {c.soreness}/5 · Stress {c.stress}/5</div>
                {c.note && <div className="small" style={{ color: 'var(--ink-2)' }}>{c.note}</div>}
              </div>
              <OverflowMenu small title="Check-in" actions={[{ label: 'Delete check-in', icon: Trash2, danger: true, onSelect: () => setDelCheck(c.id) }]} />
            </div>
          ))}
        </div>
      )}
      <WeighSheet open={weighOpen} onClose={() => setWeighOpen(false)} unit={unit} />
      <CheckInSheet open={checkOpen} onClose={() => setCheckOpen(false)} />
      <ConfirmSheet open={!!delCheck} onClose={() => setDelCheck(null)} title="Delete check-in?" confirmLabel="Delete" danger onConfirm={() => delCheck && (body.deleteCheckIn(delCheck), toast('Check-in deleted'))} />
    </div>
  );
}

function WeighSheet({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: 'kg' | 'lb' }) {
  const [v, setV] = useState('');
  const [date, setDate] = useState(todayISO());
  const [tried, setTried] = useState(false);
  const n = parseDecimal(v);
  const err = n === null ? 'Enter your weight.' : toKg(n, unit) < 30 || toKg(n, unit) > 300 ? 'Enter a realistic weight.' : null;
  const dateErr = !date ? 'Choose a date.' : date > todayISO() ? 'Date can’t be in the future.' : null;
  return (
    <Sheet open={open} onClose={onClose} title="Log weight" footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => {
          setTried(true);
          if (err || dateErr || n === null) return;
          body.logWeight(date, round1(toKg(n, unit) * 10) / 10);
          toast('Weight logged');
          setV('');
          setTried(false);
          onClose();
        }}>Save</button>
      </>
    }>
      <div className="grid-2">
        <Field label={`Weight (${unit})`} htmlFor="wt-v" error={tried ? err : null}>
          <input id="wt-v" className="input tnum" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} data-autofocus aria-invalid={tried && !!err} />
        </Field>
        <Field label="Date" htmlFor="wt-d" error={tried ? dateErr : null}>
          <input id="wt-d" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

function CheckInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [vals, setVals] = useState({ sleep: 3, energy: 3, soreness: 2, stress: 2 });
  const [note, setNote] = useState('');
  const labels: Record<keyof typeof vals, [string, string]> = {
    sleep: ['Sleep quality', 'Poor → great'],
    energy: ['Energy', 'Low → high'],
    soreness: ['Soreness', 'None → very sore'],
    stress: ['Stress', 'Low → high'],
  };
  return (
    <Sheet open={open} onClose={onClose} title="Today’s check-in" footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => {
          body.saveCheckIn({ date: todayISO(), ...vals, note: note.trim() });
          toast('Check-in saved');
          setNote('');
          onClose();
        }}>Save</button>
      </>
    }>
      <div className="stack">
        {(Object.keys(vals) as (keyof typeof vals)[]).map((k) => (
          <div key={k} className="field">
            <div className="row-between"><span className="label">{labels[k][0]}</span><span className="xs muted">{labels[k][1]}</span></div>
            <div className="segmented" role="radiogroup" aria-label={labels[k][0]}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} role="radio" aria-checked={vals[k] === n} aria-pressed={vals[k] === n} onClick={() => setVals({ ...vals, [k]: n })}>{n}</button>
              ))}
            </div>
          </div>
        ))}
        <Field label="Note" htmlFor="ci-note" hint="Optional">
          <textarea id="ci-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

export function SessionDetail({ id }: { id: string }) {
  const w = useDB((d) => d.workouts.find((x) => x.id === id));
  const unit = useDB((d) => d.settings.weightUnit);
  const [del, setDel] = useState(false);
  if (!w) {
    return (
      <>
        <TopBar title="Workout" back="/progress" />
        <div className="screen"><Empty icon={ClipboardList} title="Workout not found">It may have been deleted.</Empty></div>
      </>
    );
  }
  const sets = w.exercises.reduce((n, b) => n + b.sets.length, 0);
  return (
    <>
      <TopBar title={w.title} back="/progress" bordered actions={
        <OverflowMenu title={w.title} actions={[{ label: 'Delete workout', icon: Trash2, danger: true, onSelect: () => setDel(true) }]} />
      } />
      <div className="screen">
        <p className="small muted" style={{ margin: '10px 0 6px' }}>{longDate(w.startedAt)}</p>
        <div className="wo-summary">
          <div><div className="k">Duration</div><div className="v">{duration((w.endedAt - w.startedAt) / 1000)}</div></div>
          <div><div className="k">Volume</div><div className="v">{fmtVolume(workingVolume(w.exercises), unit)}</div></div>
          <div><div className="k">Sets</div><div className="v">{sets}</div></div>
        </div>
        {w.exercises.map((b) => {
          const labels = setLabels(b.sets);
          return (
            <section key={b.id} className="ex-block" aria-label={exerciseName(b.exerciseId)}>
              <div className="strong" style={{ color: 'var(--accent)', marginBottom: 4 }}>{exerciseName(b.exerciseId)}</div>
              {b.note && <p className="small muted" style={{ margin: '0 0 4px' }}>{b.note}</p>}
              {b.sets.map((s, i) => (
                <div key={s.id} className="row tnum" style={{ minHeight: 28, fontSize: 14 }}>
                  <span className={`set-label ${s.type}`} style={{ width: 28, height: 24 }}>{labels[i]}</span>
                  <span>
                    {trackingFields(b.tracking)
                      .map((f) => {
                        const v = s[f];
                        if (v == null) return null;
                        if (f === 'weightKg') return `${fmtNum(kgTo(v, unit), 2)} ${unit}`;
                        if (f === 'reps') return `${v} reps`;
                        if (f === 'timeSec') return mss(v);
                        return `${fmtNum(v, 2)} km`;
                      })
                      .filter(Boolean)
                      .join(b.tracking === 'weight_reps' ? ' × ' : ' · ')}
                    {s.rpe !== null && <span className="muted"> @ RPE {s.rpe}</span>}
                  </span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <ConfirmSheet open={del} onClose={() => setDel(false)} title="Delete this workout?" body="It will be removed from your history and progress charts." confirmLabel="Delete" danger onConfirm={() => {
        workoutRepo.deleteWorkout(w.id);
        toast('Workout deleted');
        navigate('/progress', { replace: true });
      }} />
    </>
  );
}
