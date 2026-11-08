// Incremental chat (frontend/lib/chatSync.ts) against an in-memory stand-in for the Supabase query API that
// records how many rows each check downloads and applies the same visibility as the database policy.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mfd-chat-'));
esbuild.buildSync({entryPoints:['frontend/lib/chatSync.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'chat.cjs')});
const {ChatSync,FIRST_LOAD}=require(path.join(dir,'chat.cjs'));fs.rmSync(dir,{recursive:true,force:true});

let now=Date.UTC(2026,10,7,12),seq=0;const iso=t=>new Date(t).toISOString();
const ME='me',ANA='ana',BEN='ben';
let table=[];const log=[];
// Same rule as the policy: only my messages, not expired.
const visible=r=>[r.sender,r.recipient].includes(ME)&&new Date(r.expires_at).getTime()>now;
function client(){return {from(){const filters=[];let order=null,limit=Infinity,cols=null;const q={
 select(c){cols=c==='*'?null:c.split(',');return q},gte(c,v){filters.push(r=>r[c]>=v);return q},in(c,vs){filters.push(r=>vs.includes(r[c]));return q},not(c,op,v){filters.push(r=>op==='is'&&v===null?r[c]!=null:true);return q},
 or(expr){const pairs=[...expr.matchAll(/and\(sender\.eq\.([^,]+),recipient\.eq\.([^)]+)\)/g)].map(m=>[m[1],m[2]]);filters.push(r=>pairs.some(([s,t])=>r.sender===s&&r.recipient===t));return q},
 order(c,o={}){order=[c,o.ascending!==false];return q},limit(n){limit=n;return q},
 then(ok,fail){let out=table.filter(visible).filter(r=>filters.every(f=>f(r)));if(order)out=[...out].sort((a,b)=>(a[order[0]]<b[order[0]]?-1:a[order[0]]>b[order[0]]?1:0)*(order[1]?1:-1));
  out=out.slice(0,limit).map(r=>cols?Object.fromEntries(cols.map(k=>[k,r[k]])):{...r});log.push(out.length);return Promise.resolve({data:out,error:null}).then(ok,fail)}};return q}}}
const c=client();
const send=(from,to,body,at=now)=>{const m={id:'m'+(++seq),sender:from,recipient:to,body,sent_at:iso(at),read_at:null,expires_at:iso(at+24*3600e3)};table.push(m);return m};
const read=id=>{const m=table.find(x=>x.id===id);m.read_at=iso(now);m.expires_at=iso(Math.min(new Date(m.expires_at).getTime(),now+5*60e3))};
const downloaded=()=>{const n=log.reduce((a,b)=>a+b,0);log.length=0;return n};

(async()=>{
// First load: only this conversation, newest first (not the oldest 300 across every chat).
for(let i=0;i<400;i++)send(i%2?ME:ANA,i%2?ANA:ME,'hi '+i,now-(400-i)*1000);
for(let i=0;i<50;i++)send(BEN,ME,'ben '+i,now-i*1000);
const chat=new ChatSync(ME,ANA);
let list=await chat.refresh(c,now);
assert.equal(list.length,FIRST_LOAD,'newest 300 of this chat');
assert.equal(list.at(-1).body,'hi 399','includes the newest message');
assert.ok(list.every(m=>[m.sender,m.recipient].includes(ANA)),'only this conversation');
downloaded();

// Nothing new: the next check downloads (almost) nothing — the last message again, plus the read state of my unread ones.
now+=5000;await chat.refresh(c,now);
const quiet=downloaded();assert.ok(quiet<=1,'quiet check downloads at most the last message: '+quiet);
// Mark everything of mine as read on Ana's side, so later checks have nothing waiting.
table.filter(m=>m.sender===ME).forEach(m=>read(m.id));
// Read receipts are checked for the newest 100 unread at a time, so a long backlog takes two checks.
await chat.refresh(c,now);await chat.refresh(c,now);downloaded();
now+=5000;await chat.refresh(c,now);assert.ok(downloaded()<=2,'idle check downloads at most the last message');

// A new message from Ana arrives incrementally; one from Ben does not appear here.
now+=5000;send(ANA,ME,'new from ana');send(BEN,ME,'new from ben');
list=await chat.refresh(c,now);
assert.equal(list.at(-1).body,'new from ana');assert.ok(!list.some(m=>m.body==='new from ben'));
assert.ok(downloaded()<=3,'only the new rows');

// Two messages with the same timestamp are both kept, once each.
now+=5000;const t=now;send(ANA,ME,'same 1',t);send(ME,ANA,'same 2',t);
await chat.refresh(c,now);now+=1;send(ANA,ME,'same 3',t);
list=await chat.refresh(c,now);
for(const b of ['same 1','same 2','same 3'])assert.equal(list.filter(m=>m.body===b).length,1,b+' once');

// My message: shown at once from the server row, then its read receipt and shorter expiry arrive.
const mine=send(ME,ANA,'did you train?');chat.add({...mine});
assert.equal(chat.list(now).at(-1).read_at,null);
now+=60e3;read(mine.id);list=await chat.refresh(c,now);
const got=list.find(m=>m.id===mine.id);assert.ok(got.read_at,'read receipt arrived');assert.equal(got.expires_at,table.find(m=>m.id===mine.id).expires_at,'expiry shortened');
// 5 minutes after reading it disappears, without another download.
now+=5*60e3+1000;assert.ok(!chat.list(now).some(m=>m.id===mine.id),'expired after read');

// Messages I read: the update rows from marking read are merged.
const theirs=send(ANA,ME,'see you');await chat.refresh(c,now);read(theirs.id);
chat.updated([{id:theirs.id,read_at:table.find(m=>m.id===theirs.id).read_at,expires_at:table.find(m=>m.id===theirs.id).expires_at}]);
assert.ok(chat.list(now).find(m=>m.id===theirs.id).read_at);
// Unread messages expire after 24 hours.
now+=25*3600e3;assert.equal(chat.list(now).length,0,'everything older than 24 h is gone');
// An update for a message that is no longer here is ignored.
chat.updated([{id:'gone',read_at:iso(now)}]);assert.equal(chat.list(now).length,0);
console.log('PASS chat sync: first load is this conversation\'s newest messages only, later checks download only new rows and pending read receipts, equal timestamps kept once, own messages shown at once, read receipts shorten expiry, expired messages dropped');
})().catch(e=>{console.error(e);process.exit(1)});
