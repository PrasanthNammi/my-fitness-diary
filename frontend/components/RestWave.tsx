// The rest wave (Lovable design, rnr-reference src/components/restbar; the Android notification draws the same in
// RestTimer.kt): a soft glowing wave over the time left, a thin track for the time gone, and a haloed thumb. In the
// app it animates at full frame rate and the thumb moves continuously; with "reduce motion" it stays still.
import { useEffect, useId, useRef, useState } from 'react';

const H = 20, CY = 12, TRACK = 3, THUMB_R = 6, MAX_H = 8;

/** Wave height above the centre line at x (0..w), time t (s); tapers to 0 at both ends. */
export function waveHeight(x: number, w: number, t: number, maxH = MAX_H) {
  if (w <= 0) return 0;
  const u = Math.min(1, Math.max(0, x / w));
  const envelope = Math.sin(Math.PI * u) ** 0.8;
  const a = Math.sin(x * 0.045 - t * 1.6) * 0.5 + 0.5;
  const b = Math.sin(x * 0.11 + t * 1.1 + 1.3) * 0.5 + 0.5;
  const c = Math.sin(x * 0.023 - t * 0.7 + 2.1) * 0.5 + 0.5;
  return maxH * envelope * (0.15 + 0.5 * a * c + 0.35 * b * b);
}
function wavePath(w: number, t: number, scale: number) {
  if (w <= 1) return '';
  let d = `M0 ${CY}`;
  for (let x = 0; x <= w; x += 2) d += ` L${x.toFixed(1)} ${(CY - waveHeight(x, w, t) * scale).toFixed(2)}`;
  return `${d} L${w.toFixed(1)} ${CY} Z`;
}
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The bar for a rest ending at `endsAt` (ms) that lasts `totalSec`. */
export function RestWave({ endsAt, totalSec }: { endsAt: number; totalSec: number }) {
  const id = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  const [frame, setFrame] = useState(() => ({ now: Date.now(), t: 0 }));
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(80, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (still()) { const i = setInterval(() => setFrame({ now: Date.now(), t: 0 }), 1000); return () => clearInterval(i); }
    let raf = 0; const start = performance.now();
    const tick = (ms: number) => { setFrame({ now: Date.now(), t: (ms - start) / 1000 }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const p = Math.min(1, Math.max(0, (endsAt - frame.now) / 1000 / Math.max(1, totalSec)));
  const pad = THUMB_R + 2, fw = p * (W - pad * 2), tx = pad + fw, t = frame.t;
  return (
    <div ref={box} className="rest-wave" aria-hidden="true">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id={`f${id}`} x1="0" x2="1"><stop offset="0" stopColor="var(--rw-accent)" stopOpacity="0.55" /><stop offset="1" stopColor="var(--rw-accent-hi)" /></linearGradient>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--rw-accent)" stopOpacity="0" /><stop offset="1" stopColor="var(--rw-accent)" stopOpacity="var(--rw-glow)" /></linearGradient>
          <radialGradient id={`t${id}`}><stop offset="0" stopColor="var(--rw-accent)" stopOpacity="var(--rw-glow)" /><stop offset="1" stopColor="var(--rw-accent)" stopOpacity="0" /></radialGradient>
        </defs>
        <line x1={tx} y1={CY} x2={W - pad} y2={CY} stroke="var(--rw-track)" strokeWidth={TRACK} strokeLinecap="round" />
        <g transform={`translate(${pad} 0)`}>
          <path d={wavePath(fw, t, 1.35)} fill={`url(#g${id})`} />
          <path d={wavePath(fw, t * 0.8 + 3, 0.75)} fill={`url(#f${id})`} opacity="0.45" />
          <path d={wavePath(fw, t, 1)} fill={`url(#f${id})`} opacity="0.85" />
          {fw > 0 && <line x1={0} y1={CY} x2={fw} y2={CY} stroke="var(--rw-accent)" strokeWidth={TRACK} strokeLinecap="round" />}
        </g>
        <circle cx={tx} cy={CY} r={THUMB_R + 4} fill={`url(#t${id})`} />
        <circle cx={tx} cy={CY} r={THUMB_R} fill="var(--rw-accent)" />
        <circle cx={tx} cy={CY} r={THUMB_R - 2.5} fill="var(--rw-core)" opacity="0.9" />
      </svg>
    </div>
  );
}
