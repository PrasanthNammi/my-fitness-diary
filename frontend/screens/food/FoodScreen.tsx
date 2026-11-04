import {NutritionSummary} from './NutritionSummary';
import {foodSummary} from '../../domain/foodSummary';
import {ChartNoAxesColumnIncreasing,ChevronUp,ChevronDown,ChevronRight,X} from 'lucide-react';
import {engine,openTool} from '../../adapters/engine';
import {foodIn} from '../../adapters/compat';
import {Camera,Flag} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, ScanBarcode, Search, SearchX, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import type { DiaryEntry, Food, Meal, PortionUnit } from '../../domain/types';
import { allowedUnits } from '../../domain/nutrition';
import { AiBadge, ConfirmSheet, Empty, OverflowMenu, Segmented, Sheet, TopBar, toast } from '../../components/ui';
import { DateStrip } from '../../components/DateStrip';
import { useDB } from '../../data/store';
import { entryNutrients, MEALS, useDay, useSelectedDate, useTargets } from '../../data/selectors';
import { diary, foods } from '../../data/repositories';
import { energyValue, fmtInt, fmtNum } from '../../lib/format';
import { PortionEditor, refText } from './PortionEditor';
import { CustomFoodForm } from './CustomFoodForm';
import { BarcodeSheet } from './BarcodeSheet';
import { CreateWithAiSheet } from './CreateWithAiSheet';
import { isValidBarcode } from '../../adapters/barcode';


function portionText(e: DiaryEntry) {
  if (e.unit === 'serving') {
    const label = e.food.servingLabel ?? 'serving';
    return e.amount === 1 ? label : `${fmtNum(e.amount, 2)} × ${label}`;
  }
  return `${fmtNum(e.amount, 1)} ${e.unit}`;
}

export function FoodScreen() {
  const date = useSelectedDate();
  const { byMeal, total, fibre } = useDay(date);
  const t = useTargets()?.targets;
  const eU = useDB(d=>d.settings.energyUnit);
  const [pickerMeal,setPickerMeal]=useState<Meal|null>(null),[editing,setEditing]=useState<DiaryEntry|null>(null);
  const [expanded,setExpanded]=useState<Set<Meal>>(()=>new Set(['breakfast'])),[summary,setSummary]=useState(false);
  const [feedback,setFeedback]=useState<{text:string;entry:DiaryEntry;kind:'add'|'remove'}|null>(null);
  useEffect(()=>setFeedback(null),[date]);
  function remove(entry:DiaryEntry){diary.remove(entry.id);setFeedback({text:`Removed ${entry.food.name}`,entry,kind:'remove'})}
  function added(entry:DiaryEntry){setExpanded(old=>new Set([...old,entry.meal]));setFeedback({text:`Added ${entry.food.name} to ${MEALS.find(m=>m.id===entry.meal)?.label}`,entry,kind:'add'})}
  const macroCells=(values:{protein:number;carbs:number;fat:number;fibre:number|null})=><div className="food-macro-grid">{([['Protein',values.protein],['Carbs',values.carbs],['Fats',values.fat],['Fibre',values.fibre]] as const).map(([name,value])=><span key={name}><small>{name}</small><strong>{value==null?'—':fmtNum(value,1)}</strong></span>)}</div>;
  return <div className="food-log-page">
    <TopBar title="Food" actions={<button className="food-summary-link" onClick={()=>setSummary(true)}><ChartNoAxesColumnIncreasing size={16}/> Summary</button>}/>
    <div className="screen food-log-screen"><DateStrip date={date}/>
    {feedback&&<div className="food-feedback" role="status"><span>{feedback.text}</span><button onClick={()=>{if(feedback.kind==='add')diary.remove(feedback.entry.id);else diary.restore(feedback.entry);setFeedback(null)}}>Undo</button><button className="icon-btn" aria-label="Dismiss confirmation" onClick={()=>setFeedback(null)}><X size={16}/></button></div>}
    <div className="food-section-label">Your meals</div>
    {MEALS.map(m=>{const list=byMeal[m.id],values=foodSummary(list).values,open=expanded.has(m.id);return <section key={m.id} className="food-meal" aria-label={m.label}>
      <div className="food-meal-header"><button className="food-meal-toggle" aria-expanded={open} aria-controls={`meal-${m.id}`} onClick={()=>setExpanded(old=>{const next=new Set(old);next.has(m.id)?next.delete(m.id):next.add(m.id);return next})}><span className="food-meal-title">{m.label}{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</span><span className="food-meal-energy">{fmtInt(energyValue(values.kcal.value??0,eU))} {eU} · {list.length} {list.length===1?'food':'foods'}</span></button><button className="icon-btn food-meal-add" aria-label={`Add food to ${m.label}`} onClick={()=>setPickerMeal(m.id)}><Plus size={20}/></button></div>
      {macroCells({protein:values.protein.value??0,carbs:values.carbs.value??0,fat:values.fat.value??0,fibre:values.fibre.value})}
      <div id={`meal-${m.id}`} hidden={!open}>{list.map(entry=>{const n=entryNutrients(entry);return <div className="food-log-entry" key={entry.id}><button className="food-entry-edit" onClick={()=>setEditing(entry)} aria-label={`Edit ${entry.food.name}`}><span className="food-entry-name">{entry.food.name}</span><span className="food-entry-portion">{portionText(entry)} · {fmtInt(energyValue(n.kcal,eU))} {eU}<AiBadge addedBy={entry.addedBy} /></span><span className="food-entry-values">{[n.protein,n.carbs,n.fat,n.fibre].map((v,i)=><span key={i}>{v==null?'—':fmtNum(v,1)} <small>{['protein','carbs','fats','fibre'][i]}</small></span>)}</span></button><button className="icon-btn food-entry-remove" aria-label={`Remove ${entry.food.name}`} onClick={()=>remove(entry)}><X size={17}/></button></div>})}{!list.length&&<p className="food-empty-meal">No foods logged</p>}</div>
    </section>})}
    <section className="food-daily-summary" aria-label="Daily nutrition totals"><div className="food-total-grid">{([[eU,energyValue(total.kcal,eU),t?energyValue(t.kcal,eU):null],['Protein',total.protein,t?.protein],['Carbs',total.carbs,t?.carbs],['Fats',total.fat,t?.fat]] as const).map(([name,value,goal])=><div key={name}><div className="food-meter"><span style={{width:`${goal?Math.min(100,value/goal*100):0}%`}}/></div><span>{name}</span><strong>{fmtInt(value)}</strong>{goal!=null&&<small>/ {fmtInt(goal)}{name===eU?'':' g'}</small>}</div>)}</div><div className="food-summary-footer"><span>Fibre {fibre.grams==null?'—':`${fmtNum(fibre.grams,1)} g`}{fibre.missing>0?' · some values missing':''}</span><button onClick={()=>setSummary(true)}>All nutrients <ChevronRight size={14}/></button></div></section>
    </div>
    <FoodPicker meal={pickerMeal} date={date} onClose={()=>setPickerMeal(null)} onAdded={added}/>
    <NutritionSummary open={summary} onClose={()=>setSummary(false)} date={date}/>
    <PortionEditor open={!!editing} onClose={()=>setEditing(null)} food={editing?.food??null} initial={editing?{amount:editing.amount,unit:editing.unit,meal:editing.meal}:null} submitLabel="Update entry" onSubmit={v=>{if(!editing)return;diary.updateEntry(editing.id,v);toast('Entry updated');setEditing(null)}} onDelete={()=>{if(!editing)return;remove(editing);setEditing(null)}}/>
  </div>;
}

type Tab = 'all' | 'favourites' | 'mine';

function FoodPicker({ meal, date, onClose, onAdded }: { meal: Meal | null; date: string; onClose: () => void; onAdded: (entry: DiaryEntry)=>void }) {
  const custom = useDB((d) => d.customFoods);
  const favIds = useDB((d) => d.favouriteFoodIds);
  const entries = useDB((d) => d.diary);
  const savedFavourites = useDB(d=>d.settings.favouriteFoods);
  const [q, setQ] = useState('');const [remote,setRemote]=useState<Food[]>([]);const [lastSearch,setLastSearch]=useState(0);const [lookup,setLookup]=useState<{code:string;loading:boolean}|null>(null),lookupSeq=useRef(0);
  // Scanned or typed barcode: put it in the search bar, show saved foods that match it and add the database product to the list.
  async function lookupBarcode(code:string){const seq=++lookupSeq.current;setTab('all');setQ(code);setRemote([]);setLookup({code,loading:true});try{const p=await engine().barcode(code);if(seq!==lookupSeq.current)return;if(p&&!p.incomplete){const f=foodIn(p);setRemote([{...f,barcode:f.barcode||code}])}}catch{if(seq===lookupSeq.current)toast('Offline')}finally{if(seq===lookupSeq.current)setLookup({code,loading:false})}}
  async function searchOnline(){if(isValidBarcode(q))return lookupBarcode(q.trim());if(q.trim().length<3||Date.now()-lastSearch<6500)return;setLastSearch(Date.now());try{setRemote((await engine().searchFood(q)).filter((p:any)=>!p.incomplete).map(foodIn))}catch{toast('Offline')}}
  const [tab, setTab] = useState<Tab>('all');
  const [chosen, setChosen] = useState<Food | null>(null);
  const [formOpen, setFormOpen] = useState<{ editing?: Food; barcode?: string } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [deleting, setDeleting] = useState<Food | null>(null);
  const open = meal !== null;
  const mealLabel = MEALS.find((m) => m.id === meal)?.label ?? '';

  const all = useMemo(() => [...new Map([...(savedFavourites??[]),...entries.map(e=>e.food),...remote,...custom].map(f=>[f.id,f])).values()], [custom,remote,savedFavourites,entries]);
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

  const barcodeQuery = isValidBarcode(q) ? q.trim() : null;
  const lookingUp = !!lookup?.loading && lookup.code === barcodeQuery;
  const close = () => {
    lookupSeq.current++;
    setLookup(null);
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
        <button className="icon-btn" aria-pressed={fav} aria-label={fav ? `Remove ${f.name} from favourites` : `Add ${f.name} to favourites`} onClick={() => foods.toggleFavourite(f.id, f)}>
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
              {!q && <Search />}
              <input type="search" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search foods" />
              {q && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQ('')}><X /></button>}
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
        {lookingUp && <p className="food-lookup" role="status">Looking up barcode {barcodeQuery}…</p>}
        {list.length === 0 ? (
          lookingUp ? null : <div style={{ marginTop: 10 }}>
            {barcodeQuery && lookup?.code === barcodeQuery && tab === 'all' ? (
              <Empty icon={SearchX} title="No food found for this barcode" action={<div className="empty-actions"><button className="btn btn-secondary btn-sm" onClick={() => setFormOpen({ barcode: barcodeQuery })}>Create food</button><button className="btn btn-secondary btn-sm" onClick={() => setAiOpen(true)}>Create with AI</button></div>}>
                Enter it yourself, or let your AI assistant read the label.
              </Empty>
            ) : tab === 'favourites' && !q ? (
              <Empty icon={Star} title="No favourites yet">Tap the star on any food to keep it here.</Empty>
            ) : tab === 'mine' && !q ? (
              <Empty icon={UtensilsCrossed} title="No custom foods">Create foods from their nutrition labels.</Empty>
            ) : (
              <Empty icon={SearchX} title="No foods found" action={<div className="empty-actions"><button className="btn btn-secondary btn-sm" onClick={() => setFormOpen({})}>Create food</button><button className="btn btn-secondary btn-sm" onClick={() => setAiOpen(true)}>Create with AI</button></div>}>
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
          const entry = diary.add(date, v.meal, chosen, v.amount, v.unit);
          onAdded(entry);
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
        onScanned={(code) => {
          setScanOpen(false);
          lookupBarcode(code);
        }}
      />
      <CreateWithAiSheet open={aiOpen} onClose={() => setAiOpen(false)} mealLabel={mealLabel} date={date} />
      <ConfirmSheet open={!!deleting} onClose={() => setDeleting(null)} title={`Delete “${deleting?.name ?? ''}”?`} body="Diary entries already logged keep their values." confirmLabel="Delete" danger onConfirm={() => deleting && (foods.deleteCustom(deleting.id), toast('Food deleted'))} />
    </>
  );
}
