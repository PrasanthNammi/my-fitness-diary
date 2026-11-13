// Samsung Health data from Android Health Connect, in the MFD Android app (1.4+; more kinds from 2.0). Once connected,
// the last 7 days are read each time MFD opens (body.mergeHealth): steps, resting heart rate, HRV and sleep stages
// follow Health Connect on the day's check-in, sleep hours only fill days without them, and weight and body fat become
// weigh-ins marked as from Samsung Health (a typed weight is never replaced; a deleted one isn't added back). Read only
// while MFD is open; the values stay in the person's own diary (see the app's privacy screen, strings.xml).
import { useEffect, useState } from 'react';
import { body } from '../data/repositories';
import { getDB, subscribe } from '../data/store';
import { emptyPlan, planHealthWrites, type Sent } from '../domain/healthWrite';
import { addDays, todayISO } from './format';
import { appVersion, newer } from './appUpdate';
import { ask, inApp } from './native';
import { engine } from '../adapters/engine';

export const HEALTH_FROM = '1.4';
const KEY = 'mfd-health', DAYS = 7, EVERY_MS = 10 * 60_000;
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v: string | null) => { try { if (v === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* per device */ } };

/** This app can read Health Connect (the Android app, version 1.4 or later). */
export const healthSupported = () => { const v = appVersion(); return inApp() && !!v && !newer(HEALTH_FROM, v); };

type Status = { availability?: string; granted?: boolean };
/** One day from Health Connect (the 2.0 app adds sleep stages). */
export type HealthDayRead = { date: string; sleep: number | null; steps: number | null; restingHr?: number | null; hrv?: number | null; weightKg?: number | null; bodyFat?: number | null; sleepStages?: unknown };
type Day = HealthDayRead;
export type HealthState = 'off' | 'on' | 'reconnect';

let last = 0, running: Promise<number> | null = null;
/** Reads the last 7 days into the check-ins (at most every 10 minutes unless `force`). Returns days changed. */
export function syncHealth(force = false): Promise<number> {
  if (!healthSupported() || read() !== 'on') return Promise.resolve(0);
  if (running) return running;
  if (!force && Date.now() - last < EVERY_MS) return Promise.resolve(0);
  // Only into a fully loaded diary (never while it is starting or reconciling with the cloud).
  const s = engine()?.peek();
  if (!s?.ready || s.starting || s.reconciling) return Promise.resolve(0);
  last = Date.now();
  const to = todayISO(), from = addDays(to, -(DAYS - 1));
  running = ask<{ days?: Day[]; error?: string }>('healthRead', { from, to }, 30_000)
    .then((r) => (Array.isArray(r.days) ? body.mergeHealth(r.days) : 0))
    .catch(() => 0)
    .finally(() => { running = null; });
  return running;
}

export type HeartSeries = { samples: [number, number][]; avg: number | null; max: number | null };
/** A finished workout's heart rate (5-second steps: seconds from the start, bpm), or null when unavailable. */
export async function readWorkoutHeart(startMs: number, endMs: number): Promise<HeartSeries | null> {
  if (!healthSupported() || read() !== 'on') return null;
  try {
    const r = await ask<{ samples?: [number, number][]; avg?: number | null; max?: number | null; error?: string }>('healthHeart', { from: startMs, to: endMs }, 30_000);
    return Array.isArray(r.samples) ? { samples: r.samples, avg: r.avg ?? null, max: r.max ?? null } : null;
  } catch { return null; }
}

/** From a tap: Health Connect's permission screen, then a first read. */
export async function connectHealth(): Promise<'connected' | 'denied' | 'install' | 'unsupported'> {
  const r = await ask<{ granted?: boolean; state?: string }>('healthConnect', {}, 300_000);
  if (r.state === 'install') return 'install';
  if (r.state === 'unsupported') return 'unsupported';
  if (!r.granted) return 'denied';
  write('on');
  await syncHealth(true);
  return 'connected';
}

/** 'off' (not connected), 'on', or 'reconnect' (connected here, but permission was taken back in Android). */
export function useHealth(): [HealthState | null, () => void] {
  const [state, setState] = useState<HealthState | null>(null);
  const refresh = () => {
    if (!healthSupported()) { setState(null); return; }
    if (read() !== 'on') { setState('off'); return; }
    ask<Status>('healthStatus', {}, 10_000)
      .then((s) => setState(s.granted ? 'on' : 'reconnect'))
      .catch(() => setState('on'));
  };
  useEffect(refresh, []);
  return [state, refresh];
}

// ── Saving to Health Connect (Android app 2.0+) ─────────────────────────────
export const HEALTH_WRITE_FROM = '2.0';
export type WriteKind = 'workouts' | 'food';
export type WriteSettings = Record<WriteKind, boolean>;
/** This app can save to Health Connect. */
export const healthWriteSupported = () => { const v = appVersion(); return inApp() && !!v && !newer(HEALTH_WRITE_FROM, v); };
// Per account on this device: switching accounts never touches what another account saved.
const account = () => engine()?.peek()?.user?.id as string | undefined;
const store = (k: string) => ({ get: <T,>(fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return fallback; } }, set: (v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* per device */ } } });
const writeSettings = () => store(`mfd-health-write:${account() ?? '-'}`);
const sentStore = () => store(`mfd-health-sent:${account() ?? '-'}`);

export const healthWriteSettings = (): WriteSettings => ({ workouts: false, food: false, ...writeSettings().get<Partial<WriteSettings>>({}) });

/** Turns saving one kind on (asking Health Connect for permission first) or off. Returns the kind's new state. */
export async function setHealthWrite(kind: WriteKind, on: boolean): Promise<'on' | 'off' | 'denied' | 'install' | 'unsupported'> {
  const cur = healthWriteSettings();
  if (!on) { writeSettings().set({ ...cur, [kind]: false }); return 'off'; }
  const r = await ask<{ granted?: boolean; state?: string; writable?: string[] }>('healthConnect', { write: [kind] }, 300_000);
  if (r.state === 'install') return 'install';
  if (r.state === 'unsupported') return 'unsupported';
  if (!r.granted || !r.writable?.includes(kind)) return 'denied';
  writeSettings().set({ ...cur, [kind]: true });
  void writeHealth();
  return 'on';
}

let writing: Promise<number> | null = null;
/** Saves what changed (see domain/healthWrite.ts). Returns how many records were sent. */
export function writeHealth(): Promise<number> {
  if (!healthWriteSupported() || writing) return writing ?? Promise.resolve(0);
  const on = healthWriteSettings();
  if (!on.workouts && !on.food) return Promise.resolve(0);
  const s = engine()?.peek();
  if (!s?.ready || s.starting || s.reconciling || !account()) return Promise.resolve(0);
  const d = getDB(), sent = sentStore().get<Sent>({ w: {}, f: {} });
  const plan = planHealthWrites(d, { w: sent.w ?? {}, f: sent.f ?? {} }, on, Date.now(), todayISO());
  if (emptyPlan(plan)) { sentStore().set(plan.sent); return Promise.resolve(0); }
  const forAccount = account();
  writing = ask<{ workouts?: number; meals?: number; removed?: number; error?: string }>('healthWrite', { workouts: plan.workouts, meals: plan.meals, remove: plan.remove }, 60_000)
    .then((r) => {
      if (r.error || account() !== forAccount) return 0;
      sentStore().set(plan.sent);
      return (r.workouts ?? 0) + (r.meals ?? 0) + (r.removed ?? 0);
    })
    .catch(() => 0)
    .finally(() => { writing = null; });
  return writing;
}

/** Saves changes about 15 s after the diary changes, and when MFD comes back on screen. Returns the stop function. */
export function installHealthWrites() {
  if (!healthWriteSupported()) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => void writeHealth(), 15_000); };
  const visible = () => { if (!document.hidden) soon(); };
  const off = subscribe(soon);
  document.addEventListener('visibilitychange', visible);
  soon();
  return () => { off(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
}
