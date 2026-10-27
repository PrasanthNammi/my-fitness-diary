const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
fs.rmSync('hosting/public',{recursive:true,force:true});fs.cpSync('public','hosting/public',{recursive:true});
fs.copyFileSync('.openai/hosting.json','hosting/.openai/hosting.json');
execFileSync(process.execPath,['scripts/run-framework.mjs','build'],{cwd:'hosting',stdio:'inherit'});
fs.rmSync('dist',{recursive:true,force:true});fs.cpSync('hosting/dist','dist',{recursive:true});
// Sites serves existing static paths before the Worker. Documents must reach
// the Worker for PKCE callbacks and HTTP security headers.
for(const file of ['index.html','legacy/index.html'])fs.rmSync(path.join('dist/client',file),{force:true});
