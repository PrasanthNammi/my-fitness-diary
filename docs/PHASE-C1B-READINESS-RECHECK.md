# Phase C.1B — Authenticated readiness recheck

> Consolidated execution authority and ordering: [PHASE-C1B-FINAL-EXECUTION-CHECKLIST.md](PHASE-C1B-FINAL-EXECUTION-CHECKLIST.md). This report is retained as supporting/historical evidence; use the consolidated checklist for future execution review.

Date: 2026-10-29 (Europe/Berlin). Preparation only. No hosted resource/configuration/client/user/database change, production access, deployment, commit or push.

**Current decision: NO-GO for first deployment.** The Cloudflare login blocker is resolved. ChatGPT callback/public-client settings are now user-verified. Complete Supabase Auth management evidence and explicit mutation approvals remain required. No callback or client ID has been invented. This document supplements the deployment plan; it does not authorize its future operations.

## Verified read-only findings

| Check | Result | Evidence |
| --- | --- | --- |
| CLI authentication | PASS | Wrangler reports loggedIn=true, OAuth Token, one account. No token value was read/printed. |
| Connector identity | PASS | Cloudflare connector identifies the same signed-in email as Wrangler. |
| Target account | PASS | fa8205077c4bc4d2bb38ee035e74a156; accepted membership; Super Administrator — All Privileges. |
| CLI permission scopes | PASS for declared authority | account:read, workers:write, workers_scripts:write and workers_routes:write present. Membership permits administration; no write probe used. |
| Existing workers.dev | PASS | GET workers/subdomain returns shanustylish777. |
| Worker inventory/name collision | PASS | GET workers/scripts returns empty. mfd-connect-staging is unused in this account at inspection; not reserved. |
| Durable Object inventory | PASS | GET durable_objects/namespaces returns zero namespaces, total_count=0. |
| Account usage-model setting | PASS, limited meaning | workers/account-settings returns default_usage_model=standard. This is not proof of a paid or Free subscription. |
| Workers Free subscription | PASS as prior user dashboard evidence; API NOT VERIFIED | Subscription GET rejects OAuth with HTTP403: no OAuth scope covers this billing endpoint. No Billing API credential requested. Retain user-confirmed Free/no payment method evidence; reconfirm in final approval. |
| SQLite Free support | PASS documented | Cloudflare documents SQLite-backed DO on Free, with failure on quota exhaustion. No paid upgrade required by selected resource types. Actual first provisioning remains untested. |
| Staging Supabase | PASS | Exact ref gngnrmzeghjzqsmzuktl, ACTIVE_HEALTHY, eu-central-1, release17.11.0.003. |
| Database writes/resource | PASS | writes=false; active resource still private Site /mcp. No transition executed. |
| Existing client/account inventory | PASS | auth.oauth_clients=0, mfd_mcp.clients=0, auth.users=0. No records created. |
| Hook implementation/ACL | PASS | postgres owner, normalized hash9fde3c29dc02c1313687ce426b5d1237, EXECUTE owner/auth-admin only. This does not prove Auth activation. |
| Existing application write switch | PASS | Site runtime revision1, MFD_ENV=staging, exact staging URL, MFD_MCP_WRITES=false. |
| Auth redirects/Site URL | PASS — user dashboard evidence | Site URL http://localhost:3000; Redirect URLs none. Later changes require approval. |
| Active signing/key rotation | PASS — dashboard evidence + public JWKS consistency | User verified current ECC P-256/ES256, previous HS256, no standby/pending rotation. Fresh staging JWKS HTTP200 publishes one EC/P-256/ES256 sig key; details below. No token issued; exact current dashboard key ID was not supplied. |
| Hook binding/activation | NOT CONFIGURED — user dashboard evidence | Auth Hooks none configured; SQL hook exists but is not active. |
| Authorization Path / DCR | NOT VERIFIED while OAuth disabled | OAuth Server disabled confirmed; exact stored path/toggle unknown. Never enable solely to inspect. |
| ChatGPT exact callback/client method | PASS — user-observed interface | User-Defined OAuth Client; manual client ID; secret optional; token method none; S256/OIDC options. Exact callback https://chatgpt.com/connector/oauth/Xm83tVWz4VJh. Discovery fails because the endpoint is not deployed. No integration saved/registered by this agent. |

Only GET Cloudflare APIs and read-only staging SQL were used. The billing GET failure did not modify anything. No permissions were escalated. API membership authority and declared CLI scopes do not guarantee a future deployment will succeed; stop on a permission, quota, upgrade or billing prompt rather than changing plans.

## Registration and bootstrap decision

[OpenAI authentication documentation](https://developers.openai.com/plugins/build/auth) requires protected-resource discovery, authorization-server metadata, S256 and exact resource/issuer binding. It supports predefined OAuth clients as an alternative to CIMD/DCR. The callback must be copied from the actual management page; stable and callback-ID-specific forms are conditional on issuer identification. Do not select one from the documentation examples.

[Supabase registration documentation](https://supabase.com/docs/guides/auth/oauth-server/getting-started) accepts exact registered redirect URIs and assigns the client ID. Public clients use none; confidential clients support client_secret_basic/client_secret_post. The selected ChatGPT interface must establish a mutually supported method. Client credentials identify the application, not the individual MFD user. User login/section consent/live session/RLS remain mandatory.

### Selected bootstrap: preregistration, then full Worker

The user inspected the actual ChatGPT interface and supplied the exact callback:

`https://chatgpt.com/connector/oauth/Xm83tVWz4VJh`

Confirmed interface: User-Defined OAuth Client, manually entered client ID, optional secret, token authentication **none**, manual endpoint configuration, S256 and OIDC options. Treat this as user-observed account evidence, not a completed OAuth flow. Keep the same integration draft; if ChatGPT regenerates the callback, stop and review the newly displayed URI before any registration.

**A metadata-only bootstrap is not necessary for the observed callback-discovery dependency.** The real callback is already known, so a public native client can be preregistered before the Worker exists, once separately approved. Supabase's documented registration inputs are client metadata and exact redirect URI, not a running MCP handler. Its guide enables OAuth Server before registration; do not assume the dashboard permits preregistration while the server is disabled. If it requires enablement, approve/configure that explicitly in the sequence below. No enablement or registration is authorized now.

Selected native registration proposal:

| Field | Exact proposed value |
| --- | --- |
| Name | MFD Staging — ChatGPT |
| Type | Public |
| Token endpoint authentication | none |
| Redirect URI | https://chatgpt.com/connector/oauth/Xm83tVWz4VJh |
| Client ID | Assigned by Supabase at approved registration; currently absent |
| Client secret | None for this public client; leave ChatGPT secret blank |
| Flow | Authorization code with S256 PKCE; client validates state |
| Dynamic registration / CIMD | Disabled / not implemented; neither needed for this selected predefined-client path |

Do not substitute an OpenAI metadata URL for Supabase's assigned client ID. OIDC options are not proof of configuration: verify asymmetric signing and enabled advertised identity scopes before selecting OIDC; never accept ID tokens as MCP bearer tokens.

### Exact future sequence — approval required before each mutation scope

1. **Read-only gate:** capture staging Auth Site URL/redirect list, OAuth Server/path/DCR status, active JWT signing/rotation and Custom Access Token hook enabled/bound function. Verify hook source/ACL, false switches, exact old audience/default, zero native/local clients/grants/users and recovery evidence. Review before-values and project-wide URL effects. Any drift stops execution.
2. **Approve the coordinated setup window and emergency stop.** There is no cross-service transaction. Supabase may need OAuth enablement before native registration; this temporarily exposes issuer metadata before the Worker exists. With no users/consents/client allowlist it does not authorize diary access, but setup must remain bounded and no ChatGPT authorization flow should start yet. If that temporary state is unacceptable, stop and seek a provider-supported preregistration path; metadata-only Worker deployment does not itself solve disabled issuer discovery.
3. **Separately approved audience SQL:** execute the unchanged reviewed proposal (SHA1050f9e198c7c958f486bfa48a8cef49bc5d33c4f669e0fe626ffad62c573590) while local clients/grants/proposals remain empty. Verify exact new row/default and writes=false. Native registration could technically precede this, but selected order performs the guarded transition first. No token issuance/testing yet.
4. **Separately approved Auth setup:** configure new Site URL `https://mfd-connect-staging.shanustylish777.workers.dev`, first-party redirect exact origin+`/`, Authorization Path `/oauth/mcp/consent`, reviewed hook binding and signing. Keep DCR disabled. Enable OAuth only under explicit approval if registration requires it. Do not rotate keys or replace an existing hook without separately reviewed scope. Issuer metadata may now be reachable while UI is not; no users/flow until deployment checks pass.
5. **Separately approved native registration:** create exactly one public staging client, method none, sole exact callback above. Capture assigned non-secret client ID. No secret is generated/needed for the selected public type. Verify stored registration by read-only metadata; stop if the provider cannot supply these exact properties.
6. **Local release preparation:** populate the already-reviewed first-deployment config with the actual assigned ID, its exact callback mapping and existing staging publishable key. Keep account ID pinned, previews disabled, writes=false. Build/inspect/hash the exact artifact/config; do not weaken startup checks. Repeat relevant validation after real config preparation. Existing placeholders remain until registration is approved.
7. **Separately approved first deployment:** deploy the full independent Worker and SQLite binding/migration. Verify HTTPS, discovery exact audience/issuer, private binding/fail-closed behavior, missing/invalid bearer denial, HTML/cookies/CSRF, CPU/quotas/logging. No users or diary testing yet. If deployment fails, stop/disable access; do not loosen checks or change audience back automatically.
8. **Separately approved local client allowlist:** insert only the assigned native ID into mfd_mcp.clients through an explicitly reviewed transaction. This follows the empty-inventory audience transition. Verify no section grants/proposals exist and false writes remain. Runtime and SQL allowlists must agree before tests.
9. **Separately approved ChatGPT setup/test:** enter MCP URL `https://mfd-connect-staging.shanustylish777.workers.dev/mcp`, OAuth/User-Defined client, actual assigned ID, blank secret, token method none and S256. Prefer verified issuer discovery. Manual endpoints, if genuinely required by this interface, are authorization `https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/oauth/authorize` and token `https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/oauth/token`; issuer remains exact staging `/auth/v1`. Manual settings must not bypass issuer/resource/state/PKCE validation or fabricate metadata. Recheck the displayed callback is unchanged before saving/connecting.
10. **Separate synthetic-account acceptance:** only now create the approved staging Alice/Bob accounts and exercise actual OAuth, refresh/reuse/revocation, section consent, cross-account/direct API isolation and signed audience checks. Saving/connecting ChatGPT is also a hosted/client-side mutation, not authorized preparation. Every user signs into their own MFD account; the public OAuth client ID does not select the diary owner. Keep both writes false throughout.

The current discovery error is expected for an undeployed endpoint. It is not evidence that the selected predefined registration is unsupported. This sequence resolves the known callback/client bootstrap cycle without anonymous tools, dummy clients, metadata proxies or an extra bootstrap artifact. End-to-end compatibility remains an acceptance requirement after separately approved execution.

## Proposed first deployment configuration

Local proposal: hosting/independent/colocated-first-deployment.proposed.jsonc. This copies the reviewed configuration, pins verified account_id=fa8205077c4bc4d2bb38ee035e74a156 and disables preview_urls. It retains the placeholder publishable key and empty real client/callback inventory deliberately: **not a deployable release**. No running Worker/security code changed.

Resource names: Worker mfd-connect-staging; class AbuseCoordinator; private binding MFD_ABUSE; SQLite migration tag mfd-c1b-v1; fixed instance name mfd-staging-shared-v1. Proposed origin https://mfd-connect-staging.shanustylish777.workers.dev; sole resource origin+/mcp; issuer https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1. Routes and variables are unchanged from the deployment plan. No external route/custom domain/Sites capability, service credential or Supabase secret key.

Full release expected behavior: public bounded discovery/login bootstrap; verified bearer for all MCP methods; browser session cannot authenticate MCP; live user/client/consent RPC isolation; both writes false; shared SQLite quotas before upstream calls; outage denies access. Preview URLs disabled, exact canonical-origin guard rejects other hosts. This is the full release, not the unimplemented metadata-only candidate.

[Cloudflare DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) documents Free SQLite availability and quotas. The selected design needs no inherently paid resource. Retain the deployment plan's Free limits and conservative30/minute admissions; two logical writes/admission are not a metered-cost guarantee. Actual index/write accounting,10ms CPU, logs, denial traffic and daily quotas require a bounded approved hosted acceptance. No paid fallback or upgrade is permitted.

## Approval checklist and emergency stop

- [x] Exact ChatGPT callback and predefined public-client method verified from user-observed interface; preregistration-first sequence selected. No metadata-only release needed for this dependency.
- [x] Record current signing/rotation dashboard evidence and verify compatible public JWKS; preserve keys unchanged.
- [ ] Record staging Auth Site URL/redirects, OAuth enablement/path/DCR and hook activation/function binding without secrets.
- [ ] Reconfirm Free/no-upgrade condition and correct verified account; stop if first provisioning contradicts it. No creation probe now.
- [ ] Finalize real key/client/callback runtime inventory, disable previews, inspect actual archive and record source/config/artifact hashes. Keep existing private Site untouched.
- [ ] Approve first Worker/SQLite namespace creation/deployment and emergency stop explicitly, independently of audience SQL, Auth/client setup and synthetic accounts.
- [ ] Recheck staging RLS/ACL/storage/resource/false switches and recovery evidence immediately before any approved mutation.
- [ ] Approve exact audience transition checksum separately; preserve single audience and transactional guards. No generic db push.
- [ ] Approve Auth configuration/native registration/local allowlist and account acceptance separately. Keep DCR and writes disabled unless a future separately reviewed decision says otherwise.

Emergency-stop proposal, also requiring approval before mutation: disable the Worker's workers.dev route via Settings → Domains & Routes; keep preview URLs disabled/no custom routes. Verify all remaining deployment/version URLs deny requests through canonical-origin guards, or deploy an independently reviewed deny-all version retaining DO class/binding/namespace. Disabling workers.dev alone does not disable every alternative URL, per [Cloudflare routing documentation](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). Do not delete the namespace/counters, bypass the limiter, loosen token checks or restore a database. First release has no earlier known-good code version. Subsequent compatible rollback retains namespace/state; Auth/audience recovery is separate and must account for old-token reacceptance.

Existing37-test evidence remains the prior phase's result; no new runtime/test behavior was changed here and no new full regression run is claimed. Local changes are this recheck, a superseding note in the deployment plan and the account-pinned proposal config. Stop after this final checklist. Auth management evidence, assigned client ID, release hashes and explicit coordinated execution approvals remain outstanding. The architecture/bootstrap sequence is ready for review; an executable first release is not yet cleared.


## Signing configuration recheck — 2026-10-29

**No signing-algorithm/configuration blocker identified for controlled OAuth preparation.** Current ES256 selection is user-verified dashboard evidence; independent public-key discovery is consistent with it. No keys were rotated, revoked, created or exported. No account/token was created to test issuance.

Public credential-free GET to `https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/.well-known/jwks.json` returned HTTP200 and exactly one verification key:

| Field | Observed |
| --- | --- |
| kid | e3a069e3-599c-4897-9a74-b1cd6d70876e |
| kty / crv / alg / use | EC / P-256 / ES256 / sig |
| Public coordinates | x and y present |
| Private/shared fields | No d, p, q or k field |

The dashboard observation identifies current algorithm and rotation state; JWKS establishes published verification material. A JWKS can include standby or previously trusted asymmetric keys and is cached, so it alone does not prove the active signing selection. The exact dashboard current kid was not supplied; no exact key-ID match or cryptographic verification of a newly issued token is claimed. Later separately approved acceptance must confirm a new OAuth token's alg/kid/signature against trusted JWKS, exact issuer/audience, expiry and live session/client/consent checks. Do not mint a token solely to close that acceptance item now.

User dashboard evidence: current ECC(P-256)/ES256; previous HS256 Shared Secret; no standby key displayed; no pending rotation visible. This meets the asymmetric configuration prerequisite for planned OAuth/OIDC, consistent with [Supabase OAuth guidance](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

### Previous HS256 implications

[Supabase signing-key documentation](https://supabase.com/docs/guides/auth/signing-keys) explains that rotation changes the issuance key while preserving trust in the old key until revocation. Treat the previous HS256 key as potentially still trusted; “previous” is not “revoked.” Old unexpired tokens may remain acceptable to Auth. HS256 verification requires a shared secret and that secret must not appear in a public JWKS; its absence here does not establish revocation. No shared secret was requested/read/exported.

The independent Worker currently delegates signature/token verification to the pinned staging /auth/v1/user before evaluating claims; it does not restrict verified upstream tokens to ES256 by checking the header. Therefore do not claim an ES256-only acceptance policy: a still-trusted HS256 token could pass upstream authentication, but private data still additionally requires exact staging issuer/resource, authenticated role, configured client, live session and section consent. An algorithm label or decoded claims alone never authenticates a caller. Existing RLS/OAuth/ownership controls remain unchanged.

If the previous key is the legacy JWT secret, legacy anon/service_role credentials or other consumers may depend on it. Do not assume every HS256 predecessor is that legacy key, and do not revoke it without an inventory and separate approval. A compromised retained shared secret remains a residual risk; there is no evidence of compromise in this check, and no signing change is justified merely by its prior-key listing. Public-client OAuth registration needs no signing secret or service-role key.

No standby key is not a deployment failure and no rotation is required for this rollout. Keep keys unchanged. If policy later requires rejecting all HS256 tokens or retiring legacy trust, that is a distinct security change needing compatibility review/testing/approval, not a prerequisite silently added here.

**Remaining gates are unrelated to current signing selection:** Auth hook activation/binding, exact Site URL/redirects, OAuth/path/DCR management evidence, assigned public client ID, finalized release configuration/hashes and explicit coordinated hosted execution approval. Overall deployment remains NO-GO until those gates pass. This revision changed documentation only; no runtime/test/security configuration changed and no regression rerun is claimed.


Gate 0 finalized evidence, Google-only login gap, intermediate-state review and exact first Scope A proposal are recorded in the consolidated final checklist. That assessment supersedes earlier general-user readiness implications. No hosted operation is authorized.


**Later local Google implementation:** the password-only source gap is superseded by [PHASE-C1B-GOOGLE-AUTH-LOCAL.md](PHASE-C1B-GOOGLE-AUTH-LOCAL.md) and the final checklist update. Google provider/signup/redirect and hosted acceptance remain gated; no hosted settings changed.
