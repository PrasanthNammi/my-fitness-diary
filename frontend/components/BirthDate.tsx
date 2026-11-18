// Date of birth (MFD 3.0): the Day / Month / Year pickers used in onboarding and Settings, and the one-time pop-up
// for people whose diary has no date of birth yet. The pop-up can't be skipped (no close, no swipe away); Save stays
// off until the date is complete and gives an age from 13 to 100.
import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Sheet, toast } from './ui';
import { birthYears, checkBirthDate, needsBirthDate, type BirthDateCheck } from '../domain/birthDate';
import { profileRepo } from '../data/repositories';
import { useDB } from '../data/store';
import { MFD3 } from '../lib/release';
import { todayISO } from '../lib/format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface BirthParts { day: string; month: string; year: string }
export const birthParts = (date?: string): BirthParts => {
  const [year = '', month = '', day = ''] = (date || '').split('-');
  return { day: day ? String(Number(day)) : '', month: month ? String(Number(month)) : '', year };
};

/** The three pickers and the line under them ("You're 31", or what's wrong). */
export function BirthDateFields({ value, onChange, id = 'dob', error }: { value: BirthParts; onChange: (v: BirthParts) => void; id?: string; error?: string | null }) {
  const today = todayISO();
  const check = checkBirthDate(value.day, value.month, value.year, today);
  const years = useMemo(() => birthYears(today), [today]);
  const set = (patch: Partial<BirthParts>) => onChange({ ...value, ...patch });
  const hint = check.state === 'ok' ? `You’re ${check.age}` : check.state === 'bad' ? check.message : 'Only used for your targets. Friends never see it.';
  return (
    <div className="field" role="group" aria-labelledby={`${id}-label`}>
      <span className="label" id={`${id}-label`}>Date of birth</span>
      <div className="grid-3">
        <select id={`${id}-day`} className="select" aria-label="Day" value={value.day} onChange={(e) => set({ day: e.target.value })}>
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
        </select>
        <select id={`${id}-month`} className="select" aria-label="Month" value={value.month} onChange={(e) => set({ month: e.target.value })}>
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
        <select id={`${id}-year`} className="select" aria-label="Year" value={value.year} onChange={(e) => set({ year: e.target.value })}>
          <option value="">Year</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>
      <div className={check.state === 'bad' || error ? 'err' : 'small muted'} role="status" aria-live="polite">{error && check.state !== 'ok' ? error : hint}</div>
    </div>
  );
}

/** Shown once to everyone without a date of birth, every time MFD opens, until it's saved. */
export function BirthDatePrompt() {
  const profile = useDB((d) => d.profile);
  const [parts, setParts] = useState<BirthParts>({ day: '', month: '', year: '' });
  const [saving, setSaving] = useState(false);
  if (!needsBirthDate(MFD3, profile)) return null;
  const check: BirthDateCheck = checkBirthDate(parts.day, parts.month, parts.year, todayISO());
  const save = () => {
    if (check.state !== 'ok' || saving) return;
    setSaving(true);
    try {
      profileRepo.setBirthDate(check.date);
      toast(`Saved. Targets now use your age (${check.age}).`);
    } catch (e) {
      toast((e as Error).message);
      setSaving(false);
    }
  };
  return (
    <Sheet open onClose={() => {}} hideClose label="Date of birth"
      footer={<button className="btn btn-primary" style={{ width: '100%' }} disabled={check.state !== 'ok' || saving} onClick={save}>Save</button>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <CalendarDays aria-hidden style={{ width: 28, height: 28, color: 'var(--accent)' }} />
        <h2 style={{ margin: 0 }}>When were you born?</h2>
        <p className="muted" style={{ margin: 0 }}>MFD now uses your date of birth instead of your age, so your calorie targets stay right as you get older. You set it once.</p>
        <BirthDateFields value={parts} onChange={setParts} id="dob-prompt" />
      </form>
    </Sheet>
  );
}
