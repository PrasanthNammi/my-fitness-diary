// Prepares MFD's download site (the `mfd-downloads` Worker: static files only) with a new Android APK.
//   node scripts-publish-android.cjs <apk> [--staging]
// Then deploy it with the command this prints. The app updates itself from this site (android/.../Updater.kt):
// it trusts only this address, and checks the size, SHA-256, package, version and signing key of what it downloads.
// This script refuses an APK that isn't MFD, isn't signed with MFD's release key, or isn't newer than the last one.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os'), { execFileSync } = require('child_process');

const RELEASE_CERT = 'ef6de021cc764f588caf1c86ed05c5df5e2835be0335c26cb386f95ad1a6c113'; // android/README.md
const args = process.argv.slice(2), staging = args.includes('--staging'), apk = args.find((a) => !a.startsWith('--'));
if (!apk || !fs.existsSync(apk)) { console.error('usage: node scripts-publish-android.cjs <apk> [--staging]'); process.exit(2); }

const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
const tools = path.join(sdk, 'build-tools'), latestTools = fs.readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
const run = (tool, ...a) => execFileSync(path.join(tools, latestTools, tool), a, { encoding: 'utf8' });

const badging = run('aapt2', 'dump', 'badging', apk);
const m = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m.exec(badging);
if (!m) throw Error('Not an Android app: ' + apk);
const [, pkg, codeText, version] = m, versionCode = Number(codeText);
if (pkg !== 'site.mfd.app') throw Error(`Not MFD: ${pkg}`);
if (!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(version)) throw Error(`Unexpected version name: ${version}`);
const certs = [...run('apksigner', 'verify', '--print-certs', apk).matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/g)].map((x) => x[1]);
if (certs.length !== 1 || certs[0] !== RELEASE_CERT) throw Error('Not signed with the MFD release key (a debug build?)');

const root = path.join('.sites-runtime', staging ? 'downloads-staging' : 'downloads'), dir = path.join(root, 'public', 'android');
fs.mkdirSync(dir, { recursive: true });
const latestFile = path.join(dir, 'latest.json');
const previous = fs.existsSync(latestFile) ? JSON.parse(fs.readFileSync(latestFile, 'utf8')) : null;
if (previous && versionCode <= previous.versionCode) throw Error(`versionCode ${versionCode} is not newer than the published ${previous.versionCode}`);

const bytes = fs.readFileSync(apk), sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const name = `MyFitnessDiary-${version}.apk`, target = path.join(dir, name);
// Published files never change under the same name (they are cached as immutable).
if (fs.existsSync(target) && crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== sha256) throw Error(`${name} is already published with other contents`);
fs.writeFileSync(target, bytes);
fs.writeFileSync(latestFile, JSON.stringify({ version, versionCode, size: bytes.length, sha256, apk: '/android/' + name }, null, 2) + '\n');
// Keep the newest three APKs (someone may be mid-download of the previous one).
const apks = fs.readdirSync(dir).filter((f) => f.endsWith('.apk')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
for (const old of apks.slice(3)) fs.rmSync(path.join(dir, old));

fs.writeFileSync(path.join(root, 'public', '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Strict-Transport-Security: max-age=31536000
  Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
/android/latest.json
  Cache-Control: no-cache
/android/*.apk
  Content-Type: application/vnd.android.package-archive
  Content-Disposition: attachment
  Cache-Control: public, max-age=31536000, immutable
`);
fs.writeFileSync(path.join(root, 'wrangler.json'), JSON.stringify({
  name: staging ? 'mfd-downloads-staging' : 'mfd-downloads', compatibility_date: '2026-10-12',
  workers_dev: true, preview_urls: false, assets: { directory: './public', not_found_handling: 'none' },
}, null, 2) + '\n');
console.log(`${name}: version ${version} (versionCode ${versionCode}), ${bytes.length} bytes, sha256 ${sha256}, signed with the MFD release key`);
console.log(`Deploy: cd hosting && npx wrangler deploy --config ../${root}/wrangler.json`);
