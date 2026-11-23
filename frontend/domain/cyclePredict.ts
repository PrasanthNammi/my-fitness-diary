// The next-period estimate (Cycle & Health), computed on the phone from the person's own logged cycles.
//
// Method (see docs/cycle/EVIDENCE.md):
// - Li K, Urteaga I, et al. "A predictive model for next cycle start date that accounts for adherence in menstrual
//   self-tracking." J Am Med Inform Assoc 2021;29(1):3–11: a cycle without a logged period ("skipped") makes the
//   observed cycle look like two or more cycles; the model allows for that, and updates every day without a period.
// - Urteaga I, Li K, et al. "A generative modeling approach to calibrated predictions: a use case on menstrual cycle
//   length prediction." Proc Mach Learn Res 2021;149:535–566: per-person cycle lengths follow a generalized Poisson
//   distribution (it can be wider or narrower than a Poisson, so variable cycles are described well).
// The papers fitted their population settings on Clue app data that is not public; here the starting assumptions are
// gentle priors around published population figures (Bull et al., npj Digit Med 2019), and the person's own cycles
// take over as she logs. Everything is computed by summing over a grid (no sampling, so results are repeatable).
//
// Output: an 80% range for the next period's first day (10th to 90th percentile), never a single date, or "not enough
// data yet" before 3 complete cycles. It is not for preventing or planning pregnancy.
import type { ReactNode } from 'react';
import type { CycleDay, ISODate } from './types';
import { addDays, cycleLengths, cycleNow, daysBetween, periods } from './cycle';

export type Estimate =
  | { state: 'range'; from: ISODate; to: ISODate; median: ISODate; about: ReactNode[]; record: TrackRecord }
  | { state: 'insufficient'; about: ReactNode[] };
export interface TrackRecord { errors: number[]; within: number; checked: number }

export const MIN_CYCLES = 3, MAX_SKIPS = 2, MAX_LEN = 150;

// ── Generalized Poisson: P(k) = λ (λ + ξk)^(k−1) e^−(λ+ξk) / k!, for λ > 0 and ξ < 1 (mean λ/(1−ξ), variance
// λ/(1−ξ)³). ξ > 0: wider than a Poisson (variable cycles); ξ < 0: narrower (regular cycles), defined where λ + ξk > 0
// and normalised over that range. The sum of n independent GP(λ, ξ) is GP(nλ, ξ): how skipped cycles combine.
const ZCACHE = new Map<string, number>();
/** log of the normalising sum (≈ 0 for ξ ≥ 0; the cut-off range for ξ < 0). */
function logZ(lambda: number, xi: number): number {
  if (xi >= 0) return 0;
  const key = lambda.toFixed(4) + ':' + xi; let z = ZCACHE.get(key);
  if (z === undefined) { let t = 0; for (let k = 0; lambda + xi * k > 0 && k < LG.length - 1; k++) t += Math.exp(rawLogPmf(k, lambda, xi)); z = Math.log(t || 1e-300); ZCACHE.set(key, z); }
  return z;
}
const LG = (() => { const t = new Float64Array(MAX_LEN * (MAX_SKIPS + 1) + 2); for (let k = 2; k < t.length; k++) t[k] = t[k - 1]! + Math.log(k); return t; })();
function rawLogPmf(k: number, lambda: number, xi: number): number {
  const a = lambda + xi * k;
  if (a <= 0) return -Infinity;
  return Math.log(lambda) + (k - 1) * Math.log(a) - a - (LG[k] ?? lgammaSlow(k + 1));
}
export function gpLogPmf(k: number, lambda: number, xi: number): number {
  if (k < 0 || !Number.isInteger(k)) return -Infinity;
  return rawLogPmf(k, lambda, xi) - logZ(lambda, xi);
}
/** P(X < d) for X ~ GP(λ, ξ). */
function gpCdfBelow(d: number, lambda: number, xi: number) { let c = 0; for (let k = 0; k < d; k++) c += Math.exp(gpLogPmf(k, lambda, xi)); return Math.min(1, c); }
function lgammaSlow(x: number) { let s = 0; for (let i = 2; i < x; i++) s += Math.log(i); return s; }

// ── The grid: cycle mean m (days), dispersion ξ, skip probability π. Priors are gentle (see EVIDENCE.md).
const MEANS = Array.from({ length: 141 }, (_, i) => 18 + i * 0.5);          // 18 … 88 days
const XIS = [-3, -2, -1.4, -0.9, -0.5, -0.2, 0, 0.15, 0.3, 0.45, 0.6, 0.75];
const PIS = [0.01, 0.05, 0.1, 0.2, 0.35];
const PRIOR_MEAN = 29.3, PRIOR_LOG_SD = 0.35;                                // Bull et al. 2019: mean 29.3 days; wide on purpose
const logPriorMean = (m: number) => { const z = (Math.log(m) - Math.log(PRIOR_MEAN)) / PRIOR_LOG_SD; return -0.5 * z * z - Math.log(m); };
const logPriorXi = (xi: number) => -0.5 * xi * xi;                           // gentle: centred on a Poisson-like spread
const logPriorPi = (pi: number) => Math.log(1 - pi) * 8 + Math.log(pi);      // Beta(2, 9)-like: skips are uncommon

interface Post { m: number; xi: number; pi: number; w: number }
/** Posterior weights over the grid given complete observed cycle lengths. */
export function posterior(lengths: number[]): Post[] {
  const out: Post[] = []; let max = -Infinity;
  for (const m of MEANS) for (const xi of XIS) {
    const lambda = m * (1 - xi);
    for (const pi of PIS) {
      let lp = logPriorMean(m) + logPriorXi(xi) + logPriorPi(pi);
      for (const x of lengths) {
        let s = 0;
        for (let k = 0; k <= MAX_SKIPS; k++) s += (1 - pi) * pi ** k * Math.exp(gpLogPmf(x, (k + 1) * lambda, xi));
        lp += Math.log(s || 1e-300);
      }
      out.push({ m, xi, pi, w: lp }); if (lp > max) max = lp;
    }
  }
  let total = 0; for (const p of out) { p.w = Math.exp(p.w - max); total += p.w; }
  for (const p of out) p.w /= total;
  return out.filter((p) => p.w > 1e-9);
}

/** Distribution of the current cycle's length given that it has already lasted `day − 1` days without a new period. */
export function nextLengthDistribution(lengths: number[], day: number): Float64Array {
  const post = posterior(lengths), dist = new Float64Array(MAX_LEN * (MAX_SKIPS + 1) + 1);
  for (const p of post) {
    const lambda = p.m * (1 - p.xi);
    for (let k = 0; k <= MAX_SKIPS; k++) {
      // A skipped (unlogged) period only explains the days already passed: k skips need k cycles to have ended
      // before today. (Forgetting a future log doesn't move when the period itself comes.)
      const ws = p.w * (1 - p.pi) * p.pi ** k * (k === 0 ? 1 : gpCdfBelow(day, k * lambda, p.xi));
      if (ws < 1e-9) continue;
      // (only where this part has mass: its mean ± 10 standard deviations)
      const mean = (k + 1) * p.m, sd = Math.sqrt((k + 1) * lambda / (1 - p.xi) ** 3);
      const lo = Math.max(day, Math.floor(mean - 10 * sd)), hi = Math.min(dist.length - 1, Math.ceil(mean + 10 * sd));
      for (let x = lo; x <= hi; x++) dist[x]! += ws * Math.exp(gpLogPmf(x, (k + 1) * lambda, p.xi));
    }
  }
  let total = 0; for (let x = 0; x < dist.length; x++) { if (x < day) dist[x] = 0; total += dist[x]!; }
  if (total > 0) for (let x = 0; x < dist.length; x++) dist[x]! /= total;
  return dist;
}
export function quantile(dist: Float64Array, q: number) { let c = 0; for (let x = 0; x < dist.length; x++) { c += dist[x]!; if (c >= q) return x; } return dist.length - 1; }

/** Each past cycle predicted from the cycles before it only (no future data), as on its first day. */
export function trackRecord(lengths: number[]): TrackRecord {
  const errors: number[] = []; let within = 0, checked = 0;
  for (let j = Math.max(MIN_CYCLES, lengths.length - 4); j < lengths.length; j++) {   // (the last 4, as the ⓘ shows)
    const dist = nextLengthDistribution(lengths.slice(0, j), 1), actual = lengths[j]!;
    errors.push(Math.abs(actual - quantile(dist, 0.5))); checked++;
    if (actual >= quantile(dist, 0.1) && actual <= quantile(dist, 0.9)) within++;
  }
  return { errors, within, checked };
}

const short = (d: ISODate) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const METHOD = 'Method: the model described by Li et al. (J Am Med Inform Assoc, 2021) and Urteaga et al. (Proc Mach Learn Res, 2021). It learns from your own cycles, allows for forgotten logs, and updates every day you haven’t had a period.';
const TESTED = 'Who it was tested on: about 186,000 Clue app users aged 21–33 who were not using hormonal contraception. It was not tested for PCOS, thyroid conditions or contraception, and it is less exact when cycles vary a lot.';
const NOT = 'An estimate, not medical advice, and not for preventing or planning pregnancy. If something seems unusual, talk to your doctor.';

export function estimateNext(days: CycleDay[], today: ISODate): Estimate {
  const lengths = cycleLengths(days.filter((d) => d.date <= today)).filter((x) => x > 0 && x <= MAX_LEN).slice(-24);   // the last 24 cycles
  const now = cycleNow(days, today);
  if (lengths.length < MIN_CYCLES || !now.lastStart || !now.day) return { state: 'insufficient', about: [
    `An estimate of your next period appears once you have logged ${MIN_CYCLES} full cycles (from one period to the next). So far: ${lengths.length}.`,
    'It will always be a range, never an exact date.', METHOD, NOTE_TESTED(), NOT] };
  // If today is still inside the period, the next one can't start before the cycle's day after today.
  const dist = nextLengthDistribution(lengths, Math.max(now.day, 1) + (periods(days).some((p) => p.start === now.lastStart && p.end >= today) ? 1 : 0));
  const lo = quantile(dist, 0.1), hi = quantile(dist, 0.9), mid = quantile(dist, 0.5);
  const from = addDays(now.lastStart, lo), to = addDays(now.lastStart, hi), median = addDays(now.lastStart, mid);
  const record = trackRecord(lengths);
  const shortest = Math.min(...lengths), longest = Math.max(...lengths);
  return { state: 'range', from: from < today ? today : from, to, median, record, about: [
    `Next period likely ${short(from < today ? today : from)} – ${short(to)} (8 in 10 chance). It is a range because your cycles have varied from ${shortest} to ${longest} days.`,
    METHOD, TESTED,
    record.checked ? `Your track record: your last ${Math.min(4, record.checked)} estimates were within ${record.errors.slice(-4).join(', ')} days; ${record.within} of ${record.checked} past cycles started inside the range.` : 'Your track record appears after a few more cycles.',
    NOT] };
}
const NOTE_TESTED = () => TESTED;

/** Used by tests: days between two dates (re-exported for convenience). */
export { daysBetween };
