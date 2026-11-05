# Releasing to production (ChatGPT Sites)

Production is the ChatGPT Sites copy of this repository. A release ships **one exact commit of
`main`**, never individual files. When a release is done, the Sites source equals that commit,
except for build outputs (`public/react/`, `public/sw.js`), and the live site serves exactly what
that commit builds.

## 1. Before releasing

- The change is merged to `main` and CI is green.
- Note the full commit hash: `git rev-parse origin/main`.
- Note the Sites commit the last release produced. Each release report gives it.

## 2. Ship it (ChatGPT Work mode, in the Sites project)

Paste this prompt and fill in the two hashes:

> Release GitHub `PrasanthNammi/my-fitness-diary` commit `<COMMIT>` to this Site. Follow these
> steps exactly. If any step fails or doesn't match, stop, publish nothing, and report.
>
> 1. **Starting point.** The current Sites source commit must be `<PREVIOUS SITES COMMIT>`. If it
>    isn't, stop: someone changed Sites outside this process.
> 2. **Read the target.** Read the full recursive GitHub tree at `<COMMIT>`. It must not be
>    truncated.
> 3. **Make the Sites source identical to it.**
>    - Write every file whose git blob hash differs from GitHub, or that is missing in Sites,
>      using GitHub's exact bytes. Binary files must be written byte for byte.
>    - Don't edit, merge or reformat any file content yourself.
>    - Delete Sites files that aren't in the GitHub tree, except `public/react/**`,
>      `public/sw.js` and `node_modules/`. If anything else would be deleted, list it and stop.
> 4. **Check before building.** Compare blob hashes for every tracked file, excluding
>    `node_modules/`. Expected: 0 different, 0 only in GitHub, and only `public/react/**` and
>    `public/sw.js` only in Sites. If that's not the result, stop.
> 5. **Build and publish** as usual (`npm run build`).
> 6. **Report:**
>    - the new Sites commit and version;
>    - the step 4 counts;
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
- **Server code** (`hosting/worker/`) can't be checked by downloading files. Step 4's hash
  comparison covers it, and the script's sign-in and header checks exercise it.
