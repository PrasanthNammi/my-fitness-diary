const assert=require('node:assert/strict'),fs=require('fs'),{spawnSync}=require('node:child_process');
const {ownedSafariWindow}=require('../scripts/c1c-safari-owned-window.cjs');const {safeFailure}=require('../scripts/c1c-google-h1-h3-safari.cjs');
const {AUTH,CALLBACK}=require('../scripts/c1c-browser-policy.cjs');
const start=AUTH+'/auth/v1/authorize?redirect_to='+encodeURIComponent(CALLBACK)+'&code_challenge_method=s256';
const secret='synthetic-owned-code',callback=CALLBACK+'?code='+secret;
async function scenario(change={},expected){
 let time=0,closed=0,reads=0;const calls=[];
 const bridge=async(op,args)=>{calls.push(op);if(change[op]!==undefined)return typeof change[op]==='function'?change[op](args):change[op];
  if(op==='ready')return 'READY_PRIVATE';if(op==='pair')return '101';if(op==='navigate'){assert.equal(args[1],start);return 'NAVIGATED';}
  if(op==='smoke')return 'SMOKE_STARTED';if(op==='smoke_status')return 'SMOKE_OK';
  if(op==='url'){reads++;return reads===1?'https://accounts.google.com/synthetic':callback;}
  if(op==='callback')return callback+'\nEXPECTED_CALLBACK';if(op==='close'){closed++;return 'CLOSED';}throw Error('Unexpected fixture operation');};
 let w,error,reply;try{w=await ownedSafariWindow({label:'primary',bridge,now:()=>time,sleep:async ms=>time+=ms});reply=await w.authorize(start,2000);if(!expected){assert.equal(reply.url,callback);assert.equal(reply.http_method_observed,false);await assert.rejects(()=>w.authorize(start),/SAFARI_USED/);}}catch(e){error=e;}
 if(expected){assert.equal(safeFailure(error).code,expected);assert(!JSON.stringify(safeFailure(error)).includes(secret));}
 else assert(!error);
 if(w)await w.close();assert(calls.indexOf('ready')===0);if(calls.includes('url'))assert(calls.indexOf('navigate')<calls.indexOf('url'));
 return {calls,closed};
}
(async()=>{
 const good=await scenario();assert.equal(good.closed,1);
 const cancel=await scenario({ready:'CANCELLED'},'SAFARI_CANCELLED');assert.deepEqual(cancel.calls,['ready']);
 await scenario({pair:'ERROR_TABS'},'SAFARI_WINDOW');await scenario({url:'ERROR_WINDOW'},'SAFARI_WINDOW');
 await scenario({smoke:'ERROR_WINDOW'},'SAFARI_WINDOW');await scenario({smoke_status:'NOT_READY'},'SAFARI_TIMEOUT');
 await scenario({url:'https://other.invalid/?secret='+secret},'SAFARI_TARGET');
 await scenario({url:'http://accounts.google.com/'},'SAFARI_TARGET');
 await scenario({url:CALLBACK+'?code=one&code=two'},'SAFARI_CALLBACK');
 await scenario({url:CALLBACK+'?code=one#secret'},'SAFARI_CALLBACK');
 await scenario({callback:CALLBACK+'?code=changed\nEXPECTED_CALLBACK'},'SAFARI_CALLBACK');
 await scenario({callback:'ERROR_CHANGED'},'SAFARI_CALLBACK');
 await scenario({callback:'ERROR_CALLBACK'},'SAFARI_CALLBACK');
 await scenario({callback:'NOT_READY'},'SAFARI_TIMEOUT');
 await scenario({url:'https://accounts.google.com/synthetic'},'SAFARI_TIMEOUT');
 const script=fs.readFileSync('scripts/c1c-safari-bridge.applescript','utf8').split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
 for(const banned of ['do JavaScript','System Events','get cookies','history of','URL of front window','text of tab'])assert(!script.includes(banned));
 assert(script.indexOf('if beforeURL does not start with')<script.indexOf('set pageSource'));
 assert(script.includes('beforeURL is not afterURL'));assert(script.includes('count tabs of targetWindow'));
 const cli=spawnSync(process.execPath,['--require','./tests/no-network.cjs','scripts/c1c-google-h1-h3-safari.cjs'],{encoding:'utf8'});
 assert.equal(cli.status,0);assert.equal(JSON.parse(cli.stdout).requires_new_approval,true);
 assert(!JSON.stringify(safeFailure(new Error(secret))).includes(secret));
 console.log('PASS owned Safari tab model: no reads before pairing/navigation, exact callback/diagnostic/race/one-use/timeout/window guards; no native browser run');
})().catch(e=>{console.error(e);process.exitCode=1});
