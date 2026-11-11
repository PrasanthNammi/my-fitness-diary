> Current disposition: manual execution is stopped and no further callback handoff is requested. Existing-connection automated E2E results and remaining gates are in [the consolidated report](PHASE-C1C-SECURITY-LIFECYCLE-REPORT.md). This file retains the reviewed manual proposal; it is not an instruction to launch it.

# C.1C — Manual Safari PKCE handoff

2026-10-30, Europe/Berlin. **Implementation and local verification complete. No live manual login started. Production acceptance remains NO-GO.** This is a test harness, not a Worker release. It does not change hosted settings, callbacks, clients, permissions, users or existing grants.

## What changed

The operator uses ordinary Safari, with no WebDriver, proxy, remote control, injected browser scripts, security bypasses or existing-session extraction. A new Supabase SDK instance generates an S256 authorization URL and keeps its verifier in a process-local Map. The same instance exchanges only the newly initiated code once. Automatic refresh and URL-session detection are disabled. Returned provider tokens and personal profile fields are not forwarded to the lifecycle runner.

The callback is still exactly:

`https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback`

There is no loopback callback, new redirect, local web server or OAuth client. The [supported PKCE exchange](https://supabase.com/docs/guides/auth/sessions/pkce-flow) requires both the code and its initiating verifier. This harness preserves that verifier in the SDK process; it does not move it into Safari or substitute a verifier from an existing login.

The manual path is deliberately separate from the Playwright adapter. It **does not fabricate browser-context, main-frame or method evidence**. Private context/main-window/GET provenance and the expected callback page are operator attestations. The exact typed callback URL is machine-validated; signature, issuer, audience, role, expected original owner and exclusion of all original session IDs are independently checked by the unchanged lifecycle core after exchange. A rejected exchange may still leave newly created upstream session state; there is no automatic cleanup.

## Why the callback initially displays an error

In the fresh private window, the operator must **not** visit MFD `/login` or initiate a Worker login transaction. The generated URL starts the SDK-owned flow directly. Therefore the existing Worker callback should return HTTP400 with `CB_TRANSACTION_REQUIRED`: it has no Worker flow/browser cookies and cannot exchange that code. Local tests run the actual compiled Auth handler and verify zero transaction consumes, zero upstream exchanges and no access cookie installation in this case.

This expected containment response is not a successful MFD browser login. It leaves the harness-owned code available for its one-time SDK exchange. Any different diagnostic, automatic signed-in page, provider warning or wrong account means STOP, not Retry. Real Safari/provider behavior is not yet verified.

Unlike interception before network in Playwright, the code now reaches the existing Worker URL. It is PKCE-bound and short-lived, but platform callback-query retention is still an unresolved operational issue. No claim of zero infrastructure logging is made.

## Operator steps for a future approved batch

1. Fresh independent staging/security/session-policy/artifact/runtime preflight must pass. Retain the two existing ChatGPT connections. The executor privately loads the existing restricted two-UUID mapping; no account identifier is entered in chat.
2. The reviewed launcher opens a **local Terminal**. Its inputs must not be routed through chat, a recorded tool PTY, shell arguments, screenshots, screen sharing, `tee`, shell tracing or a transcript. It refuses non-TTY input, unsafe runtime flags, the wrong Node version, nonzero core-dump allowance, stale/incompatible baselines or changed artifacts.
3. Prepare a genuinely fresh private Safari context without an existing MFD session. Do not use an existing private session or another tab of it. Close only test-owned private windows between identities; do not disturb unrelated browsing. If isolation cannot be established, stop.
4. Read the displayed isolation statement and type y locally to confirm. Copy only the **public initiation URL** from Terminal into that private window. This URL has a public S256 challenge, not its verifier or a callback code. Select the approved PRIMARY Google identity once. No Retry, reload or alternative account.
5. Verify the main window's address has the exact HTTPS Worker callback and only `?code=...`, and the page displays `CB_TRANSACTION_REQUIRED`. Read and affirm the displayed local attestation with y, then **manually type the full fresh callback URL** into the hidden Terminal prompt. Do not copy it into the clipboard, paste it, save it, send it to chat or reuse a stopped callback. The prompt rejects bracketed paste, control sequences, multiline input, excess length and expiry. Unbracketed paste cannot be universally detected; the no-clipboard instruction is still necessary.
6. The runner validates/exchanges once and executes H1 for PRIMARY. The whole initiated flow has a five-minute deadline, including both input prompts. A wrong identity/callback, rejection, cancellation or timeout stops the entire batch.
7. Close only that test-owned private window. Repeat with a new isolated private context for SECONDARY when prompted. No password reset or new user is needed.
8. After both H1 checks pass, automation performs PRIMARY R0→R1→R2 rotation, waits12seconds, replays only isolated R0 once, and checks session-level denial. SECONDARY waits for natural token expiry plus120seconds, refreshes once, uses `scope=local` logout once and checks denial. Maximum expiry wait70minutes; leave the local process running. No existing ChatGPT grant/session is revoked, refreshed or reused.
9. Independent final read-only checks must preserve every original session hash, users/identities, client/callbacks, Profile-only grants/consents, fixtures, security digests and both false writes. Report actual hosted results separately from these local tests. On failure preserve sanitized progress and stop; no automatic retry, deletion, recovery or global/client-wide logout.

A normal MFD `/login` attempt alone cannot substitute for this procedure: its tokens belong to the Worker session and cannot be extracted as a shortcut.

## Limits and required revised approval

**The original Playwright aggregate40-request cap is not enforceable in an uninstrumented Safari browser.** Do not represent this as an identical scope or relabel the model count as an observed live count.

The proposed manual scope is:

- At most two manual Google flows/new first-party sessions, one per original identity; no automatic retry.
- Hard maximum30 requests from the Node lifecycle runner, no redirects followed and15second request timeouts. The current successful local model makes19 runner requests,6 modeled browser application requests and2 modeled Worker subrequests. These27 synthetic calls are not a live upper bound.
- Safari's Auth navigations, automatic redirects, Google UI/assets and potential retries are not machine-counted. Operator-visible retries/reloads are forbidden; unexpected navigation/warnings mean stop. A genuine browser-inclusive40 cap cannot be certified by this method.
- Five-minute initiated-flow deadline,12second replay wait, natural-expiry wait≤70minutes.
- Same staging-only endpoints, original users, existing callback/client, unchanged configuration/security/grants/fixtures and false writes. No production, deployment, payment, destructive cleanup or Git publication.

The previous cap, programmatic browser evidence and pre-network callback interception cannot silently carry over. A **single explicit manual-scope approval accepting these differences** is required before creating a fresh protected `approved-manual-baseline.json`. If the original browser-inclusive cap or automated browser provenance must remain mandatory, this manual method is BLOCKED; do not weaken those requirements to run it.

## Local verification

| Check | Result / evidence |
| --- | --- |
| Complete network-blocked suite | PASS56/56 files, including three new manual/TTY/lifecycle suites |
| Hidden local Terminal | PASS five actual PTY cases: success, bracketed-paste rejection, fragmented-paste rejection, SIGTERM and timeout; synthetic input absent from output; ECHO/canonical mode restored |
| SDK PKCE and rejection guards | PASS same-instance S256 verifier, strict callback/domain/path/query, one-use exchange, expiry, wrong account/claims, transport/provider failure, disposal and privacy |
| Integrated local chain | PASS actual SDK + ephemeral ES256 + real PGlite schema/RLS/dispatcher + compiled cookie-free callback gate + modeled refresh/replay/expiry/logout |
| Preserved original synthetic state | PASS both original sessions, Profile-only grants, fixture and security snapshots unchanged |
| Types and lint | PASS frontend and hosting TypeScript, hosting lint |
| Live mode guard | PASS plan-only default under blocked network; execute mode refuses absent private TTY. No active manual baseline or live run created |
| Live Safari/Google H1–H3 | NOT TESTED; no Safari launched or hosted MFD query/authentication during this implementation |
| Worker/build/native workerd posture | Prior unchanged-runtime evidence retained. No Worker source/config changed; no fresh workerd/performance result claimed for this terminal-only adapter |

Native PTY testing found a local signal-listener registration race after the visible prompt; handlers now register before displaying it. Signal/exit cleanup restores terminal mode. Fragmented forbidden paste is drained before echo restoration to keep later chunks out of the shell. Initial model accounting conflated client calls with modeled browser/Worker subrequests; the final receipt separates19/6/2. No runtime authorization check was relaxed to pass a test. Memory references are cleared where practical, but JavaScript does not guarantee secure erasure of strings or OS memory.

Ignored sanitized evidence: `.sites-runtime/c1c-manual-review/tests.log` and `e2e.json`. No personal credentials, callback or session token is in either file. Existing dependency audit findings remain the previously recorded root0/hosting1 development-only moderate with0 high/critical; no new dependency, lockfile update or fresh audit claim.

## Reviewed artifacts and launch gate

Complete [manual manifest](artifacts/c1c-manual-manifest.json) SHA256:

`28d2f5accf7059d9d9bf05738e4e5df21fa5edda746899ee55d832a2c0090699`

The manifest pins the manual adapter, hidden-input helper, runner/launcher, tests, local E2E/PTY fixtures, plan, unchanged SDK/lifecycle helpers, package lock and installed SDK metadata. Metadata hashes are not an independent audit of all installed dependency bytes. No publishable key or restricted mapping is distributed in these artifacts.

Existing Worker SHA256 remains `0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e`; protected runtime configuration remains `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5`. There is no new Worker/SQL deployment artifact.

Default invocation is safe plan-only:

```sh
node scripts/c1c-google-h1-h3-manual.cjs
```

Only after the revised scope is approved and fresh read-only preflight supplies the protected manual baseline, the proposed executor launches:

```sh
open -a Terminal ./scripts/c1c-manual-acceptance.command
```

Do not launch it now. The source launcher fixes cwd, disables core dumps, uses existing Node22.13.1 and invokes the exact guarded live flag. It performs no install, login retry, browser automation, credential export or hosted cleanup. A one-run exclusive lock prevents a second batch with the same manifest. Agent-readable progress contains only fixed stage/check/failure labels and counts in a mode0600 file; public initiation URLs and secret input are excluded. Future postchecks use independent read-only tools, not a secret-bearing transcript.

**Decision:** GO for review of the local manual implementation and revised bounded test scope. NO-GO for claiming genuine H1–H3 or production acceptance. No live operation was performed by this preparation.


Guided UI correction after operator confusion: the full safety statements remain displayed, but confirmation now needs only y/Y rather than manually retyping a long phrase. Blank/other input is rejected. Callback entry/privacy, manual provenance, exact-URL/PKCE/identity guards, budgets and no-retry scope are unchanged. Earlier failed live manifest remains historical evidence; existing stopped baseline and lock were not removed.
