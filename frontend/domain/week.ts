// The first day of the week (Settings → Units → Week starts on). Every weekly view and number in the app
// (date strip, calendars, last-week recap, weekly charts, food week, friends' weeks and streaks) uses this.
// Values are JavaScript day numbers: 1 = Monday (default), 0 = Sunday, 6 = Saturday.
export type WeekStart = 0 | 1 | 6;
let start: WeekStart = 1;
export const weekStartDay = (): WeekStart => start;
export function setWeekStartDay(value: unknown) { start = value === 0 || value === 6 ? value : 1; }
/** Days from the start of the week to `date` (0–6). */
export const daysIntoWeek = (date: Date, s: number = start) => (date.getDay() - s + 7) % 7;
/** Weekday names in week order, e.g. ['Mon', …] or ['Sun', …]. */
export function weekdayNames(style: 'short' | 'narrow' = 'short', s: number = start) {
  // 2024-01-07 was a Sunday (day 0).
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((s + i) % 7)).toLocaleDateString(undefined, { weekday: style }));
}
