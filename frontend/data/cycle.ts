// Cycle & Health: the only code that changes the cycle parts of the diary (see domain/types CycleData and
// database/diary/17-cycle.sql). Everything stays on this person's own diary; nothing is shared.
import type { CycleData, CycleDay, CycleSettings, HealthCondition, ISODate, LabResult, Medication, MedicationDose, Profile } from '../domain/types';
import { getDB, update } from './store';
import { uid } from '../lib/format';

export const defaultCycleSettings = (): CycleSettings => ({
  enabled: true, reminderStyle: 'discreet', lockDetails: false, aiAccess: false, compare: false, healthSync: false,
  medReminders: false, periodSoon: false, favourites: ['Fatigue', 'Acne', 'Bloating'], customSymptoms: [],
});

/** Cycle & Health is only offered to women (the profile's sex is female). */
export const cycleAllowed = (p: Profile | null | undefined) => p?.sex === 'female';
/** Shown in Progress: allowed and switched on. */
export const cycleOn = (d: { profile: Profile | null; cycle: CycleData }) => cycleAllowed(d.profile) && !!d.cycle.settings?.enabled;

/** True when a day's log holds anything at all (a day with nothing set is the same as not logged). */
export function dayHasData(d: Partial<CycleDay>): boolean {
  return Object.entries(d).some(([k, v]) => k !== 'id' && k !== 'date' && v !== undefined && v !== null && v !== '' &&
    !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0));
}
/** Only what was set: empty values are left out, so the stored day stays small and exact. */
function clean(day: CycleDay): CycleDay {
  const out: any = { id: day.date, date: day.date };
  for (const [k, v] of Object.entries(day)) {
    if (k === 'id' || k === 'date' || v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v)) { const o = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== null && x !== '')); if (Object.keys(o).length) out[k] = o; continue; }
    out[k] = v;
  }
  return out;
}

export const cycle = {
  get: () => getDB().cycle,
  /** Switch the section on or off (off keeps the data; delete is separate). */
  setEnabled(on: boolean) {
    update((d) => { d.cycle.settings = { ...(d.cycle.settings ?? defaultCycleSettings()), enabled: on }; });
  },
  setSettings(patch: Partial<CycleSettings>) {
    update((d) => { d.cycle.settings = { ...(d.cycle.settings ?? defaultCycleSettings()), ...patch }; });
  },
  dayOf: (date: ISODate) => getDB().cycle.days.find((x) => x.date === date) ?? null,
  /** Saves one day's log (replacing that day's). Nothing set = the day is removed again ("not logged"). */
  saveDay(day: CycleDay) {
    const next = clean(day);
    update((d) => {
      const i = d.cycle.days.findIndex((x) => x.date === next.date);
      if (!dayHasData(next)) { if (i >= 0) d.cycle.days.splice(i, 1); return; }
      if (i >= 0) d.cycle.days[i] = next;
      else { d.cycle.days.push(next); d.cycle.days.sort((a, b) => a.date.localeCompare(b.date)); }
    });
  },
  removeDay(date: ISODate) { update((d) => { d.cycle.days = d.cycle.days.filter((x) => x.date !== date); }); },

  saveMed(m: Omit<Medication, 'id'> & { id?: string }): Medication {
    const med: Medication = { ...m, id: m.id ?? 'med-' + uid(), name: m.name.trim() } as Medication;
    update((d) => { const i = d.cycle.meds.findIndex((x) => x.id === med.id); if (i >= 0) d.cycle.meds[i] = med; else d.cycle.meds.push(med); });
    return med;
  },
  removeMed(id: string) { update((d) => { d.cycle.meds = d.cycle.meds.filter((x) => x.id !== id); }); },
  /** Taken / missed for a medicine on a day (and time); null clears it. */
  setDose(medId: string, date: ISODate, time: string | undefined, status: MedicationDose['status'] | null, note?: string) {
    const id = `${medId}:${date}:${time ?? 'day'}`;
    update((d) => {
      d.cycle.doses = d.cycle.doses.filter((x) => x.id !== id);
      if (status) d.cycle.doses.push({ id, medId, date, ...(time ? { time } : {}), status, ...(note ? { note } : {}) });
    });
  },
  doseOf: (medId: string, date: ISODate, time?: string) => getDB().cycle.doses.find((x) => x.id === `${medId}:${date}:${time ?? 'day'}`) ?? null,

  saveLab(l: Omit<LabResult, 'id'> & { id?: string }): LabResult {
    const lab = { ...l, id: l.id ?? 'lab-' + uid() } as LabResult;
    update((d) => { const i = d.cycle.labs.findIndex((x) => x.id === lab.id); if (i >= 0) d.cycle.labs[i] = lab; else d.cycle.labs.push(lab); });
    return lab;
  },
  removeLab(id: string) { update((d) => { d.cycle.labs = d.cycle.labs.filter((x) => x.id !== id); }); },

  saveCondition(c: Omit<HealthCondition, 'id'> & { id?: string }): HealthCondition {
    const cond = { ...c, id: c.id ?? 'cond-' + uid() } as HealthCondition;
    update((d) => { const i = d.cycle.conditions.findIndex((x) => x.id === cond.id); if (i >= 0) d.cycle.conditions[i] = cond; else d.cycle.conditions.push(cond); });
    return cond;
  },
  removeCondition(id: string) { update((d) => { d.cycle.conditions = d.cycle.conditions.filter((x) => x.id !== id); }); },

  /** Deletes every Cycle & Health record and setting (the section switches off). */
  deleteAll() { update((d) => { d.cycle = { settings: null, days: [], meds: [], doses: [], labs: [], conditions: [] }; }); },
};
