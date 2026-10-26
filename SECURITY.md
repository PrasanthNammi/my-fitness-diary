# MFD security maintenance

## Server boundary

The Vinext Worker in `hosting/worker/mfd.ts` wraps static assets and the same-origin API. It applies CSP, HSTS, nosniff, SAMEORIGIN framing, no-referrer and a restricted Permissions-Policy to responses. JavaScript event attributes and eval are prohibited. `public/` contains the frontend source assets; root `dist/` is generated deployment output.

Authentication uses Supabase through a backend-for-frontend. Access and refresh tokens are held in Secure, HttpOnly, SameSite=Lax, host-only cookies, never returned by login/session JSON. Google and email confirmation use server-side PKCE. Existing browser sessions migrate once through the refresh-token endpoint, then their local token storage is removed. Offline storage retains workspace data and account identity, not authorization tokens. An old offline app must reconnect and update before this migration can occur.

Mutating API requests require the exact production Origin. Cross-site requests are rejected. Auth/API responses are private and no-store; the service worker caches only allowlisted public assets. The proxy forwards only REST and Storage requests and replaces client authorization with the authenticated cookie token. Supabase RLS remains authoritative; no service-role key is used. Request bodies and upstream duration are bounded.

## Data and frontend protection

- Supabase RLS, column grants, ownership checks and social projections enforce access. `database/tests/social.sql` uses synthetic accounts in a rollback-only transaction to check workspace isolation, friendships, photos, chat expiry, cross-owner uploads/deletions and blocking. It passed against the live project on 2026-10-22.
- Storage buckets are private. Avatars permit JPEG up to 1 MiB; workout photos JPEG up to 2 MiB; catalogue photos JPEG/PNG/WebP up to 2 MiB. Paths are scoped to account IDs. Signed links remain usable until expiry; revocation cannot retract previously downloaded images.
- Legacy templates register actual functions through `public/legacy/events.js`. A MutationObserver attaches listeners without compiling strings. Source checks prohibit inline event attributes and runtime eval. Unused old root-level application scripts were removed.
- Images are signature/size checked, decoded, dimension limited and re-encoded to JPEG before upload, stripping original metadata. These checks supplement server bucket restrictions.
- Logout checkpoints pending work and clears clean account caches after successful server logout. Unsynced workspace caches remain for recovery, so shared devices still require care.

## Verification

Run `npm run build`, `npm run test:performance`, and `./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json`. Tests cover server cookies, CSRF, PKCE, refresh, migration, proxy identity, logout failures, cache rules, event hydration, hostile values, uploads, offline recovery and account changes, alongside workout/calendar/feed regressions.

Automated tests do not establish physical-phone Google sign-in, camera/upload or offline behavior. Those smoke tests still require a real device. Verify production response headers after hosting changes. Administrator MFA and optional provider account protections remain account-owner settings. This hardening reduces risk; it is not a guarantee against every vulnerability.
