# My Fitness Diary (MFD)

Complete source snapshot of the current MFD web app. This repository is private.

Source snapshot: `de930dd440528ea3c29ee5ace059e402d8b141bd` (Sites version 37).

## Run and check

Requires Node.js 20 or later.

```sh
npm ci
npm run build
npm run test:performance
npx tsc -p frontend/tsconfig.json --noEmit
```

Serve `dist/` using a static web server. Production authentication and data access
use the existing Supabase project with owner-scoped policies. The browser's
publishable key is public by design; no service-role keys are included.

## Layout

- `frontend/`: React/TypeScript UI, catalogue adapters, domain logic and repositories.
- `dist/legacy/`: account sync and compatibility engine, auth and retained tools.
- `dist/catalogue/`: unified exercise catalogue and existing media.
- `database/`: schema, access policies, migrations and database tests.
- `tests/`: catalogue, sync, performance, caching and update-safety checks.
- `scripts-build-react.cjs`, `src-sw-template.js`: client build and app caching.
- `.openai/hosting.json`: current Sites project configuration.

The newly generated anatomical GIF experiments are not included or integrated.
Personal workout exports, account data, API secrets and `node_modules` are excluded.
The Hevy integration is read-only.

