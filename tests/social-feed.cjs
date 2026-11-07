// Incremental Friends feed (frontend/lib/socialFeed.ts) against an in-memory stand-in for the
// Supabase query API that records what each check downloads.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-feed-'));
esbuild.buildSync({entryPoints:['frontend/lib/socialFeed.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'feed.cjs')});
const {SocialFeed}=require(path.join(dir,'feed.cjs'));fs.rmSync(dir,{recursive:true,force:true});

const DAY=86400000;let now=Date.UTC(2026,10,6,12);let serverClock=now;
const iso=t=>new Date(t).toISOString(),tick=()=>iso(serverClock+=40000);
// After a change, one check 30 s+ later looks back for late commits; `settle` runs that check.
const settle=async(f,owners)=>{for(let i=0;i<2;i++){now+=40000;await f.sync(c,owners)}log.length=0;now+=40000};
const db={mfd_social_workouts:[],mfd_reactions:[],mfd_social_removals:[],mfd_workout_photos:[],mfd_comments:[]};
const log=[];// one entry per query: {table, rows}
const ME='me',ANA='ana',BEN='ben';
let friends=new Set([ANA,BEN]);
const visible=r=>r.owner_id===ME||friends.has(r.owner_id);
function value(v){return v}
function client(){return {from(table){const filters=[];let order=null,limit=Infinity;const q={
 select(){return q},eq(c,v){filters.push(r=>r[c]===v);return q},gt(c,v){filters.push(r=>r[c]>v);return q},gte(c,v){filters.push(r=>r[c]>=v);return q},lt(c,v){filters.push(r=>r[c]<v);return q},
 in(c,vs){filters.push(r=>vs.includes(r[c]));return q},
 or(expr){const parts=expr.match(/[a-z_]+\.(?:in\.\([^)]*\)|[a-z]+\.[^,]+)/g);filters.push(r=>parts.some(p=>{const m=p.match(/^([a-z_]+)\.(in|gte)\.(.*)$/);if(m[2]==='gte')return r[m[1]]>=m[3];return m[3].slice(1,-1).split(',').includes(r[m[1]])}));return q},
 order(c,o={}){order=[c,o.ascending!==false];return q},limit(n){limit=n;return q},
 then(ok,fail){let out=db[table].filter(visible).filter(r=>filters.every(f=>f(r)));if(order)out=[...out].sort((a,b)=>(a[order[0]]<b[order[0]]?-1:a[order[0]]>b[order[0]]?1:0)*(order[1]?1:-1));out=out.slice(0,limit).map(r=>({...r}));log.push({table,rows:out.length});return Promise.resolve({data:out,error:null}).then(ok,fail)}};return q}}}
const c=client();
function post(owner,id,daysAgo,extra={}){const r={owner_id:owner,workout_id:id,started_at:iso(now-daysAgo*DAY),updated_at:tick(),data:{name:id,sets:[]},...extra};db.mfd_social_workouts=db.mfd_social_workouts.filter(x=>!(x.owner_id===owner&&x.workout_id===id));db.mfd_social_workouts.push(r);return r}
function remove(owner,id){db.mfd_social_workouts=db.mfd_social_workouts.filter(x=>!(x.owner_id===owner&&x.workout_id===id));db.mfd_reactions=db.mfd_reactions.filter(x=>!(x.owner_id===owner&&x.workout_id===id));db.mfd_social_removals.push({kind:'workout',owner_id:owner,workout_id:id,removed_at:tick()})}
function react(user,owner,id){db.mfd_reactions.push({user_id:user,owner_id:owner,workout_id:id,created_at:tick()})}
function unreact(user,owner,id){db.mfd_reactions=db.mfd_reactions.filter(x=>!(x.user_id===user&&x.owner_id===owner&&x.workout_id===id));db.mfd_social_removals.push({kind:'reaction',owner_id:owner,workout_id:id,user_id:user,removed_at:tick()})}
let cid=0;function comment(user,owner,id,body){const x={id:'c'+(++cid),user_id:user,owner_id:owner,workout_id:id,body,created_at:tick()};db.mfd_comments.push(x);return x}
function uncomment(x){db.mfd_comments=db.mfd_comments.filter(y=>y.id!==x.id);db.mfd_social_removals.push({kind:'comment',owner_id:x.owner_id,workout_id:x.workout_id,user_id:x.user_id,comment_id:x.id,removed_at:tick()})}
function photo(owner,id,p){db.mfd_workout_photos=db.mfd_workout_photos.filter(x=>!(x.owner_id===owner&&x.workout_id===id));if(p)db.mfd_workout_photos.push({owner_id:owner,workout_id:id,path:p});const w=db.mfd_social_workouts.find(x=>x.owner_id===owner&&x.workout_id===id);if(w)w.updated_at=tick()}
const storage=(()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})();
const downloaded=()=>log.filter(e=>e.table==='mfd_social_workouts').reduce((n,e)=>n+e.rows,0);
const ids=feed=>feed.feed().map(r=>r.workout_id).sort().join(',');

(async()=>{
 // History: older than 7 days must not appear in the feed.
 post(ANA,'a-old',10);post(ANA,'a1',2);post(BEN,'b1',1);post(ME,'m1',3);post('stranger','s1',1);
 react(BEN,ANA,'a1');photo(ANA,'a1','ana/a1.jpg');
 const feed=new SocialFeed(ME,()=>now,storage);
 await feed.sync(c,[ANA,BEN]);
 assert.equal(ids(feed),'a1,b1,m1','first load: last 7 days of me and friends only');
 assert.equal(feed.reactionList().length,1);assert.equal(feed.photoFor(ANA,'a1'),'ana/a1.jpg');

 // Reopening the app: saved feed appears before any network, then only changes are fetched.
 log.length=0;const reopened=new SocialFeed(ME,()=>now,storage);
 assert.equal(ids(reopened),'a1,b1,m1','saved feed restores instantly');
 now+=40000;await reopened.sync(c,[ANA,BEN]);
 assert.ok(downloaded()<=1,'one look-back re-reads at most the newest post');
 log.length=0;now+=40000;await reopened.sync(c,[ANA,BEN]);
 assert.equal(downloaded(),0,'nothing changed: no workouts downloaded');
 log.length=0;now+=40000;await reopened.sync(c,[ANA,BEN]);assert.equal(downloaded(),0,'still nothing on later checks');

 // A new post downloads exactly one workout.
 log.length=0;post(BEN,'b2',0);await reopened.sync(c,[ANA,BEN]);
 assert.equal(downloaded(),1,'one new post, one download');assert.equal(ids(reopened),'a1,b1,b2,m1');
 await settle(reopened,[ANA,BEN]);

 // An edit replaces the copy; a photo change arrives the same way.
 await settle(reopened,[ANA,BEN]);post(ANA,'a1',2,{data:{name:'Leg day',sets:[]}});photo(ANA,'a1','ana/new.jpg');await reopened.sync(c,[ANA,BEN]);
 assert.equal(downloaded(),1,'edit + photo: one download');assert.equal(reopened.feed().find(r=>r.workout_id==='a1').data.name,'Leg day');assert.equal(reopened.photoFor(ANA,'a1'),'ana/new.jpg');
 photo(ANA,'a1',null);await reopened.sync(c,[ANA,BEN]);assert.equal(reopened.photoFor(ANA,'a1'),undefined,'removed photo disappears');

 // Reactions: added and taken back.
 react(ME,BEN,'b2');await reopened.sync(c,[ANA,BEN]);assert.equal(reopened.reactionList().filter(r=>r.workout_id==='b2').length,1);
 unreact(ME,BEN,'b2');await reopened.sync(c,[ANA,BEN]);assert.equal(reopened.reactionList().filter(r=>r.workout_id==='b2').length,0);

 // Comments: arrive incrementally (one row each), survive a restart, and go when removed.
 log.length=0;const hi=comment(ANA,BEN,'b2','Nice!');await reopened.sync(c,[ANA,BEN]);
 assert.deepEqual(reopened.commentsFor(BEN,'b2').map(x=>x.body),['Nice!']);
 assert.equal(log.filter(e=>e.table==='mfd_comments').reduce((n,e)=>n+e.rows,0),1,'one new comment, one download');
 comment(ME,BEN,'b2','Thanks');await reopened.sync(c,[ANA,BEN]);
 assert.deepEqual(reopened.commentsFor(BEN,'b2').map(x=>x.body),['Nice!','Thanks'],'oldest first');
 assert.deepEqual(new SocialFeed(ME,()=>now,storage).commentsFor(BEN,'b2').map(x=>x.body),['Nice!','Thanks'],'comments saved with the feed');
 uncomment(hi);await reopened.sync(c,[ANA,BEN]);assert.deepEqual(reopened.commentsFor(BEN,'b2').map(x=>x.body),['Thanks'],'removed comment disappears');
 comment(ANA,'stranger','s1','not visible');await reopened.sync(c,[ANA,BEN]);assert.equal(reopened.commentsFor('stranger','s1').length,0,'only comments on visible workouts');
 // This device's own comment shows at once.
 reopened.comment({id:'local',user_id:ME,owner_id:BEN,workout_id:'b2',body:'mine',created_at:iso(now)});assert.equal(reopened.commentsFor(BEN,'b2').length,2);reopened.uncomment('local');
 // A deleted workout disappears with its reactions.
 remove(ANA,'a1');await reopened.sync(c,[ANA,BEN]);assert.equal(ids(reopened),'b1,b2,m1');assert.equal(reopened.reactionList().length,0);

 // Deleted, then posted again with the same id: present (server order wins).
 remove(BEN,'b2');post(BEN,'b2',0,{data:{name:'again',sets:[]}});await reopened.sync(c,[ANA,BEN]);assert.equal(reopened.feed().find(r=>r.workout_id==='b2')?.data.name,'again');

 // A big old import by a friend downloads nothing for the feed.
 await settle(reopened,[ANA,BEN]);for(let i=0;i<120;i++)post(ANA,'import'+i,30+i);await reopened.sync(c,[ANA,BEN]);
 assert.equal(downloaded(),0,'old history import is not downloaded by the feed');

 // Unfriending: their posts vanish (the window reloads in full for the new friend set).
 friends.delete(BEN);await reopened.sync(c,[ANA]);assert.equal(ids(reopened),'m1','removed friend vanishes');
 friends.add(BEN);await reopened.sync(c,[ANA,BEN]);assert.equal(ids(reopened),'b1,b2,m1','re-added friend returns');

 // Profiles: full history 20 at a time, edits to loaded profile workouts still arrive.
 let n=await reopened.loadProfile(c,ANA);assert.equal(n,20);assert.ok(reopened.hasMore(ANA));
 const oldest=reopened.profile(ANA).at(-1).workout_id;
 post(ANA,oldest,0+Number(oldest.slice(6))+30,{data:{name:'edited old',sets:[]}});await reopened.sync(c,[ANA,BEN]);
 assert.equal(reopened.profile(ANA).find(r=>r.workout_id===oldest).data.name,'edited old','edit to a loaded profile workout arrives');
 let total=20;while(reopened.hasMore(ANA))total+=await reopened.loadProfile(c,ANA);
 assert.equal(total,121,'all of a profile (120 imported + a-old) loads in pages');
 assert.ok(!JSON.parse(storage.getItem('mfd-feed-v2:me')).rows.some(r=>r.workout_id.startsWith('import')),'profile pages are not saved on the device');

 // Time passes: posts older than 7 days leave the feed.
 now+=6*DAY;serverClock=Math.max(serverClock,now);await reopened.sync(c,[ANA,BEN]);assert.equal(ids(reopened),'b2','aged-out posts leave the feed');

 // This device's own reaction shows immediately.
 reopened.react(BEN,'b2',true);assert.equal(reopened.reactionList().length,1);

 console.log('PASS incremental feed: 7-day window, saved on device, only changes downloaded, edits/photos/reactions/comments/removals, unfriend, old imports skipped, profile paging, aging');
})().catch(e=>{console.error(e);process.exitCode=1});
