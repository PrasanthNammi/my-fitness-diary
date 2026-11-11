# Phase C.1B — OAuth Server activation readiness

Date: 2026-10-29 (Europe/Berlin). Official-documentation and local source review only. No hosted project/configuration read or mutation, OAuth activation, registration, deployment, login, user/SQL change, production access, commit or push in this review. Recorded hosted baseline comes from the latest verification and the owner's current OFF-only dashboard observation; it is not a new comprehensive management read.

**NO-GO for activating OAuth Server now. GO to review disabled-server preconfiguration as the first narrow hosted scope, after obtaining a supported secret-safe management access/readback method.** No source change is implemented or authorized by this report. Earlier activation-before-full-Worker sequences are superseded where they conflict with the readiness gates below.

## Exact URLs and current evidence

| Purpose | Required value / current evidence |
| --- | --- |
| Only target | gngnrmzeghjzqsmzuktl — MFD OAuth Phase 2 Testing |
| Current Site URL | http://localhost:3000, explicit saved-dashboard confirmation |
| Eventual OAuth consent Site URL | https://mfd-connect-staging.shanustylish777.workers.dev (origin only) |
| Implemented Authorization Path | /oauth/mcp/consent |
| Eventual combined consent UI | https://mfd-connect-staging.shanustylish777.workers.dev/oauth/mcp/consent |
| General redirect list | Only https://mfd-connect-staging.shanustylish777.workers.dev/auth/google/callback, explicit saved-dashboard confirmation |
| Active MCP resource / audience | https://mfd-connect-staging.shanustylish777.workers.dev/mcp; audience transition committed, do not rerun |
| Issuer | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1, unchanged |
| Google provider callback | https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/callback, unchanged |
| Future ChatGPT native-client callback | https://chatgpt.com/connector/oauth/Xm83tVWz4VJh; recheck actual draft before registration |
| OAuth Server | OFF; owner sees only toggle |
| Authorization Path / DCR stored values | UNKNOWN until supported management read/preconfiguration; do not infer defaults |
| Hook | Last dashboard evidence: none configured; SQL function exists but is not bound |
| Accounts / security | Last fresh verification: two approved confirmed users, two email identities, zero sessions/clients/grants; signup disabled, Google enabled, both writes=false |
| Deployment/client inventory | Full Worker not deployed; actual native client ID absent, runtime config incomplete |

The local router and shared consent handler implement the exact consent path. `integrationConfig` rejects an empty client inventory; `colocatedConfig` pins resource to authOrigin+/mcp. No current supported runtime flag serves a no-client bootstrap. Using a fake ID, bypassing startup checks or allowing anonymous tools is excluded.

## Official support and effects

[Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started) states that Site URL and Authorization Path form the consent UI destination. Therefore localhost cannot remain the Site URL when this chosen hosted OAuth consent flow is activated for ChatGPT. It could remain unchanged for the previous first-party Google redirect-only step because that code always supplies an explicit fixed redirect_to.

[Redirect documentation](https://supabase.com/docs/guides/auth/redirect-urls) defines Site URL as the default destination when redirectTo is absent and identifies email confirmation/recovery implications. A change may affect future login/provider fallbacks, confirmation/invitation/recovery/email-template links using SiteURL, and OAuth consent routing. The Worker implements no complete email-recovery/confirmation UI; do not trigger those email flows or claim they work at its root. Preserve existing valid redirect entries and inventory any other staging consumers/templates before approval. No existing UUID, password, identity, session, signing key, Google credential, grant or audience should be changed by a Site URL-only edit. That is a bounded config change, not proof that all historical links immediately change or tokens are revoked.

The pinned Auth validator reviewed earlier implicitly trusts redirects at the Site URL origin independently of the explicit general allowlist. Moving it to the Worker consequently broadens that implicit origin permission to other paths there. Fixed Worker route/origin/continuation checks remain essential; do not describe the explicit one-entry allowlist as the entire redirect trust boundary after this change.

The approved Google callback remains valid: exact HTTPS host/path is unchanged, stays explicitly listed, and current code supplies it without application state query. Do not add origin-root or ChatGPT callback to the general list for this purpose. Google credentials identify Google→Supabase sign-in; the future public client ID identifies ChatGPT→Supabase OAuth Server. They are not interchangeable.

## Disabled-server configuration: documented mechanism, unverified account capability

Current [Management API update reference](https://supabase.com/docs/reference/api/v1-update-auth-service-config) documents PATCH `/v1/projects/{ref}/config/auth` with `site_url`, `oauth_server_enabled`, `oauth_server_allow_dynamic_registration` and `oauth_server_authorization_path`. Its [GET reference](https://supabase.com/docs/reference/api/v1-get-auth-service-config) documents auth-config read authorization. An OFF-only dashboard does not establish that settings are impossible to configure while disabled.

**First proposed hosted scope P, after separate approval:** on this exact staging project, submit only:

```json
{
  "oauth_server_enabled": false,
  "oauth_server_allow_dynamic_registration": false,
  "oauth_server_authorization_path": "/oauth/mcp/consent"
}
```

Site URL remains localhost; general callback entry, signup, Google, hooks, keys and users remain unchanged. This is not permission to enable the server to reveal controls. Before execution obtain exact prior values through supported, privately filtered management evidence. The connected Supabase tools previously exposed project/SQL operations but no Auth config management method; do not substitute SQL or request/paste a privileged credential in chat. A management operator must ensure any GET/PATCH response, which may contain provider secrets, is filtered locally before logs/chat/evidence. Do not fetch or print full responses.

The reference establishes field support, **not** a tested guarantee that this account/backend accepts storing those fields while disabled, nor atomic cross-service configuration. Verify all three selected readback fields after one approved request. If refused, ignored or not safely readable, stop and obtain provider-supported clarification; no activation-as-inspection workaround. Current API access/permissions and stored before-values remain blocking prerequisites for scope P. Reapplying known enabled=false as a guard is deliberate; no auth-config read-modify-write of the entire object.

## Smallest safe dependency sequence and boundaries

1. **P — Disabled-server settings, separate configuration approval.** Read/capture exact selected before-values, apply the three-field proposal above, verify OFF/path/DCR=false and unchanged security baseline. Do not change Site URL yet. No clients or endpoint need exist for this inert preparation.
2. **L — Local bootstrap decision/preparation, separate local scope.** Resolve the real-client-ID/startup dependency before any activation. Preferred investigation: establish a documented provider-supported way to administratively preregister the real public client while OAuth is disabled. Current setup guide enables OAuth before registration, so that capability is **NOT established** here. Do not attempt registration as a probe. If supported, separately approve registration while disabled, populate the actual ID, and proceed directly to full Worker deployment.
3. **Alternative L/B if preregistration while disabled is unsupported:** prepare/review a dedicated fail-closed bootstrap release before asking for deployment. It must serve a bounded, available setup/maintenance consent page at the exact path, with no diary/API/approval/registration/login capability, no fake client and no authentication bypass. Keep resource/discovery behavior and emergency stop explicitly reviewed; this is a new local artifact, **not implemented** by this report and not an undocumented current flag. Such a page prevents a dead-host redirect but does not make OAuth usable. Separate approval for exact bootstrap source/config/hash and first Worker/SQLite provisioning is mandatory; do not deploy the current invalid placeholder config.
4. **B — Worker deployment, separate approval.** Prefer the full real-client-configured Worker with OAuth still OFF if disabled preregistration is proven. Otherwise deploy the reviewed bootstrap only. Verify actual HTTPS origin and consent route availability, security headers, private-data denial, shared limiter, no unintended login/approval flow and emergency-stop behavior. No provider login tests. Resolve new transaction-storage/alarms/quota/retention prerequisites from the fixed-callback report; do not reuse old artifact approval or four-row-only cost assumptions.
5. **U — Site URL-only configuration, separate approval after a verified reachable route.** Set exactly `https://mfd-connect-staging.shanustylish777.workers.dev`; preserve the exact Google callback list. Keep OAuth OFF/path exact/DCR=false. Read back and verify no user/session/client/grant drift, signup closed and false writes. No email/default-redirect flow should be exercised during this bounded setup window. Leaving Site URL localhost until this point avoids changing defaults to a dead host unnecessarily.
6. **H — Token-hook setup, separate approval.** Verify the existing mfd_mcp.access_token_hook source/ACL and no competing hook; approve binding/activation before any external token acceptance. Preserve current ES256/previous HS256; no key operation. Check that planned first-party behavior remains correct in later acceptance. This is a prerequisite, not bundled into P/U/activation.
7. **A — OAuth activation only, separate approval with emergency-stop authority.** Preconditions: reachable reviewed consent route, correct Site URL, exact path, verified DCR=false already stored, false writes, closed signup, preserved hook/signing, no unexplained inventory. Enable server; immediately read back enabled/path/DCR and inspect official discovery without authorization/login requests. Discovery alone cannot prove DCR disabled. If path or DCR cannot be proven, turn OFF only under preapproved stop authority; do not register a client first. Do not invoke a DCR registration endpoint as a negative test because that can mutate.
8. **C — Native public client registration, separate approval if not already completed while disabled through a proven path.** Exactly one client, Public, token method none, no secret, S256 and exact current ChatGPT callback. Capture provider-assigned ID. If bootstrapped, there is now a registered client while consent remains maintenance-only: prohibit Save/Connect/login and keep local client/grants empty. Prepare/finalize/configure/hash/test the full release with this actual ID, then separately approve its deployment and verify real consent UI is available before allowing flows. No fabricated IDs or weakened config guards. Activation-first with the existing full placeholder package is not acceptable.
9. **D/E — Local DB allowlist and controlled real acceptance, separate approvals.** Insert only the reviewed native ID after runtime/native agreement, preserving no section grants and false writes. Only after full Worker, hook, path/DCR/client checks approve the two controlled accounts' Google and ChatGPT flows. Verify stable pre-provisioned UUIDs, signup restriction, signed token audience/issuer, session/consent, refresh/revocation and isolation. Neither bootstrap maintenance nor native registration grants diary sections.

There is no cross-provider transaction. A strict requirement that *fully functional* consent exist before *any* activation cannot be met by the current client-required startup unless disabled-server preregistration is established or a separately reviewed no-client auth-only implementation is prepared. A maintenance bootstrap provides an available fail-closed page, not functional consent. If that bounded nonfunctional setup window is unacceptable, **STOP** until the stricter prerequisite is resolved. Do not present operator discipline/no planned flows as a technical access-control guarantee.

DCR must be demonstrably false before enabling; merely enabling first and hoping to turn it off afterward leaves unreviewed public registration exposure. This is why the disabled preconfiguration mechanism is the first proposed action. Two existing users and empty local grants do not justify unknown DCR state.

## Verification, stop and recovery

Before every approved scope refresh exact project/ref, expected settings/before-values and two approved UUIDs, email identities, zero sessions/native/local inventories as applicable, false writes, signup/Google state, current Worker resource/default, security/private-schema/storage baseline and exact artifacts. After native registration, expected counts must be explicitly revised; do not keep demanding zero approved native clients or rerun the audience transaction. Do not imply a fresh full platform audit was performed in this review.

Management verification must show selected values only: Site URL, full redirect list, enabled/path/DCR, hook binding/status; use operator screenshot/attestation if independent read access is unavailable and label it manual evidence. Never print provider secrets/tokens/full management responses. Unknown path/DCR is a stop condition for activation, not an invitation to send real authorization/registration traffic.

Emergency-stop approval must be included in each applicable hosted scope. For failed activation/path/DCR verification: disable OAuth Server through the same supported controls and read back OFF; record any unexpected native inventory without deleting it. Turning OFF is containment, not a claim that access/refresh tokens, clients or grants are deleted/revoked. Preserve live SQL checks and false writes. Any unexpected issuance/session/grant needs separate approved revocation/recovery work.

For Worker compromise/unexpected exposure: disable workers.dev using preapproved stop authority, previews off/no alternate routes; verify canonical-origin guards on alternative version URLs or use a separately reviewed deny-all version. Preserve SQLite namespace/counters/transaction state; do not reset quotas or delete storage. If routing fails, stop activation/flows. No automatic source rollback across incompatible transaction/alarm schema, and no audience SQL reverse.

For a Site URL-only failure, stop flows and restore captured localhost value only under preapproved or separately approved U-recovery scope, retaining the exact Google redirect entry. If OAuth is already ON, restore/disable in a coordinated reviewed order so no active flow is pointed to localhost. Restoring a value does not revoke historical tokens or fix already delivered email links. For P failure, keep OAuth OFF; restore only captured path/DCR if specifically approved and safe, never turn DCR on automatically as rollback. Leave signup closed and Google enabled.

No new subscription is inherently required by these Auth settings; OAuth Server is documented as having no separate charge, with users counting toward MAU. Worker/DO usage and new transaction alarms/writes consume account quotas, and entitlement/CPU/storage retention/metering still need controlled review. No upgrade/purchase/paid fallback is authorized.

**Recommendation: NO-GO for activation or Site URL change now. First proposed hosted action: scope P, disabled-server Authorization Path/DCR preconfiguration only, once secret-safe supported access and exact before-values are established and separately approved.** First non-mutating preparation is to arrange that selected-field evidence/access and choose the bootstrap/preregistration path. This report creates no authority to execute any hosted action. Stop after review.


## Disabled preconfiguration capability finding — 2026-10-29

[Capability check](PHASE-C1B-OAUTH-PRECONFIGURATION-CAPABILITY.md): Management API documents all three fields and selected combination, but actual disabled-state persistence remains UNKNOWN. Current connector has no Auth config GET/PATCH capability; approved direct management access not established and no credentials inspected/retrieved. No hosted call was made. Scope P is a reviewable proposal, not execution-ready: require supported selected-field readback and provider confirmation or later expressly approved bounded application/readback. Do not enable solely to expose controls. If disabled preconfiguration is unsupported, deploy/verify a separately reviewed fail-closed route while OFF, then require a supported activation mechanism guaranteeing DCR=false/path at enablement. Toggle-first/unknown-DCR remains NO-GO.
