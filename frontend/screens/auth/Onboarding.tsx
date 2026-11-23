import { BirthDateFields, birthParts, type BirthParts } from '../../components/BirthDate';
import { checkBirthDate } from '../../domain/birthDate';
import { cycle } from '../../data/cycle';
import { MFD3 } from '../../lib/release';
import { useEffect, useMemo, useState } from 'react';
import {checkProfileId,getIdentity,splitName,validProfileId} from '../../adapters/profile';
import { ChevronLeft } from 'lucide-react';
import type { ActivityLevel, Goal, Profile, Sex } from '../../domain/types';
import { ACTIVITY_FACTORS, calculateTargets, GOALS } from '../../domain/nutrition';
import { Field, LogoMark, Notice, Segmented } from '../../components/ui';
import { useDB } from '../../data/store';
import { body, profileRepo } from '../../data/repositories';
import { kgTo, parseDecimal, round1, todayISO, toKg } from '../../lib/format';

/** MFD 3.0: what's wrong with the date of birth, if anything. */
function birthError(b: BirthParts): string | null {
  const c = checkBirthDate(b.day, b.month, b.year, todayISO());
  return c.state === 'empty' ? 'Enter your date of birth.' : c.state === 'bad' ? c.message : null;
}
/** The age (and, from 3.0, the date of birth it comes from) the profile is saved with. */
function birthFromDraft(d: ProfileDraft): Pick<Profile, 'age' | 'birthDate'> {
  if (!MFD3) return { age: Number(d.age) };
  const c = checkBirthDate(d.birth.day, d.birth.month, d.birth.year, todayISO());
  return c.state === 'ok' ? { birthDate: c.date, age: c.age } : { age: Number(d.age) };
}

export interface ProfileDraft {
  firstName: string;
  lastName: string;
  profileId: string;
  age: string;
  /** MFD 3.0: date of birth instead of age. */
  birth: BirthParts;
  sex: Sex | null;
  height: string;
  weight: string;
  activity: ActivityLevel | null;
  goal: Goal | null;
  target: string;
  days: number;
}

export function draftFromProfile(p: Profile | null, fallbackName: string, unit: 'kg' | 'lb'): ProfileDraft {
  return p
    ? {
        ...splitName(p.name),firstName:p.firstName??splitName(p.name).firstName,lastName:p.lastName??splitName(p.name).lastName,profileId:p.profileId||'', age: String(p.age), birth: birthParts(p.birthDate), sex: p.sex, height: String(p.heightCm),
        weight: String(round1(kgTo(p.weightKg, unit))), activity: p.activity, goal: p.goal,
        target: String(round1(kgTo(p.targetWeightKg, unit))), days: p.trainingDaysPerWeek,
      }
    : { ...splitName(fallbackName),profileId:'', age: '', birth: birthParts(), sex: null, height: '', weight: '', activity: null, goal: null, target: '', days: 3 };
}

export function validateDraft(d: ProfileDraft, unit: 'kg' | 'lb') {
  const age = Number(d.age);
  const h = parseDecimal(d.height);
  const w = parseDecimal(d.weight);
  const t = parseDecimal(d.target);
  const wKg = w === null ? null : toKg(w, unit);
  const tKg = t === null ? null : toKg(t, unit);
  return {
    firstName: !d.firstName.trim()||d.firstName.trim().length>40 ? 'Enter your first name (up to 40 characters).' : null,
    lastName: !d.lastName.trim()||d.lastName.trim().length>39 ? 'Enter your last name (up to 39 characters).' : null,
    profileId: !validProfileId(d.profileId) ? 'Use 3–24 lowercase letters, numbers, dots or underscores.' : null,
    age: MFD3 ? birthError(d.birth) : !d.age ? 'Enter your age.' : !Number.isInteger(age) || age < 16 || age > 100 ? 'Enter an age between 16 and 100.' : null,
    sex: !d.sex ? 'Choose one — it’s used for the calorie formula.' : null,
    height: h === null ? 'Enter your height.' : h < 120 || h > 230 ? 'Enter a height between 120 and 230 cm.' : null,
    weight: wKg === null ? 'Enter your weight.' : wKg < 30 || wKg > 300 ? 'Enter a realistic weight.' : null,
    activity: !d.activity ? 'Choose an activity level.' : null,
    goal: !d.goal ? 'Choose a goal.' : null,
    target: tKg === null ? 'Enter a target weight.' : tKg < 30 || tKg > 300 ? 'Enter a realistic target.' : null,
  };
}

export function profileFromDraft(d: ProfileDraft, unit: 'kg' | 'lb'): Profile {
  return {
    firstName:d.firstName.trim(),lastName:d.lastName.trim(),profileId:d.profileId,
    name: [d.firstName.trim(),d.lastName.trim()].join(' '),
    ...birthFromDraft(d),
    sex: d.sex!,
    heightCm: parseDecimal(d.height)!,
    weightKg: round1(toKg(parseDecimal(d.weight)!, unit)),
    activity: d.activity!,
    goal: d.goal!,
    targetWeightKg: round1(toKg(parseDecimal(d.target)!, unit)),
    trainingDaysPerWeek: d.days,
  };
}

/** Field groups shared by onboarding steps and the Settings profile editor. */
export function ProfileFields({
  d, set, unit, errors, show, groups,
}: {
  d: ProfileDraft;
  set: (p: Partial<ProfileDraft>) => void;
  unit: 'kg' | 'lb';
  errors: ReturnType<typeof validateDraft>;
  show: boolean;
  groups: ('about' | 'body' | 'activity' | 'goal' | 'training')[];
}) {
  const e = (k: keyof typeof errors) => (show ? errors[k] : null);
  const dir = useMemo(() => {
    const w = parseDecimal(d.weight);
    const t = parseDecimal(d.target);
    if (w === null || t === null || !d.goal) return null;
    if (d.goal === 'lose' && t >= w) return 'Your target is not below your current weight.';
    if (d.goal === 'gain' && t < w) return 'Your target is below your current weight.';
    return null;
  }, [d.weight, d.target, d.goal]);
  return (
    <div className="stack">
      {groups.includes('about') && (
        <>
          <div className="grid-2"><Field label="First name" htmlFor="pf-first" error={e('firstName')}><input id="pf-first" className="input" autoComplete="given-name" maxLength={40} value={d.firstName} onChange={x=>set({firstName:x.target.value})}/></Field><Field label="Last name" htmlFor="pf-last" error={e('lastName')}><input id="pf-last" className="input" autoComplete="family-name" maxLength={39} value={d.lastName} onChange={x=>set({lastName:x.target.value})}/></Field></div>
          <Field label="Profile ID" htmlFor="pf-id" error={e('profileId')}><input id="pf-id" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} value={d.profileId} onChange={x=>set({profileId:x.target.value.toLowerCase().replace(/^@/,'')})}/></Field>
          {MFD3 ? <BirthDateFields value={d.birth} onChange={(birth) => set({ birth })} id="pf-dob" error={e('age')} /> : (
          <Field label="Age" htmlFor="pf-age" error={e('age')}>
            <input id="pf-age" className="input" inputMode="numeric" value={d.age} onChange={(x) => set({ age: x.target.value.replace(/\D/g, '') })} />
          </Field>)}
          <div className="field">
            <span className="label">Sex used for calorie estimation</span>
            <Segmented label="Sex" value={d.sex ?? ('' as Sex)} onChange={(v) => set({ sex: v })} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
            {e('sex') && <div className="err">{e('sex')}</div>}
          </div>
        </>
      )}
      {groups.includes('body') && (
        <div className="grid-2">
          <Field label="Height" htmlFor="pf-h" error={e('height')}>
            <div className="with-suffix">
              <input id="pf-h" className="input" inputMode="decimal" value={d.height} onChange={(x) => set({ height: x.target.value })} />
              <span className="suffix">cm</span>
            </div>
          </Field>
          <Field label="Weight" htmlFor="pf-w" error={e('weight')}>
            <div className="with-suffix">
              <input id="pf-w" className="input" inputMode="decimal" value={d.weight} onChange={(x) => set({ weight: x.target.value })} />
              <span className="suffix">{unit}</span>
            </div>
          </Field>
        </div>
      )}
      {groups.includes('activity') && (
        <div className="field">
          <span className="label">Activity level</span>
          <div className="option-list" role="radiogroup" aria-label="Activity level">
            {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={d.activity === k} className="option" onClick={() => set({ activity: k })}>
                <span className="stack-sm" style={{ gap: 0 }}>
                  <span className="strong">{ACTIVITY_FACTORS[k].label}</span>
                  <span className="small muted">{ACTIVITY_FACTORS[k].hint}</span>
                </span>
              </button>
            ))}
          </div>
          {e('activity') && <div className="err">{e('activity')}</div>}
        </div>
      )}
      {groups.includes('goal') && (
        <>
          <div className="field">
            <span className="label">Primary goal</span>
            <div className="option-list" role="radiogroup" aria-label="Primary goal">
              {(Object.keys(GOALS) as Goal[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={d.goal === k} className="option" onClick={() => set({ goal: k })}>
                  <span className="strong">{GOALS[k].label}</span>
                </button>
              ))}
            </div>
            {e('goal') && <div className="err">{e('goal')}</div>}
          </div>
          <Field label="Target weight" htmlFor="pf-t" error={e('target')}>
            <div className="with-suffix">
              <input id="pf-t" className="input" inputMode="decimal" value={d.target} onChange={(x) => set({ target: x.target.value })} />
              <span className="suffix">{unit}</span>
            </div>
          </Field>
          {dir && <Notice tone="warn">{dir}</Notice>}
        </>
      )}
      {groups.includes('training') && (
        <div className="field">
          <span className="label">Training days per week</span>
          <div className="chips" role="radiogroup" aria-label="Training days per week">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={d.days === n} className="chip" aria-pressed={d.days === n} style={{ minWidth: 40, justifyContent: 'center' }} onClick={() => set({ days: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STEPS: { title: string; groups: ('about' | 'body' | 'activity' | 'goal' | 'training')[]; keys: (keyof ReturnType<typeof validateDraft>)[] }[] = [
  { title: 'About you', groups: ['about'], keys: ['firstName','lastName','profileId', 'age', 'sex'] },
  { title: 'Your body', groups: ['body'], keys: ['height', 'weight'] },
  { title: 'Daily activity', groups: ['activity'], keys: ['activity'] },
  { title: 'Your goal', groups: ['goal'], keys: ['goal', 'target'] },
  { title: 'Training', groups: ['training'], keys: [] },
];

export function Onboarding() {
  const account = useDB((d) => d.account);
  const settings = useDB((d) => d.settings);
  const [unit, setUnit] = useState(settings.weightUnit);
  const [d, setD] = useState<ProfileDraft>(() => draftFromProfile(null, account?.name ?? '', unit));
  const [busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
  useEffect(()=>{getIdentity().then(p=>{if(p)setD(d=>({...d,profileId:p.username}))}).catch(e=>setSaveError(e.message))},[]);
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  // Women are asked once whether to switch on Cycle & Health (off unless they say yes).
  const [trackCycle, setTrackCycle] = useState<'yes' | 'no'>('no');
  const errors = validateDraft(d, unit);
  const set = (p: Partial<ProfileDraft>) => setD((x) => ({ ...x, ...p }));
  const review = step === STEPS.length;

  const next = async () => {
    setShow(true);
    if (STEPS[step].keys.some((k) => errors[k])) return;
    if(step===0){setBusy(true);setSaveError('');try{await checkProfileId(d.profileId)}catch(e){setSaveError((e as Error).message);return}finally{setBusy(false)}}
    setShow(false);
    setStep(step + 1);
    window.scrollTo(0, 0);
  };

  const p = review ? profileFromDraft(d, unit) : null;
  const calc = p ? calculateTargets(p) : null;

  return (
    <main className="auth" style={{ justifyContent: 'flex-start' }}>
      <div className="row-between" style={{ marginBottom: 16, minHeight: 44 }}>
        {step > 0 ? (
          <button className="icon-btn" aria-label="Back" onClick={() => setStep(step - 1)}><ChevronLeft /></button>
        ) : (
          <LogoMark width={64} />
        )}
        <span className="small muted">{`Step ${step + 1} of ${STEPS.length + 1}`}</span>
      </div>
      <div className="progress-dots" style={{ marginBottom: 20 }} aria-hidden="true">
        {[...STEPS, null].map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}
      </div>
      {saveError&&<p role="alert">{saveError}</p>}
      <h1 style={{ fontSize: 22, margin: '0 0 14px' }}>{review ? 'Your daily targets' : STEPS[step].title}</h1>

      {!review ? (
        <>
          {step === 1 && (
            <div style={{ marginBottom: 12 }}>
              <Segmented label="Weight unit" value={unit} onChange={(u) => {
                const conv = (s: string) => {
                  const n = parseDecimal(s);
                  return n === null ? s : String(round1(kgTo(toKg(n, unit), u)));
                };
                setD((x) => ({ ...x, weight: conv(x.weight), target: conv(x.target) }));
                setUnit(u);
              }} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
            </div>
          )}
          <ProfileFields d={d} set={set} unit={unit} errors={errors} show={show} groups={STEPS[step].groups} />
          <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 20 }} onClick={next}>Continue</button>
        </>
      ) : (
        calc && p && (
          <>
            <div className="card card-pad">
              <div className="row-between">
                <span className="muted">Calories</span>
                <span style={{ fontSize: 24, fontWeight: 800 }} className="tnum">{calc.targets.kcal.toLocaleString()} kcal</span>
              </div>
              <div className="grid-3" style={{ marginTop: 12, textAlign: 'center' }}>
                <div><div className="strong tnum">{calc.targets.protein} g</div><div className="xs muted">Protein</div></div>
                <div><div className="strong tnum">{calc.targets.carbs} g</div><div className="xs muted">Carbs</div></div>
                <div><div className="strong tnum">{calc.targets.fat} g</div><div className="xs muted">Fat</div></div>
              </div>
            </div>
            <p className="small muted" style={{ margin: '12px 0' }}>
              Estimated from your answers using the Mifflin–St Jeor equation, your activity level and goal. You can see the full calculation in Settings.
            </p>
            {calc.floorApplied && <Notice tone="warn">Calories were raised to a minimum safe level for this estimate.</Notice>}
            {p.sex === 'female' && <div className="card card-pad cy-signup">
              <h2>Track your cycle in MFD?</h2>
              <p>Periods, symptoms, medicines and thyroid results in one private place, next to your training and food.</p>
              <ul><li><b>Only you see it.</b> Never friends, never the feed.</li><li><b>Your AI only if you allow it,</b> in Settings.</li><li><b>Switch off or delete</b> any time.</li></ul>
              <Segmented label="Track your cycle" value={trackCycle} onChange={setTrackCycle} options={[{ value: 'yes', label: 'Yes, switch it on' }, { value: 'no', label: 'Not now' }]} />
            </div>}
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);setSaveError('');try{
                await profileRepo.save(p);
                profileRepo.updateSettings({ weightUnit: unit });
                body.logWeight(todayISO(), p.weightKg);
                if (p.sex === 'female' && trackCycle === 'yes') cycle.setEnabled(true);
                }catch(e){setSaveError((e as Error).message)}finally{setBusy(false)}
              }}
            >
              Start using My Fitness Diary
            </button>
          </>
        )
      )}
    </main>
  );
}
