import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ISODate } from '../domain/types';
import { addDays, fromISODate, todayISO, toISODate } from '../lib/format';
import { profileRepo } from '../data/repositories';
import { useDB } from '../data/store';
import { Sheet } from './ui';
import { daysIntoWeek, weekdayNames } from '../domain/week';

const mondayOf = (d: ISODate) => addDays(d, -daysIntoWeek(fromISODate(d)));
const weeksBetween = (a: ISODate, b: ISODate) => Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / (7 * 86_400_000));
const CHUNK = 26; // weeks added each time you swipe back to the start

/** Days with logged food or a workout (dots in the strip and the calendar). */
function useLoggedDays() {
  const diary = useDB((d) => d.diary);
  const workouts = useDB((d) => d.workouts);
  return useMemo(() => {
    const s = new Set(diary.map((e) => e.date));
    workouts.forEach((w) => s.add(toISODate(new Date(w.startedAt))));
    return s;
  }, [diary, workouts]);
}

/**
 * Date heading + week strip. Tap the heading for a month calendar (with Today); swipe the strip for earlier weeks.
 * Dots mark days with logged food or workouts. Future days can't be picked.
 */
export function DateStrip({ date }: { date: ISODate }) {
  const today = todayISO();
  const logged = useLoggedDays();
  const [open, setOpen] = useState(false);
  const pick = (d: ISODate) => profileRepo.setSelectedDate(d > today ? today : d);
  const thisWeek = mondayOf(today);
  // Weeks shown: from `first` up to this week. Grows backwards when you reach the start.
  const [first, setFirst] = useState(() => addDays(mondayOf(date < today ? date : today), -7 * CHUNK));
  useEffect(() => { if (mondayOf(date) < first) setFirst(addDays(mondayOf(date), -7 * CHUNK)); }, [date, first]);
  const weeks = useMemo(() => Array.from({ length: weeksBetween(first, thisWeek) + 1 }, (_, i) => addDays(first, i * 7)), [first, thisWeek]);
  const scroller = useRef<HTMLDivElement>(null);
  const pendingShift = useRef(0);
  // Keep the selected week in view (and keep the position after weeks are added in front).
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    if (pendingShift.current) { el.scrollLeft += pendingShift.current * el.clientWidth; pendingShift.current = 0; return; }
    el.scrollTo({ left: weeksBetween(first, mondayOf(date)) * el.clientWidth, behavior: 'instant' as ScrollBehavior });
  }, [date, first]);
  const onScroll = () => {
    const el = scroller.current;
    if (el && el.scrollLeft < 8 && !pendingShift.current) { pendingShift.current = CHUNK; setFirst((f) => addDays(f, -7 * CHUNK)); }
  };
  const dt = fromISODate(date);
  const heading = `${dt.toLocaleDateString(undefined, { weekday: 'long' })} · ${dt.getDate()} ${dt.toLocaleDateString(undefined, { month: 'short' })} ${dt.getFullYear()}`;

  return (
    <div className="date-picker">
      <button type="button" className="date-heading" aria-label={`Choose date. Selected ${heading}`} onClick={() => setOpen(true)}>
        <CalendarDays aria-hidden="true" /><span>{heading}</span>
      </button>
      <div ref={scroller} className="date-weeks no-scrollbar" onScroll={onScroll} aria-label="Browse weeks">
        {weeks.map((monday) => (
          <div key={monday} className="date-strip" role="group" aria-label={`Week of ${fromISODate(monday).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(monday, i), dt = fromISODate(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={`date-cell${d === today ? ' today' : ''}`}
                  aria-pressed={d === date}
                  disabled={d > today}
                  aria-label={dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  onClick={() => pick(d)}
                >
                  <span className="dow">{dt.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="dom tnum">{dt.getDate()}</span>
                  <span className={`dot${logged.has(d) ? ' on' : ''}`} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose a date" label="Choose a date"
        headerActions={<button type="button" className="btn btn-ghost btn-sm" onClick={() => { pick(today); setOpen(false); }}>Today</button>}>
        <MonthCalendar selected={date} today={today} logged={logged} onPick={(d) => { pick(d); setOpen(false); }} />
      </Sheet>
    </div>
  );
}

/** Month grid (from the chosen week start) with dots on logged days; swipe or use the arrows to change month. */
function MonthCalendar({ selected, today, logged, onPick }: { selected: ISODate; today: ISODate; logged: Set<string>; onPick: (d: ISODate) => void }) {
  const [month, setMonth] = useState(() => selected.slice(0, 7));
  const touch = useRef<number | null>(null);
  const first = fromISODate(month + '-01');
  const shift = (n: number) => { const d = new Date(first.getFullYear(), first.getMonth() + n, 1); const m = toISODate(d).slice(0, 7); if (m <= today.slice(0, 7)) setMonth(m); };
  const start = addDays(month + '-01', -daysIntoWeek(first));
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((daysIntoWeek(first) + daysInMonth) / 7) * 7;
  const names = weekdayNames('short').map((n) => n.slice(0, 2));
  return (
    <div className="month-cal" onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => { const x = e.changedTouches[0]?.clientX; if (x !== undefined && touch.current !== null && Math.abs(x - touch.current) > 45) shift(x < touch.current ? 1 : -1); touch.current = null; }}>
      <div className="month-cal-head">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></button>
        <span className="strong" aria-live="polite">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
        <button type="button" className="icon-btn" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => shift(1)}><ChevronRight /></button>
      </div>
      <div className="month-cal-grid" role="grid">
        {names.map((n, i) => <span key={i} className="month-cal-dow" aria-hidden="true">{n}</span>)}
        {Array.from({ length: cells }, (_, i) => {
          const d = addDays(start, i), inMonth = d.slice(0, 7) === month;
          if (!inMonth) return <span key={d} />;
          return (
            <button key={d} type="button" className={`month-cal-day${d === today ? ' today' : ''}`} aria-pressed={d === selected} disabled={d > today}
              aria-label={fromISODate(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onClick={() => onPick(d)}>
              <span className="tnum">{fromISODate(d).getDate()}</span>
              <span className={`dot${logged.has(d) ? ' on' : ''}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
