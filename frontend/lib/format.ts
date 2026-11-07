// Formatting, parsing and date helpers shared across the UI.

import type { ISODate } from '../domain/types';

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const todayISO = () => toISODate(new Date());
export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
export function dayLabel(s: ISODate): string {
  const t = todayISO();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  if (s === addDays(t, 1)) return 'Tomorrow';
  return fromISODate(s).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}
export const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
export const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** 150 → "2:30" */
export function mss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/**
 * Accepts "2:30", "2.30", "2,30", "2m30s", "90s", "90" (seconds) and "230" (= 2:30).
 * Returns seconds or null when the input can't be read.
 */
export function parseMss(input: string): number | null {
  const v = input.trim().toLowerCase();
  if (!v) return null;
  const sep = v.match(/^(\d{1,3})[:.,](\d{1,2})$/);
  if (sep) {
    const sec = Number(sep[2].length === 1 ? sep[2] + '0' : sep[2]);
    if (sec > 59) return null;
    return Number(sep[1]) * 60 + sec;
  }
  const digits = v.match(/^(\d{1,5})$/);
  if (digits) {
    const d = digits[1];
    if (d.length <= 2) return Number(d);
    const sec = Number(d.slice(-2));
    if (sec > 59) return null;
    return Number(d.slice(0, -2)) * 60 + sec;
  }
  const ms = v.match(/^(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/);
  if (ms && (ms[1] || ms[2])) return Number(ms[1] ?? 0) * 60 + Number(ms[2] ?? 0);
  return null;
}
/** Duration like "1h 05m" or "42m". */
export function duration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m`;
  return `${Math.floor(sec)}s`;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString();
export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString(undefined, { maximumFractionDigits: digits });
}

// ── Units ─────────────────────────────────────────────────────────
export const LB_PER_KG = 2.20462;
export const kgTo = (kg: number, unit: 'kg' | 'lb') => (unit === 'kg' ? kg : kg * LB_PER_KG);
export const toKg = (v: number, unit: 'kg' | 'lb') => (unit === 'kg' ? v : v / LB_PER_KG);
export const round1 = (n: number) => Math.round(n * 10) / 10;
/** Gym weights keep two decimals (21.25 kg, 1.25 kg plates); body weight uses round1. */
export const roundWeight = (n: number) => Math.round(n * 100) / 100;
export function fmtWeight(kg: number | null, unit: 'kg' | 'lb'): string {
  if (kg === null) return '—';
  return `${fmtNum(kgTo(kg, unit), 1)} ${unit}`;
}
export function fmtVolume(kg: number, unit: 'kg' | 'lb'): string {
  return `${fmtInt(kgTo(kg, unit))} ${unit}`;
}

/** Parses a decimal typed with comma or dot. Empty → null. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function fmtEnergy(kcal: number, unit: 'kcal' | 'kJ'): string {
  return unit === 'kcal' ? `${fmtInt(kcal)} kcal` : `${fmtInt(kcal * 4.184)} kJ`;
}
export const energyValue = (kcal: number, unit: 'kcal' | 'kJ') => (unit === 'kcal' ? kcal : kcal * 4.184);
