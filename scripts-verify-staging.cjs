const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const staging='gngnrmzeghjzqsmzuktl',forbidden='djyozltkmbzhwuvemxuy';
function verify(directories){
 const config=JSON.parse(fs.readFileSync('.openai/environment.json','utf8'));
 assert.equal(config.MFD_ENV,'staging');
 assert.equal(config.MFD_SUPABASE_URL,`https://${staging}.supabase.co`);
 assert.equal(config.MFD_OAUTH_ISSUER,config.MFD_SUPABASE_URL+'/auth/v1');
 assert.equal(config.MFD_MCP_WRITES,'false');
 for(const dir of directories){
  assert(fs.existsSync(dir),'Missing build directory: '+dir);
  let found=false,files=0;
  function walk(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){
   const file=path.join(folder,item.name);
   if(item.isDirectory())walk(file);
   else if(/\.(js|mjs|cjs|json|html|map)$/.test(file)){
    const content=fs.readFileSync(file,'utf8');files++;
    assert(!content.includes(forbidden),'Forbidden production reference: '+file);
    assert(!/sb_secret_[A-Za-z0-9_-]+/.test(content),'Secret key in build: '+file);
    if(content.includes(staging))found=true;
   }
  }}
  walk(dir);assert(found,'No staging project found in '+dir);
  console.log(`PASS staging artifacts: ${dir} (${files} files inspected)`);
 }
}
module.exports={verify};
if(require.main===module)verify(process.argv.slice(2).length?process.argv.slice(2):['public',process.env.MFD_BUILD_OUTPUT || 'dist']);
