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
  /** status: Google's HTTP status; detail: Google's own reason (never contains the key). */
  constructor(public kind: 'key' | 'format' | 'keytype' | 'quota' | 'offline' | 'blocked' | 'other', message: string, public status = 0, public detail = '') { super(message); }
}

/** What to tell the person for each failure. */
export function geminiErrorText(e: unknown): string {
  const k = e instanceof GeminiError ? e.kind : 'other';
  return k === 'key' ? 'Google didn’t accept the key. Check it in AI Studio and paste it again.'
    : k === 'format' ? 'That doesn’t look like a Gemini key. Copy the whole key from AI Studio and paste it again.'
    : k === 'keytype' ? 'Google didn’t accept this new kind of key here. In AI Studio, open the key and limit it to the Gemini API, or create a new key, then try again.'
    : k === 'quota' ? 'Your free Gemini limit is used up for now. Try again in a minute, or tomorrow for the daily limit.'
    : k === 'offline' ? 'No connection to Google. Check your internet and try again.'
    : k === 'blocked' ? 'Google didn’t answer this one. Try saying it differently.'
    : 'Something went wrong with Gemini. Try again.';
}
/** Google's short reason, shown small under the message so a problem can be reported. */
export const geminiErrorDetail = (e: unknown) => (e instanceof GeminiError && e.kind !== 'offline' && e.kind !== 'quota' ? [e.status || '', e.detail].filter(Boolean).join(' · ').slice(0, 220) : '');

async function call(path: string, key: string, body?: unknown, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, { method: body ? 'POST' : 'GET', signal, referrerPolicy: 'no-referrer',
      headers: { 'x-goog-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new GeminiError('offline', 'offline'); }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const reason = JSON.stringify(data?.error ?? ''), said = String(data?.error?.message ?? '').replace(/\s+/g, ' ').replace(/(AIza|AQ\.)[\w.-]+/g, '…');
  const fail = (kind: GeminiError['kind']) => new GeminiError(kind, reason.slice(0, 300), res.status, said);
  if (res.status === 429) throw fail('quota');
  if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/.test(reason)) throw fail('keytype');
  if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(reason)) throw fail('key');
  throw fail('other');
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
  // AI Studio keys: the old "AIza…" kind and the newer "AQ.…" kind (with dots).
  if (!/^[\w.-]{20,300}$/.test(key)) throw new GeminiError('format', 'format');
  const list = await call('models?pageSize=200', key);
  const names: string[] = (list?.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m: any) => m.name);
  write(KEY, key); write(MODEL, pickFlash(names) ?? FALLBACK_MODEL);
}

export type Turn = { role: 'user' | 'model'; text: string };

/** Turns as Gemini wants them: starting with the person, alternating (two in a row are joined). */
export function alternate(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) { if (!t.text.trim()) continue; const last = out[out.length - 1]; if (last && last.role === t.role) last.text += '\n' + t.text; else out.push({ ...t }); }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
/** The JSON inside Gemini's text (tolerates ```json fences or a sentence around it). */
export function jsonIn(text: string): unknown {
  try { return JSON.parse(text); } catch { /* look for the object */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new GeminiError('other', 'not json', 200, 'The answer wasn’t in the expected format');
}

/**
 * One structured answer: Gemini replies with JSON matching `schema`. If Google refuses the request (400), it is
 * asked again without the schema (the instructions still describe the JSON); if the chosen model isn't available
 * to this key (404), the standard Flash model is used and remembered.
 */
export async function geminiJson<T>(opts: { system: string; turns: Turn[]; schema: object; signal?: AbortSignal }): Promise<T> {
  const key = geminiKey();
  if (!key) throw new GeminiError('key', 'missing');
  const ask = (model: string, schema: boolean) => call(`models/${model}:generateContent`, key, {
    systemInstruction: { parts: [{ text: opts.system + (schema ? '' : `\n\nAnswer with ONLY a JSON object matching this JSON schema (no other text):\n${JSON.stringify(opts.schema)}`) }] },
    contents: alternate(opts.turns).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', ...(schema ? { responseSchema: opts.schema } : {}) },
  }, opts.signal);
  let model = geminiModel(), data: any;
  try { data = await ask(model, true); } catch (e) {
    if (!(e instanceof GeminiError) || e.kind !== 'other') throw e;
    if (e.status === 404 && model !== FALLBACK_MODEL) { model = FALLBACK_MODEL; write(MODEL, model); data = await ask(model, true).catch((e2) => { if (e2 instanceof GeminiError && e2.status === 400) return ask(model, false); throw e2; }); }
    else if (e.status === 400) data = await ask(model, false);
    else throw e;
  }
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
  if (!text) throw new GeminiError('blocked', 'empty', 200, String(data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? ''));
  return jsonIn(text) as T;
}
