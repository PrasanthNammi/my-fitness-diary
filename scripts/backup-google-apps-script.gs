// MFD weekly backup → Google Drive (Google Apps Script, in the owner's Google account).
//
// Every Sunday the database builds a locked (encrypted) backup (database/backup/backup.sql). This script fetches the
// newest one and saves it in the Drive folder "MFD backups", keeping the last 12. It can only fetch locked files:
// opening one needs the private key on the owner's Mac (scripts/backup-open.sh).
//
// Setup (once): script.google.com → New project → paste this file → Project Settings → Script properties:
//   MFD_URL    https://djyozltkmbzhwuvemxuy.supabase.co
//   MFD_KEY    the project's publishable key (sb_publishable_…; public, also in the app)
//   MFD_TOKEN  the backup token (Mac Keychain "MFD backup token")
// Then run setup() once and allow access to Drive and external requests. If a run fails, Google emails the owner.

function backupMfd() {
  const p = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(p.getProperty('MFD_URL') + '/rest/v1/rpc/mfd_backup_latest', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {apikey: p.getProperty('MFD_KEY')},
    payload: JSON.stringify({token: p.getProperty('MFD_TOKEN')}),
  });
  if (res.getResponseCode() !== 200) throw new Error('MFD backup: fetch failed (' + res.getResponseCode() + ') ' + res.getContentText().slice(0, 200));
  const b = JSON.parse(res.getContentText());
  if (!b || !b.data) throw new Error('MFD backup: no backup has been made yet');
  const days = (Date.now() - Date.parse(b.created_at)) / 864e5;
  if (days > 8) throw new Error('MFD backup: the newest backup is ' + Math.round(days) + ' days old; the weekly database job may have stopped');
  const folder = folderNamed('MFD backups');
  const name = 'mfd-backup-' + b.created_at.slice(0, 10) + '.json.gpg';
  if (!folder.getFilesByName(name).hasNext()) folder.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), 'application/pgp-encrypted', name));
  // Keep the newest 12 (names sort by date).
  const files = [], it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^mfd-backup-\d{4}-\d{2}-\d{2}\.json\.gpg$/.test(f.getName())) files.push(f); }
  files.sort((x, y) => y.getName().localeCompare(x.getName())).slice(12).forEach((f) => f.setTrashed(true));
  console.log('Saved ' + name + ' (' + b.tables + ' tables, ' + b.rows + ' rows)');
}

function folderNamed(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/** Run once: a weekly trigger on Sunday morning (the database builds the backup at 01:00 UTC), then a first backup now. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupMfd').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).create();
  backupMfd();
}
