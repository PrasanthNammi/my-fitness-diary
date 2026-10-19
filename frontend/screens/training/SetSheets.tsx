import { useEffect, useState } from 'react';
import { Check, Minus, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { RestTimer, SetEntry, SetType, TrackingMode } from '../../domain/types';
import { SET_TYPE_LABEL, TRACKING_LABEL, timerRemaining, timerState } from '../../domain/training';
import { Sheet } from '../../components/ui';
import { mss, parseMss } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { TRACKING_MODES } from '../../data/repositories';

const TYPE_ORDER: SetType[] = ['warmup', 'normal', 'failure', 'drop'];
const TYPE_BADGE: Record<SetType, string> = { warmup: 'W', normal: '1', failure: 'F', drop: 'D' };

export function SetTypeSheet({
  open, onClose, set, onChange, onDelete, showRpe,
}: {
  open: boolean;
  onClose: () => void;
  set: SetEntry | null;
  onChange: (patch: Partial<SetEntry>) => void;
  onDelete?: () => void;
  showRpe: boolean;
}) {
  if (!set) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Set type">
      <div className="option-list" role="radiogroup" aria-label="Set type">
        {TYPE_ORDER.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={set.type === t}
            className="option"
            onClick={() => {
              onChange({ type: t });
              onClose();
            }}
          >
            <span className={`set-label ${t}`} style={{ width: 28, height: 28 }}>{TYPE_BADGE[t]}</span>
            <span className="strong">{SET_TYPE_LABEL[t]}</span>
            {set.type === t && <Check className="check" />}
          </button>
        ))}
      </div>
      {showRpe && (
        <div style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 6 }}>RPE</div>
          <div className="chips" role="group" aria-label="RPE">
            {[6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => (
              <button key={r} className="chip" aria-pressed={set.rpe === r} onClick={() => onChange({ rpe: set.rpe === r ? null : r })}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
      {onDelete && (
        <button
          className="menu-item danger"
          style={{ marginTop: 12 }}
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          <Trash2 /> Delete set
        </button>
      )}
    </Sheet>
  );
}

export function TrackingSheet({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: TrackingMode; onChange: (m: TrackingMode) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Tracking">
      <div className="option-list" role="radiogroup">
        {TRACKING_MODES.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={m === value}
            className="option"
            onClick={() => {
              onChange(m);
              onClose();
            }}
          >
            <span className="strong">{TRACKING_LABEL[m]}</span>
            {m === value && <Check className="check" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * Rest editor. In the routine editor only the duration is edited; during a workout
 * the same sheet also controls that exercise's own timer.
 */
export function RestSheet({
  open, onClose, durationSec, onDuration, timer, onStart, onPause, onReset,
}: {
  open: boolean;
  onClose: () => void;
  durationSec: number;
  onDuration: (sec: number) => void;
  timer?: RestTimer;
  onStart?: () => void;
  onPause?: () => void;
  onReset?: () => void;
}) {
  const [text, setText] = useState(mss(durationSec));
  const [error, setError] = useState<string | null>(null);
  const live = !!timer;
  const now = useNow(250, open && live);
  useEffect(() => {
    if (open) {
      setText(mss(durationSec));
      setError(null);
    }
  }, [open, durationSec]);

  const commit = (raw: string) => {
    const v = parseMss(raw);
    if (v === null || v > 3600) {
      setError('Enter a time like 2:30 (up to 60:00).');
      return;
    }
    setError(null);
    onDuration(v);
    setText(mss(v));
  };
  const set = (sec: number) => {
    const v = Math.max(0, Math.min(3600, sec));
    onDuration(v);
    setText(mss(v));
    setError(null);
  };
  const state = timerState(timer, now);
  const remaining = timerRemaining(timer, now);

  return (
    <Sheet open={open} onClose={onClose} title="Rest timer">
      <div className="stack">
        {live && (
          <div className="center-pad" style={{ padding: '8px 0 4px' }}>
            <div className="tnum" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em', color: state === 'running' ? 'var(--accent)' : 'var(--ink)' }} aria-live="off">
              {mss(state === 'idle' ? durationSec : remaining)}
            </div>
            <div className="small muted">{state === 'running' ? 'Resting' : state === 'paused' ? 'Paused' : state === 'done' ? 'Rest over' : 'Ready'}</div>
          </div>
        )}
        <div className="field">
          <label htmlFor="rest-input">Rest duration</label>
          <div className="row">
            <button className="icon-btn" style={{ border: '1px solid var(--line)' }} aria-label="Subtract 15 seconds" onClick={() => set(durationSec - 15)}>
              <Minus />
            </button>
            <input
              id="rest-input"
              className="input tnum"
              style={{ textAlign: 'center', fontWeight: 700 }}
              value={text}
              inputMode="text"
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby="rest-hint"
              onChange={(e) => setText(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <button className="icon-btn" style={{ border: '1px solid var(--line)' }} aria-label="Add 15 seconds" onClick={() => set(durationSec + 15)}>
              <Plus />
            </button>
          </div>
          {error ? <div className="err" role="alert">{error}</div> : <div id="rest-hint" className="hint">m:ss — for example 2:30</div>}
        </div>
        <div className="chips">
          {[60, 90, 120, 180].map((p) => (
            <button key={p} className="chip" aria-pressed={durationSec === p} onClick={() => set(p)}>
              {p < 120 ? `${p}s` : mss(p)}
            </button>
          ))}
          <button className="chip" aria-pressed={durationSec === 0} onClick={() => set(0)}>Off</button>
        </div>
        {live && (
          <div className="grid-2">
            {state === 'running' ? (
              <button className="btn btn-dark" onClick={onPause}><Pause /> Pause</button>
            ) : (
              <button className="btn btn-primary" onClick={onStart} disabled={durationSec === 0 && state !== 'paused'}>
                <Play /> {state === 'paused' ? 'Resume' : 'Start'}
              </button>
            )}
            <button className="btn btn-secondary" onClick={onReset} disabled={state === 'idle'}>
              <RotateCcw /> Reset
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
