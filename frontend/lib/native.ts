// The MFD Android app: its WebView gives this page a `MFDNative` message channel (only on the MFD site's own
// origin). Through it the page asks for notification permission and the app's push token, and drives the
// native rest-timer notification. In a browser `MFDNative` doesn't exist and everything here is a no-op.
type Channel = { postMessage(message: string): void; addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void };
export type NativeEvent = { event: string; [key: string]: unknown };

const channel = (): Channel | null => (typeof window === 'undefined' ? null : ((window as unknown as { MFDNative?: Channel }).MFDNative ?? null));
/** True inside the MFD Android app. */
export const inApp = () => channel() !== null;

let seq = 0, wired = false;
const waiting = new Map<number, (reply: Record<string, unknown>) => void>();
const listeners = new Set<(e: NativeEvent) => void>();

function wire(c: Channel) {
  if (wired) return;
  wired = true;
  c.addEventListener('message', (e) => {
    let m: Record<string, unknown>;
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (typeof m.id === 'number' && waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id); }
    else if (typeof m.event === 'string') for (const l of listeners) l(m as NativeEvent);
  });
  // Lets the app send events (a notification button) back to this page.
  c.postMessage(JSON.stringify({ op: 'hello' }));
}

/** A request with a reply; rejects outside the app or when the app doesn't answer. */
export function ask<T extends Record<string, unknown>>(op: string, args: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<T> {
  const c = channel();
  if (!c) return Promise.reject(Error('Not in the MFD app'));
  wire(c);
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(Error('The app did not answer')); }, timeoutMs);
    waiting.set(id, (reply) => { clearTimeout(timer); resolve(reply as T); });
    c.postMessage(JSON.stringify({ ...args, op, id }));
  });
}

/** A one-way message (no reply). */
export function tell(op: string, args: Record<string, unknown> = {}) {
  const c = channel();
  if (!c) return;
  wire(c);
  c.postMessage(JSON.stringify({ ...args, op }));
}

/** Events from the app; returns the unsubscribe. */
export function onNative(listener: (e: NativeEvent) => void) {
  const c = channel();
  if (c) wire(c);
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
