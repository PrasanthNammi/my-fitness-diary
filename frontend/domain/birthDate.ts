// Date of birth (MFD 3.0): stored once as YYYY-MM-DD; the age is always worked out from it, so calorie targets stay
// right as someone gets older. MFD is for ages 13 to 100 (the database enforces the same range).
import type { ISODate } from './types';

export const MIN_AGE = 13;
export const MAX_AGE = 100;

/** Whole years between the birth date and `today` (both YYYY-MM-DD). */
export function ageOn(birth: ISODate, today: ISODate): number {
  const [by, bm, bd] = birth.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** A real calendar date as YYYY-MM-DD, or null (31 February, empty parts…). */
export function isoDate(year: number, month: number, day: number): ISODate | null {
  if (![year, month, day].every(Number.isInteger) || month < 1 || month > 12 || day < 1) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A stored date of birth that can be used (valid date, age 13–100 today), else undefined. */
export function usableBirthDate(value: unknown, today: ISODate): ISODate | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (isoDate(y, m, d) !== value) return undefined;
  const age = ageOn(value, today);
  return age >= MIN_AGE && age <= MAX_AGE ? value : undefined;
}

export type BirthDateCheck = { state: 'empty' } | { state: 'bad'; message: string } | { state: 'ok'; date: ISODate; age: number };

/** What the Day / Month / Year pickers add up to. */
export function checkBirthDate(day: string, month: string, year: string, today: ISODate): BirthDateCheck {
  if (!day || !month || !year) return { state: 'empty' };
  const date = isoDate(Number(year), Number(month), Number(day));
  if (!date) return { state: 'bad', message: 'That date doesn’t exist' };
  const age = ageOn(date, today);
  if (age < MIN_AGE || age > MAX_AGE) return { state: 'bad', message: `MFD is for ages ${MIN_AGE} to ${MAX_AGE}` };
  return { state: 'ok', date, age };
}

/** The years the Year picker offers, newest first. */
export function birthYears(today: ISODate): number[] {
  const y = Number(today.slice(0, 4));
  return Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => y - MIN_AGE - i);
}

/** Whether the one-time pop-up is due: 3.0 is on, the person finished onboarding and has no date of birth yet. */
export const needsBirthDate = (on: boolean, profile: { birthDate?: string } | null) => on && !!profile && !profile.birthDate;
