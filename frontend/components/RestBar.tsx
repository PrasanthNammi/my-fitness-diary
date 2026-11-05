import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ActiveWorkout } from '../domain/types';
import { resetTimer, timerRemaining, timerState } from '../domain/training';
import { getDB, useDB } from '../data/store';
import { reclaimRests, scheduleRests } from '../lib/push';
import { exerciseName, workouts } from '../data/repositories';
import { chime, primeChime } from '../lib/chime';
import { mss } from '../lib/format';
import { useNow } from '../lib/hooks';
import { toast } from './ui';

/** Fires a chime, vibration and message once when an exercise's rest timer runs out (on any screen). */
function useRestAlerts(a: ActiveWorkout | null, now: number) {
  const fired = useRef(new Set<string>());
  useEffect(() => {
    if (!a) return;
    for (const b of a.exercises) {
      const t = a.timers[b.id];
      if (!t || t.endsAt === null) continue;
      const key = `${b.id}:${t.endsAt}`;
      if (timerState(t, now) === 'done' && !fired.current.has(key) && now - t.endsAt < 5000) {
        fired.current.add(key);
        chime();
        navigator.vibrate?.([120, 60, 120]);
        toast(`Rest over · ${exerciseName(b.exerciseId)}`);
      }
    }
  }, [a, now]);
}

/** While a rest timer runs, the top header shows the time left with −15s / +15s / skip. */
export function RestBar() {
  const a = useDB((d) => d.active);
  const ticking = !!a && Object.values(a.timers).some((t) => t.endsAt !== null);
  const now = useNow(500, ticking);
  useRestAlerts(a, now);
  useEffect(() => {
    document.addEventListener('pointerdown', primeChime);
    return () => document.removeEventListener('pointerdown', primeChime);
  }, []);
  // Leaving MFD hands running rests to phone notifications; coming back takes them back,
  // including any −15s / +15s pressed on the notification.
  useEffect(() => {
    const onVisibility = () => {
      const a = getDB().active;
      if (document.visibilityState === 'hidden') {
        if (!a) return;
        const at = Date.now();
        scheduleRests(a.exercises.filter((b) => timerState(a.timers[b.id], at) === 'running').map((b) => ({ id: b.id, ends: a.timers[b.id].endsAt!, label: exerciseName(b.exerciseId) })));
      } else {
        void reclaimRests().then((rests) => {
          if (rests?.length) workouts.mutate((w) => { for (const r of rests) if (w.timers[r.id]) w.timers[r.id] = { ...w.timers[r.id], endsAt: r.ends, pausedRemainingSec: null }; });
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const running = a?.exercises
    .map((b) => ({ id: b.id, exerciseId: b.exerciseId, t: a.timers[b.id] }))
    .filter((x) => timerState(x.t, now) === 'running')
    .sort((x, y) => x.t.endsAt! - y.t.endsAt!)[0];
  if (!running) return null;

  const adjust = (sec: number) => workouts.mutate((w) => {
    const t = w.timers[running.id];
    if (t?.endsAt != null) w.timers[running.id] = { ...t, endsAt: Math.max(Date.now(), t.endsAt + sec * 1000) };
  });
  const skip = () => workouts.mutate((w) => {
    const t = w.timers[running.id];
    if (t) w.timers[running.id] = resetTimer(t);
  });
  const name = exerciseName(running.exerciseId);

  return (
    <div className="rest-bar" role="timer" aria-label={`Rest for ${name}`}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="rest-bar-label ellipsis">Rest · {name}</div>
        <div className="rest-bar-time tnum">{mss(timerRemaining(running.t, now))}</div>
      </div>
      <button className="rest-bar-btn" onClick={() => adjust(-15)} aria-label="15 seconds less">−15s</button>
      <button className="rest-bar-btn" onClick={() => adjust(15)} aria-label="15 seconds more">+15s</button>
      <button className="rest-bar-btn" onClick={skip} aria-label="Skip rest"><X size={18} /></button>
    </div>
  );
}
