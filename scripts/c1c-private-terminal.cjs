// No network/filesystem/clipboard access. Secret input is never echoed or returned in errors.
const {ManualFailure}=require('./c1c-manual-google-flow.cjs');
function hiddenInput(prompt,{input=process.stdin,output=process.stdout,timeoutMs=300000,maxLength=4096}={}){
 if(!input.isTTY||!output.isTTY||typeof input.setRawMode!=='function')return Promise.reject(new ManualFailure('MANUAL_SETUP'));
 return new Promise((resolve,reject)=>{
  let value='',done=false,escape='',pasting=false,pasteTail='';const wasRaw=!!input.isRaw;
  const restore=()=>{try{input.setRawMode(wasRaw);input.pause();output.write('\x1b[?2004l\n');}catch{/* No exception/input reflection. */}};
  const cleanup=()=>{clearTimeout(timer);input.off('data',onData);input.off('end',onEnd);input.off('error',onEnd);
   process.off('SIGINT',onEnd);process.off('SIGTERM',onEnd);process.off('exit',restore);restore();};
  const finish=(error)=>{if(done)return;done=true;cleanup();const result=value;value='';error?reject(error):resolve(result);};
  const onEnd=()=>finish(new ManualFailure('MANUAL_CANCELLED'));
  const onData=buf=>{
   const text=buf.toString('utf8');
   // Drain a forbidden bracketed paste before restoring echo, including split input chunks.
   // Rejecting its opening delimiter immediately would expose later chunks to the shell.
   for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(pasting){pasteTail=(pasteTail+ch).slice(-6);if(pasteTail==='\x1b[201~')return finish(new ManualFailure('MANUAL_CALLBACK'));continue;}
    if(escape){escape+=ch;if(escape==='\x1b[200~'){pasting=true;escape='';continue;}
     if('\x1b[200~'.startsWith(escape))continue;return finish(new ManualFailure('MANUAL_CALLBACK'));}
    if(ch==='\x1b'){value='';escape=ch;continue;}
    if(ch==='\x03'||ch==='\x04')return onEnd();
    if(ch==='\r'||ch==='\n'){
     if(i!==text.length-1&&text.slice(i)!=='\r\n')return finish(new ManualFailure('MANUAL_CALLBACK'));
     return finish();
    }
    if(ch==='\x7f'||ch==='\b')value=value.slice(0,-1);
    else if(ch.charCodeAt(0)<32||ch.charCodeAt(0)>126)return finish(new ManualFailure('MANUAL_CALLBACK'));
    else value+=ch;
    if(value.length>maxLength)return finish(new ManualFailure('MANUAL_CALLBACK'));
   }
  };
  const timer=setTimeout(()=>finish(new ManualFailure('MANUAL_EXPIRED')),timeoutMs);
  try{
   input.setRawMode(true);input.on('data',onData);input.on('end',onEnd);input.on('error',onEnd);
   process.once('SIGINT',onEnd);process.once('SIGTERM',onEnd);process.once('exit',restore);
   output.write(prompt+'\x1b[?2004h');input.resume();
  }catch{finish(new ManualFailure('MANUAL_SETUP'));}
 });
}
module.exports={hiddenInput};
