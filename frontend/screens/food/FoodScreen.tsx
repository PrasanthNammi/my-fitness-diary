import {engine,openTool} from '../../adapters/engine';
import {foodIn} from '../../adapters/compat';
import {Camera,Flag} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Pencil, Plus, ScanBarcode, Search, SearchX, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import type { DiaryEntry, Food, Meal, PortionUnit } from '../../domain/types';
import { allowedUnits } from '../../domain/nutrition';
import { ConfirmSheet, Empty, OverflowMenu, Segmented, Sheet, TopBar, toast } from '../../components/ui';
import { DateStrip } from '../../components/DateStrip';
import { useDB } from '../../data/store';
import { entryNutrients, MEALS, useDay, useSelectedDate, useTargets } from '../../data/selectors';
import { diary, foods } from '../../data/repositories';
import { energyValue, fmtInt, fmtNum } from '../../lib/format';
import { PortionEditor, refText } from './PortionEditor';
import { CustomFoodForm } from './CustomFoodForm';
import { BarcodeSheet } from './BarcodeSheet';


function portionText(e: DiaryEntry) {
  if (e.unit === 'serving') {
    const label = e.food.servingLabel ?? 'serving';
    return e.amount === 1 ? label : `${fmtNum(e.amount, 2)} × ${label}`;
  }
  return `${fmtNum(e.amount, 1)} ${e.unit}`;
}

export function FoodScreen() {
  const date = useSelectedDate();
  const { byMeal, total } = useDay(date);
  const targets = useTargets();
  const eU = useDB((d) => d.settings.energyUnit);
  const [pickerMeal, setPickerMeal] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const t = targets?.targets;

  return (
    <>
      <TopBar title="Food" />
      <div className="screen">
        <DateStrip date={date} />
        {t && (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              <div className="stat"><div className="k">{eU}</div><div className="v">{fmtInt(energyValue(total.kcal, eU))}</div><div className="xs muted">of {fmtInt(energyValue(t.kcal, eU))}</div></div>
              <div className="stat"><div className="k">Protein</div><div className="v">{Math.round(total.protein)}</div><div className="xs muted">of {t.protein} g</div></div>
              <div className="stat"><div className="k">Carbs</div><div className="v">{Math.round(total.carbs)}</div><div className="xs muted">of {t.carbs} g</div></div>
              <div className="stat"><div className="k">Fat</div><div className="v">{Math.round(total.fat)}</div><div className="xs muted">of {t.fat} g</div></div>
            </div>
          </div>
        )}

        {MEALS.map((m) => {
          const list = byMeal[m.id];
          const kcal = list.reduce((n, e) => n + entryNutrients(e).kcal, 0);
          return (
            <section key={m.id} className="list meal" aria-label={m.label}>
              <div className="meal-head">
                <span className="t">{m.label}</span>
                <span className="k">{list.length ? `${fmtInt(energyValue(kcal, eU))} ${eU}` : ''}</span>
              </div>
              {list.map((e) => {
                const n = entryNutrients(e);
                return (
                  <button key={e.id} className="entry" onClick={() => setEditing(e)}>
                    <div className="grow">
                      <div className="row-title ellipsis">{e.food.name}</div>
                      <div className="row-sub ellipsis">{portionText(e)} · P {fmtNum(n.protein, 0)} · C {fmtNum(n.carbs, 0)} · F {fmtNum(n.fat, 0)}</div>
                    </div>
                    <span className="kc">{fmtInt(energyValue(n.kcal, eU))}</span>
                  </button>
                );
              })}
              <div className="meal-foot">
                <button className="btn btn-link" onClick={() => setPickerMeal(m.id)}><Plus size={18} /> Add Food</button>
              </div>
            </section>
          );
        })}
      </div>

      <FoodPicker meal={pickerMeal} date={date} onClose={() => setPickerMeal(null)} />
      <PortionEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        food={editing?.food ?? null}
        initial={editing ? { amount: editing.amount, unit: editing.unit, meal: editing.meal } : null}
        submitLabel="Update entry"
        onSubmit={(v) => {
          if (!editing) return;
          diary.updateEntry(editing.id, v);
          toast('Entry updated');
          setEditing(null);
        }}
        onDelete={() => {
          if (!editing) return;
          diary.remove(editing.id);
          toast('Entry removed');
          setEditing(null);
        }}
      />
    </>
  );
}

type Tab = 'all' | 'favourites' | 'mine';

function FoodPicker({ meal, date, onClose }: { meal: Meal | null; date: string; onClose: () => void }) {
  const custom = useDB((d) => d.customFoods);
  const favIds = useDB((d) => d.favouriteFoodIds);
  const entries = useDB((d) => d.diary);
  const [q, setQ] = useState('');const [remote,setRemote]=useState<Food[]>([]);const [lastSearch,setLastSearch]=useState(0);async function searchOnline(){if(q.trim().length<3||Date.now()-lastSearch<6500)return;setLastSearch(Date.now());try{setRemote((await engine().searchFood(q)).filter((p:any)=>!p.incomplete).map(foodIn))}catch{toast('Offline')}}
  const [tab, setTab] = useState<Tab>('all');
  const [chosen, setChosen] = useState<Food | null>(null);
  const [formOpen, setFormOpen] = useState<{ editing?: Food; barcode?: string } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [deleting, setDeleting] = useState<Food | null>(null);
  const open = meal !== null;
  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? '';

  const all = useMemo(() => [...custom,...remote.filter(p=>!custom.some(x=>x.barcode&&x.barcode===p.barcode))], [custom,remote]);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: Food[] = [];
    [...entries].filter((e) => e.meal === meal).sort((a, b) => b.createdAt - a.createdAt).forEach((e) => {
      if (seen.has(e.food.id) || out.length >= 5) return;
      seen.add(e.food.id);
      out.push(all.find((f) => f.id === e.food.id) ?? e.food);
    });
    return out;
  }, [entries, meal, all]);

  const list = useMemo(() => {
    const base = tab === 'all' ? all : tab === 'mine' ? custom.filter((f:any)=>f.sharedId?f.creatorId===engine()?.peek().user?.id:!f.source) : favIds.map((id) => all.find((f) => f.id === id)).filter((f): f is Food => !!f);
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return base.filter((f) => terms.every((t) => `${f.name} ${f.brand ?? ''} ${f.barcode ?? ''}`.toLowerCase().includes(t)));
  }, [tab, all, custom, favIds, q]);

  const close = () => {
    setQ('');
    setTab('all');
    onClose();
  };

  const defaultPortion = (f: Food): { amount: number; unit: PortionUnit } =>
    allowedUnits(f).includes('serving') && f.servingSize ? { amount: 1, unit: 'serving' } : f.refUnit === 'serving' ? { amount: 1, unit: 'serving' } : { amount: 100, unit: f.refUnit };

  const renderRow = (f: Food, key: string) => {
    const fav = favIds.includes(f.id);
    return (
      <div className="food-row" key={key}>
        <button className="main-btn" onClick={() => (f as any).incomplete?setFormOpen({barcode:f.barcode||undefined}):setChosen(f)}>
          <span className="nm ellipsis">{f.name}</span>
          <span className="mt ellipsis">{f.brand ?? (f.origin === 'custom' ? 'My food' : 'Generic')} · {refText(f)}</span>
        </button>
        <button className="icon-btn" aria-pressed={fav} aria-label={fav ? `Remove ${f.name} from favourites` : `Add ${f.name} to favourites`} onClick={() => foods.toggleFavourite(f.id)}>
          <Star fill={fav ? '#e0a800' : 'none'} color={fav ? '#b8860b' : 'currentColor'} />
        </button>
        {f.origin === 'custom' && (!(f as any).sharedId||(f as any).creatorId===engine()?.peek().user?.id) && (
          <OverflowMenu small title={f.name} label={`Options for ${f.name}`} actions={[
            { label: 'Edit food', icon: Pencil, onSelect: () => setFormOpen({ editing: f }) },
            ...((f as any).sharedId?[{ label:'Photos',icon:Camera,onSelect:()=>openTool('photo',(f as any).sharedId)}]:[{ label: 'Delete', icon: Trash2, onSelect: () => setDeleting(f), danger: true }]),
          ]} />
        )}
        {(f as any).sharedId&&(f as any).creatorId!==engine()?.peek().user?.id&&<button className="icon-btn" aria-label="Report" onClick={()=>openTool('report',(f as any).sharedId)}><Flag/></button>}
      </div>
    );
  };

  return (
    <>
      <Sheet open={open} onClose={close} size="full" title={`Add to ${mealLabel}`}>
        <div style={{ position: 'sticky', top: -4, background: 'var(--surface)', zIndex: 2, paddingBottom: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <label className="search">
              <Search />
              <input type="search" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search foods" />
            </label>
            <button className="icon-btn" aria-label="Search" onClick={searchOnline}><Search/></button><button className="icon-btn" style={{ background: 'var(--field)' }} aria-label="Scan barcode" onClick={() => setScanOpen(true)}><ScanBarcode /></button>
            <button className={`icon-btn${tab === 'favourites' ? ' active' : ''}`} style={{ background: 'var(--field)' }} aria-label="Show favourites" aria-pressed={tab === 'favourites'} onClick={() => setTab(tab === 'favourites' ? 'all' : 'favourites')}>
              <Star fill={tab === 'favourites' ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <Segmented label="Food list" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All Foods' }, { value: 'favourites', label: 'Favourites' }, { value: 'mine', label: 'My Foods' }]} />
          </div>
        </div>

        {tab === 'all' && !q && recent.length > 0 && (
          <>
            <div className="label" style={{ margin: '10px 0 2px' }}>Recent for {mealLabel}</div>
            {recent.map((f) => renderRow(f, `r-${f.id}`))}
            <div className="label" style={{ margin: '14px 0 2px' }}>All foods</div>
          </>
        )}
        {tab === 'mine' && (
          <button className="btn btn-secondary btn-block" style={{ margin: '8px 0' }} onClick={() => setFormOpen({})}>
            <Plus /> Create food
          </button>
        )}
        {list.length === 0 ? (
          <div style={{ marginTop: 10 }}>
            {tab === 'favourites' && !q ? (
              <Empty icon={Star} title="No favourites yet">Tap the star on any food to keep it here.</Empty>
            ) : tab === 'mine' && !q ? (
              <Empty icon={UtensilsCrossed} title="No custom foods">Create foods from their nutrition labels.</Empty>
            ) : (
              <Empty icon={SearchX} title="No foods found" action={<button className="btn btn-secondary btn-sm" onClick={() => setFormOpen({})}>Create food</button>}>
                Try another search or add it yourself.
              </Empty>
            )}
          </div>
        ) : (
          list.map((f) => renderRow(f, f.id))
        )}
      </Sheet>

      <PortionEditor
        open={!!chosen}
        onClose={() => setChosen(null)}
        food={chosen}
        initial={chosen && meal ? { ...defaultPortion(chosen), meal } : null}
        submitLabel="Add entry"
        onSubmit={(v) => {
          if (!chosen) return;
          diary.add(date, v.meal, chosen, v.amount, v.unit);
          toast(`Added to ${MEALS.find((m) => m.id === v.meal)?.label}`);
          setChosen(null);
          close();
        }}
      />
      <CustomFoodForm
        open={!!formOpen}
        onClose={() => setFormOpen(null)}
        editing={formOpen?.editing ?? null}
        barcode={formOpen?.barcode}
        onSaved={(f) => {
          const wasEditing = !!formOpen?.editing;
          setFormOpen(null);
          toast(wasEditing ? 'Food updated' : 'Food saved to My Foods');
          if (!wasEditing) setChosen(f);
        }}
      />
      <BarcodeSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onFound={(f) => {
          setScanOpen(false);
          setChosen(f);
        }}
        onCreate={(code) => {
          setScanOpen(false);
          setFormOpen({ barcode: code });
        }}
      />
      <ConfirmSheet open={!!deleting} onClose={() => setDeleting(null)} title={`Delete “${deleting?.name ?? ''}”?`} body="Diary entries already logged keep their values." confirmLabel="Delete" danger onConfirm={() => deleting && (foods.deleteCustom(deleting.id), toast('Food deleted'))} />
    </>
  );
}
