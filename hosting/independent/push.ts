import {DurableObject} from 'cloudflare:workers';
import type {IntegrationConfig} from './config';
import {privateJson} from './service';
import {knownPushService, sendPush, vapidPublicKey, type PushSubscription, type Vapid} from './webpush';
import {FCM_TOKEN, FcmSender, fcmAccountOf} from './fcm';

// Phone notifications for MFD: rest-timer alerts while the app is in the background, and
// a short message when ChatGPT or Claude adds something. One PushHub object per user holds
// that user's devices (browser push subscriptions and Android app FCM tokens), pending rest alarms and
// preferences. Nothing else.
type Rest = {id: string; ends: number; label: string};
type Prefs = {ai: boolean; social: boolean; messages: boolean};
const PREF_KEYS = ['ai', 'social', 'messages'] as const;
const SOCIAL_PER_HOUR = 30;
const MAX_DEVICES = 5, MAX_RESTS = 10, MAX_AHEAD = 2 * 3600_000;
// Rest IDs are the app's exercise-block IDs, e.g. "<workout uuid>:0".
const ID = /^[\w:.-]{1,100}$/;

export interface PushNamespace {idFromName(name: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub<PushHub>}
export function vapidOf(env: Record<string, unknown>, subject: string): Vapid | null {
  try {const jwk = JSON.parse(String(env.MFD_VAPID_JWK)) as JsonWebKey; return jwk.kty === 'EC' && jwk.crv === 'P-256' && jwk.d && jwk.x && jwk.y ? {jwk, subject} : null;} catch {return null;}
}

export class PushHub extends DurableObject<Record<string, unknown>> {
  private sql: SqlStorage;
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS devices (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, added INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS apps (token TEXT PRIMARY KEY, added INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rests (id TEXT PRIMARY KEY, ends INTEGER NOT NULL, label TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, at INTEGER NOT NULL);`);
  }
  private get(k: string) {return this.sql.exec<{v: string}>('SELECT v FROM state WHERE k=?', k).toArray()[0]?.v;}
  private put(k: string, v: string) {this.sql.exec('INSERT OR REPLACE INTO state (k, v) VALUES (?, ?)', k, v);}
  private vapid() {const v = vapidOf(this.env, this.get('subject') ?? ''); if (!v) throw Error('Push not configured'); return v;}
  private devices() {return this.sql.exec<{endpoint: string; p256dh: string; auth: string}>('SELECT endpoint, p256dh, auth FROM devices').toArray().map(d => ({endpoint: d.endpoint, keys: {p256dh: d.p256dh, auth: d.auth}}));}
  private apps() {return this.sql.exec<{token: string}>('SELECT token FROM apps').toArray().map(a => a.token);}
  private hasDevices() {return this.devices().length + this.apps().length > 0;}
  private fcmSender: FcmSender | null | undefined;
  private fcm() {if (this.fcmSender === undefined) {const a = fcmAccountOf(this.env); this.fcmSender = a ? new FcmSender(a, fetch) : null;} return this.fcmSender;}

  /** Sends to every device of this user; forgets devices the push service says are gone. */
  private async broadcast(message: Record<string, unknown>, topic: string, ttl: number) {
    const vapid = this.vapid(), fcm = this.fcm();
    const statuses = await Promise.all(this.devices().map(async sub => {
      try {
        const status = await sendPush(sub, message, vapid, fetch, {ttl, topic, urgency: 'high'});
        if (status === 404 || status === 410) this.sql.exec('DELETE FROM devices WHERE endpoint=?', sub.endpoint);
        return status;
      } catch {return 0; /* one device failing must not stop the others */}
    }));
    const apps = !fcm ? [] : await Promise.all(this.apps().map(async token => {
      try {
        const result = await fcm.send(token, message, ttl, topic);
        if (result === 'gone') this.sql.exec('DELETE FROM apps WHERE token=?', token);
        return result === 'failed' ? `failed: ${fcm.lastError}` : result;
      } catch (e) {
        // Thrown before Google answered (building the sign-in, or the connection): its type and message, no secrets.
        return `failed: ${fcm.lastError || (e instanceof Error ? `${e.name} ${e.message}` : 'error').slice(0, 80)}`;
      }
    }));
    // Counts, push-service status codes and FCM error codes only (no endpoints, tokens, users or content): visible in
    // `wrangler tail`.
    console.log(JSON.stringify({push: topic, devices: statuses.length, statuses, apps}));
  }

  async addDevice(sub: PushSubscription, subject: string, allowLocal: boolean) {
    if (!knownPushService(sub.endpoint, allowLocal)) throw Error('Unknown push service');
    this.put('subject', subject); if (allowLocal) this.put('local', '1');
    this.sql.exec('INSERT OR REPLACE INTO devices (endpoint, p256dh, auth, added) VALUES (?, ?, ?, ?)', sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now());
    this.sql.exec('DELETE FROM devices WHERE endpoint NOT IN (SELECT endpoint FROM devices ORDER BY added DESC LIMIT ?)', MAX_DEVICES);
  }
  async removeDevice(endpoint: string) {this.sql.exec('DELETE FROM devices WHERE endpoint=?', endpoint);}
  /** The Android app: its FCM token instead of a browser subscription. */
  async addApp(token: string, subject: string) {
    this.put('subject', subject);
    this.sql.exec('INSERT OR REPLACE INTO apps (token, added) VALUES (?, ?)', token, Date.now());
    this.sql.exec('DELETE FROM apps WHERE token NOT IN (SELECT token FROM apps ORDER BY added DESC LIMIT ?)', MAX_DEVICES);
  }
  async removeApp(token: string) {this.sql.exec('DELETE FROM apps WHERE token=?', token);}
  async prefs(): Promise<Prefs> {return {ai: this.get('ai') !== 'off', social: this.get('social') !== 'off', messages: this.get('messages') !== 'off'};}
  async setPrefs(p: Partial<Prefs>) {for (const k of PREF_KEYS) if (typeof p[k] === 'boolean') this.put(k, p[k] ? 'on' : 'off');}

  /** Replaces the pending rest alarms (an empty list cancels them). With `controls` (Android),
   * also shows one silent "Resting" notification with −15s / +15s buttons for the next rest. */
  async setRests(list: Rest[], tz: string | null, controls: boolean) {
    this.sql.exec('DELETE FROM rests');
    for (const r of list) this.sql.exec('INSERT INTO rests (id, ends, label) VALUES (?, ?, ?)', r.id, r.ends, r.label);
    if (tz) this.put('tz', tz);
    await this.schedule();
    const next = list.slice().sort((a, b) => a.ends - b.ends)[0];
    if (controls && next) await this.resting(next);
  }
  private endsAt(ends: number) {
    try {return 'ends at ' + new Intl.DateTimeFormat('en-GB', {timeZone: this.get('tz') ?? 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit'}).format(ends);}
    catch {return `ends in ${Math.max(0, Math.round((ends - Date.now()) / 1000))}s`;}
  }
  private resting(r: Rest) {return this.broadcast({title: `Resting · ${r.label}`, body: this.endsAt(r.ends), tag: 'rest', id: r.id, silent: true, actions: ['minus15', 'plus15']}, 'rest', 60);}
  async rests(): Promise<Rest[]> {return this.sql.exec<Rest>('SELECT id, ends, label FROM rests ORDER BY ends').toArray();}
  /** From a notification button: move a pending (or just finished) rest by `sec` seconds. */
  async adjustRest(id: string, sec: number) {
    const r = this.sql.exec<Rest>('SELECT id, ends, label FROM rests WHERE id=?', id).toArray()[0] ?? this.lastRest(id);
    if (!r) return false;
    const ends = Math.max(Date.now(), Math.max(r.ends, sec > 0 ? Date.now() : 0) + sec * 1000);
    this.sql.exec('INSERT OR REPLACE INTO rests (id, ends, label) VALUES (?, ?, ?)', id, ends, r.label);
    await this.schedule();
    // Taking the last seconds off ends the rest: the alarm sends "Rest over" instead.
    if (ends > Date.now() + 1000) await this.resting({...r, ends});
    return true;
  }
  private lastRest(id: string): Rest | undefined {
    try {const r = JSON.parse(this.get('last') ?? 'null') as Rest | null; return r?.id === id ? {...r, ends: Date.now()} : undefined;} catch {return undefined;}
  }
  private async schedule() {
    const next = this.sql.exec<{ends: number}>('SELECT MIN(ends) AS ends FROM rests').toArray()[0]?.ends;
    if (next == null) await this.ctx.storage.deleteAlarm(); else await this.ctx.storage.setAlarm(next);
  }
  async alarm() {
    const due = this.sql.exec<Rest>('SELECT id, ends, label FROM rests WHERE ends <= ?', Date.now() + 500).toArray();
    for (const r of due) {
      this.sql.exec('DELETE FROM rests WHERE id=?', r.id);
      this.put('last', JSON.stringify(r));
      await this.broadcast({title: 'Rest over', body: r.label, tag: 'rest', id: r.id, actions: ['plus15']}, 'rest', 120);
    }
    await this.schedule();
  }

  /** A friend liked, commented or sent a message. Respects the user's switches; at most 30 an hour.
   * The tag groups them on the phone: a newer like on the same workout replaces the older one. */
  async social(m: SocialMessage) {
    if (this.get(m.kind === 'message' ? 'messages' : 'social') === 'off' || !this.hasDevices()) return false;
    const hour = Math.floor(Date.now() / 3600_000), [h, n] = (this.get('social-rate') ?? '0:0').split(':').map(Number);
    const count = h === hour ? (n ?? 0) + 1 : 1;
    if (count > SOCIAL_PER_HOUR) return false;
    this.put('social-rate', `${hour}:${count}`);
    await this.broadcast({title: m.title, body: m.body, tag: m.tag, url: m.url}, m.kind === 'message' ? 'msg' : m.kind, 86400);
    return true;
  }

  /** One message per AI addition; repeats of the same request are ignored. */
  async aiAdded(requestId: string | null, message: {title: string; body: string; url?: string}) {
    if (this.get('ai') === 'off' || !this.hasDevices()) return;
    if (requestId) {
      this.sql.exec('DELETE FROM seen WHERE at < ?', Date.now() - 86400_000);
      if (this.sql.exec('SELECT 1 FROM seen WHERE id=?', requestId).toArray().length) return;
      this.sql.exec('INSERT INTO seen (id, at) VALUES (?, ?)', requestId, Date.now());
    }
    await this.broadcast({title: message.title, body: message.body, tag: 'ai', url: message.url ?? '/'}, 'ai', 3600);
  }
}

// ── Friends: what a like, comment, message or friend request says (from the database's signed request) ──
export type SocialMessage = {kind: 'like' | 'comment' | 'message' | 'request' | 'accepted'; recipient: string; title: string; body: string; tag: string; url: string};
/** Friend-request notifications are off until switched on (the owner's decision, 2026-11-15). */
export const FRIEND_REQUESTS = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export function socialMessage(b: Record<string, unknown>): SocialMessage | null {
  const kind = b.kind, recipient = b.recipient, actor = text(b.actor_name, 80);
  if ((kind !== 'like' && kind !== 'comment' && kind !== 'message' && kind !== 'request' && kind !== 'accepted') || typeof recipient !== 'string' || !UUID.test(recipient) || !actor) return null;
  // Friend requests: ready (database/social-push-friends.sql), switched on later by FRIEND_REQUESTS.
  if ((kind === 'request' || kind === 'accepted') && !FRIEND_REQUESTS) return null;
  if (kind === 'request' || kind === 'accepted') {
    const user = typeof b.actor_username === 'string' && /^[a-z0-9._]{3,24}$/.test(b.actor_username) ? b.actor_username : null;
    if (!user) return null;
    return kind === 'request'
      ? {kind, recipient, title: `${actor} sent you a friend request`, body: 'Tap to accept or decline', tag: 'friend:' + user, url: '/#/friends/activity'}
      : {kind, recipient, title: `${actor} accepted your friend request`, body: 'You can now see each other\'s workouts', tag: 'friend:' + user, url: '/#/friends/u/' + user};
  }
  const count = typeof b.count === 'number' && Number.isInteger(b.count) && b.count > 0 ? Math.min(b.count, 9999) : 1;
  if (kind === 'message') {
    const user = typeof b.actor_username === 'string' && /^[a-z0-9._]{3,24}$/.test(b.actor_username) ? b.actor_username : null;
    if (!user) return null;
    return {kind, recipient, title: actor, body: count > 1 ? `${count} new messages` : 'Sent you a message', tag: 'msg:' + user, url: '/#/friends/chat/' + user};
  }
  const workout = typeof b.workout === 'string' && /^[\w:.-]{1,100}$/.test(b.workout) ? b.workout : null;
  if (!workout) return null;
  const title = text(b.title, 80) || 'workout', url = `/#/friends/w/${recipient}/${encodeURIComponent(workout)}`;
  if (kind === 'like') {
    const others = count - 1;
    return {kind, recipient, title: others > 0 ? `${actor} and ${others} other${others === 1 ? '' : 's'} liked your ${title}` : `${actor} liked your ${title}`, body: 'Tap to see your workout', tag: 'like:' + workout, url};
  }
  return {kind, recipient, title: `${actor} commented on your ${title}`, body: text(b.text, 160), tag: 'comment:' + workout, url};
}
/** The database signs its requests with a shared secret (Vault "mfd_social_hook" = Worker secret MFD_SOCIAL_HOOK). */
export function hookAllowed(header: string | null, env: Record<string, unknown>) {
  const secret = typeof env.MFD_SOCIAL_HOOK === 'string' ? env.MFD_SOCIAL_HOOK : '';
  if (secret.length < 32 || !header || header.length !== secret.length) return false;
  let diff = 0; for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

// ── What the AI added, in one line ────────────────────────────────
const appName = (connection: string) => {try {const h = new URL(connection).hostname; return h === 'chatgpt.com' || h.endsWith('.openai.com') ? 'ChatGPT' : h === 'claude.ai' || h === 'claude.com' ? 'Claude' : 'Your AI assistant';} catch {return 'Your AI assistant';}};
const MEAL: Record<string, string> = {breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks'};
export function aiMessage(connection: string, operation: string, args: Record<string, unknown>): {title: string; body: string; url: string} | null {
  const app = appName(connection), s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');
  const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  // Tapping the notification opens the page the addition is on.
  const day = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? '/' + args.date : '';
  if (operation === 'log_meal') return {title: `${app} added to ${MEAL[s(args.meal)] ?? 'your food diary'}`, body: [s(args.name) || 'A saved food', typeof args.amount === 'number' ? `${args.amount} ${s(args.unit)}` : ''].filter(Boolean).join(' · '), url: '/#/food' + day};
  if (operation === 'log_workout') return {title: `${app} logged a workout`, body: s(args.name) || `${count(args.exercises)} exercises`, url: '/#/training/history'};
  if (operation === 'create_routine') return {title: `${app} created a routine`, body: s(args.name), url: '/#/training'};
  if (operation === 'log_weight') return {title: `${app} logged your weight`, body: typeof args.kg === 'number' ? `${args.kg} kg` : '', url: '/#/progress/body'};
  if (operation === 'start_workout') return {title: `${app} started a workout`, body: [s(args.name) || s(args.routine) || 'Workout', count(args.exercises) ? `${count(args.exercises)} exercises` : '', 'open the app to begin'].filter(Boolean).join(' · '), url: '/#/workout'};
  if (operation === 'log_water') return {title: `${app} logged water`, body: typeof args.ml === 'number' ? `${args.ml} ml` : '', url: '/'};
  if (operation === 'log_measurements') return {title: `${app} logged measurements`, body: (['waist', 'chest', 'hips', 'arms'] as const).filter((k) => typeof args[k + '_cm'] === 'number').map((k) => `${k[0].toUpperCase() + k.slice(1)} ${args[k + '_cm']} cm`).join(' · '), url: '/#/progress/body'};
  if (operation === 'edit_routine') return {title: `${app} changed a routine`, body: s(args.new_name) || s(args.routine), url: '/#/training'};
  if (operation === 'move_routine') return {title: `${app} moved a routine`, body: [s(args.routine), s(args.folder)].filter(Boolean).join(' → '), url: '/#/training'};
  // Only the confirmed second step changes anything.
  if (operation === 'change_settings') return typeof args.confirm_token === 'string' ? {title: `${app} changed your settings`, body: 'Tap to review or undo', url: '/'} : null;
  if (operation === 'suggest_workout_targets') return {title: `${app} suggested targets`, body: [s(args.routine), `${count(args.exercises)} exercises · review in the app`].filter(Boolean).join(' · '), url: '/#/training'};
  return null;
}

// ── HTTP: /push/* (called by the MFD app server with the user's Supabase session) ──
async function userId(config: IntegrationConfig, fetcher: typeof fetch, request: Request) {
  const token = /^Bearer ([\w.-]{20,4096})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return null;
  const r = await fetcher(config.supabase + '/auth/v1/user', {headers: {apikey: config.key, Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(5000)});
  if (!r.ok) return null;
  const user = await r.json() as {id?: string};
  return typeof user.id === 'string' && /^[0-9a-f-]{36}$/.test(user.id) ? user.id : null;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Error('JSON required');
  const raw = await request.text();
  if (raw.length > 8192) throw Error('Too large');
  const v = JSON.parse(raw); if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Object required');
  return v;
}
function restList(v: unknown): Rest[] | null {
  if (!Array.isArray(v) || v.length > MAX_RESTS) return null;
  const now = Date.now(), out: Rest[] = [];
  for (const r of v) {
    if (!r || typeof r.id !== 'string' || !ID.test(r.id) || typeof r.ends !== 'number' || !Number.isFinite(r.ends) || r.ends < now - 5000 || r.ends > now + MAX_AHEAD || typeof r.label !== 'string') return null;
    out.push({id: r.id, ends: Math.round(r.ends), label: r.label.slice(0, 80)});
  }
  return out;
}

const validZone = (tz: string) => {try {return tz.length <= 64 && !!new Intl.DateTimeFormat('en-GB', {timeZone: tz});} catch {return false;}};

export async function handlePush(request: Request, env: Record<string, unknown>, config: IntegrationConfig, fetcher: typeof fetch, allowLocal = false): Promise<Response> {
  try {
    const path = new URL(request.url).pathname, method = request.method;
    // Server-to-server only: the browser talks to the MFD app, never to this Worker directly.
    if (request.headers.has('origin')) return privateJson({error: 'Invalid origin'}, 403);
    const vapid = vapidOf(env, config.authOrigin), ns = env.MFD_PUSH as PushNamespace | undefined;
    if (!vapid || !ns) return privateJson({error: 'Notifications unavailable'}, 503);
    if (path === '/push/key' && method === 'GET') return privateJson({key: vapidPublicKey(vapid.jwk)});
    // From the database (pg_net), not a browser: signed with the shared secret instead of a user token.
    if (path === '/push/social' && method === 'POST') {
      if (!hookAllowed(request.headers.get('x-mfd-hook'), env)) return privateJson({error: 'Forbidden'}, 403);
      const m = socialMessage(await body(request));
      if (!m) return privateJson({error: 'Invalid notification'}, 400);
      return privateJson({ok: true, sent: await ns.get(ns.idFromName(m.recipient)).social(m)});
    }
    const user = await userId(config, fetcher, request);
    if (!user) return privateJson({error: 'Sign in required'}, 401);
    const hub = ns.get(ns.idFromName(user));
    if (path === '/push/devices' && method === 'POST') {
      const b = await body(request), keys = b.keys as Record<string, unknown> | undefined;
      if ('fcm' in b) {
        if (typeof b.fcm !== 'string' || !FCM_TOKEN.test(b.fcm)) return privateJson({error: 'Invalid app token'}, 400);
        await hub.addApp(b.fcm, config.authOrigin);
        return privateJson({ok: true});
      }
      if (typeof b.endpoint !== 'string' || b.endpoint.length > 1024 || typeof keys?.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 128 || keys.auth.length > 64) return privateJson({error: 'Invalid subscription'}, 400);
      if (!knownPushService(b.endpoint, allowLocal)) return privateJson({error: 'Unknown push service'}, 400);
      await hub.addDevice({endpoint: b.endpoint, keys: {p256dh: keys.p256dh, auth: keys.auth}}, config.authOrigin, allowLocal);
      return privateJson({ok: true});
    }
    if (path === '/push/devices/remove' && method === 'POST') {
      const b = await body(request);
      if (typeof b.fcm === 'string') await hub.removeApp(b.fcm);
      else if (typeof b.endpoint === 'string') await hub.removeDevice(b.endpoint);
      else return privateJson({error: 'Invalid endpoint'}, 400);
      return privateJson({ok: true});
    }
    if (path === '/push/prefs' && method === 'GET') return privateJson(await hub.prefs());
    if (path === '/push/prefs' && method === 'POST') {const b = await body(request), p: Partial<Prefs> = {}; for (const k of PREF_KEYS) if (k in b) {if (typeof b[k] !== 'boolean') return privateJson({error: 'Invalid preferences'}, 400); p[k] = b[k] as boolean;} if (!Object.keys(p).length) return privateJson({error: 'Invalid preferences'}, 400); await hub.setPrefs(p); return privateJson({ok: true});}
    if (path === '/push/rests' && method === 'GET') return privateJson({rests: await hub.rests()});
    if (path === '/push/rests' && method === 'POST') {
      const b = await body(request), list = restList(b.rests);
      if (!list) return privateJson({error: 'Invalid rests'}, 400);
      await hub.setRests(list, typeof b.tz === 'string' && validZone(b.tz) ? b.tz : null, b.controls === true);
      return privateJson({ok: true});
    }
    if (path === '/push/rests/adjust' && method === 'POST') {
      const b = await body(request);
      if (typeof b.id !== 'string' || !ID.test(b.id) || ![-15, 15].includes(b.sec as number)) return privateJson({error: 'Invalid adjustment'}, 400);
      return privateJson({ok: await hub.adjustRest(b.id, b.sec as number)});
    }
    return privateJson({error: 'Not found'}, 404);
  } catch (e) {
    const input = e instanceof SyntaxError || (e instanceof Error && /^(JSON required|Too large|Object required)$/.test(e.message));
    return privateJson({error: input ? 'Invalid request' : 'Notifications unavailable'}, input ? 400 : 503);
  }
}

/** After an AI app adds something: tell that user's devices (best effort, never blocks the tool call). */
export function aiNotifier(env: Record<string, unknown>) {
  const ns = env.MFD_PUSH as PushNamespace | undefined;
  return async (userId: string, connection: string, operation: string, args: Record<string, unknown>) => {
    const message = aiMessage(connection, operation, args);
    if (!ns || !message || !vapidOf(env, '')) return;
    try {await ns.get(ns.idFromName(userId)).aiAdded(typeof args.request_id === 'string' ? args.request_id.slice(0, 100) : null, message);} catch { /* notifications are optional */ }
  };
}
