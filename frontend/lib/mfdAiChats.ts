// MFD AI chats, kept on this device only (localStorage), each for one week after its last message. Deleting a chat
// never touches the diary: what was added stays added.
export const WEEK = 7 * 864e5, MAX_CHATS = 60;
const STORE = 'mfd-ai-chats', OLD = 'mfd-ai-chat';

export interface StoredChat<M = unknown> { id: string; title: string; startedAt: number; updatedAt: number; added: number; msgs: M[] }

const read = (): StoredChat[] => { try { const l = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
const write = (l: StoredChat[]) => { try { localStorage.setItem(STORE, JSON.stringify(l)); } catch { /* full or private mode: not kept */ } };

/** Chats from the last 7 days, newest first. Older ones are deleted here (every time MFD AI opens). */
export function loadChats<M = unknown>(now = Date.now()): StoredChat<M>[] {
  const list = read(); let moved = false;
  // The single chat kept before history existed becomes one chat in the list (then the old key goes).
  try {
    const old = JSON.parse(localStorage.getItem(OLD) || 'null');
    if (Array.isArray(old) && old.length) { list.push({ id: 'before-history', title: chatTitle(old), startedAt: now, updatedAt: now, added: countAdded(old), msgs: old }); moved = true; }
    localStorage.removeItem(OLD);
  } catch { /* nothing to move */ }
  const kept = list.filter((c) => c && typeof c.updatedAt === 'number' && now - c.updatedAt < WEEK && Array.isArray(c.msgs) && c.msgs.length)
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
  if (moved || kept.length !== list.length) write(kept);
  return kept as StoredChat<M>[];
}

/** First thing the person wrote, as the chat's name. */
export function chatTitle(msgs: unknown[]): string {
  const first = msgs.find((m) => (m as { from?: string }).from === 'me') as { text?: string } | undefined;
  const t = (first?.text ?? 'New chat').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? t.slice(0, 57) + '…' : t;
}
/** How many cards in the chat were added (or saved / started). */
export const countAdded = (msgs: unknown[]) => msgs.reduce((n: number, m) => n + (((m as { cards?: { state?: string }[] }).cards ?? []).filter((c) => c.state === 'added').length), 0);

/** Saves a chat (nothing is kept until something was written). */
export function saveChat<M>(id: string, msgs: M[], now = Date.now()) {
  if (!msgs.length) return;
  const list = read().filter((c) => c.id !== id), prev = read().find((c) => c.id === id);
  list.unshift({ id, title: chatTitle(msgs), startedAt: prev?.startedAt ?? now, updatedAt: now, added: countAdded(msgs), msgs });
  write(list.slice(0, MAX_CHATS));
}
export const deleteChat = (id: string) => write(read().filter((c) => c.id !== id));
export const deleteAllChats = () => write([]);

/** "Today", "Yesterday" or the weekday, for grouping the history list. */
export function chatDay(t: number, now = Date.now()): string {
  const d = new Date(t), n = new Date(now), days = Math.round((new Date(n.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'long' });
}
