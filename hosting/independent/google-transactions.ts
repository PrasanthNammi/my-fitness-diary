export type GoogleTransaction = {id:string; verifier:string; next:string; owner:string|null; session:string; expires:number};
export interface GoogleTransactions {
  create(browser:string, flow:GoogleTransaction): Promise<boolean>;
  take(browser:string, id:string): Promise<GoogleTransaction|null>;
}
export const validTransactionId = (value:unknown): value is string => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
// Only used with private DO storage, never an HTTP endpoint or isolate fallback.
export class GoogleTransactionTable {
  constructor(private storage:DurableObjectStorage) {
    storage.sql.exec('CREATE TABLE IF NOT EXISTS google_transactions (browser TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, context TEXT NOT NULL, expires INTEGER NOT NULL)');
  }
  async create(browser:string, flow:GoogleTransaction): Promise<boolean> {
    if (!validTransactionId(browser) || !validTransactionId(flow.id) || !validTransactionId(flow.verifier) || flow.expires<=Date.now() || flow.expires>Date.now()+300_000 || JSON.stringify(flow).length>3000) throw Error('Invalid transaction');
    const created=this.storage.transactionSync(()=>{
      this.storage.sql.exec('DELETE FROM google_transactions WHERE expires<=?',Date.now());
      if (this.storage.sql.exec('SELECT browser FROM google_transactions WHERE browser=?',browser).toArray().length || this.storage.sql.exec<{n:number}>('SELECT count(*) AS n FROM google_transactions').one().n>=128) return false;
      this.storage.sql.exec('INSERT INTO google_transactions VALUES(?,?,?,?)',browser,flow.id,JSON.stringify(flow),flow.expires);
      return true;
    });
    // Cleanup is independent of request expiry enforcement; failure denies initiation.
    if (created) await this.storage.setAlarm(Date.now()+300_000);
    return created;
  }
  async take(browser:string,id:string): Promise<GoogleTransaction|null> {
    if (!validTransactionId(browser) || !validTransactionId(id)) return null;
    return this.storage.transactionSync(()=>{
      const rows=this.storage.sql.exec<{context:string;expires:number}>('SELECT context,expires FROM google_transactions WHERE browser=? AND transaction_id=?',browser,id).toArray();
      if (!rows.length) return null;
      this.storage.sql.exec('DELETE FROM google_transactions WHERE browser=? AND transaction_id=?',browser,id);
      return rows[0].expires>Date.now() ? JSON.parse(rows[0].context) as GoogleTransaction : null;
    });
  }
  async cleanup() {
    this.storage.sql.exec('DELETE FROM google_transactions WHERE expires<=?',Date.now());
    if (this.storage.sql.exec<{n:number}>('SELECT count(*) AS n FROM google_transactions').one().n) await this.storage.setAlarm(Date.now()+300_000);
  }
}
