// Google Gemini with the person's OWN key (MFD AI). The key is kept on this device only (localStorage) and every
// request goes from the device straight to Google: MFD's server never sees the key or the messages.
// The model is the newest plain "Flash" model the key can use, found once when the key is saved.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = 'mfd-ai-gemini-key', MODEL = 'mfd-ai-gemini-model';
export const FALLBACK_MODEL = 'gemini-2.5-flash';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode: not kept */ } };

export const geminiKey = () => read(KEY);
export const geminiModel = () => read(MODEL) || FALLBACK_MODEL;
export const maskedKey = (k: string) => (k.length > 10 ? `${k.slice(0, 4)}••••••••${k.slice(-3)}` : '••••');
export function forgetGeminiKey() { write(KEY, null); write(MODEL, null); }

export class GeminiError extends Error {
  constructor(public kind: 'key' | 'quota' | 'offline' | 'blocked' | 'other', message: string) { super(message); }
}

/** What to tell the person for each failure. */
export function geminiErrorText(e: unknown): string {
  const k = e instanceof GeminiError ? e.kind : 'other';
  return k === 'key' ? 'Google didn’t accept the key. Check it in AI Studio and paste it again.'
    : k === 'quota' ? 'Your free Gemini limit is used up for now. Try again in a minute, or tomorrow for the daily limit.'
    : k === 'offline' ? 'No connection to Google. Check your internet and try again.'
    : k === 'blocked' ? 'Google didn’t answer this one. Try saying it differently.'
    : 'Something went wrong with Gemini. Try again.';
}

async function call(path: string, key: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, { method: body ? 'POST' : 'GET', signal, referrerPolicy: 'no-referrer',
      headers: { 'x-goog-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new GeminiError('offline', 'offline'); }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const reason = JSON.stringify(data?.error ?? '');
  if (res.status === 429) throw new GeminiError('quota', reason);
  if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(reason)) throw new GeminiError('key', reason);
  throw new GeminiError('other', `${res.status} ${reason}`.slice(0, 300));
}

/** Picks the newest plain Flash model from the key's model list (no lite/image/audio/preview variants). */
export function pickFlash(names: string[]): string | null {
  const plain = names.map((n) => n.replace(/^models\//, '')).filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
  const version = (n: string) => parseFloat(n.slice(7));
  return plain.sort((a, b) => version(b) - version(a))[0] ?? null;
}

/** Checks the key with Google (lists its models), then saves the key and the chosen model on this device. */
export async function saveGeminiKey(raw: string): Promise<void> {
  const key = raw.trim();
  if (!/^[\w-]{20,200}$/.test(key)) throw new GeminiError('key', 'format');
  const list = await call('models?pageSize=200', key);
  const names: string[] = (list?.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m: any) => m.name);
  write(KEY, key); write(MODEL, pickFlash(names) ?? FALLBACK_MODEL);
}

export type Turn = { role: 'user' | 'model'; text: string };

/** One structured answer: Gemini must reply with JSON matching `schema`. */
export async function geminiJson<T>(opts: { system: string; turns: Turn[]; schema: object; signal?: AbortSignal }): Promise<T> {
  const key = geminiKey();
  if (!key) throw new GeminiError('key', 'missing');
  const data = await call(`models/${geminiModel()}:generateContent`, key, {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: opts.schema },
  }, opts.signal);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  if (!text) throw new GeminiError('blocked', JSON.stringify(data?.promptFeedback ?? data?.candidates?.[0]?.finishReason ?? ''));
  try { return JSON.parse(text) as T; } catch { throw new GeminiError('other', 'not json'); }
}
