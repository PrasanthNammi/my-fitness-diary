// Settings → Export: pick areas and dates; each area becomes its own CSV file, several come as one .zip
// (domain/exportCsv.ts, lib/zip.ts). The full JSON backup (for restoring in MFD) stays as a link at the bottom.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Sheet, toast } from '../../components/ui';
import { getDB } from '../../data/store';
import { exercises } from '../../data/repositories';
import { EXPORT_AREAS, exportFiles, rangeLabel, type DateRange, type ExportArea, type WorkoutFormat } from '../../domain/exportCsv';
import { zip } from '../../lib/zip';
import { ask, inApp } from '../../lib/native';
import { appVersion, newer } from '../../lib/appUpdate';
import { todayISO } from '../../lib/format';

const AREA: Record<ExportArea, [string, string]> = {
  workouts: ['Workouts', 'Every set: exercise, weight, reps, time, distance'],
  nutrition: ['Nutrition', 'Every food and water: meal, amount, kcal, macros'],
  body: ['Body', 'Weight, body fat and measurements'],
  recovery: ['Recovery & sleep', 'Sleep, steps, resting heart rate, HRV, check-ins'],
  routines: ['Routines', 'Your routines with planned sets'],
};
type Preset = '30' | '90' | 'year' | 'all' | 'custom';
const PRESETS: [Preset, string][] = [['30', 'Last 30 days'], ['90', 'Last 3 months'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom…']];
/** The phone app saves binary files (.zip) from this version on. */
export const SAVE_FILES_FROM = '2.0.4';

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
function presetRange(p: Preset, custom: DateRange): DateRange {
  const today = todayISO();
  if (p === '30') return { from: daysAgo(29), to: today };
  if (p === '90') return { from: daysAgo(89), to: today };
  if (p === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
  if (p === 'custom') return custom;
  return { from: null, to: null };
}
const base64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const readable = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function ExportSheet({ open, onClose, onFullBackup }: { open: boolean; onClose: () => void; onFullBackup: () => void }) {
  const [areas, setAreas] = useState<Set<ExportArea>>(() => new Set(['workouts', 'nutrition', 'body']));
  const [preset, setPreset] = useState<Preset>('90');
  const [custom, setCustom] = useState<DateRange>({ from: daysAgo(29), to: todayISO() });
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<DateRange>(custom);
  const [format, setFormat] = useState<WorkoutFormat>('mfd');
  const [busy, setBusy] = useState(false);
  const n = areas.size;
  const draftOk = !!draft.from && !!draft.to && draft.from <= draft.to && draft.to <= todayISO();

  const toggle = (a: ExportArea) => setAreas((s) => { const x = new Set(s); x.has(a) ? x.delete(a) : x.add(a); return x; });
  const choose = (p: Preset) => { if (p === 'custom') { setDraft(custom); setPicking(true); } else setPreset(p); };

  async function download() {
    const v = appVersion();
    if (inApp() && (!v || newer(SAVE_FILES_FROM, v))) { toast('Update the MFD app to export files (Settings → Health & devices → Phone app)'); return; }
    setBusy(true);
    try {
      const d = getDB(), range = presetRange(preset, custom);
      const files = exportFiles({ workouts: d.workouts, routines: d.routines, folders: d.folders, diary: d.diary, weights: d.weights, checkins: d.checkins,
        water: d.water, unit: d.settings.weightUnit, exerciseName: (id) => exercises.byId(id)?.name ?? id }, [...areas], range, format);
      const one = files.length === 1 ? files[0]! : null;
      const name = one ? one.name : `mfd-export_${rangeLabel(range)}.zip`;
      const bytes = one ? new TextEncoder().encode(one.text) : zip(files);
      const mime = one ? 'text/csv' : 'application/zip';
      if (inApp()) {
        const r = await ask<{ saved?: boolean }>('save', { name, mime, base64: base64(bytes) }, 600_000);
        if (r.saved) { toast(files.length > 1 ? `${files.length} files saved` : 'File saved'); onClose(); }
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      onClose();
    } catch {
      toast('Could not export. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Export">
        <div className="export-sheet">
          <div className="eyebrow">What</div>
          <div className="export-areas">
            {EXPORT_AREAS.map((a) => (
              <button key={a} type="button" className="export-area" aria-pressed={areas.has(a)} onClick={() => toggle(a)}>
                <span className="export-box" aria-hidden="true">{areas.has(a) && <Check />}</span>
                <span className="grow"><span className="strong">{AREA[a][0]}</span><span className="small muted">{AREA[a][1]}</span></span>
              </button>
            ))}
          </div>
          <div className="eyebrow">Dates</div>
          <div className="chips" role="group" aria-label="Dates">
            {PRESETS.map(([p, label]) => (
              <button key={p} type="button" className="chip" aria-pressed={preset === p} onClick={() => choose(p)}>
                {p === 'custom' && preset === 'custom' && custom.from && custom.to ? `${readable(custom.from)} – ${readable(custom.to)}` : label}
              </button>
            ))}
          </div>
          {areas.has('workouts') && <>
            <div className="eyebrow">Workouts file</div>
            <div className="chips" role="group" aria-label="Workouts file">
              <button type="button" className="chip" aria-pressed={format === 'mfd'} onClick={() => setFormat('mfd')}>MFD (one row per set)</button>
              <button type="button" className="chip" aria-pressed={format === 'hevy'} onClick={() => setFormat('hevy')}>Hevy/Strong format</button>
            </div>
          </>}
          <button type="button" className="btn btn-primary btn-block" disabled={!n || busy} onClick={() => void download()}>
            {!n ? 'Pick something to export' : busy ? 'Preparing…' : `Download ${n} file${n > 1 ? 's' : ''}`}
          </button>
          {n > 1 && <p className="small muted export-note">Comes as one .zip with a file for each</p>}
          <button type="button" className="btn btn-link export-full" onClick={onFullBackup}>Full backup of everything (to restore in MFD)</button>
        </div>
      </Sheet>
      <Sheet open={picking} onClose={() => setPicking(false)} title="Choose dates">
        <div className="export-dates">
          <label className="field"><span className="small muted">From</span>
            <input id="export-from" className="input" type="date" max={todayISO()} value={draft.from ?? ''} onChange={(e) => setDraft({ ...draft, from: e.target.value || null })} /></label>
          <label className="field"><span className="small muted">To</span>
            <input id="export-to" className="input" type="date" max={todayISO()} value={draft.to ?? ''} onChange={(e) => setDraft({ ...draft, to: e.target.value || null })} /></label>
          {draft.from && draft.to && draft.from > draft.to && <p className="small export-error">“From” must be on or before “To”.</p>}
          <button type="button" className="btn btn-primary btn-block" disabled={!draftOk} onClick={() => { setCustom(draft); setPreset('custom'); setPicking(false); }}>Use these dates</button>
        </div>
      </Sheet>
    </>
  );
}
