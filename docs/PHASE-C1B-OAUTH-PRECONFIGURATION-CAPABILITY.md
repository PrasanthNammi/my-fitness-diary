# Phase C.1B — OAuth preconfiguration capability check

Date: 2026-10-29 (Europe/Berlin). Documentation, connector capability inventory and existing local source inspection only. No hosted query/configuration request or SQL was sent. No credential store, environment credential, administrative token or provider secret was read, retrieved, printed, exported or created. No Auth/Site URL/OAuth/client/user/deployment/login/Git/production operation occurred.

**Decision: NO-GO for execution now. The supported API describes the desired fields, but persistence while OFF and an approved usable management channel are not established. This is UNKNOWN, not a finding that preconfiguration is unsupported.** OAuth stays OFF and Site URL stays unchanged. No need to enable the toggle just to inspect it.

## Findings

| Capability | Result | Evidence / limitation |
| --- | --- | --- |
| Disabled dashboard Path/DCR controls | Unavailable in observed UI | Owner reports only OFF toggle; no independent browser inspection or undocumented dashboard endpoint used |
| Supported Auth config update API | PASS documented | PATCH /v1/projects/{ref}/config/auth exposes optional oauth_server_enabled, oauth_server_allow_dynamic_registration, oauth_server_authorization_path |
| Supported Auth config readback API | PASS documented | GET same endpoint returns those fields and Site URL/allowlist; response may also contain secrets |
| Schema can express OFF + path + DCR=false | PASS documented | Separate boolean/string fields; no enabled=true requirement stated in public reference |
| Actual saving/retention while OFF | UNKNOWN | Documentation does not explicitly promise this combination persists; no authorized mutation probe permitted |
| Explicit DCR=false readback in disabled project | UNKNOWN actual value | Supported response field exists, but no management read performed; public discovery cannot reveal this stored toggle |
| Approved usable management access in this session | NOT ESTABLISHED | Available Supabase connector exposes project/SQL/etc., not Auth configuration GET/PATCH or an authenticated arbitrary Management API method |
| Existing credentials elsewhere / their permissions | UNKNOWN, not inspected | No credential retrieval/presence search/login/token creation; existing project connector authentication does not imply reusable Management API credentials/scopes |
| Local Auth configuration structure | Consistent, limited evidence | Previously pinned upstream configuration represents Enabled, AllowDynamicRegistration and AuthorizationPath separately; this is not the hosted Management API persistence implementation |

Official references refreshed: [Update Auth config](https://supabase.com/docs/reference/api/v1-update-auth-service-config), [Get Auth config](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started). Update reference declares auth:write (fine-grained auth_config_write/project_admin_write); read reference declares auth:read (fine-grained auth_config_read). These are documented access requirements, not verified permissions of this operator/session.

The dashboard guide's enable-first walkthrough does not prove the API rejects disabled preconfiguration. Conversely, optional API fields and a separate upstream configuration struct do not prove there is no managed conditional validation/reset. No fabricated backend behavior or saved defaults are claimed.

## Exact proposed operation — separate approval, not runnable through current tools

Only target endpoint:

```text
PATCH https://api.supabase.com/v1/projects/gngnrmzeghjzqsmzuktl/config/auth
```

Only proposed body:

```json
{
  "oauth_server_enabled": false,
  "oauth_server_allow_dynamic_registration": false,
  "oauth_server_authorization_path": "/oauth/mcp/consent"
}
```

Do not include site_url, uri_allow_list, signup, provider, hook, signing, session or other fields. Future Worker Site URL is **not** part of this operation. Current Site URL remains `http://localhost:3000`; the approved exact Google callback entry remains untouched. Writes remain false; preserve two approved accounts and empty session/client/grant inventories. Database updates cannot substitute for this supported service-configuration API.

Before requesting execution approval, establish an already-approved, appropriately authorized management operator/tool that can apply selected fields and return **only** selected non-secret evidence. No token should be supplied in chat/source/logs. Do not extract connector OAuth tokens, reuse browser cookies, scrape private dashboard APIs, create a PAT or request elevated credentials to bypass the missing capability. Owner dashboard access alone does not establish a supported disabled-state API workflow. Provider support can clarify disabled-state behavior and access without sending this agent credentials.

### Independent readback procedure under later explicit authorization

1. Through the supported GET endpoint, privately obtain selected before-values: oauth_server_enabled, oauth_server_allow_dynamic_registration, oauth_server_authorization_path, site_url, complete uri_allow_list, disable_signup, external_google_enabled and relevant hook status. Capture only reviewed non-secret values. Full responses can include provider secrets; the current task does **not** authorize fetching/logging/exporting them. Require a trusted selected-field/redacted output mechanism; do not assume this endpoint supports a fields query parameter or response projection.
2. Verify exact staging identity, OFF, localhost Site URL, approved fixed callback, signup closed, Google enabled, users/inventories and both false write switches. Stop on drift. Capture exact old Path/DCR even if unset; do not invent rollback before-values.
3. Only after separate approval of this precise operation and before-values, apply the three-field PATCH once. This establishes actual disabled-preconfiguration behavior only if the request succeeds and later readback agrees. A200 update response alone is insufficient.
4. Issue a **separate fresh GET** through the same supported selected-field mechanism. Require enabled=false, path=/oauth/mcp/consent, DCR=false, unchanged Site URL/allowlist and all relevant preserved settings. Verify disabled OAuth discovery independently, plus zero unexpected users/sessions/native/local clients/grants and false switches. Discovery OFF confirms feature status, not Path/DCR storage.
5. If rejected/ignored/ambiguous, stop. Inspect the selected configuration read-only before any retry. Do not enable OAuth, switch to direct SQL or change permissions. Do not interpret refusal as proof all APIs lack support; obtain provider clarification.

Recovery: leave OAuth OFF. Restoring captured path/DCR values would need separately approved recovery; never turn DCR on automatically to restore an unknown baseline. Preserve Site URL, callbacks, signup closure, Google, keys, users and committed audience. No backup restore or account/client deletion. If an unexpected enabled=true is observed, report immediately; an emergency disable needs explicit preapproved stop authority or separate approval rather than an unauthorized follow-on mutation.

## Safest fallback if disabled preconfiguration is unavailable

It is **not** established to be unavailable yet. Do not execute any fallback based solely on the hidden UI.

1. Keep OAuth OFF and Site URL localhost. Prepare/review locally a no-client, fail-closed consent bootstrap (or prove supported administrative public-client preregistration while OFF). The full current Worker cannot start without a real client ID; do not invent one or relax that validator.
2. Under a distinct later deployment approval, deploy/verify the exact HTTPS Worker consent route before moving any OAuth traffic there. A maintenance bootstrap must deny data/approval/login and clearly indicate setup; it is available containment, not functional consent or end-to-end acceptance. No such bootstrap is implemented in this check.
3. Once route availability is verified, separately approve eventual Site URL=Worker origin, preserving the fixed Google callback. Hook/token/resource/client/security checks remain separate gates.
4. Require a provider-supported way to apply/guarantee **DCR=false and the exact path at activation**, such as a supported combined management update whose behavior and access have been established, or provider-assisted configuration. The observed dashboard toggle followed by setting hidden controls after enablement leaves an unknown exposure window and is not accepted as equivalent.
5. Only with that mechanism, endpoint readiness and separate activation/emergency-stop approval, enable and independently verify OFF→ON plus DCR/path correctness; then separately register the real public native client, finalize/deploy full actual-client configuration, allowlist and approve controlled tests in order. No registrations or login flows during maintenance-only bootstrap.

If the only available method is toggling ON before DCR/path can be controlled, **remain OFF / NO-GO**. A deployed consent page alone does not solve unknown DCR exposure, and empty local grants do not prevent unwanted native registration. If fully functional consent must precede any activation, resolve disabled preregistration or a separately reviewed no-client auth-only implementation first; a maintenance page does not satisfy that stricter requirement.

## Next step and approval boundaries

**First next step is non-mutating:** obtain provider-supported confirmation of disabled-state persistence and arrange an approved selected-field management access/readback mechanism, without retrieving/creating administrative credentials. No hosted operation is presently ready to execute through this session.

**GO for reviewing the exact three-field disabled PATCH proposal; NO-GO for executing it until those prerequisites and separate approval exist. NO-GO for OAuth activation, Site URL change or bootstrap deployment under this check.** No current settings changed; historical baseline is not relabeled a fresh hosted verification. Stop here.
