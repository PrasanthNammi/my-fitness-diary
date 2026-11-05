// Web Push crypto: RFC 8291 Appendix A vector, a receiver-side round trip, and VAPID signature checks.
const assert=require('assert/strict'),esbuild=require('esbuild'),os=require('os'),path=require('path');
const output=path.join(os.tmpdir(),'mfd-webpush.cjs');
esbuild.buildSync({entryPoints:['hosting/independent/webpush.ts'],bundle:true,platform:'node',format:'cjs',outfile:output});
const w=require(output),subtle=crypto.subtle,text=new TextEncoder();
const jwkOf=(pub,d)=>{const raw=w.fromB64u(pub);return {kty:'EC',crv:'P-256',x:w.b64u(raw.slice(1,33)),y:w.b64u(raw.slice(33,65)),...(d?{d}:{})}};
async function receive(body,uaJwk,auth){ // what a browser does with an aes128gcm push body
  const salt=body.slice(0,16),idlen=body[20],asPublic=body.slice(21,21+idlen),sealed=body.slice(21+idlen);
  const ua=await subtle.importKey('jwk',uaJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const as=await subtle.importKey('raw',asPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await subtle.deriveBits({name:'ECDH',public:as},ua,256));
  const uaPublic=w.fromB64u(w.vapidPublicKey(uaJwk));
  const hk=async(salt,ikm,info,n)=>new Uint8Array(await subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']),n*8));
  const ikm=await hk(w.fromB64u(auth),shared,new Uint8Array([...text.encode('WebPush: info\0'),...uaPublic,...asPublic]),32);
  const cek=await hk(salt,ikm,text.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hk(salt,ikm,text.encode('Content-Encoding: nonce\0'),12);
  const plain=new Uint8Array(await subtle.decrypt({name:'AES-GCM',iv:nonce},await subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),sealed));
  assert.equal(plain.at(-1),2,'last-record delimiter');return new TextDecoder().decode(plain.slice(0,-1));
}
(async()=>{
  // RFC 8291 Appendix A.
  const v={plain:'When I grow up, I want to be a watermelon',asPriv:'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',asPub:'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    uaPriv:'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',uaPub:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',salt:'DGv6ra1nlYgDCS1FRnbzlw',auth:'BTBZMqHH6r4Tts7J_aSIgg',
    body:'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'};
  const sender={privateKey:await subtle.importKey('jwk',jwkOf(v.asPub,v.asPriv),{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),publicKey:await subtle.importKey('raw',w.fromB64u(v.asPub),{name:'ECDH',namedCurve:'P-256'},true,[])};
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/x',keys:{p256dh:v.uaPub,auth:v.auth}};
  const body=await w.encryptPayload(sub,text.encode(v.plain),w.fromB64u(v.salt),sender);
  assert.equal(w.b64u(body),v.body);
  console.log('PASS RFC 8291 Appendix A test vector');
  // Fresh keys both sides: what we send decrypts to what we meant.
  const ua=await subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),uaJwk=await subtle.exportKey('jwk',ua.privateKey);
  const auth=w.b64u(crypto.getRandomValues(new Uint8Array(16))),msg=JSON.stringify({title:'Rest over',body:'Bench Press (Barbell)',tag:'rest'});
  const sealed=await w.encryptPayload({endpoint:sub.endpoint,keys:{p256dh:w.vapidPublicKey(uaJwk),auth}},text.encode(msg));
  assert.equal(await receive(sealed,uaJwk,auth),msg);
  await assert.rejects(()=>w.encryptPayload({endpoint:sub.endpoint,keys:{p256dh:'AAAA',auth}},text.encode('x')),/Invalid subscription keys/);
  console.log('PASS encrypted payload round trip; malformed keys refused');
  // VAPID: ES256 JWT for the push service origin, verifiable with the advertised public key.
  const signer=await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await subtle.exportKey('jwk',signer.privateKey);
  const now=Date.UTC(2026,10,5,12),h=await w.vapidHeader('https://fcm.googleapis.com/fcm/send/abc',{jwk,subject:'https://mfd-connect.example'},now);
  const m=/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);assert.ok(m);
  const claims=JSON.parse(Buffer.from(m[2],'base64url'));assert.deepEqual(claims,{aud:'https://fcm.googleapis.com',exp:now/1000+43200,sub:'https://mfd-connect.example'});
  assert.equal(m[4],w.vapidPublicKey(jwk));
  const pub=await subtle.importKey('raw',w.fromB64u(m[4]),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  assert.ok(await subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,w.fromB64u(m[3]),text.encode(m[1]+'.'+m[2])));
  console.log('PASS VAPID header signs for the push service origin');
  // Only browser push services can be stored as endpoints.
  for(const ok of ['https://fcm.googleapis.com/fcm/send/a','https://web.push.apple.com/Q','https://updates.push.services.mozilla.com/wpush/v2/a','https://wns2-par02p.notify.windows.com/w/?token=a'])assert.ok(w.knownPushService(ok),ok);
  for(const bad of ['http://fcm.googleapis.com/a','https://evil.example/a','https://fcm.googleapis.com.evil.example/a','https://user:pw@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','http://127.0.0.1:9/a','not a url'])assert.ok(!w.knownPushService(bad),bad);
  assert.ok(w.knownPushService('http://127.0.0.1:9/a',true));
  console.log('PASS push endpoints limited to browser push services');
})().catch(e=>{console.error(e);process.exit(1)});
