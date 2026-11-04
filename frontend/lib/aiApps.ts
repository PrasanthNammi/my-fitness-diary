// AI assistants MFD can hand a task to (they reach the diary through the MFD connector).
import { isIOS, type AppLink } from './appLinks';

export type AiApp = 'chatgpt' | 'claude';
export const AI_APPS: AiApp[] = ['chatgpt', 'claude'];
export const AI_APP_NAMES: Record<AiApp, string> = { chatgpt: 'ChatGPT', claude: 'Claude' };

// Both apps type the ?q= message into a new chat (tested on Android and iPhone with the apps installed, Nov 2026),
// except ChatGPT on iPhone: it can keep showing an older unsent message instead. There MFD also copies the message
// so the user can paste it over the old one.
export function aiNeedsCopy(app: AiApp, userAgent: string, maxTouchPoints = 0): boolean {
  return app === 'chatgpt' && isIOS(userAgent, maxTouchPoints);
}

/** New chat in the app (website if the app isn't installed), with `prompt` typed in where the app supports it. */
export function aiChatLink(app: AiApp, prompt: string): AppLink {
  const q = encodeURIComponent(prompt);
  return app === 'chatgpt'
    ? { web: `https://chatgpt.com/?q=${q}`, androidPackage: 'com.openai.chatgpt' }
    : { web: `https://claude.ai/new?q=${q}`, androidPackage: 'com.anthropic.claude' };
}

/** Message asking the assistant to log a food from photos the user attaches in the chat (a link can carry text
 *  only). It lists the photos needed and has the assistant ask for any that are missing. No barcode: the
 *  connector's log_meal can't store one, and assistants misread barcode digits. */
export function logFoodPrompt({ meal, date, today }: { meal: string; date: string; today: string }): string {
  const when = date === today ? 'today' : `on ${date}`;
  return `Using My Fitness Diary, log a food to ${meal} ${when}. I'm attaching photos of: 1) the front of the pack (name and brand), 2) the nutrition table, 3) the ingredients, if there are any. If a photo is missing or hard to read, ask me for it before going on. Read the values per 100 g, ask me how much I ate, and confirm before logging.`;
}

const CHOICE_KEY = 'mfd.aiApp';
export function lastAiApp(): AiApp | null {
  try { const v = localStorage.getItem(CHOICE_KEY); return v === 'chatgpt' || v === 'claude' ? v : null; } catch { return null; }
}
export function rememberAiApp(app: AiApp) {
  try { localStorage.setItem(CHOICE_KEY, app); } catch { /* storage blocked: just don't remember */ }
}
