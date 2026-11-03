import {GoogleTransactionTable, type GoogleTransaction} from './google-transactions';
import {DurableObject} from 'cloudflare:workers';

const limits = {mcp: 25, auth: 20, discovery: 10} as const;
type Counter = {scope: string; window: number; used: number};
// One fixed object name per staging service, NOT one object per isolate or user.
// Four fixed rows maximum; no tokens, account IDs, IPs or emails are persisted.
export class AbuseCoordinator extends DurableObject<Record<string, unknown>> {
  private google:GoogleTransactionTable;
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.google=new GoogleTransactionTable(ctx.storage);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS counters (scope TEXT PRIMARY KEY, window INTEGER NOT NULL, used INTEGER NOT NULL)');
  }
  async createGoogle(browser:string,flow:GoogleTransaction) {return this.google.create(browser,flow);}
  async takeGoogle(browser:string,id:string) {return this.google.take(browser,id);}
  async alarm() {await this.google.cleanup();}
  async consume(kind: string): Promise<boolean> {
    if (!Object.hasOwn(limits,kind)) throw Error('Unknown budget');
    return this.ctx.storage.transactionSync(() => {
      const rows = this.ctx.storage.sql.exec<Counter>('SELECT scope, window, used FROM counters').toArray();
      if (rows.length > 4 || rows.some(row => row.scope !== 'global' && !Object.hasOwn(limits,row.scope))) throw Error('Unexpected quota state');
      // Backward clock movement must not reset counters.
      const window = Math.max(Math.floor(Date.now()/60_000),...rows.map(row=>row.window));
      const used = (scope: string) => rows.find(row=>row.scope===scope && row.window===window)?.used || 0;
      if (used('global') >= 30 || used(kind) >= limits[kind as keyof typeof limits]) return false;
      for (const scope of ['global',kind]) this.ctx.storage.sql.exec('INSERT INTO counters(scope,window,used) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET window=excluded.window,used=excluded.used',scope,window,used(scope)+1);
      return true;
    });
  }
}
