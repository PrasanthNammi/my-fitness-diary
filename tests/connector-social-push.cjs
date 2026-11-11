// Friend notifications on the connector: the database's signed request (/push/social) → message text, secret
// check (constant length, refused when missing/short/wrong, never from a browser), validation, per-user switches
// (likes & comments / messages), grouping tags, links into the app, and at most 30 an hour.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-social-push.cjs');
const A='11111111-1111-4111-8111-111111111111';
(async()=>{
 await esbuild.build({entryPoints:['hosting/independent/push.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent',
 plugins:[{name:'cf',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cf',namespace:'cf'}));b.onLoad({filter:/.*/,namespace:'cf'},()=>({contents:'export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}'}))}}]});
 const P=require(out);
 // Messages.
 const like=P.socialMessage({kind:'like',recipient:A,actor_name:'Riya',title:'Upper 1',workout:'w-1',count:1});
 assert.deepEqual(like,{kind:'like',recipient:A,title:'Riya liked your Upper 1',body:'Tap to see your workout',tag:'like:w-1',url:`/#/friends/w/${A}/w-1`});
 assert.equal(P.socialMessage({kind:'like',recipient:A,actor_name:'Riya',title:'Upper 1',workout:'w-1',count:3}).title,'Riya and 2 others liked your Upper 1');
 assert.equal(P.socialMessage({kind:'like',recipient:A,actor_name:'Riya',title:'Upper 1',workout:'w-1',count:2}).title,'Riya and 1 other liked your Upper 1');
 const com=P.socialMessage({kind:'comment',recipient:A,actor_name:'Ben',title:'Leg Day',workout:'abc:1',text:'  New\n PR? '+'x'.repeat(300)});
 assert.equal(com.title,'Ben commented on your Leg Day');assert.ok(com.body.startsWith('New PR? ')&&com.body.length===160);assert.equal(com.tag,'comment:abc:1');assert.equal(com.url,`/#/friends/w/${A}/abc%3A1`);
 const msg=P.socialMessage({kind:'message',recipient:A,actor_name:'Riya',actor_username:'riya.k',count:1,text:'never shown'});
 assert.deepEqual(msg,{kind:'message',recipient:A,title:'Riya',body:'Sent you a message',tag:'msg:riya.k',url:'/#/friends/chat/riya.k'});
 assert.equal(P.socialMessage({kind:'message',recipient:A,actor_name:'Riya',actor_username:'riya.k',count:4}).body,'4 new messages');
 for(const bad of [{},{kind:'poke',recipient:A,actor_name:'R'},{kind:'like',recipient:'nope',actor_name:'R',workout:'w'},{kind:'like',recipient:A,actor_name:'',workout:'w'},{kind:'like',recipient:A,actor_name:'R'},
  {kind:'like',recipient:A,actor_name:'R',workout:'../x'},{kind:'message',recipient:A,actor_name:'R'},{kind:'message',recipient:A,actor_name:'R',actor_username:'Bad Name'}])assert.equal(P.socialMessage(bad),null,JSON.stringify(bad));
 // Secret.
 const secret='k'.repeat(48),env={MFD_SOCIAL_HOOK:secret};
 assert.ok(P.hookAllowed(secret,env));for(const h of [null,'',secret.slice(1),secret+'x','j'+secret.slice(1)])assert.ok(!P.hookAllowed(h,env));assert.ok(!P.hookAllowed('short',{MFD_SOCIAL_HOOK:'short'}),'short secrets never accepted');assert.ok(!P.hookAllowed(secret,{}));
 // Endpoint.
 const jwk=await crypto.subtle.exportKey('jwk',(await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign'])).privateKey);
 const calls=[];const ns={idFromName:n=>n,get:id=>({social:async m=>{calls.push([id,m]);return true}})};
 const fullEnv={MFD_SOCIAL_HOOK:secret,MFD_VAPID_JWK:JSON.stringify(jwk),MFD_PUSH:ns},config={authOrigin:'https://connect.invalid',supabase:'https://db.invalid',key:'k'};
 const post=(b,h={})=>P.handlePush(new Request('https://connect.invalid/push/social',{method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify(b)}),fullEnv,config,async()=>{throw Error('no network')});
 const good={kind:'like',recipient:A,actor_name:'Riya',title:'Upper 1',workout:'w-1',count:1};
 assert.equal((await post(good)).status,403,'no secret');assert.equal((await post(good,{'x-mfd-hook':'k'.repeat(47)+'j'})).status,403,'wrong secret');
 assert.equal((await post(good,{'x-mfd-hook':secret,origin:'https://evil.invalid'})).status,403,'never from a browser');
 assert.equal((await post({...good,recipient:'x'},{'x-mfd-hook':secret})).status,400,'invalid');
 const ok=await post(good,{'x-mfd-hook':secret});assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{ok:true,sent:true});
 assert.equal(calls.length,1);assert.equal(calls[0][0],A,'sent to the recipient\'s devices');assert.equal(calls[0][1].title,'Riya liked your Upper 1');
 // The hub: switches and the hourly limit.
 const state=new Map(),sent=[];
 const sql={exec(q,...a){const rows=/SELECT v FROM state/.test(q)?(state.has(a[0])?[{v:state.get(a[0])}]:[]):/INSERT OR REPLACE INTO state/.test(q)?(state.set(a[0],a[1]),[]):/FROM devices/.test(q)&&/SELECT/.test(q)?[{endpoint:'https://fcm.googleapis.com/fcm/send/a',p256dh:'x',auth:'y'}]:[];return {toArray:()=>rows}}};
 const hub=new P.PushHub({storage:{sql}},{MFD_VAPID_JWK:JSON.stringify(jwk)});state.set('subject','https://connect.invalid');
 hub.broadcast=async(m)=>{sent.push(m)};
 assert.equal(await hub.social(like),true);assert.deepEqual(sent[0],{title:'Riya liked your Upper 1',body:'Tap to see your workout',tag:'like:w-1',url:`/#/friends/w/${A}/w-1`});
 await hub.setPrefs({social:false});assert.equal(await hub.social(com),false,'likes & comments off');assert.equal(await hub.social(msg),true,'messages still on');
 await hub.setPrefs({messages:false});assert.equal(await hub.social(msg),false,'messages off');assert.deepEqual(await hub.prefs(),{ai:true,social:false,messages:false});
 await hub.setPrefs({social:true,messages:true});state.delete('social-rate');sent.length=0;
 for(let i=0;i<35;i++)await hub.social(like);assert.equal(sent.length,30,'at most 30 an hour');
 console.log('PASS friend notifications (connector): like/comment/message texts and grouping tags, links into the app, chat text never shown, validation, signed by the database only (secret checked, browsers refused), per-user switches, 30 an hour');
})().catch(e=>{console.error(e);process.exit(1)});
