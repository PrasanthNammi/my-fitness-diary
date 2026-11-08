import { useRef, useState } from 'react';
import { Bot, Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { InfoButton, Segmented, TopBar, toast } from '../../components/ui';
import { appLinkProps, type AppLink } from '../../lib/appLinks';

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
  const guide = STEPS[app], name = app === 'chatgpt' ? 'ChatGPT' : 'Claude';
  return (
    <>
      <TopBar title="AI assistants" back="/today" bordered />
      <div className="screen stack ai-assistants">
        <section className="ai-connector" aria-label="Personal connector">
          <span className="ai-connector-icon" aria-hidden="true"><Link2 /></span>
          <strong>Personal connector</strong>
          <span className="sub">Diary access</span>
          {link ? (
            <div className="ai-link">
              <button type="button" className="ai-link-url" onClick={copy} aria-label="Copy connector link">{short}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={copy}>{copied ? <><Check aria-hidden="true" />Copied</> : <><Copy aria-hidden="true" />Copy</>}</button>
            </div>
          ) : <span className="sub">Not available in this version</span>}
          <span className="ai-private">Private link</span>
          <input ref={field} className="ai-link-hidden" readOnly value={link} aria-label="Connector link" tabIndex={-1} />
        </section>
        <section className="card card-pad stack-sm" aria-label="Setup">
          <Segmented<App> label="AI app" value={app} onChange={setApp} options={[{ value: 'chatgpt', label: 'ChatGPT' }, { value: 'claude', label: 'Claude' }]} />
          <div className="row-between"><span className="eyebrow">Setup</span><InfoButton title={`${name} setup`} lines={guide.steps.map(([t, x]) => `${t}: ${x}`)} /></div>
          <ol className="ai-steps">
            {guide.steps.map(([title], n) => <li key={title}><span className="num tnum">{n + 1}</span><span>{title}</span></li>)}
          </ol>
          <a className="btn btn-dark btn-block" {...appLinkProps(guide.app, navigator.userAgent)}><ExternalLink aria-hidden="true" />{guide.open}</a>
        </section>
        {connector && <>
          <span className="eyebrow">Connected apps</span>
          <a className="card card-pad ai-manage" href={connector + '/oauth/mcp/connections'} target="_blank" rel="noopener noreferrer">
            <span className="ai-connector-icon soft" aria-hidden="true"><Bot /></span>
            <span className="grow"><span className="row-title">Manage connected apps</span><span className="row-sub">Undo recent entries · remove access</span></span>
            <ExternalLink aria-hidden="true" />
          </a>
        </>}
      </div>
    </>
  );
}
