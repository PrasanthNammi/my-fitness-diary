# Workspace synchronization and catalogue normalization

The server's owner-only workspace RLS and revision-checked save RPC remain the authority.
No server overwrite bypass, automatic sign-out, or forced update during workouts is used.

Each account cache contains the current document and compact inverse patches describing
its last confirmed baseline and any unresolved cloud candidate. A synchronous journal
protects edits until the deferred full checkpoint completes. On a revision change,
`workspace-merge.js` performs a three-way merge by entity ID and nested field. Independent
changes merge; edit/delete or same-value conflicts retain the local value and the remote
candidate. These never block data entry. Explicit per-field choices are available through
the sync indicator. Choices are invalidated if the remote value changes again.

Legacy dirty caches without a baseline use conservative union matching and retain both
values wherever a safe decision cannot be inferred. No old recovery backup is deleted.

Catalogue normalization is deterministic and idempotent. It runs after reconciliation,
on incoming cloud copies, and on saved history/routines. Parent routine IDs also repair
stale set-detail IDs. The React compatibility view uses the same resolver and applies
engine-normalized writes immediately. Measurements and original import rows survive.

Service-worker activation requires idle, checkpointed top-level windows, no active workout,
no form/draft/modal, and consent from every open MFD window. Unknown clients prevent early
activation. Only public app/catalogue/media assets enter the service-worker cache.

Validation: `npm run test:performance`, TypeScript, and the Sites build helper. Tests cover
entity merges, real field conflicts, deletions, baseline persistence, offline journals,
GET/POST races, CAS retry, source-ID migration, set-detail identity, cache boundaries,
and multi-window update activation. Real-device verification remains a user check.
