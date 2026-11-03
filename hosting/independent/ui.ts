// Shared look for the connector's server-rendered pages (sign-in, permissions, connections).
// Pages stay usable without script; one fixed <style> and <script> are allowed by hash only.

const STYLE = `
:root{--bg:#f5f6f8;--surface:#fff;--ink:#14213d;--ink-2:#47506a;--ink-3:#737b90;--line:#e1e4ea;--accent:#157a47;--accent-ink:#0e5a34;--accent-soft:#e5f3eb;--warn:#9a5b00;--warn-soft:#fff4df;--danger:#c2412b;--code:#eef0f4;--font:"Archivo",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,Menlo,Consolas,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0f1524;--surface:#18203a;--ink:#e9ecf4;--ink-2:#b7bdd0;--ink-3:#8a92aa;--line:#2b3553;--accent:#3fb47a;--accent-ink:#7fd9a9;--accent-soft:#16352a;--warn:#f0b65a;--warn-soft:#3a2c14;--danger:#f06a4f;--code:#222b47;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--font);padding:32px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left))}
main{max-width:460px;margin:0 auto;display:grid;gap:16px}
h1,h2,h3{margin:0;text-wrap:balance}
a{color:var(--accent-ink);font-weight:600}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:0 1px 2px rgb(20 33 61/.04),0 12px 32px rgb(20 33 61/.06);overflow:hidden}
.head{padding:22px 22px 18px;display:grid;gap:12px;border-bottom:1px solid var(--line)}
.head h1{font-size:21px;font-weight:700;line-height:1.25}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;color:var(--ink-2)}
.logo{width:52px;height:35px;color:var(--ink);flex:none}
.pair{display:flex;align-items:center;gap:10px}
.dots{width:48px;height:2px;background:repeating-linear-gradient(90deg,var(--line) 0 6px,transparent 6px 11px)}
.app{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none;background:var(--ink);color:var(--surface)}
.app.chatgpt{background:#10a37f;color:#fff}.app.claude{background:#d97757;color:#fff}.app.gemini{background:#5b7ff0;color:#fff}
.muted{font-size:13px;color:var(--ink-3);margin:0}
.chip{display:inline-block;background:var(--code);color:var(--ink-2);border-radius:999px;padding:2px 9px;font-weight:600;font-size:13px;overflow-wrap:anywhere}
.body{padding:6px 22px 4px}
.msg{padding:22px;display:grid;gap:12px}
.msg p{margin:0}
.msg h1{font-size:21px;font-weight:700}
.msg .btn{margin-top:4px}
fieldset{border:0;margin:0;padding:16px 0;border-bottom:1px solid var(--line);display:grid;gap:2px;min-width:0}
fieldset:last-child{border-bottom:0}
.ghead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}
.ghead h2{font-size:15px;font-weight:700;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
.pill{white-space:nowrap;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-ink)}
.pill.add{background:var(--warn-soft);color:var(--warn)}
.row{display:flex;align-items:center;gap:12px;padding:9px 6px;margin:0 -6px;border-radius:10px;cursor:pointer;position:relative}
.row:hover{background:var(--bg)}
.tick input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.box{width:22px;height:22px;border-radius:7px;border:1.5px solid var(--ink-3);display:grid;place-items:center;flex:none;position:relative;background:var(--surface)}
.box::after{content:"";width:6px;height:11px;border:solid #fff;border-width:0 2.4px 2.4px 0;transform:translateY(-1px) rotate(45deg);opacity:0}
.tick input:checked+.box,.tick input:indeterminate+.box{background:var(--accent);border-color:var(--accent)}
.tick input:checked+.box::after{opacity:1}
.tick input:indeterminate+.box::after{opacity:1;width:10px;height:0;border-width:0 0 2.4px 0;transform:none}
.tick input:focus-visible+.box{outline:2px solid var(--accent);outline-offset:2px}
.lbl{display:grid;min-width:0}.lbl b{font-weight:600}.lbl span{font-size:13px;color:var(--ink-3)}
.all{display:none;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--accent-ink);cursor:pointer;white-space:nowrap;position:relative}
.js .all{display:flex}
.all .box{width:18px;height:18px;border-radius:6px}.all .box::after{width:5px;height:9px}
.all input:indeterminate+.box::after{width:8px}
.note{margin:4px 22px 0;padding:12px 14px;border-radius:12px;background:var(--bg);font-size:13px;color:var(--ink-2);display:grid;gap:6px}
.note.warn{background:var(--warn-soft);color:var(--warn)}
.note p{margin:0}
.foot{padding:16px 22px 22px;display:grid;gap:10px}
.summary{font-size:13px;color:var(--ink-3);text-align:center;margin:0;min-height:20px}
.btns{display:grid;grid-template-columns:1fr 2fr;gap:10px}
.btn{font:700 15px var(--font);border-radius:12px;padding:12px 16px;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--ink);text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%}
.btns .primary{order:2}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.small{padding:7px 12px;font-size:13px;border-radius:10px;width:auto}
.btn.danger{color:var(--danger)}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.fields{display:grid;gap:12px}
.fields label{display:grid;gap:6px;font-size:13px;font-weight:600;color:var(--ink-2)}
.fields input{font:15px var(--font);padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);width:100%}
.fields input:focus{outline:2px solid var(--accent);outline-offset:0;border-color:transparent}
.or{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.conn{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)}
.conn:last-child{border-bottom:0}
.conn strong{display:block}
.conn .muted{display:block}
.actions{display:flex;flex-direction:column;gap:6px;align-items:stretch}
.tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.tag{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--code);color:var(--ink-2)}
.tag.add{background:var(--warn-soft);color:var(--warn)}
.empty{padding:18px 0;color:var(--ink-3);margin:0}
.picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.pick{border:1.5px solid var(--line);border-radius:14px;padding:12px 6px;display:grid;justify-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:14px;position:relative}
.setup>input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
#app-chatgpt:focus-visible~.picker .p-chatgpt,#app-claude:focus-visible~.picker .p-claude,#app-gemini:focus-visible~.picker .p-gemini{outline:2px solid var(--accent);outline-offset:2px}
.pick .app{width:34px;height:34px;border-radius:10px;font-size:13px}
.guide{display:none;gap:4px}
#app-chatgpt:checked~.guides .g-chatgpt,#app-claude:checked~.guides .g-claude,#app-gemini:checked~.guides .g-gemini{display:grid}
.setup{padding:18px 22px 6px;display:grid;gap:14px;position:relative}
#app-chatgpt:checked~.picker .p-chatgpt,#app-claude:checked~.picker .p-claude,#app-gemini:checked~.picker .p-gemini{border-color:var(--accent);background:var(--accent-soft)}
.copy{display:grid;gap:6px}
.copy>span{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.copyrow{display:flex;gap:8px}
.field{flex:1;min-width:0;display:grid;background:var(--code);border:1px dashed var(--line);border-radius:12px;padding:8px 12px;font-weight:600;font-size:14px}
.field small{font:12px var(--mono);color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.field input{font:12px var(--mono);color:var(--ink-3);background:none;border:0;padding:0;width:100%;min-width:0;text-overflow:ellipsis}
.copyrow .btn{display:none}.js .copyrow .btn{display:inline-flex}
.steps{list-style:none;margin:0;padding:0;counter-reset:s;display:grid}
.steps li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;padding-bottom:14px;position:relative;counter-increment:s}
.steps li::before{content:counter(s);width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:var(--code);color:var(--ink-2);position:relative;z-index:1}
.steps li:not(:last-child)::after{content:"";position:absolute;left:13.5px;top:30px;bottom:2px;width:1px;background:var(--line)}
.steps b{display:block;font-weight:600}.steps span{font-size:13px;color:var(--ink-3)}
.path{font:12px var(--mono);background:var(--code);padding:1px 6px;border-radius:6px;color:var(--ink-2);white-space:nowrap}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:999px;font-weight:600;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
.signout{display:flex;justify-content:center}
.linkbtn{background:none;border:0;color:var(--ink-3);font:600 13px var(--font);cursor:pointer;text-decoration:underline}
@media (max-width:420px){.btns{grid-template-columns:1fr}.conn{grid-template-columns:auto minmax(0,1fr)}.conn .actions{grid-column:1/-1;flex-direction:row}.conn .actions form{flex:1}.conn .actions .btn{width:100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const SCRIPT = `
document.documentElement.classList.add('js');
document.querySelectorAll('[data-timezone]').forEach(function(i){try{i.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){}});
document.querySelectorAll('form[data-consent]').forEach(function(form){
  var allow=form.querySelector('[value=approve]'),summary=form.querySelector('.summary'),groups=['read','add'];
  function boxes(g){return Array.prototype.slice.call(form.querySelectorAll('input[name=permission][data-group='+g+']'))}
  function sync(){
    var counts=groups.map(function(g){var b=boxes(g),n=b.filter(function(i){return i.checked}).length,all=form.querySelector('[data-all='+g+']');
      if(all){all.checked=n===b.length;all.indeterminate=n>0&&n<b.length}return [n,b.length]});
    var total=counts[0][0]+counts[1][0];allow.disabled=!total;
    if(summary)summary.textContent=total?'Can see '+counts[0][0]+' of '+counts[0][1]+' areas and add to '+counts[1][0]+' of '+counts[1][1]+'.':'Tick at least one item to allow access.';
  }
  form.addEventListener('change',function(e){var g=e.target.getAttribute('data-all');if(g)boxes(g).forEach(function(i){i.checked=e.target.checked});sync()});
  sync();
});
// Entry lists (undo review): select all, count on the submit button, disabled when nothing is ticked.
document.querySelectorAll('form[data-select]').forEach(function(form){
  var submit=form.querySelector('[data-submit]'),summary=form.querySelector('.summary'),all=form.querySelector('[data-all]');
  function boxes(){return Array.prototype.slice.call(form.querySelectorAll('input[name=entry]'))}
  function sync(){var b=boxes(),n=b.filter(function(i){return i.checked}).length;
    if(all){all.checked=n===b.length;all.indeterminate=n>0&&n<b.length}
    submit.disabled=!n;submit.textContent=n===b.length?'Remove all '+n:'Remove '+n+' selected';
    if(summary)summary.textContent=n?n+' of '+b.length+' will be removed. Nothing else changes.':'Tick at least one entry.'}
  form.addEventListener('change',function(e){if(e.target===all)boxes().forEach(function(i){i.checked=all.checked});sync()});
  sync();
});
var toastTimer;function toast(m){var t=document.querySelector('.toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show')},2200)}
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){
  var v=b.getAttribute('data-copy'),label=b.querySelector('span');
  function done(m){toast(m);if(label){label.textContent='Copied';setTimeout(function(){label.textContent='Copy'},2000)}}
  function fallback(){var i=document.getElementById(b.getAttribute('aria-controls'));if(i){i.focus();i.select()}toast('Link selected. Copy it with Ctrl+C or Cmd+C.')}
  if(navigator.clipboard)navigator.clipboard.writeText(v).then(function(){done('Link copied')},fallback);else fallback();
})});
document.querySelectorAll('form[data-confirm]').forEach(function(f){var armed=false,b=f.querySelector('button');f.addEventListener('submit',function(e){if(!armed){e.preventDefault();armed=true;b.textContent=f.getAttribute('data-confirm')}})});
`;

const LOGO = `<svg class="logo" viewBox="0 -64 340 228" role="img" aria-label="My Fitness Diary"><g transform="translate(166 50) scale(3.2) translate(-276 -73)"><path d="M276,40 C292,56 300,70 297,86 C294,99 286,106 276,106 C265,106 256,98 256,86 C256,75 262,68 266,60 C268,68 271,72 275,74 C278,63 279,52 276,40 Z" fill="#E8553A"/><path d="M277,72 C285,80 289,88 287,95 C285,101 281,104 277,104 C272,104 267,100 267,94 C267,88 271,84 274,80 C275,84 276,86 278,87 C279,82 279,77 277,72 Z" fill="#F2A900"/></g><polyline points="20,120 20,20 60,78 100,20 100,120" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><path d="M200,26 C190,8 168,10 162,32 L150,108 C145,128 132,132 124,120" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><circle cx="200" cy="26" r="12" fill="currentColor"/><circle cx="124" cy="120" r="11" fill="currentColor"/><line x1="134" y1="72" x2="202" y2="72" stroke="currentColor" stroke-width="10" stroke-linecap="round"/><rect x="172" y="54" width="10" height="36" rx="3" fill="currentColor"/><rect x="186" y="58" width="9" height="28" rx="3" fill="currentColor"/><path d="M240,20 L270,20 A50,50 0 0 1 270,120 L240,120 Z" fill="none" stroke="currentColor" stroke-width="22" stroke-linejoin="round"/></svg>`;

export const escape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const brand = `<div class="brand">${LOGO}<span>My Fitness Diary</span></div>`;
export const logo = LOGO;
// Known AI apps get their colour; any other app shows its first letter.
export function appBadge(name: string) {
  const n = name.toLowerCase(), kind = n.includes('chatgpt') || n.includes('openai') ? 'chatgpt' : n.includes('claude') ? 'claude' : n.includes('gemini') ? 'gemini' : '';
  const letter = kind === 'chatgpt' ? 'GPT' : escape((name.trim()[0] || '?').toUpperCase());
  return `<span class="app ${kind}" aria-hidden="true">${letter}</span>`;
}
// A complete page with only the content; status messages use the same card.
export function htmlPage(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escape(title)}</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><style>${STYLE}</style></head><body><main>${body}</main><div class="toast" role="status" aria-live="polite"></div><script>${SCRIPT}</script></body></html>`;
}
export const message = (text: string) => `<section class="card"><div class="head">${brand}</div><div class="msg">${text}</div></section>`;

let policy: Promise<string> | undefined;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const sha = async (text: string) => {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < b.length ? B64[n >> 6 & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return out;
};
// CSP sources that allow exactly this page style and script, nothing else.
export function uiPolicy() {
  return policy ??= Promise.all([sha(STYLE), sha(SCRIPT)]).then(([s, j]) => `style-src 'sha256-${s}'; script-src 'sha256-${j}'; img-src 'self'`);
}
