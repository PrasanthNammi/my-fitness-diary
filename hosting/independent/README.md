# Independent staging integration — local preparation only

Current hosting decision: see `docs/PHASE-C1A4-REPORT.md`. The preferred local
candidate is `colocated-worker.ts` with one shared SQLite `AbuseCoordinator`;
split-host entrypoints remain retained alternatives. No hosted resource exists.
The colocated proposal has its own exact resource profile and never accepts both
the old Site/Edge audiences. Its example config is not permission to deploy.

`edge.ts` is the isolated Supabase Edge MCP adapter. `auth-worker.ts` is a
separate HTTPS Worker candidate for browser login/consent. Neither is included
in the private Site's entrypoint or hosting manifest. No deployment exists.

Build/test with Node from `.nvmrc` and existing locked dependencies:

```sh
node scripts-build-independent.cjs
node --require ./tests/no-network.cjs tests/independent-mcp.cjs
node --require ./tests/no-network.cjs tests/independent-mcp-database.cjs
node scripts-smoke-independent.cjs
npm run test:local
```

Builds go only to ignored `.sites-runtime/independent/`. The localhost smoke
uses the actual bundles, synthetic upstreams and a temporary 127.0.0.1 listener;
it closes its listener automatically. It makes no hosted calls.

`staging.example.json` deliberately fails startup until exact client IDs,
callbacks, public staging key and an approved reachable HTTPS auth host replace
its placeholders. Never insert secrets into this file. Runtime config pins one
new staging resource, not the old Site audience. No environment fallback or
multiple-audience acceptance is provided.

The MCP handler reuses existing read tools and the fixed `mfd_mcp` RPC. The auth
handler reuses existing section consent/revocation and adds existing-user login,
secure isolated cookies, CSRF, refresh, exact callback checks and logout. It
does not create users, implement a custom OAuth issuer or proxy diary assets.
External clients perform S256 PKCE/code exchange with Supabase.

Only metadata is anonymous on MCP. The auth website necessarily has a public
sign-in form to bootstrap authentication; no diary or connection data is public.
Tool metadata uses OAuth schemes without inventing per-section OAuth scopes.
The live database remains authoritative for session/client/section/owner checks
on each private data operation; metadata methods do not fetch private data.

The included limiter is per isolate, bounded and conservative (60 MCP request
attempts/minute, 30 auth requests/minute per isolate). It is not a distributed
quota, persists no state and resets on restarts. A verified distributed/host
abuse control is a deployment blocker. Do not add a paid store or a hosted SQL
counter implicitly.

Supabase's shared function domain cannot serve HTML as a normal web app.
Do not deploy auth-worker on it or activate a paid custom domain to work around
this. Native Edge Runtime and HTTPS workerd rehearsals now pass with synthetic
upstreams; see `docs/PHASE-C1A3-REPORT.md`. The Edge adapter maps only the exact
observed internal authority/function routes to the fixed staging resource.
Unknown runtime authorities still fail closed. Hosted parity is unverified.

Actual auth-host configuration, coordinated abuse protection, exact client
registration and the separately approved resource transition remain unresolved.
Proposal-only config examples are supplied; neither is an active project config
or permission to deploy. Never package the generated native test fixtures.

Google login is now implemented locally in `google.ts` / `auth.ts`: same-origin
POST `/auth/google`, fixed GET `/auth/google/callback`, browser-bound S256 and
state, verified first-party sessions and preserved consent context. Both routes
use the colocated shared quota. Password login remains. See
`docs/PHASE-C1B-GOOGLE-AUTH-LOCAL.md` for synthetic/native tests and mandatory
provider, exact redirect and existing-user-only signup prerequisites. Real
Google login/provider configuration and all hosted changes remain unapproved.


### Fixed Google callback (local C.1B revision)

Colocated Google redirect_to is exactly auth origin + `/auth/google/callback`, without application state query. The existing MFD_ABUSE/AbuseCoordinator privately stores bounded (128) five-minute single-use PKCE/browser/session/continuation records; consume is atomic before exchange. A second HttpOnly host-prefixed browser cookie binds the opaque flow ID. One pending flow per browser; expiry, replay, account switching, outages and timeouts deny. Password login stays available. Split-host auth-worker without this private transaction implementation denies Google initiation.

Pending records add sensitive ephemeral PKCE material/owner UUIDs, alarms and metered writes beyond the four counters. Review provider retention/quotas and pending-flow-compatible rollback before deployment. No new namespace or hosted resource was created locally. Exact bare callback allowlist proposal and39-test/native evidence: docs/PHASE-C1B-AUTH-REDIRECT-REVIEW.md. Do not use the obsolete state-query pattern. No hosted provider/linking compatibility is claimed.


### Pre-OAuth maintenance candidate

`preoauth-worker.ts` / `preoauth-deployment.proposed.jsonc` is a separate exact-origin, pre-oauth-only release with no upstream fetch/auth/MCP tool handler. Empty client inventory is intentional for this entrypoint, never for the full validator. All known auth/MCP operations503; discovery200 within shared private quota; missing/failed quota denies. No runtime secrets or publishable key. Deployment not authorized. Exact commands/hashes/costs/stop procedure: docs/PHASE-C1B-PREOAUTH-DEPLOYMENT-READINESS.md.

## Phone notifications (`push.ts`, `webpush.ts`)

Rest-timer alerts while MFD is in the background, and one message when an AI app
adds something. One SQLite `PushHub` Durable Object per user holds that user's
push subscriptions (max 5), pending rests (max 10, at most 2 h ahead) and the
AI-message preference. `/push/*` is called server-to-server by the MFD app
(`/api/push/*` in `hosting/worker/mfd.ts`) with the user's Supabase token; browser
calls (any `Origin`) are refused. Endpoints are limited to browser push services.

Each deployed Worker needs, in its (ignored) wrangler config:

```jsonc
"durable_objects": {"bindings": [..., {"name": "MFD_PUSH", "class_name": "PushHub"}]},
"migrations": [..., {"tag": "push-v1", "new_sqlite_classes": ["PushHub"]}]
```

and one secret, a P-256 private key as a JWK (`wrangler secret put MFD_VAPID_JWK`).
Keep the same key for the life of the Worker: changing it breaks every device's
subscription. Without the secret or binding, `/push/*` answers 503 and AI tool calls
are unaffected. Tests: `tests/connector-webpush.cjs` (RFC 8291 vector, VAPID) and
`.sites-runtime/sandbox/connector/push-e2e.mjs` (33 checks against a fake push service).
