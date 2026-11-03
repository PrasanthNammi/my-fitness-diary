import {createPreoauthService,preoauthConfig,type BootstrapNamespace} from './preoauth';
export {AbuseCoordinator} from './coordinator';
const worker={async fetch(request:Request,env:Record<string,unknown>){
  try{preoauthConfig(env);return createPreoauthService(env.MFD_ABUSE as BootstrapNamespace|undefined)(request);}
  catch{return Response.json({error:'Pre-OAuth configuration unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
}};
export default worker;
