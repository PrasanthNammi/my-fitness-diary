# Phase B.1 dependency security remediation

Date: 2026-10-27 (Europe/Berlin). Branch: `staging/mfd-oauth-testing`.

**Result: 79 hosting audit entries reduced to 1 moderate entry. Zero remaining entries are potentially reachable in the inspected deployed Worker or browser bundles. Root audit: zero. All 31 local test files and the required build/check/smoke gates pass.**

The one remaining development-tool advisory is documented, not suppressed. A controlled, private, read-only staging deployment is recommended for Phase C validation, subject to explicit deployment approval and the staging configuration preflight below. This is not OAuth or production readiness approval.

No production or staging Supabase project was contacted by application tests. No hosted accounts, data changes, configuration changes, paid resources, deployment, publication, merge, commit or push occurred. Existing Phase B changes were preserved. Frontend source design and functionality were retained. The local preview was stopped.

## Final counts

| Scope | Before | After |
| --- | --- | --- |
| Hosting registry entries | 79: 3 critical, 32 high, 33 moderate, 11 low | **1 moderate**, no critical/high/low |
| Original entries no longer matching | — | **78/79** |
| Remaining entries potentially reachable in deployed code | Unestablished in Phase B | **0**, for the inspected build and route set |
| Root dependency entries | 0 | **0** |

Counts are registry advisory entries, including separate affected-version ranges for some GHSA IDs; they are not counts of independently exploitable MFD vulnerabilities. The unfiltered hosting audit still exits 1 because of the moderate finding. The existing CI `--audit-level=high` check exits 0 and still displays that finding. No ignore list, reduced audit scope, changed CI severity threshold, or `audit fix --force` was used.

See [all 79 baseline entries with their complete original dependency paths and current dispositions](PHASE-B1-ADVISORY-TRIAGE.md). [Bundle evidence](PHASE-B1-BUNDLE-INVENTORY.json) records normalized module IDs, chunk imports and dynamic imports for the baseline and final builds.

## Dependency classification and reachability method

The build was instrumented through an optional build-only Vite plugin, enabled with `MFD_DEPENDENCY_MANIFEST=baseline` or `final`. It captures actual `chunk.modules`, imports and dynamic imports for the RSC, SSR and hosting client environments. This avoids treating package-manager `devDependencies` as proof that a package cannot deploy. Manifest files are written under ignored tool state, not served. The portable evidence in this report strips local absolute path prefixes.

| Class | Dependencies and evidence |
| --- | --- |
| Deployed Worker runtime | Vinext, React/React DOM edge/server code, React Server Components, and `@vitejs/plugin-rsc` runtime helpers appear in RSC/SSR chunks. The RSC package was therefore patched despite being declared a dev dependency. MFD's own Worker imports its auth/MCP/consent and connector-context code. |
| Browser runtime | The existing diary remains on root React/React DOM 18.3.1. Supabase SDK, Lucide, and ZXing enter root-built browser bundles. Hosting's fallback client chunks include React/React DOM 19.3.1, scheduler, RSC client helpers and Vinext. Root React was not migrated. |
| Build-time only | Vite and compiler plugins, Babel, Browserslist, baseline-browser-mapping, PostCSS/source-map-js, schema validators used by Webpack, and bundlers. Vulnerable maintenance versions were updated. Webpack is an RSC peer/build dependency; its compiler dependency tree is not bundled as an application server. |
| Development/test only | Wrangler/Miniflare, their Undici and ws dependencies, ESLint and its glob/YAML dependencies, Drizzle Kit and its TS loader, PGlite and tests. The Miniflare HTTP implementation received a scoped patch and a real localhost smoke check. |
| Unused/unreachable application paths | Next's server is not the MFD Worker entry point; the `next` package supplies config/type/lint/peer compatibility. Native Sharp, Satori, OG/font generation and fflate have no MFD application route and are absent from deployed module manifests. They were patched where practical regardless. Unused hosting UI scaffold packages were retained. |

Baseline and final deployed package sets contain only `vinext`, `react`, `react-dom`, `react-server-dom-webpack`, and `@vitejs/plugin-rsc` in RSC/SSR; the hosting browser set also includes `scheduler`. Node built-ins and resolved Vite virtual modules are not npm dependency-server entry points. Next, native Sharp, Satori, fflate, Undici, ws, esbuild, Drizzle and ESLint do not appear in these bundle module sets.

These conclusions apply to this source, generated artifact and route configuration. Absence from a manifest plus route/source review supports non-reachability here; it is not a permanent exemption if imports, routes, bindings or deployment packaging change. Root/browser packages were separately built, scanned, tested and audited.

## Three critical Next.js advisories

Both original paths were `hosting > next@16.3.4` and `hosting > vinext > @unpic/react > next@16.3.4`. The shared Next resolution is now **16.4.2**, above all three patched floors.

| Advisory | Affected behavior and MFD investigation | Disposition |
| --- | --- | --- |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | The Node `next/og` implementation can process attacker-influenced SVG values. MFD has no ImageResponse/OG application route. Vinext aliases `next/og` to its own shim, but neither that shim, `@vercel/og`, Satori nor Next's Node implementation is in MFD's deployed bundle graph. `/opengraph-image` returned 404 locally. | Not reachable in the inspected MFD artifact; Next upgraded beyond 16.3.6 anyway. Vinext's own OG dependencies were also updated. |
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | Concerns native image processing on glibc Linux. MFD runs a Worker, not Next's Node optimizer. Native Sharp and Next optimizer modules are absent. Vinext's own image-optimization helper is bundled, but is separate code and does not import native Sharp. The actual Worker with its ASSETS binding returned 404 for the synthetic `/_next/image` request. | Not reachable through the inspected Worker; Next upgraded beyond 16.4.1 and installed Sharp copies now resolve to 0.35.5. |
| [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) | Requires affected Next cache-component behavior with a user `use cache` function returning multiple typed arrays. MFD has no such user function and does not execute Next's cache server. The inspected route set is the static diary shell, BFF APIs and MCP. A synthetic `Next-Action` POST to `/` returned the diary HTML, not an RSC/action response. | Not reachable in this configuration; Next upgraded beyond 16.4.1 and deployed RSC runtime upgraded to 19.3.1 regardless. |

Normal unknown paths currently delegate to the ASSETS binding when it exists. The review does not rely on that routing detail alone: absence of the vulnerable Next modules and affected application features was checked independently. Local negative route probes are supporting evidence, not exploit proofs or hosted acceptance.

## Supported updates and compatibility

Registry engine/peer constraints were inspected before selection. Versions were chosen to satisfy the existing seven-day minimum release-age policy; that policy, strict dependency build allowlist, lockfile verification and frozen install behavior were retained. Newer releases existed, but the selected set was old enough for the policy and had compatible declared peers.

| Dependency | Before | Final |
| --- | --- | --- |
| next / eslint-config-next | 16.3.4 | 16.4.2 |
| vinext | 1.0.0-beta.5 | 1.2.1 |
| vite | 8.0.13 | 8.3.4 |
| react / react-dom / react-server-dom-webpack (hosting) | 19.2.6 | 19.3.1 |
| @vitejs/plugin-rsc | 0.5.26 | 0.5.38 |
| @vitejs/plugin-react | 6.0.2 | 6.1.2 |
| @cloudflare/vite-plugin | 1.37.1 | 1.64.0 |
| wrangler | 4.92.0 | 4.151.0 |
| @cloudflare/workers-types | 4.20260515.1 | 5.20261019.1 |
| @types/react / @types/react-dom (hosting) | 19.2.14 / 19.2.3 | 19.3.0 / 19.3.0 |
| zod (hosting) | 3.25.76 | 4.6.7 |
| eslint | 9.39.4 | 9.39.5 |
| drizzle-kit | 0.31.10 | 0.31.11 |
| @zxing/browser (root) | 0.2.1 | 0.1.5 |
| @zxing/library (root peer, now explicitly pinned) | 0.23.0 | 0.21.3 |

Vinext 1.2.1's peers accept Vite 8, the selected React/RSC 19.3.1 versions, RSC plugin >=0.5.37 and the selected React plugin. The Cloudflare plugin declares Wrangler ^4.151.0 and supplies the matching Miniflare 5 beta/workerd release; the beta here is the official dependency selected by that plugin, not an independently substituted runtime. Strict peer installs and the real Worker build/start passed. The Zod 4 record API requires explicit key/value schemas; preview request validation was updated and tested. No application route/frontend redesign was needed.

Declared ranges for unrelated hosting UI dependencies were preserved. Their lockfile resolutions were refreshed within supported ranges during the graph update. The actual diary's root React and UI dependency versions were preserved apart from the ZXing pair. Both lockfiles changed deliberately.

### Parent-scoped maintenance resolutions

Supported direct updates and transitive refreshes came first. The existing `miniflare > sharp: 0.35.4` override was removed; updated parents now provide fixed Sharp. Refresh attempts still retained some old leaf resolutions, and two upstream packages pin vulnerable exact versions. Seven explicit parent selectors were used rather than global package replacement:

| Selector / final resolution | Compatibility basis |
| --- | --- |
| `minimatch@10.2.5 > brace-expansion: 5.0.12` | Inside the parent's ^5.0.5 range. |
| `@babel/helper-compilation-targets > browserslist: 4.29.4` | Inside ^4.24.0. |
| `webpack > browserslist: 4.29.4` | Inside Webpack's 4.x supported range. |
| `browserslist > baseline-browser-mapping: 2.11.30` | Inside its 2.x supported range. |
| `ajv@8 > fast-uri: 3.1.9` | Inside ^3.0.1; deliberately uses the maintained 3.x patch, not latest 4.x. |
| `miniflare@5.20261012.0-beta > undici: 7.30.1` | Upstream pins 7.29.1. This is a same-major maintenance update; the inspected Miniflare imports still exist and were tested. A data-URL fetch and actual Miniflare/Worker smoke suite passed. Node >=20.18.1 remains compatible with Node 22.13.1; Undici 8 was not substituted. Recheck/remove this selector when upstream advances its pin. |
| `satori@0.33.5 > fflate: 0.7.5` | Upstream pins 0.7.3. This is a patch release within 0.7; the ZIP API round-trip passed. No Satori/font code is deployed in MFD. Recheck/remove this selector when upstream advances its pin. |

A pnpm install refresh with `--force` was used during diagnosis of stale resolutions; it did not ignore manifest ranges or act as audit-fix, and was interrupted when it unnecessarily fetched foreign-platform optional binaries. The final normal install, strict peer check and frozen reinstall all passed. The scoped resolutions above are the final explicit policy; no broad override set was applied. Original and intermediate lockfiles were preserved in ignored local state during the work.

### Barcode compatibility

The newest ZXing browser pair requires a library declaring Node >=24. Browser 0.1.5 supports library ^0.21, and library 0.21.3 declares Node >=10.4. Both are pinned explicitly. The existing `BrowserMultiFormatReader.decodeFromConstraints` API remains present. A synthetic EAN-13 image with a valid check digit was decoded through the browser reader under Node 22, verifying the core path used by food scanning.

The build now regenerates both `/legacy/vendor/barcode.js` and `/vendor/barcode.js` from that pair. Localhost checks verified both served files are identical and expose the reader. Real camera permissions, device capture and physical barcode performance still need device smoke testing; they are not established by the synthetic decode. No scanner UI or food lookup behavior was removed.

## Remaining advisory

| Field | Result |
| --- | --- |
| Advisory | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), moderate |
| Vulnerable installed version | esbuild 0.18.20 |
| Exact path | `hosting > drizzle-kit@0.31.11 > @esbuild-kit/esm-loader@2.6.5 > @esbuild-kit/core-utils@3.3.2 > esbuild@0.18.20` |
| Runtime reachability | **Not deployed.** No esbuild/Drizzle modules in Worker or browser manifests. MFD build/dev/start scripts do not start this esbuild's serve API. The loader uses transform/transformSync. |
| Available patched floor | >=0.25.0. Root application bundling already uses 0.28.2. |
| Why not forced | The deprecated loader requires ~0.18.20. A 0.x jump to >=0.25 would exceed its declared API range. Latest stable Drizzle Kit still carries the loader. Changing/removing the schema tool or selecting a Drizzle prerelease would require a separate compatibility decision. |
| Mitigation | Do not invoke the old esbuild serve API or expose schema tooling to browsers/public listeners. Keep the tooling out of deployment artifacts; preserve the audit warning. |
| Residual risk | The installed development package remains vulnerable if future tooling starts its HTTP server. Re-audit when schema tooling changes. No zero-vulnerability claim is made. |

ESLint 9.39.5 and the old esbuild-kit loader also emit maintenance/deprecation warnings. They are recorded rather than hidden. Upgrading ESLint across a major solely to remove a deprecation warning was not necessary for this security remediation.

## Verification results

All checks used Node **22.13.1**. No real access tokens, account sessions, signup, remote database or production data were used.

| Check | Result |
| --- | --- |
| Root clean `npm ci --engine-strict` | PASS; no Node engine warning |
| Hosting `pnpm install --frozen-lockfile --strict-peer-dependencies --config.engine-strict=true` | PASS; release-age/build policies retained |
| Original 29 local test files | PASS |
| New barcode-compatibility.cjs | PASS, synthetic EAN-13 and browser API |
| New hosting-dependency-compatibility.cjs | PASS, Zod 4, Miniflare's Undici APIs/data fetch, Satori's scoped fflate ZIP round-trip |
| Complete aggregate suite | **31/31 PASS** |
| Database/RLS and MCP security suites | PASS within the aggregate; all three repository SQL suites run in PGlite |
| Frontend TypeScript | PASS |
| Hosting/Worker TypeScript | PASS |
| Hosting ESLint | PASS, no reported issues |
| Production-mode staging build | PASS |
| Artifact inspection | PASS: public 37 files, hosting/dist 169 files, local output 167 files |
| Actual dependency module/chunk manifests | Captured for baseline and final RSC/SSR/client builds |
| Local built Worker smoke suite | **16/16 requests PASS**, including both discovery aliases, authentication boundaries, served staging/barcode bundles and negative Next optimizer/OG/action probes |
| Root unfiltered audit | PASS, zero findings |
| Hosting unfiltered audit | One moderate finding remains; raw exit 1 |
| Existing CI audit threshold | PASS, exit 0 with the moderate finding still displayed |

The test runner continues to block outer-process fetch and uses synthetic fixtures. The new Undici test deliberately uses an in-process `data:` URL, not network access. Localhost smoke requests use no real account and contact only `127.0.0.1:5173`. SQL coverage still uses synthetic auth/storage contracts and a cron stub; it does not establish hosted OAuth, native Storage, refresh rotation or true database concurrency.

The retained root `dist/` is still an old tracked snapshot containing production references and was not served or overwritten. Use only the newly inspected `.sites-runtime/phase-b-dist/` or `hosting/dist/`; normal deployment packaging must rebuild/inspect its selected output. Build warnings about static route classification are framework limitations, not proof that all routes were browser-tested.

## Reproduce

Select Node from `.nvmrc`, then run:

```sh
npm ci --engine-strict
npx --yes pnpm@11.25.0 --dir hosting install --frozen-lockfile --strict-peer-dependencies --config.engine-strict=true
node scripts-restore-media.cjs
MFD_BUILD_OUTPUT=.sites-runtime/phase-b-dist MFD_DEPENDENCY_MANIFEST=review npm run build
npm run test:local
npx tsc -p frontend/tsconfig.json --noEmit
npx tsc -p hosting/tsconfig.json --noEmit --incremental false
npm --prefix hosting run lint
node scripts-verify-staging.cjs public hosting/dist .sites-runtime/phase-b-dist
npm audit
npx --yes pnpm@11.25.0 --dir hosting audit
```

The last command is expected to show the remaining moderate entry and return nonzero. For the actual Worker smoke suite, start `npm --prefix hosting run start -- --port 5173`, run `node scripts-smoke-staging.mjs`, then stop the preview. No hosted sign-in is needed for this suite.

## Staging recommendation and next actions

**Recommend controlled private, read-only staging validation.** Dependency remediation no longer has a deployed-code advisory blocker in the inspected build. The remaining moderate finding is a documented development-server risk, not an accepted production exposure.

Before any publication, obtain separate deployment approval and complete the read-only hosted preflight from docs/STAGING.md: verify staging project identity, current RLS/privileged functions/exposed schemas, exact issuer/resource/client/hook/signing settings, both writes-disabled switches, and private MCP client access. No hosted state was verified or changed in B.1. Do not apply the non-idempotent SQL installer blindly. Creating synthetic hosted accounts or changing Supabase settings remains separately approval-gated.

Phase C must establish real authorization-code/PKCE consent, refresh rotation, expiry, native revocation/reconnect, bidirectional account isolation through direct API paths and MCP, and genuine concurrent database behavior. Device barcode/camera smoke testing remains outstanding. Production readiness is not established.

## B.1 files

- Dependency manifests/locks: `package.json`, `package-lock.json`, `hosting/package.json`, `hosting/pnpm-lock.yaml`, `hosting/pnpm-workspace.yaml`.
- Compatibility/build code: `hosting/scripts/connector-preview/protocol.mjs`, `hosting/vite.config.ts`, `hosting/scripts/vite/dependency-manifest.mjs`, `scripts-build-barcode.cjs`, `scripts-build-react.cjs`, `scripts-smoke-staging.mjs`.
- Tests: `tests/barcode-compatibility.cjs`, `tests/hosting-dependency-compatibility.cjs`.
- Rebuilt browser barcode, React and service-worker artifacts; the old hashed barcode-import chunk is replaced by the new generated chunk. Browser Supabase bundles remain the staging rebuilds from Phase B.
- Reports: this file, `docs/PHASE-B1-ADVISORY-TRIAGE.md`, `docs/PHASE-B1-BUNDLE-INVENTORY.json`; staging notes link this final result. Earlier Phase B reports remain historical.

No credentials, tokens, local environment files, dependency caches or local build directories are included in these changes. All work remains uncommitted on the staging branch.
