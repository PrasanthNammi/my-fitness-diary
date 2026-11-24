// MFD AI chat history on the device: newest first, deleted 7 days after the last message, the chat kept before
// history existed moves into the list, titles from the first message, "added" counts, delete one / all.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-ai-chats-test.cjs');
esbuild.buildSync({entryPoints:['frontend/lib/mfdAiChats.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const store={};global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
const C=require(out),DAY=864e5,now=Date.parse('2026-11-24T19:00:00Z');
const me=t=>({id:Math.random()+'',from:'me',text:t}),ai=(...states)=>({id:Math.random()+'',from:'ai',text:'Look right?',cards:states.map(s=>({state:s}))});
// The old single chat moves over.
store['mfd-ai-chat']=JSON.stringify([me('2 eggs and toast for breakfast'),ai('added')]);
let l=C.loadChats(now);assert.equal(l.length,1);assert.equal(l[0].title,'2 eggs and toast for breakfast');assert.equal(l[0].added,1);assert.equal(store['mfd-ai-chat'],undefined);
// New chats: nothing kept while empty; newest first; title from the first message; long titles shortened.
C.saveChat('a',[],now);assert.equal(C.loadChats(now).length,1,'an empty chat is not kept');
C.saveChat('b',[me('push day done, bench 3x8 at 60, incline db press 3x10 at 22, dips 3x12, pushdowns 3x12'),ai('added','ask','replaced')],now-2*DAY);
C.saveChat('c',[me('weighed 72.4'),ai('ask')],now-1000);
l=C.loadChats(now);assert.deepEqual(l.map(c=>c.id),['before-history','c','b']);
assert.equal(l[2].title.length,58);assert.ok(l[2].title.endsWith('…'));assert.equal(l[2].added,1);assert.equal(l[1].added,0);
// Saving again keeps the start time and moves it to the top.
C.saveChat('b',[...l[2].msgs,me('more')],now);l=C.loadChats(now);assert.equal(l[0].id,'b');assert.equal(l[0].startedAt,now-2*DAY);
// One week after the last message it is gone (checked on open).
C.saveChat('old',[me('ancient')],now-7*DAY-1);assert.ok(!C.loadChats(now).some(c=>c.id==='old'));assert.ok(!JSON.parse(store['mfd-ai-chats']).some(c=>c.id==='old'),'removed from storage too');
assert.ok(C.loadChats(now+7*DAY).every(c=>c.updatedAt>now),'a week later only newer chats remain');
// Delete one, delete all.
C.deleteChat('c');assert.ok(!C.loadChats(now).some(c=>c.id==='c'));C.deleteAllChats();assert.equal(C.loadChats(now).length,0);
// Days for grouping.
assert.equal(C.chatDay(now-1000,now),'Today');assert.equal(C.chatDay(now-DAY,now),'Yesterday');assert.match(C.chatDay(now-3*DAY,now),/day$/);
// Broken storage doesn't break the app.
store['mfd-ai-chats']='{oops';assert.deepEqual(C.loadChats(now),[]);
console.log('PASS MFD AI chats: newest first, kept 7 days after the last message, old chat moved over, titles, added counts, delete one/all');
