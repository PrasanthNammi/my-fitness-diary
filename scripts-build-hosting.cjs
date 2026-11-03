const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
fs.rmSync('hosting/public',{recursive:true,force:true});fs.cpSync('public','hosting/public',{recursive:true});
fs.copyFileSync('.openai/hosting.json','hosting/.openai/hosting.json');
execFileSync(process.execPath,['scripts/run-framework.mjs','build'],{cwd:'hosting',stdio:'inherit'});
const output=process.env.MFD_BUILD_OUTPUT || 'dist';
if(!['dist','.sites-runtime/phase-b-dist'].includes(output))throw Error('Unsupported build output directory');
fs.rmSync(output,{recursive:true,force:true});fs.cpSync('hosting/dist',output,{recursive:true});
// Sites serves existing static paths before the Worker. Documents must reach
// the Worker for PKCE callbacks and HTTP security headers.
for(const file of ['index.html','legacy/index.html'])fs.rmSync(path.join(output,'client',file),{force:true});

require('./scripts-verify-staging.cjs').verify(['public',output]);
