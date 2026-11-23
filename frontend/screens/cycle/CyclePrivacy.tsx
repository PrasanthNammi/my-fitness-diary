// Settings → Cycle & Health → How your data is handled: the privacy note (same as docs/cycle/PRIVACY.md), short.
import { TopBar } from '../../components/ui';

const SECTIONS: [string, string[]][] = [
  ['What it is', ['An optional, private section to record periods, symptoms, medicines, lab results and conditions, see patterns and an estimate of your next period. Off until you switch it on.', 'Not a medical device: no diagnosis, no interpretation of lab results, no fertile days or ovulation, not for preventing or planning pregnancy.']],
  ['Your consent', ['Switching Cycle & Health on is your explicit consent for MFD to store these health records for you (GDPR Art. 9). Switch off or delete any time; that withdraws it.']],
  ['Who can see it', ['Only you. Never friends or the Friends feed.', 'AI assistants only if you tick “Cycle & Health” when connecting them and switch on “Let AI assistants read this” here. Their provider then receives what they read.', 'Health Connect: MFD only reads period days, if you switch that on, and never writes cycle data there.', 'No ads, never sold, not used for anything else.']],
  ['Where and how long', ['MFD’s database in the EU (Frankfurt), readable only by your account, and nightly encrypted backups kept 30 days.', 'Reminders are set on your phone; nothing about them goes through a server. The lock screen shows only “MFD · Reminder”.', 'Kept until you delete it; gone from backups within 30 days after.']],
  ['Your rights', ['Copy (Export, or the report for your doctor), correct, delete one entry or everything, withdraw consent, and complain to a data protection authority. Ask the MFD owner in the app for anything else.']],
];

export function CyclePrivacy() {
  return <>
    <TopBar title="How your data is handled" back="/settings/cycle" />
    <div className="screen settings-page cy-privacy-page">
      {SECTIONS.map(([h, ps]) => <section key={h} className="card card-pad"><h3>{h}</h3>{ps.map((p) => <p key={p}>{p}</p>)}</section>)}
    </div>
  </>;
}
