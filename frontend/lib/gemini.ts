// Google Gemini with the person's OWN key (MFD AI). The key is kept on this device only (localStorage) and every
// request goes from the device straight to Google: MFD's server never sees the key or the messages.
// Models: Gemini 2.5 Flash first (stable, like Sparky's default), then the other plain Flash models the key can use.
// Google's free tier gives each model its OWN small daily allowance (20 requests on 2.5 Flash, Nov 2026), so a model
// that is used up (429) is skipped until tomorrow and the next one answers; busy models (503) are tried once more.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = 'mfd-ai-gemini-key', MODEL = 'mfd-ai-gemini-model', MODELS = 'mfd-ai-gemini-models', USED_UP = 'mfd-ai-gemini-used-up';
export const FALLBACK_MODEL = 'gemini-2.5-flash';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode: not kept */ } };

export const geminiKey = () => read(KEY);
export const geminiModel = () => read(MODEL) || FALLBACK_MODEL;
export const maskedKey = (k: string) => (k.length > 10 ? `${k.slice(0, 4)}••••••••${k.slice(-3)}` : '••••');
export function forgetGeminiKey() { write(KEY, null); write(MODEL, null); write(MODELS, null); write(USED_UP, null); }

export class GeminiError extends Error {
  /** status: Google's HTTP status; detail: Google's own reason (never contains the key). */
  constructor(public kind: 'key' | 'format' | 'keytype' | 'busy' | 'quota' | 'offline' | 'blocked' | 'other', message: string, public status = 0, public detail = '') { super(message); }
}

/** What to tell the person for each failure. */
export function geminiErrorText(e: unknown): string {
  const k = e instanceof GeminiError ? e.kind : 'other';
  return k === 'key' ? 'Google didn’t accept the key. Check it in AI Studio and paste it again.'
    : k === 'format' ? 'That doesn’t look like a Gemini key. Copy the whole key from AI Studio and paste it again.'
    : k === 'keytype' ? 'Google didn’t accept this new kind of key here. In AI Studio, open the key and limit it to the Gemini API, or create a new key, then try again.'
    : k === 'quota' ? 'Today’s free Gemini messages are used up. They reset tomorrow.'
    : k === 'offline' ? 'No connection to Google. Check your internet and try again.'
    : k === 'busy' ? 'Gemini is very busy right now. Try again in a minute.'
    : k === 'blocked' ? 'Google didn’t answer this one. Try saying it differently.'
    : 'Something went wrong with Gemini. Try again.';
}
/** Google's short reason, shown small under the message so a problem can be reported. */
export const geminiErrorDetail = (e: unknown) => (e instanceof GeminiError && e.kind !== 'offline' && e.kind !== 'quota' && e.kind !== 'busy' ? [e.status || '', e.detail].filter(Boolean).join(' · ').slice(0, 220) : '');

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

const FLASH = /^gemini-\d+(\.\d+)?-flash$/;   // plain Flash only (Lite models are being retired for new keys)
const version = (n: string) => parseFloat(n.slice(7));
/** The Flash models to use, best first: 2.5 Flash (stable), then the other plain Flash models, older (less busy) first. */
export function flashOrder(names: string[]): string[] {
  const all = [...new Set(names.map((n) => n.replace(/^models\//, '')).filter((n) => FLASH.test(n)))];
  const rank = (n: string) => (n === FALLBACK_MODEL ? 0 : 1);
  return all.sort((a, b) => rank(a) - rank(b) || version(a) - version(b));
}
/** The first choice from flashOrder (null when the key has no Flash model). */
export const pickFlash = (names: string[]): string | null => flashOrder(names)[0] ?? null;
/** Models whose free daily allowance ran out today (Google resets it overnight, Pacific time; skipped until our tomorrow). */
const today = () => new Date().toISOString().slice(0, 10);
const usedUp = (): Record<string, string> => { try { const u = JSON.parse(read(USED_UP) || '{}'); return u && typeof u === 'object' ? u : {}; } catch { return {}; } };
const markUsedUp = (m: string) => write(USED_UP, JSON.stringify({ ...Object.fromEntries(Object.entries(usedUp()).filter(([, d]) => d === today())), [m]: today() }));
const savedOrder = (): string[] => { try { const l = JSON.parse(read(MODELS) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };

/** Checks the key with Google (lists its models), then saves the key and the chosen model on this device. */
export async function saveGeminiKey(raw: string): Promise<void> {
  const key = raw.trim();
  // AI Studio keys: the old "AIza…" kind and the newer "AQ.…" kind (with dots).
  if (!/^[\w.-]{20,300}$/.test(key)) throw new GeminiError('format', 'format');
  const list = await call('models?pageSize=200', key);
  const names: string[] = (list?.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m: any) => m.name);
  const order = flashOrder(names);
  write(KEY, key); write(MODEL, order[0] ?? FALLBACK_MODEL); write(MODELS, JSON.stringify(order.slice(0, 6)));
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
 * asked again without the schema (the instructions still describe the JSON). A busy model (503, once retried) or one
 * not available to the key (404, then remembered) hands over to the next Flash model.
 */
export async function geminiJson<T>(opts: { system: string; turns: Turn[]; schema: object; example?: string; signal?: AbortSignal }): Promise<T> {
  const key = geminiKey();
  if (!key) throw new GeminiError('key', 'missing');
  const ask = (model: string, schema: boolean) => call(`models/${model}:generateContent`, key, {
    systemInstruction: { parts: [{ text: opts.system + (schema ? '' : `\n\nAnswer with ONLY one JSON object (no other text), in this shape, leaving out fields that don't apply:\n${opts.example ?? JSON.stringify(opts.schema)}`) }] },
    contents: alternate(opts.turns).map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    // No "thinking" (a parser, not a puzzle): ~1-2 s instead of 20+ s. Standard JSON Schema via responseJsonSchema.
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 }, ...(schema ? { responseJsonSchema: opts.schema } : {}) },
  }, opts.signal);
  const once = async (model: string): Promise<any> => {
    try { return await ask(model, true); } catch (e) { if (e instanceof GeminiError && e.status === 400) return ask(model, false); throw e; }
  };
  const busy = (e: unknown) => e instanceof GeminiError && (e.status === 503 || e.status === 500 || e.status === 404 || e.kind === 'quota');
  // Keys saved before the model list was kept start with the stable model.
  const saved = savedOrder(), skip = usedUp(), all = [...new Set(saved.length ? [geminiModel(), ...saved, FALLBACK_MODEL] : [FALLBACK_MODEL, geminiModel()])];
  const fresh = all.filter((m) => skip[m] !== today()), models = fresh.length ? fresh : all;
  let data: any, last: unknown;
  for (let i = 0; i < models.length && data === undefined; i++) {
    try { data = await once(models[i]); if (i > 0 && (last as GeminiError).status === 404) write(MODEL, models[i]); }
    catch (e) {
      if (!busy(e)) throw e;
      last = e;
      if ((e as GeminiError).kind === 'quota') markUsedUp(models[i]);
      if (i === 0 && (e as GeminiError).status === 503) {   // a short spike: one more try on the same model
        await new Promise((r) => setTimeout(r, 1200));
        try { data = await once(models[0]); } catch (e2) { if (!busy(e2)) throw e2; last = e2; }
      }
    }
  }
  if (data === undefined) { const e = last as GeminiError; throw e.status === 503 || e.status === 500 ? new GeminiError('busy', e.message, e.status, e.detail) : e; }
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('');
  if (!text) throw new GeminiError('blocked', 'empty', 200, String(data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? ''));
  return jsonIn(text) as T;
}
