const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');const out=path.join(os.tmpdir(),'mfd-app-links.cjs');esbuild.buildSync({entryPoints:['frontend/lib/appLinks.ts'],bundle:true,platform:'node',format:'cjs',outfile:out});const {appHref}=require(out);
const android='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',mac='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const claude={web:'https://claude.ai/customize/connectors?modal=add-custom-connector',android:'https://claude.ai/new',androidPackage:'com.anthropic.claude'},chatgpt={web:'https://chatgpt.com/settings',androidPackage:'com.openai.chatgpt'};
assert.equal(appHref(claude,iphone),claude.web);assert.equal(appHref(chatgpt,mac),chatgpt.web);
assert.equal(appHref(chatgpt,android),'intent://chatgpt.com/settings#Intent;scheme=https;package=com.openai.chatgpt;S.browser_fallback_url=https%3A%2F%2Fchatgpt.com%2Fsettings;end');
// Android opens the app at its own page (/new) but still falls back to the Add-connector website.
const intent=appHref(claude,android);assert.equal(intent,'intent://claude.ai/new#Intent;scheme=https;package=com.anthropic.claude;S.browser_fallback_url=https%3A%2F%2Fclaude.ai%2Fcustomize%2Fconnectors%3Fmodal%3Dadd-custom-connector;end');
// The fallback must decode back to the exact website, so a phone without the app lands on the same page.
assert.equal(decodeURIComponent(intent.match(/S\.browser_fallback_url=([^;]+)/)[1]),claude.web);
console.log('PASS app links: Android intent (own page when set) with website fallback, plain links on iPhone and desktop');
