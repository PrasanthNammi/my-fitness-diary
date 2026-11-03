const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {hiddenInput}=require('../scripts/c1c-private-terminal.cjs');
function tty(){const input=new EventEmitter();Object.assign(input,{isTTY:true,isRaw:false,setRawMode(v){this.isRaw=v;},resume(){},pause(){}});let printed='';return {input,output:{isTTY:true,write:s=>printed+=s},get printed(){return printed;}};}
(async()=>{
 const t=tty(),secret='synthetic-hidden-sentinel';let p=hiddenInput('Callback: ',t);t.input.emit('data',Buffer.from(secret+'\r'));assert.equal(await p,secret);assert(!t.printed.includes(secret));assert.equal(t.input.isRaw,false);assert.equal(t.input.listenerCount('data'),0);
 for(const input of ['\x03','\x04','\x1b[200~'+secret+'\x1b[201~','one\rtwo\r','\u00e9']){
  const a=tty();p=hiddenInput('Hidden: ',a);a.input.emit('data',Buffer.from(input));await assert.rejects(()=>p,/MANUAL_/);assert(!a.printed.includes(secret));assert.equal(a.input.isRaw,false);assert.equal(a.input.listenerCount('data'),0);
 }
 const a=tty();p=hiddenInput('Hidden: ',{...a,maxLength:3});a.input.emit('data',Buffer.from('1234'));await assert.rejects(()=>p,/MANUAL_CALLBACK/);
 const b=tty();p=hiddenInput('Hidden: ',b);b.input.emit('data',Buffer.from('ab\x7fc\r'));assert.equal(await p,'ac');
 const split=tty();p=hiddenInput('Hidden: ',split);split.input.emit('data',Buffer.from('\x1b[20'));
 split.input.emit('data',Buffer.from('0~'+secret));assert.equal(split.input.isRaw,true);assert.equal(split.input.listenerCount('data'),1);
 split.input.emit('data',Buffer.from('\x1b[201~'));await assert.rejects(()=>p,/MANUAL_CALLBACK/);assert.equal(split.input.isRaw,false);assert(!split.printed.includes(secret));
 const c=tty();p=hiddenInput('Hidden: ',c);c.input.emit('end');await assert.rejects(()=>p,/MANUAL_CANCELLED/);assert.equal(c.input.isRaw,false);
 const d=tty();await assert.rejects(()=>hiddenInput('Hidden: ',{...d,timeoutMs:1}),/MANUAL_EXPIRED/);assert.equal(d.input.isRaw,false);
 await assert.rejects(()=>hiddenInput('Hidden: ',{input:{isTTY:false},output:{isTTY:true}}),/MANUAL_SETUP/);
 console.log('PASS hidden TTY no-echo, paste/control/multiline/overflow/EOF/timeout cancellation, editing and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
