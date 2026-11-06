import { MuscleStats } from './screens/progress/MuscleStats';
import { useWorkoutLimit } from './lib/useWorkoutLimit';
import { RoutineOverview } from './screens/training/RoutineOverview';
import {SyncStatus} from './components/SyncStatus';
import { RestBar } from './components/RestBar';
import { AiAddedNotice } from './components/AiAddedNotice';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dumbbell, Sparkles, Sun, TrendingUp, Utensils, ChevronUp } from 'lucide-react';
import { AiHub } from './components/AiHub';
import { engine } from './adapters/engine';
import { useDB } from './data/store';
import { useRoute, navigate } from './lib/router';
import { useNow } from './lib/hooks';
import { duration } from './lib/format';
import { LogoFull, ToastHost } from './components/ui';
import { AuthScreen } from './screens/auth/AuthScreen';
import { Onboarding } from './screens/auth/Onboarding';
import { TodayScreen } from './screens/today/TodayScreen';
import { TrainingHome } from './screens/training/TrainingHome';
import { RoutineEditor } from './screens/training/RoutineEditor';
import { ActiveWorkoutScreen } from './screens/training/ActiveWorkout';
import { FoodScreen } from './screens/food/FoodScreen';
import { ProgressScreen, SessionDetail } from './screens/progress/ProgressScreen';
import { WorkoutEditor } from './screens/progress/WorkoutEditor';
import { CoachScreen } from './screens/coach/CoachScreen';
import { AiAssistants } from './screens/ai/AiAssistants';
import {EngineSurface} from './Runtime';
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
  return (
    <button className="resume-bar" aria-label={`Resume ${a.title}`} onClick={() => navigate('/workout')}>
      <span className="live-dot" aria-hidden="true" />
      <span className="grow">
        <span className="t ellipsis">{a.title}</span>
        <span className="s tnum">{duration((now - a.startedAt) / 1000)} · {done}/{sets.length} sets</span>
      </span>
      <span className="resume-cta">Resume<ChevronUp aria-hidden="true" /></span>
    </button>
  );
}

function syncAttention() { const s = engine()?.peek(); return !!(s?.conflict || s?.error); }
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
      return <TrainingHome />;
    case 'workout':
      return <ActiveWorkoutScreen />;
    case 'food':
      return <FoodScreen />;
    case 'progress':
      if (b === 'muscles') return <MuscleStats view={c} />;
      if (b === 'session' && c && d === 'edit') return <WorkoutEditor key={c} id={c} />;
      if (b === 'session' && c) return <SessionDetail id={c} />;
      return <EngineSurface screen="progress"/>;
    case 'friends':return <FriendsScreen username={b==='u'?c:undefined}/>;
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
  useEffect(() => setHub(false), [routeKey]);// useRoute returns a new array each render: compare the text

  useEffect(() => {
    const titles: Record<string, string> = { today: 'Overview', training: 'Training', workout: 'Workout', food: 'Food', progress: 'Progress', coach: 'AI assistants', settings: 'Settings' };
    document.title = `${titles[route[0]] ?? 'Overview'} · My Fitness Diary`;
  }, [route]);

  if (!signedIn) return (<><AuthScreen /><ToastHost /></>);
  if (!profile) return (<><Onboarding /><ToastHost /></>);

  const top = route[0] ?? 'today';
  const tab = top === 'workout' ? 'training' : top === 'coach' ? 'today' : top;
  const focused = top === 'workout' || (top === 'training' && route[1] === 'routine');
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
      <nav className="sidebar" aria-label="Main">
        <div className="logo"><LogoFull width={168} full /></div>
        {navItems()}
      </nav>
      <header className="global-header">
        <span className="header-logo"><LogoFull width={86} /></span>
        <SyncStatus />
        <button className="icon-btn ai-btn" aria-label="AI assistants" title="AI assistants" onClick={() => setHub(true)}><Sparkles /></button>
        <AvatarButton />
        <RestBar />
      </header>
      <main className={`main${focused ? ' no-nav' : ''}${showResume && !focused ? ' has-resume' : ''}`}>
        <Routes key={accountKey} route={route} />
      </main>
      {showResume && !focused && <ResumeBar />}
      {!focused && <nav className="bottom-nav" aria-label="Main">{navItems()}</nav>}
      <ToastHost />
      <AiAddedNotice />
      <AiHub open={hub} onClose={() => setHub(false)} />
    </div>
  );
}
