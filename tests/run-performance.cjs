const {execFileSync}=require('child_process');
for(const file of ['workspace-merge','catalogue','store-performance','bridge-performance','sync-performance','app-cache','app-update-safety'])execFileSync(process.execPath,['tests/'+file+'.cjs'],{stdio:'inherit'});
