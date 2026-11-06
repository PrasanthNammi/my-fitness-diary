import { useEffect, useState } from 'react';
import { Segmented, TopBar } from '../../components/ui';

type Appearance = 'light' | 'dark' | 'system';
type AppearanceApi = { get(): Appearance; set(v: Appearance): void };
const api = () => (window as unknown as { mfdAppearance?: AppearanceApi }).mfdAppearance;

/** Light, Dark or System, saved on this device (public/legacy/theme.js applies it). */
export function AppearanceSettings() {
  const [value, setValue] = useState<Appearance>(() => api()?.get() ?? 'system');
  useEffect(() => {
    const sync = () => setValue(api()?.get() ?? 'system');
    window.addEventListener('mfd-appearance', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('mfd-appearance', sync); window.removeEventListener('storage', sync); };
  }, []);
  return (
    <>
      <TopBar title="Appearance" back="/settings" bordered />
      <div className="screen stack" style={{ paddingTop: 12 }}>
        <div className="field"><span className="label">Theme</span>
          <Segmented label="Theme" value={value} onChange={(v) => { api()?.set(v); setValue(v); }}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
        </div>
      </div>
    </>
  );
}
