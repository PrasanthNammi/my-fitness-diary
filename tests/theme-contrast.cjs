// Every text/background pair the app uses meets WCAG AA (4.5:1) in light and in dark mode.
// Reads the real tokens from frontend/styles.css, resolving var() references.
const fs=require('fs'),assert=require('node:assert/strict');
const css=fs.readFileSync('frontend/styles.css','utf8');
const block=sel=>{const i=css.indexOf(sel+' {');assert.ok(i>=0,'missing '+sel);return css.slice(i,css.indexOf('\n}',i))};
const parse=text=>Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
// Every :root rule in the file counts, in order (a later one overrides an earlier one).
const rootRules=[...css.matchAll(/(?:^|[}\s]):root\s*\{([^}]*)\}/g)].map(m=>m[1]);
const light=Object.assign({},...rootRules.map(parse)),dark={...light,...parse(block(':root[data-theme="dark"]'))};
// No token may be defined through a loop (a -> b -> a makes both invalid in the browser).
for(const tokens of [light,dark])for(const name of Object.keys(tokens)){const seen=new Set();let n=name;while(true){const ref=/^var\((--[\w-]+)\)$/.exec(tokens[n]||'');if(!ref)break;assert.ok(!seen.has(ref[1]),'token loop through '+name);seen.add(n);n=ref[1]}}
function value(tokens,name,depth=0){const v=tokens[name];assert.ok(v,'unknown token '+name);const ref=/^var\((--[\w-]+)\)$/.exec(v);if(ref){assert.ok(depth<5);return value(tokens,ref[1],depth+1)}return v}
function lum(hex){const h=hex.replace('#','');assert.match(h,/^[0-9a-f]{6}$/i,'expected #rrggbb, got '+hex);const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05)};
const surfaces=['--bg','--surface','--surface-2'];
const pairs=[
 ...['--text','--ink','--ink-2','--muted','--accent','--danger','--warn','--success-text','--water-text','--pr-text','--warmup-text','--drop-text','--superset','--ai-text'].flatMap(t=>surfaces.map(s=>[t,s])),
 ['--on-accent','--accent'],['--on-ink','--ink'],['--text','--surface-3'],
 ['--accent-ink','--accent-soft'],['--danger','--danger-soft'],['--warn','--warn-soft'],['--superset','--superset-soft'],['--pr-text','--pr-soft'],['--ai-text','--ai-soft'],['--water-text','--water-soft'],['--warmup-text','--warmup-soft'],['--drop-text','--drop-soft'],['--success-text','--success-soft'],
];
const failures=[];let worst=99,checked=0;
for(const [mode,tokens] of [['light',light],['dark',dark]])for(const [fg,bg] of pairs){const r=ratio(value(tokens,fg),value(tokens,bg));checked++;worst=Math.min(worst,r);if(r<4.5)failures.push(`${mode}: ${fg} on ${bg} = ${r.toFixed(2)}`)}
assert.deepEqual(failures,[],'contrast below 4.5:1:\n'+failures.join('\n'));
// Brand orange on cards/background stays a visible shape (3:1 for graphics).
for(const [mode,tokens] of [['light',light],['dark',dark]])assert.ok(ratio(value(tokens,'--brand'),value(tokens,'--surface'))>=2.5,mode+' brand barely visible');
console.log(`PASS theme contrast: ${checked} text/background pairs in light and dark all at least 4.5:1 (lowest ${worst.toFixed(2)})`);
