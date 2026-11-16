import type {AuthRequest, OAuthHelpers} from '@cloudflare/workers-oauth-provider';
import {SECTIONS, WRITE_SECTIONS, PERMISSIONS} from '../worker/mcp';
import type {IntegrationConfig} from './config';
import {appBadge, escape, htmlPage, icons, mark, message} from './ui';
// The Worker is the OAuth server AI apps connect to, and itself the only Supabase OAuth
// client. AI apps receive opaque tokens valid only at /mcp; the Supabase session that
// reads the diary stays encrypted in the grant (props) and never leaves the Worker.

export const AUTHORIZE = '/oauth/authorize', UPSTREAM_CALLBACK = '/oauth/upstream/callback';
export const SUPABASE_CONSENT = '/oauth/mcp/consent', CONNECTIONS = '/oauth/mcp/connections';
export const TOKEN = '/oauth/token', REGISTER = '/oauth/register';
export type ConnectorProps = {userId: string; connection: string; sb: {access: string; refresh: string}};
export type Identity = {userId: string; email: string; token: string};
type Raw = (path: string, init?: RequestInit, token?: string) => Promise<Response>;
type Ctx = {config: IntegrationConfig; raw: Raw; fetcher: typeof fetch; oauth: OAuthHelpers; identity: () => Promise<Identity | null>};
type Upstream = {state: string; verifier: string; userId: string; sections: string[]; timezone?: string};

const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
const s256 = async (v: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const claimsOf = (token: string) => JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
// RFC 7519 allows a single-valued aud as a string or a one-element array; Auth emits both.
export const audienceIs = (aud: unknown, expected: string) => aud === expected || (Array.isArray(aud) && aud.length === 1 && aud[0] === expected);
// Only listed AI apps (their client metadata document origin) may connect, when a list is set.
export function aiClientAllowed(config: IntegrationConfig, clientId: string) {
  if (!config.aiClients) return true;
  try {const u = new URL(clientId); return u.protocol === 'https:' && config.aiClients.includes(u.origin);} catch {return false;}
}
const unsupported = () => page('<h1>This app can\'t connect</h1><p>My Fitness Diary works with ChatGPT and Claude. Start connecting from one of those apps.</p>', 403);
const zone = (v: string | null) => v && /^[A-Za-z][A-Za-z0-9_+\-\/]{0,63}$/.test(v) ? v : 'UTC';
// Full card bodies start with '<section'; short status texts are wrapped in a message card.
const page = (body: string, status = 200, headers = new Headers(), title = 'My Fitness Diary') => {
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(htmlPage(title, body.startsWith('<section') ? body : message(body)), {status, headers});
};
const redirect = (location: string, headers = new Headers(), status = 302) => {headers.set('Location', location); return new Response(null, {status, headers});};
const login = (request: Request) => {const u = new URL(request.url); return redirect('/login?return_to=' + encodeURIComponent(u.pathname + u.search), new Headers(), 303);};

function upstreamClient(config: IntegrationConfig) {
  const id = config.clients[0], callback = config.authOrigin + UPSTREAM_CALLBACK;
  if (config.clients.length !== 1 || JSON.stringify(config.redirects[id]) !== JSON.stringify([callback])) throw Error('Connector needs exactly one Supabase client with the Worker callback');
  return {id, callback};
}
async function readForm(request: Request, limit = 4096) {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw Error('Form required');
  const reader = request.body?.getReader(); let body = '', size = 0; const decoder = new TextDecoder();
  if (reader) for (;;) {const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) {await reader.cancel(); throw Error('Form too large');} body += decoder.decode(part.value, {stream: true});}
  return new URLSearchParams(body + decoder.decode());
}
// Token endpoint call as the Worker's public (PKCE) Supabase client.
export function upstreamToken(config: IntegrationConfig, fetcher: typeof fetch, body: Record<string, string>) {
  return fetcher(config.supabase + '/auth/v1/oauth/token', {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20_000),
    headers: {'Content-Type': 'application/x-www-form-urlencoded', apikey: config.key},
    body: new URLSearchParams({...body, client_id: upstreamClient(config).id, resource: config.resource})});
}
async function upstreamSession(config: IntegrationConfig, response: Response, userId: string) {
  if (!response.ok) return null;
  const data = await response.json() as {access_token?: string; refresh_token?: string};
  if (!data?.access_token || !data.refresh_token) return null;
  const c = claimsOf(data.access_token);
  if (c.sub !== userId || c.iss !== config.issuer || c.client_id !== upstreamClient(config).id || !audienceIs(c.aud, config.resource) || !(c.exp > Date.now() / 1000)) return null;
  return {access: data.access_token, refresh: data.refresh_token};
}
// Called by tokenExchangeCallback on every AI-app refresh: rotate the Supabase session too.
export async function refreshUpstream(config: IntegrationConfig, fetcher: typeof fetch, props: ConnectorProps): Promise<{status: 'ok'; props: ConnectorProps} | {status: 'revoked' | 'unavailable'}> {
  const r = await upstreamToken(config, fetcher, {grant_type: 'refresh_token', refresh_token: props.sb.refresh});
  if (r.status >= 500 || r.status === 429) return {status: 'unavailable'};
  const sb = await upstreamSession(config, r, props.userId);
  return sb ? {status: 'ok', props: {...props, sb}} : {status: 'revoked'};
}

// Plain names and one-line explanations for each permission, shown on consent and connections.
const LABELS: Record<string, [string, string]> = {
  workouts: ['Workouts', 'Sessions, sets, weights and reps'], routines: ['Routines', 'Your saved workout plans'],
  nutrition: ['Food diary', 'Meals, calories and macros'], progress: ['Body weight', 'Weigh-ins and trends'],
  recovery: ['Recovery', 'Sleep, steps, resting heart rate, HRV and check-ins'],
  profile: ['Profile', 'Name, age, height and goals'],
  log_workouts: ['Add workouts', 'Log a finished session'], log_routines: ['Add routines', 'Create a new workout plan'],
  log_nutrition: ['Add meals and water', 'Log food and water to your diary'], log_progress: ['Add weigh-ins and measurements', 'Record body weight, waist, chest, hips and arms'],
  log_settings: ['Change goals and settings', 'Goal, activity, target weight, water goal, units, rest time. Always asks you first; undo in the app'],
};
// Permissions added in the latest release, marked on the consent page.
const NEW = ['log_settings'];
const tickbox = (attrs: string) => `<input type="checkbox" ${attrs}><span class="box"></span>`;
function permissionGroup(group: 'read' | 'add', title: string, pill: string, list: readonly string[]) {
  return `<section class="card group"><fieldset><div class="ghead"><h2>${title} <span class="pill${group === 'add' ? ' add' : ''}">${pill}</span></h2>
<label class="all tick"><span class="say">Select all</span>${tickbox(`data-all="${group}" aria-label="Select all: ${title}"`)}</label></div>
${list.map(s => `<label class="row tick">${tickbox(`name="permission" value="${s}" data-group="${group}"`)}<span class="lbl"><b>${LABELS[s][0]}${NEW.includes(s) ? '<span class="new">New</span>' : ''}</b><span>${LABELS[s][1]}</span></span></label>`).join('')}</fieldset></section>`;
}
function consentPage(details: Awaited<ReturnType<OAuthHelpers['describeConsent']>>, handle: string, who: Identity) {
  const name = escape(details.clientName);
  const origin = details.clientDomain ? `Published by <b>${escape(details.clientDomain)}</b>` : 'This app registered itself; its name is not verified';
  return `<section class="consent"><form method="post" action="${AUTHORIZE}" data-consent><input type="hidden" name="handle" value="${escape(handle)}"><input type="hidden" name="timezone" value="UTC" data-timezone>
<div class="intro"><div class="pair">${appBadge(details.clientName, 'lg')}<span class="dots"></span>${mark}</div>
<h1>${name} wants to connect to your diary</h1>
<span class="chip">Signed in as ${escape(who.email || who.userId)}</span>
<p class="muted">${origin} · access goes to <b>${escape(details.redirectHost)}</b></p></div>
${details.redirectIsLoopback ? `<div class="note warn" role="note">${icons.shield}<div><p><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p></div></div>` : ''}
${permissionGroup('read', 'See your data', 'Read', SECTIONS)}${permissionGroup('add', 'Add and change', 'You approve', WRITE_SECTIONS)}
<div class="card note">${icons.shield}<div><p>It <strong>can never edit or delete</strong> entries, see your password or change your account. Goal and settings changes need your yes in the chat, and you can undo them in the app.</p><p>Up to 30 new entries a day.</p><p>Remove access any time from your connections page.</p></div></div>
<div class="bar"><p class="summary" aria-live="polite"></p><div class="btns"><button class="btn primary" name="decision" value="approve">Allow access</button><button class="btn" name="decision" value="deny">Cancel</button></div></div>
</form></section>`;
}
// Returns the extra form-action sources the page's redirects will pass through.
export async function authorize(request: Request, ctx: Ctx): Promise<{response: Response; formTargets?: string[]}> {
  const {config, oauth} = ctx;
  if (request.method === 'GET') {
    if (!aiClientAllowed(config, new URL(request.url).searchParams.get('client_id') || '')) return {response: unsupported()};
    let req: AuthRequest;
    try {req = await oauth.parseAuthRequest(request);} catch (error) {
      const to = (error as {redirectTo?: string}).redirectTo;
      return {response: to ? redirect(to) : page('<p>This connection request is invalid. Start again from your AI app.</p>', 400)};
    }
    const who = await ctx.identity(); if (!who) return {response: login(request)};
    const details = await oauth.describeConsent(req), consent = await oauth.beginConsent(req);
    const target = new URL(req.redirectUri);
    return {response: page(consentPage(details, consent.handle, who), 200, consent.headers), formTargets: [config.supabase + '/auth/v1/oauth/authorize', target.origin + target.pathname]};
  }
  if (request.method !== 'POST') return {response: page('Method not allowed', 405)};
  const form = await readForm(request), handle = form.get('handle') || '';
  const who = await ctx.identity(); if (!who) return {response: page('<p>Sign in again, then restart from your AI app.</p>', 401)};
  if (form.get('decision') !== 'approve') {const denied = await oauth.denyConsent(request, handle); return {response: new Response(null, {status: 302, headers: denied.headers})};}
  const sections = form.getAll('permission');
  if (!sections.length || sections.some(s => !PERMISSIONS.includes(s)) || new Set(sections).size !== sections.length) return {response: page('<p>Choose at least one permission.</p>', 400)};
  const approved = await oauth.approveConsent(request, handle, {scope: sections});
  if (!aiClientAllowed(config, approved.request.clientId)) return {response: unsupported()};
  const {id, callback} = upstreamClient(config), verifier = random();
  const up = await oauth.beginUpstream(approved.request, {data: {verifier, userId: who.userId, sections, timezone: zone(form.get('timezone'))}, headers: approved.headers});
  const target = new URL('/auth/v1/oauth/authorize', config.supabase);
  target.search = new URLSearchParams({response_type: 'code', client_id: id, redirect_uri: callback, state: up.state, code_challenge: await s256(verifier), code_challenge_method: 'S256', scope: 'openid email offline_access', resource: config.resource}).toString();
  return {response: redirect(target.href, up.headers)};
}
// Supabase's authorization page for the Worker's own client. The real consent already
// happened on /oauth/authorize; approve only that upstream leg, only in the same browser.
export async function supabaseConsent(request: Request, ctx: Ctx): Promise<Response> {
  const {config, raw} = ctx, url = new URL(request.url), id = url.searchParams.get('authorization_id') || '';
  if (request.method !== 'GET' || !/^[\w-]{1,200}$/.test(id)) return page('<p>Invalid authorization.</p>', 400);
  const pending = (request.headers.get('cookie') || '').split(';').some(c => c.trim().startsWith('__Host-oauth-upstream-'));
  if (!pending) return page('<p>Start connecting from your AI app.</p>', 403);
  const who = await ctx.identity(); if (!who) return login(request);
  const {id: client, callback} = upstreamClient(config);
  const toCallback = (value: unknown) => {const t = new URL(String(value)); if (t.origin + t.pathname !== callback) throw Error('Unexpected upstream redirect'); return redirect(t.href, new Headers(), 303);};
  const r = await raw('/auth/v1/oauth/authorizations/' + encodeURIComponent(id), {}, who.token);
  if (!r.ok) return page('<p>Authorization expired. Start again from your AI app.</p>', 400);
  const details = await r.json() as {redirect_url?: string; redirect_uri?: string; client?: {id?: string}; user?: {id?: string}};
  if (details.redirect_url) return toCallback(details.redirect_url);
  if (details.client?.id !== client || details.user?.id !== who.userId || details.redirect_uri !== callback) return page('<p>This application is not allowed.</p>', 403);
  const a = await raw('/auth/v1/oauth/authorizations/' + encodeURIComponent(id) + '/consent', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'approve'})}, who.token);
  if (!a.ok) return page('<p>Authorization failed. Start again from your AI app.</p>', 400);
  return toCallback((await a.json() as {redirect_url?: string}).redirect_url);
}
export async function upstreamCallback(request: Request, ctx: Ctx): Promise<Response> {
  const {config, raw, oauth, fetcher} = ctx, url = new URL(request.url);
  const resumed = await oauth.finishUpstream<Upstream>(request), original = resumed.request, data = resumed.data;
  const fail = (error: string) => {const t = new URL(original.redirectUri); t.searchParams.set('error', error); if (original.state) t.searchParams.set('state', original.state); if (original.issuer) t.searchParams.set('iss', original.issuer); return redirect(t.href, resumed.headers);};
  const code = url.searchParams.get('code');
  if (url.searchParams.has('error') || !code) return fail('access_denied');
  const sb = await upstreamSession(config, await upstreamToken(config, fetcher, {grant_type: 'authorization_code', code, redirect_uri: upstreamClient(config).callback, code_verifier: data.verifier}), data.userId);
  if (!sb) return fail('server_error');
  // The browser must still be the account that approved; diary sections are saved by that session.
  const who = await ctx.identity(); if (!who || who.userId !== data.userId) return fail('access_denied');
  const saved = await raw('/rest/v1/rpc/mfd_mcp', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({operation: 'consent', args: {client_id: original.clientId, permissions: data.sections, timezone: data.timezone || 'UTC'}})}, who.token);
  if (!saved.ok) return fail('server_error');
  const props: ConnectorProps = {userId: data.userId, connection: original.clientId, sb};
  const {redirectTo} = await oauth.completeAuthorization({request: original, userId: data.userId, metadata: {sections: data.sections, connectedAt: new Date().toISOString()}, scope: data.sections, props});
  return redirect(redirectTo, resumed.headers);
}
// Step-by-step setup per AI app. Menu names moved during 2026, so steps name both places.
const GUIDES: [string, string, string, [string, string][]][] = [
  ['chatgpt', 'ChatGPT', 'https://chatgpt.com', [
    ['Turn on developer mode', 'In ChatGPT open <span class="path">Settings</span>. Developer mode is under <span class="path">Apps &amp; Connectors → Advanced</span> or <span class="path">Security</span>. Needs Plus or higher.'],
    ['Create the connector', 'Go to <span class="path">Apps &amp; Connectors → Create</span>. Name it My Fitness Diary, paste the link, choose OAuth.'],
    ['Sign in and choose access', 'Sign in with your diary account, then tick what ChatGPT may see and add.'],
    ['Try it', 'In a new chat press <span class="path">+</span>, pick My Fitness Diary, and ask "Summarise my last 4 weeks".']]],
  ['claude', 'Claude', 'https://claude.ai', [
    ['Open connectors', 'In Claude go to <span class="path">Customize → Connectors</span> (or <span class="path">Settings → Connectors</span>).'],
    ['Add a custom connector', 'Press <span class="path">+</span> then <span class="path">Add custom connector</span>. Name it My Fitness Diary and paste the link.'],
    ['Connect', 'Press <span class="path">Connect</span>, sign in with your diary account, then tick what Claude may see and add.'],
    ['Try it', 'In a new chat turn on My Fitness Diary from the tools menu and ask "How has my bench press progressed?"']]],
];
function setupGuide(link: string) {
  const picks = GUIDES.map(([id, name]) => [id, name]);
  return `<section class="card"><div class="head"><h2 class="h2">Add an assistant</h2><p class="muted">Takes about a minute. You paste one link into your AI app; everything else is automatic.</p></div>
<div class="setup">${picks.map(([id], i) => `<input type="radio" name="ai" id="app-${id}"${i ? '' : ' checked'}>`).join('')}
<div class="picker">${picks.map(([id, name]) => `<label class="pick p-${id}" for="app-${id}">${appBadge(name)}${name}</label>`).join('')}</div>
<div class="copy"><span>Connector address</span><div class="copyrow"><label class="field" for="connector-link">My Fitness Diary link<input id="connector-link" readonly value="${escape(link)}"></label>
<button type="button" class="btn small primary" data-copy="${escape(link)}" aria-controls="connector-link"><span>Copy</span></button></div></div>
<div class="guides">${GUIDES.map(([id, name, url, steps]) => `<div class="guide g-${id}"><ol class="steps">${steps.map(([b, t]) => `<li><div><b>${b}</b><span>${t}</span></div></li>`).join('')}</ol><a class="btn" href="${url}" target="_blank" rel="noopener">Open ${name}</a></div>`).join('')}</div>
</div></section>`;
}
type AiEntry = {kind: string; id: string; at: string; date?: string; unchanged: boolean; name?: string; meal?: string; kg?: number; kcal?: number; sets?: number; exercises?: number};
const day = (d?: string) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'}) : '';
const count = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// One line per AI entry, in the words the app uses.
function entryLabel(e: AiEntry) {
  const parts = e.kind === 'weights' ? ['Weigh-in', `${e.kg} kg`, day(e.date)]
    : e.kind === 'meals' ? [e.meal || 'Meal', e.name, e.kcal != null ? `${e.kcal} kcal` : '', day(e.date)]
    : e.kind === 'sessions' ? ['Workout', e.name, e.sets != null ? count(e.sets, 'set') : '', day(e.date)]
    : ['Routine', e.name, e.exercises != null ? count(e.exercises, 'exercise') : ''];
  return escape(parts.filter(Boolean).join(' · '));
}
function reviewPage(grantId: string, name: string, entries: AiEntry[]) {
  const removable = entries.filter(e => e.unchanged), kept = entries.filter(e => !e.unchanged);
  if (!removable.length) return `<h1>Nothing to undo</h1><p>${escape(name)} added nothing in the last 24 hours that can be undone.${kept.length ? ` ${count(kept.length, 'entry', 'entries')} you changed in the app or added before undo was available stay in your diary.` : ''}</p><a class="btn primary" href="${CONNECTIONS}">Back to AI assistants</a>`;
  const box = (e: AiEntry) => `<label class="row tick"><input type="checkbox" name="entry" value="${escape(e.id)}" data-group="entry" checked><span class="box"></span><span class="lbl"><b>${entryLabel(e)}</b></span></label>`;
  return `<section class="card"><form method="post" action="${CONNECTIONS}" data-select><input type="hidden" name="grant_id" value="${escape(grantId)}"><input type="hidden" name="action" value="undo">
<div class="head"><h1>Undo what ${escape(name)} added?</h1><p class="muted">Entries from the last 24 hours. Untick anything you want to keep.</p></div>
<fieldset><div class="ghead"><h2>Will be removed <span class="pill add">${removable.length}</span></h2>
<label class="all tick"><span class="say">Select all</span><input type="checkbox" data-all="entry" aria-label="Select all entries" checked><span class="box"></span></label></div>${removable.map(box).join('')}</fieldset>
${kept.length ? `<fieldset><div class="ghead"><h2>Kept <span class="pill">${kept.length}</span></h2></div><p class="muted kept">You changed these in the app, or they were added before undo was available.</p>${kept.map(e => `<div class="row"><span class="lbl"><b>${entryLabel(e)}</b></span></div>`).join('')}</fieldset>` : ''}
<div class="foot"><p class="summary" aria-live="polite"></p><div class="btns"><button class="btn primary" data-submit>Remove selected</button><a class="btn" href="${CONNECTIONS}">Cancel</a></div></div>
</form></section>`;
}
export async function connections(request: Request, ctx: Ctx): Promise<Response> {
  const {raw, oauth} = ctx, who = await ctx.identity();
  if (!who) return request.method === 'GET' ? login(request) : page('<p>Sign in again.</p>', 401);
  const grants = (await oauth.listUserGrants(who.userId)).items;
  const rpc = (operation: string, args: Record<string, unknown>) => raw('/rest/v1/rpc/mfd_mcp', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({operation, args})}, who.token);
  const recent = async (clientId: string): Promise<AiEntry[] | null> => {const r = await rpc('ai_entries', {client_id: clientId}); return r.ok ? await r.json() as AiEntry[] : null;};
  const appName = async (clientId: string) => (await oauth.lookupClient(clientId).catch(() => null))?.clientName || 'this app';
  if (request.method === 'POST') {
    const form = await readForm(request, 16384), id = form.get('grant_id'), grant = grants.find(g => g.id === id);
    if (!grant) return page('<p>Connection not found.</p>', 404);
    if (form.get('action') === 'review') {
      const entries = await recent(grant.clientId);
      if (!entries) return page('<p>Could not load the entries. Try again.</p>', 503);
      return page(reviewPage(grant.id, await appName(grant.clientId), entries), 200, new Headers(), 'Undo AI entries');
    }
    if (form.get('action') === 'undo') {
      const ids = form.getAll('entry');
      if (!ids.length) return page(`<h1>Nothing selected</h1><p>Nothing was removed.</p><a class="btn primary" href="${CONNECTIONS}">Back to AI assistants</a>`);
      const r = await rpc('undo', {client_id: grant.clientId, ids});
      if (!r.ok) return page('<p>Nothing was undone. Try again.</p>', 503);
      const {removed = 0, skipped = 0} = await r.json() as {removed?: number; skipped?: number};
      return page(`<h1>${removed ? 'Changes undone' : 'Nothing removed'}</h1><p>${removed ? `Removed ${count(removed, 'entry', 'entries')} ${escape(await appName(grant.clientId))} added.` : 'Nothing was removed.'}${skipped ? ` ${count(skipped, 'selected entry was', 'selected entries were')} kept because ${skipped === 1 ? 'it' : 'they'} changed or ${skipped === 1 ? 'was' : 'were'} already removed in the meantime.` : ''}</p><a class="btn primary" href="${CONNECTIONS}">Back to AI assistants</a>`);
    }
    await oauth.revokeGrant(grant.id, who.userId);
    // Same app may hold another grant (another redirect URI); keep its diary sections then.
    if (!grants.some(g => g.id !== grant.id && g.clientId === grant.clientId)) {
      const r = await rpc('revoke', {client_id: grant.clientId});
      if (!r.ok) return page('<p>App tokens revoked, but diary permissions could not be removed. Retry.</p>', 503);
    }
    return page('<h1>Access removed</h1><p>The app is signed out and can no longer use your diary.</p><a class="btn primary" href="' + CONNECTIONS + '">Back to AI assistants</a>');
  }
  const rows = await Promise.all(grants.map(async g => {
    const client = await oauth.lookupClient(g.clientId).catch(() => null), name = client?.clientName || 'Unnamed app';
    const tags = g.scope.filter(s => LABELS[s]).map(s => s.startsWith('log_') ? `<span class="tag add">${icons.plus}${escape(LABELS[s][0].replace(/^Add /, ''))}</span>` : `<span class="tag">${icons.eye}${LABELS[s][0]}</span>`).join('');
    const entries = await recent(g.clientId), undoable = entries?.filter(e => e.unchanged).length ?? 0;
    const added = entries === null ? '' : entries.length ? `Added ${count(entries.length, 'entry', 'entries')} in the last 24 h` : 'Nothing added in the last 24 h';
    const since = escape(new Date(g.createdAt * 1000).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}));
    return `<section class="card conn"><div class="conn-head">${appBadge(name)}<div><strong>${escape(name)}</strong><span class="muted">Connected ${since}</span></div></div>
<div class="tags">${tags}</div>${added ? `<p class="added">${added}</p>` : ''}
<div class="actions">${undoable ? `<form method="post" action="${CONNECTIONS}"><input type="hidden" name="grant_id" value="${escape(g.id)}"><input type="hidden" name="action" value="review"><button class="btn" title="See what this app added in the last 24 hours and choose what to remove">${icons.undo}Review &amp; undo</button></form>` : ''}
<form method="post" action="${CONNECTIONS}" data-confirm="Confirm remove"><input type="hidden" name="grant_id" value="${escape(g.id)}"><button class="btn danger">${icons.off}Remove access</button></form></div></section>`;
  }));
  return page(`<section class="intro left"><h1>AI assistants</h1><p class="muted">Apps that can use your diary. Removing one signs it out straight away.</p><p class="muted">Signed in as <span class="chip">${escape(who.email || who.userId)}</span></p></section>
${rows.join('') || '<section class="card"><p class="empty">No AI assistants are connected yet. Follow the steps below to add one.</p></section>'}
${setupGuide(ctx.config.resource)}
<form class="signout" method="post" action="/logout"><button class="linkbtn">Sign out</button></form>`, 200, new Headers(), 'AI assistants');
}
