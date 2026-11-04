const fs=require('fs'),vm=require('vm'),assert=require('assert'),ts=require('typescript');
const security=fs.readFileSync('public/legacy/security.js','utf8');
const c={};vm.createContext(c);vm.runInContext(security,c);
const decode=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
const attacks=["');globalThis.pwned=true;//",'" onmouseover="globalThis.pwned=true',"\\');globalThis.pwned=true;//",'</script><img src=x onerror=alert(1)>','&quot;\n\r\u2028\u2029',"O'Brien",'normal-id'];
for(const value of attacks){
 c.expected=value;c.pwned=false;c.capture=x=>assert.equal(x,value);
 vm.runInContext("capture('"+decode(c.jsString(value))+"')",c);
 vm.runInContext('capture('+decode(c.jsValue(value))+')',c);
 assert.equal(c.pwned,false);
 assert(!/[<>"']/.test(c.jsString(value)),'Attribute delimiter escaped');
}
function sourceFunction(file,name){const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,99,true);const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(ast)}
let html='';const actions=[];c.mfdOn=fn=>{assert.equal(typeof fn,'function');actions.push(fn);return String(actions.length-1)};Object.assign(c,{modal:s=>html=s,modalHead:()=>'',cleanIcon:()=>'',modernConfirmRemoval:(id,key)=>{c.result=[id,key]}});
vm.runInContext(sourceFunction('public/legacy/progress-modern.js','modernRemoveMeasurement'),c);
for(const value of attacks){c.pwned=false;c.modernRemoveMeasurement(value,'weight');const handler=html.match(/data-mfd-onclick="([^"]*)"/)[1];actions[Number(handler)].call({},{});assert.deepEqual(c.result,[value,'weight']);assert.equal(c.pwned,false)}
// Catalogue IDs cross an HTML + JavaScript boundary; confirm real rendered actions.
const node={innerHTML:''},count={textContent:''};Object.assign(c,{$:s=>s==='#catalog-results'?node:count,catalogMatches:()=>[{id:attacks[0],name:'Test',muscle:'Legs',equipment:'Machine',source:'Custom'}],exerciseVisible:60,exerciseStatus:'Ready',esc:c.securityHTML,equipmentIllustration:()=>'',catalogDetail:id=>{c.result=id}});
vm.runInContext(sourceFunction('public/legacy/live-catalogs.js','drawExerciseResults'),c);c.drawExerciseResults();actions[Number(node.innerHTML.match(/data-mfd-onclick="([^"]*)"/)[1])].call({},{});assert.equal(c.result,attacks[0]);assert.equal(c.pwned,false);
// Inline handlers and runtime compilation must not return to legacy source.
for(const file of fs.readdirSync('public/legacy').filter(f=>f.endsWith('.js'))){const source=fs.readFileSync('public/legacy/'+file,'utf8');assert(!/\son[a-z]+\s*=\s*["']/.test(source),file+': inline handler');assert(!/\beval\s*\(|new Function\s*\(/.test(source),file+': runtime compilation');new vm.Script(source,{filename:file})}
for(const file of ['public/index.html','public/legacy/index.html']){const html=fs.readFileSync(file,'utf8');assert(html.includes('http-equiv="Content-Security-Policy"'));assert(/script-src 'self'( 'wasm-unsafe-eval')?;/.test(html));assert(!/script-src[^;]*'unsafe-(eval|inline)'/.test(html));assert(html.includes("object-src 'none'"));assert(html.includes("base-uri 'none'"));assert(html.includes('name="referrer" content="no-referrer"'));assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html));assert(!html.includes("'unsafe-eval'"))}
assert(fs.readFileSync('public/index.html','utf8').includes("script-src-attr 'none'"));
console.log('PASS adversarial handler arguments, rendered actions, source coverage, external bootstrap and CSP');
