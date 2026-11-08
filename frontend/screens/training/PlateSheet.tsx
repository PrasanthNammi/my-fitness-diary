import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Sheet } from '../../components/ui';
import { useDB } from '../../data/store';
import { loadBar, PLATE_CHOICES, plateSetup } from '../../domain/plates';
import { profileRepo } from '../../data/repositories';
import { fmtNum, kgTo, parseDecimal } from '../../lib/format';

// The usual competition colours for kg plates (25 red, 20 blue, 15 yellow, 10 green, 5 white); others grey.
const KG_COLOURS: Record<number, string> = { 25: '#e5484d', 20: '#3b82f6', 15: '#eab308', 10: '#22a35a', 5: '#f4f2ee', 2.5: '#1f2937', 2: '#3b82f6', 1.25: '#9ca3af', 1: '#22a35a', 0.5: '#9ca3af' };
const BARS = { kg: [20, 15, 10], lb: [45, 35, 25] } as const;
const colour = (plate: number, unit: string) => (unit === 'kg' ? KG_COLOURS[plate] : undefined) ?? 'var(--brand)';

/** Plates for each side of the bar, for a weight (in kg) that can be changed here without touching the set. */
export function PlateSheet({ open, onClose, weightKg }: { open: boolean; onClose: () => void; weightKg: number | null }) {
  const settings = useDB((d) => d.settings);
  const setup = plateSetup(settings), unit = setup.unit;
  const step = unit === 'kg' ? 2.5 : 5;
  const start = () => (weightKg != null && weightKg > 0 ? Math.round(kgTo(weightKg, unit) * 100) / 100 : setup.bar);
  const [text, setText] = useState(String(start()));
  useEffect(() => { if (open) setText(String(start())); }, [open, weightKg, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = parseDecimal(text) ?? 0;
  const r = loadBar(target, setup);
  const max = Math.max(...setup.plates, 1);
  const nudge = (d: number) => setText(String(Math.max(0, Math.round((target + d) / step) * step)));
  // Bar and plates are saved for the weight unit in use (same setting as Settings → Units & workout).
  const save = (next: { bar?: number; plates?: number[] }) => profileRepo.updateSettings({ plates: { unit, bar: next.bar ?? setup.bar, plates: next.plates ?? setup.plates } });
  const toggle = (p: number) => { const has = setup.plates.includes(p); if (has && setup.plates.length === 1) return; save({ plates: has ? setup.plates.filter((x) => x !== p) : [...setup.plates, p] }); };
  const plates = r.perSide.flatMap((p) => Array.from({ length: p.count }, () => p.plate));
  return (
    <Sheet open={open} onClose={onClose} title="Plates">
      <div className="plate-sheet">
        <div className="plate-target">
          <button type="button" className="icon-btn" aria-label={`Minus ${step} ${unit}`} onClick={() => nudge(-step)}><Minus /></button>
          <label className="plate-input"><input className="input tnum" inputMode="decimal" aria-label={`Total weight in ${unit}`} value={text} onChange={(e) => setText(e.target.value)} /><span>{unit}</span></label>
          <button type="button" className="icon-btn" aria-label={`Plus ${step} ${unit}`} onClick={() => nudge(step)}><Plus /></button>
        </div>
        <div className="plate-bar" role="img" aria-label={r.perSide.length ? `Each side: ${r.perSide.map((p) => `${p.count} × ${fmtNum(p.plate, 2)} ${unit}`).join(', ')}` : 'Empty bar'}>
          {[...plates].reverse().map((p, i) => <i key={'l' + i} style={{ height: `${38 + (p / max) * 62}%`, background: colour(p, unit) }} />)}
          <b />
          {plates.map((p, i) => <i key={'r' + i} style={{ height: `${38 + (p / max) * 62}%`, background: colour(p, unit) }} />)}
        </div>
        {r.underBar ? <p className="plate-status">Below the bar · {fmtNum(setup.bar, 2)} {unit}</p> : r.perSide.length === 0 ? <p className="plate-status">Empty bar</p> : (
          <div className="plate-list" aria-label="Each side">
            {r.perSide.map((p) => <span key={p.plate} className="plate-chip"><i style={{ background: colour(p.plate, unit) }} aria-hidden="true" /><strong className="tnum">{fmtNum(p.plate, 2)}</strong><small>{unit}</small><em>× {p.count}</em></span>)}
          </div>
        )}
        {r.short > 0 && !r.underBar && <p className="plate-short tnum">Loaded {fmtNum(r.loaded, 2)} {unit}</p>}
        <span className="eyebrow">Bar</span>
        <div className="plate-choices" role="group" aria-label="Bar weight">
          {[...new Set([...BARS[unit], setup.bar])].sort((a, b) => b - a).map((b) => <button key={b} type="button" className="chip" aria-pressed={setup.bar === b} onClick={() => save({ bar: b })}>{fmtNum(b, 2)} {unit}</button>)}
        </div>
        <span className="eyebrow">Available plates</span>
        <div className="plate-choices" role="group" aria-label={`Plates you have (${unit})`}>
          {PLATE_CHOICES[unit].map((p) => <button key={p} type="button" className="chip" aria-pressed={setup.plates.includes(p)} onClick={() => toggle(p)}>{fmtNum(p, 2)}</button>)}
        </div>
      </div>
    </Sheet>
  );
}
