// Shared look for the connector's server-rendered pages (sign-in, permissions, connections).
// Pages stay usable without script; one fixed <style> and <script> are allowed by hash only.

const STYLE = `
:root{--bg:#f6f5f2;--surface:#fff;--surface-2:#efede8;--ink:#15140f;--ink-2:#45423b;--ink-3:#6b6860;--faint:#a7a39a;--line:#e5e2db;--accent:#ff5a1f;--accent-ink:#b93d0a;--accent-soft:#ffe9df;--on-accent:#fff;--ok:#16a34a;--ok-soft:#dcf5e4;--warn:#8a5a00;--warn-soft:#fff0d9;--danger:#c4262c;--danger-soft:#fde8e8;--new:#6247e6;--new-soft:#efeaff;--shadow:0 1px 2px rgb(21 20 15/.05),0 10px 30px rgb(21 20 15/.06);--font:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,Menlo,Consolas,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--surface:#161618;--surface-2:#202023;--ink:#f4f2ee;--ink-2:#c9c5bd;--ink-3:#9b978f;--faint:#5f5c56;--line:#2a2a2e;--accent:#ff6a35;--accent-ink:#ff8a5c;--accent-soft:#3a1d12;--ok:#3ccf74;--ok-soft:#14301f;--warn:#f0b65a;--warn-soft:#3a2c14;--danger:#ff6b6b;--danger-soft:#3a1717;--new:#a996ff;--new-soft:#2a2342;--shadow:none;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--font);padding:0 max(16px,env(safe-area-inset-right)) 32px max(16px,env(safe-area-inset-left))}
.top{max-width:480px;margin:0 auto;display:flex;align-items:center;gap:10px;padding:22px 0 18px;font-weight:800;font-size:18px;letter-spacing:-.01em}
.mark{width:30px;height:30px;border-radius:9px;background:var(--accent);display:grid;place-items:center;flex:none}
.mark svg{width:18px;height:18px}
main{max-width:480px;margin:0 auto;display:grid;gap:14px}
h1,h2,h3{margin:0;text-wrap:balance}
h1{font-size:28px;line-height:1.12;font-weight:800;letter-spacing:-.025em}
a{color:var(--accent-ink);font-weight:700}
.card{background:var(--surface);border-radius:24px;box-shadow:var(--shadow);overflow:hidden}
@media (prefers-color-scheme:dark){.card{border:1px solid var(--line)}}
.head{padding:24px 22px 8px;display:grid;gap:10px}
.brand{display:none}
.logo{display:none}
.intro{display:grid;justify-items:center;text-align:center;gap:10px;padding:6px 4px 4px}
.intro.left{justify-items:start;text-align:left;padding-top:0}
.consent form{display:grid;gap:14px}
.h2{font-size:20px;font-weight:800}
.kept{padding:12px 18px 0}
.pair{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.pair .mark{width:52px;height:52px;border-radius:50%;background:var(--surface);box-shadow:var(--shadow);border:1px solid var(--line)}
.pair .mark svg{width:30px;height:30px}.pair .mark .bg{fill:var(--accent)}
.dots{width:48px;height:6px;background:radial-gradient(circle,var(--faint) 2.5px,transparent 3px) 0 0/12px 6px repeat-x}
.app{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:16px;flex:none;background:var(--ink);color:var(--surface)}
.app svg{width:22px;height:22px}
.app.lg{width:52px;height:52px}.app.lg svg{width:26px;height:26px}
.app.chatgpt{background:#15140f;color:#fff}.app.claude{background:#fdecc8;color:#d97706}.app.gemini{background:#e3ecff;color:#3b5ccc}
@media (prefers-color-scheme:dark){.app.chatgpt{background:#f4f2ee;color:#15140f}.app.claude{background:#3a2c14}.app.gemini{background:#1d2742}}
.muted{font-size:13px;color:var(--ink-3);margin:0}
.muted b,.muted strong{color:var(--ink-2)}
.chip{display:inline-block;background:var(--surface-2);color:var(--ink-2);border-radius:999px;padding:4px 12px;font-weight:700;font-size:13px;overflow-wrap:anywhere}
.body{padding:4px 22px 8px}
.msg{padding:28px 22px;display:grid;gap:12px}
.msg p{margin:0;color:var(--ink-2)}
.msg h1{font-size:24px}
.msg .btn{margin-top:6px}
fieldset{border:0;margin:0;padding:0;display:grid;min-width:0}
.group{padding:0}
.ghead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}
.ghead h2{font-size:17px;font-weight:800;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.pill{white-space:nowrap;font-size:13px;font-weight:700;padding:3px 12px;border-radius:999px;background:var(--surface-2);color:var(--ink-2)}
.pill.add{background:var(--surface-2);color:var(--ink-2)}
.new{font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--new-soft);color:var(--new);margin-left:6px;vertical-align:2px}
.row{display:flex;align-items:center;gap:14px;padding:13px 18px;cursor:pointer;position:relative;transition:background .15s}
.row:has(input:checked){background:var(--accent-soft)}
.tick input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
.box{width:24px;height:24px;border-radius:50%;border:2px solid var(--faint);display:grid;place-items:center;flex:none;position:relative;background:var(--surface)}
.box::after{content:"";width:5px;height:10px;border:solid #fff;border-width:0 2.4px 2.4px 0;transform:translateY(-1px) rotate(45deg);opacity:0}
.tick input:checked+.box,.tick input:indeterminate+.box{background:var(--accent);border-color:var(--accent)}
.tick input:checked+.box::after{opacity:1}
.tick input:indeterminate+.box::after{opacity:1;width:10px;height:0;border-width:0 0 2.4px 0;transform:none}
.tick input:focus-visible+.box{outline:2px solid var(--accent);outline-offset:2px}
.lbl{display:grid;min-width:0}.lbl b{font-weight:700;font-size:16px}.lbl span{font-size:14px;color:var(--ink-3)}
.all{display:none;align-items:center;gap:10px;font-size:13px;font-weight:600;color:var(--ink-3);cursor:pointer;white-space:nowrap;position:relative}
.js .all{display:flex}
.all .box{width:44px;height:26px;border-radius:999px;border:0;background:var(--surface-2)}
.all .box::after{width:20px;height:20px;border:0;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgb(0 0 0/.25);position:absolute;left:3px;top:3px;transform:none;opacity:1;transition:left .15s}
.all input:checked+.box::after{left:21px}
.all input:indeterminate+.box{background:var(--accent-soft)}
.all input:indeterminate+.box::after{width:20px;height:20px;border:0;left:12px}
.note{padding:16px 18px;display:flex;gap:12px;font-size:14px;color:var(--ink-2)}
.note svg{width:22px;height:22px;flex:none;color:var(--ok)}
.note div{display:grid;gap:6px}
.note p{margin:0}
.note.warn{background:var(--warn-soft);color:var(--warn);border-radius:18px}
.note.warn svg{color:var(--warn)}
.foot{padding:12px 22px 24px;display:grid;gap:12px}
.bar{position:sticky;bottom:0;margin:6px -16px -32px;padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bar .summary{flex:1;text-align:left;font-weight:700;color:var(--ink);font-size:14px;min-width:96px}
.bar .btns{display:flex;gap:10px;flex:none}
.bar .btn{width:auto;padding:13px 20px}
.summary{font-size:13px;color:var(--ink-3);text-align:center;margin:0;min-height:20px}
.btns{display:grid;grid-template-columns:1fr 2fr;gap:10px}
.btn{font:700 16px var(--font);border-radius:999px;padding:14px 18px;cursor:pointer;border:0;background:var(--surface-2);color:var(--ink);text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%}
.btn svg{width:18px;height:18px}
.btns .primary{order:2}
.btn.primary{background:var(--accent);color:var(--on-accent);box-shadow:0 8px 20px rgb(255 90 31/.28)}
@media (prefers-color-scheme:dark){.btn.primary{box-shadow:none}}
.btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.btn.small{padding:10px 16px;font-size:14px;width:auto}
.btn.danger{background:var(--danger-soft);color:var(--danger)}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.fields{display:grid;gap:14px}
.fields label{display:grid;gap:8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.fields input{font:16px var(--font);padding:15px 16px;border:0;border-radius:16px;background:var(--surface-2);color:var(--ink);width:100%;text-transform:none;letter-spacing:0}
.fields input:focus{outline:2px solid var(--accent);outline-offset:0}
.or{display:flex;align-items:center;gap:12px;color:var(--ink-3);font-size:14px}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.g{width:26px;height:26px;border-radius:50%;background:var(--surface);display:grid;place-items:center;font-weight:800;font-size:14px;color:var(--ink)}
.fine{text-align:center;font-size:12px;color:var(--ink-3);margin:8px 0 0}
.conn{padding:20px 20px 18px;display:grid;gap:14px}
.conn-head{display:flex;align-items:center;gap:14px}
.conn strong{display:block;font-size:18px;font-weight:800}
.conn .muted{display:block}
.added{margin:0;font-weight:600;font-size:14px}
.actions{display:flex;gap:10px}
.actions form{flex:1}
.actions .btn{width:100%}
.tags{display:flex;flex-wrap:wrap;gap:8px}
.tag{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;padding:6px 12px;border-radius:999px;background:var(--surface-2);color:var(--ink)}
.tag svg{width:15px;height:15px}
.tag.add{color:var(--accent-ink)}
.empty{padding:20px 22px;color:var(--ink-3);margin:0}
.picker{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pick{border:2px solid var(--line);border-radius:18px;padding:14px 6px;display:grid;justify-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:15px;position:relative}
.setup>input{position:absolute;opacity:0;width:1px;height:1px;margin:0}
#app-chatgpt:focus-visible~.picker .p-chatgpt,#app-claude:focus-visible~.picker .p-claude,#app-gemini:focus-visible~.picker .p-gemini{outline:2px solid var(--accent);outline-offset:2px}
.pick .app{width:38px;height:38px}
.pick .app svg{width:20px;height:20px}
.guide{display:none;gap:6px}
#app-chatgpt:checked~.guides .g-chatgpt,#app-claude:checked~.guides .g-claude,#app-gemini:checked~.guides .g-gemini{display:grid}
.setup{padding:4px 22px 22px;display:grid;gap:16px;position:relative}
#app-chatgpt:checked~.picker .p-chatgpt,#app-claude:checked~.picker .p-claude,#app-gemini:checked~.picker .p-gemini{border-color:var(--accent);background:var(--accent-soft)}
.copy{display:grid;gap:8px}
.copy>span{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.copyrow{display:flex;gap:8px;align-items:center;background:var(--surface-2);border-radius:999px;padding:6px 6px 6px 18px}
.field{flex:1;min-width:0;display:grid;font-weight:600;font-size:0}
.field input{font:600 14px var(--mono);color:var(--ink);background:none;border:0;padding:6px 0;width:100%;min-width:0;text-overflow:ellipsis}
.copyrow .btn{display:none}.js .copyrow .btn{display:inline-flex}
.steps{list-style:none;margin:0;padding:0;counter-reset:s;display:grid}
.steps li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;padding-bottom:14px;position:relative;counter-increment:s}
.steps li::before{content:counter(s);width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;background:var(--accent-soft);color:var(--accent-ink);position:relative;z-index:1}
.steps li:not(:last-child)::after{content:"";position:absolute;left:13.5px;top:30px;bottom:2px;width:1px;background:var(--line)}
.steps b{display:block;font-weight:700}.steps span{font-size:14px;color:var(--ink-3)}
.path{font:600 12px var(--font);background:var(--surface-2);padding:1px 7px;border-radius:6px;color:var(--ink-2);white-space:nowrap}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:999px;font-weight:700;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
.signout{display:flex;justify-content:center}
.linkbtn{background:none;border:0;color:var(--ink-3);font:600 13px var(--font);cursor:pointer;text-decoration:underline}
@media (max-width:440px){.all .say{display:none}.ghead h2{font-size:16px}}
@media (max-width:360px){.bar .btns{width:100%}.bar .btn{flex:1}.actions{flex-direction:column}}
.actions .btn{white-space:nowrap;padding:13px 12px;font-size:15px;gap:6px}
.bar .summary{white-space:nowrap}
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
    if(summary)summary.textContent=total?total+' of '+(counts[0][1]+counts[1][1])+' allowed':'None chosen';
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
// MFD's mark: a flame on an orange square (the page's top bar, and next to the AI app when connecting).
const FLAME = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="bg" fill="#fff" d="M12.3 2.5c2.8 2.9 4.4 5.6 3.9 8.6-.4 2.3-1.9 3.6-4 3.6-2.2 0-3.9-1.6-3.9-3.7 0-1.9 1-3.2 1.8-4.6.4 1.5 1 2.2 1.8 2.6.6-2.1.8-4.2.4-6.5z"/><rect class="bg" fill="#fff" x="6.5" y="17" width="11" height="2.6" rx="1.3"/></svg>`;
export const mark = `<span class="mark">${FLAME}</span>`;
export const icons = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.7 14a6.9 6.9 0 0 0 .3-2V5l-8-3-3.2 1.2"/><path d="m2 2 20 20"/><path d="M4.7 4.7 4 5v7c0 6 8 10 8 10a20.3 20.3 0 0 0 5.6-4.4"/></svg>',
};
export const logo = LOGO;
// Known AI apps get their colour; any other app shows its first letter.
const BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v1M15 13v1M2 14h2M20 14h2"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/></svg>';
export function appBadge(name: string, size = '') {
  const n = name.toLowerCase(), kind = n.includes('chatgpt') || n.includes('openai') ? 'chatgpt' : n.includes('claude') ? 'claude' : n.includes('gemini') ? 'gemini' : '';
  const inner = kind === 'chatgpt' ? BOT : kind ? SPARK : escape((name.trim()[0] || '?').toUpperCase());
  return `<span class="app ${kind}${size ? ' ' + size : ''}" aria-hidden="true">${inner}</span>`;
}
// A complete page with only the content; status messages use the same card.
export function htmlPage(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escape(title)}</title><link rel="icon" href="/icon.svg" type="image/svg+xml"><style>${STYLE}</style></head><body><header class="top">${mark}<span>My Fitness Diary</span></header><main>${body}</main><div class="toast" role="status" aria-live="polite"></div><script>${SCRIPT}</script></body></html>`;
}
export const message = (text: string) => `<section class="card"><div class="msg">${text}</div></section>`;

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
