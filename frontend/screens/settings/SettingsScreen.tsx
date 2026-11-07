import {getIdentity} from '../../adapters/profile';
import { useEffect, useRef, useState } from 'react';
import {
  Calculator, ChevronRight, Database, Download, KeyRound, LogOut, Plug, Ruler, Sparkles, Upload, User, UserRound,
} from 'lucide-react';
import { ConfirmSheet, Field, LogoFull, Notice, Segmented, SelectField, Sheet, TopBar, toast } from '../../components/ui';
import { InfoButton } from '../../components/ui';
import { emptyDB, getDB, isDB, replaceDB, useDB, type DB } from '../../data/store';
import { body, profileRepo } from '../../data/repositories';
import { auth } from '../../adapters/auth';
import { ACTIVITY_FACTORS, GOALS } from '../../domain/nutrition';
import type { CoachProvider } from '../../domain/types';
import { useTargets } from '../../data/selectors';
import { fmtInt, mss, parseMss, todayISO } from '../../lib/format';
import { navigate } from '../../lib/router';
import { draftFromProfile, ProfileFields, profileFromDraft, validateDraft, type ProfileDraft } from '../auth/Onboarding';

export function SettingsScreen({ section }: { section: string | null }) {
  switch (section) {
    case 'profile': return <ProfileSettings />;
    case 'targets': return <TargetDetails />;
    case 'units': return <UnitSettings />;
    case 'account': return <AccountSettings />;
    case 'data': return <DataSettings />;
    case 'services': return <ServicesSettings />;
    case 'coach': return <CoachSettings />;
    default: return <SettingsHome />;
  }
}

function SettingsHome() {
  const account = useDB((d) => d.account);
  const profile = useDB((d) => d.profile);
  const t = useTargets();
  const items: [string, string, string, typeof User][] = [
    ['profile', 'Profile & goals', profile ? `${GOALS[profile.goal].label} · ${profile.trainingDaysPerWeek} days/week` : '', UserRound],
    ['targets', 'Nutrition targets', t ? `${fmtInt(t.targets.kcal)} kcal · how it’s calculated` : '', Calculator],
    ['units', 'Units', '', Ruler],
    ['account', 'Account', account?.email ?? '', User],
    ['data', 'Export & import', '', Database],
    ['services', 'Connected services', '', Plug],
    ['coach', 'Coach', '', Sparkles],
  ];
  return (
    <>
      <TopBar title="Settings" />
      <div className="screen stack">
        <div className="list">
          {items.map(([k, title, sub, Icon]) => (
            <button key={k} className="list-row" onClick={() => navigate(`/settings/${k}`)}>
              <Icon size={20} className="muted" />
              <div className="grow">
                <div className="row-title">{title}</div>
                {sub && <div className="row-sub ellipsis">{sub}</div>}
              </div>
              <ChevronRight className="chev" />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}><LogoFull width={150} /></div>
      </div>
    </>
  );
}

function ProfileSettings() {
  const profile = useDB((d) => d.profile);
  const unit = useDB((d) => d.settings.weightUnit);
  const [d, setD] = useState<ProfileDraft>(() => draftFromProfile(profile, '', unit));
  const [water, setWater] = useState(String((profile?.waterGoalMl ?? 2500)/1000));
  const waterMl = Number(water)*1000;
  const waterError = !water.trim() || !Number.isFinite(waterMl) || waterMl<250 || waterMl>10000 ? 'Enter 0.25–10 litres.' : null;
  const [show, setShow] = useState(false);
  const [busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
  useEffect(()=>{let active=true;getIdentity().then(p=>{if(active&&p)setD(d=>({...d,profileId:p.username}))}).catch(e=>{if(active)setSaveError(e.message)});return()=>{active=false}},[]);
  const errors = validateDraft(d, unit);
  const valid = Object.values(errors).every((e) => !e) && !waterError;
  return (
    <>
      <TopBar title="Profile" back="/settings" bordered />
      <div className="screen" style={{ paddingTop: 12 }}>
        {saveError&&<p role="alert">{saveError}</p>}
        <ProfileFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} unit={unit} errors={errors} show={show} groups={['about', 'body', 'activity', 'goal', 'training']} />
        <Field label="Daily water goal" htmlFor="profile-water" error={show ? waterError : null}><div className="with-suffix"><input id="profile-water" className="input" type="number" inputMode="decimal" min="0.25" max="10" step="0.05" value={water} onChange={e=>setWater(e.target.value)} /><span className="suffix">L</span></div></Field>
        {show && !valid && <div style={{ marginTop: 12 }}><Notice tone="error">Check the highlighted fields.</Notice></div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={busy} onClick={async () => {
          setShow(true);
          if (!valid) return;
          const p = {...profileFromDraft(d, unit),waterGoalMl:Math.round(waterMl)};
          setBusy(true);setSaveError('');try{await profileRepo.save(p);
          if (profile && p.weightKg !== profile.weightKg) body.logWeight(todayISO(), p.weightKg);
          toast('Profile saved · targets updated');
          navigate('/settings', { replace: true });
          }catch(e){setSaveError((e as Error).message)}finally{setBusy(false)}
        }}>Save</button>
      </div>
    </>
  );
}

function TargetDetails() {
  const profile = useDB((d) => d.profile);
  const calc = useTargets();
  if (!profile || !calc) return null;
  const t = calc.targets;
  const row = (k: string, v: string) => <div className="kv"><span className="k">{k}</span><span className="v">{v}</span></div>;
  return (
    <>
      <TopBar title="Nutrition targets" back="/settings" bordered />
      <div className="screen stack" style={{ paddingTop: 12 }}>
        <div className="card card-pad">
          {row('Calories', `${fmtInt(t.kcal)} kcal`)}
          {row('Protein', `${t.protein} g`)}
          {row('Carbohydrate', `${t.carbs} g`)}
          {row('Fat', `${t.fat} g`)}
          {row('Water', `${fmtInt(t.waterMl)} ml`)}
        </div>
        <div className="section-title" style={{ margin: '6px 0 0' }}><h2>How it’s calculated</h2><InfoButton title="Estimates" lines={['These targets are estimates; individual needs vary.', 'If your weight trend doesn’t match your goal over a few weeks, adjust your profile.']} /></div>
        <div className="card card-pad">
          {row('1. BMR (Mifflin–St Jeor)', `${fmtInt(calc.bmr)} kcal`)}
          <p className="xs muted" style={{ margin: '0 0 6px' }}>
            10 × {profile.weightKg} kg + 6.25 × {profile.heightCm} cm − 5 × {profile.age} {profile.sex === 'male' ? '+ 5' : '− 161'}
          </p>
          {row(`2. × activity (${ACTIVITY_FACTORS[profile.activity].label})`, `× ${calc.activityFactor}`)}
          {row('= Maintenance (TDEE)', `${fmtInt(calc.tdee)} kcal`)}
          {row(`3. Goal: ${GOALS[profile.goal].label}`, `${calc.goalAdjustPct > 0 ? '+' : ''}${calc.goalAdjustPct}%`)}
          {calc.floorApplied && <Notice tone="warn">Raised to a minimum of {profile.sex === 'male' ? '1,500' : '1,200'} kcal.</Notice>}
          {row('4. Protein', `${calc.proteinPerKg} g × ${profile.weightKg} kg`)}
          {row('5. Fat', `${Math.round(calc.fatShare * 100)}% of calories ÷ 9`)}
          {row('6. Carbohydrate', 'Remaining calories ÷ 4')}
          {row('Water', 'Your daily goal · editable in Profile')}
        </div>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/settings/profile')}>Edit profile & goals</button>
      </div>
    </>
  );
}

function UnitSettings() {
  const s = useDB((d) => d.settings);
  const [rest, setRest] = useState(mss(s.defaultRestSec));
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <TopBar title="Units" back="/settings" bordered />
      <div className="screen stack" style={{ paddingTop: 12 }}>
        <div className="field"><span className="label">Weight</span>
          <Segmented label="Weight unit" value={s.weightUnit} onChange={(v) => profileRepo.updateSettings({ weightUnit: v })} options={[{ value: 'kg', label: 'Kilograms (kg)' }, { value: 'lb', label: 'Pounds (lb)' }]} />
        </div>
        <div className="field"><span className="label">Energy</span>
          <Segmented label="Energy unit" value={s.energyUnit} onChange={(v) => profileRepo.updateSettings({ energyUnit: v })} options={[{ value: 'kcal', label: 'Calories (kcal)' }, { value: 'kJ', label: 'Kilojoules (kJ)' }]} />
        </div>
        <Field label="Default rest timer" htmlFor="u-rest" error={err} hint="Used when adding exercises. m:ss">
          <input id="u-rest" className="input" value={rest} onChange={(e) => setRest(e.target.value)} onBlur={() => {
            const v = parseMss(rest);
            if (v === null || v > 3600) return setErr('Enter a time like 1:30.');
            setErr(null);
            setRest(mss(v));
            profileRepo.updateSettings({ defaultRestSec: v });
          }} />
        </Field>
        <p className="xs muted" style={{ margin: 0 }}>Values are stored in metric and converted for display.</p>
      </div>
    </>
  );
}

function AccountSettings() {
  const account = useDB((d) => d.account);
  const [out, setOut] = useState(false);
  if (!account) return null;
  return (
    <>
      <TopBar title="Account" back="/settings" bordered />
      <div className="screen stack" style={{ paddingTop: 12 }}>
        <div className="card card-pad">
          <div className="kv"><span className="k">Name</span><span className="v">{account.name}</span></div>
          <div className="kv"><span className="k">Email</span><span className="v ellipsis">{account.email}</span></div>
          <div className="kv"><span className="k">Type</span><span className="v">{account.mode === 'demo' ? 'Demo' : 'This device only'}</span></div>
        </div>
        <Notice>
          {account.mode === 'demo'
            ? 'The demo keeps sample data on this device. Signing out deletes it.'
            : 'Your data is stored in this browser only. It isn’t synced or backed up — use Export to keep a copy.'}
        </Notice>
        <button className="btn btn-secondary btn-block" onClick={() => setOut(true)}><LogOut /> Sign out</button>
      </div>
      <ConfirmSheet open={out} onClose={() => setOut(false)} title="Sign out?" body={account.mode === 'demo' ? 'Demo data will be deleted.' : 'Your data stays on this device.'} confirmLabel="Sign out" onConfirm={() => {
        auth.signOut();
        navigate('/today', { replace: true });
      }} />
    </>
  );
}

function DataSettings() {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<DB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wipe, setWipe] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const exportData = () => setExportText(JSON.stringify(getDB(), null, 2));
  const download = () => {
    if (!exportText) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportText], { type: 'application/json' }));
    a.download = `my-fitness-diary-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText ?? '');
      toast('Export copied');
    } catch {
      area.current?.select();
      toast('Select all and copy the text');
    }
  };
  return (
    <>
      <TopBar title="Export & import" back="/settings" bordered />
      <div className="screen stack" style={{ paddingTop: 12 }}>
        <div className="card card-pad stack-sm">
          <div className="strong">Export</div>
          <p className="small muted" style={{ margin: 0 }}>Download everything — routines, workouts, food diary, body data and settings — as a JSON file.</p>
          <button className="btn btn-secondary btn-block" onClick={exportData}><Download /> Export data</button>
        </div>
        <div className="card card-pad stack-sm">
          <div className="strong">Import</div>
          <p className="small muted" style={{ margin: 0 }}>Restore from a My Fitness Diary export. This replaces the data on this device.</p>
          <input ref={file} type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setError(null);
            try {
              const parsed = JSON.parse(await f.text());
              if (!isDB(parsed)) throw new Error();
              setPending({ ...emptyDB(), ...parsed, account: getDB().account, signedIn: true });
            } catch {
              setError('That file isn’t a valid My Fitness Diary export.');
            }
          }} />
          <button className="btn btn-secondary btn-block" onClick={() => file.current?.click()}><Upload /> Choose file</button>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <button className="btn btn-danger btn-block" onClick={() => setWipe(true)}>Delete all data on this device</button>
      </div>
      <Sheet open={exportText !== null} onClose={() => setExportText(null)} title="Export data" size="wide" footer={
        <>
          <button className="btn btn-secondary" onClick={download}><Download /> Save file</button>
          <button className="btn btn-primary" onClick={copy}>Copy</button>
        </>
      }>
        <div className="stack-sm">
          <p className="small muted" style={{ margin: 0 }}>Save the file, or copy the text and keep it somewhere safe. If saving doesn’t start in your browser, use Copy.</p>
          <textarea ref={area} id="export-json" className="textarea tnum" readOnly value={exportText ?? ''} style={{ minHeight: 220, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }} aria-label="Exported data" />
        </div>
      </Sheet>
      <ConfirmSheet open={!!pending} onClose={() => setPending(null)} title="Replace data on this device?" body={pending ? `${pending.routines.length} routines, ${pending.workouts.length} workouts and ${pending.diary.length} diary entries will be imported.` : ''} confirmLabel="Import" onConfirm={() => {
        if (pending) replaceDB(pending);
        toast('Data imported');
      }} />
      <ConfirmSheet open={wipe} onClose={() => setWipe(false)} title="Delete all data?" body="Routines, workouts, food diary and settings will be removed from this device. This can’t be undone." confirmLabel="Delete everything" danger onConfirm={() => {
        replaceDB(emptyDB());
        navigate('/today', { replace: true });
      }} />
    </>
  );
}

function ServicesSettings() {
  const services: [string, string, string][] = [
    ['Hevy', 'Not connected', 'Import only. Workouts can be read from Hevy into this app; nothing is ever written back to Hevy.'],
    ['Cloud sync', 'Not available', 'Data stays on this device until an account backend is added.'],
    ['Food database', 'Not connected', 'Barcode lookup searches foods saved on this device.'],
    ['Exercise library', 'Sample data', 'Includes sample records from ExerciseDB, Free Exercise DB and wger.'],
  ];
  return (
    <>
      <TopBar title="Connected services" back="/settings" bordered />
      <div className="screen" style={{ paddingTop: 12 }}>
        <div className="list">
          {services.map(([n, status, d]) => (
            <div key={n} className="list-row" style={{ alignItems: 'flex-start', padding: '12px 14px' }}>
              <div className="grow">
                <div className="row-between"><span className="row-title">{n}</span><span className={`badge${status === 'Sample data' ? ' warn' : ''}`}>{status}</span></div>
                <div className="row-sub" style={{ marginTop: 2 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CoachSettings() {
  const c = useDB((d) => d.settings.coach);
  const set = (p: Partial<typeof c>) => profileRepo.updateSettings({ coach: { ...c, ...p } });
  const [endpoint, setEndpoint] = useState(c.endpoint);
  const endpointErr = endpoint && !/^https:\/\/[^\s]+$/.test(endpoint) ? 'Use an https:// URL.' : null;
  return (
    <>
      <TopBar title="Coach" back="/settings" bordered />
      <div className="screen stack" style={{ paddingTop: 12 }}>
        <Notice tone="warn">The coach isn’t connected. Replies are sample responses until a provider is set up on the server.</Notice>
        <div className="section-title" style={{ margin: '4px 0 0' }}><h2>Provider</h2></div>
        <SelectField<CoachProvider> label="Provider" value={c.provider} onChange={(v) => set({ provider: v })} options={[
          { value: 'none', label: 'Not configured' },
          { value: 'anthropic', label: 'Anthropic' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'custom', label: 'Custom endpoint' },
        ]} />
        <Field label="Model" htmlFor="c-model" hint="Model name used by your server.">
          <input id="c-model" className="input" value={c.model} placeholder="Model name" onChange={(e) => set({ model: e.target.value })} disabled={c.provider === 'none'} />
        </Field>
        {c.provider === 'custom' && (
          <Field label="Endpoint" htmlFor="c-ep" error={endpointErr} hint="Your backend route that calls the model.">
            <input id="c-ep" className="input" inputMode="url" value={endpoint} placeholder="https://" onChange={(e) => setEndpoint(e.target.value)} onBlur={() => !endpointErr && set({ endpoint })} />
          </Field>
        )}
        <div className="notice"><KeyRound /><div>API keys are never entered or stored in the app. They belong in your server’s environment, which forwards requests to the provider.</div></div>
        <div className="section-title" style={{ margin: '4px 0 0' }}><h2>Data the coach can use</h2></div>
        <div className="list">
          {([['includeTraining', 'Training history'], ['includeNutrition', 'Food diary'], ['includeBody', 'Weight & check-ins']] as const).map(([k, label]) => (
            <label key={k} className="list-row" style={{ cursor: 'pointer' }}>
              <span className="grow row-title">{label}</span>
              <input type="checkbox" checked={c[k]} onChange={(e) => set({ [k]: e.target.checked })} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
