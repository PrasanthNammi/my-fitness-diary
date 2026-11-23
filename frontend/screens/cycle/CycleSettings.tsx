// Settings → Cycle & Health: switch it on or off (data kept); reminders on the phone and how they look; periods from
// Health Connect; the separate AI permission (off by default); the report for a doctor; export; delete everything.
import { useState } from 'react';
import { Bot, Download, FileText, ShieldCheck, Trash2 } from 'lucide-react';
import { useDB } from '../../data/store';
import { cycle, cycleAllowed } from '../../data/cycle';
import { ConfirmSheet, Empty, InfoButton, Segmented, TopBar, toast } from '../../components/ui';
import { navigate } from '../../lib/router';
import { inApp } from '../../lib/native';
import { words, type ReminderStyle } from '../../domain/cycleReminders';
import { cycleExportFiles } from '../../domain/cycleExport';
import { zip } from '../../lib/zip';
import { connectCyclePeriods, cycleAppSupported, saveFile, syncCyclePeriods } from '../../lib/cycleHealth';
import { todayISO } from '../../lib/format';

const STYLES: { value: ReminderStyle; label: string }[] = [{ value: 'discreet', label: 'Discreet' }, { value: 'private', label: 'Private' }, { value: 'detailed', label: 'Detailed' }];

export function CycleSettingsPage() {
  const profile = useDB((d) => d.profile), c = useDB((d) => d.cycle);
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  const s = c.settings, on = !!s?.enabled, hasData = !!(c.days.length || c.meds.length || c.doses.length || c.labs.length || c.conditions.length);
  const style = s?.reminderStyle ?? 'discreet', app = cycleAppSupported(), example = words(style, 'med', `${c.meds[0]?.name ?? 'Levothyroxine'} at ${c.meds[0]?.times[0] ?? '07:00'}`);

  async function healthSync(want: boolean) {
    if (!want) { cycle.setSettings({ healthSync: false }); return; }
    setBusy(true);
    try {
      const r = await connectCyclePeriods();
      if (r !== 'connected') { toast(r === 'install' ? 'Install Health Connect first' : r === 'unsupported' ? 'Health Connect isn’t available on this phone' : 'Not allowed in Health Connect'); return; }
      cycle.setSettings({ healthSync: true });
      const n = await syncCyclePeriods(true);
      toast(n ? `${n} period ${n === 1 ? 'day' : 'days'} added from Health Connect` : 'Connected · no new period days');
    } catch { toast('Could not reach Health Connect'); } finally { setBusy(false); }
  }
  async function exportAll() {
    try { if (await saveFile(`mfd-cycle-health_${todayISO()}.zip`, 'application/zip', zip(cycleExportFiles(c)))) toast('Cycle data saved'); }
    catch { toast('Could not export. Try again.'); }
  }

  return <>
    <TopBar title="Cycle & Health" back="/settings" />
    <div className="screen settings-page cy-settings">
      {!cycleAllowed(profile) ? <Empty title="Only for women">Cycle & Health is available when your profile’s sex is set to female.</Empty> : <>
        <div className="card cy-set">
          <label className="cy-row"><span className="grow"><b>Cycle & Health</b><span>{on ? 'Shown in Progress · only you see it' : 'Off'}</span></span>
            <input type="checkbox" className="switch" checked={on} onChange={(e) => { if (!e.target.checked) cycle.setEnabled(false); else if (s) { cycle.setEnabled(true); navigate('/progress/cycle'); } else setConsent(true); }} /></label>
        </div>
        {on && <>
          <div className="eyebrow cy-seteyebrow">Reminders{!app && <InfoButton title="Reminders" label="About reminders" lines={[inApp() ? 'Update the MFD app (Settings → Health & devices → Phone app) to get reminders.' : 'Reminders are set on your phone by the MFD Android app, so nothing about them goes through a server.', 'Your choices here are saved and work as soon as you use the app.']} />}</div>
          <div className="card cy-set">
            <label className="cy-row"><span className="grow"><b>Medicines</b><span>At the times set for each medicine</span></span>
              <input type="checkbox" className="switch" checked={!!s?.medReminders} onChange={(e) => cycle.setSettings({ medReminders: e.target.checked })} /></label>
            <label className="cy-row"><span className="grow"><b>Period may start soon</b><span>Two days before the estimated range</span></span>
              <input type="checkbox" className="switch" checked={!!s?.periodSoon} onChange={(e) => cycle.setSettings({ periodSoon: e.target.checked })} /></label>
            <label className="cy-row"><span className="grow"><b>Daily log</b><span>{s?.logReminder ? `Every day at ${s.logReminder}` : 'Off'}</span></span>
              {s?.logReminder && <input type="time" className="cy-time" value={s.logReminder} onChange={(e) => e.target.value && cycle.setSettings({ logReminder: e.target.value })} aria-label="Daily log reminder time" />}
              <input type="checkbox" className="switch" checked={!!s?.logReminder} onChange={(e) => cycle.setSettings({ logReminder: e.target.checked ? '21:00' : undefined })} /></label>
            <div className="cy-row cy-stylerow"><span className="grow"><b>How they look</b>
              <span className="cy-preview" aria-label="Example"><i>{example.title}</i>{example.text}</span>
              <span>The lock screen always shows only “MFD · Reminder”.</span></span></div>
            <Segmented label="Reminder style" value={style} onChange={(v) => cycle.setSettings({ reminderStyle: v })} options={STYLES} />
          </div>

          {inApp() && <><div className="eyebrow cy-seteyebrow">Health Connect</div>
            <div className="card cy-set">
              <label className="cy-row"><span className="grow"><b>Periods from Health Connect</b><span>Adds period days from other apps (Samsung Health…) on days you haven’t logged. Never writes there.</span></span>
                <input type="checkbox" className="switch" disabled={busy || !app} checked={!!s?.healthSync} onChange={(e) => void healthSync(e.target.checked)} /></label>
              {!app && <p className="cy-privacy">Update the MFD app (Settings → Health & devices → Phone app) to use this.</p>}
            </div></>}

          <div className="eyebrow cy-seteyebrow">AI assistants</div>
          <div className="card cy-set">
            <label className="cy-row"><span className="cy-ic"><Bot /></span><span className="grow"><b>Let AI assistants read this</b><span>{s?.aiAccess ? 'ChatGPT or Claude, if connected, can read your cycle, medicines, labs and conditions' : 'Off · they can’t see anything from Cycle & Health'}</span></span>
              <input type="checkbox" className="switch" checked={!!s?.aiAccess} onChange={(e) => cycle.setSettings({ aiAccess: e.target.checked })} /></label>
          </div>

          <div className="eyebrow cy-seteyebrow">Your records</div>
          <div className="card cy-set">
            <button className="cy-row cy-linkrow" onClick={() => navigate('/progress/cycle/report')}><span className="cy-ic"><FileText /></span><span className="grow"><b>Report for your doctor</b><span>Cycles, medicines, lab results · print or save as PDF</span></span></button>
            <button className="cy-row cy-linkrow" onClick={() => navigate('/progress/cycle/privacy')}><span className="cy-ic"><ShieldCheck /></span><span className="grow"><b>How your data is handled</b><span>Privacy note: consent, who sees it, where it’s kept, your rights</span></span></button>
            <button className="cy-row cy-linkrow" disabled={!hasData} onClick={() => void exportAll()}><span className="cy-ic"><Download /></span><span className="grow"><b>Export my cycle data</b><span>Everything, as spreadsheet files (.zip)</span></span></button>
          </div>
        </>}
        <p className="cy-privacy">Private to you: never shown to friends or in the Friends feed{s?.aiAccess ? '' : ', and not shared with AI assistants'}. Stored in MFD’s database in the EU, readable only by you, and in MFD’s encrypted backups.</p>
        {!on && hasData && <p className="cy-privacy">Switching off keeps your records; switch on again to see them.</p>}
        {(hasData || c.settings) && <button className="btn btn-soft btn-block cy-delete" onClick={() => setConfirm(true)}><Trash2 aria-hidden="true" />Delete all cycle data</button>}
        <ConfirmSheet open={consent} onClose={() => setConsent(false)} title="Switch on Cycle & Health?" body="MFD will store the cycle and health records you enter (periods, symptoms, medicines, lab results, conditions) so you can see them. Only you see them; AI assistants only if you allow it. Switch off or delete any time. Details: Settings → Cycle & Health → How your data is handled."
          confirmLabel="I agree, switch on" onConfirm={() => { cycle.setEnabled(true); setConsent(false); navigate('/progress/cycle'); }} />
        <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} danger title="Delete all cycle data?" body="Every log, medicine, lab result and condition is removed from MFD, and Cycle & Health switches off. This can’t be undone."
          confirmLabel="Delete everything" onConfirm={() => { cycle.deleteAll(); setConfirm(false); toast('Cycle data deleted'); }} />
      </>}
    </div>
  </>;
}
