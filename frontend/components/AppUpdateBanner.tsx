import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { engine } from '../adapters/engine';
import { findAppUpdate, type FoundUpdate } from '../lib/appUpdate';
import { onNative, tell } from '../lib/native';
import { isSafeTapUpdate } from './AppUpdates';
import { toast } from './ui';

/**
 * A new version of the Android app itself (only inside the app; the website updates through AppUpdates).
 * "Update" downloads it in the app, which checks it and hands it to Android's installer ("Update this app?").
 * Android closes the app to install it, so like the web update it waits until nothing is half-done: no workout
 * running, no open form, data saved.
 */
export function AppUpdateBanner() {
  const [update, setUpdate] = useState<FoundUpdate | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let live = true;
    const look = () => void findAppUpdate().then((u) => { if (live) setUpdate(u); });
    look();
    const visible = () => { if (!document.hidden) { setDismissed(false); look(); } };
    document.addEventListener('visibilitychange', visible);
    const off = onNative((e) => {
      if (e.event !== 'appUpdate') return;
      if (e.state === 'downloading') setProgress(`Downloading… ${Math.max(0, Math.min(100, Number(e.percent) || 0))}%`);
      else if (e.state === 'verifying') setProgress('Checking the update…');
      else if (e.state === 'installing') setProgress('Installing…');
      else if (e.state === 'needsPermission') { setProgress(null); toast('Allow “Install unknown apps” for MFD, then tap Update again.'); }
      else if (e.state === 'failed') { setProgress(null); toast(typeof e.message === 'string' ? e.message : 'Couldn’t update. Please try again.'); }
    });
    return () => { live = false; document.removeEventListener('visibilitychange', visible); off(); };
  }, []);

  if (!update || dismissed) return null;

  const start = () => {
    const view = { hash: location.hash, drafts: !!document.querySelector('.sheet,.exercise-page,form'), focused: document.activeElement?.tagName || '' };
    if (!isSafeTapUpdate(engine()?.peek(), view) || engine()?.checkpoint() !== true) {
      toast('Finish what you’re doing (and any workout) first, then tap Update.');
      return;
    }
    if (!update.native) { link.current?.click(); return; } // older apps: the APK downloads in a browser tab
    setProgress('Starting…');
    tell('appUpdateInstall');
  };

  return (
    <div className="update-banner" role="status">
      <span className="update-banner-text">{progress ?? 'New version available'}</span>
      {!progress && <button className="btn btn-primary btn-sm" onClick={start}>Update</button>}
      {!progress && <button className="icon-btn" aria-label="Not now" onClick={() => setDismissed(true)}><X /></button>}
      {update.url && <a ref={link} href={update.url} target="_blank" rel="noopener noreferrer" hidden />}
    </div>
  );
}
