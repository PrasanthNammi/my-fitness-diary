// Settings → Cycle & Health: switch it on or off (data kept), and delete every record. Reminders, privacy choices,
// reports and export are added in later steps of the build.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { cycle, cycleAllowed } from '../../data/cycle';
import { ConfirmSheet, Empty, TopBar, toast } from '../../components/ui';
import { navigate } from '../../lib/router';

export function CycleSettingsPage() {
  const profile = useDB((d) => d.profile), c = useDB((d) => d.cycle);
  const [confirm, setConfirm] = useState(false);
  const on = !!c.settings?.enabled, hasData = !!(c.days.length || c.meds.length || c.doses.length || c.labs.length || c.conditions.length);
  return <>
    <TopBar title="Cycle & Health" back="/settings" />
    <div className="screen settings-page cy-settings">
      {!cycleAllowed(profile) ? <Empty title="Only for women">Cycle & Health is available when your profile’s sex is set to female.</Empty> : <>
        <div className="card cy-set">
          <label className="cy-row"><span className="grow"><b>Cycle & Health</b><span>{on ? 'Shown in Progress · only you see it' : 'Off'}</span></span>
            <input type="checkbox" className="switch" checked={on} onChange={(e) => { cycle.setEnabled(e.target.checked); if (e.target.checked) navigate('/progress/cycle'); }} /></label>
        </div>
        {on && <div className="card cy-set">
          <label className="cy-row"><span className="grow"><b>Compare with my training</b><span>Workouts by cycle week in Insights, only for you</span></span>
            <input type="checkbox" className="switch" checked={!!c.settings?.compare} onChange={(e) => cycle.setSettings({ compare: e.target.checked })} /></label>
        </div>}
        <p className="cy-privacy">Private to you: never shown to friends or in the Friends feed, and not shared with AI assistants. Stored in MFD’s database in the EU, readable only by you, and in MFD’s encrypted backups.</p>
        {!on && hasData && <p className="cy-privacy">Switching off keeps your records; switch on again to see them.</p>}
        {(hasData || c.settings) && <button className="btn btn-soft btn-block cy-delete" onClick={() => setConfirm(true)}><Trash2 aria-hidden="true" />Delete all cycle data</button>}
        <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="Delete all cycle data?" body="Every log, medicine, lab result and condition is removed from MFD, and Cycle & Health switches off. This can’t be undone."
          confirmLabel="Delete everything" onConfirm={() => { cycle.deleteAll(); setConfirm(false); toast('Cycle data deleted'); }} />
      </>}
    </div>
  </>;
}
