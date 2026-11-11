import type {AuthUser} from './auth-types';
type Upstream=(path:string,options?:RequestInit,token?:string)=>Promise<Response>;
type Connection={client_id:string;permissions:string[]};
export type Authorization={user?:AuthUser;client?:{id:string;name:string};redirect_url?:string;redirect_uri?:string;scope?:string};
type Proposal={id:string;client_id:string;water_goal_ml:number;revision:number;expires_at:string};
const permissions=['workouts','routines','nutrition','progress','profile'];
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const hidden=(key:string,value:string)=>`<input type="hidden" name="${escape(key)}" value="${escape(value)}">`;
const form=(action:string,content:string)=>`<form method="post" action="${action}">${content}</form>`;
function page(content:string,status=200){return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>My Fitness Diary connections</title><main><h1>My Fitness Diary connections</h1>${content}<p><a href="/">Return to diary</a> · <a href="/oauth/mcp/connections">Manage connections</a></p></main></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}})}
export async function handleMcpConsent(request:Request,upstream:Upstream,getToken:()=>Promise<string>,origin:string,writes:boolean,validateAuthorization?:(data:Authorization,path:string,token:string,owner:string)=>Promise<void>){
 const url=new URL(request.url);
 if(!['GET','POST'].includes(request.method))return page('Method not allowed',405);
 if(request.headers.get('sec-fetch-site')==='cross-site'&&request.method==='POST')return page('Same-origin request required',403);
 if(request.method==='POST'&&request.headers.get('origin')!==origin)return page('Same-origin request required',403);
 let token:string;
 try{token=await getToken()}catch{return page('<p>Sign in to your diary in another tab, then reload this page to continue. Your authorization request stays in this tab.</p>',401)}
 const verified=await upstream('/auth/v1/user',{},token);
 if(!verified.ok)return page('Please sign in again.',401);
 const user=await verified.json() as AuthUser;
 const verifiedOwner:string=user.id||'';if(!verifiedOwner)return page('Invalid session',401);
 try{
  const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  // The consent/approval UI must use a verified first-party browser identity,
  // never an OAuth client token or a token for another account.
  if(claims.client_id!==undefined || claims.aud!=='authenticated' || claims.role!=='authenticated' || claims.sub!==user.id || !claims.session_id || !(claims.exp>Date.now()/1000))return page('Use your diary browser session.',403);
 }catch{return page('Invalid session',401)}
 async function call<T=Authorization>(path:string,init:RequestInit={}){const r=await upstream(path,init,token);if(!r.ok)throw Error('Request failed');const data=r.status===204?{}:await r.json();if(validateAuthorization && /^\/auth\/v1\/oauth\/authorizations\//.test(path))await validateAuthorization(data as Authorization,path,token,verifiedOwner);return data as T}
 async function rpc<T=unknown>(operation:string,args:unknown={}){return call<T>('/rest/v1/rpc/mfd_mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,args})})}
 const identity=`<p>Signed in as ${escape(user.email||user.id)}.</p>`;
 try{
  if(request.method==='POST'){
   if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return page('Form required',415);
   const reader=request.body?.getReader();let size=0,body='';const decoder=new TextDecoder();
   if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return page('Form too large',413)}body+=decoder.decode(value,{stream:true})}
   const data=new URLSearchParams(body);
   if(url.pathname==='/oauth/mcp/connections'){
    const client=data.get('client_id')||'';
    // Local revocation first: immediately blocks old access tokens even if Auth
    // revocation is temporarily unavailable. Retrying also revokes refresh tokens.
    await rpc('revoke',{client_id:client});
    await call('/auth/v1/user/oauth/grants?client_id='+encodeURIComponent(client),{method:'DELETE'});
    return page(identity+'<p>Access revoked.</p>');
   }
   if(url.pathname==='/oauth/mcp/approve'){
    if(!writes)return page('Writes disabled',403);
    await rpc('approve',{proposal_id:data.get('proposal_id')});
    return page(identity+'<p>Approved this exact proposal for one use. Return to your client to apply it before it expires. A newer diary revision cancels this approval.</p>');
   }
   const id=data.get('authorization_id')||'';
   if(!/^[\w-]{1,200}$/.test(id))return page('Invalid authorization',400);
   const details=await call('/auth/v1/oauth/authorizations/'+encodeURIComponent(id));
   if(!details.client?.id)return page('Start a new authorization request.',400);
   if(details.user?.id!==user.id)return page('Authorization account mismatch',403);
   const approve=data.get('decision')==='approve';
   const selected=data.getAll('permission');
   if(approve){
    if(!selected.length||selected.some(p=>!permissions.includes(p)))return page('Choose at least one diary permission.',400);
   }
   const result=await call('/auth/v1/oauth/authorizations/'+encodeURIComponent(id)+'/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:approve?'approve':'deny'})});
   // Redirect URI comes exclusively from Supabase's validated authorization.
   const dest=new URL(result.redirect_url!);
   if(!['https:','http:'].includes(dest.protocol))return page('Unsupported redirect URI',400);
   // Never expand local diary permissions if native OAuth approval fails.
   // If the local save fails after native approval, the new sections stay denied.
   if(approve)await rpc('consent',{client_id:details.client.id,permissions:selected});
   return new Response(null,{status:303,headers:{Location:dest.href}});
  }
  if(url.pathname==='/oauth/mcp/connections'){
   const connections=await rpc<Connection[]>('connections');
   // Include native-only grants so a partial revocation remains recoverable.
   let notice='';try{const native=await call<{client_id:string}[]|{grants?:{client_id:string}[]}>('/auth/v1/user/oauth/grants');for(const grant of (Array.isArray(native)?native:native.grants||[])){if(!connections.some((g:Connection)=>g.client_id===grant.client_id))connections.push({client_id:grant.client_id,permissions:[]})}}catch{notice='<p>OAuth grant listing is temporarily unavailable. Local diary permissions are shown below; retry to see native-only grants.</p>'}
   return page(identity+notice+'<p>Revocation blocks diary access immediately and revokes the client’s refresh tokens.</p>'+connections.map((g:Connection)=>form('/oauth/mcp/connections',`<p>Client: ${escape(g.client_id)}<br>Permissions: ${escape(g.permissions.join(', ')||'No diary access')}</p>${hidden('client_id',g.client_id)}<button>Revoke access</button>`)).join(''));
  }
  if(url.pathname==='/oauth/mcp/approve'){
   if(!writes)return page('Writes disabled',403);
   const p=await rpc<Proposal>('review',{proposal_id:url.searchParams.get('proposal_id')});
   return page(identity+`<p>Client ${escape(p.client_id)} requests setting your water goal to <strong>${escape(p.water_goal_ml)} ml</strong> at diary revision ${escape(p.revision)}. Expires ${escape(p.expires_at)}.</p>`+form('/oauth/mcp/approve',hidden('proposal_id',p.id)+'<button>Approve this exact change once</button>'));
  }
  const id=url.searchParams.get('authorization_id')||'';
  if(!/^[\w-]{1,200}$/.test(id))return page('Invalid authorization',400);
  const details=await call('/auth/v1/oauth/authorizations/'+encodeURIComponent(id));
  if(details.redirect_url){const dest=new URL(details.redirect_url);if(!['https:','http:'].includes(dest.protocol))return page('Unsupported redirect URI',400);return new Response(null,{status:303,headers:{Location:dest.href}})}
  if(!details.client?.id)return page('Start a new authorization request.',400);
  if(details.user?.id!==user.id)return page('Authorization account mismatch',403);
  return page(identity+`<h2>Authorize ${escape(details.client.name)}</h2><p>Client: ${escape(details.client.id)}</p><p>Redirect: ${escape(details.redirect_uri)}</p><p>OAuth identity scopes: ${escape(details.scope)}</p><p>Select diary sections this application may read. Each write separately requires your explicit approval.</p>`+form('/oauth/mcp/consent',hidden('authorization_id',id)+permissions.map(p=>`<p><label><input type="checkbox" name="permission" value="${p}">${p}</label></p>`).join('')+'<button name="decision" value="approve">Allow selected access</button> <button name="decision" value="deny">Deny</button>'));
 }catch{return page('Request failed or expired. Retry, or start a new authorization. If revoking, local diary access is already blocked once local revocation succeeds; retry to finish revoking refresh tokens.',503)}
}
