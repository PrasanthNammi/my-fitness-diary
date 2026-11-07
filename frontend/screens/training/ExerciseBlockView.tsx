import {activeRecords,metricLabels} from '../../domain/records';
import {useDB} from '../../data/store';
import {ExercisePage} from './ExercisePage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crown, ArrowDown, Disc3, ArrowUp, Check, Info, Link2, Link2Off, NotebookPen, Plus, Repeat, Ruler, Timer, Trash2, X,
} from 'lucide-react';
import type { ExerciseBlock, RestTimer, SetEntry, Workout } from '../../domain/types';
import {
  weightHeading, findPrevious, ordinalWithinType, setLabels, timerRemaining, timerState, trackingFields, type Field,
} from '../../domain/training';
import { OverflowMenu, Sheet, type MenuAction } from '../../components/ui';
import { exercises, newSet } from '../../data/repositories';
import { fmtNum, kgTo, mss, parseDecimal, parseMss, roundWeight, toKg } from '../../lib/format';
import { RestSheet, SetTypeSheet, TrackingSheet } from './SetSheets';
import { PlateSheet } from './PlateSheet';
import { ExerciseDetail, ExerciseThumb } from './ExercisePicker';

const HEAD: Record<Field, (u: string) => string> = {
  weightKg: (u) => u,
  reps: () => 'Reps',
  timeSec: () => 'Time',
  distanceKm: () => 'km',
  floors: () => 'Floors',
  steps: () => 'Steps',
};

/** A numeric cell that keeps a local draft while typing and commits parsed values. */
function CellInput({
  field, value, unit, onCommit, label, placeholder, onFocusChange,
}: { field: Field; value: number | null; unit: 'kg' | 'lb'; onCommit: (v: number | null) => void; label: string; placeholder?: string; onFocusChange?: (focused: boolean) => void }) {
  const toText = (v: number | null) => {
    if (v == null) return '';
    if (field === 'timeSec') return mss(v);
    if (field === 'weightKg') return String(roundWeight(kgTo(v, unit)));
    return String(v);
  };
  const [text, setText] = useState(toText(value));
  const focused = useRef(false);
  const commit = useRef(onCommit);commit.current=onCommit;
  const pending = useRef<number|null|undefined>(undefined),timer=useRef<ReturnType<typeof setTimeout>>();
  const flush=()=>{clearTimeout(timer.current);if(pending.current!==undefined){const value=pending.current;pending.current=undefined;commit.current(value)}};
  useEffect(()=>{const leaving=()=>{if(document.hidden)flush()};window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',leaving);return()=>{clearTimeout(timer.current);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',leaving)}},[]);

  useEffect(() => {
    if (!focused.current) setText(toText(value));
  }, [value, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const parse = (t: string): number | null | undefined => {
    if (t.trim() === '') return null;
    if (field === 'timeSec') return parseMss(t) ?? undefined;
    const n = parseDecimal(t);
    if (n === null || n < 0) return undefined;
    if (['reps','floors','steps'].includes(field)) return Math.round(n);
    if (field === 'weightKg') return Math.round(toKg(n, unit) * 1000) / 1000;
    return Math.round(n * 1000) / 1000;
  };
  return (
    <input
      className="cell-input"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      inputMode={['reps','floors','steps'].includes(field) ? 'numeric' : field === 'timeSec' ? 'text' : 'decimal'}
      enterKeyHint="next"
      autoComplete="off"
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
        onFocusChange?.(true);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if(v!==undefined){pending.current=v;clearTimeout(timer.current);timer.current=setTimeout(flush,180)}
      }}
      onBlur={(e) => {
        focused.current = false;
        onFocusChange?.(false);
        clearTimeout(timer.current);pending.current=undefined;
        const v = parse(e.target.value);
        if (v === undefined) setText(toText(value));
        else {
          onCommit(v);
          setText(toText(v));
        }
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}


function suggestedText(field: Field, value: number | null, unit: 'kg' | 'lb'): string {
  if (value == null) return field === 'timeSec' ? 'm:ss' : '–';
  if (field === 'weightKg') return String(roundWeight(kgTo(value, unit)));
  return field === 'timeSec' ? mss(value) : String(value);
}

function prevParts(s: SetEntry | null, fields: Field[], unit: 'kg' | 'lb'): { text: string; full: string } {
  if (!s) return { text: '—', full: 'No previous value' };
  const val = (f: Field) => {
    const v = s[f];
    if (v == null) return ['–', ''];
    if (f === 'weightKg') return [fmtNum(kgTo(v, unit), 2), unit];
    if (f === 'timeSec') return [mss(v), ''];
    if (f === 'distanceKm') return [fmtNum(v, 2), 'km'];
    return [String(v), ''];
  };
  const parts = fields.map(val);
  const sep = fields.length === 2 && fields[1] === 'reps' ? ' × ' : ' · ';
  return {
    text: parts.map(([v]) => v).join(sep),
    full: parts.map(([v, u]) => (u ? `${v} ${u}` : v)).join(sep),
  };
}

function PrevLabel({ s, fields, unit }: { s: SetEntry | null; fields: Field[]; unit: 'kg' | 'lb' }) {
  const p = prevParts(s, fields, unit);
  return (
    <>
      <span className="prev-full">{p.full}</span>
      <span className="prev-short">{p.text}</span>
    </>
  );
}

export interface BlockProps {
  mode: 'editor' | 'active';
  block: ExerciseBlock;
  index: number;
  count: number;
  supersetLetter: string | null;
  weightUnit: 'kg' | 'lb';
  onChange: (b: ExerciseBlock) => void;
  onRemove: () => void;
  onReplace: () => void;
  onMove: (dir: -1 | 1) => void;
  onSuperset: () => void;
  onUnsuperset: () => void;
  // active only
  history?: Workout[];
  timer?: RestTimer;
  now?: number;
  onToggleDone?: (setId: string) => void;
  onTimer?: (action: 'start' | 'pause' | 'reset' | 'duration', durationSec?: number) => void;
}

export function ExerciseBlockView(p: BlockProps) {
  const { block, mode, weightUnit } = p;
  const history=useDB(d=>d.workouts),current=useDB(d=>d.active);
  const records=useMemo(()=>activeRecords(history,current),[history,current]);
  const ex = exercises.byId(block.exerciseId);
  const fields = trackingFields(block.tracking);
  const labels = useMemo(() => setLabels(block.sets), [block.sets]);
  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [restOpen, setRestOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [platesOpen, setPlatesOpen] = useState(false);
  const chipPressed = useRef(false);
  const [focusSet, setFocusSet] = useState<string | null>(null), [plateKg, setPlateKg] = useState<number | null>(null);
  const openPlatesFor = (setId: string) => {
    const typed = document.activeElement instanceof HTMLInputElement ? parseDecimal(document.activeElement.value) : null;
    const set = block.sets.find((x) => x.id === setId);
    setPlateKg(typed != null ? toKg(typed, weightUnit) : set?.weightKg ?? set?.suggested?.weightKg ?? null);
    setPlatesOpen(true);
  };
  // Barbell-type exercises get the plate calculator, for the next set still to do (or the last one).
  // Known equipment decides; with none recorded (e.g. imported by name), the name must not point elsewhere.
  const equipment = (ex?.equipment ?? '').trim(), exName = ex?.name ?? '';
  const loadable = fields.includes('weightKg') && (/barbell|ez.?bar|smith|trap bar|hex bar/i.test(equipment + ' ' + exName)
    || (!equipment && !/dumbbell|cable|machine|kettlebell|band|pulldown|pushdown|bodyweight|assisted|pull.?up|chin.?up|dip/i.test(exName)));
  const plateSet = block.sets.find((s) => !s.done && (s.weightKg ?? s.suggested?.weightKg) != null) ?? [...block.sets].reverse().find((s) => (s.weightKg ?? s.suggested?.weightKg) != null);
  const active = mode === 'active';

  const patchSet = (id: string, patch: Partial<SetEntry>) =>
    p.onChange({ ...block, sets: block.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const removeSet = (id: string) => block.sets.length === 1 ? p.onRemove() : p.onChange({ ...block, sets: block.sets.filter((s) => s.id !== id) });
  const addSet = () => {
    const last = block.sets[block.sets.length - 1];
    p.onChange({ ...block, sets: [...block.sets, newSet('normal', last ? { weightKg: last.weightKg ?? last.suggested?.weightKg, reps: last.reps ?? last.suggested?.reps, timeSec: last.timeSec ?? last.suggested?.timeSec, distanceKm: last.distanceKm ?? last.suggested?.distanceKm, floors:last.floors ?? last.suggested?.floors, steps:last.steps ?? last.suggested?.steps } : undefined)] });
  };

  const tState = timerState(p.timer, p.now ?? 0);
  const remaining = timerRemaining(p.timer, p.now ?? 0);
  const restLabel = !active || tState === 'idle'
    ? block.restSec > 0 ? mss(block.restSec) : 'Off'
    : tState === 'done' ? 'Done' : mss(remaining);

  const menu: MenuAction[] = [
    { label: 'Replace exercise', icon: Repeat, onSelect: p.onReplace },
    { label: 'Exercise details', icon: Info, onSelect: () => setDetailOpen(true) },
    ...(loadable ? [{ label: 'Plates', icon: Disc3, onSelect: () => { setPlateKg(null); setPlatesOpen(true); } }] : []),
    { label: block.note ? 'Edit note' : 'Add note', icon: NotebookPen, onSelect: () => setNoteOpen(true) },
    { label: 'Tracking type', icon: Ruler, onSelect: () => setTrackOpen(true) },
    p.supersetLetter
      ? { label: 'Remove from superset', icon: Link2Off, onSelect: p.onUnsuperset }
      : { label: 'Superset with…', icon: Link2, onSelect: p.onSuperset, disabled: p.count < 2 },
    { label: 'Move up', icon: ArrowUp, onSelect: () => p.onMove(-1), disabled: p.index === 0 },
    { label: 'Move down', icon: ArrowDown, onSelect: () => p.onMove(1), disabled: p.index === p.count - 1 },
    { label: 'Remove exercise', icon: Trash2, onSelect: p.onRemove, danger: true },
  ];

  const typeSet = block.sets.find((s) => s.id === typeFor) ?? null;
  const colsClass = fields.length === 1 ? ' cols-1' : '';
  const name = ex?.name ?? 'Unknown exercise';

  return (
    <section className={`ex-block${p.supersetLetter ? ' in-superset' : ''}`} aria-label={name}>
      <div className="ex-head">
        <ExerciseThumb exercise={ex} />
        <button className="ex-name" onClick={() => setDetailOpen(true)}>{name}</button>
        {p.supersetLetter && <span className="ss-tag">Superset {p.supersetLetter}</span>}
        <OverflowMenu title={name} actions={menu} label={`Options for ${name}`} />
      </div>

      <div className="ex-tools">
        <button
          className={`tool${active && tState === 'running' ? ' running' : ''}${active && tState === 'done' ? ' done' : ''}`}
          onClick={() => setRestOpen(true)}
          aria-label={`Rest timer, ${restLabel}`}
        >
          <Timer /> Rest <span className="tnum">{restLabel}</span>
        </button>
        <button className="tool" onClick={() => setNoteOpen((v) => !v)} aria-expanded={noteOpen}>
          <NotebookPen /> Note{block.note && !noteOpen ? ' •' : ''}
        </button>
        {block.tracking !== (ex?.tracking ?? block.tracking) && (
          <button className="tool" onClick={() => setTrackOpen(true)}><Repeat /> Tracking</button>
        )}
      </div>

      {noteOpen ? (
        <div className="ex-note" style={{ marginLeft: 46 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="textarea"
              aria-label={`Note for ${name}`}
              placeholder="Add a note"
              value={block.note}
              rows={2}
              onChange={(e) => p.onChange({ ...block, note: e.target.value })}
            />
            <button className="icon-btn sm" aria-label="Close note" onClick={() => setNoteOpen(false)}><X /></button>
          </div>
        </div>
      ) : (
        block.note && <p className="ex-note-read">{block.note}</p>
      )}

      <div className={`sets${active ? ' active' : ' editor'}${colsClass}`} role="table" aria-label={`Sets for ${name}`}>
        <div className="set-row head" role="row">
          <span role="columnheader">Set</span>
          {active && <span role="columnheader">Previous</span>}
          {fields.map((f) => (
            <span role="columnheader" key={f}>{f==='weightKg'?weightHeading(block.tracking,weightUnit):HEAD[f](weightUnit)}</span>
          ))}
          <span role="columnheader">{active ? <Check size={14} aria-label="Done" /> : <span className="sr-only">Remove</span>}</span>
          {active && <span className="sr-only" role="columnheader">Delete</span>}
        </div>
        {block.sets.map((s, i) => {
          const prev = active && p.history ? findPrevious(p.history, block.exerciseId, s.type, ordinalWithinType(block.sets, i)) : null;
          const label = labels[i];
          return (
            <div key={s.id} className={`set-row${active && s.done ? ' done' : ''}`} role="row">
              <button
                className={`set-label ${s.type}`}
                aria-label={`Set ${label}, ${s.type === 'normal' ? 'working' : s.type}. Change set type`}
                onClick={() => setTypeFor(s.id)}
              >
                {active&&s.done&&records.has(s.id)&&<Crown className="record-crown" aria-label={records.get(s.id)!.map(r=>metricLabels[r.metric]).join(', ')}><title>Record</title></Crown>}
                <span>
                  {label}
                  {s.rpe !== null && <span className="rpe-tag">@{s.rpe}</span>}
                </span>
              </button>
              {active && (
                <button
                  className="prev"
                  disabled={!prev}
                  aria-label={prev ? `Copy previous: ${prevParts(prev, fields, weightUnit).full}` : 'No previous value'}
                  onClick={() =>
                    prev && patchSet(s.id, { weightKg: prev.weightKg, reps: prev.reps, timeSec: prev.timeSec, distanceKm: prev.distanceKm, floors:prev.floors,steps:prev.steps })
                  }
                >
                  <PrevLabel s={prev} fields={fields} unit={weightUnit} />
                </button>
              )}
              {fields.map((f) => (
                <CellInput
                  key={f}
                  field={f}
                  value={s[f]??null}
                  unit={weightUnit}
                  label={`Set ${label} ${HEAD[f](weightUnit)}`}
                  placeholder={active ? suggestedText(f, s.suggested?.[f] ?? prev?.[f] ?? null, weightUnit) : f === 'timeSec' ? 'm:ss' : '–'}
                  onCommit={(v) => patchSet(s.id, { [f]: v })}
                  onFocusChange={f === 'weightKg' && loadable ? (on) => (on ? setFocusSet(s.id) : setTimeout(() => setFocusSet((cur) => (cur === s.id ? null : cur)), 250)) : undefined}
                />
              ))}
              {active ? (
                <button
                  className="check-btn"
                  aria-pressed={s.done}
                  aria-label={s.done ? `Set ${label} completed. Mark as not done` : `Complete set ${label}`}
                  onClick={() => p.onToggleDone?.(s.id)}
                >
                  <span><Check /></span>
                </button>
              ) : (
                <button className="remove-btn" aria-label={`Delete set ${label}`} onClick={() => removeSet(s.id)}>
                  <X />
                </button>
              )}
              {active && <button className="remove-btn" aria-label={`Delete set ${label}`} onClick={() => removeSet(s.id)}><X /></button>}
            </div>
          );
        })}
      </div>
      {loadable && focusSet && (
        // While a barbell weight is being typed: plates for that weight (pointer-down keeps the keyboard's value).
        <button type="button" className="chip plates-chip" onPointerDown={(e) => { e.preventDefault(); chipPressed.current = true; openPlatesFor(focusSet); }} onClick={() => { if (chipPressed.current) chipPressed.current = false; else openPlatesFor(focusSet); }}><Disc3 />Plates</button>
      )}
      <button className="btn btn-soft btn-sm add-set" onClick={addSet}><Plus /> Add Set</button>

      <SetTypeSheet
        open={!!typeFor}
        onClose={() => setTypeFor(null)}
        set={typeSet}
        showRpe={active}
        onChange={(patch) => typeFor && patchSet(typeFor, patch)}
        onDelete={active && block.sets.length > 1 ? () => typeFor && removeSet(typeFor) : undefined}
      />
      <RestSheet
        open={restOpen}
        onClose={() => setRestOpen(false)}
        durationSec={block.restSec}
        onDuration={(sec) => {
          if (active && p.onTimer) p.onTimer('duration', sec);
          p.onChange({ ...block, restSec: sec });
        }}
        timer={active ? p.timer ?? { durationSec: block.restSec, endsAt: null, pausedRemainingSec: null } : undefined}
        onStart={() => p.onTimer?.('start')}
        onPause={() => p.onTimer?.('pause')}
        onReset={() => p.onTimer?.('reset')}
      />
      <TrackingSheet open={trackOpen} onClose={() => setTrackOpen(false)} value={block.tracking} onChange={(m) => p.onChange({ ...block, tracking: m })} />
      {loadable && <PlateSheet open={platesOpen} onClose={() => setPlatesOpen(false)} weightKg={plateKg ?? (plateSet ? plateSet.weightKg ?? plateSet.suggested?.weightKg ?? null : null)} />}
      {detailOpen&&ex&&<ExercisePage exercise={ex} onClose={()=>setDetailOpen(false)}/>}
    </section>
  );
}
