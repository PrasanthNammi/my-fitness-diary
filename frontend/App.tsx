import { MuscleStats } from './screens/progress/MuscleStats';
import { useWorkoutLimit } from './lib/useWorkoutLimit';
import { RoutineOverview } from './screens/training/RoutineOverview';
import {SyncStatus} from './components/SyncStatus';
import { RestBar } from './components/RestBar';
import { AiAddedNotice } from './components/AiAddedNotice';
import { useEffect } from 'react';
import { BarChart3, CalendarDays, Dumbbell, Settings, UtensilsCrossed, ChevronUp } from 'lucide-react';
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
import { CoachScreen } from './screens/coach/CoachScreen';
import { AiAssistants } from './screens/ai/AiAssistants';
import {EngineSurface} from './Runtime';
import {SettingsLive} from './screens/SettingsLive';
import {FriendsScreen} from './screens/Friends';
import {Users} from 'lucide-react';
import { SettingsScreen } from './screens/settings/SettingsScreen';

const TABS = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'training', label: 'Training', icon: Dumbbell },
  { id: 'food', label: 'Food', icon: UtensilsCrossed },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
  { id: 'friends', label: 'Friends', icon: Users },
] as const;

function ResumeBar() {
  const a = useDB((d) => d.active);
  const now = useNow(1000, !!a);
  if (!a) return null;
  return (
    <div className="resume-bar" role="region" aria-label="Workout in progress">
      <div className="grow">
        <div className="t ellipsis">{a.title}</div>
        <div className="s tnum">In progress · {duration((now - a.startedAt) / 1000)}</div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/workout')}><ChevronUp /> Resume</button>
    </div>
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

  useEffect(() => {
    const titles: Record<string, string> = { today: 'Today', training: 'Training', workout: 'Workout', food: 'Food', progress: 'Progress', coach: 'AI assistants', settings: 'Settings' };
    document.title = `${titles[route[0]] ?? 'Today'} · My Fitness Diary`;
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
        <div className="logo"><LogoFull width={168} /></div>
        {navItems()}
      </nav>
      <header className="global-header"><img className="header-logo" src="/legacy/logo.svg" width="86" height="44" alt="My Fitness Diary"/><SyncStatus/><button className="icon-btn" aria-label="Settings" title="Settings" onClick={()=>navigate('/settings')}><Settings/></button><RestBar/></header>
      <main className={`main${focused ? ' no-nav' : ''}${showResume && !focused ? ' has-resume' : ''}`}>
        <Routes key={accountKey} route={route} />
      </main>
      {showResume && !focused && <ResumeBar />}
      {!focused && <nav className="bottom-nav" aria-label="Main">{navItems()}</nav>}
      <ToastHost />
      <AiAddedNotice />
    </div>
  );
}
