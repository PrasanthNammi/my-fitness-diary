// Explicit maintenance release. No Auth/MCP business handler or fetch dependency.
export const PREOAUTH_ORIGIN='https://mfd-connect-staging.shanustylish777.workers.dev';
const SUPABASE='https://gngnrmzeghjzqsmzuktl.supabase.co';
export interface BootstrapNamespace {idFromName(name:string):unknown;get(id:unknown):{consume(kind:string):Promise<boolean>};}
export function preoauthConfig(env:Record<string,unknown>) {
  if(env.MFD_RELEASE_MODE!=='pre-oauth' || env.MFD_ENV!=='staging' || env.MFD_MCP_WRITES!=='false' || env.MFD_SUPABASE_URL!==SUPABASE || env.MFD_OAUTH_ISSUER!==SUPABASE+'/auth/v1' || env.MFD_AUTH_ORIGIN!==PREOAUTH_ORIGIN || env.MFD_MCP_RESOURCE_URL!==PREOAUTH_ORIGIN+'/mcp' || env.MFD_ALLOWED_CLIENT_IDS!=='[]' || env.MFD_CLIENT_REDIRECTS!=='{}' || env.MFD_SUPABASE_PUBLISHABLE_KEY!==undefined) throw Error('Invalid pre-OAuth configuration');
}
function reply(status:number,html=false,metadata=false) {
  const headers={'Cache-Control':'private, no-store','Content-Type':html?'text/html; charset=utf-8':'application/json','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",'Strict-Transport-Security':'max-age=31536000',...(status===503||status===429?{'Retry-After':'60'}:{})};
  const body=metadata?JSON.stringify({resource:PREOAUTH_ORIGIN+'/mcp',authorization_servers:[SUPABASE+'/auth/v1'],bearer_methods_supported:['header']}):html?'<!doctype html><html lang="en"><meta charset="utf-8"><title>MFD staging setup</title><main><h1>MFD staging setup</h1><p>Connections are not enabled. Do not sign in or authorize clients yet.</p></main></html>':JSON.stringify({error:status===503?'Staging connections are not enabled':status===429?'Rate limited':'Request denied'});
  return new Response(body,{status,headers});
}
export function createPreoauthService(namespace:BootstrapNamespace|undefined) {
  return async(request:Request)=>{
    try {
      const url=new URL(request.url);
      if(url.origin!==PREOAUTH_ORIGIN)return reply(421);
      if(request.headers.has('origin')&&request.headers.get('origin')!==PREOAUTH_ORIGIN)return reply(403);
      const discovery=['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(url.pathname);
      const auth=['/','/login','/logout','/auth/google','/auth/google/callback','/oauth/mcp/consent','/oauth/mcp/connections','/oauth/mcp/approve'].includes(url.pathname);
      if(!discovery&&!auth&&url.pathname!=='/mcp')return reply(404);
      if(!['GET','POST'].includes(request.method)||discovery&&request.method!=='GET')return reply(405);
      if(!namespace)return reply(503);
      let timer:ReturnType<typeof setTimeout>|undefined;
      let allowed:boolean;
      try {allowed=await Promise.race([namespace.get(namespace.idFromName('mfd-staging-shared-v1')).consume(discovery?'discovery':auth?'auth':'mcp'),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Quota timeout')),2000);})]);}finally{if(timer!==undefined)clearTimeout(timer);}
      if(allowed!==true)return reply(429);
      // No credentials accepted, no cookies, redirects, upstream calls, or consent.
      return discovery?reply(200,false,true):reply(503,auth&&request.method==='GET');
    }catch{return reply(503);}
  };
}
