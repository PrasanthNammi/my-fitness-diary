import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useDB } from '../../data/store';
import { useTargets } from '../../data/selectors';
import { weekRecap } from '../../domain/weeklyRecap';
import { energyValue, fmtInt, fmtNum, kgTo, todayISO } from '../../lib/format';

const KEY = 'mfd-recap-hidden';
const hiddenWeek = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const range = (from: string, to: string) => {
  const f = new Date(from + 'T12:00:00'), t = new Date(to + 'T12:00:00');
  const day = (d: Date, month: boolean) => d.toLocaleDateString(undefined, month ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  return `${day(f, true)} – ${day(t, f.getMonth() !== t.getMonth())}`;
};

/** Last week at a glance, at the top of the Overview from Monday until hidden for that week. */
export function WeekRecap() {
  const workouts = useDB((d) => d.workouts), diary = useDB((d) => d.diary), weights = useDB((d) => d.weights);
  const profile = useDB((d) => d.profile), s = useDB((d) => d.settings);
  const t = useTargets()?.targets;
  const today = todayISO();
  const r = useMemo(() => weekRecap({ today, workouts, diary, weights, goal: profile?.trainingDaysPerWeek ?? 3, kcalTarget: t?.kcal ?? null, proteinTarget: t?.protein ?? null }),
    [today, workouts, diary, weights, profile?.trainingDaysPerWeek, t?.kcal, t?.protein]);
  const [hidden, setHidden] = useState(hiddenWeek);
  if (r.empty || hidden === r.from) return null;
  const hide = () => { try { localStorage.setItem(KEY, r.from); } catch { /* still hides for now */ } setHidden(r.from); };
  const eU = s.energyUnit, wU = s.weightUnit;
  const tiles: { k: string; v: string; sub?: string; good?: boolean }[] = [
    { k: 'Workouts', v: String(r.workouts), sub: `of ${r.goal}`, good: r.workouts >= r.goal },
    { k: 'Avg calories', v: r.avgKcal === null ? '—' : fmtInt(energyValue(r.avgKcal, eU)), sub: r.kcalTarget ? `of ${fmtInt(energyValue(r.kcalTarget, eU))}` : eU },
    { k: 'Protein days', v: r.loggedDays ? String(r.proteinDays) : '—', sub: r.loggedDays ? `of ${r.loggedDays}` : undefined, good: r.loggedDays > 0 && r.proteinDays === r.loggedDays },
    { k: 'Weight avg', v: r.weightAvg === null ? '—' : fmtNum(kgTo(r.weightAvg, wU), 1), sub: r.weightChange === null ? (r.weightAvg === null ? undefined : wU) : `${r.weightChange > 0 ? '+' : ''}${fmtNum(kgTo(r.weightChange, wU), 1)} ${wU}` },
  ];
  return (
    <section className="card overview-card recap-card" aria-label="Last week">
      <div className="overview-card-head">
        <span className="eyebrow">Last week <span className="recap-range">{range(r.from, r.to)}</span></span>
        <button type="button" className="icon-btn" aria-label="Hide last week" onClick={hide}><X /></button>
      </div>
      <div className="recap-grid">
        {tiles.map((x) => (
          <div key={x.k} className={`recap-tile${x.good ? ' good' : ''}`}>
            <span className="k">{x.k}</span>
            <span className="v tnum">{x.v}{x.sub && <small> {x.sub}</small>}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
