// LOCAL ONLY: fresh disposable PostgreSQL 17.11 cluster, Unix socket, no TCP/hosted URL.
// External pg driver is test tooling only; do not add it to application dependencies.
const {statSync}=require('node:fs');
const {run}=require('../../tests/staging-remediation.cjs');
async function main(){
 const socket=process.env.MFD_C01_LOCAL_SOCKET;
 if(!socket || !socket.startsWith('/tmp/mfd-c01-') || (statSync(socket).mode&0o077))throw Error('Private /tmp/mfd-c01-* socket directory required');
 if(!process.env.MFD_C01_PG_DRIVER)throw Error('Provide absolute external pg driver module path');
 const {Client,types}=require(process.env.MFD_C01_PG_DRIVER);
 types.setTypeParser(20,Number);
 const config={host:socket,port:55471,user:'c01_fixture_admin',database:'postgres'};
 const admin=new Client(config);await admin.connect();
 try{
  const info=(await admin.query("select current_user,current_setting('server_version') as version")).rows[0];
  if(info.current_user!=='c01_fixture_admin'||!/^17\.11(?:\s|$)/.test(info.version))throw Error('Expected disposable fixture admin on PostgreSQL 17.11');
  if((await admin.query("select 1 from pg_roles where rolname='postgres'")).rows.length)throw Error('Fresh disposable cluster required; postgres role already exists');
  await admin.query('create role postgres superuser login');
  await admin.query('create database mfd_c01_rehearsal owner postgres');
 }finally{await admin.end()}
 const client=new Client({...config,database:'mfd_c01_rehearsal'});await client.connect();
 try{
  console.log('Native engine:',(await client.query('select version()')).rows[0].version);
  await client.query('set session authorization postgres');
  await run({exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args),close:async()=>{}});
 }finally{await client.end()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
