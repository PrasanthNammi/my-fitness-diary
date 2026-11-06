/**
 * Friends feed kept on the device and updated incrementally.
 * - The feed holds the last 7 days; it's saved per account so the next app open shows it at once.
 * - After the first load, each check asks only for what changed since the last one: new or edited
 *   workouts (a photo change marks its workout), new reactions, and removal records.
 * - When the set of friends changes (accept, remove, block), the 7-day window reloads in full.
 * - Profiles keep full history, loaded 20 workouts at a time and kept in memory only.
 * Server times are used throughout. Changes can commit slightly out of order, so after the newest
 * change moves, one later check (at least OVERLAP afterwards) looks back by OVERLAP; then it's settled.
 */
export const FEED_DAYS=7,PROFILE_PAGE=20;
const DAY=86400000,OVERLAP=30000,FULL_AFTER=25*DAY,STORAGE='mfd-feed-v1:';
export type FeedRow={owner_id:string;workout_id:string;started_at:string;updated_at:string;data:any};
export type FeedReaction={user_id:string;owner_id:string;workout_id:string;created_at:string};
type Removal={kind:'workout'|'reaction';owner_id:string;workout_id:string;user_id?:string|null;removed_at:string};
type Saved={v:1;owners:string;cursor:string|null;cursorAt:number;settled:boolean;checked:number;rows:FeedRow[];reactions:FeedReaction[];photos:Record<string,string>};
const key=(owner:string,workout:string)=>owner+':'+workout;
const reactionKey=(r:{user_id?:string|null;owner_id:string;workout_id:string})=>r.user_id+':'+r.owner_id+':'+r.workout_id;
const time=(iso:string|null|undefined)=>iso?Date.parse(iso):0;
/** Server times have microseconds; JavaScript dates stop at milliseconds. Compare at full precision. */
const micros=(iso:string|null|undefined)=>{if(!iso)return 0;const f=/\.(\d+)/.exec(iso)?.[1]??'';return Date.parse(iso.replace(/\.\d+/,''))*1000+Number(f.padEnd(6,'0').slice(0,6))};
async function rows(query:any){const {data,error}=await query;if(error)throw error;return (data||[]) as any[]}

export class SocialFeed{
 rows=new Map<string,FeedRow>();reactions=new Map<string,FeedReaction>();photos=new Map<string,string>();
 private cursor:string|null=null;private cursorAt=0;private settled=false;private owners='';private checked=0;
 private oldest=new Map<string,string>();private complete=new Set<string>();
 constructor(private uid:string,private now:()=>number=()=>Date.now(),private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>|null=safeStorage()){this.restore()}

 windowStart(){return new Date(this.now()-FEED_DAYS*DAY).toISOString()}
 /** Feed: own and visible friends' workouts from the last 7 days, newest first. */
 feed(){const start=time(this.windowStart());return this.sorted([...this.rows.values()].filter(r=>time(r.started_at)>=start))}
 /** A profile's workouts loaded so far, newest first. */
 profile(owner:string){return this.sorted([...this.rows.values()].filter(r=>r.owner_id===owner))}
 hasMore(owner:string){return !this.complete.has(owner)}
 reactionList(){return [...this.reactions.values()]}
 photoFor(owner:string,workout:string){return this.photos.get(key(owner,workout))}

 /** Brings the feed up to date. `visible` = ids of accepted, unblocked friends. Returns changed workout keys. */
 async sync(c:any,visible:string[]):Promise<string[]>{
  const owners=[...new Set([this.uid,...visible])].sort().join(',');
  const full=!this.cursor||owners!==this.owners||this.now()-this.checked>FULL_AFTER;
  const changed=full?await this.full(c,owners.split(',')):await this.delta(c);
  this.owners=owners;this.checked=this.now();
  this.prune(new Set(owners.split(',')));
  await this.loadPhotos(c,changed);
  this.save();return changed;
 }

 /** Next page of a profile's history (20 older workouts). Returns how many arrived. */
 async loadProfile(c:any,owner:string){
  if(this.complete.has(owner))return 0;
  let query=c.from('mfd_social_workouts').select('*').eq('owner_id',owner).order('started_at',{ascending:false}).limit(PROFILE_PAGE);
  const before=this.oldest.get(owner);if(before)query=query.lt('started_at',before);
  const page:FeedRow[]=await rows(query);
  for(const r of page)this.rows.set(key(r.owner_id,r.workout_id),r);
  if(page.length)this.oldest.set(owner,page[page.length-1]!.started_at);
  if(page.length<PROFILE_PAGE)this.complete.add(owner);
  if(page.length){
   const ids=page.map(r=>r.workout_id);
   const [reactions,photos]=await Promise.all([rows(c.from('mfd_reactions').select('*').eq('owner_id',owner).in('workout_id',ids)),rows(c.from('mfd_workout_photos').select('*').eq('owner_id',owner).in('workout_id',ids))]);
   for(const r of reactions)this.reactions.set(reactionKey(r),r);
   for(const p of photos)this.photos.set(key(p.owner_id,p.workout_id),p.path);
  }
  return page.length;
 }

 /** After this device adds or removes its own reaction: apply it at once, the next check confirms. */
 react(owner:string,workout:string,on:boolean){const r={user_id:this.uid,owner_id:owner,workout_id:workout,created_at:new Date(this.now()).toISOString()};if(on)this.reactions.set(reactionKey(r),r);else this.reactions.delete(reactionKey(r));this.save()}

 clear(){this.rows.clear();this.reactions.clear();this.photos.clear();this.cursor=null;this.cursorAt=0;this.settled=false;this.owners='';this.checked=0;this.oldest.clear();this.complete.clear();try{this.storage?.removeItem(STORAGE+this.uid)}catch{}}

 private async full(c:any,owners:string[]){
  const start=this.windowStart();
  const [workouts,reactions]=await Promise.all([
   rows(c.from('mfd_social_workouts').select('*').gte('started_at',start).order('started_at',{ascending:false}).limit(500)),
   // Reactions on this week's workouts can't be older than the workouts themselves.
   rows(c.from('mfd_reactions').select('*').gte('created_at',start))]);
  this.rows.clear();this.reactions.clear();this.photos.clear();this.oldest.clear();this.complete.clear();
  const allowed=new Set(owners);
  for(const r of workouts)if(allowed.has(r.owner_id))this.rows.set(key(r.owner_id,r.workout_id),r);
  for(const r of reactions)if(this.rows.has(key(r.owner_id,r.workout_id)))this.reactions.set(reactionKey(r),r);
  this.moveCursor(latest(null,[...workouts.map(r=>r.updated_at),...reactions.map(r=>r.created_at)]),true);
  return [...this.rows.keys()];
 }

 private async delta(c:any){
  const started=this.now(),lookBack=!this.settled;
  // Without look-back the server's own timestamp is sent back unchanged (no precision lost).
  const since=lookBack?new Date(time(this.cursor)-OVERLAP).toISOString():this.cursor!,startIso=this.windowStart(),start=time(startIso);
  // Only this week's workouts, plus profiles open on this device: an old history import isn't downloaded.
  const profiles=[...this.oldest.keys()];
  let changes=c.from('mfd_social_workouts').select('*').gt('updated_at',since);
  changes=profiles.length?changes.or(`started_at.gte.${startIso},owner_id.in.(${profiles.join(',')})`):changes.gte('started_at',startIso);
  const changed=new Set<string>();
  const [workouts,reactions,removals]=await Promise.all([
   rows(changes.order('updated_at').limit(500)),
   rows(c.from('mfd_reactions').select('*').gt('created_at',since).order('created_at').limit(1000)),
   rows(c.from('mfd_social_removals').select('*').gt('removed_at',since).order('removed_at').limit(1000))]) as [FeedRow[],FeedReaction[],Removal[]];
  // Apply in server-time order, so "removed, then added again" ends up present (and the reverse absent).
  const events=[...workouts.map(r=>({t:micros(r.updated_at),apply:()=>{const k=key(r.owner_id,r.workout_id);if(this.rows.has(k)||time(r.started_at)>=start||this.inLoadedProfile(r)){this.rows.set(k,r);changed.add(k)}}})),
   ...reactions.map(r=>({t:micros(r.created_at),apply:()=>{if(this.rows.has(key(r.owner_id,r.workout_id)))this.reactions.set(reactionKey(r),r)}})),
   ...removals.map(x=>({t:micros(x.removed_at),apply:()=>{const k=key(x.owner_id,x.workout_id);
    if(x.kind==='workout'){const row=this.rows.get(k);if(row&&micros(row.updated_at)<=micros(x.removed_at)){this.rows.delete(k);this.photos.delete(k);changed.delete(k);for(const [rk,r] of this.reactions)if(key(r.owner_id,r.workout_id)===k)this.reactions.delete(rk)}}
    else{const rk=reactionKey(x),r=this.reactions.get(rk);if(r&&micros(r.created_at)<=micros(x.removed_at))this.reactions.delete(rk)}}}))].sort((a,b)=>a.t-b.t);
  for(const e of events)e.apply();
  const moved=this.moveCursor(latest(this.cursor,[...workouts.map(r=>r.updated_at),...reactions.map(r=>r.created_at),...removals.map(r=>r.removed_at)]));
  // A look-back check made OVERLAP after the cursor last moved has caught every late commit.
  if(!moved&&lookBack&&started-this.cursorAt>=OVERLAP)this.settled=true;
  return [...changed];
 }

 private moveCursor(next:string|null,reset=false){if(!reset&&next===this.cursor)return false;this.cursor=next;this.cursorAt=this.now();this.settled=false;return true}

 private inLoadedProfile(r:FeedRow){const oldest=this.oldest.get(r.owner_id);return !!oldest&&(this.complete.has(r.owner_id)||time(r.started_at)>=time(oldest))}

 private async loadPhotos(c:any,keys:string[]){
  if(!keys.length)return;
  const owners=[...new Set(keys.map(k=>k.split(':')[0]!))],ids=[...new Set(keys.map(k=>k.slice(k.indexOf(':')+1)))];
  const found:any[]=await rows(c.from('mfd_workout_photos').select('*').in('owner_id',owners).in('workout_id',ids));
  const wanted=new Set(keys);for(const k of keys)this.photos.delete(k);
  for(const p of found){const k=key(p.owner_id,p.workout_id);if(wanted.has(k))this.photos.set(k,p.path)}
 }

 /** Drops people who are no longer visible friends, and feed items that aged out of the window. */
 private prune(owners:Set<string>){
  const start=time(this.windowStart());
  for(const [k,r] of this.rows)if(!owners.has(r.owner_id)||(time(r.started_at)<start&&!this.oldest.has(r.owner_id)))this.rows.delete(k);
  for(const [k,r] of this.reactions)if(!this.rows.has(key(r.owner_id,r.workout_id)))this.reactions.delete(k);
  for(const k of [...this.photos.keys()])if(!this.rows.has(k))this.photos.delete(k);
  for(const o of [...this.oldest.keys()])if(!owners.has(o)){this.oldest.delete(o);this.complete.delete(o)}
 }

 private sorted(list:FeedRow[]){return list.sort((a,b)=>time(b.started_at)-time(a.started_at))}

 private restore(){try{const raw=this.storage?.getItem(STORAGE+this.uid);if(!raw)return;const s=JSON.parse(raw) as Saved;if(s.v!==1)return;
  this.owners=s.owners;this.cursor=s.cursor;this.cursorAt=s.cursorAt||0;this.settled=!!s.settled;this.checked=s.checked;
  for(const r of s.rows)this.rows.set(key(r.owner_id,r.workout_id),r);for(const r of s.reactions)this.reactions.set(reactionKey(r),r);for(const [k,p] of Object.entries(s.photos))this.photos.set(k,p)}catch{this.clear()}}
 /** Only the 7-day feed is saved on the device; profile pages stay in memory. */
 private save(){const feed=this.feed(),keep=new Set(feed.map(r=>key(r.owner_id,r.workout_id)));
  const s:Saved={v:1,owners:this.owners,cursor:this.cursor,cursorAt:this.cursorAt,settled:this.settled,checked:this.checked,rows:feed,reactions:this.reactionList().filter(r=>keep.has(key(r.owner_id,r.workout_id))),photos:Object.fromEntries([...this.photos].filter(([k])=>keep.has(k)))};
  try{this.storage?.setItem(STORAGE+this.uid,JSON.stringify(s))}catch{}}
}
function latest(current:string|null,times:(string|null|undefined)[]){let best=current;for(const t of times)if(t&&micros(t)>micros(best))best=t;return best}
function safeStorage(){try{return typeof localStorage==='undefined'?null:localStorage}catch{return null}}
