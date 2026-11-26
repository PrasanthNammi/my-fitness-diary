import {GoogleTransactionTable, type GoogleTransaction} from './google-transactions';
import {DurableObject} from 'cloudflare:workers';

// Requests per minute. Signed-in AI traffic (`mcp`) is limited per connection, so one busy
// chat or one stranger can never use up everyone else's budget. Anonymous traffic is limited
// per address (hashed, kept in memory only) and, as a whole, by a stored total per kind.
// One AI chat turn was measured at ~30 requests/minute (26 Nov 2026).
// AI apps send token refreshes and first contacts for many users from a few server addresses,
// so per-address budgets leave room for that.
export const PER_KEY = {discovery: 60, auth: 120, anon: 60, mcp: 120, address: 600, failures: 20} as const;
export const TOTAL = {discovery: 600, auth: 600, anon: 300} as const;
const KINDS = ['discovery', 'auth', 'anon', 'mcp'] as const;
type Counter = {scope: string; window: number; used: number};
const CAPACITY = 20_000;

// One fixed object name per service, NOT one object per isolate or user.
// Stored rows: at most one per anonymous kind. No tokens, account IDs, IPs or emails are persisted;
// per-address/per-connection counts are SHA-256 hashes held in memory for the current minute.
export class AbuseCoordinator extends DurableObject<Record<string, unknown>> {
  private google:GoogleTransactionTable;
  private minute = 0;
  private counts = new Map<string, number>();
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.google=new GoogleTransactionTable(ctx.storage);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS counters (scope TEXT PRIMARY KEY, window INTEGER NOT NULL, used INTEGER NOT NULL)');
  }
  async createGoogle(browser:string,flow:GoogleTransaction) {return this.google.create(browser,flow);}
  async takeGoogle(browser:string,id:string) {return this.google.take(browser,id);}
  async alarm() {await this.google.cleanup();}
  private window(stored: number[]) {
    // Backward clock movement must not reset counters.
    const window = Math.max(Math.floor(Date.now()/60_000), this.minute, ...stored);
    if (window !== this.minute) {this.minute = window; this.counts.clear();}
    return window;
  }
  private take(key: string, limit: number) {
    const used = this.counts.get(key) || 0;
    if (used >= limit) return false;
    if (!this.counts.has(key) && this.counts.size >= CAPACITY) return false;
    this.counts.set(key, used + 1);
    return true;
  }
  /** kind: discovery | auth | anon (no token) | mcp (token). address/connection: hashes. */
  async consume(kind: string, address = '', connection = ''): Promise<boolean> {
    if (!(KINDS as readonly string[]).includes(kind)) throw Error('Unknown budget');
    return this.ctx.storage.transactionSync(() => {
      const rows = this.ctx.storage.sql.exec<Counter>('SELECT scope, window, used FROM counters').toArray();
      if (rows.some(row => !Object.hasOwn(TOTAL,row.scope) && row.scope !== 'global' && row.scope !== 'mcp')) throw Error('Unexpected quota state');
      const window = this.window(rows.map(row=>row.window));
      if (kind === 'mcp') {
        // Shared AI-app servers send many users from few addresses: a high per-address cap, a
        // block for addresses sending many bad tokens, and the real limit per connection.
        if ((this.counts.get('failures:'+address) || 0) >= PER_KEY.failures) return false;
        if ((this.counts.get('mcp:'+connection) || 0) >= PER_KEY.mcp) return false;
        return this.take('address:'+address, PER_KEY.address) && this.take('mcp:'+connection, PER_KEY.mcp);
      }
      const k = kind as keyof typeof TOTAL;
      const total = rows.find(row=>row.scope===k && row.window===window)?.used || 0;
      if (total >= TOTAL[k] || (this.counts.get(k+':'+address) || 0) >= PER_KEY[k]) return false;
      if (!this.take(k+':'+address, PER_KEY[k])) return false;
      this.ctx.storage.sql.exec('INSERT INTO counters(scope,window,used) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET window=excluded.window,used=excluded.used',k,window,total+1);
      return true;
    });
  }
  /** A token was refused: counts toward blocking that address for the rest of the minute. */
  async failed(address: string): Promise<void> {
    this.window([]);
    const key = 'failures:'+address;
    if (this.counts.has(key) || this.counts.size < CAPACITY) this.counts.set(key, (this.counts.get(key) || 0) + 1);
  }
}
