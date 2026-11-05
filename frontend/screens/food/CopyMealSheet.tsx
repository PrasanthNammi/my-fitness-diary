import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import type { DiaryEntry, Meal } from '../../domain/types';
import { Notice, Segmented, Sheet, toast } from '../../components/ui';
import { MEALS } from '../../data/selectors';
import { diary } from '../../data/repositories';
import { addDays, dayLabel, todayISO } from '../../lib/format';

type Day = 'yesterday' | 'today' | 'tomorrow' | 'other';

/** Copy some or all foods of a meal to another day and/or meal. */
export function CopyMealSheet({ entries, meal, date, onClose }: { entries: DiaryEntry[]; meal: Meal | null; date: string; onClose: () => void }) {
  const today = todayISO();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [day, setDay] = useState<Day>('today');
  const [other, setOther] = useState(date);
  const [target, setTarget] = useState<Meal>('breakfast');
  // Default: the same meal, on the next day after the one being viewed (e.g. today's breakfast → tomorrow).
  useEffect(() => {
    if (!meal) return;
    setPicked(new Set(entries.map((e) => e.id)));
    const next = addDays(date, 1);
    setDay(next === addDays(today, -1) ? 'yesterday' : next === today ? 'today' : next === addDays(today, 1) ? 'tomorrow' : 'other');
    setOther(next);
    setTarget(meal);
  }, [meal]); // eslint-disable-line react-hooks/exhaustive-deps

  const toDate = day === 'yesterday' ? addDays(today, -1) : day === 'today' ? today : day === 'tomorrow' ? addDays(today, 1) : other;
  const chosen = entries.filter((e) => picked.has(e.id));
  const sameSlot = toDate === date && target === meal;
  const label = MEALS.find((m) => m.id === meal)?.label ?? '';
  const toggle = (id: string) => setPicked((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const all = chosen.length === entries.length;

  const copy = () => {
    if (!chosen.length || sameSlot || !toDate) return;
    diary.copy(chosen, toDate, target);
    toast(`Copied ${chosen.length} ${chosen.length === 1 ? 'food' : 'foods'} to ${MEALS.find((m) => m.id === target)?.label} · ${dayLabel(toDate)}`);
    onClose();
  };

  return (
    <Sheet open={!!meal} onClose={onClose} title={`Copy ${label}`}>
      <div className="stack copy-meal">
        <div>
          <label className="copy-meal-row strong">
            <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = !all && chosen.length > 0; }} onChange={() => setPicked(all ? new Set() : new Set(entries.map((e) => e.id)))} />
            All foods
          </label>
          {entries.map((e) => (
            <label key={e.id} className="copy-meal-row">
              <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
              <span className="ellipsis">{e.food.name}</span>
            </label>
          ))}
        </div>
        <div className="field">
          <span className="label">Copy to day</span>
          <Segmented label="Copy to day" value={day} onChange={setDay} options={[{ value: 'yesterday', label: 'Yesterday' }, { value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'other', label: 'Date' }]} />
          {day === 'other' && <input className="input" type="date" aria-label="Copy to date" value={other} onChange={(e) => setOther(e.target.value)} style={{ marginTop: 8 }} />}
        </div>
        <div className="field">
          <span className="label">Copy to meal</span>
          <Segmented label="Copy to meal" value={target} onChange={setTarget} options={MEALS.map((m) => ({ value: m.id, label: m.label }))} />
        </div>
        {sameSlot && <Notice tone="warn">That’s the same day and meal. Choose a different day or meal.</Notice>}
        <button className="btn btn-primary btn-block" disabled={!chosen.length || sameSlot || !toDate} onClick={copy}>
          <Copy /> Copy {chosen.length} {chosen.length === 1 ? 'food' : 'foods'}
        </button>
      </div>
    </Sheet>
  );
}
