# C.1C — Final staging acceptance (central report)

Status as of 2026-11-02 13:10 Europe/Berlin. **This is the single current status document.** It supersedes conflicting summaries in the other PHASE-C1C reports, which remain as dated provenance. Staging only: Supabase gngnrmzeghjzqsmzuktl, Worker mfd-connect-staging, account fa8205077c4bc4d2bb38ee035e74a156. No production access.

**Release decision: NO-GO for production. Staging release candidate = current Worker plus pending approved CPU candidate; hosted completion pending one consolidated approval (section 4).**

## 1. Fresh verification this session (2026-11-02)

| Check | Result | Evidence |
| --- | --- | --- |
| Pinned Node binary | PASS | v22.13.1 at the reviewed npx path |
| Full network-blocked local suite | PASS 66/66 | 65 prior files + new comparator test; .sites-runtime/c1c-final/tests.log |
| H3 completion manifest + all 15 pinned files | PASS | Manifest 9b46528a…; every file hash matches, including installed supabase-js |
| Independent runner review | PASS, no defects | See section 3 |
| CPU candidate / config / local deploy-path bundle | PASS | 05b1811e… / e0f45c65… / 0fa8494b… (preserved release, not the candidate) |
| Active Worker version (Wrangler, read-only) | PASS | 100% dcfcac5d-88d2-4432-a262-e288f05f31e4, created 2026-10-29T18:40:25Z |
| Wrangler auth | PASS | OAuth login for the correct account; no token printed or stored by this session |
| Public Auth settings | PASS | disable_signup=true, Google on, anonymous off, phone off |
| JWKS | PASS | One EC P-256 ES256 public key; no private members |
| DCR | PASS (disabled) | Authorization-server metadata has no registration_endpoint |
| Worker six reviewed non-authenticating probes (pre-deploy) | PASS 6/6 | login 200/headers, callback 400 CB_TRANSACTION_REQUIRED, hostile Origin 403, invalid CSRF 400, missing bearer 401, resource discovery 200 |
| Official Cloudflare Free CPU limit | 10 ms per HTTP request | Docs fetched 2026-11-02; only infrequent overruns tolerated; 100,000 requests/day |
| Database-level preflight (users, sessions, grants, ACLs, body) | NOT YET RUN | No Supabase connector in this session; see section 4 |
| Existing ChatGPT A/B connections | Last verified 2026-11-02 (prior session) | Recheck after hosted actions is part of section 4 |

New finding (residual, provider-side): Supabase authorization-server metadata advertises code_challenge_methods `S256` and `plain`. Observed flows use S256, and the Worker/harness require S256. `plain` is a provider default the application can't remove; record it as a residual risk, not a regression.

Reproducibility gap closed: the earlier inventory digest befbb5… and masked security digest 1b8f36… were computed ad hoc through a connector, and their formulas were never saved. They can't be recomputed byte-for-byte. New persisted read-only query [c1c-final-preflight.readonly.sql](../database/staging/c1c-final-preflight.readonly.sql) and comparator [c1c-final-preflight-compare.cjs](../scripts/c1c-final-preflight-compare.cjs) check each component explicitly: exact user set, identities 4, sole public native client, no dynamic client, local client, 2 active consents, 2 Profile-only grants, workspaces revision 1, proposals 0, writes false, dispatcher body 2e64… plus owner/definer/search_path/exact ACL, wrapper body/ACL including service_role, RLS, private empty storage, session-ID-hash set against the stored 13 hashes, the 2 unrecorded 30 Oct batch rows, live refresh for ChatGPT OAuth sessions, and exactly the two expected revoked H2 families. Synthetic regression covers each failure.

## 2. Acceptance matrix (current)

| Requirement | Status | Evidence / boundary |
| --- | --- | --- |
| Real Google PKCE for both original identities | PASS hosted (30 Oct) | Stepwise Safari harness |
| Genuine JWT signature/claims/identity, owner reads, cross-owner REST denial | PASS hosted (30 Oct) | H1 |
| Profile-only consent; first-party token rejected by MCP | PASS hosted (30 Oct) | H1 |
| Refresh rotation; old non-parent refresh rejected | PASS hosted (30 Oct) | H2 |
| Immediate private-RPC denial after refresh replay | PASS hosted (30 Oct) | H2 after installed SQL fix 3255554… / body 2e64… |
| Natural access-token expiry rejection | PASS hosted (30 Oct) | 403 bad_jwt/expired; independent Auth + edge logs, evidence b76363cb… |
| Refresh → scope=local logout → access/refresh denial | NOT TESTED; ready | Secondary-only completion runner; approval item A |
| Single uninterrupted expiry→refresh→logout chain | NOT TESTED | Composite evidence only; see section 5 |
| ChatGPT A/B profile retrieval; unconsented sections challenged | PASS hosted | A/rev1, B/rev1; 8 section challenges |
| Existing connections preserved | PASS as of 2 Nov recheck | Re-verify after section 4 |
| CPU-optimized Worker | LOCAL VERIFIED, NOT DEPLOYED | Approval item B |
| Hosted Free-plan CPU headroom | NOT CLEARED | Last p99 16.912 ms vs 10 ms limit |
| Native OAuth-client refresh/reuse/revocation | BLOCKED | Needs separately approved disposable OAuth client; first-party results do not prove it |
| Existing-consent reconnect via ChatGPT | NOT TESTED | No supported Reconnect control; local binding regression passes |
| OAuth-token direct REST/storage negatives | BLOCKED | No supported independent OAuth-token harness |
| Private-storage object isolation | BLOCKED | Buckets private and empty; needs approved object fixtures |
| Unknown third identity rejection | NOT TESTED (settings only) | Signup disabled; no new account permitted |
| Billing, quota, platform log retention, full Auth config | BLOCKED (operator evidence only) | Dashboard evidence needed |
| Known residuals | OPEN | leaked-password protection WARN; 3 private tables RLS-without-policy INFO (intentional); historical HS256 trust; fixed-window/global limiter availability risk; dev-only moderate advisory; AS metadata advertises `plain` PKCE |

## 3. Independent review of the H3 completion runner

Reviewed scripts/c1c-h3-completion.cjs and its helpers line by line; the checksum was not used as proof.

- Scope: one SECONDARY PKCE flow; zero exchange retries (the SDK fetch wrapper refuses a second exchange); verifier only in memory; callback limited to the exact Worker callback with a lone `code` parameter.
- Request accounting: JWKS, settings, PKCE exchange, own read, cross read, refresh, pre-logout RPC, logout, post-logout RPC, post-logout refresh = 10 of 12 allowed.
- Disposability: the issued session_id hash must be absent from the fresh preflight set, so an existing session can't be used or logged out. Logout is scope=local with that session's own refreshed token only.
- Denial oracles are differential. Pre-logout RPC must return 200 with exactly one Profile-only grant; post-logout must return 401/403 while the JWT is still unexpired. The dispatcher raises SQLSTATE 42501 ("Active session required"), which PostgREST returns as 403. The same oracle passed in hosted H2, so it doesn't repeat the expiry 401-only mistake. Refresh-after-logout must be 400/401.
- Fail-closed: stops on settings drift, wrong owner or signature on the refreshed token, or logout failure. Unknown errors map to H3_COMPLETION_STOP, and no upstream body is logged.
- Launch gates: Node v22.13.1, no NODE_OPTIONS/extra CA/TLS override, core dumps off, 0600 baseline owned by the user and less than 5 minutes old, every manifest hash, config hash, and a one-attempt lock.
- Known limitation: if it stops after the exchange and before logout, one disposable secondary session row remains and is not cleaned up. Its tokens are discarded at exit.

## 4. One consolidated approval — prepared, not executed

Prerequisite: attach the **Supabase connector** for project gngnrmzeghjzqsmzuktl to this Claude session. It's needed only for read-only preflight/postcheck SQL. Without it, item A can't start because its baseline requires fresh session-ID hashes. Optional: the **Cloudflare connector** for exact downloaded-module hash and CPU percentiles. Without it, those come from Wrangler's version output and a dashboard reading.

Order, stop-on-failure, no retries:

1. Read-only preflight with c1c-final-preflight.readonly.sql, then the comparator. Every check must PASS, or stop before any authentication. The baseline is written only with `--approved`, within 4 minutes of the preflight.
2. **A. H3 completion.** Launch scripts/c1c-h3-completion.command once. Human steps: open one new private one-tab Safari window, then click Start, then choose the SECONDARY Google account. Max 1 session, 12 runner requests, zero retries, no expiry wait.
3. Read-only postcheck with the same query and `--previous=<preflight>`. Expect an identical session set after a successful logout.
4. **B. Worker.** Run scripts/c1c-deploy-cpu-candidate.sh --execute-approved once. It is hash-gated on 05b1811e…, e0f45c65… and active dcfcac5d…, uses unchanged config, namespace, class and migration tag, and restores the local path. Stop on a billing/permission prompt or ambiguous result.
5. Verify the new active version (Wrangler), then six post-deploy probes (scripts/c1c-final-probes.cjs post-deploy), with at most one propagation follow-up.
6. Human: in ChatGPT, ask each existing MFD connection for its profile once and confirm "MFD STAGING A rev 1" and "MFD STAGING B rev 1". No reconnect and no permission change.
7. CPU: read Worker CPU percentiles for the new version after ≥24 h of normal traffic. Too few invocations means headroom stays UNKNOWN. No synthetic load.

Excluded: primary login, new users or OAuth clients, grant/consent revocation, Auth/Google/ACL/RLS/SQL changes, signup/DCR/writes, cleanup or rollback, production, paid upgrades, commits.

Recovery if B regresses (separate decision, not automatic): redeploy the preserved bundle 0fa8494b… with the same config via `wrangler rollback` to dcfcac5d…, after explicit approval.

**Approval received 2026-11-02:** the user approved items A and B in this order, exactly as scoped above. Execution waits for the Supabase connector. No hosted step has run under this approval yet.

**Progress 2026-11-02 12:45 UTC:** Supabase connector attached (project confirmed `MFD OAuth Phase 2 Testing`, eu-central-1, ACTIVE_HEALTHY). Two local defects found and fixed before any gated step, both read-only/local, no hosted change: (1) the preflight SQL compared `auth.refresh_tokens.session_id` (uuid) to `sessions.id::text` and `refresh_tokens.user_id` (varchar) to `sessions.user_id` (uuid), so the query errored; predicates now cast correctly, the session-hash formula is unchanged; (2) the comparator's WRITES_FALSE check depended on jsonb key order; it now compares fields, with a synthetic regression. Ungated dry preflight at 12:44:57Z: PASS 21/21 (15 sessions, 2 live connection sessions, 2 revoked H2 families, 2 unrecorded stepwise rows, policies_md5 ba1b8c59…). No baseline written; item A not started.

**Execution 2026-11-02 — batch STOPPED at item A; item B NOT run.**
- Step 1: gated preflight 12:49:06Z PASS 21/21; approved baseline written (0600).
- Step 2 (A): runner launched once 12:49:34Z. Launch gates passed; JWKS + settings PASS (2/12 requests). It then stopped with `STOP SAFARI_TARGET` before any code exchange. The authorize URL had already passed `flow.start()` validation, so the owned tab reached a page outside the allowlist (Supabase auth, `*.google.com`/`gstatic.com`/`googleusercontent.com`, Worker callback) during Google selection. The URL is deliberately not logged. One-attempt lock is consumed; no retry, no cleanup. Record: .sites-runtime/c1c-acceptance/h3-completion-stop-record.json.
- Step 3: postcheck 12:51:58Z vs preflight PASS. Identical 15-session set, no session added, consents/policies unchanged. Connection sessions still live.
- Steps 4–7: not executed (stop-on-failure). Worker remains dcfcac5d….
- Item A status: NOT TESTED (harness stop, not a security failure). A new attempt needs a fresh approval, a new lock/baseline, and, if the off-allowlist surface is legitimate, a reviewed allowlist change, which would also change the H3 manifest.

## 5. Gates that need a separate decision

- **Strict same-session expiry→refresh→logout chain.** Each security property is separately evidenced: expired access rejected (30 Oct, real) and refresh/logout/denial (item A). The chain's extra property is that refresh still succeeds after the access token expired. That's availability, not access control. Recommendation: disposition as non-mandatory. If it's required, the smallest valid test is one SECONDARY session held for ~62 minutes with `caffeinate -i` (avoiding the sleep deviation), then refresh, logout and denial: 1 login, ≤12 requests.
- **Native OAuth-client lifecycle** (refresh rotation, reuse, consent revocation, reconnect). The smallest valid test needs one separately approved disposable public OAuth client, with a redirect to a harness-owned callback and a Profile-only consent by SECONDARY, exercised and then revoked. That client's revocation can't touch the ChatGPT client fcad3c45…. It requires approval of a new client, so it's not included.
- **Storage object isolation.** Needs one approved synthetic object per user in the private bucket, then owner/cross-owner reads. It's a write, so it needs separate approval.
- **Operations.** Billing/plan, log retention and redaction, alerting, and backups (PITR is unavailable on Free) need dashboard evidence or decisions.

## 6. Production

Not prepared for execution. Staging gates in sections 2 and 5 aren't closed, and staging profile reads alone don't establish production readiness. Minimum before a production plan is approved: item A PASS; CPU p99 under 10 ms on the deployed candidate, or a decision to accept a paid plan; native OAuth-client lifecycle tested or explicitly risk-accepted; storage isolation tested before any storage feature is enabled; a backup/restore strategy; leaked-password protection decided; removal of historical HS256 trust; monitoring and alerting on 401/403/5xx/exceededCpu; and an incident/rollback runbook with the same hash-pinned deploy pattern.
