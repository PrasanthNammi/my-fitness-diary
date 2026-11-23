// The next-period estimate (Cycle & Health). Step 5 of the build replaces this with the published method (Li et al.
// 2021; Urteaga et al. 2021); until then there is never an estimate, only an honest "not enough data yet".
import type { ReactNode } from 'react';
import type { CycleDay, ISODate } from './types';

export type Estimate = { state: 'range'; from: ISODate; to: ISODate; about: ReactNode[] } | { state: 'insufficient'; about: ReactNode[] };

export function estimateNext(_days: CycleDay[], _today: ISODate): Estimate {
  return { state: 'insufficient', about: [
    'An estimate of your next period appears once you have logged a few periods.',
    'It will always be a range, never an exact date, and it is not for preventing or planning pregnancy.',
    'If something seems unusual, talk to your doctor.',
  ] };
}
