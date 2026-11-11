const {readdirSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const files=readdirSync('tests').filter(f=>f.endsWith('.cjs')&&!['run-local-checks.cjs','run-performance.cjs','no-network.cjs'].includes(f)).sort();
const failed=[];
for(const file of files){
 console.log('RUN '+file);
 const result=spawnSync(process.execPath,['--require','./tests/no-network.cjs','tests/'+file],{stdio:'inherit'});
 if(result.status!==0)failed.push(file);
}
console.log(JSON.stringify({total:files.length,passed:files.length-failed.length,failed}));
process.exitCode=failed.length?1:0;
