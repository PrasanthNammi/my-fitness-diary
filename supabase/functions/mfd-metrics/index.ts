// Secret is never shipped to the browser. Grafana Cloud scrapes with Basic auth.
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const url = Deno.env.get('SUPABASE_URL')!;
const scrapeToken = Deno.env.get('MFD_METRICS_TOKEN') || '';
const encoder = new TextEncoder();
async function matches(value: string) {
 const digest = async (v: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(v)));
 const [a,b]=await Promise.all([digest(value),digest(scrapeToken)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='GET')return new Response('Method not allowed',{status:405});
 const header=req.headers.get('Authorization')||'';
 let supplied='';
 try{if(header.startsWith('Basic ')){const decoded=atob(header.slice(6));if(decoded.startsWith('metrics:'))supplied=decoded.slice(8)}else if(header.startsWith('Bearer '))supplied=header.slice(7)}catch{}
 if(!scrapeToken)return new Response('Monitoring secret not configured',{status:503});
 if(!supplied||!key||!await matches(supplied))return new Response('Unauthorized',{status:401});
 try{
  const r=await fetch(url+'/rest/v1/rpc/mfd_prometheus_metrics',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('Metrics unavailable');const body=await r.json();if(typeof body!=='string')throw Error('Invalid metrics');
  return new Response(body+'# TYPE mfd_metrics_exporter_up gauge\nmfd_metrics_exporter_up 1\n',{headers:{'Content-Type':'text/plain; version=0.0.4','Cache-Control':'no-store'}});
 }catch{return new Response('Metrics unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}
});
