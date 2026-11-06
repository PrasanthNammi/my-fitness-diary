// What the AI hub lists: entries with an "added by" time, assistant names, last 24 hours, newest first.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-ai-'));esbuild.buildSync({entryPoints:['frontend/domain/aiActivity.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'a.cjs')});
const A=require(path.join(dir,'a.cjs'));fs.rmSync(dir,{recursive:true,force:true});
const now=Date.parse('2026-11-07T12:00:00Z'),h=3600000,at=t=>new Date(t).toISOString();
const all=A.aiAdded([
 {id:'m1',kind:'food',label:'Wrap',addedBy:{connection:'https://chatgpt.com/x',at:at(now-1*h)}},
 {id:'w1',kind:'workout',label:'Push',addedBy:{connection:'https://claude.ai/y',at:at(now-30*h)}},
 {id:'k1',kind:'weight',label:'Weight',addedBy:{connection:'https://example.org/z',at:at(now-2*h)}},
 {id:'r1',kind:'routine',label:'Upper',addedBy:{connection:'https://chatgpt.com/x',at:'not a date'}},
 {id:'m2',kind:'food',label:'Oats'},
 {id:'m3',kind:'food',label:'Future',addedBy:{connection:'https://claude.ai/y',at:at(now+5*60000)}},
]);
assert.deepEqual(all.map(a=>a.id),['m3','m1','k1','w1'],'only entries with a valid time, newest first');
assert.deepEqual(all.map(a=>a.by),['Claude','ChatGPT','AI assistant','Claude'],'names from the connection');
assert.deepEqual(A.aiAddedRecently(all,now).map(a=>a.id),['m3','m1','k1'],'last 24 hours (a clock-skewed future entry still shows)');
assert.equal(A.aiLastAdded(all,'ChatGPT'),now-h);assert.equal(A.aiLastAdded(all,'Gemini'),0);
assert.equal(A.aiAgo(now-30000,now),'1 min ago');assert.equal(A.aiAgo(now-5*h,now),'5 h ago');assert.equal(A.aiAgo(now-49*h,now),'2 d ago');
console.log('PASS AI activity: valid times only, assistant names, newest first, 24-hour window, last added per assistant, relative times');
