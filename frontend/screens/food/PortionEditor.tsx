import { useEffect, useMemo, useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import type { Food, Meal, PortionUnit } from '../../domain/types';
import { allowedUnits, nutrientsFor } from '../../domain/nutrition';
import { Field, SelectField, Sheet } from '../../components/ui';
import { MEALS } from '../../data/selectors';
import { useDB } from '../../data/store';
import { foods } from '../../data/repositories';
import { fmtNum, fmtInt, parseDecimal } from '../../lib/format';

export const unitLabel = (food: Food, u: PortionUnit) => (u === 'serving' ? (food.servingLabel ? `Serving (${food.servingLabel})` : 'Serving') : u === 'g' ? 'Grams (g)' : 'Millilitres (ml)');

export function refText(f: Food): string {
  const ref = f.refUnit === 'serving' ? `per ${f.servingLabel ?? 'serving'}` : `per ${f.refAmount} ${f.refUnit}`;
  return `${fmtInt(f.kcal)} kcal ${ref}`;
}

/** Share of macro energy (protein and carbs 4 kcal/g, fat 9), in percent. */
function macroShare(n: { protein: number; carbs: number; fat: number }) {
  const p = n.protein * 4, c = n.carbs * 4, f = n.fat * 9, sum = p + c + f || 1;
  return { protein: (p / sum) * 100, carbs: (c / sum) * 100, fat: (f / sum) * 100 };
}

export function PortionEditor({
  open, onClose, food, initial, onSubmit, onDelete, submitLabel,
}: {
  open: boolean;
  onClose: () => void;
  food: Food | null;
  initial: { amount: number; unit: PortionUnit; meal: Meal } | null;
  onSubmit: (v: { amount: number; unit: PortionUnit; meal: Meal }) => void;
  onDelete?: () => void;
  submitLabel: string;
}) {
  const favs = useDB((d) => d.favouriteFoodIds);
  const energyUnit = useDB((d) => d.settings.energyUnit);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<PortionUnit>('g');
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open || !food || !initial) return;
    setAmount(String(initial.amount));
    setUnit(initial.unit);
    setMeal(initial.meal);
    setTried(false);
  }, [open, food, initial]);

  const n = parseDecimal(amount);
  const err = n === null ? 'Enter an amount.' : n <= 0 ? 'Amount must be more than 0.' : n > 5000 ? 'That amount looks too large.' : null;
  const nut = useMemo(() => (food && n && n > 0 ? nutrientsFor(food, n, unit) : null), [food, n, unit]);
  if (!food) return null;
  const units = allowedUnits(food);
  const isFav = favs.includes(food.id);
  const eMul = energyUnit === 'kJ' ? 4.184 : 1;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={food.name}
      headerActions={
        <button className="icon-btn" aria-pressed={isFav} aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'} onClick={() => foods.toggleFavourite(food.id, food)}>
          <Star fill={isFav ? 'var(--pr)' : 'none'} color={isFav ? 'var(--pr-text)' : 'currentColor'} />
        </button>
      }
      footer={
        <>
          {onDelete && <button className="btn btn-danger" style={{ flex: 'none' }} aria-label="Delete entry" onClick={onDelete}><Trash2 /></button>}
          <button className="btn btn-primary" onClick={() => {
            setTried(true);
            if (err || n === null) return;
            onSubmit({ amount: n, unit, meal });
          }}>{submitLabel}</button>
        </>
      }
    >
      <div className="stack">
        <div className="small muted">{food.brand ?? (food.origin === 'custom' ? 'My food' : 'Generic')} · {refText(food)}</div>
        <div className="input-group">
          <Field label="Amount" htmlFor="pe-amount" error={tried ? err : null}>
            <input id="pe-amount" className="input tnum" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={tried && !!err} data-autofocus onFocus={(e) => e.target.select()} />
          </Field>
          <SelectField
            label="Unit"
            value={unit}
            options={units.map((u) => ({ value: u, label: u === 'serving' ? 'serving' : u, hint: unitLabel(food, u) }))}
            onChange={(u) => {
              if (u === unit) return;
              // Keep the same quantity of food when switching unit.
              if (n && food.servingSize) {
                const next = u === 'serving' ? n / food.servingSize : n * food.servingSize;
                setAmount(String(Math.round(next * 100) / 100));
              }
              setUnit(u);
            }}
          />
        </div>
        <div className="field">
          <span className="label" id="pe-meal">Meal</span>
          <div className="meal-choice" role="group" aria-labelledby="pe-meal">
            {MEALS.map((m) => <button key={m.id} type="button" aria-pressed={meal === m.id} onClick={() => setMeal(m.id)}>{m.label}</button>)}
          </div>
        </div>
        <div className="portion-nutrition" aria-live="polite">
          <div className="portion-ring" style={{ ['--p' as string]: nut ? `${macroShare(nut).protein}` : '0', ['--c' as string]: nut ? `${macroShare(nut).carbs}` : '0' }}>
            <div className="portion-ring-inner"><b className="tnum">{nut ? fmtInt(nut.kcal * eMul) : '—'}</b><span>{energyUnit}</span></div>
          </div>
          <div className="portion-macros">
            {([['Protein', nut?.protein, 'var(--protein)', nut ? macroShare(nut).protein : null], ['Carbs', nut?.carbs, 'var(--carbs)', nut ? macroShare(nut).carbs : null], ['Fat', nut?.fat, 'var(--fat)', nut ? macroShare(nut).fat : null], ['Fibre', nut?.fibre, 'var(--fibre)', null]] as const).map(([k, v, color, pct]) => (
              <div key={k}><i style={{ background: color }} /><span className="grow">{k}</span><b className="tnum">{v == null ? '—' : `${fmtNum(v, 1)} g`}</b><small className="tnum">{pct == null ? '' : `${Math.round(pct)}%`}</small></div>
            ))}
          </div>
        </div>
        {nut && (
          <div className="portion-extra">
            {([['Sugars', nut.sugars], ['Saturates', nut.saturates], ['Salt', nut.salt]] as const).map(([k, v]) => (
              <div key={k} className="kv"><span className="k">{k}</span><span className="v tnum">{v === null ? <span className="muted" title="Not on the label">—</span> : `${fmtNum(v, 1)} g`}</span></div>
            ))}
          </div>
        )}
        {food.ingredients && <div className="small muted"><span className="strong">Ingredients/allergens:</span> {food.ingredients}</div>}
      </div>
    </Sheet>
  );
}
