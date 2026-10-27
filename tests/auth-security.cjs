const esbuild=require('esbuild'),vm=require('vm'),fs=require('fs'),assert=require('assert');
const code=esbuild.transformSync(fs.readFileSync('frontend/adapters/auth.ts','utf8'),{loader:'ts',format:'cjs'}).code;
let target,tool,response;const c={module:{exports:{}},URL,location:{origin:'https://mfd.example',assign:url=>target=url},require:()=>({environment:()=>({MFD_SUPABASE_URL:'https://gngnrmzeghjzqsmzuktl.supabase.co'}),client:()=>({auth:{signInWithOAuth:async()=>response}}),openTool:name=>tool=name})};vm.createContext(c);vm.runInContext(code,c);const auth=c.module.exports.auth;
(async()=>{
 for(const url of ['javascript:alert(1)','https://evil.example/','https://gngnrmzeghjzqsmzuktl.supabase.co.evil.example/','https://user@gngnrmzeghjzqsmzuktl.supabase.co/','http://gngnrmzeghjzqsmzuktl.supabase.co/',null]){response={data:{url}};await assert.rejects(auth.signInWithGoogle());assert.equal(target,undefined)}
 const url='https://gngnrmzeghjzqsmzuktl.supabase.co/auth/v1/authorize?provider=google';response={data:{url}};await auth.signInWithGoogle();assert.equal(target,url);
 await auth.signOut();assert.equal(tool,'logout');
 assert(fs.readFileSync('public/legacy/bridge.js','utf8').includes("name==='logout')signOutForma()"));
 console.log('PASS OAuth destination allowlist and React logout uses checkpoint/cleanup flow');
})().catch(e=>{console.error(e);process.exit(1)});
