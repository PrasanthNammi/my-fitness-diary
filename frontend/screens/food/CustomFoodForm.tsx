import { useEffect, useMemo, useState } from 'react';
import type { Food, RefUnit } from '../../domain/types';
import { kjToKcal } from '../../domain/nutrition';
import { Field, Notice, Segmented, Sheet } from '../../components/ui';
import { foods } from '../../data/repositories';
import { fmtInt, parseDecimal, uid } from '../../lib/format';
import { isValidBarcode } from '../../adapters/barcode';

type Draft = Record<
  'name' | 'brand' | 'barcode' | 'refAmount' | 'servingSize' | 'servingLabel' | 'energy' | 'protein' | 'carbs' | 'fat' | 'sugars' | 'saturates' | 'fibre' | 'salt' | 'ingredients',
  string
> & { refUnit: RefUnit; energyUnit: 'kcal' | 'kJ' };

const blank = (barcode = ''): Draft => ({
  name: '', brand: '', barcode, refAmount: '100', refUnit: 'g', servingSize: '', servingLabel: '',
  energy: '', energyUnit: 'kcal', protein: '', carbs: '', fat: '', sugars: '', saturates: '', fibre: '', salt: '', ingredients: '',
});

const fromFood = (f: Food): Draft => ({
  name: f.name, brand: f.brand ?? '', barcode: f.barcode ?? '', refAmount: String(f.refAmount), refUnit: f.refUnit,
  servingSize: f.servingSize === null ? '' : String(f.servingSize), servingLabel: f.servingLabel ?? '',
  energy: String(f.kcal), energyUnit: 'kcal', protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat),
  sugars: f.sugars === null ? '' : String(f.sugars), saturates: f.saturates === null ? '' : String(f.saturates),
  fibre: f.fibre === null ? '' : String(f.fibre), salt: f.salt === null ? '' : String(f.salt), ingredients: f.ingredients ?? '',
});

/** Create or edit a product from its nutrition label. Blank optional fields stay "not provided", distinct from 0. */
export function CustomFoodForm({
  open, onClose, editing, barcode, onSaved,
}: { open: boolean; onClose: () => void; editing?: Food | null; barcode?: string; onSaved: (f: Food) => void }) {
  const [d, setD] = useState<Draft>(blank());
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) {
      setD(editing ? fromFood(editing) : blank(barcode ?? ''));
      setTried(false);
    }
  }, [open, editing, barcode]);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const num = (s: string) => parseDecimal(s);
  const req = (s: string, label: string, max = 100000) => {
    const v = num(s);
    if (s.trim() === '') return `Enter ${label}.`;
    if (v === null || v < 0) return 'Enter a number of 0 or more.';
    if (v > max) return 'That value looks too large.';
    return null;
  };
  const opt = (s: string) => (s.trim() === '' ? null : num(s) === null || num(s)! < 0 ? 'Enter a number of 0 or more, or leave blank.' : null);

  const errors = useMemo(() => {
    const macroMax = d.refUnit === 'serving' ? 1000 : Number(d.refAmount) || 1000;
    const e: Partial<Record<keyof Draft, string | null>> = {
      name: !d.name.trim() ? 'Enter a product name.' : null,
      barcode: d.barcode.trim() && !isValidBarcode(d.barcode) ? 'Barcodes have 8, 12, 13 or 14 digits.' : null,
      refAmount: d.refUnit === 'serving' ? null : req(d.refAmount, 'the reference amount', 1000) ?? (num(d.refAmount) === 0 ? 'Must be more than 0.' : null),
      servingSize: opt(d.servingSize),
      energy: req(d.energy, 'energy'),
      protein: req(d.protein, 'protein', macroMax),
      carbs: req(d.carbs, 'carbohydrate', macroMax),
      fat: req(d.fat, 'fat', macroMax),
      sugars: opt(d.sugars),
      saturates: opt(d.saturates),
      fibre: opt(d.fibre),
      salt: opt(d.salt),
    };
    const p = num(d.protein) ?? 0, c = num(d.carbs) ?? 0, f = num(d.fat) ?? 0;
    if (!e.protein && !e.carbs && !e.fat && d.refUnit !== 'serving' && p + c + f > (num(d.refAmount) ?? 100) * 1.01)
      e.fat = 'Protein, carbs and fat add up to more than the reference amount.';
    return e;
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = Object.values(errors).every((v) => !v);

  const kcal = num(d.energy) === null ? null : d.energyUnit === 'kJ' ? kjToKcal(num(d.energy)!) : num(d.energy)!;
  const macroKcal = (num(d.protein) ?? 0) * 4 + (num(d.carbs) ?? 0) * 4 + (num(d.fat) ?? 0) * 9;
  const mismatch = kcal !== null && kcal > 20 && Math.abs(macroKcal - kcal) / kcal > 0.25;

  const save = async () => {
    setTried(true);
    if (!valid || kcal === null) return;
    const ov = (s: string) => (s.trim() === '' ? null : num(s));
    const f: Food = {
      id: editing?.id ?? `custom:${uid()}`,
      name: d.name.trim(),
      brand: d.brand.trim() || null,
      barcode: d.barcode.trim() || null,
      origin: 'custom',
      refAmount: d.refUnit === 'serving' ? 1 : num(d.refAmount)!,
      refUnit: d.refUnit,
      servingSize: d.refUnit === 'serving' ? null : ov(d.servingSize),
      servingLabel: d.servingLabel.trim() || null,
      kcal: Math.round(kcal * 10) / 10,
      protein: num(d.protein)!,
      carbs: num(d.carbs)!,
      fat: num(d.fat)!,
      sugars: ov(d.sugars),
      saturates: ov(d.saturates),
      fibre: ov(d.fibre),
      salt: ov(d.salt),
      ingredients: d.ingredients.trim() || null,
    };
    try { const saved = await foods.saveCustom(f); onSaved(saved); } catch(error){ window.alert((error as Error).message); }
  };

  const E = (k: keyof Draft) => (tried ? errors[k] ?? null : null);
  const numInput = (k: keyof Draft, label: string, suffix: string, optional = false) => (
    <Field label={label} htmlFor={`cf-${k}`} error={E(k)} hint={optional ? 'Optional' : undefined}>
      <div className="with-suffix">
        <input id={`cf-${k}`} className="input tnum" inputMode="decimal" value={d[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<Draft>)} aria-invalid={!!E(k)} />
        <span className="suffix">{suffix}</span>
      </div>
    </Field>
  );
  const refLabel = d.refUnit === 'serving' ? '1 serving' : `${d.refAmount || '…'} ${d.refUnit}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit food' : 'New food'}
      size="wide"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save food</button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name" htmlFor="cf-name" error={E('name')}>
          <input id="cf-name" className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!E('name')} />
        </Field>
        <div className="grid-2">
          <Field label="Brand" htmlFor="cf-brand" hint="Optional">
            <input id="cf-brand" className="input" value={d.brand} onChange={(e) => set({ brand: e.target.value })} />
          </Field>
          <Field label="Barcode" htmlFor="cf-barcode" error={E('barcode')} hint="Optional">
            <input id="cf-barcode" className="input tnum" inputMode="numeric" value={d.barcode} onChange={(e) => set({ barcode: e.target.value.replace(/\D/g, '') })} />
          </Field>
        </div>

        <div className="field">
          <span className="label">Nutrition values are per</span>
          <Segmented label="Reference unit" value={d.refUnit} onChange={(u) => set({ refUnit: u })} options={[{ value: 'g', label: 'g' }, { value: 'ml', label: 'ml' }, { value: 'serving', label: 'Serving' }]} />
        </div>
        {d.refUnit !== 'serving' ? (
          <div className="grid-2">
            {numInput('refAmount', 'Reference amount', d.refUnit)}
            {numInput('servingSize', 'Serving size', d.refUnit, true)}
          </div>
        ) : null}
        <Field label="Serving name" htmlFor="cf-sl" hint="Optional, e.g. 1 bar">
          <input id="cf-sl" className="input" value={d.servingLabel} onChange={(e) => set({ servingLabel: e.target.value })} />
        </Field>

        <div className="label" style={{ marginTop: 4 }}>Per {refLabel}</div>
        <div className="input-group">
          <Field label="Energy" htmlFor="cf-energy" error={E('energy')}>
            <input id="cf-energy" className="input tnum" inputMode="decimal" value={d.energy} onChange={(e) => set({ energy: e.target.value })} aria-invalid={!!E('energy')} />
          </Field>
          <div className="field">
            <span className="label">Unit</span>
            <Segmented label="Energy unit" value={d.energyUnit} onChange={(u) => set({ energyUnit: u })} options={[{ value: 'kcal', label: 'kcal' }, { value: 'kJ', label: 'kJ' }]} />
          </div>
        </div>
        {d.energyUnit === 'kJ' && kcal !== null && <div className="small muted">= {fmtInt(kcal)} kcal</div>}
        <div className="grid-3">
          {numInput('protein', 'Protein', 'g')}
          {numInput('carbs', 'Carbs', 'g')}
          {numInput('fat', 'Fat', 'g')}
        </div>
        {mismatch && <Notice tone="warn">Energy doesn’t match the macros (≈{fmtInt(macroKcal)} kcal). Check the label.</Notice>}
        <div className="grid-2">
          {numInput('sugars', 'Sugars', 'g', true)}
          {numInput('saturates', 'Saturates', 'g', true)}
          {numInput('fibre', 'Fibre', 'g', true)}
          {numInput('salt', 'Salt', 'g', true)}
        </div>
        <p className="xs muted" style={{ margin: 0 }}>Leave optional values blank if they aren’t on the label. Enter 0 only when the label says 0.</p>
        <Field label="Ingredients / allergens" htmlFor="cf-ing" hint="Optional">
          <textarea id="cf-ing" className="textarea" value={d.ingredients} onChange={(e) => set({ ingredients: e.target.value })} />
        </Field>
        {tried && !valid && <Notice tone="error">Check the highlighted fields.</Notice>}
      </div>
    </Sheet>
  );
}
