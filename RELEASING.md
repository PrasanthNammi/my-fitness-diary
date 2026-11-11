# Releasing to production (ChatGPT Sites)

Production is the ChatGPT Sites copy of this repository. A release ships **one exact commit of
`main`**, never individual files. When a release is done, the Sites source equals that commit,
except for build outputs (`public/react/`, `public/sw.js`), and the live site serves exactly what
that commit builds.

## 1. Before releasing

- The change is merged to `main` and CI is green.
- Note the full commit hash: `git rev-parse origin/main`.
- Note the last released commit and the Sites commit it produced. Each release report gives both.
- Build the release bundle:
  `node scripts-release-bundle.cjs <last released commit> <commit>`.
  It writes `~/Downloads/mfd-release-<commit>.zip`, containing the exact bytes of every changed
  file and a `MANIFEST.txt`, and checks each file's hash before finishing. The bundle is needed
  because ChatGPT's GitHub reader can't move binary files (images, GIFs); GitHub is only used
  to check hashes.

## 2. Ship it (ChatGPT Work mode, in the Sites project)

Attach the bundle zip. Paste this prompt and fill in the hashes:

> Release GitHub `PrasanthNammi/my-fitness-diary` commit `<COMMIT>` to this Site, using the
> attached bundle `mfd-release-<short commit>.zip`. Follow these steps exactly. If any step fails
> or doesn't match, stop, publish nothing, and report.
>
> 1. **Starting point.** The current Sites source commit must be `<PREVIOUS SITES COMMIT>`, with
>    a clean checkout. If it isn't, stop: someone changed Sites outside this process.
> 2. **Read the target.** Read the full recursive GitHub tree at `<COMMIT>` (paths and blob
>    hashes only). It must not be truncated.
> 3. **Check the bundle.** Unzip it to a temporary folder. `MANIFEST.txt` must name `<COMMIT>`.
>    Every file it lists under "Write" must be in the zip, and `git hash-object` of each must
>    equal both the hash in `MANIFEST.txt` and the GitHub tree's hash for that path.
> 4. **Apply it.**
>    - Copy each "Write" file from the zip into the Sites source, byte for byte (binary-safe
>      copy; never decode as text).
>    - Delete each file listed under "Delete".
>    - Don't edit, merge or reformat any file content yourself.
> 5. **Check before building.** Compare blob hashes for every tracked Sites file against the
>    GitHub tree, excluding `node_modules/`. Expected: 0 different, 0 only in GitHub, and only
>    `public/react/**` and `public/sw.js` only in Sites. If that's not the result, stop, and first
>    put the checkout back to the starting commit (`git checkout -- .` and delete the files the
>    bundle added), so the next attempt starts clean.
> 6. **Build and publish** as usual (`npm run build`).
> 7. **Report:**
>    - the new Sites commit and version;
>    - the step 5 counts;
>    - the build result;
>    - the live `/sw.js` version string (`const CACHE=...`).

## 3. Prove it is live (on your computer)

```sh
git checkout <COMMIT> && npm ci && npm run build
node scripts-verify-release.cjs
```

The script downloads every file the app's service worker lists (app code, legacy engine and all
exercise media), plus the service worker itself, and compares each one with this build. It also
checks that:
- sign-in redirects back to the production site;
- cross-site sign-in is refused;
- the security headers are present.

It changes nothing. It must end with `PASS`. The one thing it ignores is the bot-protection script
Cloudflare adds to HTML pages.

## Rules

- **Never change files directly in Sites.** Every change goes through a GitHub PR, then a release.
- **Fixing a broken release:** release the previous good commit with the same prompt, then fix
  forward on GitHub.
- **Server code** (`hosting/worker/`) can't be checked by downloading files. Step 5's hash
  comparison covers it, and the script's sign-in and header checks exercise it.

## Known step 5 difference: `hosting/pnpm-workspace.yaml`

The Sites installer (`hosting/scripts/install-pnpm.sh`) rewrites `storeDir` and `cacheDir` in
this file on every install. It writes the plain `.sites-runtime/pnpm-store` path, or a
`${SITES_PNPM_SHARED_STORE:-…}` placeholder when the Sites session has a shared package store,
and Sites saves the result with the release. The next release can then stop at step 5 with
this one file differing.

1. Ask ChatGPT (read-only) for the file's diff in the current Sites commit.
2. If **only** the `storeDir` and `cacheDir` lines differ, copy the Sites version into GitHub
   through a PR. Both values point to the same folder unless a shared store is set. Then
   rebuild the bundle and release again.
3. If anything else differs (for example the `overrides` security floors), stop and find out why.

This happened after v67 (Sites `76d695ef`, plain path); fixed in GitHub before v68.
