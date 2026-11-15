// Android app notifications (FCM HTTP v1) on the connector: the service-account JWT verifies with its public key,
// one access token is reused, messages are data-only and high priority, uninstalled apps are forgotten, the
// /push/devices endpoints accept and validate app tokens, and the PushHub sends to apps beside browsers.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const out=path.join(os.tmpdir(),'mfd-connector-fcm.cjs');
(async()=>{
 await esbuild.build({entryPoints:['hosting/independent/push.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent',
  plugins:[{name:'cf',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cf',namespace:'cf'}));b.onLoad({filter:/.*/,namespace:'cf'},()=>({contents:'export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}'}))}}]});
 const fcmOut=path.join(os.tmpdir(),'mfd-fcm.cjs');
 esbuild.buildSync({entryPoints:['hosting/independent/fcm.ts'],bundle:true,platform:'node',format:'cjs',outfile:fcmOut,logLevel:'silent'});
 const P=require(out),F=require(fcmOut),subtle=crypto.subtle;

 // A throwaway service account.
 const rsa=await subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const der=Buffer.from(await subtle.exportKey('pkcs8',rsa.privateKey)).toString('base64');
 const pem='-----BEGIN PRIVATE KEY-----\n'+der.match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----\n';
 const account={type:'service_account',project_id:'my-fitness-dairy',client_email:'push@my-fitness-dairy.iam.gserviceaccount.com',private_key:pem};
 const env={MFD_FCM_SA:JSON.stringify(account)};
 assert.deepEqual(F.fcmAccountOf(env),{client_email:account.client_email,private_key:pem,project_id:'my-fitness-dairy'});
 for(const bad of [{},{MFD_FCM_SA:'nope'},{MFD_FCM_SA:JSON.stringify({...account,private_key:'x'})},{MFD_FCM_SA:JSON.stringify({...account,project_id:'Bad/Project'})}])assert.equal(F.fcmAccountOf(bad),null);

 const now=Date.UTC(2026,10,12,12),jwt=await F.serviceJwt(F.fcmAccountOf(env),now),[h,c,s]=jwt.split('.');
 assert.deepEqual(JSON.parse(Buffer.from(h,'base64url')),{alg:'RS256',typ:'JWT'});
 assert.deepEqual(JSON.parse(Buffer.from(c,'base64url')),{iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now/1000,exp:now/1000+3600});
 assert.ok(await subtle.verify('RSASSA-PKCS1-v1_5',rsa.publicKey,Buffer.from(s,'base64url'),new TextEncoder().encode(h+'.'+c)));
 console.log('PASS service-account JWT (RS256) for the FCM scope verifies with the account key');

 // Sending: one token exchange, data-only high-priority message, gone vs failed.
 const calls=[];let reply=()=>new Response('{}',{status:200});
 const fetcher=async(url,init)=>{calls.push({url:String(url),init});if(String(url).startsWith('https://oauth2.googleapis.com/'))return new Response(JSON.stringify({access_token:'ya29.test',expires_in:3599}),{status:200});return reply()};
 const sender=new F.FcmSender(F.fcmAccountOf(env),fetcher),TOKEN='dGVzdA:APA91b'+'x'.repeat(140);
 assert.equal(await sender.send(TOKEN,{title:'Rest over',body:'Bench Press',tag:'rest',id:'w:0',actions:['plus15'],silent:undefined},120,'rest'),'sent');
 assert.equal(await sender.send(TOKEN,{title:'Riya liked your Upper 1',tag:'like:w-1',url:'/#/friends'},86400,'like'),'sent');
 const token=calls.filter(x=>x.url.startsWith('https://oauth2.googleapis.com/'));assert.equal(token.length,1,'access token reused');
 assert.match(token[0].init.body,/^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=[\w-]+\.[\w-]+\.[\w-]+$/);
 const send=calls.find(x=>x.url.startsWith('https://fcm.googleapis.com/'));
 assert.equal(send.url,'https://fcm.googleapis.com/v1/projects/my-fitness-dairy/messages:send');assert.equal(send.init.headers.Authorization,'Bearer ya29.test');
 assert.deepEqual(JSON.parse(send.init.body),{message:{token:TOKEN,data:{title:'Rest over',body:'Bench Press',tag:'rest',id:'w:0',actions:'plus15'},android:{priority:'HIGH',ttl:'120s',collapse_key:'rest'}}},'data-only, strings, no notification block');
 reply=()=>new Response(JSON.stringify({error:{status:'NOT_FOUND',details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}}),{status:404});
 assert.equal(await sender.send(TOKEN,{title:'x'},60,'ai'),'gone');
 reply=()=>new Response(JSON.stringify({error:{details:[{errorCode:'UNREGISTERED'}]}}),{status:400});assert.equal(await sender.send(TOKEN,{title:'x'},60,'ai'),'gone');
 reply=()=>new Response(JSON.stringify({error:{details:[{errorCode:'INVALID_ARGUMENT'}]}}),{status:400});assert.equal(await sender.send(TOKEN,{title:'x'},60,'ai'),'failed','our mistake never drops a device');
 reply=()=>new Response('',{status:503});assert.equal(await sender.send(TOKEN,{title:'x'},60,'ai'),'failed');
 reply=()=>new Response(JSON.stringify({error:{status:'PERMISSION_DENIED',details:[{errorCode:'SENDER_ID_MISMATCH'}]}}),{status:403});
 assert.equal(await sender.send(TOKEN,{title:'x'},60,'ai'),'failed');assert.equal(sender.lastError,'send 403 SENDER_ID_MISMATCH','the reason, codes only');
 const refused=new F.FcmSender(F.fcmAccountOf(env),async()=>new Response(JSON.stringify({error:'invalid_grant',error_description:'Invalid JWT Signature.'}),{status:400}));
 await assert.rejects(refused.send(TOKEN,{title:'x'},60,'ai'));assert.equal(refused.lastError,'sign-in 400 invalid_grant','a disabled or deleted key');
 // Like Cloudflare's fetch: refuses to run as another object's method ("Illegal invocation").
 const strict=function(url){if(this!==undefined&&this!==globalThis)throw new TypeError('Illegal invocation');return String(url).startsWith('https://oauth2.googleapis.com/')?Promise.resolve(new Response(JSON.stringify({access_token:'ya29.t',expires_in:3599}))):Promise.resolve(new Response('{}'))};
 assert.equal(await new F.FcmSender(F.fcmAccountOf(env),strict).send(TOKEN,{title:'x'},60,'ai'),'sent','works with a fetch that must be called on its own');
 console.log('PASS FCM send: one access token, data-only high-priority messages, uninstalled apps reported as gone, other errors kept with Google\'s error code for the log');

 // Endpoints: the app registers and removes its token through the same /push/devices routes.
 const jwk=await subtle.exportKey('jwk',(await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign'])).privateKey);
 const hubCalls=[],ns={idFromName:n=>n,get:id=>({addApp:async(t,s)=>hubCalls.push(['add',id,t,s]),removeApp:async t=>hubCalls.push(['remove',id,t]),removeDevice:async e=>hubCalls.push(['removeWeb',id,e])})};
 const config={authOrigin:'https://connect.invalid',supabase:'https://db.invalid',key:'k'},USER='11111111-1111-4111-8111-111111111111';
 const auth=async(url)=>String(url).endsWith('/auth/v1/user')?new Response(JSON.stringify({id:USER}),{status:200}):new Response('',{status:500});
 const post=(p,b)=>P.handlePush(new Request('https://connect.invalid'+p,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+'a'.repeat(40)},body:JSON.stringify(b)}),{MFD_VAPID_JWK:JSON.stringify(jwk),MFD_PUSH:ns},config,auth);
 assert.equal((await post('/push/devices',{fcm:TOKEN})).status,200);
 for(const bad of ['','short','has space '+'x'.repeat(40),'x'.repeat(5000),42,null])assert.equal((await post('/push/devices',{fcm:bad})).status,400,String(bad));
 assert.equal((await post('/push/devices/remove',{fcm:TOKEN})).status,200);
 assert.equal((await post('/push/devices/remove',{endpoint:'https://fcm.googleapis.com/fcm/send/a'})).status,200);
 assert.equal((await post('/push/devices/remove',{})).status,400);
 assert.deepEqual(hubCalls,[['add',USER,TOKEN,'https://connect.invalid'],['remove',USER,TOKEN],['removeWeb',USER,'https://fcm.googleapis.com/fcm/send/a']]);
 console.log('PASS /push/devices: app tokens registered and removed per user, malformed tokens refused');

 // The hub sends to apps beside browsers, and forgets an app FCM says is gone.
 const state=new Map([['subject','https://connect.invalid']]),apps=new Set([TOKEN,'second:'+'y'.repeat(40)]),deleted=[];
 const sql={exec(q,...a){let rows=[];
  if(/SELECT v FROM state/.test(q))rows=state.has(a[0])?[{v:state.get(a[0])}]:[];
  else if(/INSERT OR REPLACE INTO state/.test(q))state.set(a[0],a[1]);
  else if(/SELECT token FROM apps/.test(q))rows=[...apps].map(token=>({token}));
  else if(/DELETE FROM apps WHERE token=\?/.test(q)){apps.delete(a[0]);deleted.push(a[0])}
  return {toArray:()=>rows}}};
 const hub=new P.PushHub({storage:{sql}},{MFD_VAPID_JWK:JSON.stringify(jwk),MFD_FCM_SA:JSON.stringify(account)});
 const sentTo=[];hub.fcmSender={send:async(t,m,ttl,topic)=>{sentTo.push([t,m.title,ttl,topic]);return t===TOKEN?'sent':'gone'}};
 await hub.aiAdded('req-1',{title:'Claude added to Lunch',body:'Toor dal'});
 assert.equal(sentTo.length,2,'both apps');
 assert.deepEqual(sentTo.find(x=>x[0]===TOKEN).slice(1),['Claude added to Lunch',3600,'ai']);
 assert.deepEqual(deleted,['second:'+'y'.repeat(40)],'gone app forgotten');
 console.log('PASS PushHub: apps get the same messages as browsers; apps FCM reports gone are forgotten');
})().catch(e=>{console.error(e);process.exit(1)});
