// Proves the live site serves exactly what this checkout builds.
// Run after `npm run build`:  node scripts-verify-release.cjs [site origin]
// Checks every asset the service worker lists (app code, legacy engine, media),
// the service worker itself, sign-in redirects and security headers. Read-only.
const fs = require('fs'), crypto = require('crypto');
const SITE = (process.argv[2] || 'https://prasanth-nammi-portfolio.shanustylish777.chatgpt.site').replace(/\/$/, '');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// Cloudflare's bot protection adds one challenge script to HTML at the edge; it is not ours.
const withoutEdgeScript = (path, b) => path.endsWith('.html') ? Buffer.from(b.toString().replace(/<script>\(function\(\)\{function c\(\)\{[^<]*__CF\$cv\$params[^<]*<\/script>/, '')) : b;
const problems = [];

async function get(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(SITE + path, { cache: 'no-store', redirect: 'manual' });
      return { status: r.status, headers: r.headers, body: Buffer.from(await r.arrayBuffer()) };
    } catch (e) { if (attempt === 3) throw e; await new Promise((ok) => setTimeout(ok, 1000 * attempt)); }
  }
}

(async () => {
  const sw = fs.readFileSync('public/sw.js'), assets = JSON.parse(sw.toString().match(/const ASSETS=(.*);/)[1]);
  const files = ['/sw.js', ...assets.filter((a) => a !== '/sw.js')];
  let next = 0, same = 0;
  async function worker() {
    while (next < files.length) {
      const path = files[next++], local = fs.readFileSync('public' + path), live = await get(path);
      if (live.status !== 200) problems.push(`${path}: HTTP ${live.status}`);
      else if (sha(withoutEdgeScript(path, live.body)) !== sha(local)) problems.push(`${path}: live content differs from this build`);
      else same++;
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  // Sign-in must send people back to the production site, never anywhere else.
  const oauth = await fetch(SITE + '/api/auth/oauth', { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json' }, body: '{}' });
  const redirect = oauth.ok ? new URL((await oauth.json()).url).searchParams.get('redirect_to') : null;
  if (redirect !== SITE + '/') problems.push(`sign-in redirect is ${redirect ?? 'HTTP ' + oauth.status}, expected ${SITE}/`);
  const forged = await fetch(SITE + '/api/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  if (forged.status !== 403) problems.push(`cross-site sign-in returned ${forged.status}, expected 403`);
  const home = await get('/');
  for (const h of ['content-security-policy', 'strict-transport-security', 'x-content-type-options'])
    if (!home.headers.get(h)) problems.push(`home page is missing the ${h} header`);

  console.log(`${SITE}\n${same}/${files.length} files identical to this build`);
  if (problems.length) { console.log(`${problems.length} problem(s):\n- ` + problems.join('\n- ')); process.exit(1); }
  console.log('PASS live site matches this build; sign-in and security headers OK');
})().catch((e) => { console.error(e); process.exit(1); });
