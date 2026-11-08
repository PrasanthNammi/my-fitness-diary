import type {AuthUser, AuthClaims} from './auth-types';
import {environment} from '../../src/environment';
// Stateless Streamable HTTP MCP. Supabase validates bearer signatures; the RPC
// independently enforces live sessions, consent, ownership and revisions.
export const SECTIONS = ['workouts', 'routines', 'nutrition', 'progress', 'profile'];
const versions = ['2025-03-26', '2025-06-18', '2025-11-25'];
// Write permissions are separate consent ticks; each only ever adds new entries.
export const WRITE_SECTIONS = ['log_workouts', 'log_routines', 'log_nutrition', 'log_progress'];
export const PERMISSIONS = [...SECTIONS, ...WRITE_SECTIONS];
type Schema = {type: string; description?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; minItems?: number; maxItems?: number; minimum?: number; maximum?: number; maxLength?: number; pattern?: string; enum?: string[]; format?: string};
type Tool = {name: string; section: string; description: string; inputSchema: Schema & {properties: Record<string, Schema>}; annotations: {readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean; openWorldHint: boolean}};
const date: Schema = {type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD'};
const range = {from: {...date, description: 'First day included (YYYY-MM-DD)'}, to: {...date, description: 'Last day included (YYYY-MM-DD)'}};
const page = {limit: {type: 'integer', minimum: 1, maximum: 100}, offset: {type: 'integer', minimum: 0, maximum: 100000}, order: {type: 'string', enum: ['oldest', 'newest']}};
const read = {readOnlyHint: true, destructiveHint: false, openWorldHint: false};
const add = {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false};
const object = (properties: Record<string, Schema>, required: string[] = []) => ({type: 'object', properties, ...(required.length ? {required} : {}), additionalProperties: false});
const requestId: Schema = {type: 'string', maxLength: 64, pattern: '^[A-Za-z0-9_-]+$', description: 'Optional unique id for this entry; repeating it never creates a duplicate'};
const TOOLS: Tool[] = [
 {name: 'get_workouts', section: 'workouts', description: 'List completed workouts (each with its sets), optionally within a date range.', inputSchema: object({...range, ...page}), annotations: read},
 {name: 'get_routines', section: 'routines', description: 'List saved workout routines.', inputSchema: object({limit: page.limit, offset: page.offset}), annotations: read},
 {name: 'get_nutrition', section: 'nutrition', description: 'List food diary entries (kcal and macros per entry), optionally within a date range.', inputSchema: object({...range, ...page}), annotations: read},
 {name: 'get_progress', section: 'progress', description: 'List body-weight entries, optionally within a date range.', inputSchema: object({...range, ...page}), annotations: read},
 {name: 'get_profile', section: 'profile', description: 'Read fitness profile fields (name, age, height, weight, goals) and daily nutrition targets (cal, protein, carbs, fat). The reply includes today\'s date for the user.', inputSchema: object({}), annotations: read},
 {name: 'summarize_training', section: 'workouts', description: 'Training totals per week or month: sessions, working sets, reps, volume (kg x reps) and minutes. Warm-up sets are excluded.', inputSchema: object({...range, group: {type: 'string', enum: ['week', 'month']}}), annotations: read},
 {name: 'list_exercises', section: 'workouts', description: 'Exercises performed, with muscle group, session and set counts and the last date. Use the names with exercise_progress.', inputSchema: object(range), annotations: read},
 {name: 'exercise_progress', section: 'workouts', description: 'Per-session history for one exercise: heaviest set, estimated 1RM (Epley, sets of 1-12 reps), volume and reps, plus a next-session weight suggestion (double progression).', inputSchema: object({exercise: {type: 'string', maxLength: 120, description: 'Exercise name, case-insensitive'}, ...range}, ['exercise']), annotations: read},
 {name: 'personal_records', section: 'workouts', description: 'Personal records per exercise: heaviest set and best estimated 1RM with dates, and whether each is from the last 30 days.', inputSchema: object(range), annotations: read},
 {name: 'muscle_volume', section: 'workouts', description: 'Working sets per muscle group (Chest, Back, Shoulders, Arms, Legs, Core) in total and per week. Exercises the app cannot classify are listed separately.', inputSchema: object(range), annotations: read},
 {name: 'summarize_nutrition', section: 'nutrition', description: 'Nutrition totals and daily averages per day, week or month: kcal, protein, carbs, fat and days logged, compared with the user\'s daily targets.', inputSchema: object({...range, group: {type: 'string', enum: ['day', 'week', 'month']}}), annotations: read},
 {name: 'list_saved_foods', section: 'nutrition', description: 'Foods the user saved or already logged, with kcal and macros per stated amount. Use a food_id with log_meal so values come from the diary instead of estimates.', inputSchema: object({search: {type: 'string', maxLength: 80, description: 'Part of the food name or brand'}}), annotations: read},
 {name: 'weight_trend', section: 'progress', description: 'Body-weight trend: first, last, change, min, max, average and weekly averages.', inputSchema: object(range), annotations: read},
 {name: 'log_workout', section: 'log_workouts', description: 'Add a NEW completed workout to the diary (today or earlier). Never edits or deletes existing workouts. Confirm the details with the user first. Dates: days before yesterday can only be filled when nothing is logged there yet; if the tool says something is already logged, tell the user to change it in the app.', annotations: add, inputSchema: object({
  date, name: {type: 'string', maxLength: 80}, duration_minutes: {type: 'integer', minimum: 1, maximum: 600}, request_id: requestId,
  exercises: {type: 'array', minItems: 1, maxItems: 30, items: object({exercise: {type: 'string', maxLength: 80}, sets: {type: 'array', minItems: 1, maxItems: 50, items: object({
   kg: {type: 'number', minimum: 0, maximum: 1000}, reps: {type: 'integer', minimum: 0, maximum: 1000}, duration_seconds: {type: 'integer', minimum: 0, maximum: 86400},
   distance_meters: {type: 'number', minimum: 0, maximum: 1000000}, rpe: {type: 'number', minimum: 1, maximum: 10}, type: {type: 'string', enum: ['warmup', 'normal', 'failure', 'dropset']}})}}, ['exercise', 'sets'])}}, ['date', 'exercises'])},
 {name: 'create_routine', section: 'log_routines', description: 'Save a NEW workout routine (a plan: exercises with target sets, reps, weight and rest) to the routines list. Never changes or deletes existing routines. Base it on the user\'s goals and history; reuse exercise names exactly as list_exercises or get_routines return them so the app links them. Confirm the plan with the user first. Names must be new; an existing routine name is refused.', annotations: add, inputSchema: object({
  name: {type: 'string', maxLength: 80}, request_id: requestId,
  exercises: {type: 'array', minItems: 1, maxItems: 30, items: object({exercise: {type: 'string', maxLength: 80}, rest_seconds: {type: 'integer', minimum: 0, maximum: 900}, notes: {type: 'string', maxLength: 300}, sets: {type: 'array', minItems: 1, maxItems: 20, items: object({
   kg: {type: 'number', minimum: 0, maximum: 1000}, reps: {type: 'integer', minimum: 0, maximum: 1000}, duration_seconds: {type: 'integer', minimum: 0, maximum: 86400},
   distance_meters: {type: 'number', minimum: 0, maximum: 1000000}, type: {type: 'string', enum: ['warmup', 'normal', 'failure', 'dropset']}})}}, ['exercise', 'sets'])}}, ['name', 'exercises'])},
 {name: 'suggest_workout_targets', section: 'log_routines', description: 'Suggest target sets (weight and reps, or time) for the NEXT session of one of the user\'s routines. Only a suggestion: it never changes the routine or any logged workout. The user reviews it in the app and may use it; used targets only appear as faded values until the user ticks each set. Base targets on exercise_progress and get_routines; use the routine and exercise names exactly as get_routines returns them, and give a short reason per exercise. A newer suggestion for the same routine replaces the older one; suggestions expire after the routine\'s next workout or after 7 days. Tell the user to open the app to review.', annotations: add, inputSchema: object({
  routine: {type: 'string', maxLength: 80, description: 'Exact routine name from get_routines'}, note: {type: 'string', maxLength: 300, description: 'One or two sentences for the user'}, request_id: requestId,
  exercises: {type: 'array', minItems: 1, maxItems: 30, items: object({exercise: {type: 'string', maxLength: 80}, reason: {type: 'string', maxLength: 300}, sets: {type: 'array', minItems: 1, maxItems: 20, items: object({
   kg: {type: 'number', minimum: 0, maximum: 1000}, reps: {type: 'integer', minimum: 0, maximum: 1000}, duration_seconds: {type: 'integer', minimum: 0, maximum: 86400},
   distance_meters: {type: 'number', minimum: 0, maximum: 1000000}, type: {type: 'string', enum: ['warmup', 'normal', 'failure', 'dropset']}})}}, ['exercise', 'sets'])}}, ['routine', 'exercises'])},
 {name: 'start_workout', section: 'log_routines', description: 'Start a NEW workout in the app right now, ready to do: either one of the user\'s routines (routine: exact name from get_routines) or exercises you choose with planned sets. Planned weights and reps appear as faded values; nothing is logged until the user ticks each set in the app. Never replaces a workout that is already in progress: if one is running, the tool says so and the user must finish or discard it in the app first. Reuse exercise names exactly as list_exercises, get_routines or get_workouts return them so the app links them. Confirm the plan with the user first, then tell them to open the app.', annotations: add, inputSchema: object({
  routine: {type: 'string', maxLength: 80, description: 'Start this saved routine (exact name from get_routines). Leave out when giving exercises.'},
  name: {type: 'string', maxLength: 80, description: 'Workout title (default: the routine name, or "Workout")'}, request_id: requestId,
  exercises: {type: 'array', minItems: 1, maxItems: 30, description: 'The exercises to do, when not starting a routine', items: object({exercise: {type: 'string', maxLength: 80}, rest_seconds: {type: 'integer', minimum: 0, maximum: 900}, sets: {type: 'array', minItems: 1, maxItems: 20, items: object({
   kg: {type: 'number', minimum: 0, maximum: 1000}, reps: {type: 'integer', minimum: 0, maximum: 1000}, duration_seconds: {type: 'integer', minimum: 0, maximum: 86400},
   distance_meters: {type: 'number', minimum: 0, maximum: 1000000}, type: {type: 'string', enum: ['warmup', 'normal', 'failure', 'dropset']}})}}, ['exercise', 'sets'])}})},
 {name: 'log_meal', section: 'log_nutrition', description: 'Add a NEW food diary entry (up to 2 days ahead for planning). Prefer a saved food: pass food_id from list_saved_foods with amount in the food\'s unit, and leave out name, kcal and macros. Otherwise give name, kcal and macros for the amount eaten. Never edits or deletes entries. Confirm the details with the user first. Dates: days before yesterday can only be filled when nothing is logged there yet; if the tool says something is already logged, tell the user to change it in the app.', annotations: add, inputSchema: object({
  date, meal: {type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack']}, food_id: {type: 'string', maxLength: 200, description: 'From list_saved_foods'}, name: {type: 'string', maxLength: 120}, amount: {type: 'number', minimum: 0.01, maximum: 10000}, unit: {type: 'string', enum: ['g', 'ml', 'serving']},
  kcal: {type: 'number', minimum: 0, maximum: 10000}, protein: {type: 'number', minimum: 0, maximum: 1000}, carbs: {type: 'number', minimum: 0, maximum: 1000}, fat: {type: 'number', minimum: 0, maximum: 1000}, request_id: requestId}, ['date', 'meal', 'amount', 'unit'])},
 {name: 'log_weight', section: 'log_progress', description: 'Add a NEW body-weight entry (today or earlier). Never edits or deletes entries. Confirm with the user first. Dates: days before yesterday can only be filled when nothing is logged there yet; if the tool says something is already logged, tell the user to change it in the app.', annotations: add, inputSchema: object({date, kg: {type: 'number', minimum: 20, maximum: 400}, request_id: requestId}, ['date', 'kg'])},
 {name: 'propose_water_goal', section: 'profile-write', description: 'Prepare a water goal change. Requires separate browser approval; does not modify the diary.', inputSchema: object({water_goal_ml: {type: 'integer', minimum: 250, maximum: 10000}, expected_revision: {type: 'integer', minimum: 1}}, ['water_goal_ml', 'expected_revision']), annotations: {readOnlyHint: false, destructiveHint: false, openWorldHint: false}},
 {name: 'apply_water_goal', section: 'profile-write', description: 'Apply an explicitly approved proposal once, if its workspace revision still matches.', inputSchema: object({proposal_id: {type: 'string', format: 'uuid'}}, ['proposal_id']), annotations: {readOnlyHint: false, destructiveHint: false, openWorldHint: false}},
];
// Ready-made conversation starters, shown by apps that support MCP prompts.
const PROMPTS = [
 {name: 'weekly_review', title: 'Weekly review', description: 'Review the last 7 days of training, nutrition and body weight.',
  text: 'Review my last 7 days in My Fitness Diary. Use summarize_training, muscle_volume, personal_records, summarize_nutrition (compare with my targets) and weight_trend. Give 3 wins, 3 things to improve and one concrete focus for next week. Only use tools I have allowed.'},
 {name: 'plan_next_week', title: 'Plan next week', description: 'Suggest next week\'s training from your history and routines.',
  text: 'Plan my training for next week. Look at my routines (get_routines), my recent training (summarize_training, muscle_volume) and exercise_progress for my main lifts, then propose sessions with weights and reps. If I agree, send the targets for my routines with suggest_workout_targets so I can review them in the app. Ask before saving anything.'},
 {name: 'check_nutrition', title: 'Check my nutrition', description: 'Compare recent eating with your calorie and protein targets.',
  text: 'Check my nutrition for the last 14 days with summarize_nutrition (group by day) against my daily targets. Point out days far off target and suggest simple fixes using foods I already eat (list_saved_foods).'},
];
// Validates the JSON-schema subset used above. The diary RPC re-validates everything.
function invalid(value: unknown, schema: Schema, at: string): string | null {
 if (schema.type === 'object') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `Invalid ${at}`;
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(v)) if (!schema.properties || !Object.hasOwn(schema.properties, key)) return `Unknown argument ${at}.${key}`;
  for (const key of schema.required || []) if (v[key] === undefined) return `Missing ${at}.${key}`;
  for (const [key, sub] of Object.entries(schema.properties || {})) if (v[key] !== undefined) {const p = invalid(v[key], sub, at + '.' + key); if (p) return p;}
  return null;
 }
 if (schema.type === 'array') {
  if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) return `Invalid ${at}`;
  for (let i = 0; i < value.length; i++) {const p = invalid(value[i], schema.items!, `${at}[${i}]`); if (p) return p;}
  return null;
 }
 if (schema.type === 'string') {
  if (typeof value !== 'string' || value.length > (schema.maxLength ?? 1000) || (schema.enum && !schema.enum.includes(value)) || (schema.pattern && !new RegExp(schema.pattern).test(value))) return `Invalid ${at}`;
  if (schema.format === 'uuid' && !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) return `Invalid ${at}`;
  if (schema === date || schema.pattern === date.pattern) {const d = new Date(value + 'T00:00:00Z'); if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return `Invalid ${at}`;}
  return value.trim() ? null : `Invalid ${at}`;
 }
 const n = value as number;
 if (typeof n !== 'number' || !Number.isFinite(n) || (schema.type === 'integer' && !Number.isSafeInteger(n)) || n < (schema.minimum ?? -Infinity) || n > (schema.maximum ?? Infinity)) return `Invalid ${at}`;
 return null;
}

type Upstream = (path: string, init?: RequestInit, token?: string) => Promise<Response>;
const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
export async function handleMcp(request: Request, upstream: Upstream, origin: string, writes = false, issuer = environment().MFD_OAUTH_ISSUER, resourceUrl = origin + '/mcp'): Promise<Response> {
 const url = new URL(request.url), resource = resourceUrl;
 const unauthorized=()=>new Response(JSON.stringify({error:'Invalid or missing MCP access token'}),{status:401,headers:{'Content-Type':'application/json','WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,'Cache-Control':'private, no-store'}});
 if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') {
  return json({resource, authorization_servers: [issuer], bearer_methods_supported: ['header']});
 }
 if (request.headers.has('origin') && request.headers.get('origin') !== origin) return json({error: 'Invalid origin'}, 403);
 const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '')?.[1];
 if (!token) return unauthorized();
 try {
  const verified = await upstream('/auth/v1/user', {}, token);
  if (!verified.ok) return unauthorized();
  const user = await verified.json() as AuthUser;
  let claims:AuthClaims;try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))}catch{return unauthorized()}
  if (claims.sub !== user.id || claims.iss !== issuer || claims.aud !== resource || !claims.client_id || claims.role !== 'authenticated' || !claims.session_id || !((claims.exp ?? 0) > Date.now()/1000)) return unauthorized();
  return await serveMcp(request, {origin, writes, call: (operation, args) => upstream('/rest/v1/rpc/mfd_mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,args})},token)});
 } catch {return json({error:'MCP service unavailable'},503)}
}
// JSON-RPC/tool layer for a caller whose access was already verified. `call` reaches the
// fixed mfd_mcp RPC; `sections` (when given) limits listed tools to the consented sections.
export async function serveMcp(request: Request, {origin, writes, sections, call}: {origin: string; writes: boolean; sections?: string[]; call: (operation: string, args: Record<string, unknown>) => Promise<Response>}): Promise<Response> {
 try {
  if (request.headers.has('origin') && request.headers.get('origin') !== origin) return json({error: 'Invalid origin'}, 403);
  if (request.method !== 'POST') return new Response(null, {status:405,headers:{Allow:'POST'}});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON required'},415);
  if (!(request.headers.get('accept') || '').includes('application/json') || !(request.headers.get('accept') || '').includes('text/event-stream')) return json({error:'Accept JSON and event-stream'},406);
  const version = request.headers.get('mcp-protocol-version');
  if (version && !versions.includes(version)) return json({error:'Unsupported protocol version'},400);
  const reader=request.body?.getReader(); let size=0, body=''; const decoder=new TextDecoder();
  if(reader) for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();return json({error:'Request too large'},413)}body+=decoder.decode(part.value,{stream:true})}
  let msg:{jsonrpc?:string;id?:string|number;method?:string;params?:{protocolVersion?:string;name?:string;arguments?:Record<string,unknown>}}; try {msg=JSON.parse(body)}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},400)}
  if (!msg || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string' || (msg.id !== undefined && typeof msg.id !== 'string' && typeof msg.id !== 'number')) return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
  const reply=(result:unknown)=>json({jsonrpc:'2.0',id:msg.id,result});
  const error=(code:number,message:string)=>json({jsonrpc:'2.0',id:msg.id??null,error:{code,message}});
  if (msg.id === undefined) return msg.method==='notifications/initialized'?new Response(null,{status:202}):error(-32600,'Request id required');
  if (msg.method==='initialize') return reply({protocolVersion:versions.includes(msg.params?.protocolVersion ?? '')?msg.params!.protocolVersion:'2025-03-26',capabilities:{tools:{},prompts:{}},serverInfo:{name:'my-fitness-diary',title:'My Fitness Diary',version:'1.0.0',icons:[{src:origin+'/icon.png',mimeType:'image/png',sizes:['256x256']},{src:origin+'/icon.svg',mimeType:'image/svg+xml',sizes:['any']}]}});
  if (msg.method==='ping') return reply({});
  // Without `sections` (direct Supabase-token path) only the original read tools exist.
  const definitions=TOOLS.filter(t=>t.section==='profile-write'?writes&&(!sections||sections.includes('profile')):sections?sections.includes(t.section):t.name.startsWith('get_')).map(({section,...tool})=>(void section,tool));
  if (msg.method==='tools/list') return reply({tools:definitions});
  if (msg.method==='prompts/list') return reply({prompts:PROMPTS.map(({text,...p})=>(void text,p))});
  if (msg.method==='prompts/get') {const p=PROMPTS.find(x=>x.name===msg.params?.name);return p?reply({description:p.description,messages:[{role:'user',content:{type:'text',text:p.text}}]}):error(-32602,'Unknown prompt');}
  if (msg.method!=='tools/call') return error(-32601,'Method not found');
  const name=msg.params?.name, definition=definitions.find(t=>t.name===name), args=msg.params?.arguments??{};
  if (!definition) return error(-32602,'Unknown tool');
  if (!args || typeof args!=='object' || Array.isArray(args)) return error(-32602,'Invalid arguments');
  const problem=invalid(args,definition.inputSchema,'arguments');
  if (problem) return error(-32602,problem);
  const r=await call(name!.replace(/^get_/,''),args);
  if (!r.ok) {
   // Validation messages raised by the diary RPC itself (SQLSTATE 22023) are safe to show.
   let detail='';try{const e=await r.json() as {code?:string;message?:string};if(e.code==='22023'&&typeof e.message==='string')detail=e.message.slice(0,200);}catch{/* generic below */}
   return reply({isError:true,content:[{type:'text',text:detail||(r.status===409?'Workspace changed or proposal expired. Request new approval.':'Access denied or consent revoked.')}]});
  }
  const data=await r.json() as {proposal_id?:string;approval_url?:string};
  if(name==='propose_water_goal') data.approval_url=origin+'/oauth/mcp/approve?proposal_id='+encodeURIComponent(data.proposal_id!);
  return reply({content:[{type:'text',text:JSON.stringify(data)}],isError:false});
 } catch {return json({error:'MCP service unavailable'},503)}
}

