// Friends opens at once (frontend/lib/friendsCache.ts): one feed and one photo-link cache per account for the session,
// the people list saved per account on the device, photo links reused only while still valid, accounts never mixed.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-friends-cache-'));
esbuild.buildSync({entryPoints:['frontend/lib/friendsCache.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'cache.cjs'),logLevel:'silent'});
const C=require(path.join(dir,'cache.cjs'));fs.rmSync(dir,{recursive:true,force:true});

// The same objects on every visit: the feed isn't reloaded from storage and photo links stay the same.
const a=C.friendsSession('alice');
assert.equal(C.friendsSession('alice'),a,'one session per account');
assert.notEqual(C.friendsSession('bob').feed,a.feed,'accounts never share a feed');
assert.notEqual(C.friendsSession('bob').images,a.images,'or photo links');

// People: kept for the session and saved per account, so a fresh app open shows names at once.
assert.equal(a.people,null,'nothing known yet');
const people={profiles:[{user_id:'alice',username:'alice',display_name:'Alice'}],links:[{sender:'alice',recipient:'bob',status:'accepted'}],blocks:[]};
C.rememberPeople('alice',people);
assert.deepEqual(a.people,people);
assert.deepEqual(JSON.parse(store.get('mfd-friends-people:alice')),people,'saved on this device');
assert.equal(store.get('mfd-friends-people:bob'),undefined,'only for that account');
store.set('mfd-friends-people:carol','{"profiles":"broken"}');
assert.equal(C.friendsSession('carol').people,null,'a damaged saved list is ignored');

// Photo links: shown at once while valid; before their 15 minutes run out they are dropped (signed again).
let t=1e12;
C.rememberPhotos(a,{alice:'https://x/1'},t);
assert.deepEqual(C.freshPhotos(a,t+5*60000),{alice:'https://x/1'});
C.rememberPhotos(a,{alice:'https://x/1',w:'https://x/2'},t+10*60000);
assert.deepEqual(C.freshPhotos(a,t+11*60000),{alice:'https://x/1',w:'https://x/2'},'added links kept');
assert.deepEqual(C.freshPhotos(a,t+12*60000),{},'old links not shown after 12 minutes');
C.rememberPhotos(a,{alice:'https://x/3'},t+13*60000);
assert.deepEqual(C.freshPhotos(a,t+14*60000),{alice:'https://x/3'},'new links start a new period');

// Unchanged data is the same: no re-render, no second feed check.
assert.ok(C.same([{a:1}],[{a:1}])&&!C.same([{a:1}],[{a:2}]));
console.log('PASS friends cache: one feed and photo-link cache per account for the session, people saved per account, valid photo links shown at once, accounts kept apart');
