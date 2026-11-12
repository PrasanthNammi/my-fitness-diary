// Builds the release bundle for ChatGPT Sites: a zip holding the exact bytes of every file that
// changed between the last released commit and the commit being released, plus a MANIFEST.
// ChatGPT's GitHub reader can't move binary files, so files travel in the zip, and GitHub is
// only used to check hashes. The Android app project (android/) never goes to Sites: the website doesn't use it,
// and ChatGPT's upload refuses zips holding its build tools (gradle-wrapper.jar, gradlew.bat).
//   node scripts-release-bundle.cjs <last released commit> <commit to release> [output dir]
// For a first release with no released base commit, pass `--paths <file>` instead of the base
// commit; the file lists the paths to include, one per line.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const [a, b, c, d] = process.argv.slice(2);
const fromList = a === '--paths';
const base = fromList ? null : a, target = fromList ? c : b, outDir = (fromList ? d : c) || path.join(os.homedir(), 'Downloads');
if (!target || (fromList && !b)) { console.error('usage: node scripts-release-bundle.cjs <base commit> <target commit> [output dir]\n   or: node scripts-release-bundle.cjs --paths <list file> <target commit> [output dir]'); process.exit(2); }

const commit = git('rev-parse', '--verify', target + '^{commit}');
const forSites = (p) => !p.startsWith('android/');
const tree = new Map(git('ls-tree', '-r', '--full-tree', commit).split('\n').filter(Boolean).map((l) => { const [meta, p] = l.split('\t'); return [p, meta.split(' ')[2]]; }));
let changed, deleted = [];
if (fromList) {
  changed = fs.readFileSync(b, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  const missing = changed.filter((p) => !tree.has(p));
  if (missing.length) { console.error('Not in ' + commit + ':\n' + missing.join('\n')); process.exit(1); }
} else {
  const baseCommit = git('rev-parse', '--verify', base + '^{commit}');
  if (!git('rev-list', commit).split('\n').includes(baseCommit)) { console.error(`${base} is not an ancestor of ${target}`); process.exit(1); }
  const lines = git('diff', '--name-status', '--no-renames', baseCommit, commit).split('\n').filter(Boolean).map((l) => l.split('\t'));
  changed = lines.filter(([s]) => s !== 'D').map(([, p]) => p).filter(forSites);
  deleted = lines.filter(([s]) => s === 'D').map(([, p]) => p).filter(forSites);
}

const name = `mfd-release-${commit.slice(0, 7)}`, zip = path.join(outDir, name + '.zip');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mfd-bundle-'));
const manifest = [
  `# MFD release bundle`, ``, `Commit: ${commit}`, base ? `Base (last released commit): ${git('rev-parse', base)}` : `Base: explicit path list`,
  `Never in Sites: ${[...tree.keys()].filter((p) => !forSites(p)).length} file(s) under android/ (the Android app project) stay only in GitHub.`, ``,
  `## Write these files (path, git blob hash)`, ``, ...changed.map((p) => `${p}\t${tree.get(p)}`), ``,
  `## Delete these files`, ``, ...(deleted.length ? deleted : ['(none)']), ``,
].join('\n');
fs.rmSync(zip, { force: true });
if (changed.length) execFileSync('git', ['archive', '--format=zip', '-0', '-o', zip, commit, '--', ...changed]);
fs.writeFileSync(path.join(work, 'MANIFEST.txt'), manifest);
execFileSync('zip', ['-q', '-0', zip, 'MANIFEST.txt'], { cwd: work });
fs.rmSync(work, { recursive: true, force: true });

// Prove the zip holds exactly the right bytes: unpack it and hash every file the way git does.
const check = fs.mkdtempSync(path.join(os.tmpdir(), 'mfd-bundle-check-'));
execFileSync('unzip', ['-q', zip, '-d', check]);
for (const p of changed) {
  const got = git('hash-object', path.join(check, p));
  if (got !== tree.get(p)) { console.error(`Bundle check failed for ${p}: ${got} != ${tree.get(p)}`); process.exit(1); }
}
fs.rmSync(check, { recursive: true, force: true });
console.log(`${zip}\n${changed.length} file(s) to write, ${deleted.length} to delete; every file's hash checked against ${commit.slice(0, 7)}`);
