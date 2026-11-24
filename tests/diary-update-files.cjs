// Every database update file (scripts-diary-update.cjs) ends with a report the Supabase SQL editor can show: the
// editor may run the last query again to display it, so that query must only read permanent things (no scratch
// tables such as diary._update10_before, which the script drops) and must be the last statement before commit.
const assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync } = require('node:fs'), path = require('node:path'), os = require('node:os');
const dir = mkdtempSync(path.join(os.tmpdir(), 'mfd-updates-'));
let n = 0;
for (let u = 1; ; u++) {
  const file = path.join(dir, `u${u}.sql`);
  try { execFileSync(process.execPath, ['scripts-diary-update.cjs', String(u), file], { stdio: 'pipe' }); } catch { break; }
  const sql = readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
  const statements = sql.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
  assert.equal(statements.at(-1), 'commit', `update ${u}: ends with commit`);
  const report = statements.at(-2);
  assert.match(report, /^select\b/i, `update ${u}: the last statement before commit is the report (a select)`);
  const scratch = [...sql.matchAll(/create table (?:if not exists )?([\w.]+) as/gi)].map((m) => m[1]);
  for (const t of scratch) {
    assert.ok(!report.includes(t), `update ${u}: the report must not read the scratch table ${t}`);
    assert.match(sql, new RegExp(`drop table (if exists )?${t.replace('.', '\\.')};[\\s\\S]*select`, 'i'), `update ${u}: ${t} is dropped before the report`);
  }
  n++;
}
assert.ok(n >= 11, 'all updates generated');
console.log(`PASS update files: ${n} updates end with a report that reads only permanent things (scratch tables dropped first), then commit`);
