import { Sheet, toast } from '../../components/ui';
import { appLinkProps } from '../../lib/appLinks';
import { AI_APP_NAMES, AI_APPS, aiChatLink, aiNeedsCopy, lastAiApp, logFoodPrompt, rememberAiApp, type AiApp } from '../../lib/aiApps';
import { navigate } from '../../lib/router';
import { todayISO } from '../../lib/format';

/** Hands "log this food" to ChatGPT or Claude: the user attaches label photos there and the assistant logs it
 *  through the MFD connector. The logged food then shows up under recent foods and can be starred. */
export function CreateWithAiSheet({ open, onClose, mealLabel, date, barcode }: { open: boolean; onClose: () => void; mealLabel: string; date: string; barcode?: string | null }) {
  const prompt = logFoodPrompt({ meal: mealLabel, date, today: todayISO(), barcode });
  const last = lastAiApp();
  const order: AiApp[] = last ? [last, ...AI_APPS.filter((a) => a !== last)] : AI_APPS;
  const ua = navigator.userAgent;
  const pick = (app: AiApp) => {
    rememberAiApp(app);
    // Started inside the tap so the browser allows it; the toast is waiting when the user comes back.
    if (aiNeedsCopy(app, ua, navigator.maxTouchPoints)) navigator.clipboard?.writeText(prompt).then(() => toast(`Message copied. If ${AI_APP_NAMES[app]} shows an older message, paste this over it`), () => toast('Copy the message shown here'));
    // Close after the link has been followed (closing during the tap would remove the link first).
    setTimeout(onClose, 300);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Create with AI">
      <p className="muted" style={{ marginTop: 0 }}>
        Attach the photos in the chat; your AI assistant reads them and logs the food to {mealLabel}. {barcode ? "It's also saved to My foods, so scanning this pack finds it next time." : "Next time you'll find it under recent foods."}
      </p>
      <div className="ai-create-message" aria-label="Message for the assistant">{prompt}</div>
      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        {order.map((app, i) => (
          <a key={app} className={`btn btn-block ${i === 0 && last ? 'btn-primary' : 'btn-secondary'}`} {...appLinkProps(aiChatLink(app, prompt), ua)} onClick={() => pick(app)}>
            Open {AI_APP_NAMES[app]}
          </a>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Needs My Fitness Diary connected in that app.{' '}
        <button className="btn-link" style={{ minHeight: 0, padding: 0 }} onClick={() => { onClose(); navigate('/coach'); }}>Set it up</button>
      </p>
    </Sheet>
  );
}
