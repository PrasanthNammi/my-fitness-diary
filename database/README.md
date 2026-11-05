# Forma workspace backend

Supabase project: djyozltkmbzhwuvemxuy (Frankfurt, eu-central-1).
Remote migration: forma_private_workspaces.

The initial cloud storage unit is a complete versioned workspace JSON document. This preserves imported per-set data and unknown CSV fields without lossy normalization. Fine-grained workout/food tables can be migrated later without changing the browser export format.

`public.forma_workspaces`: user_id UUID primary key references auth.users, payload JSONB (object, at most 8 MB), revision BIGINT, updated_at TIMESTAMPTZ.

All four row-level security policies compare auth.uid() with user_id. Anonymous roles have no table grants. `forma_save_workspace(document, expected_revision)` is SECURITY INVOKER with an empty search_path. It derives user_id from auth.uid(), and rejects stale revisions with SQLSTATE PT409 (HTTP 409; never 40001, which triggers PostgREST transaction retries). It is executable only by authenticated users. The browser contains only the publishable key. No service role credentials or LLM keys are present.

Verified using two synthetic users inside a rolled-back SQL transaction: owner read, other-user read/update denial, and stale-save rejection. No test accounts remain. Supabase security advisor reported no findings.

# Required dashboard configuration

Authentication > URL Configuration:
- Site URL: https://prasanth-nammi-portfolio.paleriver512.chatgpt.site
- Additional redirect URL: https://prasanth-nammi-portfolio.paleriver512.chatgpt.site/

Authentication > Sign In / Providers > Google:
- Create a Google Web OAuth client in the owner's Google Cloud account.
- Authorized Google redirect URI: https://djyozltkmbzhwuvemxuy.supabase.co/auth/v1/callback
- Store its client ID and client secret in Supabase's Google provider settings, never in repository files.

The frontend checks public auth settings and enables Google only when configured. Email signups require confirmation; the default Supabase email service has delivery restrictions, so custom SMTP may be needed for the friend's address. Do not disable confirmation just to bypass delivery restrictions.

# Client build

npm ci
npm run build:client

SDK version and bundler are pinned in package-lock.json. The bundled browser SDK is committed to public/vendor, including its license. All other source files are buildless scripts.

# Local/cloud migration

Browser data is not uploaded automatically. After signing in to an empty account, select Upload my browser data or Start empty. Confirm the signed-in email first. Successful upload removes the old shared guest copy while retaining an account-specific cache. Sign-out shows a fresh empty workspace. Unsynced revisions remain in that account's cache. Conflicting saves require an explicit reload; a recovery copy is kept locally, and export is offered.

The site remains owner-private in Sites; inviting another visitor is a separate access change. Hevy is read-only, and there are no Hevy API calls in this backend.
