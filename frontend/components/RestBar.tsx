import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ActiveWorkout } from '../domain/types';
import { resetTimer, timerRemaining, timerState } from '../domain/training';
import { getDB, useDB } from '../data/store';
import { reclaimRests, refreshAppPush, restsHandedOff, scheduleRests, type PendingRest } from '../lib/push';
import { onNative } from '../lib/native';
import { closeRestNotification, closeRestingNotification, restNotificationsOn, restingText, showRestOver, showResting } from '../lib/restNotification';
import { exerciseName, workouts } from '../data/repositories';
import { chime, primeChime } from '../lib/chime';
import { mss } from '../lib/format';
import { useNow } from '../lib/hooks';
import { useRoute } from '../lib/router';
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
        if (getDB().settings.vibrate !== false) navigator.vibrate?.([120, 60, 120]);
        toast(`Rest over · ${exerciseName(b.exerciseId)}`);
        // In the background, "Rest over" goes to the notification bar; on screen the chime is enough. Once the
        // rests are with the push service, it sends "Rest over" (its end time may have moved by ±15 s there).
        const hidden = document.visibilityState === 'hidden';
        if (restNotificationsOn() && !(hidden && restsHandedOff())) void (hidden ? showRestOver(b.id, exerciseName(b.exerciseId)) : closeRestNotification());
      }
    }
  }, [a, now]);
}

const runningRests = (a: ActiveWorkout | null, at: number): PendingRest[] => !a ? [] : a.exercises
  .filter((b) => timerState(a.timers[b.id], at) === 'running')
  .map((b) => ({ id: b.id, ends: a.timers[b.id].endsAt!, label: exerciseName(b.exerciseId) }))
  .sort((x, y) => x.ends - y.ends);

/** −15s / +15s on a running rest; +15s on a finished rest starts 15 s more from now. */
function adjustRest(id: string, sec: number) {
  workouts.mutate((w) => {
    const t = w.timers[id], now = Date.now();
    if (t?.endsAt == null) return;
    const base = sec > 0 ? Math.max(t.endsAt, now) : t.endsAt;
    w.timers[id] = { ...t, endsAt: Math.max(now, base + sec * 1000), pausedRemainingSec: null };
  });
  // Still in the background (a notification button): move the backup push too.
  if (document.visibilityState === 'hidden') scheduleRests(runningRests(getDB().active, Date.now()));
}

/**
 * Rest timers: chime, vibration and phone notifications on every screen. On the workout screen the
 * running rest shows as a dock at the bottom (within thumb reach) with −15s / +15s / Skip; on other
 * screens the Resume bar shows the time left.
 */
export function RestBar() {
  const a = useDB((d) => d.active);
  const onWorkout = useRoute()[0] === 'workout';
  const ticking = !!a && Object.values(a.timers).some((t) => t.endsAt !== null);
  const now = useNow(500, ticking);
  useRestAlerts(a, now);
  useEffect(() => {
    document.addEventListener('pointerdown', primeChime);
    void refreshAppPush();
    return () => document.removeEventListener('pointerdown', primeChime);
  }, []);
  // Leaving MFD hands running rests to phone notifications; coming back takes them back,
  // including any −15s / +15s pressed on the notification.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        scheduleRests(runningRests(getDB().active, Date.now()));
      } else {
        void reclaimRests().then((rests) => {
          if (rests?.length) workouts.mutate((w) => { for (const r of rests) if (w.timers[r.id]) w.timers[r.id] = { ...w.timers[r.id], endsAt: r.ends, pausedRemainingSec: null }; });
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  // The "Resting" notification: ticks every second on screen; in the background it shows the end time,
  // because Android pauses MFD there and a countdown would freeze. −15s / +15s pressed on it are relayed
  // by the service worker and move the end time.
  useEffect(() => {
    let shown = '', resting = false;
    const tick = () => {
      const next = runningRests(getDB().active, Date.now())[0];
      if (next && restNotificationsOn()) {
        const hidden = document.visibilityState === 'hidden', body = restingText(next.ends, Date.now(), hidden), key = `${next.id}:${body}`;
        if (key !== shown) { shown = key; resting = true; void showResting(next.id, next.label, body, hidden, next.ends).catch(() => undefined); }
      } else if (resting) { resting = false; shown = ''; if (!next) void closeRestingNotification(); }
    };
    const timer = setInterval(tick, 1000);
    // Switch to the end time the moment MFD is hidden (before Android pauses it), and back on return.
    document.addEventListener('visibilitychange', tick);
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'MFD_REST_ADJUST' && typeof e.data.id === 'string' && [-15, 15].includes(e.data.sec)) { adjustRest(e.data.id, e.data.sec); tick(); } };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    // The Android app's notification buttons while MFD is on screen (in the background the app asks the server).
    const offNative = onNative((e) => { if (e.event === 'restAdjust' && typeof e.id === 'string' && (e.sec === 15 || e.sec === -15)) { adjustRest(e.id, e.sec); tick(); } });
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); navigator.serviceWorker?.removeEventListener('message', onMessage); offNative(); };
  }, []);

  const running = a?.exercises
    .map((b) => ({ id: b.id, exerciseId: b.exerciseId, t: a.timers[b.id] }))
    .filter((x) => timerState(x.t, now) === 'running')
    .sort((x, y) => x.t.endsAt! - y.t.endsAt!)[0];
  if (!running || !onWorkout) return null;

  const adjust = (sec: number) => adjustRest(running.id, sec);
  const skip = () => workouts.mutate((w) => {
    const t = w.timers[running.id];
    if (t) w.timers[running.id] = resetTimer(t);
  });
  const name = exerciseName(running.exerciseId);

  const left = timerRemaining(running.t, now), total = Math.max(1, running.t.durationSec), progress = Math.min(1, left / total);
  const R = 21, C = 2 * Math.PI * R;
  return (
    <div className="rest-dock" role="timer" aria-label={`Rest for ${name}: ${mss(left)} left`}>
      <svg className="rest-ring" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r={R} className="rest-ring-track" />
        <circle cx="24" cy="24" r={R} className="rest-ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="rest-dock-label ellipsis">Rest · {name}</div>
        <div className="rest-dock-time tnum">{mss(left)}</div>
      </div>
      <button className="rest-dock-btn" onClick={() => adjust(-15)} aria-label="15 seconds less">−15</button>
      <button className="rest-dock-btn" onClick={() => adjust(15)} aria-label="15 seconds more">+15</button>
      <button className="rest-dock-btn skip" onClick={skip} aria-label="Skip rest"><X size={18} /></button>
    </div>
  );
}
