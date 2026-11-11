// Restore retained binary assets only. Old dist JavaScript must never enter a staging build.
const fs=require('node:fs'),path=require('node:path');
let restored=0;
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);
 if(entry.isDirectory())walk(file);
 else if(/\.(gif|webp|png|jpe?g|woff2?|mp4)$/i.test(file)){
  const destination=path.join('public',path.relative('dist',file));
  if(!fs.existsSync(destination)){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination,fs.constants.COPYFILE_EXCL);restored++}
 }
}}
if(fs.existsSync('dist'))walk('dist');
console.log(`Restored ${restored} retained media files without overwriting source assets`);
