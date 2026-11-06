import { useMemo } from 'react';
import { ChevronRight, Droplet, Dumbbell, Minus, Play, Plus, Scale, Sparkles } from 'lucide-react';
import { AiBadge, Bar, TopBar } from '../../components/ui';
import { DateStrip } from '../../components/DateStrip';
import { useDB } from '../../data/store';
import { useDay, useSelectedDate, useTargets } from '../../data/selectors';
import { diary } from '../../data/repositories';
import { addDays, duration, energyValue, fmtInt, fmtNum, fmtVolume, kgTo, todayISO, toISODate } from '../../lib/format';
import { workingVolume } from '../../domain/training';
import { navigate } from '../../lib/router';

function Ring({ value, max }: { value: number; max: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max && max > 0;
  return (
    <svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true">
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--line-2)" strokeWidth="10" />
      {pct > 0 && <circle
        cx="56" cy="56" r={r} fill="none" stroke={over ? 'var(--warn)' : 'var(--accent)'} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 56 56)"
      />}
    </svg>
  );
}

export function TodayScreen() {
  const date = useSelectedDate();
  const targets = useTargets();
  const { total, entries, fibre } = useDay(date);
  const water = useDB((d) => d.water[date] ?? 0);
  const active = useDB((d) => d.active);
  const allWorkouts = useDB((d) => d.workouts);
  const weights = useDB((d) => d.weights);
  const profile = useDB((d) => d.profile);
  const s = useDB((d) => d.settings);
  const t = targets?.targets;
  const isToday = date === todayISO();
  const eU = s.energyUnit;

  const dayWorkouts = useMemo(() => allWorkouts.filter((w) => toISODate(new Date(w.startedAt)) === date), [allWorkouts, date]);
  const weekCount = useMemo(() => {
    const from = addDays(date, -6);
    return allWorkouts.filter((w) => {
      const d = toISODate(new Date(w.startedAt));
      return d >= from && d <= date;
    }).length;
  }, [allWorkouts, date]);
  const weight = useMemo(() => {
    const upto = weights.filter((w) => w.date <= date);
    const last = upto[upto.length - 1];
    const ref = upto.filter((w) => w.date <= addDays(date, -28)).pop();
    return { last, change: last && ref ? last.kg - ref.kg : null };
  }, [weights, date]);

  const remaining = t ? t.kcal - total.kcal : 0;

  return (
    <>
      <TopBar title={profile ? `Hi, ${profile.name}` : 'Overview'} />
      <div className="screen stack">
        <DateStrip date={date} />

        {t && (
          <section className="card card-pad" aria-label="Calories and macros">
            <div className="kcal-card">
              <div style={{ position: 'relative', width: 112, height: 112 }}>
                <Ring value={total.kcal} max={t.kcal} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="ring-val">{fmtInt(energyValue(Math.abs(remaining), eU))}</span>
                  <span className="ring-label">{remaining >= 0 ? `${eU} left` : `${eU} over`}</span>
                </div>
              </div>
              <div className="stack-sm">
                <div className="row-between"><span className="muted small">Eaten</span><span className="strong tnum">{fmtInt(energyValue(total.kcal, eU))} {eU}</span></div>
                <div className="row-between"><span className="muted small">Target</span><span className="strong tnum">{fmtInt(energyValue(t.kcal, eU))} {eU}</span></div>
                <div className="row-between"><span className="muted small">Entries</span><span className="strong tnum">{entries.length}</span></div>
              </div>
            </div>
            <div className="grid-3" style={{ marginTop: 14 }}>
              {([
                ['Protein', total.protein, t.protein],
                ['Carbs', total.carbs, t.carbs],
                ['Fat', total.fat, t.fat],
              ] as const).map(([n, v, m]) => (
                <div key={n} className="macro">
                  <span className="n">{n}</span>
                  <span className="v">{Math.round(v)}/{m} g</span>
                  <Bar value={v} max={m} label={`${n} ${Math.round(v)} of ${m} grams`} />
                </div>
              ))}
            </div>
            <div className="row-between" style={{marginTop:12}}><span className="muted small">Fibre</span><span className="strong tnum">{fibre.grams === null ? '— · missing food data' : `${Number(fibre.grams.toFixed(1))} g${fibre.missing ? ' · incomplete' : ''}`} </span></div>
            <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => navigate('/food')}>
              Open food diary <ChevronRight />
            </button>
          </section>
        )}

        <section className="card card-pad" aria-label="Water">
          <div className="row-between">
            <div className="row"><Droplet size={18} color="var(--water)" /><span className="strong">Water</span></div>
            <span className="tnum small"><span className="strong">{fmtInt(water)}</span> / {fmtInt(t?.waterMl ?? 2500)} ml</span>
          </div>
          <div className="row-between" style={{ marginTop: 8 }}>
            <div className="water-dots" aria-hidden="true">
              {Array.from({ length: Math.ceil((t?.waterMl ?? 2500) / 250) }, (_, i) => <span key={i} className={i < water / 250 ? 'on' : ''} />)}
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className="icon-btn" style={{ border: '1px solid var(--line)' }} aria-label="Remove 250 ml" disabled={water === 0} onClick={() => diary.setWater(date, water - 250)}><Minus /></button>
              <button className="icon-btn" style={{ border: '1px solid var(--line)' }} aria-label="Add 250 ml" onClick={() => diary.setWater(date, water + 250)}><Plus /></button>
            </div>
          </div>
        </section>

        <section className="card card-pad" aria-label="Workout">
          <div className="row-between">
            <div className="row"><Dumbbell size={18} /><span className="strong">Workout</span></div>
            <span className="small muted tnum">{weekCount}/{profile?.trainingDaysPerWeek ?? 3} in last 7 days</span>
          </div>
          {active && isToday ? (
            <button className="btn btn-dark btn-block" style={{ marginTop: 10 }} onClick={() => navigate('/workout')}>
              <Play /> <span className="ellipsis">Resume “{active.title}”</span>
            </button>
          ) : dayWorkouts.length > 0 ? (
            <div className="stack-sm" style={{ marginTop: 8 }}>
              {dayWorkouts.map((w) => (
                <button key={w.id} className="list-row" style={{ padding: '6px 0', minHeight: 44 }} onClick={() => navigate(`/progress/session/${w.id}`)}>
                  <div className="grow">
                    <div className="row-title ellipsis">{w.title}</div>
                    <div className="row-sub">{duration((w.endedAt - w.startedAt) / 1000)} · {fmtVolume(workingVolume(w.exercises), s.weightUnit)}<AiBadge addedBy={w.addedBy} /></div>
                  </div>
                  <ChevronRight className="chev" />
                </button>
              ))}
            </div>
          ) : isToday ? (
            <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => navigate('/training')}>
              <Play /> Start a workout
            </button>
          ) : (
            <p className="small muted" style={{ margin: '8px 0 0' }}>No workout logged.</p>
          )}
        </section>

        <section className="card card-pad" aria-label="Progress">
          <div className="row-between">
            <div className="row"><Scale size={18} /><span className="strong">Progress</span></div>
            <button className="btn btn-link" onClick={() => navigate('/progress')}>View</button>
          </div>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <div className="stat"><div className="k">Weight</div><div className="v">{weight.last ? fmtNum(kgTo(weight.last.kg, s.weightUnit), 1) : '—'}<span className="small muted"> {s.weightUnit}</span></div></div>
            <div className="stat"><div className="k">4-week change</div><div className="v">{weight.change === null ? '—' : `${weight.change > 0 ? '+' : ''}${fmtNum(kgTo(weight.change, s.weightUnit), 1)}`}<span className="small muted"> {s.weightUnit}</span></div></div>
            <div className="stat"><div className="k">Target</div><div className="v">{profile ? fmtNum(kgTo(profile.targetWeightKg, s.weightUnit), 1) : '—'}<span className="small muted"> {s.weightUnit}</span></div></div>
          </div>
        </section>

        <section className="card card-pad" aria-label="Coach">
          <div className="row-between">
            <div className="row"><Sparkles size={18} /><span className="strong">Coach</span><span className="badge">Preview</span></div>
          </div>
          <p className="small" style={{ margin: '8px 0 10px', color: 'var(--ink-2)' }}>
            {t && total.protein < t.protein * 0.6
              ? `Protein is at ${Math.round(total.protein)} g of ${t.protein} g. A protein-rich dinner would close the gap.`
              : 'Your coach will summarise training, food and recovery here once it’s connected.'}
          </p>
          <button className="btn btn-secondary btn-sm btn-block" onClick={() => navigate('/coach')}>Ask the coach</button>
        </section>
      </div>
    </>
  );
}
