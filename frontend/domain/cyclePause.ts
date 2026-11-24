// "Right now" in Cycle & Health settings: on hormonal contraception, in pregnancy or while breastfeeding the natural
// cycle is changed or stopped, so the period estimate (and the "period may start soon" reminder) pauses. Logging,
// symptoms, medicines and the report keep working.
import type { CyclePause } from './types';

export const PAUSES: { value: CyclePause; label: string; sub?: string }[] = [
  { value: 'hormonal', label: 'Hormonal contraception', sub: 'Pill, ring, patch, hormonal IUD, implant or injection' },
  { value: 'pregnant', label: 'Pregnant' },
  { value: 'breastfeeding', label: 'Breastfeeding' },
];

export const pauseLabel = (p: CyclePause) => PAUSES.find((x) => x.value === p)?.label ?? '';

export const PAUSE_ABOUT = [
  'Hormonal contraception, pregnancy and breastfeeding change or stop the natural cycle, so an estimate from your past cycles would be misleading.',
  'Bleeding you log is still saved and shown, including withdrawal bleeds on the pill.',
  'Choose “None of these” when it no longer applies. Estimates start again from your next logged period; the paused time is left out.',
];
