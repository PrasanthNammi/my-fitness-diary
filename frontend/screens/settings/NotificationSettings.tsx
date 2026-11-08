import { useEffect, useState } from 'react';
import { Notice, TopBar, toast } from '../../components/ui';
import { aiPrefs, android, cachedAiPref, disablePush, enablePush, pushStatus, restAlertsOn, setAiPrefs, setRestAlerts, type PushStatus } from '../../lib/push';

const box = { width: 22, height: 22, accentColor: 'var(--accent)' } as const;

/** Phone notifications: turned on per device; rest alerts per device, AI messages per account. */
export function NotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [rest, setRest] = useState(restAlertsOn);
  const [ai, setAi] = useState<boolean | null>(cachedAiPref);
  useEffect(() => { void pushStatus().then(setStatus); }, []);
  useEffect(() => { if (status === 'on') aiPrefs().then((p) => setAi(p.ai)).catch(() => setAi((v) => v)); }, [status]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try { if (on) await enablePush(); else await disablePush(); setStatus(await pushStatus()); toast(on ? 'Notifications on' : 'Notifications off'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not change notifications'); setStatus(await pushStatus()); }
    finally { setBusy(false); }
  };

  return (
    <>
      <TopBar title="Notifications" back="/settings" />
      <div className="screen settings-page stack">
        {status === 'needs-install' && <Notice>On iPhone, notifications work once MFD is on your Home Screen: tap Share, then “Add to Home Screen”, and open MFD from there.</Notice>}
        {status === 'unsupported' && <Notice>This browser can’t show notifications from MFD.</Notice>}
        {status === 'denied' && <Notice tone="warn">Notifications are blocked for MFD. Allow them in your browser or phone settings, then come back here.</Notice>}
        {(status === 'on' || status === 'off') && (
          <>
            <div className="list">
              <label className="list-row" style={{ cursor: 'pointer' }}>
                <span className="grow row-title">Notifications on this {android() ? 'phone' : 'device'}</span>
                <input type="checkbox" checked={status === 'on'} disabled={busy} onChange={(e) => void toggle(e.target.checked)} style={box} />
              </label>
            </div>
            {status === 'on' && (
              <div className="list">
                <label className="list-row" style={{ cursor: 'pointer' }}>
                  <span className="grow"><span className="row-title">Rest timer</span><span className="small muted" style={{ display: 'block' }}>When rest ends while MFD is in the background{android() ? ', with −15s / +15s buttons' : ''}</span></span>
                  <input type="checkbox" checked={rest} onChange={(e) => { setRestAlerts(e.target.checked); setRest(e.target.checked); }} style={box} />
                </label>
                <label className="list-row" style={{ cursor: 'pointer' }}>
                  <span className="grow"><span className="row-title">AI assistants</span><span className="small muted" style={{ display: 'block' }}>When ChatGPT or Claude adds something to your diary</span></span>
                  <input type="checkbox" checked={!!ai} disabled={ai === null} onChange={(e) => { const v = e.target.checked; setAi(v); setAiPrefs(v).catch(() => { setAi(!v); toast('Could not save. Please try again.'); }); }} style={box} />
                </label>
              </div>
            )}
            <p className="small muted">While MFD is open, rest alerts play a short chime in the app instead.</p>
          </>
        )}
      </div>
    </>
  );
}
