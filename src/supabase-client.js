import {createClient} from '@supabase/supabase-js';
const identityKey='mfd.session.user',legacyKey='forma.supabase.auth';
const listeners=new Set();let session=null,initializing;
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('mfd-session'):null;
function remember(value,event,broadcast=true){session=value;try{if(value?.user)localStorage.setItem(identityKey,JSON.stringify(value.user));else localStorage.removeItem(identityKey)}catch{}for(const callback of listeners)callback(event,value);if(broadcast)channel?.postMessage({type:'changed'})}
async function request(path,body){const r=await fetch('/api/auth/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok){const e=new Error(data.error||'Account services unavailable');e.status=r.status;throw e}return data}
async function readSession(){
 try{
  let old;try{old=JSON.parse(localStorage.getItem(legacyKey)||'null')}catch{}
  let data;
  if(old?.refresh_token){try{data=await request('migrate',{refresh_token:old.refresh_token})}catch(e){if(![400,401,403].includes(e.status))throw e}localStorage.removeItem(legacyKey);localStorage.removeItem(legacyKey+'-code-verifier')}
  data??=await request('session');remember(data.session,data.session?'SIGNED_IN':'SIGNED_OUT',false);return {data:{session:data.session},error:null};
 }catch(error){
  if([400,401,403].includes(error.status)){remember(null,'SIGNED_OUT',false);return {data:{session:null},error:null}}
  // Offline identity only chooses the local workspace. Server APIs still require cookies.
  let user;try{user=JSON.parse(localStorage.getItem(identityKey)||'null')}catch{}
  if(user?.id){session={user};return {data:{session},error:null}}return {data:{session:null},error};
 }
}
async function operation(path,body){try{const data=await request(path,body);if('session' in data)remember(data.session,data.session?'SIGNED_IN':'SIGNED_OUT');return {data,error:null}}catch(error){return {data:{session:null},error}}}
const auth={
 getSession(){return initializing??=(readSession().finally(()=>{initializing=null}))},
 onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}}},
 signInWithPassword:({email,password})=>operation('login',{email,password}),
 signUp:({email,password})=>operation('signup',{email,password}),
 resend:({email})=>operation('resend',{email}),
 signInWithOAuth:()=>operation('oauth',{}),
 signOut:()=>operation('logout',{}),
};
channel&&(channel.onmessage=()=>auth.getSession());
window.addEventListener('focus',()=>auth.getSession());
window.addEventListener('online',()=>auth.getSession());
const sdk=createClient(location.origin+'/api/supabase','sb_publishable_nH3vRaPWVxxY636AThDN5A_ZIlQGghL',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,credentials:'same-origin',cache:'no-store'})}});
window.formaSupabase={auth,from:sdk.from.bind(sdk),rpc:sdk.rpc.bind(sdk),storage:sdk.storage};
