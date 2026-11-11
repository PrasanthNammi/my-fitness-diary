# My Fitness Diary

A training and nutrition diary that works as an installable web app on phone and desktop. Log workouts and meals,
follow routines, watch your progress and train alongside friends. It works offline, syncs across devices, and
connects to ChatGPT and Claude so you can ask about your diary or add to it from a chat.

## Features

**Overview**
- Today's calories, macros, water and training at a glance, for any day you pick.
- Date heading with a swipeable week strip and a month calendar; dots mark days with food, a workout, or both.
- A weekly recap at the start of each week.

**Training**
- Routines you can build, reorder, rename and organise. Start a workout from a routine, an earlier session or from scratch.
- Live workout logging with warm-up, working sets, supersets and RPE, a rest timer (with a phone notification
  when it ends), a workout clock, and a plate calculator that uses the plates your gym actually has.
- A catalogue of 1,064 exercises with images and the muscles each one works. You can add your own exercises too.
- Copy an earlier workout to another day, and edit or delete past sessions.

**Food**
- Meals with collapsible sections, protein, carbs, fats and fibre, portion editing, and Undo.
- Barcode scanning in the camera (EAN/UPC, works on blurry or sideways labels), favourites, custom foods and copying a meal.
- Nutrition targets calculated from your profile (Mifflin–St Jeor BMR × activity, adjusted for your goal), or set
  by hand. Day, week and month nutrient breakdowns.

**Progress**
- Bodyweight trend, body measurements and recovery check-ins (sleep, energy, soreness).
- Personal records, estimated 1RM and per-exercise history.
- Muscle distribution on an anatomy diagram, with how sets are counted for each muscle.

**Friends**
- Find people by username, follow their workouts in a feed, react and comment.
- Compare your lifts on exercises you have in common.
- Private chat with disappearing messages (gone 5 minutes after reading, or after 24 hours unread).
- Push notifications for likes, comments and messages, each of which can be switched off.

**ChatGPT and Claude**
- Connect the diary to ChatGPT or Claude and ask about your training and nutrition in plain language.
- The assistant can log meals, workouts and weight, create routines, suggest weights and reps for your next session,
  and start a workout that opens in the app.
- Log a food by sending photos of its label to the assistant.
- You choose which sections each assistant may see or add to, and can revoke access at any time. Assistants can
  add entries but never edit or delete them.
- Anything an assistant adds shows up in one banner on the Overview, with a phone notification if you want one.
  Suggested targets wait for your review before they change a routine.

**Account and data**
- Sign in with email or Google. Light and dark themes, kg or lb, and a chosen first day of the week.
- Export everything, import a backup, or import workout history from a Hevy CSV export.

## How it works

| Part | Technology |
| --- | --- |
| App | React 18 + TypeScript, bundled with esbuild; a service worker caches the whole app for offline use |
| Server | A Cloudflare Worker (Vinext) that serves the app and handles sign-in, sessions and security headers |
| Data | Supabase (Postgres) with row-level security on every table |
| Sync | Each device keeps a local copy and sends only what changed. Edits made on two devices are merged field by field |
| Notifications | Web Push from a separate Worker, using a Durable Object per user for devices and pending timers |
| ChatGPT / Claude connector | A separate Worker (`hosting/independent/`) serving the diary over the Model Context Protocol (MCP), with its own OAuth sign-in and per-section consent; the database re-checks every call. See its [README](hosting/independent/README.md) |
| Monitoring | Prometheus and Grafana dashboards and alerts for sync and server health |

Every response from the server carries a strict Content Security Policy, HSTS and related headers; see
[SECURITY.md](SECURITY.md). The sync design is described in [database/DELTA_SYNC.md](database/DELTA_SYNC.md) and
[database/WORKSPACE_SYNC.md](database/WORKSPACE_SYNC.md).

## Project layout

```
frontend/          React app: screens, components, domain logic (pure, unit-tested), data store and sync
public/            Static files, exercise catalogue and media, legacy compatibility pages
hosting/           Server Worker (worker/), ChatGPT/Claude connector Worker (independent/) and build configuration
database/          Schema, row-level security, sync functions and their tests
supabase/          Metrics function used by monitoring
monitoring/        Prometheus and Grafana configuration
tests/             Unit, regression, security and sync tests
```

## Running locally

Requires Node.js 22.13 or later. The app and the server have separate dependencies.

```sh
npm ci
npx --yes pnpm@11.25.0 --dir hosting install --frozen-lockfile
npm run dev            # http://localhost:5173
```

Sign-in needs a Supabase project. Add `http://localhost:5173/**` as an allowed redirect URL under
Authentication → URL Configuration to test Google and email sign-in locally. Secrets are supplied through the
hosting environment, never committed.

## Tests

```sh
npx tsc -p frontend/tsconfig.json --noEmit    # type check
npm run build                                  # production build
npm run test:local                             # all unit, regression and connector tests (network disabled)
./database/tests/run.sh                        # database and sync tests in Docker (Postgres + PostgREST)
```

GitHub Actions runs the type checks, lint, builds and all test suites on every pull request.

## Releases

Production is released from one exact commit of `main` and verified file by file after publishing; see
[RELEASING.md](RELEASING.md).
