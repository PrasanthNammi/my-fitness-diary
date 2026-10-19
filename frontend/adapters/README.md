# Adapters and repositories

The UI never touches storage directly. It goes through:

| Layer | File | Prototype implementation | Later |
|---|---|---|---|
| Auth | `adapters/auth.ts` | Device-only profile (`deviceAuth`). No password verification, no data protection. | Supabase Auth (Google OAuth + email/password) implementing `AuthAdapter`. |
| Data | `data/repositories.ts` | Local repositories over `data/store.ts` (one versioned document in localStorage). | Supabase tables; keep the same method names so screens don’t change. |
| Exercise catalogue | `data/exerciseCatalog.ts` | Bundled sample records shaped like ExerciseDB, Free Exercise DB and wger entries. | Server-side sync/import job; media and instructions filled from the source. |
| Food lookup | `adapters/barcode.ts` | Camera scanning via `BarcodeDetector` when the browser supports it; lookup searches foods saved on the device. | A `BarcodeLookup` backed by a product database (e.g. Open Food Facts) via your backend. |
| Coach | `adapters/coach.ts` | Labelled sample responses. | Calls your backend (e.g. an Edge Function) that holds the provider key server-side. |

## Suggested Supabase tables

`profiles`, `folders`, `routines` (exercises as JSONB), `workouts` (exercises as JSONB),
`custom_exercises`, `foods` (custom), `favourite_foods`, `diary_entries`, `water_logs`,
`weights`, `checkins`, `coach_messages`. Every table carries `user_id` with row-level security.

## Hevy

Hevy access must stay read-only: import Hevy workouts into this app, never write back.
