# My Fitness Diary (MFD)

Code snapshot matching Sites version 53 (source commit `62b85b8`).

## Recent changes

- Redesigned food diary with collapsible meals, Protein/Carbs/Fats/Fibre, add confirmation, removal and Undo.
- Daily nutrition summary at the bottom and Day/Week/Month nutrient breakdowns.
- Independent workout timer/stopwatch, editable water goal, persistent food favourites and known fibre totals when some values are missing.
- Routine overview and replacement improvements, muscle statistics, calendar/feed fixes, server-managed authentication and security hardening accumulated since the previous repository snapshot.

## Run and check

Use Node.js 22.13 or later. Root and hosting dependencies are installed separately.

```sh
npm ci
npx --yes pnpm@11.25.0 --dir hosting install --frozen-lockfile
npm run build
npm run test:performance
node tests/nutrition-preferences.cjs
node tests/workout-clock.cjs
node tests/food-actions.cjs
node tests/food-summary.cjs
npx tsc -p frontend/tsconfig.json --noEmit
```

To develop locally after installing dependencies, run `npm run dev`. Open `http://localhost:5173`. The Worker accepts localhost or 127.0.0.1 as the callback/CSRF origin only for local requests. In your Supabase project's Authentication → URL Configuration, add `http://localhost:5173/**` as an allowed Redirect URL to test Google/email confirmation. Do not change the production Site URL or use service-role keys. Real sign-in and account access still require your configured Supabase project and network access.

Releases to production follow [RELEASING.md](RELEASING.md): one exact commit of `main`, verified file by file.

The production app now uses the Worker in `hosting/` for authentication and security headers; a static server alone does not reproduce production authentication. Supply runtime secrets through the hosting environment, never source files.

## Layout

- `frontend/`: React/TypeScript screens, domain logic, repositories and adapters.
- `public/`: client files, compatibility engine, exercise media (`public/catalogue/app_media/`) and third-party licenses. `public/react/` and `public/sw.js` are build outputs (not committed).
- `hosting/`: Worker, server authentication, framework configuration and build tools.
- `database/`, `supabase/`: database policies/migrations and metrics endpoint source.
- `monitoring/`: monitoring configuration and dashboards.
- `tests/`: security, sync, catalogue, nutrition, workout and regression checks.
- `.github/workflows/ci.yml`: install, test, type-check and build on PRs and pushes.

The muscle overlay is drawn on the neutral 1254px anatomy illustration (`public/legacy/anatomy/muscles-neutral.png`). `main` matches the production Sites source exactly, apart from build outputs. Personal records, secrets and dependencies are excluded. The Hevy integration remains read-only.
