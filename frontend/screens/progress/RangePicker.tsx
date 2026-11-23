// 1M / 3M / 6M / 1Y / All: the same picker on every Progress tab and in Cycle Insights.
import { RANGES, type RangeDays } from '../../domain/progressStats';

export function RangePicker({ value, onChange }: { value: RangeDays; onChange: (r: RangeDays) => void }) {
  return <div className="progress-range" role="group" aria-label="Time range">
    {RANGES.map((r) => <button key={r.days} type="button" aria-pressed={value === r.days} onClick={() => onChange(r.days)}>{r.label}</button>)}
  </div>;
}
