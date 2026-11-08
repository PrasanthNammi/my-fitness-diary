import { useEffect, useState } from 'react';
import { Notice, TopBar, toast } from '../../components/ui';
import { android, cachedPushPrefs, disablePush, enablePush, pushPrefs, pushStatus, restAlertsOn, setPushPrefs, setRestAlerts, type PushPrefs, type PushStatus } from '../../lib/push';

const box = { width: 22, height: 22, accentColor: 'var(--accent)' } as const;

/** Phone notifications: turned on per device; rest alerts per device; AI and friends per account. */
export function NotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [rest, setRest] = useState(restAlertsOn);
  const [prefs, setPrefs] = useState<PushPrefs | null>(cachedPushPrefs);
  useEffect(() => { void pushStatus().then(setStatus); }, []);
  useEffect(() => { if (status === 'on') pushPrefs().then(setPrefs).catch(() => setPrefs((v) => v)); }, [status]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try { if (on) await enablePush(); else await disablePush(); setStatus(await pushStatus()); toast(on ? 'Notifications on' : 'Notifications off'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not change notifications'); setStatus(await pushStatus()); }
    finally { setBusy(false); }
  };
  const change = (key: keyof PushPrefs, value: boolean) => {
    setPrefs((p) => ({ ...(p ?? { ai: true, social: true, messages: true }), [key]: value }));
    setPushPrefs({ [key]: value }).catch(() => { setPrefs((p) => (p ? { ...p, [key]: !value } : p)); toast('Could not save. Please try again.'); });
  };
  const row = (key: keyof PushPrefs, title: string, sub: string) => (
    <label className="list-row" style={{ cursor: 'pointer' }}>
      <span className="grow"><span className="row-title">{title}</span><span className="small muted" style={{ display: 'block' }}>{sub}</span></span>
      <input type="checkbox" aria-label={title} checked={!!prefs?.[key]} disabled={!prefs} onChange={(e) => change(key, e.target.checked)} style={box} />
    </label>
  );

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
                <input type="checkbox" aria-label="Notifications on this device" checked={status === 'on'} disabled={busy} onChange={(e) => void toggle(e.target.checked)} style={box} />
              </label>
            </div>
            {status === 'on' && (
              <>
                <div className="list">
                  <label className="list-row" style={{ cursor: 'pointer' }}>
                    <span className="grow"><span className="row-title">Rest timer</span><span className="small muted" style={{ display: 'block' }}>When rest ends while MFD is in the background{android() ? ', with −15s / +15s buttons' : ''}</span></span>
                    <input type="checkbox" aria-label="Rest timer" checked={rest} onChange={(e) => { setRestAlerts(e.target.checked); setRest(e.target.checked); }} style={box} />
                  </label>
                  {row('ai', 'AI assistants', 'When ChatGPT or Claude adds something to your diary')}
                </div>
                <div className="eyebrow settings-group-title">Friends</div>
                <div className="list">
                  {row('social', 'Likes and comments', 'When friends like or comment on your workouts')}
                  {row('messages', 'Messages', 'Who sent you a message (never the text)')}
                </div>
              </>
            )}
            <p className="small muted">While MFD is open, rest alerts play a short chime in the app instead.</p>
          </>
        )}
      </div>
    </>
  );
}
