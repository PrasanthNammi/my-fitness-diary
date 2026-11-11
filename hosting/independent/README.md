# MFD connector (ChatGPT / Claude)

A Cloudflare Worker that lets ChatGPT and Claude read the diary and add to it on the user's behalf, over the
Model Context Protocol (MCP). It is its own OAuth server in front of Supabase: the user signs in (password or
Google), chooses what the assistant may see or add, and can revoke access at any time.

- Production: `https://mfd-connect.shanustylish777.workers.dev` (Supabase project `djyozltkmbzhwuvemxuy`)
- Staging: `https://mfd-connect-staging.shanustylish777.workers.dev` (Supabase project `gngnrmzeghjzqsmzuktl`)

## How it fits together

| File | Role |
| --- | --- |
| `colocated-worker.ts` | Entry point: MCP endpoint, sign-in and consent pages, OAuth metadata, `/push/*` |
| `../worker/mcp.ts` | The MCP tools (read diary, log meals/workouts/weight, create routines, suggest targets, start a workout) |
| `auth.ts`, `google.ts`, `connector.ts` | Sign-in, Google, consent and connections |
| `coordinator.ts` (`AbuseCoordinator`) | One shared Durable Object for rate limits and one-time sign-in records |
| `push.ts`, `webpush.ts` | Phone notifications: rest timer, AI additions, friends' likes/comments/messages |
| `config.ts`, `service.ts`, `limits.ts` | Fixed per-environment configuration, request handling, limits |

The database side is in `database/production/mcp-production.sql` (the `mfd_mcp` schema: sessions, consent per
section, the dispatcher) plus feature files such as `database/mcp-suggest-targets.sql` and
`database/mcp-start-workout.sql`. Every data call goes through Supabase with the user's own token; the database
re-checks the session, the client and the consent for each operation. Assistants may add, never edit or delete.

## Build and test

```sh
node scripts-build-independent.cjs     # bundles to .sites-runtime/independent/ (git-ignored), with artifact scans
npm run test:local                     # every test, network disabled (embedded Postgres for the SQL)
node scripts-smoke-independent.cjs     # local smoke run of the real bundles against synthetic upstreams
```

CI runs the connector job on every pull request (typecheck, lint, build, all tests).

## Deploy

Deploys use Wrangler with a per-environment config kept outside Git (`.sites-runtime/c1d-release/wrangler.json`
for staging, `.sites-runtime/prod-release/wrangler.json` for production): Durable Objects `MFD_ABUSE`
(`AbuseCoordinator`) and, in production, `MFD_PUSH` (`PushHub`), the KV namespace `OAUTH_KV`, and the fixed
environment values. Staging first, then production; note the previous version for rollback
(`wrangler rollback`).

Secrets (`wrangler secret put …`):

- `MFD_VAPID_JWK` — P-256 private key for Web Push. Keep it for the life of the Worker: changing it breaks every
  device's subscription.
- `MFD_SOCIAL_HOOK` — shared with the database (Vault secret `mfd_social_hook`). The database signs friend
  notifications with it (`database/social-push.sql`); `/push/social` refuses anything else, and any browser call.

`MFD_MCP_WRITES` must stay `"false"`: writes are switched on per project in the database (`mfd_mcp.settings`).

## Phone notifications

One `PushHub` Durable Object per user holds that user's devices (max 5), pending rest alerts (max 10, at most
2 h ahead) and their notification switches (AI entries, likes & comments, messages). The app calls `/push/*`
server to server with the user's token; friend notifications come from the database (pg_net) signed with
`MFD_SOCIAL_HOOK`. At most 30 friend notifications per person per hour; chat text is never sent.
