// Settings → Privacy: how MFD handles your data (the same as docs/PRIVACY.md, shorter). Cycle & Health has its own note.
import { TopBar } from '../../components/ui';
import { navigate } from '../../lib/router';
import { useDB } from '../../data/store';
import { cycleAllowed } from '../../data/cycle';

const SECTIONS: [string, string[]][] = [
  ['Who is responsible', ['The MFD owner (the person who invited you). MFD is a small app for friends: no ads, nothing sold.']],
  ['What MFD stores', ['Your account (email), profile (name, date of birth, sex, height, weight, goals, settings) and your diary: workouts, routines, food, water, weigh-ins, measurements, recovery check-ins and photos you add.',
    'Friends: your friends list, username, picture, likes, comments and messages.', 'AI assistants you connect and what they added; a notification token; Health Connect data only for the kinds you allow.']],
  ['Why', ['To sync and show your diary, calculate targets and progress, run the friends features and notifications you use, and keep MFD working (backups, monitoring).',
    'Optional features (Health Connect, AI assistants, notifications, Cycle & Health) only with your consent, when you switch them on.']],
  ['Who can see it', ['You: your diary is readable only by your account.', 'Friends: your name, username, picture, the workouts in your Friends feed, and your likes, comments and messages. Never your food, body, recovery or Cycle & Health.',
    'AI assistants (ChatGPT, Claude) only if you connect them, and only what you tick.',
    'MFD AI, only if you add your own Gemini key: what you type goes from your device straight to Google under your own agreement with Google. MFD never stores the key or the chat on its server, and never sends your diary or Cycle & Health.',
    'Services that run MFD, each only for its job: Supabase (database, sign-in, photos; EU, Frankfurt), OpenAI (hosts the website’s files), Cloudflare (AI connector, app downloads), Google (notifications; encrypted backups in Drive), Grafana Cloud (service health numbers only), Open Food Facts (barcode and food searches).']],
  ['How long', ['As long as you have an account. Backups are kept 30 days. A deleted account is removed with everything in it, and leaves the backups within 30 days.']],
  ['Your rights', ['See, correct and export everything (Settings → Data → Export), delete entries, switch optional features off, object, and complain to a data protection authority.', 'Delete your account and everything in it: Settings → Account → Delete account.']],
];

export function PrivacyPage() {
  const profile = useDB((d) => d.profile);
  return <>
    <TopBar title="Privacy" back="/settings" />
    <div className="screen settings-page cy-privacy-page">
      {SECTIONS.map(([h, ps]) => <section key={h} className="card card-pad"><h3>{h}</h3>{ps.map((p) => <p key={p}>{p}</p>)}</section>)}
      {cycleAllowed(profile) && <button className="btn btn-soft btn-block" onClick={() => navigate('/progress/cycle/privacy')}>Cycle & Health: its own privacy note</button>}
    </div>
  </>;
}
