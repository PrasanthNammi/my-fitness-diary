// Firebase Cloud Messaging (HTTP v1) for the MFD Android app, with WebCrypto only. The app's WebView has no
// Web Push, so the PushHub also sends to the app's FCM token. Messages are data-only: the app builds the
// notification itself (rest buttons, opening the right screen).
// Secret MFD_FCM_SA: the Firebase service account JSON (client_email, private_key, project_id).
import {b64u} from './webpush';

export type FcmAccount = {client_email: string; private_key: string; project_id: string};
/** FCM registration tokens: base64url-ish with a colon, around 150–200 characters. */
export const FCM_TOKEN = /^[\w:-]{32,4096}$/;

export function fcmAccountOf(env: Record<string, unknown>): FcmAccount | null {
  try {
    const a = JSON.parse(String(env.MFD_FCM_SA)) as Partial<FcmAccount>;
    return typeof a.client_email === 'string' && typeof a.private_key === 'string' && a.private_key.includes('PRIVATE KEY') && typeof a.project_id === 'string' && /^[a-z0-9-]{4,40}$/.test(a.project_id)
      ? {client_email: a.client_email, private_key: a.private_key, project_id: a.project_id} : null;
  } catch {return null;}
}

const text = new TextEncoder();
const pkcs8 = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));

/** The signed JWT that Google exchanges for an access token (RFC 7523). `now` in ms; tests pass it. */
export async function serviceJwt(account: FcmAccount, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64u(text.encode(JSON.stringify({alg: 'RS256', typ: 'JWT'})));
  const claims = b64u(text.encode(JSON.stringify({iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600})));
  const key = await crypto.subtle.importKey('pkcs8', pkcs8(account.private_key), {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, text.encode(head + '.' + claims));
  return `${head}.${claims}.${b64u(signature)}`;
}

/** Access tokens last an hour; one is reused until five minutes before it ends. */
export class FcmSender {
  private token: {value: string; until: number} | null = null;
  /** Why the last send failed: Google's HTTP status and error code only (never tokens, keys or content). */
  lastError = '';
  constructor(private account: FcmAccount, private fetcher: typeof fetch) {}

  private async accessToken() {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const r = await this.fetcher('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + await serviceJwt(this.account), signal: AbortSignal.timeout(10000)});
    const data = await r.json().catch(() => ({})) as {access_token?: string; expires_in?: number; error?: string};
    if (!r.ok || typeof data.access_token !== 'string') {
      this.lastError = `sign-in ${r.status} ${typeof data.error === 'string' ? data.error.slice(0, 40) : ''}`.trim();
      throw Error('FCM sign-in failed');
    }
    this.token = {value: data.access_token, until: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 300) * 1000};
    return data.access_token;
  }

  /** Returns 'sent', 'gone' (the app was uninstalled or the token replaced: forget it) or 'failed'. */
  async send(token: string, message: Record<string, unknown>, ttl: number, collapse: string): Promise<'sent' | 'gone' | 'failed'> {
    this.lastError = '';
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(message)) if (v !== undefined && v !== null) data[k] = Array.isArray(v) ? v.join(',') : String(v);
    const r = await this.fetcher(`https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + await this.accessToken()},
      body: JSON.stringify({message: {token, data, android: {priority: 'HIGH', ttl: `${ttl}s`, collapse_key: collapse}}}), signal: AbortSignal.timeout(10000)});
    if (r.ok) return 'sent';
    if (r.status === 401) this.token = null;
    const error = await r.json().catch(() => null) as {error?: {status?: string; details?: {errorCode?: string}[]}} | null;
    const code = error?.error?.details?.find(d => d.errorCode)?.errorCode ?? error?.error?.status ?? '';
    this.lastError = `send ${r.status} ${String(code).slice(0, 40)}`.trim();
    return r.status === 404 || code === 'UNREGISTERED' ? 'gone' : 'failed';
  }
}
