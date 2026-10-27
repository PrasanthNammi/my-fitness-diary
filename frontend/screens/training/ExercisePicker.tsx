import {MUSCLES as MUSCLE_GROUP_NAMES} from '../../domain/muscleStats';
import {installNativeCatalogue,loadMfdCatalogue,getCatalogue,mapEntry,migrateExerciseIds} from '../../catalogue/runtime';
import {ExerciseGuide,ExercisePage} from './ExercisePage';
import {engine} from '../../adapters/engine';
import { useMemo, useState, useEffect } from 'react';
import { ChevronDown, ChevronLeft, Dumbbell, FileText, ImageOff, Minus, Plus, Search, SearchX } from 'lucide-react';
import type { Exercise, ExerciseBlock, ExerciseSource, TrackingMode } from '../../domain/types';
import { TRACKING_LABEL, trackingFields } from '../../domain/training';
import { EQUIPMENT, MUSCLES, SOURCE_LABEL, SOURCE_ORDER } from '../../data/exerciseCatalog';
import { exercises, newBlock, TRACKING_MODES } from '../../data/repositories';
import { Empty, Field, Notice, SelectField, Sheet } from '../../components/ui';
import { useDB } from '../../data/store';
import { mss, parseDecimal, parseMss, round1, toKg } from '../../lib/format';

export function ExerciseDetail({ex}:{ex:Exercise}){return <ExerciseGuide exercise={ex}/>}

function Stepper({ label, value, onChange, min = 0, max = 50 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="field">
      <span className="label" id={`st-${label}`}>{label}</span>
      <div className="stepper" role="group" aria-labelledby={`st-${label}`}>
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={18} /></button>
        <input
          aria-label={label}
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
            onChange(Number.isFinite(n) ? Math.min(max, n) : min);
          }}
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={18} /></button>
      </div>
    </div>
  );
}

type Filter = { muscle: string | null; equipment: string | null; source: ExerciseSource | null };

/** Shared exercise picker used by the routine editor and the active workout. */
export function ExercisePicker({ open, onClose, onAdd, browse, replace = false, initialSets = 3 }: { open: boolean; onClose: () => void; onAdd: (b: ExerciseBlock) => void; browse?:boolean; replace?:boolean; initialSets?:number }) {
  const custom = useDB((d) => d.customExercises);
  const settings = useDB((d) => d.settings);
  const [q, setQ] = useState('');
  const [loading,setLoading]=useState(!getCatalogue()),[loadError,setLoadError]=useState(false);
  const load=()=>{setLoading(true);setLoadError(false);loadMfdCatalogue().then(()=>{const e=engine();if(e?.peek().ready&&!e.peek().reconciling)installNativeCatalogue(e);setLoading(false)}).catch(()=>{setLoading(false);setLoadError(true)})};
  useEffect(()=>{if(open&&!getCatalogue())load()},[open]);

  const [filter, setFilter] = useState<Filter>({ muscle: null, equipment: null, source: null });
  const [filterSheet, setFilterSheet] = useState<keyof Filter | null>(null);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => exercises.all(), [custom]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => {
    const cat=getCatalogue();const ids=new Map((cat?.search(q,{},2000)||[]).map((e,i)=>[e.id,i]));const words=q.toLowerCase().trim().split(/\s+/);
    return all.filter(e=>e.source==='mfd'?ids.has(e.id):e.source==='custom'&&!e.id.startsWith('history:')&&words.every(w=>e.name.toLowerCase().includes(w))).filter(e=>(!filter.muscle||e.primaryMuscle===filter.muscle||e.secondaryMuscles.includes(filter.muscle))&&(!filter.equipment||e.equipment.toLowerCase().includes(filter.equipment.toLowerCase()))&&(!filter.source||e.source===filter.source)).sort((a,b)=>(ids.get(a.id)??-1)-(ids.get(b.id)??-1));
  },[all,q,filter]);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const families=useMemo(()=>{const rows=new Map<string,Exercise[]>();for(const ex of results){const key=ex.entry?.family_id||ex.id;const group=rows.get(key)||[];group.push(ex);rows.set(key,group)}return [...rows].map(([id,list])=>({id,list:list.sort((a,b)=>Number(!!b.entry?.is_default_variation)-Number(!!a.entry?.is_default_variation))}))},[results]);

  const close = () => {
    setSelected(null);
    setCreating(false);
    onClose();
  };

  const [visible, setVisible] = useState(80);
  useEffect(()=>setVisible(80),[q,filter]);
  const grouped = SOURCE_ORDER.map((s) => [s, results.slice(0,visible).filter((r) => r.source === s)] as const).filter(([, l]) => l.length);

  const filterOptions: Record<keyof Filter, string[]> = {
    muscle: [...new Set(all.map(e=>e.primaryMuscle))].sort(),
    equipment: [...new Set(Object.values(getCatalogue()?.meta.equipment||{}))].sort(),
    source: SOURCE_ORDER,
  };
  const filterLabel = (k: keyof Filter) =>
    filter[k] ? (k === 'source' ? SOURCE_LABEL[filter[k] as ExerciseSource] : filter[k]) : k === 'muscle' ? 'Muscle' : k === 'equipment' ? 'Equipment' : 'Source';

  let title = replace ? 'Replace exercise' : 'Exercise';
  if (selected) title = 'Exercise';
  if (creating) title = 'Custom exercise';

  return (
    <Sheet
      open={open}
      onClose={close}
      size="full"
      title={title}
      headerActions={
        selected || creating ? (
          <button className="btn btn-ghost btn-sm" onClick={() => (setSelected(null), setCreating(false))}><ChevronLeft /> Back</button>
        ) : (
          <button className="btn btn-link" onClick={() => setCreating(true)}>Create</button>
        )
      }
    >
      {browse&&selected?<ExercisePage exercise={selected} onClose={()=>setSelected(null)}/>:creating ? (
        <CustomExerciseForm
          onSaved={(ex) => {
            setCreating(false);
            setSelected(ex);
          }}
        />
      ) : selected ? (
        <AddConfig
          key={selected.id}
          replace={replace}
          initialSets={initialSets}
          ex={selected}
          defaultRest={settings.defaultRestSec}
          weightUnit={settings.weightUnit}
          onAdd={(b) => {
            onAdd(b);
            close();
            setQ('');
          }}
        />
      ) : (
        <>
          <div style={{ position: 'sticky', top: -4, background: 'var(--surface)', zIndex: 2, paddingBottom: 8 }}>
            <label className="search">
              <Search />
              <input
                type="search"
                placeholder="Exercise"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search exercises"
                data-autofocus
              />
            </label>
            <div className="chips" style={{ marginTop: 8 }}>
              {(['muscle', 'equipment'] as const).map((k) => (
                <button key={k} className="chip" aria-pressed={!!filter[k]} onClick={() => setFilterSheet(k)}>
                  {filterLabel(k)} <ChevronDown />
                </button>
              ))}
              {(filter.muscle || filter.equipment || filter.source) && (
                <button className="chip" onClick={() => setFilter({ muscle: null, equipment: null, source: null })}>Clear</button>
              )}
            </div>
          </div>
          {loading?<div className="exercise-empty" role="status" aria-label="Loading catalogue"><Dumbbell className="spin"/></div>:loadError?<button className="icon-btn" aria-label="Retry catalogue" onClick={load}>↻</button>:results.length === 0 ? (
            <Empty icon={SearchX} title="No exercises found" action={<button className="btn btn-secondary btn-sm" onClick={() => setCreating(true)}>Create custom exercise</button>}>
              Try a different search or clear filters.
            </Empty>
          ) : (
            families.slice(0,visible).map(({id,list})=>{const ex=list[0];const variants=ex.entry?getCatalogue()?.family(ex.id).map(mapEntry)||list:list;return <div key={id} className="catalogue-family"><div className="row"><button className="ex-row grow" onClick={()=>setSelected(ex)}><div className="ex-thumb" aria-hidden="true"><Dumbbell/></div><div className="grow"><div className="nm">{ex.name}</div><div className="mt">{ex.equipment} · {ex.primaryMuscle}</div></div></button>{variants.length>1&&<button className="icon-btn" aria-label={`Variations of ${ex.entry?.family_name}`} aria-expanded={expanded.has(id)} onClick={()=>setExpanded(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next})}><ChevronDown size={18}/><small>{variants.length}</small></button>}</div>{expanded.has(id)&&variants.filter(e=>e.id!==ex.id).map(e=><button key={e.id} className="ex-row catalogue-variation" onClick={()=>setSelected(e)}><div className="grow"><div className="nm">{e.name}</div><div className="mt">{e.equipment}</div></div><Plus size={16}/></button>)}</div>})
          )}
          {families.length>visible&&<button className="btn btn-secondary" aria-label="More exercises" onClick={()=>setVisible(v=>v+80)}><Plus/></button>}
          <Sheet open={!!filterSheet} onClose={() => setFilterSheet(null)} title={filterSheet ? filterLabel(filterSheet) : ''}>
            {filterSheet && (
              <div className="option-list">
                <button className="option" aria-pressed={!filter[filterSheet]} onClick={() => (setFilter({ ...filter, [filterSheet]: null }), setFilterSheet(null))}>
                  <span className="strong">All</span>
                </button>
                {filterOptions[filterSheet].map((o) => (
                  <button key={o} className="option" aria-pressed={filter[filterSheet] === o} onClick={() => (setFilter({ ...filter, [filterSheet]: o }), setFilterSheet(null))}>
                    <span className="strong">{filterSheet === 'source' ? SOURCE_LABEL[o as ExerciseSource] : o}</span>
                  </button>
                ))}
              </div>
            )}
          </Sheet>
        </>
      )}
    </Sheet>
  );
}

function AddConfig({ ex, defaultRest, weightUnit, onAdd, replace, initialSets }: { replace?: boolean; initialSets: number; ex: Exercise; defaultRest: number; weightUnit: 'kg' | 'lb'; onAdd: (b: ExerciseBlock) => void }) {
  const fields = trackingFields(ex.tracking);
  const [sets, setSets] = useState(Math.min(20, initialSets));
  const [reps, setReps] = useState(fields.includes('reps') ? 10 : 0);
  const [weight, setWeight] = useState('');
  const [rest, setRest] = useState(mss(ex.tracking === 'distance_time' ? 0 : defaultRest));
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const restSec = parseMss(rest);
    if (restSec === null || restSec > 3600) return setErr('Enter rest as m:ss, e.g. 1:30.');
    const w = weight.trim() ? parseDecimal(weight) : null;
    if (weight.trim() && (w === null || w < 0)) return setErr('Weight must be a positive number.');
    onAdd(newBlock(ex, { sets, reps: fields.includes('reps') ? reps : null, weightKg: w === null ? null : round1(toKg(w, weightUnit) * 10) / 10, restSec }));
  };

  return (
    <div className="stack">
      <ExerciseDetail ex={ex} />
      {replace && <Notice>Choose fresh sets for the replacement. Completed sets stay with the original exercise; unfinished sets are replaced.</Notice>}
      <div className="card card-pad stack">
        <div className="strong">Defaults</div>
        <div className="grid-2">
          <Stepper label="Sets" value={sets} onChange={setSets} min={1} max={20} />
          {fields.includes('reps') ? <Stepper label="Reps" value={reps} onChange={setReps} min={0} max={100} /> : <div />}
          {fields.includes('weightKg') && (
            <Field label={`Weight (${weightUnit})`} htmlFor="cfg-w">
              <input id="cfg-w" className="input" inputMode="decimal" placeholder="Optional" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
          )}
          <Field label="Rest" htmlFor="cfg-r" hint="m:ss">
            <input id="cfg-r" className="input" value={rest} onChange={(e) => setRest(e.target.value)} />
          </Field>
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        <button className="btn btn-primary btn-block" onClick={submit}><Plus /> {replace ? 'Replace with' : 'Add'} {sets} {sets === 1 ? 'set' : 'sets'}</button>
      </div>
    </div>
  );
}

function CustomExerciseForm({ onSaved }: { onSaved: (e: Exercise) => void }) {
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingMode>('weight_reps');
  const [steps, setSteps] = useState('');
  const [secondary, setSecondary] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const errors = {
    name: !name.trim() ? 'Enter a name.' : exercises.all().some((e) => e.source === 'custom' && e.name.toLowerCase() === name.trim().toLowerCase()) ? 'You already have a custom exercise with this name.' : null,
    muscle: !muscle ? 'Choose a muscle.' : null,
    equipment: !equipment ? 'Choose equipment.' : null,
  };
  const valid = !errors.name && !errors.muscle && !errors.equipment;
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        if (!valid) return;
        try { const ex = await exercises.createCustom({
          name: name.trim(),
          primaryMuscle: muscle!,
          secondaryMuscles: secondary.filter(m=>m!==muscle),
          equipment: equipment!,
          tracking,
          instructions: steps.trim() ? steps.split('\n').map((s) => s.trim()).filter(Boolean) : null,
        });
        onSaved(ex); } catch(error){ window.alert((error as Error).message); }
      }}
    >
      <Field label="Name" htmlFor="cx-name" error={tried ? errors.name : null}>
        <input id="cx-name" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!errors.name} data-autofocus />
      </Field>
      <SelectField label="Primary muscle" value={muscle} options={Object.values(MUSCLE_GROUP_NAMES).map((m) => ({ value: m, label: m }))} onChange={setMuscle} />
      {tried && errors.muscle && <div className="err small danger-text">{errors.muscle}</div>}
      <details><summary className="small">Secondary muscles · optional</summary><div className="custom-muscle-choices">{Object.values(MUSCLE_GROUP_NAMES).filter(m=>m!==muscle&&!['Other','Cardio','Full body'].includes(m)).map(m=><label key={m}><input type="checkbox" checked={secondary.includes(m)} onChange={()=>setSecondary(old=>old.includes(m)?old.filter(x=>x!==m):[...old,m])}/>{m}</label>)}</div></details>
      <SelectField label="Equipment" value={equipment} options={EQUIPMENT.map((m) => ({ value: m, label: m }))} onChange={setEquipment} />
      {tried && errors.equipment && <div className="err small danger-text">{errors.equipment}</div>}
      <SelectField label="Tracking" value={tracking} options={TRACKING_MODES.map((m) => ({ value: m, label: TRACKING_LABEL[m] }))} onChange={setTracking} />
      <Field label="Instructions" htmlFor="cx-steps" hint="Optional. One step per line.">
        <textarea id="cx-steps" className="textarea" value={steps} onChange={(e) => setSteps(e.target.value)} />
      </Field>
      <button className="btn btn-primary" type="submit">Save exercise</button>
    </form>
  );
}
