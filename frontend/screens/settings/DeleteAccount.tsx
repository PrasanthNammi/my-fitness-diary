// Settings → Account → Delete account (GDPR Art. 17): says exactly what goes and what stays, asks for DELETE to be
// typed, removes the person's own photo files (storage lets each person remove their own), then the account and
// everything in it on the server (database/account-delete.sql, all or nothing), then forgets it on this device.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Sheet, toast } from '../../components/ui';
import { client, engine, openTool } from '../../adapters/engine';

const BUCKETS = ['mfd-avatars', 'mfd-workout-photos', 'catalogue-photos'];

/** Removes this person's files in each photo bucket (their own folder). Throws if any can't be removed. */
async function removeMyPhotos(uid: string) {
  const c = client() as any;
  for (const b of BUCKETS) {
    for (let round = 0; round < 20; round++) {
      const { data, error } = await c.storage.from(b).list(uid, { limit: 100 });
      if (error) throw error;
      const names = (data ?? []).filter((f: { name?: string; id?: string | null }) => f.name && f.id).map((f: { name: string }) => `${uid}/${f.name}`);
      if (!names.length) break;
      const r = await c.storage.from(b).remove(names);
      if (r.error) throw r.error;
    }
  }
}

export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState(''), [busy, setBusy] = useState(false);
  const ok = typed.trim() === 'DELETE';
  async function run() {
    const uid = engine()?.peek().user?.id;
    if (!ok || !uid) return;
    setBusy(true);
    try {
      await removeMyPhotos(uid);
      const { error } = await (client() as any).rpc('mfd_delete_account', { confirm: 'DELETE' });
      if (error) throw error;
      onClose();
      openTool('accountDeleted');
    } catch {
      toast('Could not delete your account. Nothing was deleted from your diary; check your connection and try again.');
    } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={() => { if (!busy) { setTyped(''); onClose(); } }} title="Delete account">
      <div className="delete-account">
        <p><b>This permanently deletes your MFD account and everything in it.</b> It can’t be undone.</p>
        <ul>
          <li>Your diary: workouts, routines, food, body, recovery, Cycle & Health and settings</li>
          <li>Your profile, friends, messages, likes, comments, shared workouts and photos</li>
          <li>Connections to ChatGPT or Claude</li>
        </ul>
        <p className="muted small">Foods and exercises you added to the shared catalogue stay for others, without your name. MFD’s encrypted backups are deleted within 30 days. Want a copy first? Settings → Data → Export.</p>
        <label className="delete-confirm" htmlFor="delete-account-confirm">Type <b>DELETE</b> to confirm</label>
        <input id="delete-account-confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} />
        <button className="btn btn-danger btn-block" disabled={!ok || busy} onClick={() => void run()}><Trash2 aria-hidden="true" />{busy ? 'Deleting…' : 'Delete my account'}</button>
      </div>
    </Sheet>
  );
}
