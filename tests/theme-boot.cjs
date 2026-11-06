// public/legacy/theme.js: System follows the phone (and changes live), choices are saved on the
// device, other windows follow, the status-bar colour matches, and broken storage falls back safely.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/legacy/theme.js','utf8');
function page({dark=false,stored=null,storageBroken=false}={}){
 const attrs={},meta={content:'#f6f5f2',setAttribute(k,v){this[k]=v}},store=new Map(stored?[['mfd-appearance',stored]]:[]);
 const queryListeners=[],winListeners={};let events=0;
 const query={matches:dark,addEventListener:(e,f)=>queryListeners.push(f)};
 const localStorage={getItem:k=>{if(storageBroken)throw Error('denied');return store.has(k)?store.get(k):null},setItem:(k,v)=>{if(storageBroken)throw Error('denied');store.set(k,v)},removeItem:k=>store.delete(k)};
 const window={matchMedia:()=>query,addEventListener:(n,f)=>(winListeners[n]=winListeners[n]||[]).push(f),dispatchEvent:()=>{events++}};
 const ctx={window,localStorage,document:{documentElement:{setAttribute:(k,v)=>attrs[k]=v},querySelector:s=>s==='meta[name="theme-color"]'?meta:null},Event:class{constructor(t){this.type=t}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {attrs,meta,store,api:window.mfdAppearance,events:()=>events,
  phone(d){query.matches=d;queryListeners.forEach(f=>f())},storage(v){if(v===null)store.delete('mfd-appearance');else store.set('mfd-appearance',v);(winListeners.storage||[]).forEach(f=>f({key:'mfd-appearance'}))}};
}
// Default is System: follows the phone, and changes live.
let p=page({dark:true});assert.equal(p.attrs['data-theme'],'dark');assert.equal(p.attrs['data-appearance'],'system');assert.equal(p.meta.content,'#0b0b0c');
p.phone(false);assert.equal(p.attrs['data-theme'],'light');assert.equal(p.meta.content,'#f6f5f2');
// A saved choice wins over the phone, and is applied before anything paints.
p=page({dark:true,stored:'light'});assert.equal(p.attrs['data-theme'],'light');p.phone(true);assert.equal(p.attrs['data-theme'],'light','explicit Light ignores the phone');
// Choosing in Settings: saved, applied, announced; System clears the saved value.
p=page();p.api.set('dark');assert.equal(p.store.get('mfd-appearance'),'dark');assert.equal(p.attrs['data-theme'],'dark');assert.equal(p.events(),1);
p.api.set('system');assert.equal(p.store.has('mfd-appearance'),false);assert.equal(p.attrs['data-theme'],'light');
p.api.set('purple');assert.equal(p.api.get(),'system','unknown values are ignored');
// Another window (or the account frame) changes it: this one follows.
p=page();p.storage('dark');assert.equal(p.attrs['data-theme'],'dark');p.storage(null);assert.equal(p.attrs['data-theme'],'light');
// Garbage in storage, or storage blocked (private mode): System, no crash.
p=page({dark:true,stored:'neon'});assert.equal(p.attrs['data-appearance'],'system');assert.equal(p.attrs['data-theme'],'dark');
p=page({dark:false,storageBroken:true});assert.equal(p.attrs['data-theme'],'light');p.api.set('dark');assert.equal(p.attrs['data-theme'],'light','cannot save, stays on System');
// Both pages load it before their stylesheets.
for(const f of ['public/index.html','public/legacy/index.html']){const html=fs.readFileSync(f,'utf8');const s=html.indexOf('theme.js'),c=html.indexOf('stylesheet');assert.ok(s>0&&(c<0||s<c),f+' loads theme.js before styles')}
console.log('PASS appearance: System follows the phone live, saved choice wins, Settings saves/clears, other windows follow, status bar colour, safe fallbacks, loaded before styles');
