// A list row that clears with a swipe to the left (like Gmail) and opens with a tap. Buttons inside keep their own
// clicks. Vertical scrolling is left to the page (only a mostly-horizontal drag moves the row).
import { useRef, useState, type ReactNode } from 'react';
import { EyeOff } from 'lucide-react';

export function SwipeRow({ children, onOpen, onClear, clearLabel = 'Clear', as = 'li', className = '', label }: { children: ReactNode; onOpen?: () => void; onClear: () => void; clearLabel?: string; as?: 'li' | 'div'; className?: string; label?: string }) {
  const [dx, setDx] = useState(0), [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null), row = useRef<HTMLElement>(null);
  const Tag = as;
  const clear = () => { setGone(true); setDx(-(row.current?.offsetWidth ?? 400)); setTimeout(onClear, 180); };
  return (
    <Tag ref={row as never} className={`swipe-row${gone ? ' gone' : ''} ${className}`}>
      <span className="swipe-under" aria-hidden="true"><EyeOff />{clearLabel}</span>
      <div className="swipe-front" style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform .18s ease' }}
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button,a')) return; start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null }; }}
        onPointerMove={(e) => {
          const s = start.current; if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x, my = e.clientY - s.y;
          if (s.horizontal === null && Math.hypot(mx, my) > 8) { s.horizontal = Math.abs(mx) > Math.abs(my); if (s.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
          if (s.horizontal) setDx(Math.min(0, mx));
        }}
        onPointerUp={(e) => {
          const s = start.current; start.current = null; if (!s) return;
          const width = row.current?.offsetWidth ?? 400;
          if (s.horizontal && -dx > width * 0.35) clear();
          else { setDx(0); if (!s.horizontal && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) onOpen?.(); }
        }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
        role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} aria-label={label}
        onKeyDown={(e) => { if (onOpen && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(); } if (e.key === 'Delete' || e.key === 'Backspace') clear(); }}>
        {children}
      </div>
    </Tag>
  );
}
