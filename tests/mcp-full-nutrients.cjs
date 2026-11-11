// database/mcp-full-nutrients.sql (the upgrade for existing projects) must carry exactly the current
// mfd_mcp.analyze and mfd_mcp.add_entry from database/mcp-connector-v2.sql, so both paths end up the same.
const assert = require('node:assert/strict'), fs = require('node:fs');
const fn = (s, name) => { const i = s.indexOf(`create or replace function mfd_mcp.${name}(`); assert.ok(i >= 0, name); const a = s.indexOf('$$', i) + 2; return s.slice(i, s.indexOf('$$;', a) + 3); };
const v2 = fs.readFileSync('database/mcp-connector-v2.sql', 'utf8'), up = fs.readFileSync('database/mcp-full-nutrients.sql', 'utf8');
for (const name of ['analyze', 'add_entry']) assert.equal(fn(up, name), fn(v2, name), `${name} matches mcp-connector-v2.sql`);
assert.match(up, /^begin;$/m); assert.match(up, /^commit;$/m);
for (const k of ["'fiber'", "'sugar'", "'saturates'", "'salt'", "'fibre_g'"]) assert.ok(fn(up, 'add_entry').includes(k) || fn(up, 'analyze').includes(k), k);
console.log('PASS full-nutrients upgrade: same analyze and add_entry as mcp-connector-v2.sql, one transaction');
