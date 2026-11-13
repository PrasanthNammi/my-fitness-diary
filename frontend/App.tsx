import { useWorkoutLimit } from './lib/useWorkoutLimit';
import { RoutineOverview } from './screens/training/RoutineOverview';
import {SyncStatus} from './components/SyncStatus';
import {installSyncWake} from './lib/sync';
import {setWeekStartDay} from './domain/week';
import { RestBar } from './components/RestBar';
import { installHealthWrites, syncHealth } from './lib/health';
import { installWatchSync } from './lib/watch';
import { AiAddedNotice } from './components/AiAddedNotice';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dumbbell, Sparkles, Sun, TrendingUp, Utensils, ChevronUp } from 'lucide-react';
import { AiHub } from './components/AiHub';
import { engine } from './adapters/engine';
import { useDB } from './data/store';
import { useRoute, navigate } from './lib/router';
import { useNow } from './lib/hooks';
import { duration, mss } from './lib/format';
import { timerRemaining, timerState } from './domain/training';
import { LogoMark, ToastHost } from './components/ui';
import { SuggestionHost } from './screens/training/SuggestionReview';
import { AuthScreen, SetPasswordScreen } from './screens/auth/AuthScreen';
import { Onboarding } from './screens/auth/Onboarding';
import { TodayScreen } from './screens/today/TodayScreen';
import { TrainingHome } from './screens/training/TrainingHome';
import { RoutineEditor } from './screens/training/RoutineEditor';
import { ActiveWorkoutScreen } from './screens/training/ActiveWorkout';
import { FoodScreen } from './screens/food/FoodScreen';
import { SessionDetail } from './screens/progress/SessionDetail';
import { HeartRatePage } from './screens/progress/HeartRate';
import { RecoveryPage } from './screens/progress/RecoveryPage';
import { ProgressHome } from './screens/progress/ProgressHome';
import { WorkoutEditor } from './screens/progress/WorkoutEditor';
import { CoachScreen } from './screens/coach/CoachScreen';
import { AiAssistants } from './screens/ai/AiAssistants';
import {SettingsLive} from './screens/SettingsLive';
import {FriendsScreen} from './screens/Friends';
import {Users} from 'lucide-react';
import { SettingsScreen } from './screens/settings/SettingsScreen';

const TABS = [
  { id: 'today', label: 'Overview', icon: Sun },
  { id: 'training', label: 'Training', icon: Dumbbell },
  { id: 'food', label: 'Food', icon: Utensils },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'friends', label: 'Friends', icon: Users },
] as const;

function ResumeBar() {
  const a = useDB((d) => d.active);
  const now = useNow(1000, !!a);
  if (!a) return null;
  const sets = a.exercises.flatMap((e) => e.sets), done = sets.filter((s) => s.done).length;
  // The soonest running rest, if any (the dock shows it on the workout screen; here it's in the bar).
  const rest = a.exercises.map((b) => a.timers[b.id]).filter((t) => timerState(t, now) === 'running').map((t) => timerRemaining(t, now)).sort((x, y) => x - y)[0];
  return (
    <button className="resume-bar" aria-label={`Resume ${a.title}`} onClick={() => navigate('/workout')}>
      <span className="live-dot" aria-hidden="true" />
      <span className="grow">
        <span className="t ellipsis">{a.title}</span>
        <span className="s tnum">{duration((now - a.startedAt) / 1000)} · {done}/{sets.length} sets{rest !== undefined ? ` · rest ${mss(rest)}` : ''}</span>
      </span>
      <span className="resume-cta">Resume<ChevronUp aria-hidden="true" /></span>
    </button>
  );
}

function syncAttention() { const s = engine()?.peek(); return !!s?.error; }
function AvatarButton() {
  const profile = useDB((d) => d.profile);
  const attention = useSyncExternalStore((fn) => engine()?.subscribe(fn) || (() => {}), syncAttention);
  const initial = (profile?.firstName || profile?.name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <button className="avatar-btn" aria-label={attention ? 'Settings · sync needs attention' : 'Settings'} title="Settings" onClick={() => navigate('/settings')}>
      {initial}{attention && <span className="attention-dot" aria-hidden="true" />}
    </button>
  );
}

function Routes({ route }: { route: string[] }) {
  const [a, b, c, d] = route;
  switch (a) {
    case 'training':
      if (b === 'routine' && c === 'new') return <RoutineEditor key={`new-${d}`} routineId={null} folderId={d && d !== 'root' ? d : null} />;
      if (b === 'routine' && c === 'edit' && d) return <RoutineEditor key={d} routineId={d} folderId={null} />;
      if (b === 'routine' && c === 'view' && d) return <RoutineOverview key={d} routineId={d} />;
      if (b === 'history' && c && d === 'edit') return <WorkoutEditor key={c} id={c} />;
      if (b === 'history' && c && d === 'heart') return <HeartRatePage id={c} />;
      if (b === 'history' && c) return <SessionDetail id={c} />;
      return <TrainingHome tab={b === 'history' ? 'history' : 'routines'} />;
    case 'workout':
      return <ActiveWorkoutScreen />;
    case 'food':
      return <FoodScreen />;
    case 'progress':
      if (b === 'muscles') return <ProgressHome tab="muscles" view={c} />;
      if (b === 'recovery') return <RecoveryPage />;
      // Old links: workout history now lives under Training.
      if (b === 'session' && c && d === 'edit') return <WorkoutEditor key={c} id={c} />;
      if (b === 'session' && c) return <SessionDetail id={c} />;
      return <ProgressHome tab={b === 'exercises' || b === 'body' ? b : 'summary'} />;
    case 'friends':return <FriendsScreen view={b==='u'&&c?{kind:'profile',username:c}:b==='chat'&&c?{kind:'chat',username:c}:b==='w'&&c&&d?{kind:'workout',owner:c,workout:decodeURIComponent(d)}:b==='compare'&&c?{kind:'compare',username:c,exercise:d}:b==='activity'?{kind:'activity'}:b==='me'?{kind:'me'}:{kind:'feed'}}/>;
    case 'coach':
      return <AiAssistants />;
    case 'settings':
      return <SettingsLive section={b ?? null}/>;
    default:
      return <TodayScreen />;
  }
}

export function App() {
  useWorkoutLimit();
  const signedIn = useDB((d) => d.signedIn && !!d.account);
  const accountKey = useDB((d) => d.account?.email);
  const profile = useDB((d) => d.profile);
  const active = useDB((d) => !!d.active);
  const route = useRoute();
  const [hub, setHub] = useState(false);
  const routeKey = route.join('/');
  // Week start from Settings, applied before any screen below renders its weeks.
  setWeekStartDay(useDB((d) => d.settings.weekStart));
  useEffect(() => installSyncWake(), []);
  useEffect(() => installWatchSync(), []);
  // Android app 2.0: saves workouts and food to Health Connect when turned on (Settings → Health & devices).
  useEffect(() => installHealthWrites(), []);
  // Android app: refresh sleep and steps from Health Connect on opening MFD (at most every 10 minutes).
  useEffect(() => { const run = () => { if (!document.hidden) void syncHealth(); }; run(); document.addEventListener('visibilitychange', run); return () => document.removeEventListener('visibilitychange', run); }, []);
  useEffect(() => setHub(false), [routeKey]);
  useEffect(() => { const open = () => setHub(true); window.addEventListener('mfd-ai-hub', open); return () => window.removeEventListener('mfd-ai-hub', open); }, []);// useRoute returns a new array each render: compare the text

  useEffect(() => {
    const titles: Record<string, string> = { today: 'Overview', training: 'Training', workout: 'Workout', food: 'Food', progress: 'Progress', coach: 'AI assistants', settings: 'Settings' };
    document.title = `${titles[route[0]] ?? 'Overview'} · My Fitness Diary`;
  }, [route]);

  if (!signedIn) return (<><AuthScreen /><ToastHost /></>);
  // Opened from a password-reset email: choose the new password first.
  if (route[0] === 'set-password') return (<><SetPasswordScreen onDone={() => navigate('/', { replace: true })} /><ToastHost /></>);
  if (!profile) return (<><Onboarding /><ToastHost /></>);

  const top = route[0] ?? 'today';
  const tab = top === 'workout' ? 'training' : top === 'coach' ? 'today' : top;
  const focused = top === 'workout' || (top === 'training' && route[1] === 'routine') || (top === 'friends' && route[1] === 'chat');
  const showResume = !!active && top !== 'workout';

  const navItems = (cls?: string) =>
    TABS.map((t) => (
      <a
        key={t.id}
        href={`#/${t.id}`}
        className={`nav-item${cls ? ` ${cls}` : ''}`} aria-label={t.label} title={t.label}
        aria-current={tab === t.id ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault();
          navigate(`/${t.id}`);
        }}
      >
        <t.icon /> <span className="nav-label">{t.label}</span>
      </a>
    ));

  return (
    <div className="app">
      <header className="global-header">
        <span className="header-logo"><LogoMark width={86} /></span>
        <SyncStatus />
        <button className="icon-btn ai-btn" aria-label="AI assistants" title="AI assistants" onClick={() => setHub(true)}><Sparkles /></button>
        <AvatarButton />
      </header>
      <main className={`main${focused ? ' no-nav' : ''}${showResume && !focused ? ' has-resume' : ''}`}>
        <Routes key={accountKey} route={route} />
      </main>
      {showResume && !focused && <ResumeBar />}
      {!focused && <nav className="bottom-nav" aria-label="Main">{navItems()}</nav>}
      {/* Outside the header: the header's blur would make the fixed rest dock position against it. */}
      <RestBar />
      <ToastHost />
      <SuggestionHost />
      <AiAddedNotice />
      <AiHub open={hub} onClose={() => setHub(false)} />
    </div>
  );
}
