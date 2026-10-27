// Stateless Streamable HTTP MCP. Supabase validates bearer signatures; the RPC
// independently enforces live sessions, consent, ownership and revisions.
const sections = ['workouts', 'routines', 'nutrition', 'progress', 'profile'];
const versions = ['2025-03-26', '2025-06-18', '2025-11-25'];
type Upstream = (path: string, init?: RequestInit, token?: string) => Promise<Response>;
const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
export async function handleMcp(request: Request, upstream: Upstream, origin: string, writes = false): Promise<Response> {
 const url = new URL(request.url), resource = origin + '/mcp';
 const unauthorized=()=>new Response(JSON.stringify({error:'Invalid or missing MCP access token'}),{status:401,headers:{'Content-Type':'application/json','WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,'Cache-Control':'private, no-store'}});
 if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') {
  return json({resource, authorization_servers: ['https://djyozltkmbzhwuvemxuy.supabase.co/auth/v1'], bearer_methods_supported: ['header']});
 }
 if (request.headers.has('origin') && request.headers.get('origin') !== origin) return json({error: 'Invalid origin'}, 403);
 const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '')?.[1];
 if (!token) return unauthorized();
 try {
  const verified = await upstream('/auth/v1/user', {}, token);
  if (!verified.ok) return unauthorized();
  const user = await verified.json() as any;
  let claims:any;try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))}catch{return unauthorized()}
  if (claims.sub !== user.id || claims.iss !== 'https://djyozltkmbzhwuvemxuy.supabase.co/auth/v1' || claims.aud !== resource || !claims.client_id || claims.role !== 'authenticated' || !claims.session_id || !(claims.exp > Date.now()/1000)) return unauthorized();
  if (request.method !== 'POST') return new Response(null, {status:405,headers:{Allow:'POST'}});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON required'},415);
  if (!(request.headers.get('accept') || '').includes('application/json') || !(request.headers.get('accept') || '').includes('text/event-stream')) return json({error:'Accept JSON and event-stream'},406);
  const version = request.headers.get('mcp-protocol-version');
  if (version && !versions.includes(version)) return json({error:'Unsupported protocol version'},400);
  const reader=request.body?.getReader(); let size=0, body=''; const decoder=new TextDecoder();
  if(reader) for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return json({error:'Request too large'},413)}body+=decoder.decode(part.value,{stream:true})}
  let msg:any; try {msg=JSON.parse(body)}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},400)}
  if (!msg || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string' || (msg.id !== undefined && typeof msg.id !== 'string' && typeof msg.id !== 'number')) return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
  const reply=(result:unknown)=>json({jsonrpc:'2.0',id:msg.id,result});
  const error=(code:number,message:string)=>json({jsonrpc:'2.0',id:msg.id??null,error:{code,message}});
  if (msg.id === undefined) return msg.method==='notifications/initialized'?new Response(null,{status:202}):error(-32600,'Request id required');
  if (msg.method==='initialize') return reply({protocolVersion:versions.includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'my-fitness-diary',version:'1.0.0'}});
  if (msg.method==='ping') return reply({});
  const definitions=sections.map(name=>({name:'get_'+name,description:`Read your consented ${name}. Progress returns weight history.`,inputSchema:{type:'object',properties:name==='profile'?{}:{limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0,maximum:100000}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}));
  if (writes) definitions.push(...[
   {name:'propose_water_goal',description:'Prepare a water goal change. Requires separate browser approval; does not modify the diary.',inputSchema:{type:'object',properties:{water_goal_ml:{type:'integer',minimum:250,maximum:10000},expected_revision:{type:'integer',minimum:1}},required:['water_goal_ml','expected_revision'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
   {name:'apply_water_goal',description:'Apply an explicitly approved proposal once, if its workspace revision still matches.',inputSchema:{type:'object',properties:{proposal_id:{type:'string',format:'uuid'}},required:['proposal_id'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
  ] as any);
  if (msg.method==='tools/list') return reply({tools:definitions});
  if (msg.method!=='tools/call') return error(-32601,'Method not found');
  const name=msg.params?.name, definition=definitions.find(t=>t.name===name), args=msg.params?.arguments??{};
  if (!definition) return error(-32602,'Unknown tool');
  if (!args || typeof args!=='object' || Array.isArray(args) || Object.keys(args).some(k=>!Object.hasOwn(definition.inputSchema.properties,k))) return error(-32602,'Invalid arguments');
  if ((args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>100)) || (args.offset!==undefined&&(!Number.isInteger(args.offset)||args.offset<0||args.offset>100000))) return error(-32602,'Invalid pagination');
  if (name==='propose_water_goal' && (!Number.isSafeInteger(args.expected_revision)||args.expected_revision<1||!Number.isInteger(args.water_goal_ml)||args.water_goal_ml<250||args.water_goal_ml>10000)) return error(-32602,'Invalid proposal');
  if (name==='apply_water_goal' && !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(args.proposal_id||'')) return error(-32602,'Invalid proposal id');
  const r=await upstream('/rest/v1/rpc/mfd_mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:name.replace(/^get_/,''),args})},token);
  if (!r.ok) return reply({isError:true,content:[{type:'text',text:r.status===409?'Workspace changed or proposal expired. Request new approval.':'Access denied or consent revoked.'}]});
  const data=await r.json() as any;
  if(name==='propose_water_goal') data.approval_url=origin+'/oauth/mcp/approve?proposal_id='+encodeURIComponent(data.proposal_id);
  return reply({content:[{type:'text',text:JSON.stringify(data)}],isError:false});
 } catch {return json({error:'MCP service unavailable'},503)}
}
