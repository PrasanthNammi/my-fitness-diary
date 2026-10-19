import { useMemo, useState } from 'react';

export interface Pt { x: number; y: number; label?: string }

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Responsive line chart with tap-to-inspect. Units are shown in the axis label. */
export function LineChart({
  points, unit, format = (v) => v.toFixed(1), height = 180, label,
}: { points: Pt[]; unit: string; format?: (v: number) => string; height?: number; label: string }) {
  const W = 340;
  const H = height;
  const pad = { l: 40, r: 10, t: 20, b: 24 };
  const [sel, setSel] = useState<number | null>(null);
  const { ticks, xs, ys, minX, maxX } = useMemo(() => {
    const yv = points.map((p) => p.y);
    const ticks = niceTicks(Math.min(...yv), Math.max(...yv));
    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const xs = points.map((p) => pad.l + (maxX === minX ? 0.5 : (p.x - minX) / (maxX - minX)) * (W - pad.l - pad.r));
    const ys = points.map((p) => pad.t + (1 - (p.y - lo) / (hi - lo || 1)) * (H - pad.t - pad.b));
    return { ticks, xs, ys, minX, maxX };
  }, [points, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const yOf = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const s = sel !== null && sel < points.length ? sel : points.length - 1;

  const pick = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    xs.forEach((v, i) => Math.abs(v - x) < Math.abs(xs[best] - x) && (best = i));
    setSel(best);
  };

  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-tip tnum" aria-live="polite">
        <span className="strong">{format(points[s].y)} {unit}</span> <span className="muted">· {points[s].label ?? fmtDate(points[s].x)}</span>
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}. ${points.length} points from ${fmtDate(minX)} to ${fmtDate(maxX)}. Latest ${format(points[points.length - 1].y)} ${unit}.`}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        style={{ touchAction: 'pan-y' }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={yOf(t)} y2={yOf(t)} />
            <text x={pad.l - 6} y={yOf(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        <text x={pad.l - 6} y={10} textAnchor="end">{unit}</text>
        <text x={pad.l} y={H - 6}>{fmtDate(minX)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end">{fmtDate(maxX)}</text>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 40 && xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="var(--accent)" />)}
        <line x1={xs[s]} x2={xs[s]} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" strokeDasharray="3 3" />
        <circle cx={xs[s]} cy={ys[s]} r="5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
      </svg>
    </figure>
  );
}

export function BarChart({
  bars, unit, format = (v) => Math.round(v).toLocaleString(), height = 180, label,
}: { bars: { label: string; value: number }[]; unit: string; format?: (v: number) => string; height?: number; label: string }) {
  const W = 340;
  const H = height;
  const pad = { l: 44, r: 6, t: 20, b: 24 };
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.value), 1);
  const ticks = niceTicks(0, max).filter((t) => t >= 0);
  const hi = ticks[ticks.length - 1] || 1;
  const bw = (W - pad.l - pad.r) / bars.length;
  const y = (v: number) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const s = sel !== null && sel < bars.length ? sel : bars.length - 1;
  const short = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  return (
    <figure style={{ margin: 0 }}>
      <div className="chart-tip tnum" aria-live="polite">
        <span className="strong">{format(bars[s].value)} {unit}</span> <span className="muted">· {bars[s].label}</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${bars.map((b) => `${b.label}: ${format(b.value)} ${unit}`).join('; ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">{short(t)}</text>
          </g>
        ))}
        {bars.map((b, i) => (
          <g key={i} onPointerDown={() => setSel(i)} style={{ cursor: 'pointer' }}>
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
            <rect
              x={pad.l + i * bw + bw * 0.18}
              y={y(b.value)}
              width={bw * 0.64}
              height={Math.max(0, H - pad.b - y(b.value))}
              rx="3"
              fill={i === s ? 'var(--accent)' : '#9fcfb4'}
            />
          </g>
        ))}
        <text x={pad.l - 6} y={10} textAnchor="end">{unit}</text>
        <text x={pad.l} y={H - 6}>{bars[0].label}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end">{bars[bars.length - 1].label}</text>
      </svg>
    </figure>
  );
}
