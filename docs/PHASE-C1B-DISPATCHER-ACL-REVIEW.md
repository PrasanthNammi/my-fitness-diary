# Phase C.1B — Dispatcher ACL reconciliation

**Final consolidation update:** Fresh read-only staging inspection confirms the wrapper also intentionally retains service_role EXECUTE. The dispatcher does not grant that role EXECUTE and its schema does not grant it USAGE. Both proposals preserve this three-entry wrapper ACL; no permissions are changed. Current checksums below supersede earlier proposals. See [final coordinated rollout](PHASE-C1B-FINAL-COORDINATED-ROLLOUT.md) for current verification, preflight, approval scope and remaining gates. Earlier task-specific no-hosted-query statements describe those historical tasks only.

Date: 2026-10-29. Local review and disposable-database tests only. No hosted SQL (including read-only queries), permission/configuration change, Worker deployment, production access, commit or push in this task. Staging ACL evidence below was supplied by the user; it is not relabeled a new agent inspection.

**Decision: GO for a fresh read-only preflight/review of the corrected proposals.** The reported authenticated EXECUTE grant is intentional in the approved architecture. No ACL remediation is indicated by this discrepancy. Hosted execution still needs explicit approval and successful immediate target/body/wrapper/ACL checks; this is not broader rollout approval.

## Findings

| Question | Finding |
| --- | --- |
| Was the report's ACL requirement wrong? | YES. Denying dispatcher EXECUTE to authenticated contradicts the invoker-wrapper call path. |
| Was the proposal wrong? | YES. Its postcheck would reject the intended grant after replacement and abort. Its original preflight omitted that ACL check. Both now check the correct unchanged architecture before and after DDL. |
| Is the supplied grant unintended exposure? | NO evidence of that. The exact supplied ACL matches the reviewed installation. Do not revoke it or elevate the wrapper to satisfy a mistaken test. This does not assert that every uninspected platform privilege is correct. |

The local test fixture introduced the mistake: it changed `public.mfd_mcp` to SECURITY DEFINER and revoked authenticated dispatcher EXECUTE. Those two fixture changes had no basis in the approved remediation. They have been removed. The previous report's denied-EXECUTE assertion and prior proposal/manifest checksums are superseded.

## Approved call path and evidence

`authenticated → public.mfd_mcp(text,jsonb) [SECURITY INVOKER] → mfd_mcp.dispatch(text,jsonb) [SECURITY DEFINER, owner postgres]`.

`database/mcp.sql` explicitly grants EXECUTE to authenticated on **both** functions and revokes PUBLIC/anon. The wrapper calls the schema-qualified dispatcher. The approved C.0.1 remediation preserves this MCP boundary; it checks the dispatcher body/mode and does not convert the public wrapper to definer mode or revoke its required dispatcher grant. It also rejects unexpected callable public SECURITY DEFINER functions. Default privileges for future functions are separate from these existing explicit grants.

A private/non-exposed schema is not equivalent to denying every function EXECUTE. The dispatcher is intentionally callable; private tables and native Auth tables do not thereby become directly readable. The Custom Access Token hook has a different, separately restricted Auth-admin ACL and is unchanged.

The user's staging evidence—postgres owner, SECURITY DEFINER, empty search_path, anon false, authenticated true, `{postgres=X/postgres,authenticated=X/postgres}`—matches the dispatcher design. The public wrapper's current state must still be verified during the next authorized preflight; the corrected proposals refuse if it differs.

## Exact before/after contract

| Property | Before | Forward | Reverse |
| --- | --- | --- | --- |
| Dispatcher owner / security | postgres / DEFINER | unchanged | unchanged |
| Dispatcher search_path | empty | unchanged | unchanged |
| Dispatcher explicit ACL | postgres EXECUTE; authenticated EXECUTE; no grant options; no PUBLIC/anon/extra grantee | unchanged | unchanged |
| Dispatcher effective authenticated / anon EXECUTE | true / false | true / false | true / false |
| Dispatcher normalized body MD5 | `5746d0b1b36036343df0696e0c5429a4` | `7d93d522e07936bca67faa53903d4868` | exact original restored |
| Public wrapper owner / security / search_path | postgres / INVOKER / empty | unchanged | unchanged |
| Public wrapper body MD5 | `c0586b393b1d82332c88f1b1123f57c5` | unchanged | unchanged |
| Public wrapper explicit ACL | postgres + authenticated + service_role EXECUTE; no grant options | unchanged | unchanged |

Source comparison verifies the reverse body is byte-identical to the original dispatcher body. Removing only the added authorization_binding branch from the forward body also yields that original body. No other operation/body was edited by the ACL correction. The Worker candidate remains unchanged.

Both proposals assert the exact two-entry dispatcher and three-entry wrapper ACLs semantically, independent of entry order, plus effective authenticated=true/anon=false. PUBLIC, extra grantees, grant options, missing required EXECUTE, different owner/search_path/security mode or changed wrapper body cause refusal. There is no GRANT, REVOKE or owner alteration in either proposal. They replace an existing function rather than drop/recreate it. PostgreSQL documents that [CREATE OR REPLACE FUNCTION preserves ownership and permissions](https://www.postgresql.org/docs/17/sql-createfunction.html); explicit pre/post guards and local snapshot comparisons enforce the intended contract here.

## Authorization remains inside the dispatcher

EXECUTE is the entry permission, not authorization to any owner's diary. Both direct schema-qualified calls and the invoker wrapper run the same dispatcher:

- auth.uid derives from the trusted authenticated request context, never an assistant-supplied owner argument.
- A live session row must match both session ID and user before any operation.
- Existing first-party consent/revoke/connections operations remain owner-scoped. The new read-only binding additionally requires first-party authenticated audience, exact arguments, an approved/unexpired native authorization owned by that user, registered local client and existing nonempty same-user/client grant. It returns only public client/redirect metadata, never code/state/token/user identity.
- External OAuth callers still require the sole configured resource audience and registered client, live session and per-user section consent. The binding operation is unavailable through their first-party branch. Writes/approval/proposal guards remain unchanged.
- Direct authenticated EXECUTE does not grant table DML, bypass these function guards or expose the private schema through the Data API. Actual API JWT validation remains upstream; local tests do not claim arbitrary database credential holders cannot set their own session variables.

No RLS/table/schema ACL, user/session/grant data, signup/DCR/signing/hook configuration, audience or write switch changes are in these proposals.

## Corrected regression evidence

Full network-blocked runner: **47/47 PASS**, log ignored under `.sites-runtime/c1b-local-blockers/acl-review-tests.log`.

The corrected `tests/reconnect-binding-database.cjs` uses the canonical invoker wrapper and intended dispatcher grant, with no privilege elevation to make the test pass. It checks:

- Both function owners/modes/empty search paths; intended effective authenticated EXECUTE and denied anon.
- Successful authorized binding through both public wrapper and direct dispatcher.
- Both call paths reject anonymous/no-identity, wrong-owner, stale/mismatched session, OAuth-client, invalid audience, unregistered client, expired/pending authorization, missing local consent and injected owner/client selectors.
- Forward/reverse preserve users, sessions, authorizations, consent/settings, policies, tables and both functions' owner/ACL/mode/search_path snapshots.
- Forward refuses missing authenticated EXECUTE, PUBLIC/anon EXECUTE, grant option, wrong wrapper mode, missing wrapper EXECUTE and unsafe search_path. Reverse independently refuses PUBLIC exposure, missing authenticated EXECUTE and wrong wrapper mode.
- Negative ACL/mode changes occur **only inside disposable local fixtures** to verify rejection. Neither proposal repairs them; the rejected state remains unchanged after transaction rollback.
- Successful reverse restores the exact old body and preserves intended grant; repeated execution refuses; injected late forward/reverse failures roll back atomically.

Existing MCP/RLS/account-isolation, C.0.1 remediation and Worker security tests also pass in the complete runner. No runtime source or Worker/config bytes changed, so no new native workerd/build/CPU performance claim is made for this SQL-only correction. Earlier native results remain historical evidence, not proof of the previously incorrect SQL fixture architecture.

## Final reviewed artifacts

| Artifact | SHA-256 |
| --- | --- |
| [Forward SQL](../database/staging/c1b-reconnect-binding.proposed.sql) | `1e2382dbbddbe69691f01caac8e86b1c61530aa0595f8f120a9e5332c072fb8c` |
| [Reverse SQL](../database/staging/c1b-reconnect-binding.rollback.proposed.sql) | `6da8bcd152efe88683074718e39762d9999dddea3db3fecb5fa1e67b3c775288` |
| Updated ignored source/release manifest | `1210ecd066725c99cce8b4c87114e664cd802fcb828c2cf5f41a716e09b46b17` |
| Unchanged candidate Worker | `0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e` |
| Unchanged runtime configuration | `e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5` |

Earlier forward `6c46c37c…`, reverse `eba838a5…` and manifest `ad27f780…` are invalid for future execution approval. Recalculate the full current hashes immediately before any separately approved operation; do not edit guards or permissions to make a drifted target pass. The historical audience-transition artifact remains unchanged at1050f9e1… and is unrelated; do not rerun it.

Recovery remains separately approved, transactional and function-body-only. Reverse keeps authenticated EXECUTE and the invoker wrapper; it is not a privilege repair. Removing authorization_binding before reverting the candidate Worker makes existing-consent reconnect deny again, so coordinate compatible code recovery explicitly. No automatic reverse or deployment is authorized/performed by this review.

**Final recommendation: GO for the corrected proposals' fresh read-only staging preflight and approval review.** The ACL discrepancy is resolved locally. No permission change is required to reconcile the supplied staging ACL with the approved architecture.
