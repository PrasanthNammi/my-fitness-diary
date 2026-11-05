// Web Push with WebCrypto only: payload encryption (RFC 8291, aes128gcm) and
// VAPID authentication (RFC 8292). No library; works in Workers and Node 20+.
export type PushSubscription = {endpoint: string; keys: {p256dh: string; auth: string}};
export type Vapid = {jwk: JsonWebKey; subject: string};

const text = new TextEncoder();
export const b64u = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) {out.set(p, i); i += p.length;} return out;};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, key, length * 8));
}

/** Encrypts one record for a subscription. `salt` and `sender` are only passed by tests (RFC 8291 Appendix A). */
export async function encryptPayload(sub: PushSubscription, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16)), sender?: CryptoKeyPair): Promise<Uint8Array> {
  const uaPublic = fromB64u(sub.keys.p256dh), authSecret = fromB64u(sub.keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw Error('Invalid subscription keys');
  const as = sender ?? await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: uaKey} as never, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(text.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, text.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // A single record: payload followed by the 0x02 "last record" delimiter.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

/** The application server key the browser subscribes with (uncompressed P-256 point). */
export const vapidPublicKey = (jwk: JsonWebKey) => b64u(concat(new Uint8Array([4]), fromB64u(jwk.x!), fromB64u(jwk.y!)));

export async function vapidHeader(endpoint: string, vapid: Vapid, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u(text.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const claims = b64u(text.encode(JSON.stringify({aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject})));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, text.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${vapidPublicKey(vapid.jwk)}`;
}

/** Push services browsers use. Anything else is refused, so stored endpoints cannot point elsewhere. */
export function knownPushService(endpoint: string, allowLocal = false) {
  try {
    const url = new URL(endpoint);
    if (allowLocal && url.protocol === 'http:' && url.hostname === '127.0.0.1') return true;
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname;
    return ['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com'].includes(host) || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  } catch {return false;}
}

/** Sends one notification. Returns the push service status (404/410 = subscription gone). */
export async function sendPush(sub: PushSubscription, message: unknown, vapid: Vapid, fetcher: typeof fetch, options: {ttl?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string} = {}) {
  const body = await encryptPayload(sub, text.encode(JSON.stringify(message)));
  const headers: Record<string, string> = {'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(options.ttl ?? 300), Urgency: options.urgency ?? 'high', Authorization: await vapidHeader(sub.endpoint, vapid)};
  if (options.topic) headers.Topic = options.topic;
  const r = await fetcher(sub.endpoint, {method: 'POST', headers, body, signal: AbortSignal.timeout(10000)});
  return r.status;
}
