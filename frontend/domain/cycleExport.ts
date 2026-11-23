// Cycle & Health export (the person's right to a copy of their data): one CSV per kind of record, everything stored.
import type { CycleData } from './types';
import { csv } from './exportCsv';

const join = (xs?: string[]) => (xs?.length ? xs.join('; ') : '');
const sym = (s?: Record<string, number>) => (s ? Object.entries(s).map(([k, v]) => `${k} (${['', 'mild', 'moderate', 'severe'][v] ?? v})`).join('; ') : '');

export function cycleExportFiles(c: CycleData): { name: string; text: string }[] {
  const meds = new Map(c.meds.map((m) => [m.id, m.name]));
  return [
    { name: 'cycle-days.csv', text: csv(
      ['date', 'nothing to note', 'bleeding', 'flow', 'clots', 'products', 'pain (0-10)', 'pain where', 'pain limited activities', 'symptoms', 'mood (1-5)', 'energy (1-5)',
        'stress (1-5, 5 calm)', 'focus (1-5)', 'feelings', 'sleep', 'LH test', 'temperature (°C)', 'cervical mucus', 'pregnancy test', 'note', 'from'],
      c.days.map((d) => [d.date, d.nothing ? 'yes' : '', d.bleeding, d.flow, d.clots == null ? '' : d.clots ? 'yes' : 'no', d.products, d.pain, join(d.painSites),
        d.painLimits == null ? '' : d.painLimits ? 'yes' : 'no', sym(d.symptoms), d.mood, d.energy, d.stress, d.focus, join(d.feelings), join(d.sleepNotes),
        d.fertility?.lh, d.fertility?.bbt, d.fertility?.mucus, d.fertility?.pregnancy, d.note, d.source === 'health_connect' ? 'Health Connect' : 'MFD'])) },
    { name: 'medicines.csv', text: csv(['name', 'dose', 'unit', 'times', 'days', 'start', 'end', 'reminder', 'notes'],
      c.meds.map((m) => [m.name, m.dose, m.unit, join(m.times), m.days, m.start, m.end, m.reminder ? 'yes' : 'no', m.notes])) },
    { name: 'medicine-doses.csv', text: csv(['date', 'time', 'medicine', 'status', 'note'],
      c.doses.map((x) => [x.date, x.time, meds.get(x.medId) ?? x.medId, x.status, x.note])) },
    { name: 'lab-results.csv', text: csv(['date', 'test', 'value', 'unit', 'lab range low', 'lab range high', 'note'],
      c.labs.map((l) => [l.date, l.test === 'other' ? l.name ?? 'other' : l.test.toUpperCase().replace('FT', 'Free T'), l.value, l.unit, l.low, l.high, l.note])) },
    { name: 'conditions.csv', text: csv(['condition', 'status', 'since', 'note'],
      c.conditions.map((x) => [x.kind === 'other' ? x.name ?? 'other' : x.kind, x.status, x.since, x.note])) },
    { name: 'cycle-settings.csv', text: csv(['setting', 'value'], Object.entries(c.settings ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : String(v)])) },
  ];
}
