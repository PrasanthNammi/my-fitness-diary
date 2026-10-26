/** Keep own cached workouts visible while upload is pending. Remote permissions remain authoritative for friends. */
export function mergeFeed(remote:any[],local:any[],uid:string,owner?:string){const index=new Map(remote.filter(w=>!owner||w.owner_id===owner).map(w=>[w.owner_id+':'+w.workout_id,w]));if(!owner||owner===uid)for(const s of local){if(!s.sets?.some((v:any)=>v.done!==false))continue;index.set(uid+':'+s.id,{owner_id:uid,workout_id:s.id,started_at:new Date(s.started).toISOString(),data:s})}return [...index.values()].sort((a,b)=>new Date(b.started_at).getTime()-new Date(a.started_at).getTime())}
export function visibleFeed(rows:any[],uid:string,friend:(id:string)=>boolean){return rows.filter(w=>w.owner_id===uid||friend(w.owner_id))}
export class SignedImages{
 private entries=new Map<string,{url:string;until:number}>();
 constructor(private now=()=>Date.now()){}
 async urls(client:any,bucket:string,paths:string[]){const unique=[...new Set(paths)],result:Record<string,string>={},missing:string[]=[];for(const path of unique){const cached=this.entries.get(bucket+':'+path);if(cached&&cached.until>this.now()+60000)result[path]=cached.url;else missing.push(path)}if(missing.length){const {data,error}=await client.storage.from(bucket).createSignedUrls(missing,900);if(error)throw error;for(const row of data||[])if(row.path&&row.signedUrl){this.entries.set(bucket+':'+row.path,{url:row.signedUrl,until:this.now()+900000});result[row.path]=row.signedUrl}}return result}
 invalidate(){this.entries.clear()}
}
