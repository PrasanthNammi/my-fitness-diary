#!/bin/zsh
# C.1C: ONE approved upload of the exact reviewed CPU candidate to mfd-connect-staging. Requires --execute-approved.
# Hash-gated; unchanged config; no rebuild, retry or rollback. Wrangler output goes to a 0600 file and only the
# version line is printed (logs may contain keys). The local deploy path is restored to the preserved bundle afterwards.
set -u
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
node=/Users/prasanthnammi/.npm/_npx/6437e47ea30ab26b/node_modules/node/bin/node
candidate="$root/.sites-runtime/c1c-engineering/release/colocated-worker.proposed.js"
config="$root/.sites-runtime/c1b-release/wrangler.json"
deploy_path="$root/.sites-runtime/independent/colocated-worker.js"
preserved="$root/.sites-runtime/c1c-final/preserved-colocated-worker.js"
log="$root/.sites-runtime/c1c-final/deploy.log"
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
stop() { echo "STOP $1; no retry or rollback"; exit 1; }
wrangler() { (cd "$root/hosting" && "$node" --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js "$@"); }

[[ "${1:-}" == "--execute-approved" ]] || { echo "plan only: candidate 05b1811e… config e0f45c65… replaces active dcfcac5d…"; exit 0; }
[[ "$("$node" -v)" == "v22.13.1" ]] || stop NODE
[[ "$(sha "$candidate")" == 05b1811e2f09042faf36f405241439d78c9c0fefbe8dc2279d635dfe0d19f9f0 ]] || stop CANDIDATE_HASH
[[ "$(sha "$config")" == e0f45c65bcf45ad226e1811f42e27ef73afe8f7aa985f9077a7af79a52376cf5 ]] || stop CONFIG_HASH
[[ "$(sha "$deploy_path")" == 0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e ]] || stop PRESERVED_HASH
[[ -e "$root/.sites-runtime/c1c-final/deploy.lock" ]] && stop ALREADY_ATTEMPTED
status="$(wrangler deployments status --name mfd-connect-staging 2>/dev/null)"
[[ "$status" == *"(100%) dcfcac5d-88d2-4432-a262-e288f05f31e4"* ]] || stop ACTIVE_VERSION_DRIFT

cp -p "$deploy_path" "$preserved" || stop PRESERVE_COPY
[[ "$(sha "$preserved")" == 0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e ]] || stop PRESERVE_COPY
echo "one approved attempt $(date -u +%FT%TZ)" > "$root/.sites-runtime/c1c-final/deploy.lock"
cp "$candidate" "$deploy_path"
[[ "$(sha "$deploy_path")" == 05b1811e2f09042faf36f405241439d78c9c0fefbe8dc2279d635dfe0d19f9f0 ]] || { cp -p "$preserved" "$deploy_path"; stop STAGE_HASH; }

wrangler deploy --config ../.sites-runtime/c1b-release/wrangler.json --no-bundle --no-autoconfig > "$log" 2>&1
code=$?
cp -p "$preserved" "$deploy_path"
[[ "$(sha "$deploy_path")" == 0fa8494be295161791191dd6c0738f16bdb80060d03ec773f78cd4f8656fc19e ]] || echo "WARN local deploy path not restored"
grep -E "Current Version ID" "$log" | sed -E 's/.*Current Version ID: *//' | head -1 | sed 's/^/version=/'
grep -qiE "upgrade|billing|payment|subscription" "$log" && echo "NOTE billing wording present in log; review before proceeding"
[[ $code -eq 0 ]] || stop DEPLOY_EXIT_$code
echo "DEPLOY_SUBMITTED"
