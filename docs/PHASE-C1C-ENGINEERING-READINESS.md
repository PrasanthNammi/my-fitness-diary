# Phase C.1C — Local engineering readiness

Date: 2026-10-30, Europe/Berlin. **Local preparation complete; no live execution or deployment authorized by this report. Production acceptance remains NO-GO.** Existing connected A/B profile reads and eight section-denial results remain genuine hosted evidence in the consolidated security report. This engineering pass used synthetic credentials and local emulators; it did not start a Google login or change hosted state.

## Changes and verified causes

The MCP response wrapper cloned and parsed every successful JSON response to find metadata that only tools/list and authorization-denied responses need. The correction bypasses that work for ordinary reads, initialize and ping, and consumes decorated responses once. Authentication still calls the pinned Auth user endpoint on every request; consent/data RPC checks, strict claims, readonly tools, challenge responses and limiter budgets are retained. No token/user/consent cache was introduced. This is a demonstrated local inefficiency, not a proven complete explanation of the hosted 16.912ms p99.

Seven alternating warm synthetic benchmark batches measured median CPU reductions: profile reads 268.28→246.45 microseconds (8.1%), tools/list 128.83→114.32 (11.3%), initialize 91.78→78.92 (14.0%). Native workerd sampling independently shows removal of the response-clone hot node; sample totals are not a precise speedup estimate. Minification reduces the proposed bundle from 53,689 to 35,660 bytes (33.6%). Cold-start and hosted CPU effects remain unmeasured. Cloudflare's [Free limit](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) is 10ms per HTTP request; occasional flexibility does not establish dependable headroom. A separately approved deployment and representative read-only metrics are required.

The lifecycle test core now verifies every refreshed JWT signature/issuer/audience/session and checks live access immediately before replay/logout. It also verifies that post-event denial occurs before access-token expiry. These changes close potential false-positive acceptance evidence; they are not findings of a hosted authorization bypass. Regression cases cover wrong refreshed signatures/claims, already-dead sessions and expiry during test waits.

The proposed native Safari helper replaces all manual callback copying and hidden Terminal entry. The operator prepares one fresh private one-tab Safari window and selects the approved Google account normally. The helper pairs only that explicitly dedicated window, performs a mandatory local data-page URL/source smoke test before Google navigation, and transfers only its newly initiated callback through an internal pipe. Tokens/verifiers remain in harness memory; no existing browser session/cookie/history is read. It checks the exact callback, fixed CB_TRANSACTION_REQUIRED page and unchanged URL, exchanges once and closes only the owned window. No WebDriver evasion, Accessibility access or Safari JavaScript setting is used. macOS Automation permission may be required.

**Actual Safari/Google compatibility is NOT TESTED.** AppleScript compilation and modeled integration passed, but no native Safari automation was executed. Safari exposes no private-mode property: private isolation requires the operator's explicit attestation. Browser/provider HTTP requests are not machine-counted; the runner's 30-request cap does not bound Google's traffic. Callback GET provenance is inferred from the expected Worker page, not a captured HTTP method. These limitations require explicit approval of this replacement method; earlier manual/Playwright manifests are superseded and must not be launched.

## Verification

| Check | Result / evidence scope |
| --- | --- |
| Full network-blocked test runner | PASS 61/61 files |
| Refreshed-signature, replay/logout validity regression | PASS synthetic lifecycle/provider model |
| Safari window ownership, callback races, preflight stops, one-use transfer | PASS models; native script compiled only |
| Safari modeled SDK/PGlite/PKCE lifecycle | PASS 23 runner requests, two synthetic identities; no real provider |
| TypeScript (both projects), hosting lint | PASS |
| Production-mode staging build, independent builds, artifact scans | PASS; public37/hosting169/selected167 scanned |
| Dependencies | Root0; hosting one existing development-only moderate advisory GHSA-67mh-4wv8-2f99, zero high/critical; no dependency update |
| Exact proposed minified module, Wrangler dry-run packaging | PASS byte-identical; no upload |
| Native HTTPS workerd/SQLite full proposed Worker | PASS auth/MCP/consent/reconnect/Origin/CSRF/replay/owner injection/write denial |
| Native concurrency and persistence | PASS 90 mixed requests/global30, restart counters retained, callback race one303/one400 |
| Real Safari, real refreshed-token lifecycle, new hosted CPU headroom | NOT TESTED in this pass |

Expired local test TLS material was replaced with a new local-only certificate; clients still verify TLS against the explicit test CA. No OS trust change or disabled certificate validation. Emulators are stopped, local state retained. No SQL is required for this patch; no ACL/RLS or legitimate service_role grants change.

## Exact reviewed artifacts

| Artifact | SHA-256 |
| --- | --- |
| Proposed 35,660-byte Worker .sites-runtime/c1c-engineering/release/colocated-worker.proposed.js | 05b1811e2f09042faf36f405241439d78c9c0fefbe8dc2279d635dfe0d19f9f0 |
| Unchanged runtime .sites-runtime/c1b-release/wrangler.json | e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5 |
| Preserved current release bundle | 0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e |
| [Safari 18-file manifest](artifacts/c1c-safari-manifest.json) | 1491b31097581d3ca3452c8894d5eb7186d0f2ead32e5183148b89a2179453ba |

The unchanged config contains existing public runtime configuration and must not be dumped into chat/logs. Release inputs exclude fixtures, local certificates/keys, provider evidence and diagnostic endpoints. The current local deployment-path bundle was restored to the preserved release after dry-run; a generic deploy command would not upload this proposal. A future approved upload must stage the exact candidate at that path, verify both hashes immediately, use the same reviewed hosting-directory locked Wrangler command with --no-bundle --no-autoconfig, and restore the local path afterward. Never rebuild/substitute an artifact during approved execution.

## One proposed consolidated staging execution approval

This is a proposal, not permission to run. Target only project gngnrmzeghjzqsmzuktl, Worker mfd-connect-staging, Cloudflare account fa8205077c4bc4d2bb38ee035e74a156. No paid upgrade or new resource.

1. Fresh read-only target/version/config/artifact checks; preserve the exact original session set, two UUIDs, Profile-only grants/consents, clients, fixtures and security digests. Reconfirm single-session OFF, timebox/inactivity Never, replay detection ON/reuse10 seconds without changing settings. If required evidence is missing or drift exists, stop before authentication. Hash-check the entire Safari manifest and live runner; create only a restricted approval baseline after approval.
2. Execute the new Safari H1–H3 method against the current deployed Worker: at most two newly initiated first-party Google PKCE flows for the existing approved identities, one attempt each. Permit the local-only owned-window smoke and explicit macOS Automation handoff. Intercept/exchange only those harness-owned callbacks in memory. At most30 runner requests; provider/browser traffic is outside this counter and explicitly acknowledged. Flow deadline5 minutes, replay wait12 seconds, expiry wait at most70 minutes. H1 verifies genuine JWTs/owner reads/cross-owner and direct-API denial; H2 rotates/replays only PRIMARY disposable session; H3 naturally expires/refreshes/logs out only SECONDARY disposable session with scope=local. No original session/token or client-wide grant touched. Stop on any failure without retry or cleanup.
3. Only after successful lifecycle verification, replace the Worker once with the exact proposed hash using unchanged configuration, same namespace781eaeca44c74543be214f485033adda/class/fixed object/migration history. No SQL, new binding/resource, runtime secret or Auth change. Stop on permission/billing prompts or ambiguous outcome.
4. Independently verify active version, downloaded module hash and unchanged configuration/binding. Use at most six non-authenticating HTTP checks: metadata, login headers, empty callback denial, hostile-origin POST, invalid-CSRF POST and missing-bearer MCP. Allow at most one follow-up login-header check for rollout propagation; persistent discrepancy stops the batch. Then perform at most12 explicit connected MFD tool calls: each account profile, four denied sections and profile afterward. Transport/provider retries are not an exact HTTP request ledger. Preserve permissions; do not force reconnect.
5. Read-only CPU/error metrics and final original-session/account/grant/fixture/security comparison. No hosted stress/fault injection. Record CPU sample/window/units honestly; insufficient representative traffic leaves headroom UNKNOWN. No automatic rollback, SQL recovery, session deletion or revocation beyond the two disposable-session tests.

Approval is required because the current instruction covered local preparation, while this proposes a new native-browser callback method and a new Worker artifact. The approval would cover the complete ordered batch without intermediate routine approval requests. Human participation is limited to native-window preparation/permission and the two Google selections.

## Remaining acceptance boundaries

H1–H3 concern first-party sessions, not native OAuth-client refresh/revocation. They do not prove ChatGPT token rotation/reuse or existing-consent reconnect when no supported Reconnect control is available. Those require a separately reviewed isolated client/session design that cannot revoke the working grants. Private-object cross-owner tests need approved object fixtures; unknown Google identity testing remains outside the two-user scope. Billing/log retention evidence and sustained hosted Free CPU headroom remain unresolved. Preserve existing known password-protection/development-advisory findings. No production access or production readiness claim follows from this batch.

**GO for consolidated staging approval of this conditional batch. NO-GO for production or declaring full security/lifecycle acceptance complete.**

## Approved staging batch — stopped before authentication, 2026-10-30

Fresh staging preflight PASS: exact project/version, independently downloaded deployed bundle0fa8494… and local candidate/config/18-file manifest hashes match; two users, all10 original sessions, Profile-only grants, fixtures and security digests unchanged. Operator freshly reconfirmed safe session policies/reuse10 seconds; selected settings remain operator evidence.

The approved Safari launcher executed once and stopped with **SAFARI_WINDOW** during primary window pairing, before local smoke/Google navigation. One runner request retrieved public JWKS; no callback exchange or disposable session was created. Pairing rejects absent/multiple-tab windows and unexpected window identifiers; the sanitized identifier alone does not establish which condition occurred. No browser URLs, cookies or personal credentials were captured. Do not claim provider incompatibility or a completed Safari smoke from this failure.

H1/H2/H3 **BLOCKED**; candidate Worker deployment **NOT ATTEMPTED**, because the approved order requires lifecycle success first. No automatic retry or recovery. Independent postcheck PASS: all10 original sessions retained, inventory befbb5ee8105a4d45b70e5c7734e03ad and security ec1f27ff9b3d5f2f35c01e8b99c85d51 unchanged. Existing connected-tool evidence remains valid; production acceptance remains NO-GO. Sanitized receipt: [execution result](artifacts/c1c-safari-execution-result.json).

Next engineering step: local-only diagnosis of the pairing return/one-tab condition with fixed reason categories, without reading an existing document or starting Google. Any subsequent live authentication attempt requires a newly reviewed retry scope; this one-attempt batch is stopped.

## Fresh approved Safari run — real hosted H1 PASS, H2 FAIL, 2026-10-30

Both operator-selected Google identities completed one harness-owned PKCE exchange each. Native window pairing/source smoke and callback transfer worked; test-owned windows closed as designed. H1 passed the runner's genuine ES256/JWKS signature/claims, original-owner binding, distinct/new session, owner REST/cross-owner denial, Profile-only connections RPC and first-party-token MCP rejection checks. This is real hosted evidence, not the earlier synthetic model. No personal token/code/cookie was persisted.

H2 performed two successful PRIMARY disposable refreshes, verified refreshed signatures/identity/claims, confirmed current protected RPC access, waited12 seconds outside the confirmed10-second reuse interval, and observed rejection of the old non-parent refresh token. The next assertion failed: **REPLAY_SESSION_RPC_DENIED**. The expected immediate protected-RPC denial was not established. The fixed assertion combines denied status and still-unexpired access token; the sanitized runner did not preserve the exact failing response status. Do not invent an HTTP200 trace.

Read-only source review finds dispatcher checks only ownership/existence of auth.sessions, not refresh-family revocation. Postcheck retains both new session rows; their refresh-token rows aggregate three revoked and one unrevoked (consistent with revoked primary family and untouched secondary, but this aggregate alone does not prove ownership). This makes retained-session existence a plausible cause of the missing immediate replay containment. [Supabase sessions documentation](https://supabase.com/docs/guides/auth/sessions) distinguishes refresh reuse termination from JWT lifetime; application-specific immediate denial needs an appropriate live-session contract. No SQL/ACL/Auth repair was applied. Investigate and regression-test locally before proposing an exact correction; do not weaken the acceptance gate to hide it.

The batch stopped automatically at18 runner requests/two flows. H3 natural expiry/refresh/local logout NOT TESTED; no subsequent provider retry, cleanup or deployment. Both new Auth session rows remain for evidence; no tokens retained for further use. Independent postchecks PASS: all10 original session hashes preserved (12 total rows), users2, original Profile-only grants/consents/fixtures inventory unchanged befbb5ee8105a4d45b70e5c7734e03ad; security unchanged ec1f27ff9b3d5f2f35c01e8b99c85d51; writesfalse. Worker candidate deployment NOT ATTEMPTED because the approved order requires lifecycle success first.

[Sanitized fresh-run result](artifacts/c1c-safari-fresh-run-result.json). Production acceptance NO-GO. No further operator browser action is needed now.
