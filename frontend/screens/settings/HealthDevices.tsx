import { useEffect, useState } from 'react';
import { Check, ExternalLink, HeartPulse, RefreshCw, Smartphone, Watch } from 'lucide-react';
import { ConfirmSheet, TopBar, toast } from '../../components/ui';
import { connectHealth, forgetHealth, healthWriteSettings, healthWriteSupported, setHealthWrite, useHealth, type WriteKind } from '../../lib/health';
import { appVersion, findAppUpdate, type FoundUpdate } from '../../lib/appUpdate';
import { watchSupported } from '../../lib/watch';
import { ask, tell } from '../../lib/native';

const READS: [string, string][] = [['sleep', 'Sleep'], ['steps', 'Steps'], ['heart', 'Heart rate in workouts'], ['restingHr', 'Resting heart rate'], ['hrv', 'Heart-rate variability'], ['weight', 'Weight'], ['bodyFat', 'Body fat']];
const WRITES: [WriteKind, string, string][] = [['workouts', 'Workouts', 'With the heart rate from your watch'], ['food', 'Food', 'Meals with calories and macros']];

function Status({ state }: { state: 'on' | 'off' | 'reconnect' | 'away' | 'none' }) {
  const label = { on: 'Connected', off: 'Not connected', reconnect: 'Reconnect', away: 'Not nearby', none: 'Not found' }[state];
  return <span className={`hd-status ${state}`}>{label}</span>;
}

/** Settings → Health & devices (Android app): Samsung Health (what MFD reads and saves), the Galaxy Watch, the phone app. */
export function HealthDevices() {
  const [health, refresh] = useHealth();
  const [reads, setReads] = useState<string[]>([]);
  const [writes, setWrites] = useState(healthWriteSettings);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [watches, setWatches] = useState<{ name: string; nearby: boolean }[] | null>(null);
  const [update, setUpdate] = useState<FoundUpdate | null | 'checking' | 'none'>(null);

  useEffect(() => {
    if (health !== 'on' && health !== 'reconnect') { setReads([]); return; }
    void ask<{ reads?: string[] }>('healthStatus', {}, 10_000).then((r) => setReads(Array.isArray(r.reads) ? r.reads : [])).catch(() => undefined);
  }, [health]);
  useEffect(() => {
    if (!watchSupported()) return;
    const look = () => void ask<{ watches?: { name: string; nearby: boolean }[] }>('watchStatus', {}, 10_000).then((r) => setWatches(r.watches ?? [])).catch(() => setWatches([]));
    look();
    const t = setInterval(look, 15_000);
    return () => clearInterval(t);
  }, []);

  const connect = async () => {
    setBusy('connect');
    try {
      const r = await connectHealth();
      toast(r === 'connected' ? 'Health Connect connected' : r === 'install' ? 'Install Health Connect from the Play Store, then tap again.' : r === 'unsupported' ? 'Health Connect isn’t available on this phone.' : 'Nothing was allowed.');
    } catch { toast('Couldn’t connect. Please try again.'); }
    finally { setBusy(null); refresh(); }
  };
  const toggleWrite = async (kind: WriteKind, on: boolean) => {
    setBusy(kind);
    try {
      const r = await setHealthWrite(kind, on);
      if (r === 'denied') toast('Saving wasn’t allowed in Health Connect.');
      else if (r === 'on') toast(kind === 'workouts' ? 'Workouts will be saved to Health Connect' : 'Food will be saved to Health Connect');
    } catch { toast('Couldn’t change this. Please try again.'); }
    finally { setBusy(null); setWrites(healthWriteSettings()); }
  };
  const disconnect = async () => {
    setLeaving(false);
    await setHealthWrite('workouts', false); await setHealthWrite('food', false);
    forgetHealth();
    try { await ask('healthDisconnect', {}, 15_000); } catch { /* the permissions can also be removed in Health Connect */ }
    setWrites(healthWriteSettings()); refresh();
    toast('Health Connect disconnected');
  };
  const check = async () => {
    setUpdate('checking');
    const u = await findAppUpdate();
    setUpdate(u ?? 'none');
    if (!u) toast('You’re up to date');
  };
  const connected = health === 'on' || health === 'reconnect';
  const watch = watches?.find((w) => w.nearby) ?? watches?.[0] ?? null;

  return (
    <>
      <TopBar title="Health & devices" back="/settings" bordered />
      <div className="screen hd-page">
        <section className="card card-pad hd-card" aria-label="Health Connect">
          <div className="hd-head">
            <span className="hd-icon health"><HeartPulse /></span>
            <span className="grow"><b>Health Connect</b><span className="sub">Samsung Health, Fitbit, Google Fit and other apps</span></span>
            {health !== null && <Status state={health === 'on' ? 'on' : health === 'reconnect' ? 'reconnect' : 'off'} />}
          </div>
          {health === null ? <p className="small muted">Checking…</p> : !connected ? (
            <>
              <p className="small muted hd-text">Sleep, steps, heart rate, resting heart rate, HRV, weight and body fat, for your recovery, weigh-ins and workouts.</p>
              <button className="btn btn-primary btn-block" disabled={busy === 'connect'} onClick={() => void connect()}>Connect to Health Connect</button>
            </>
          ) : (
            <>
              {health === 'reconnect' && <button className="btn btn-primary btn-block hd-gap" disabled={busy === 'connect'} onClick={() => void connect()}>Reconnect to Health Connect</button>}
              <p className="hd-eyebrow">MFD reads</p>
              <ul className="hd-reads">
                {READS.map(([k, label]) => <li key={k} className={reads.includes(k) ? 'on' : ''}>{reads.includes(k) ? <Check aria-hidden="true" /> : <span className="hd-off" aria-hidden="true" />}<span className="grow">{label}</span>{!reads.includes(k) && <span className="muted small">Not allowed</span>}</li>)}
              </ul>
              {healthWriteSupported() && <>
                <p className="hd-eyebrow">MFD saves</p>
                {WRITES.map(([k, label, sub]) => (
                  <label key={k} className="hd-switch">
                    <span className="grow"><span className="row-title">{label}</span><span className="sub">{sub}</span></span>
                    <input type="checkbox" checked={writes[k]} disabled={busy === k} onChange={(e) => void toggleWrite(k, e.target.checked)} aria-label={`Save ${label.toLowerCase()} to Health Connect`} />
                  </label>
                ))}
              </>}
              <button className="btn btn-secondary btn-block hd-gap" onClick={() => void ask('healthManage', {}, 10_000).then(() => setTimeout(refresh, 1500))}><ExternalLink aria-hidden="true" />Manage in Health Connect</button>
              <button className="btn btn-ghost btn-block hd-danger" onClick={() => setLeaving(true)}>Disconnect</button>
            </>
          )}
        </section>

        {watchSupported() && (
          <section className="card card-pad hd-card" aria-label="Galaxy Watch">
            <div className="hd-head">
              <span className="hd-icon watch"><Watch /></span>
              <span className="grow"><b>Galaxy Watch</b><span className="sub">{watch ? watch.name : 'MFD watch app'}</span></span>
              {watches !== null && <Status state={watch ? (watch.nearby ? 'on' : 'away') : 'none'} />}
            </div>
            <p className="small muted hd-text">{watches === null ? 'Looking for your watch…' : watch ? (watch.nearby ? 'Start routines, log sets and quick logs on your wrist; heart rate comes with each workout.' : 'Your watch is paired but not nearby. What you log on it arrives when it’s back.') : 'No watch with the MFD app found. Live heart rate in workouts needs the MFD watch app.'}</p>
          </section>
        )}

        <section className="card card-pad hd-card" aria-label="Phone app">
          <div className="hd-head">
            <span className="hd-icon"><Smartphone /></span>
            <span className="grow"><b>Phone app</b><span className="sub tnum">Version {appVersion() ?? '–'}</span></span>
            {update && typeof update === 'object'
              ? (update.native ? <button className="btn btn-primary btn-sm" onClick={() => tell('appUpdateInstall')}>Update to {update.version}</button> : <a className="btn btn-primary btn-sm" href={update.url}>Get {update.version}</a>)
              : <button className="btn btn-secondary btn-sm" disabled={update === 'checking'} onClick={() => void check()}><RefreshCw aria-hidden="true" className={update === 'checking' ? 'spin' : ''} />{update === 'checking' ? 'Checking…' : 'Check for updates'}</button>}
          </div>
        </section>
      </div>
      <ConfirmSheet open={leaving} onClose={() => setLeaving(false)} danger title="Disconnect Health Connect?" body="MFD stops reading and saving, and gives back its Health Connect permissions. What’s already in your diary and in Health Connect stays." confirmLabel="Disconnect" onConfirm={() => void disconnect()} />
    </>
  );
}
