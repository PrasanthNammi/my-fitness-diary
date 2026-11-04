import { useRef, useState } from 'react';
import { Segmented, TopBar, toast } from '../../components/ui';
import { appHref, type AppLink } from '../../lib/appLinks';

// Production AI connector (Cloudflare Worker); the staging build uses its own link.
const CONNECTOR_URL = 'https://mfd-connect.shanustylish777.workers.dev';

type App = 'chatgpt' | 'claude';
// Same steps as the connector's own page; menu names moved during 2026, so both places are named.
// `app` opens the installed app where possible (see lib/appLinks). Each page was tested on Android and iPhone with
// the apps installed (Nov 2026): ChatGPT stays in the app on /settings (its /apps and home page bounce back to the
// browser); Claude's iOS app opens the Add-connector box, but its Android app only accepts pages like /new.
const STEPS: Record<App, { open: string; app: AppLink; steps: [string, string][] }> = {
  chatgpt: { open: 'Open ChatGPT', app: { web: 'https://chatgpt.com/settings', androidPackage: 'com.openai.chatgpt' }, steps: [
    ['Turn on developer mode', 'In ChatGPT open Settings. Developer mode is under Apps & Connectors → Advanced, or under Security. Needs Plus or higher.'],
    ['Create the connector', 'Go to Apps & Connectors → Create. Name it My Fitness Diary, paste the link, choose OAuth.'],
    ['Sign in and choose access', 'Sign in with your diary account, then tick what ChatGPT may see and add.'],
    ['Try it', 'In a new chat press +, pick My Fitness Diary, and ask “Summarise my last 4 weeks”.'],
  ] },
  claude: { open: 'Open Claude', app: { web: 'https://claude.ai/customize/connectors?modal=add-custom-connector', android: 'https://claude.ai/new', androidPackage: 'com.anthropic.claude' }, steps: [
    ['Open connectors', 'In Claude go to Customize → Connectors (or Settings → Connectors).'],
    ['Add a custom connector', 'Press + then Add custom connector. Name it My Fitness Diary and paste the link.'],
    ['Connect', 'Press Connect, sign in with your diary account, then tick what Claude may see and add.'],
    ['Try it', 'In a new chat turn on My Fitness Diary from the tools menu and ask “How has my bench press progressed?”'],
  ] },
};

/** Where people connect ChatGPT or Claude to their diary (opened from the sparkle button on Today). */
export function AiAssistants() {
  const connector = CONNECTOR_URL;
  const link = connector ? connector + '/mcp' : '';
  const [app, setApp] = useState<App>('chatgpt');
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const short = link.replace(/^https:\/\//, '').replace(/^(.{14}).*(\/mcp)$/, '$1…$2');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast(`Link copied. Paste it into ${app === 'chatgpt' ? 'ChatGPT' : 'Claude'}`);
    } catch {
      field.current?.select();
      toast('Link selected. Copy it with Ctrl+C or Cmd+C');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const guide = STEPS[app];
  const openHref = appHref(guide.app, navigator.userAgent);
  return (
    <>
      <TopBar title="AI assistants" back="/today" bordered />
      <div className="screen stack ai-assistants">
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          Use your diary in ChatGPT or Claude. Paste this link into the app once; signing in and choosing what it may see happen there.
        </p>
        {link ? (
          <div className="card card-pad stack-sm">
            <div className="eyebrow">Your connector link</div>
            <div className="ai-link">
              <button type="button" className="ai-link-field" onClick={copy} aria-label="Copy connector link">
                <span className="row-title">My Fitness Diary link</span>
                <span className="ai-link-url">{short}</span>
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <input ref={field} className="ai-link-hidden" readOnly value={link} aria-label="Connector link" tabIndex={-1} />
          </div>
        ) : (
          <div className="card card-pad small muted">The connector link isn’t set up for this version of the app yet.</div>
        )}
        <Segmented<App> label="AI app" value={app} onChange={setApp} options={[{ value: 'chatgpt', label: 'ChatGPT' }, { value: 'claude', label: 'Claude' }]} />
        <ol className="ai-steps">
          {guide.steps.map(([title, text]) => (
            <li key={title}><div className="row-title">{title}</div><div className="row-sub">{text}</div></li>
          ))}
        </ol>
        {/* Android app links stay in this tab: a new tab would be left empty once the app opens. */}
        <a className="btn btn-secondary btn-block" href={openHref} target={openHref.startsWith('intent:') ? undefined : '_blank'} rel="noopener noreferrer">{guide.open}</a>
        {connector && (
          <div className="card card-pad stack-sm">
            <div className="row-title">Connected apps</div>
            <div className="row-sub">See which assistants can use your diary, undo what one added in the last 24 hours, or remove it.</div>
            <a className="btn btn-soft btn-block" href={connector + '/oauth/mcp/connections'} target="_blank" rel="noopener noreferrer">Manage connected apps</a>
          </div>
        )}
      </div>
    </>
  );
}
