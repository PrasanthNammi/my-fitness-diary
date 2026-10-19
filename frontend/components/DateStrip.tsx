import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ISODate } from '../domain/types';
import { addDays, dayLabel, fromISODate, todayISO, toISODate } from '../lib/format';
import { profileRepo } from '../data/repositories';
import { useDB } from '../data/store';

/** Week strip (Mon–Sun) around the selected date. Dots mark days with logged food or workouts. */
export function DateStrip({ date }: { date: ISODate }) {
  const diary = useDB((d) => d.diary);
  const workouts = useDB((d) => d.workouts);
  const today = todayISO();
  const days = useMemo(() => {
    const d = fromISODate(date);
    const monday = addDays(date, -((d.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [date]);
  const logged = useMemo(() => {
    const s = new Set(diary.map((e) => e.date));
    workouts.forEach((w) => s.add(toISODate(new Date(w.startedAt))));
    return s;
  }, [diary, workouts]);
  const pick = (d: ISODate) => profileRepo.setSelectedDate(d);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <button className="icon-btn" aria-label="Previous week" onClick={() => pick(addDays(date, -7))}><ChevronLeft /></button>
        <button className="btn btn-ghost btn-sm" onClick={() => pick(today)} aria-label={`Selected ${dayLabel(date)}. Jump to today`}>
          <span className="strong">{dayLabel(date)}</span>
          {date !== today && <span className="small accent-text">· Today</span>}
        </button>
        <button className="icon-btn" aria-label="Next week" onClick={() => pick(addDays(date, 7))}><ChevronRight /></button>
      </div>
      <div className="date-strip" role="group" aria-label="Choose day">
        {days.map((d) => {
          const dt = fromISODate(d);
          return (
            <button
              key={d}
              className={`date-cell${d === today ? ' today' : ''}`}
              aria-pressed={d === date}
              aria-label={dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              onClick={() => pick(d)}
            >
              <span className="dow">{dt.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              <span className="dom tnum">{dt.getDate()}</span>
              <span className={`dot${logged.has(d) ? ' on' : ''}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
