import type {AddedBy} from './types';
// Name of the AI assistant that added an entry, from the connection it used.
export function aiSource(addedBy?: AddedBy | null): string | null {
  if (!addedBy || typeof addedBy !== 'object') return null;
  let host = '';
  try { host = new URL(String(addedBy.connection)).hostname; } catch { /* not a URL: generic name */ }
  if (host === 'chatgpt.com' || host.endsWith('.openai.com')) return 'ChatGPT';
  if (host === 'claude.ai' || host === 'claude.com') return 'Claude';
  return 'AI assistant';
}
