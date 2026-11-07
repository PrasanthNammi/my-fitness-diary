// One open chat, kept up to date incrementally: the first check loads this conversation's newest messages,
// later checks download only messages sent since the last one seen, plus the read state of my own
// messages that the friend has not read yet (reading also shortens their expiry to 5 minutes).
// Messages expire on the server (24 h unread, 5 min after reading); expired ones are dropped here too.

export interface ChatMessage { id: string; sender: string; recipient: string; body: string; sent_at: string; read_at: string | null; expires_at: string }

export const FIRST_LOAD = 300;
async function rows(q: any): Promise<any[]> { const { data, error } = await q; if (error) throw error; return data ?? []; }

export class ChatSync {
  private byId = new Map<string, ChatMessage>();
  private last: string | null = null;
  constructor(private me: string, private friend: string) {}

  /** Only messages between me and this friend, in either direction. */
  private conversation(q: any) {
    return q.or(`and(sender.eq.${this.me},recipient.eq.${this.friend}),and(sender.eq.${this.friend},recipient.eq.${this.me})`);
  }

  private merge(list: Partial<ChatMessage>[]) {
    for (const m of list) {
      if (!m.id) continue;
      const old = this.byId.get(m.id);
      const next = { ...old, ...m } as ChatMessage;
      if (!next.sent_at || !next.body) continue; // a read-state update for a message no longer here
      this.byId.set(m.id, next);
      if (!this.last || next.sent_at > this.last) this.last = next.sent_at;
    }
  }

  /** One check. Safe to call often: after the first load it downloads only what changed. */
  async refresh(c: any, now = Date.now()): Promise<ChatMessage[]> {
    if (this.last === null) {
      const newest = await rows(this.conversation(c.from('mfd_messages').select('*')).order('sent_at', { ascending: false }).limit(FIRST_LOAD));
      this.merge(newest);
    } else {
      // gte, not gt: two messages can share a timestamp; duplicates merge by id.
      const fresh = await rows(this.conversation(c.from('mfd_messages').select('*')).gte('sent_at', this.last).order('sent_at').limit(500));
      this.merge(fresh);
    }
    // The newest 100 of my unread messages (ids go in the request address, so keep it short).
    const waiting = [...this.byId.values()].filter((m) => m.sender === this.me && !m.read_at).sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1)).slice(0, 100).map((m) => m.id);
    if (waiting.length) {
      // Only the ones read since: an idle check downloads nothing.
      const seen = await rows(c.from('mfd_messages').select('id,read_at,expires_at').in('id', waiting).not('read_at', 'is', null));
      this.merge(seen);
    }
    return this.list(now);
  }

  /** A message I just sent (the row the server returned), shown without waiting for the next check. */
  add(m: ChatMessage) { this.merge([m]); }
  /** Rows the server returned after I marked messages as read. */
  updated(list: Partial<ChatMessage>[]) { this.merge(list); }

  /** Messages still visible, oldest first. */
  list(now = Date.now()): ChatMessage[] {
    for (const [id, m] of this.byId) if (new Date(m.expires_at).getTime() <= now) this.byId.delete(id);
    return [...this.byId.values()].sort((a, b) => (a.sent_at < b.sent_at ? -1 : a.sent_at > b.sent_at ? 1 : a.id < b.id ? -1 : 1));
  }
}
