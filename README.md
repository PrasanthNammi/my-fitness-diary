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
# This code-only update retains existing media under dist/.
# Reuse those assets locally without overwriting the current public source files:
cp -an dist/. public/
cd hosting
npm run install:ci
cd ..
npm run build
npm run test:performance
node tests/nutrition-preferences.cjs
node tests/workout-clock.cjs
node tests/food-actions.cjs
node tests/food-summary.cjs
npx tsc -p frontend/tsconfig.json --noEmit
```

The production app now uses the Worker in `hosting/` for authentication and security headers; a static server alone does not reproduce production authentication. Supply runtime secrets through the hosting environment, never source files.

## Layout

- `frontend/`: React/TypeScript screens, domain logic, repositories and adapters.
- `public/`: current client files and compatibility engine; generated client JS is retained for source parity.
- `hosting/`: Worker, server authentication, framework configuration and build tools.
- `database/`, `supabase/`: database policies/migrations and metrics endpoint source.
- `monitoring/`: monitoring configuration and dashboards.
- `tests/`: security, sync, catalogue, nutrition, workout and regression checks.
- `dist/`: retained previous repository output/media; rebuild to generate current production output.

This update excludes new or changed GIFs and other binary media. Existing repository media is preserved. Personal records, secrets and dependencies are excluded. The Hevy integration remains read-only.
