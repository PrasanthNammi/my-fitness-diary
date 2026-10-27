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
          <Star fill={isFav ? '#e0a800' : 'none'} color={isFav ? '#b8860b' : 'currentColor'} />
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
        <SelectField label="Meal" value={meal} options={MEALS.map((m) => ({ value: m.id, label: m.label }))} onChange={setMeal} />
        <div className="nutri-grid" aria-live="polite">
          <div><div className="v">{nut ? fmtInt(nut.kcal * eMul) : '—'}</div><div className="k">{energyUnit}</div></div>
          <div><div className="v">{nut ? fmtNum(nut.protein, 1) : '—'}</div><div className="k">Protein g</div></div>
          <div><div className="v">{nut ? fmtNum(nut.carbs, 1) : '—'}</div><div className="k">Carbs g</div></div>
          <div><div className="v">{nut ? fmtNum(nut.fat, 1) : '—'}</div><div className="k">Fat g</div></div>
        </div>
        {nut && (
          <div>
            {([['Sugars', nut.sugars], ['Saturates', nut.saturates], ['Fibre', nut.fibre], ['Salt', nut.salt]] as const).map(([k, v]) => (
              <div key={k} className="kv"><span className="k">{k}</span><span className="v">{v === null ? <span className="muted" title="Not on label">Not provided</span> : `${fmtNum(v, 1)} g`}</span></div>
            ))}
          </div>
        )}
        {food.ingredients && <div className="small muted"><span className="strong">Ingredients/allergens:</span> {food.ingredients}</div>}
      </div>
    </Sheet>
  );
}
