# Phase C.1B — Consolidated supervised staging execution plan

Prepared 2026-10-29 (Europe/Berlin). **APPROVED S1–S8 by the user on 2026-10-29, including Free/no-upgrade condition and defined emergency stops. Execution record: PHASE-C1B-STAGING-INTEGRATION-REPORT.md.** This is the one bounded approval gate requested by the operating instructions. After approval, continue covered scopes sequentially without repeated permission questions; operator interaction and genuine stop conditions remain necessary. Existing completed work is not replayed.

## Fixed targets and preserved state

Only Supabase **gngnrmzeghjzqsmzuktl**, Cloudflare account **fa8205077c4bc4d2bb38ee035e74a156**, Worker **mfd-connect-staging**, origin **https://mfd-connect-staging.shanustylish777.workers.dev**, resource origin+`/mcp`. Existing private Site remains unchanged/unpublished. Production excluded. No new/deleted users; use only the approved primary/secondary UUID mapping from restricted ignored evidence. No credential extraction, key rotation, RLS/ACL/schema-policy change, paid upgrade, arbitrary migration, commit/push/PR or backup deletion.

Last verified baseline: two confirmed users/two email identities, no sessions/native clients/authorizations/consents/local clients/grants/proposals; signup disabled, Google enabled, OAuth disabled; Site URL localhost:3000; sole fixed Google redirect; no configured hooks; active audience/default already exact Worker /mcp; database and application writes false. Refresh before mutation. Those values are not claimed as a fresh hosted full audit in this planning turn.

The current ChatGPT draft was explicitly reconfirmed by the owner **this turn**: callback `https://chatgpt.com/connector/oauth/Xm83tVWz4VJh`, User-Defined OAuth Client, token method none, secret blank. If draft/callback changes, STOP; do not silently change registration. Google OAuth client ID/secret remain solely the Google→Supabase provider configuration, never the native ChatGPT client ID/runtime allowlist.

## Reviewed artifacts and fixed scope parameters

| Input | SHA-256 |
| --- | --- |
| Maintenance bundle preoauth-worker.js | f56abc06ee671408749c5f1e4e2807771a2b0ab02f62ea14958e55aac1f9de50 |
| preoauth-deployment.proposed.jsonc | 5143a99996088a6dff67cbf6d32a46cea821bddaeb208540f1945eb91472602c |
| Full colocated-worker.js | 4ed447ba67423347b489a232f78497001d7fc8dcabe9432e879f88c52b30a879 |
| Full config template colocated-first-deployment.proposed.jsonc | 730079e18beb89a79d268625f07272e5f079990bbd74297120188c21f41369f1 |
| scripts-prepare-c1b-release.cjs | 7fd28ab432874df6859c7514ae01ff12d48edcafcc4ba3da63c7eb2541cafe0a |
| [Single-client allowlist proposal](../database/staging/c1b-client-allowlist.proposed.sql) | c0c9a8c878d92310450596752aedda07bc9e82394d411109ee8069cc8b243404 |
| [Two-profile fixture proposal](../database/staging/c1b-isolation-fixtures.proposed.sql) | 34bfd3e213ea1230cacfac25e5626b88298b27a1cd2ebb644c199c680b25f82e |

The full release config is intentionally deferred until Supabase assigns the one approved **public native client ID**. This approval would cover only this bounded substitution: exactly that verified ID in a one-element inventory and its sole reconfirmed callback mapping; existing staging publishable key from local staging config; main path adjusted for ignored release directory. No other settings, capabilities, audience, account, permissions or source may change. The local preparation helper validates staging identity/false writes and generates ignored mode0600 config/hash evidence without printing its values. Record final config hash before upload; a change beyond these declared substitutions requires additional review/approval. No client ID is invented or preregistered in this preparation.

Actual runtime privileged secrets: **none**. Full release uses the existing staging **publishable** key; Google secret stays in Supabase. Cloudflare uses existing approved CLI/keyring auth; no new Supabase Management API credentials. Any private UUID assertions must be bound through the existing reviewed private execution channel without putting raw mappings in chat/commands/reports. Never print a credential URI, .pgpass, token, password, auth code or full secret-bearing management response. If a secure execution/readback mechanism is unavailable, STOP; approval does not authorize extracting credentials to obtain it.

## New evidence: supported dashboard sequence

Pinned official Studio source at commit **c777ca1c74fb93dfe932d691e1eb95d148440dee**, [OAuthServerSettingsForm.tsx](https://github.com/supabase/supabase/blob/c777ca1c74fb93dfe932d691e1eb95d148440dee/apps/studio/components/interfaces/Auth/OAuthApps/OAuthServerSettingsForm.tsx), shows:

- handleOAuthServerToggle calls form.setValue, not the update mutation.
- Watched unsaved enabled state reveals Authorization Path and Allow Dynamic OAuth Apps controls.
- onSubmit sends enabled, allow_dynamic_registration and authorization_path together, on **Save changes**.

This refines the previous OFF-only-dashboard blocker: hiding fields does not imply activation is required to edit their draft values. It establishes current public UI code behavior, **not** an independently verified exact deployed dashboard revision or cross-service atomicity. During the approved handoff confirm the backend remains OFF before Save. If toggling immediately saves/enables, or no combined Save workflow exists, invoke approved emergency OFF containment and STOP. Do not proceed with an unknown-DCR interval or use an undocumented endpoint. No browser toggles or config calls were performed in this investigation.

## One consolidated approval: ordered mutation scopes

### S1 — Maintenance deployment and bounded verification

Revalidate account/accepted admin membership/CLI/subdomain, unused name/empty namespace inventory, source/artifact hashes, Free/no-payment-change and current staging baseline. Deploy the reviewed maintenance bundle using the exact config/commands in [pre-OAuth readiness](PHASE-C1B-PREOAUTH-DEPLOYMENT-READINESS.md). Creates one Worker and SQLite namespace/binding with class AbuseCoordinator, migration mfd-c1b-v1, fixed object mfd-staging-shared-v1. No runtime key or clients.

At most20 intentional HTTP probes as already reviewed: public discovery200, consent/callback/MCP/login maintenance503, no cookies/redirects/data acceptance, correct security headers and canonical origin; namespace/deployment/usage evidence. These probes initialize/update quota storage. Do not load-test hosted service, reset counters or claim measured multi-region persistence without evidence. Retain version/namespace IDs privately where appropriate. OAuth stays OFF; Site URL unchanged.

### S2 — Site URL and required token hook, operator dashboard handoff

Only after verified maintenance route availability, use supported staging dashboard:

- Authentication → URL Configuration: Site URL localhost:3000→`https://mfd-connect-staging.shanustylish777.workers.dev`. Preserve complete allowlist with sole exact `/auth/google/callback`; no root/wildcard/ChatGPT addition.
- Authentication → Hooks → Custom Access Token: select existing PostgreSQL function **mfd_mcp.access_token_hook** and enable that binding, only after source/hash/owner/ACL and no competing hook verification. Do not create/replace a function or change privileges. Stop if unavailable/conflicting.

Capture before-values and selected non-secret saved evidence. Site URL changes default email/auth redirects and same-origin trust; maintenance root has no recovery/confirmation UI. No email/invitation/recovery flow is approved during setup. Expected after: OAuth still OFF, new Site URL, exact existing Google callback, one reviewed hook binding, same keys/users, signup closed, Google on, writes false. No keys/Google credentials/provider options changed.

### S3 — Combined OAuth Server dashboard save

With maintenance UI reachable and full local Auth/PKCE implementation already verified, stage a single dashboard save: enabled=true, Authorization Path=`/oauth/mcp/consent`, **Allow Dynamic OAuth Apps=false**. Operator toggles the **unsaved form**, verifies path/DCR fields before saving; the agent reads OAuth feature status to confirm still OFF while draft is edited. Save changes only when all three exact values are visible. Read back saved path/DCR/enabled/Site URL; independently inspect discovery/issuer/JWKS/endpoints. Dashboard-only values must be labeled operator-confirmed. Discovery cannot prove stored DCR=false.

No real flows while maintenance is serving. This explicitly approves a bounded nonfunctional setup window: issuer enabled but consent cannot approve and no users/clients/grants newly added yet. It is not general public readiness. If the user requires fully functional authentication before **any** enablement, this scope must be withheld; current client-registration dependency prevents that stricter sequence without another reviewed implementation. No automatic DCR-on, early registration probe or Management API token workaround.

### S4 — Exactly one native public ChatGPT client

In staging OAuth Apps/client administration create **MFD Staging — ChatGPT**, type Public, token endpoint method **none**, sole redirect `https://chatgpt.com/connector/oauth/Xm83tVWz4VJh`, authorization-code/S256 PKCE, no secret. Keep DCR off. Record Supabase-assigned native ID (non-secret) and inspect exact public registration metadata. Never use Google client ID, CIMD URL or fake ID. If UI cannot represent public/none/no-secret/exact callback, STOP rather than changing architecture/method. No Save/Connect/authorization flow in ChatGPT yet.

### S5 — Finalize and deploy full staging release

Use `node scripts-prepare-c1b-release.cjs <assigned-native-client-id>` from repository root, after native metadata verification. Its argument is the public native ID, never a user UUID or secret. It writes ignored `.sites-runtime/c1b-release/wrangler.json` and hashes. Recheck all declared substitutions, actual archive contamination/source provenance, existing public-key equality without printing it, and false writes. Run relevant local config/types/lint/build/security/native checks after any real config-dependent change; preserve full bundle hash above or stop for review.

From hosting with existing Node22/locked Wrangler, dry-run then, only within approved scope, deploy:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js deploy --config ../.sites-runtime/c1b-release/wrangler.json --no-bundle --no-autoconfig --dry-run --outdir ../.sites-runtime/c1b-release/dry-run
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js deploy --config ../.sites-runtime/c1b-release/wrangler.json --no-bundle --no-autoconfig
```

Reuse exact Worker/namespace/class/fixed object/migration history; no second namespace or new class migration. Full vars replace maintenance vars, adding only actual client inventory and existing publishable key; remove maintenance-only release mode. Verify signed-bearer-required MCP, discovery, available login/consent routes, no unauthenticated private data, secure cookies/CSRF, existing distributed quotas and false writes. No provider login until S7. A fake token must be denied. Maintenance replacement does not grant diary sections.

### S6 — One local MCP registry INSERT

Execute the exact allowlist proposal once, after fresh native/runtime/hook/DCR verification. Same-session target/runtime/OAuth assertions, actual assigned native UUID and two approved UUIDs are supplied privately. It checks exactly two original confirmed/non-anonymous email-only users, empty sessions/authorizations/consents/grants/proposals, exactly one matching nondeleted Public/none native client with the exact name/sole callback, active resource/false writes and empty local registry. Only INSERT is into mfd_mcp.clients for that one ID. No Auth writes, grants/sections or policies seeded. Native redirect storage is a comma-joined text field in the pinned official model; one callback therefore has the exact guarded string. Stop on representation drift, never change guards in a hosted retry.

Verify exactly one native/one local client, same users, no sessions/consent/grants/proposals, both writes false and unchanged security/catalog. Execute no audience SQL. Native grant/session inventories are expected to change only in approved interactive stages afterward.

### S7 — Explicit interactive Google acceptance for both existing accounts

Consolidated approval must expressly include user-completed Google login/consent screens for the two existing controlled accounts and their logout/session-revocation actions. Provide one short handoff per required browser identity; never ask for emails/passwords/tokens in chat or inspect credential values. Restricted mapping remains local. No third account, signup probe that might create a user, invitation, linking API, user merge or Google Cloud/provider setting change.

For A then B, confirm returned subject and Auth identity ownership map to the exact original UUID, total users stays2, no duplicate identity, session belongs to that owner, fixed callback/S256/browser transaction expiry/replay/account-switching and saved consent continuation work. Google identity count may become2 additional Google identities (total4) with no new user; do not call expected additions drift. Stop immediately on wrong UUID/new user/failed linking; do not reopen signup or fabricate identity records. Observe unknown-account protection through signup configuration/local negative tests only; actual unapproved-Google rejection remains NOT TESTED without an approved third identity, which this plan excludes.

### S8 — Exact synthetic fixtures and actual ChatGPT/isolation acceptance

To avoid claiming empty results prove data isolation, this consolidated approval explicitly includes **two synthetic workspace INSERTs only**, using the exact tested fixture proposal. Requires empty forma_workspaces, same two confirmed users, committed resource and false switches. Binds restricted primary/secondary IDs privately. Data is exactly:

- A: `{"profile":{"name":"MFD STAGING A"}}`, revision1.
- B: `{"profile":{"name":"MFD STAGING B"}}`, revision1.

No real health data/workouts, extra users, seeded permissions or overwrite. Existing data means STOP. No automatic deletion/cleanup approved; leave fixtures recorded until separate cleanup approval. If these explicit INSERTs are not approved, authenticated empty tools can be demonstrated, but meaningful hosted data-isolation acceptance remains incomplete.

After fixture verification, hand off current ChatGPT draft: MCP exact /mcp, actual native ID, blank secret, none/S256, verified issuer discovery. Saving/connecting the draft and choosing explicit **profile** section consent for each account are hosted/client mutations explicitly included here only if approved. Login may be repeated to complete the actual pending authorization in the appropriate separate browser profile/account. Never infer diary owner from ChatGPT/Sites identity or email.

Require a genuine authenticated get_profile tool invocation for A→A marker and B→B marker through supported client flow; distinguish discovery, auth, invocation and actual data retrieval. Test unconsented section denial, owner-ID argument rejection, wrong/invalid/expired bearer denial, cookie-not-MCP behavior, direct REST/RPC/storage isolation and OAuth direct-table restrictions. Use first-party user sessions for direct owner checks, never operator bypass as isolation evidence. A valid B bearer returns B's data by design; claiming it must fail merely because another browser owns A would be incorrect. Verify browser account-switch protection separately.

Approve explicit per-account test grant revoke/reconnect/logout and resulting session/token lifecycle checks, not account deletion or global key revocation. Local section removal must deny old-token private data even if native revocation fails; metadata may remain valid until provider expiry/verification fails and is not private-data revocation evidence. Retain newly rotated tokens only in the normal protected client/browser stores; never export into logs/reports. No write-enabled tool succeeds.

Bounded acceptance: S1≤20 intentional Worker probes; S5–S8≤160 intentional Worker/Auth verification requests across both users, sequential/throttled with the existing quotas, no hosted load tests. Record automatic client retries separately and stop repeated/ambiguous failures rather than raising limits. No manipulations of user-held tokens/authorization codes through chat. If client UI hides a required lifecycle/protocol detail, record UNKNOWN and use only approved safe evidence; never invent PKCE-negative, signature or revocation results from local mocks.

## Costs, verification and failure handling across all scopes

Require owner reconfirmation that the Cloudflare account remains Free/no payment or upgrade change; billing API read is unavailable to OAuth auth and no Billing credential will be requested. Workers + SQLite DO are usage-metered resources within Free; expected subscription increment$0 for bounded staging, not a guarantee of availability or billing. Full login adds transaction rows/alarms/writes beyond counter-only estimates; observe actual usage/CPU/log retention. Supabase OAuth has no separately reviewed subscription cost but shares MAU/DB/egress quotas. Stop at any upgrade/payment/entitlement prompt; no paid fallbacks/domain/Redis/SMTP/log drain/PITR.

At each gate use fresh read-only exact target, approved UUID/privacy comparison, expected phase-specific client/identity/session/grant counts, signup/Google/false-switch settings, hook source/ACLs, schema/storage/data baseline and artifact hashes. Never repeat the committed audience migration or its zero-inventory guards after registration. No credential-bearing management GET/dump. No full regression rerun merely to repeat unchanged historical evidence; rerun relevant checks after changes/failures.

**Preapproved non-destructive containment requested with this approval:** disable Worker workers.dev, keep previews off/no alternate routes, verify canonical-origin guards, and/or redeploy the reviewed maintenance artifact on the same namespace with compatible storage. Do not reset counters/delete tables; retain alarm/transaction handling. For OAuth configuration mismatch/unsafe DCR/path, operator sets server OFF through supported dashboard Save (including any confirmation) and verifies. No token/grant deletion is implied by OFF. Restore captured Site URL/hook binding only if needed for this incident and within these exact captured settings; never rotate keys or disable Google/signup containment. Prefer keeping the existing reviewed hook rather than unnecessary rollback. A callback/DCR surprise or ambiguous mutation outcome stops all later scopes; inspect read-only before any retry. After possible token issuance, any return to an older audience, broad restore, user/client/data deletion, credential change or destructive recovery needs separate approval. The existing reverse audience SQL is NOT covered.

## Preparation results and reporting

Existing reviewed runtime/native evidence remains40/40, types/lint/build/scans, quota concurrency/restart persistence and fixed Google transaction native tests PASS; exact bundles unchanged. New guarded registry/fixture proposals pass disposable PostgreSQL tests including drift/lifecycle denial, preservation, strict repeat refusal and injected late atomic rollback. **Latest full runner42/42 PASS.** Release-preparation script syntax PASS; not run with a fabricated real client. No hosted data/row/config writes occurred in this planning turn; only read-only native-client column metadata was queried. Public Studio/model source downloaded to ignored evidence; source behavior is not claimed as a verified actual dashboard revision. New source proposals are not migration-history repairs or already executed scripts.

Maintain concise stage results in the eventual `docs/PHASE-C1B-STAGING-INTEGRATION-REPORT.md`; produce its final outcome only after actual execution/acceptance or a genuine blocker. Record versions/namespaces/artifact hashes/configuration provenance, real versus local evidence, A/B isolation and unknowns, costs observed and containment. Reports omit personal emails/raw UUIDs/provider secrets/codes/tokens. No premature “integration complete” claim; actual authenticated tool/data success is required.

**Approval request:** approve S1–S8 exactly as bounded above, including one Worker/SQLite namespace, maintenance→full deployment, declared config substitutions, operator Site URL/hook/combined OAuth save, one public native client + one local registry INSERT, the two exact synthetic workspace INSERTs, interactive A/B Google and ChatGPT acceptance and stated non-destructive containment. Confirm Free/no-upgrade condition. No unlisted operation is covered. If any scope is withheld, state it explicitly and corresponding dependencies remain blocked. This prompt/plan is not approval. STOP at this gate.
