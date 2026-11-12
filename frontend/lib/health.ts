// Sleep and steps from Android Health Connect (Samsung Health and others share them there), in the MFD Android
// app from 1.4. Once connected, the last 7 days fill the recovery check-ins each time MFD opens (body.mergeHealth:
// steps follow Health Connect; sleep only fills days without it). Read only while MFD is open; nothing is written to
// Health Connect, and the values stay in the person's own diary (see the app's privacy screen, strings.xml).
import { useEffect, useState } from 'react';
import { body } from '../data/repositories';
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
type Day = { date: string; sleep: number | null; steps: number | null };
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
