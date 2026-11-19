#!/usr/bin/env bash
# Opens an MFD backup from Google Drive ("MFD backups/mfd-backup-YYYY-MM-DD.json.gpg") on the owner's Mac.
# Needs the private backup key in GnuPG and its passphrase in the Keychain ("MFD backup key"), both made on
# 2026-11-19. Writes the plain backup next to the file (…json) and prints a short summary.
# Usage: scripts/backup-open.sh ~/Downloads/mfd-backup-2026-11-23.json.gpg
set -euo pipefail
in="${1:?Usage: scripts/backup-open.sh <mfd-backup-…json.gpg>}"
out="${in%.gpg}"
pass="$(security find-generic-password -s 'MFD backup key' -a mfd-backups -w)"
gpg --batch --quiet --yes --pinentry-mode loopback --passphrase "$pass" --output "$out" --decrypt "$in"
unset pass
node -e '
const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
console.log(`${process.argv[1]}: ${b.format}, made ${b.created_at}`);
for (const [t, rows] of Object.entries(b.tables)) if (rows.length) console.log(`  ${t.padEnd(40)} ${rows.length}`);
' "$out"
echo "This file holds everyone's diaries unlocked: delete it when you are done."
