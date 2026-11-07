import {NutritionSummary} from './NutritionSummary';
import {foodSummary} from '../../domain/foodSummary';
import {ChartNoAxesColumnIncreasing,ChevronDown,ChevronRight,X} from 'lucide-react';
import {engine,openTool} from '../../adapters/engine';
import {foodIn} from '../../adapters/compat';
import {Camera,Copy,Flag} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, ScanBarcode, Search, SearchX, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import type { DiaryEntry, Food, Meal, PortionUnit } from '../../domain/types';
import { allowedUnits, withServingWeight } from '../../domain/nutrition';
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
import { CopyMealSheet } from './CopyMealSheet';
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
  const [pickerMeal,setPickerMeal]=useState<Meal|null>(null),[editing,setEditing]=useState<DiaryEntry|null>(null),[copyMeal,setCopyMeal]=useState<Meal|null>(null);
  const [expanded,setExpanded]=useState<Set<Meal>>(()=>new Set(MEALS.map(m=>m.id))),[summary,setSummary]=useState(false);
  const [feedback,setFeedback]=useState<{text:string;entry:DiaryEntry;kind:'add'|'remove';at?:number}|null>(null);
  const allEntries=useDB(d=>d.diary);
  useEffect(()=>setFeedback(null),[date]);
  function remove(entry:DiaryEntry){const at=allEntries.findIndex(e=>e.id===entry.id);diary.remove(entry.id);setFeedback({text:`Removed ${entry.food.name}`,entry,kind:'remove',at})}
  function added(entry:DiaryEntry){setExpanded(old=>new Set([...old,entry.meal]));setFeedback({text:`Added ${entry.food.name} to ${MEALS.find(m=>m.id===entry.meal)?.label}`,entry,kind:'add'})}
  const left=t?t.kcal-total.kcal:0;
  const macroTotals=([['Protein',total.protein,t?.protein,'var(--protein)'],['Carbs',total.carbs,t?.carbs,'var(--carbs)'],['Fat',total.fat,t?.fat,'var(--fat)'],['Fibre',fibre.grams,null,'var(--fibre)']] as const);
  return <div className="food-log-page">
    <TopBar title="Food" actions={<button className="btn btn-soft btn-sm food-summary-btn" onClick={()=>setSummary(true)}><ChartNoAxesColumnIncreasing aria-hidden="true"/>Summary</button>}/>
    <div className="screen food-log-screen"><DateStrip date={date}/>
    {feedback&&<div className="food-feedback" role="status"><span>{feedback.text}</span><button onClick={()=>{if(feedback.kind==='add')diary.remove(feedback.entry.id);else diary.restore(feedback.entry,feedback.at);setFeedback(null)}}>Undo</button><button className="icon-btn" aria-label="Dismiss confirmation" onClick={()=>setFeedback(null)}><X size={16}/></button></div>}
    <section className="card food-day" aria-label="Daily nutrition totals">
      <div className="food-day-top">
        <div><span className="eyebrow">Eaten</span><div className="tnum"><span className="big">{fmtInt(energyValue(total.kcal,eU))}</span>{t&&<span className="of"> / {fmtInt(energyValue(t.kcal,eU))} {eU}</span>}</div></div>
        {t&&<span className={`food-day-left tnum ${left<0?'over':''}`}>{fmtInt(energyValue(Math.abs(left),eU))} {eU} {left<0?'over':'left'}</span>}
      </div>
      {t&&<div className="food-day-bar"><span className={left<0?'over':''} style={{width:`${Math.min(100,t.kcal>0?total.kcal/t.kcal*100:0)}%`}}/></div>}
      <div className="food-day-macros">{macroTotals.map(([name,value,goal,color])=><div key={name}>
        <span className="n"><i style={{background:color}}/>{name}</span>
        <span className="v tnum"><b>{value==null?'—':fmtInt(value)}</b>{goal!=null&&<small>/{fmtInt(goal)} g</small>}{goal==null&&value!=null&&<small> g</small>}</span>
        <span className="track">{goal!=null&&value!=null&&<span style={{width:`${Math.min(100,goal>0?value/goal*100:0)}%`,background:color}}/>}</span>
      </div>)}</div>
      <button className="btn btn-link food-all-nutrients" onClick={()=>setSummary(true)}>{fibre.missing>0&&total.kcal>0?'Fibre incomplete · ':''}All nutrients<ChevronRight aria-hidden="true"/></button>
    </section>
    {MEALS.map(m=>{const list=byMeal[m.id],values=foodSummary(list).values,open=expanded.has(m.id);return <section key={m.id} className="card food-meal" aria-label={m.label}>
      <div className="food-meal-header">
        <button className="food-meal-toggle" aria-expanded={open} aria-controls={`meal-${m.id}`} onClick={()=>setExpanded(old=>{const next=new Set(old);next.has(m.id)?next.delete(m.id):next.add(m.id);return next})}>
          <span className="food-meal-title">{m.label}<ChevronDown className={open?'':'closed'} aria-hidden="true"/></span>
          <span className="food-meal-energy tnum">{fmtInt(energyValue(values.kcal.value??0,eU))} {eU} · {list.length} {list.length===1?'food':'foods'}{list.length>0&&` · P ${fmtInt(values.protein.value??0)} · C ${fmtInt(values.carbs.value??0)} · F ${fmtInt(values.fat.value??0)}`}</span>
        </button>
        {list.length>0&&<button className="round-icon" aria-label={`Copy ${m.label}`} onClick={()=>setCopyMeal(m.id)}><Copy aria-hidden="true"/></button>}
        <button className="round-icon accent" aria-label={`Add food to ${m.label}`} onClick={()=>setPickerMeal(m.id)}><Plus aria-hidden="true"/></button>
      </div>
      <div id={`meal-${m.id}`} hidden={!open||!list.length} className="food-entries">{list.map(entry=>{const n=entryNutrients(entry);return <div className="food-log-entry" key={entry.id}>
        <button className="food-entry-edit" onClick={()=>setEditing(entry)} aria-label={`Edit ${entry.food.name}`}>
          <span className="food-entry-text"><span className="food-entry-name"><span className="ellipsis">{entry.food.name}</span><AiBadge addedBy={entry.addedBy} /></span><span className="food-entry-portion tnum">{portionText(entry)} · P {fmtNum(n.protein,1)} · C {fmtNum(n.carbs,1)} · F {fmtNum(n.fat,1)}</span></span>
          <span className="food-entry-kcal tnum"><b>{fmtInt(energyValue(n.kcal,eU))}</b> {eU}</span>
        </button>
        <button className="icon-btn food-entry-remove" aria-label={`Remove ${entry.food.name}`} onClick={()=>remove(entry)}><X size={16}/></button>
      </div>})}</div>
    </section>})}
    </div>
    <FoodPicker meal={pickerMeal} date={date} onClose={()=>setPickerMeal(null)} onAdded={added}/>
    <CopyMealSheet entries={copyMeal?byMeal[copyMeal]:[]} meal={copyMeal} date={date} onClose={()=>setCopyMeal(null)}/>
    <NutritionSummary open={summary} onClose={()=>setSummary(false)} date={date}/>
    <PortionEditor open={!!editing} onClose={()=>setEditing(null)} food={editing?.food??null} initial={editing?{amount:editing.amount,unit:editing.unit,meal:editing.meal}:null} submitLabel="Update entry" onSubmit={v=>{if(!editing)return;diary.updateEntry(editing.id,v);toast('Entry updated');setEditing(null)}} onDelete={()=>{if(!editing)return;remove(editing);setEditing(null)}} onServingWeight={w=>{if(!editing)return;diary.setServingWeight(editing.food.id,w,editing.id);setEditing(e=>e?{...e,food:withServingWeight(e.food,w)}:e);toast('Serving weight saved')}}/>
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
    // Grams (or ml) first: one serving's weight when known, otherwise the label amount. Servings only when no weight is known.
    f.refUnit === 'serving' ? { amount: 1, unit: 'serving' } : { amount: f.servingSize ?? f.refAmount, unit: f.refUnit };

  const renderRow = (f: Food, key: string) => {
    const fav = favIds.includes(f.id);
    return (
      <div className="food-row" key={key}>
        <button className="main-btn" onClick={() => (f as any).incomplete?setFormOpen({barcode:f.barcode||undefined}):setChosen(f)}>
          <span className="nm ellipsis">{f.name}</span>
          <span className="mt ellipsis">{f.brand ?? (f.origin === 'custom' ? 'My food' : 'Generic')} · {refText(f)}</span>
        </button>
        <button className="icon-btn" aria-pressed={fav} aria-label={fav ? `Remove ${f.name} from favourites` : `Add ${f.name} to favourites`} onClick={() => foods.toggleFavourite(f.id, f)}>
          <Star fill={fav ? 'var(--pr)' : 'none'} color={fav ? 'var(--pr-text)' : 'currentColor'} />
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
        onServingWeight={(w) => { if (!chosen) return; diary.setServingWeight(chosen.id, w); setChosen(withServingWeight(chosen, w)); toast('Serving weight saved'); }}
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
