// The Progress time range (1M … All) stays the same across Progress tabs and Cycle Insights for this visit.
import type { RangeDays } from '../domain/progressStats';
let current: RangeDays = 90;
export const getProgressRange = () => current;
export const setProgressRange = (r: RangeDays) => { current = r; };
