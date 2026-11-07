import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronLeft, CircleAlert, Info, MoreHorizontal, X, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';

import { goBack } from '../../lib/router';
import { aiSource } from '../../domain/aiSource';
import type { AddedBy } from '../../domain/types';

// ── Logo ─────────────────────────────────────────────────────────
// The original MFD wordmark (navy letters, two-tone flame) from public/legacy. Dark mode shows the
// same drawing with light lettering (logo-dark.svg, logo-full-dark.svg); the flame is unchanged.
function ClassicLogo({ file, width, ratio, alt }: { file: 'logo' | 'logo-full'; width: number; ratio: number; alt: string }) {
  const h = Math.round(width * ratio);
  return (
    <span className="logo-classic" style={{ width }}>
      <img className="logo-classic-light" src={`/legacy/${file}.svg`} width={width} height={h} alt={alt} />
      <img className="logo-classic-dark" src={`/legacy/${file}-dark.svg`} width={width} height={h} alt="" />
    </span>
  );
}
/** "MFD" with the flame (header, onboarding). */
export function LogoMark({ width = 86 }: { width?: number }) {
  return <ClassicLogo file="logo" width={width} ratio={228 / 340} alt="MFD" />;
}
/** The full lockup with "My Fitness Diary · Lift · Eat · Track" (sign-in, sidebar, settings). */
export function LogoFull({ width = 220 }: { width?: number }) {
  return <ClassicLogo file="logo-full" width={width} ratio={300 / 340} alt="My Fitness Diary" />;
}

// ── Top bar ──────────────────────────────────────────────────────
export function TopBar({
  title, back, actions, center, bordered, onBack,
}: { title?: ReactNode; back?: string; actions?: ReactNode; center?: boolean; bordered?: boolean; onBack?: () => void }) {
  return (
    <header className={`topbar${bordered ? ' bordered' : ''}`}>
      {back !== undefined && (
        <button className="icon-btn" aria-label="Back" onClick={() => (onBack ? onBack() : goBack(back))}>
          <ChevronLeft />
        </button>
      )}
      {center ? <h1 className="title-center ellipsis">{title}</h1> : <h1 className="ellipsis">{title}</h1>}
      {!center && <div className="spacer" />}
      {actions}
      {center && !actions && back !== undefined && <span style={{ width: 44 }} />}
    </header>
  );
}

// ── Sheet: bottom sheet on phones, dialog on desktop ─────────────
let openSheets = 0;
export function Sheet({
  open, onClose, title, children, footer, size = 'auto', headerActions, label,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'full' | 'wide';
  headerActions?: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    openSheets++;
    document.body.style.overflow = 'hidden';
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const sheets = document.querySelectorAll('.sheet');
        if (sheets[sheets.length - 1] === ref.current) {
          e.stopPropagation();
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current;
      el?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      openSheets--;
      if (openSheets === 0) document.body.style.overflow = '';
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div
        ref={ref}
        className={`sheet${size === 'full' ? ' full' : size === 'wide' ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? label : undefined}
        tabIndex={-1}
      >
        <div className="sheet-handle" />
        {(title || headerActions) && (
          <div className="sheet-head">
            <h2 id={titleId} className="ellipsis">{title}</h2>
            {headerActions}
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <X />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

// ── Overflow menu (rendered as a sheet of actions) ───────────────
export interface MenuAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}
/** The (i) next to a title: explanations live here instead of on the screen. */
export function InfoButton({ title, lines, label }: { title: string; lines: ReactNode[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn info-btn" aria-label={label ?? `About ${title}`} onClick={() => setOpen(true)}><Info /></button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="info-lines">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </Sheet>
    </>
  );
}

export function OverflowMenu({ title, actions, label = 'More options', small }: { title?: string; actions: MenuAction[]; label?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`icon-btn${small ? ' sm' : ''}`} aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <MoreHorizontal />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} label={label}>
        <div role="menu">
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              className={`menu-item${a.danger ? ' danger' : ''}`}
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                setTimeout(a.onSelect, 0);
              }}
            >
              <a.icon /> {a.label}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

// ── Confirm ──────────────────────────────────────────────────────
export function ConfirmSheet({
  open, onClose, title, body, confirmLabel, onConfirm, danger,
}: { open: boolean; onClose: () => void; title: string; body?: ReactNode; confirmLabel: string; onConfirm: () => void; danger?: boolean }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            data-autofocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {body && <div className="muted" style={{ fontSize: 14 }}>{body}</div>}
    </Sheet>
  );
}

// ── Select via sheet ─────────────────────────────────────────────
export interface Opt<T extends string> { value: T; label: string; hint?: string }
export function SelectField<T extends string>({
  label, value, options, onChange, placeholder = 'Select', id,
}: { label?: string; value: T | null; options: Opt<T>[]; onChange: (v: T) => void; placeholder?: string; id?: string }) {
  const [open, setOpen] = useState(false);
  const gen = useId();
  const fid = id ?? gen;
  const current = options.find((o) => o.value === value);
  return (
    <div className="field">
      {label && <label htmlFor={fid}>{label}</label>}
      <button id={fid} type="button" className="select-btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className={`ellipsis${current ? '' : ' muted'}`}>{current?.label ?? placeholder}</span>
        <ChevronDown />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
        <div className="option-list" role="radiogroup">
          {options.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={o.value === value}
              className="option"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="stack-sm" style={{ gap: 1 }}>
                <span className="strong">{o.label}</span>
                {o.hint && <span className="small muted">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="check" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

// ── Inputs ───────────────────────────────────────────────────────
export function Field({
  label, hint, error, children, htmlFor,
}: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : tone === 'warn' ? TriangleAlert : tone === 'success' ? CircleCheck : Info;
  return (
    <div className={`notice ${tone === 'info' ? '' : tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

/** Small label on entries an AI assistant added through the connector. */
export function AiBadge({ addedBy }: { addedBy?: AddedBy }) {
  const name = aiSource(addedBy);
  return name ? <span className="badge ai">Added by {name}</span> : null;
}

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <div className="t">{title}</div>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar${value > max && max > 0 ? ' over' : ''}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Toasts ───────────────────────────────────────────────────────
type ToastListener = (msg: string) => void;
const toastListeners = new Set<ToastListener>();
export function toast(msg: string) {
  toastListeners.forEach((l) => l(msg));
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const l: ToastListener = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2400);
    };
    toastListeners.add(l);
    return () => {
      toastListeners.delete(l);
      clearTimeout(t);
    };
  }, []);
  return (
    <div className="toast-wrap" aria-live="polite">
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
