import { SwipeRow } from '../../components/SwipeRow';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUp, Bot, ChevronRight, Droplets, Minus, Play, Plus, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react';
import { MFD_AI } from '../../components/AiHub';
import { geminiKey } from '../../lib/gemini';
import { AiBadge, ConfirmSheet, Empty, InfoButton, TopBar, toast } from '../../components/ui';
import { DateStrip } from '../../components/DateStrip';
import { useDB } from '../../data/store';
import { entryNutrients, useDay, useSelectedDate, useTargets } from '../../data/selectors';
import { diary, workouts as workoutRepo } from '../../data/repositories';
import { aiAgo } from '../../domain/aiActivity';
import { aiSummary, hideAiActivity, openAiHub, useAiActivity } from '../../lib/aiRecent';
import { addDays, duration, energyValue, fmtEnergy, fmtInt, fmtNum, fmtVolume, kgTo, todayISO, toISODate } from '../../lib/format';
import { workingVolume } from '../../domain/training';
import { fibreTarget } from '../../domain/nutrition';
import { navigate } from '../../lib/router';
import { weightTrend } from '../../domain/weeklyRecap';
import { WeekRecap } from './WeekRecap';
import { RecoveryToday } from './RecoveryToday';

/** Energy split by where it comes from: protein and carbs 4 kcal/g, fat 9, fibre 2; "Other" is the rest. */
export function calorieSegments(kcal: number, protein: number, carbs: number, fat: number, fibre: number) {
  const raw = [
    { label: 'Protein', kcal: protein * 4, color: 'var(--protein)' },
    { label: 'Carbs', kcal: carbs * 4, color: 'var(--carbs)' },
    { label: 'Fat', kcal: fat * 9, color: 'var(--fat)' },
    { label: 'Fibre', kcal: fibre * 2, color: 'var(--fibre)' },
  ];
  const other = Math.max(0, kcal - raw.reduce((n, x) => n + x.kcal, 0));
  const all = [...raw, { label: 'Other', kcal: other, color: 'var(--muted)' }];
  const sum = all.reduce((n, x) => n + x.kcal, 0);
  return all.map((x) => ({ ...x, share: sum > 0 ? x.kcal / sum : 0 }));
}

function CalorieRing({ eaten, target, segments, children }: { eaten: number; target: number; segments: ReturnType<typeof calorieSegments>; children: ReactNode }) {
  const filled = target > 0 ? Math.min(1, eaten / target) : 0;
  let offset = 0;
  return (
    <div className="fuel-ring">
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        {segments.map((s) => {
          const len = s.share * filled * 100;
          const el = len > 0 ? <circle key={s.label} cx="21" cy="21" r="15.9155" fill="none" stroke={s.color} strokeWidth="4" strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={-offset} /> : null;
          offset += len;
          return el;
        })}
      </svg>
      <div className="fuel-ring-center">{children}</div>
    </div>
  );
}

export function TodayScreen() {
  const hasAiKey = !!geminiKey();
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
  const now = Date.now();

  const dayWorkouts = useMemo(() => allWorkouts.filter((w) => toISODate(new Date(w.startedAt)) === date), [allWorkouts, date]);
  const weekCount = useMemo(() => {
    const from = addDays(date, -6);
    return allWorkouts.filter((w) => { const d = toISODate(new Date(w.startedAt)); return d >= from && d <= date; }).length;
  }, [allWorkouts, date]);
  // Change over 4 weeks uses 7-day averages, so one heavy or light morning doesn't flip the arrow.
  const weight = useMemo(() => {
    const upto = weights.filter((w) => w.date <= date);
    const trend = weightTrend(upto, date);
    return { last: upto[upto.length - 1], avg: trend.avg, change: trend.change, recent: upto.slice(-10) };
  }, [weights, date]);
  // Food that ChatGPT or Claude added to this day in the last 24 hours, with Undo.
  // One banner for everything ChatGPT or Claude added in the last 24 hours (Review opens the AI sheet; ✕ hides, never undoes).
  const ai = useAiActivity(now);
  const aiHiddenNow = useDB((d) => d.settings.aiHidden);

  const goal = profile?.trainingDaysPerWeek ?? 3;
  const remaining = t ? t.kcal - total.kcal : 0;
  const segments = calorieSegments(total.kcal, total.protein, total.carbs, total.fat, fibre.grams ?? 0);
  const waterGoal = t?.waterMl ?? 2500;
  const towardTarget = weight.change !== null && profile && weight.last ? Math.sign(weight.change) === Math.sign(profile.targetWeightKg - weight.last.kg) : false;
  const spark = (() => {
    const v = weight.recent.map((w) => w.kg);
    if (v.length < 2) return '';
    const lo = Math.min(...v) - 0.2, hi = Math.max(...v) + 0.2;
    return v.map((kg, i) => `${(i / (v.length - 1)) * 120},${4 + (1 - (kg - lo) / (hi - lo)) * 36}`).join(' ');
  })();

  return (
    <>
      <TopBar title={<span className="title-stack">Overview{profile && <small>Hi, {profile.firstName || profile.name}</small>}</span>} />
      <div className="screen overview">
        <DateStrip date={date} />

        {ai.recent.length > 0 && (
          <SwipeRow as="div" className="ai-notice-swipe" onOpen={openAiHub} onClear={() => hideAiActivity(ai.recent, ai.recentAll, aiHiddenNow)} label={`${aiSummary(ai.recent).text}. Review`}>
            <div className="ai-notice" role="status">
              <span className="ai-notice-open"><span className="ai-notice-icon"><Sparkles aria-hidden="true" /></span>
              <span className="grow"><span className="by ellipsis">{aiSummary(ai.recent).who}{new Set(ai.recent.map((a) => a.by)).size === 1 ? ` · ${aiAgo(Math.max(...ai.recent.map((a) => a.at)), now)}` : ''}</span><span className="what ellipsis">{aiSummary(ai.recent).what}</span></span>
              <span className="ai-notice-review">Review</span></span>
              <button type="button" className="icon-btn ai-notice-x" aria-label="Hide (keeps everything)" title="Hide (keeps everything)" onClick={() => hideAiActivity(ai.recent, ai.recentAll, aiHiddenNow)}><X aria-hidden="true" /></button>
            </div>
          </SwipeRow>
        )}

        {isToday && <WeekRecap />}

        {entries.length === 0 && <Empty icon={Plus} title="No food entries" action={<button className="btn btn-primary" onClick={() => navigate('/food')}>Log your first meal</button>} />}

        {t && (
          <section className="card overview-card" aria-label="Calories and macros">
            <div className="overview-card-head">
              <span className="eyebrow">Fuel<InfoButton title="Calorie balance" lines={['Protein and carbs give 4 kcal per gram, fat 9 and fibre 2.', 'Other is energy the food data does not split into nutrients.']} /></span>
              <button className="btn btn-link" onClick={() => navigate('/food')}>Food log<ChevronRight aria-hidden="true" /></button>
            </div>
            <div className="fuel-top">
              <CalorieRing eaten={total.kcal} target={t.kcal} segments={segments}>
                <span className="ring-val tnum">{fmtInt(energyValue(Math.abs(remaining), eU))}</span>
                <span className="ring-label">{eU} {remaining >= 0 ? 'left' : 'over'}</span>
              </CalorieRing>
              <div className="fuel-stats">
                <div><span>Eaten</span><strong className="tnum">{fmtInt(energyValue(total.kcal, eU))}</strong></div>
                <div><span>Target</span><strong className="tnum">{fmtInt(energyValue(t.kcal, eU))}</strong></div>
                <div><span>{remaining >= 0 ? 'Remaining' : 'Over'}</span><strong className={`tnum ${remaining >= 0 ? 'accent-text' : 'warn-text'}`}>{fmtInt(energyValue(Math.abs(remaining), eU))}</strong></div>
              </div>
            </div>
            {total.kcal > 0 && (
              <div className="fuel-legend">
                {segments.filter((x) => x.kcal > 0).map((x) => (
                  <span key={x.label}><i style={{ background: x.color }} /><span className="grow">{x.label}</span><b className="tnum">{fmtInt(energyValue(x.kcal, eU))} · {Math.round(x.share * 100)}%</b></span>
                ))}
              </div>
            )}
            <div className="macro-tiles">
              {([['Protein', total.protein, t.protein, 'var(--protein)'], ['Carbs', total.carbs, t.carbs, 'var(--carbs)'], ['Fat', total.fat, t.fat, 'var(--fat)']] as const).map(([n, v, m, color]) => (
                <div key={n} className="macro-tile">
                  <span className="n"><i style={{ background: color }} />{n}</span>
                  <span className="v tnum"><b>{Math.round(v)}</b>/{m} g</span>
                  <span className="track" role="meter" aria-label={`${n} ${Math.round(v)} of ${m} grams`} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={m}><span style={{ width: `${m > 0 ? Math.min(100, (v / m) * 100) : 0}%`, background: color }} /></span>
                </div>
              ))}
            </div>
            <div className="fibre-row">
              <i style={{ background: 'var(--fibre)' }} /><span className="muted">Fibre</span>
              <strong className="tnum">{fibre.grams === null ? '—' : Number(fibre.grams.toFixed(1))} / {fibreTarget(t.kcal)} g</strong>
              {(fibre.grams === null || fibre.missing) && entries.length > 0 && <span className="chip-warn">Incomplete<InfoButton title="Fibre" lines={['Some foods logged on this day have no fibre value, so the total may be low.']} /></span>}
            </div>
          </section>
        )}

        <div className="overview-pair">
          <section className="card overview-card water-card" aria-label="Water">
            <span className="eyebrow"><Droplets aria-hidden="true" className="water-icon" />Water</span>
            <div className="water-body">
              <div className="water-tube" aria-hidden="true"><span style={{ height: `${Math.min(100, (water / waterGoal) * 100)}%` }} /></div>
              <div><div className="big tnum">{fmtInt(water)}</div><div className="small muted tnum">/ {fmtInt(waterGoal)} ml</div></div>
            </div>
            <div className="water-buttons">
              <button className="round-btn" aria-label="Remove 250 ml" disabled={water === 0} onClick={() => diary.setWater(date, Math.max(0, water - 250))}><Minus /></button>
              <button className="round-btn water" aria-label="Add 250 ml" onClick={() => diary.setWater(date, water + 250)}><Plus /></button>
            </div>
          </section>

          <section className="card overview-card week-card" aria-label="Training in the last 7 days">
            <span className="eyebrow">Last 7 days</span>
            <div className="week-count tnum"><span className="big">{weekCount}</span><span className="of"> / {goal}</span></div>
            <div className="small muted">workouts</div>
            <div className="week-bars" aria-hidden="true">{Array.from({ length: Math.max(goal, 1) }, (_, i) => <span key={i} className={i < weekCount ? 'on' : ''} />)}</div>
            {active ? (
              <button className="btn btn-dark btn-block week-go" onClick={() => navigate('/workout')}><Play aria-hidden="true" />Resume</button>
            ) : (
              <button className="btn btn-primary btn-block week-go" onClick={() => { workoutRepo.start(null); navigate('/workout'); }}><Play aria-hidden="true" />Quick start</button>
            )}
          </section>
        </div>

        <RecoveryToday date={date} />

        {dayWorkouts.length > 0 && (
          <section className="card overview-card" aria-label="Workouts on this day">
            <span className="eyebrow">{isToday ? 'Today’s workouts' : 'Workouts'}</span>
            {dayWorkouts.map((w) => (
              <button key={w.id} className="list-row day-workout" onClick={() => navigate(`/training/history/${w.id}`)}>
                <span className="grow">
                  <span className="row-title ellipsis">{w.title}</span>
                  <span className="row-sub tnum">{duration((w.endedAt - w.startedAt) / 1000)} · {fmtVolume(workingVolume(w.exercises), s.weightUnit)}<AiBadge addedBy={w.addedBy} /></span>
                </span>
                <ChevronRight className="chev" aria-hidden="true" />
              </button>
            ))}
          </section>
        )}

        <button className="card overview-card weight-card" aria-label="Body weight, open Progress" onClick={() => navigate('/progress/body')}>
          <span className="grow">
            <span className="eyebrow">Body weight</span>
            <span className="weight-now tnum"><b>{weight.last ? fmtNum(kgTo(weight.last.kg, s.weightUnit), 1) : '—'}</b> {s.weightUnit}</span>
            <span className="weight-meta">
              {weight.change !== null && (
                <span className={`tnum ${towardTarget ? 'good' : 'neutral'}`}>{weight.change < 0 ? <TrendingDown aria-hidden="true" /> : <TrendingUp aria-hidden="true" />}{weight.change > 0 ? '+' : ''}{fmtNum(kgTo(weight.change, s.weightUnit), 1)} {s.weightUnit} · 4 wks</span>
              )}
              {weight.avg !== null && <span className="muted tnum">Avg {fmtNum(kgTo(weight.avg, s.weightUnit), 1)}</span>}
              {profile && <span className="muted tnum">Goal {fmtNum(kgTo(profile.targetWeightKg, s.weightUnit), 1)} {s.weightUnit}</span>}
            </span>
          </span>
          {spark && <svg className="weight-spark" viewBox="0 0 120 44" aria-hidden="true"><polyline points={spark} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>

        {MFD_AI ? <button className="mfdai-entry" onClick={() => navigate('/ai')} aria-label="Message MFD AI">
          <span className="mfdai-entry-top"><span className="mfdai-avatar" aria-hidden="true"><Sparkles /></span>
            <span className="grow"><b>MFD AI</b><span>{hasAiKey ? 'What did you eat, drink or do?' : 'Set up with a free Gemini key'}</span></span></span>
          <span className="mfdai-entry-field" aria-hidden="true"><span className="grow">Message MFD AI</span><span className="mfdai-entry-send"><ArrowUp /></span></span>
        </button> : <button className="coach-card" onClick={() => navigate('/coach')}>
          <span className="coach-icon"><Bot aria-hidden="true" /></span>
          <span className="grow">
            <span className="coach-title">AI coach<span className="coach-tag">Preview</span></span>
            <span className="coach-sub">{t && isToday && total.protein < t.protein * 0.6 ? `Protein ${Math.round(total.protein)} of ${t.protein} g so far` : 'Connect ChatGPT or Claude'}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>}
      </div>

    </>
  );
}
