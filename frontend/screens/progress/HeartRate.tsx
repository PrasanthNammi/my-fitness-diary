import { useEffect, useMemo } from 'react';
import { ChevronRight, ClipboardList, Heart, Watch } from 'lucide-react';
import { getDB, useDB } from '../../data/store';
import { exerciseName, exercises, workouts as workoutRepo } from '../../data/repositories';
import type { HeartRateSeries, Workout } from '../../domain/types';
import { HR_ZONES, estimateKcal, exerciseSections, heartBetween, heartPoints, maxHeartRate, seriesFromSamples, zoneIndex, zoneSeconds } from '../../domain/heartRate';
import { readWorkoutHeart } from '../../lib/health';
import { duration, fmtInt, longDate, mss, toISODate } from '../../lib/format';
import { navigate } from '../../lib/router';
import { Empty, TopBar } from '../../components/ui';
import { ExerciseThumb } from '../training/ExercisePicker';

const zoneColor = (i: number) => `var(--hr-z${i + 1})`;

/** Age, sex and the weight on the workout's day, for zones and calories. */
function usePerson(w: Workout | undefined) {
  const profile = useDB((d) => d.profile), weights = useDB((d) => d.weights);
  const day = w ? toISODate(new Date(w.startedAt)) : '';
  const kg = [...weights].reverse().find((x) => x.date <= day)?.kg ?? profile?.weightKg ?? null;
  return { max: maxHeartRate(profile?.age), age: profile?.age ?? null, sex: profile?.sex ?? null, kg };
}

export function SourceLine({ source }: { source: HeartRateSeries['source'] }) {
  return <p className="hr-source"><Watch aria-hidden="true" />From {source === 'watch' ? 'Galaxy Watch' : 'Samsung Health'}</p>;
}

export function ZoneBar({ seconds }: { seconds: number[] }) {
  const total = seconds.reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="hr-zonebar" aria-hidden="true">{seconds.map((s, i) => s > 0 && <span key={i} style={{ width: `${(s / total) * 100}%`, background: zoneColor(i) }} />)}</div>
      <div className="hr-zones">
        {HR_ZONES.map((z, i) => (
          <div key={z.z} aria-label={`Zone ${z.z}, ${z.label}: ${Math.round((seconds[i] ?? 0) / 60)} minutes`}>
            <b><span className="dot" style={{ background: zoneColor(i) }} />Z{z.z}</b>
            <span className="muted tnum">{Math.round((seconds[i] ?? 0) / 60)} min</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const tried = new Set<string>();
/** A workout saved without heart rate: once per visit, readings from Health Connect (e.g. a Samsung Health workout
 *  on the watch) are attached when they are dense enough to draw. Nothing already there is replaced. */
export function useHeartFromHealth(w: Workout | undefined) {
  useEffect(() => {
    if (!w || w.heartRate || tried.has(w.id)) return;
    tried.add(w.id);
    const durationSec = (w.endedAt - w.startedAt) / 1000;
    void readWorkoutHeart(w.startedAt, w.endedAt).then((r) => {
      const hr = r && seriesFromSamples(r.samples, durationSec);
      const now = hr && getDB().workouts.find((x) => x.id === w.id);
      if (hr && (!now || !now.heartRate)) workoutRepo.updateWorkout({ ...(now ?? w), heartRate: hr });
    });
  }, [w?.id, !!w?.heartRate]);
}

/** Summary card on a finished workout; opens the full graph. Nothing when the workout has no heart rate. */
export function HeartRateCard({ w }: { w: Workout }) {
  const who = usePerson(w);
  const hr = w.heartRate;
  if (!hr) return null;
  const minutes = (w.endedAt - w.startedAt) / 60_000;
  const kcal = estimateKcal(hr.avg, minutes, who.kg, who.age, who.sex);
  return (
    <button className="card card-pad hr-card" onClick={() => navigate(`/training/history/${w.id}/heart`)} aria-label="Open heart rate">
      <div className="hr-head"><Heart aria-hidden="true" className="hr-icon" /><b>Heart rate</b><ChevronRight aria-hidden="true" className="muted" /></div>
      <div className="hr-stats">
        <div><div className="k">Average</div><div className="v">{hr.avg} <small>bpm</small></div></div>
        <div><div className="k">Max</div><div className="v">{hr.max} <small>bpm</small></div></div>
        <div><div className="k">Calories</div><div className="v">{kcal === null ? '–' : fmtInt(kcal)} <small>kcal est.</small></div></div>
      </div>
      <ZoneBar seconds={zoneSeconds(hr, who.max)} />
      <SourceLine source={hr.source} />
    </button>
  );
}

/** The graph: zone bands, the heart-rate line with its peak, and when each exercise was done. */
function Graph({ hr, w, max }: { hr: HeartRateSeries; w: Workout; max: number }) {
  const total = Math.max(hr.interval, (w.endedAt - w.startedAt) / 1000);
  const points = heartPoints(hr), sections = exerciseSections(w);
  const W = 340, H = 180;
  const lo = Math.max(40, Math.floor((Math.min(...points.map((p) => p.bpm)) - 10) / 10) * 10), hi = Math.max(max, hr.max + 5);
  const x = (t: number) => (Math.min(t, total) / total) * W, y = (b: number) => H - ((b - lo) / (hi - lo)) * H;
  // Gaps without readings break the line.
  const path = points.map((p, i) => `${i && p.t - points[i - 1]!.t <= hr.interval * 2 ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.bpm).toFixed(1)}`).join('');
  const peak = points.find((p) => p.bpm === hr.max)!;
  return (
    <svg viewBox={`0 0 ${W} ${H + (sections.length ? 34 : 4)}`} className="hr-graph" role="img" aria-label={`Heart rate during the workout, average ${hr.avg}, max ${hr.max} bpm`}>
      {HR_ZONES.map((z, i) => {
        const top = i === HR_ZONES.length - 1 ? hi : HR_ZONES[i + 1]!.from * max, bottom = Math.max(lo, z.from * max);
        return top > lo && <rect key={z.z} x={0} width={W} y={y(Math.min(hi, top))} height={Math.max(0, y(bottom) - y(Math.min(hi, top)))} fill={zoneColor(i)} opacity={0.1} />;
      })}
      <path d={path} fill="none" stroke="var(--failure)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(peak.t)} cy={y(peak.bpm)} r={4} fill="var(--failure)" stroke="var(--surface)" strokeWidth={2} />
      <text x={Math.min(W - 52, x(peak.t) + 6)} y={Math.max(12, y(peak.bpm) - 6)} fontSize={11} fontWeight={800} fill="var(--text)">Max {hr.max}</text>
      {sections.map((s, i) => {
        const left = x(s.start), width = x(s.end) - left;
        return (
          <g key={i}>
            <rect x={left + 1} width={Math.max(1, width - 2)} y={H + 8} height={6} rx={3} fill={i % 2 ? 'var(--faint)' : 'var(--brand)'} />
            {width >= 36 && <text x={left + 2} y={H + 28} fontSize={9} fontWeight={700} fill="var(--muted)">{exerciseName(s.exerciseId).split(/[\s(]/)[0]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Full heart-rate page for a finished workout. */
export function HeartRatePage({ id }: { id: string }) {
  const w = useDB((d) => d.workouts.find((x) => x.id === id));
  const who = usePerson(w);
  const perExercise = useMemo(() => {
    if (!w?.heartRate) return [];
    const hr = w.heartRate, by = new Map<string, { sum: number; n: number }>();
    for (const s of exerciseSections(w)) {
      const part = heartBetween(hr, s.start, s.end);
      if (!part) continue;
      const n = Math.max(1, Math.round((s.end - s.start) / hr.interval)), cur = by.get(s.exerciseId) ?? { sum: 0, n: 0 };
      by.set(s.exerciseId, { sum: cur.sum + part.avg * n, n: cur.n + n });
    }
    return [...by].map(([exerciseId, v]) => ({ exerciseId, avg: Math.round(v.sum / v.n) }));
  }, [w]);
  if (!w?.heartRate) {
    return (
      <>
        <TopBar title="Heart rate" back={`/training/history/${id}`} />
        <div className="screen"><Empty icon={ClipboardList} title="No heart rate">This workout has no heart-rate readings.</Empty></div>
      </>
    );
  }
  const hr = w.heartRate, total = (w.endedAt - w.startedAt) / 1000;
  return (
    <>
      <TopBar title="Heart rate" back={`/training/history/${id}`} bordered center />
      <div className="screen hr-page">
        <div className="card card-pad">
          <b>{w.title}</b>
          <p className="small muted tnum" style={{ margin: '2px 0 10px' }}>{longDate(w.startedAt)} · {duration(total)} · avg {hr.avg} · max {hr.max} bpm</p>
          <Graph hr={hr} w={w} max={who.max} />
          <div className="hr-legend small muted"><span>Bands = zones</span><span className="tnum">0:00 – {mss(Math.round(total))}</span></div>
        </div>
        <div className="card card-pad"><p className="hr-eyebrow">Time in zones</p><ZoneBar seconds={zoneSeconds(hr, who.max)} /></div>
        {perExercise.length > 0 && (
          <div className="card card-pad">
            <p className="hr-eyebrow">Per exercise</p>
            {perExercise.map((e) => (
              <div key={e.exerciseId} className="hr-ex">
                <ExerciseThumb exercise={exercises.byId(e.exerciseId)} />
                <span className="ellipsis">{exerciseName(e.exerciseId)}</span>
                <span className="dot" style={{ background: zoneColor(zoneIndex(e.avg, who.max)) }} />
                <b className="tnum">{e.avg}</b><small className="muted">bpm</small>
              </div>
            ))}
          </div>
        )}
        <SourceLine source={hr.source} />
        <p className="small muted" style={{ margin: '4px 0 0' }}>Zones use an estimated maximum of {who.max} bpm (220 − age). Calories are an estimate from heart rate, weight and age.</p>
      </div>
    </>
  );
}
