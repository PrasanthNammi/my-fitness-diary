const assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),{buildSync}=require('esbuild');
const ctx={module:{exports:{}},TextEncoder,Uint8Array,Promise,String,crypto:crypto.webcrypto};vm.createContext(ctx);
vm.runInContext(buildSync({stdin:{contents:"export * from './hosting/independent/ui';",resolveDir:process.cwd()},bundle:true,format:'cjs',write:false}).outputFiles[0].text,ctx);
const ui=ctx.module.exports,hash=s=>"'sha256-"+crypto.createHash('sha256').update(s).digest('base64')+"'";
(async()=>{
 const html=ui.htmlPage('T<x>',ui.message('<p>Hi</p>')),policy=await ui.uiPolicy();
 const style=/<style>([\s\S]*?)<\/style>/.exec(html)[1],script=/<script>([\s\S]*?)<\/script>/.exec(html)[1];
 // CSP allows exactly the inline style and script the page ships, nothing else.
 assert.equal(policy,`style-src ${hash(style)}; script-src ${hash(script)}; img-src 'self'`);
 assert.equal((html.match(/<style>/g)||[]).length,1);assert.equal((html.match(/<script>/g)||[]).length,1);
 assert(!/\sstyle="|\son[a-z]+="/i.test(html),'no inline style or event attributes (blocked by CSP)');
 assert(html.includes('<title>T&lt;x&gt;</title>'));
 assert(ui.appBadge('ChatGPT').includes('chatgpt')&&ui.appBadge('<b>').includes('&lt;'));
 console.log('PASS connector UI: CSP hashes match shipped style/script, no inline attributes, escaped title and badges');
})().catch(e=>{console.error(e);process.exitCode=1});
