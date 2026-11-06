# Delta sync (workspace v3)

Goal: the phone uploads and downloads only what changed, the stored diary is smaller, and nothing
is ever lost. The diary stays one JSON document (`forma_workspaces.payload`), so every other
reader and writer keeps working unchanged: the AI connector, the Friends feed projection,
backups and Hevy import.

## Today (v2)

- Every save uploads the whole document through `forma_save_workspace_v2(document, expected_revision)`.
- Every app start or return downloads the whole document.
- Measured on production (6 accounts): the largest diary is 4.5 MB of JSON. 277 workouts take
  4.5 MB: sets about 4.1 MB (8,738 sets at about 480 bytes each), raw Hevy CSV rows (`hevyRows`)
  about 2.7 MB across accounts. The server refuses documents over 8 MB, and the phone keeps a
  full copy in `localStorage`, which browsers cap at about 5 million characters.

## Invariants (all tests check these)

1. **Revision.** Every change to `payload` raises `revision` by exactly 1. This already holds
   for the app's save functions and every connector write. A new trigger enforces it for
   future writers.
2. **Change log.** For every revision `r > 1` there is a change record from `r-1` to `r`.
   Applying it to the payload at `r-1` gives the payload at `r` (jsonb equality). The database
   writes the record itself, whoever changed the payload, so no writer can forget it.
3. **Base.** On the phone, `cloud.base` is exactly the server payload at `cloud.revision`.
   Every way of reaching the server (pull, push, conflict) keeps this true. Whenever the phone
   can't prove it, it falls back to a full download (today's behaviour).
4. **No loss.** Local edits live in the journal or cache until the server confirms a revision
   that contains them, as they do today. Conflicts still go through the existing three-way
   merge (`workspace-merge.js`).
5. **Compaction is idempotent and identical on both sides.** `compact(compact(d)) = compact(d)`,
   and the JavaScript and SQL versions give the same result (cross-checked by tests).

## Change operations (wire and log format)

One change is a JSON array of operations on top-level keys of the document:

| Operation | Meaning |
|---|---|
| `{"k":key,"v":value}` | set top-level `key` to `value` |
| `{"k":key,"d":true}` | delete top-level `key` |
| `{"k":key,"i":id,"v":item}` | in list `key`, replace the item whose `id` equals `id`, or append it if absent |
| `{"k":key,"i":id,"d":true}` | in list `key`, remove the item whose `id` equals `id` |
| `{"k":key,"o":[ids]}` | in list `key`, put the items in this `id` order (must be a permutation) |

A list is diffed item by item only when the old and new lists both consist of objects with
unique, non-null `id`s (sessions, meals, routines, weights, custom exercises and others). Any
other value changes as a whole. Operations apply in order. An order operation is emitted only
when the order after upserts (replace in place, append new) and removals differs from the
target order. Applying a change that doesn't fit (unknown `id` for removal, an order list that
isn't a permutation) is an error, and the phone then does a full download.

## Server

- `forma_workspace_changes(user_id, revision, ops, at)`: written by an `AFTER UPDATE` trigger
  on `forma_workspaces` with `mfd_private.workspace_diff(old.payload, new.payload)`. Kept 30
  days (pg_cron). If the history doesn't reach back to the phone's revision, a full download
  follows.
- `forma_workspace_pull(since_revision)` returns `{revision}` when nothing changed,
  `{revision, changes:[{revision, ops}, ...]}` when the history is complete, and
  `{revision, full:true}` otherwise. It never returns the payload; a full download uses the
  existing `select`.
- `forma_save_workspace_patch(ops, expected_revision)`: compare-and-swap like v2. It applies
  `ops` with `mfd_private.workspace_apply`, validates the result (object, required lists, size
  limit) and returns `{saved_revision, conflict, adjusted}`. `adjusted` is true when
  server-side compaction changed the result. The phone then refreshes in full instead of
  assuming its copy matches.
- `BEFORE INSERT OR UPDATE` trigger: compaction (below) and moving `hevyRows` out, so every
  writer stores the compact form.
- v2 full-document saves stay available as the fallback.

## Compaction (v1)

- **Empty set fields.** In set objects (`sessions[].sets[]`, `routines[].exercises[].setDetails[]`,
  `active.sets[]`), keys whose value is JSON `null` are removed when the key is one of
  `floors, steps, custom_metric, rpe, distance_meters, duration_seconds, superset_id`. The code
  reads these with `!= null` or through `compat.ts` (`?? null`), so missing and null mean the
  same. Other nulls (`kg`, `reps`) are kept.
- **Raw import rows.** `sessions[].hevyRows` moves to `forma_import_rows(user_id, session_id,
  rows)`. They are never deleted, and are included again in exported backups. New Hevy imports
  store their rows there through `forma_put_import_rows`, before the sessions sync. Pending
  rows are journaled on the device until confirmed.

The migration of existing data is verified per account. After compaction and moving the rows,
every session, set, meal, routine and setting is identical to before, apart from the removed
null fields. Every moved `hevyRows` array is byte-identical in its new place. The migration
runs only after a production backup.

## Phone (cloud.js)

- **Pull** (start, return to the app, conflict): with a base, call `forma_workspace_pull(revision)`.
  Then apply the changes to the base to get the remote document, and continue with the existing
  `reconcileCloud`. Without a base, or when `full`, use today's full download.
- **Push**: `ops = diff(base, compact(state))`. If `ops` is empty, nothing is sent. Otherwise
  call `forma_save_workspace_patch`. Without a base, or for the first save (revision 0), use v2.
- `compact` runs on the keys being saved, so `state` itself stays compact and equality checks
  stay exact.

## Tests

- JavaScript ↔ SQL equivalence: thousands of generated document pairs. `diff` in each language,
  `apply` in each language, all four combinations must reproduce the target. The same holds
  for `compact`.
- SQL (rolled-back transactions, local Postgres + PostgREST):
  - revision and change-log invariants for app, connector-style and v2 writes;
  - pull completeness and gaps;
  - patch conflicts and validation;
  - permissions (only the owner reads changes);
  - compaction and import-row moves;
  - migration verification on synthetic diaries the size of real ones.
- Engine (`tests/sync-performance.cjs` harness):
  - pull and push with real revisions;
  - conflict rebases;
  - two devices editing the same and different items;
  - offline edits and app killed mid-save;
  - a connector write while logging a workout;
  - a phone away beyond the history window;
  - pending import rows across restarts;
  - bytes uploaded and downloaded per action, kept below fixed limits.
- Staging rehearsal with copies of real-sized diaries before production.
