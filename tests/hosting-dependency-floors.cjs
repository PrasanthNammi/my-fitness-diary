// Security floors for the Sites server's dependencies (hosting/). Every resolved copy of these packages in
// hosting/pnpm-lock.yaml must be at or above the first patched release of its line, so a lockfile refresh
// or a new dependency can't quietly bring a known-vulnerable version back. Floors come from `pnpm audit`.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

// package -> list of [line, floor]: versions on that line (major, or 0.minor) must be >= floor.
const FLOORS = {
  next: [['16', '16.4.1']],
  'eslint-config-next': [['16', '16.4.1']],
  react: [['19', '19.2.8']],
  'react-dom': [['19', '19.2.8']],
  'react-server-dom-webpack': [['19', '19.2.8']],
  vite: [['8', '8.1.6']],
  zod: [['3', '4.6.6'], ['4', '4.6.6']], // zod 3 is not allowed at all
  sharp: [['0.35', '0.35.5'], ['0.34', '0.35.5'], ['0.33', '0.35.5']],
  '@babel/core': [['7', '7.29.6']],
  'baseline-browser-mapping': [['2', '2.11.0']],
  'brace-expansion': [['1', '1.1.21'], ['2', '5.0.12'], ['5', '5.0.12']],
  browserslist: [['4', '4.28.7']],
  esbuild: [['0.18', '0.25.0'], ['0.24', '0.25.0'], ['0.28', '0.28.1']],
  'fast-uri': [['3', '3.1.9']],
  fflate: [['0.7', '0.7.5']],
  'image-size': [['2', '2.0.3']],
  'js-yaml': [['4', '4.3.2']],
  minimatch: [['7', '11.0.1'], ['8', '11.0.1'], ['9', '11.0.1'], ['10', '11.0.1'], ['11', '11.0.1']],
  satori: [['0', '0.33.5']],
  'source-map-js': [['1', '1.2.2']],
  undici: [['7', '7.30.1']],
  ws: [['8', '8.21.0']],
};

const parse = (v) => v.split(/[-+]/)[0].split('.').map(Number);
const cmp = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const lineOf = (v) => { const [maj, min] = parse(v); return maj === 0 ? `0.${min}` : String(maj); };

const lock = readFileSync('hosting/pnpm-lock.yaml', 'utf8');
const section = lock.slice(lock.indexOf('\npackages:'), lock.indexOf('\nsnapshots:'));
const resolved = {};
for (const m of section.matchAll(/^ {2}'?((?:@[^/@\s]+\/)?[^@\s']+)@(\d[^:'\s(]*)'?:/gm)) (resolved[m[1]] ??= new Set()).add(m[2]);

const problems = [];
for (const [name, floors] of Object.entries(FLOORS)) {
  for (const v of resolved[name] ?? []) {
    const rule = floors.find(([line]) => line === lineOf(v));
    // Only the lines listed are affected by the advisories; other lines (e.g. minimatch 3) are not covered.
    if (rule && cmp(v, rule[1]) < 0) problems.push(`${name}@${v}`);
  }
}
// Sanity: the parser really found the packages (an empty match would make the check pass vacuously).
for (const name of ['next', 'vite', 'react', 'undici', 'ws']) assert.ok(resolved[name]?.size, `lockfile has ${name}`);

// esbuild 0.27.3 is pinned by wrangler for bundling; its only advisory is a Windows-only dev-server file read.
const allowed = new Set(['esbuild@0.27.3']);
assert.deepEqual(problems.filter((p) => !allowed.has(p)), [], 'packages below their security floor');
console.log(`PASS hosting dependency floors: ${Object.keys(FLOORS).length} packages checked in hosting/pnpm-lock.yaml`);
