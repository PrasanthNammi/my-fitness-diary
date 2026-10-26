// Keep local Worker assets in sync with the root application before Vite starts.
const fs=require('node:fs');
fs.rmSync('hosting/public',{recursive:true,force:true});
fs.cpSync('public','hosting/public',{recursive:true});
fs.copyFileSync('.openai/hosting.json','hosting/.openai/hosting.json');
