import {navigate} from '../lib/router';
import {validateImageFile,assertImageDimensions} from '../lib/imageSafety';
import {useEffect,useState,useRef,useMemo,useSyncExternalStore} from 'react';
import {mergeFeed,visibleFeed,SignedImages} from '../lib/socialData';
import {SocialFeed,FEED_DAYS} from '../lib/socialFeed';
import {ChatSync,type ChatMessage} from '../lib/chatSync';
import {ArrowLeft,ArrowUp,Ban,Camera,Check,ChevronDown,Clock,CopyPlus,GitCompareArrows,Heart,Inbox,LockKeyhole,MessageCircle,MoreHorizontal,Pencil,RefreshCw,Search,Share2,Timer,Trash2,UserMinus,UserPlus,Users,X} from 'lucide-react';
import {client,engine} from '../adapters/engine';
import {useDB,update} from '../data/store';
import {ConfirmSheet,Empty,InfoButton,Segmented,Sheet,TopBar,toast} from '../components/ui';
import {routineFromWorkout} from '../data/repositories';
import {toDB} from '../adapters/compat';

type P={user_id:string;username:string;display_name:string;avatar_path?:string|null;created_at?:string};
type View={kind:'feed'}|{kind:'me'}|{kind:'profile';username:string}|{kind:'chat';username:string};
async function checked(query:any){let {data,error}=await query;if(error)throw error;return data}
async function imageBlob(file:File,edge:number){await validateImageFile(file);let url=URL.createObjectURL(file);try{let img=new Image();img.src=url;await img.decode();assertImageDimensions(img.naturalWidth,img.naturalHeight);let c=document.createElement('canvas'),scale=Math.min(1,edge/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d')!.drawImage(img,0,0,c.width,c.height);let b=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',.82));if(!b||b.size>(edge===400?1:2)*1024*1024)throw Error('Image too large');return b}finally{URL.revokeObjectURL(url)}}
const ago=(t:number,now=Date.now())=>{const m=Math.max(0,Math.round((now-t)/60000));return m<1?'now':m<60?`${m} min`:m<1440?`${Math.round(m/60)} h`:new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short'})};
const left=(iso:string,now:number)=>{const s=Math.max(0,Math.round((new Date(iso).getTime()-now)/1000));return s>=3600?`${Math.ceil(s/3600)} h`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};

/** Friends: feed of friends' finished workouts, profiles, people, requests, inbox and disappearing chat. */
export function FriendsScreen({view}:{view:View}){
 const uid=engine()?.peek().user?.id;const c=client();
 const [profiles,setProfiles]=useState<P[]>([]),[links,setLinks]=useState<any[]>([]),[blocks,setBlocks]=useState<any[]>([]),[mine,setMine]=useState<P|null>(null);
 const [workouts,setWorkouts]=useState<any[]>([]),[reactions,setReactions]=useState<any[]>([]),[photos,setPhotos]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[limit,setLimit]=useState(50),[loading,setLoading]=useState(false);
 const [people,setPeople]=useState(false),[inbox,setInbox]=useState(false),[menu,setMenu]=useState(false),[compare,setCompare]=useState(false),[unread,setUnread]=useState<any[]>([]);
 const [confirm,setConfirm]=useState<{title:string;body?:string;label:string;run:()=>Promise<any>}|null>(null);
 const [thread,setThread]=useState<{owner:string;workout:string;title:string}|null>(null),[,setTick]=useState(0);
 const localHistory=useDB(d=>d.workouts);const imageCache=useRef(new SignedImages());
 const syncState=useSyncExternalStore(fn=>engine()?.subscribe(fn)||(()=>{}),()=>{const s=engine()?.peek();return s?.conflict||s?.error?'error':s?.offline?'offline':s?.dirty||s?.busy?'pending':'saved'});
 const feedRef=useRef<SocialFeed|null>(null),[totals,setTotals]=useState<{workouts:number;volume:number}|null>(null);
 const selected=view.kind==='profile'||view.kind==='chat'?profiles.find(p=>p.username===view.username)||null:view.kind==='me'?mine:null;
 const profileOwner=view.kind==='profile'||view.kind==='me'?selected?.user_id:undefined;
 useEffect(()=>{imageCache.current=new SignedImages();setPhotos({});feedRef.current=uid?new SocialFeed(uid):null;setWorkouts(feedRef.current?.feed()||[]);setReactions(feedRef.current?.reactionList()||[])},[uid]);
 useEffect(()=>{setLimit(50);setMenu(false);setCompare(false)},[view.kind,selected?.user_id]);
 const localSessions=useMemo(()=>engine()?.peek().state.sessions||[],[localHistory,uid]);
 const displayed=useMemo(()=>{const since=Date.now()-FEED_DAYS*86400000;return mergeFeed(workouts,profileOwner?localSessions:localSessions.filter((x:any)=>x.started>=since),uid||'',profileOwner)},[workouts,localSessions,uid,profileOwner]);
 useEffect(()=>{if(!compare||!selected)return;let canceled=false;setTotals(null);c.rpc('mfd_social_totals',{owner:selected.user_id}).then(({data}:any)=>{if(!canceled&&data?.[0])setTotals({workouts:Number(data[0].workouts),volume:Number(data[0].volume)})});return()=>{canceled=true}},[compare,selected?.user_id]);
 const friend=(id:string)=>!blocks.some(b=>(b.owner_id===uid&&b.target_id===id)||(b.target_id===uid&&b.owner_id===id))&&links.some(l=>l.status==='accepted'&&[l.sender,l.recipient].includes(id));
 const incoming=links.filter(l=>l.recipient===uid&&l.status==='pending');
 async function refresh(){try{let [p,f,b]=await Promise.all([checked(c.from('mfd_profiles').select('*').order('username').limit(200)),checked(c.from('mfd_friendships').select('*')),checked(c.from('mfd_blocks').select('*'))]);setProfiles(p);setLinks(f);setBlocks(b);setMine(p.find((x:P)=>x.user_id===uid)||null)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{refresh()},[uid]);
 async function run(fn:()=>Promise<any>,done?:string){setBusy(true);setError('');try{await fn();await refresh();setReload(n=>n+1);if(done)toast(done)}catch(e){setError((e as any).code==='23505'?'Unavailable':(e as Error).message)}finally{setBusy(false)}}
 async function refreshFeed(){setReload(n=>n+1);try{await (engine() as any)?.syncNow?.()}finally{setReload(n=>n+1)}}
 // Unread messages for the inbox badge: only rows addressed to me and not yet read (small).
 async function loadUnread(){try{setUnread(await checked(c.from('mfd_messages').select('id,sender,read_at').eq('recipient',uid).is('read_at',null)))}catch{}}
 // Feed: last 7 days, kept on this device; each check downloads only what changed (lib/socialFeed).
 function showFeed(){const feed=feedRef.current;if(!feed)return;setWorkouts(profileOwner?feed.profile(profileOwner):feed.feed());setReactions(feed.reactionList())}
 async function signPhotos(list:any[]){const feed=feedRef.current;if(!feed)return;const owners=new Set(list.map((v:any)=>v.owner_id));if(selected)owners.add(selected.user_id);owners.add(uid);const avatars=profiles.filter(p=>p.avatar_path&&owners.has(p.user_id));const media=list.map((v:any)=>({key:v.owner_id+':'+v.workout_id,path:feed.photoFor(v.owner_id,v.workout_id)})).filter(m=>m.path);
  const [av,ph]=await Promise.all([imageCache.current.urls(c,'mfd-avatars',avatars.map(p=>p.avatar_path!)),imageCache.current.urls(c,'mfd-workout-photos',media.map(m=>m.path!))]);const urls:Record<string,string>={};for(const p of avatars)if(av[p.avatar_path!])urls[p.user_id]=av[p.avatar_path!];for(const m of media)if(ph[m.path!])urls[m.key]=ph[m.path!];return urls}
 async function moreProfile(){const feed=feedRef.current;if(!feed||!profileOwner)return;setLoading(true);try{await feed.loadProfile(c,profileOwner);showFeed();const urls=await signPhotos(feed.profile(profileOwner));if(urls)setPhotos(old=>({...old,...urls}))}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{if(!mine||view.kind==='chat')return;let canceled=false,inflight=false;showFeed();
  async function load(){const feed=feedRef.current;if(inflight||document.hidden||!feed)return;inflight=true;setLoading(true);try{
   // Friendships can change on the other person's side (accept, remove, block); this list is small.
   const [f,b]=await Promise.all([checked(c.from('mfd_friendships').select('*')),checked(c.from('mfd_blocks').select('*'))]);if(canceled)return;
   const blocked=(id:string)=>b.some((x:any)=>(x.owner_id===uid&&x.target_id===id)||(x.target_id===uid&&x.owner_id===id));
   const visible=f.filter((l:any)=>l.status==='accepted').map((l:any)=>l.sender===uid?l.recipient:l.sender).filter((id:string)=>!blocked(id));
   setLinks(old=>JSON.stringify(old)===JSON.stringify(f)?old:f);setBlocks(old=>JSON.stringify(old)===JSON.stringify(b)?old:b);
   await feed.sync(c,visible);if(profileOwner&&!feed.profile(profileOwner).length&&feed.hasMore(profileOwner))await feed.loadProfile(c,profileOwner);
   if(canceled)return;showFeed();setError('');setLoading(false);loadUnread();
   // Render workout data first. Images are independent, batched and reuse stable URLs.
   try{const urls=await signPhotos(profileOwner?feed.profile(profileOwner):feed.feed());if(urls&&!canceled)setPhotos(old=>({...old,...urls}))}catch{if(!canceled)setError('Some images could not load. Tap refresh to retry.')}
  }catch(e){if(!canceled)setError((e as Error).message)}finally{inflight=false;if(!canceled)setLoading(false)}}
  load();let timer=setInterval(load,60000);const visible=()=>{if(!document.hidden)load()};window.addEventListener('focus',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
  let wasPending=!!engine()?.peek().dirty;const unsubscribe=engine()?.subscribe(()=>{const s=engine()?.peek();const pending=!!(s?.dirty||s?.busy);if(wasPending&&!pending)load();wasPending=pending});
  return()=>{canceled=true;clearInterval(timer);unsubscribe?.();window.removeEventListener('focus',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible)}},[view.kind,selected?.user_id,mine?.user_id,profiles,reload,uid]);
 // People, inbox and chat avatars do not wait for the workout feed.
 useEffect(()=>{if(!people&&!inbox&&view.kind!=='chat')return;let canceled=false;const avatars=profiles.filter(p=>p.avatar_path);imageCache.current.urls(c,'mfd-avatars',avatars.map(p=>p.avatar_path!)).then(urls=>{if(!canceled)setPhotos(old=>({...old,...Object.fromEntries(avatars.filter(p=>urls[p.avatar_path!]).map(p=>[p.user_id,urls[p.avatar_path!]]))}))}).catch(()=>{});return()=>{canceled=true}},[people,inbox,view.kind,profiles,uid]);

 const openProfile=(p:P)=>{setPeople(false);setInbox(false);navigate(p.user_id===uid?'/friends/me':`/friends/u/${p.username}`)};
 const openChat=(p:P)=>{setPeople(false);setInbox(false);navigate(`/friends/chat/${p.username}`)};
 const back=()=>{if(history.length>1)history.back();else navigate('/friends',{replace:true})};
 function avatar(p:P,size='md'){return <span className={`social-avatar ${size}`} aria-hidden="true">{photos[p.user_id]?<img src={photos[p.user_id]} alt="" loading="lazy" decoding="async"/>:(p.display_name||p.username).slice(0,1).toUpperCase()}</span>}
 async function share(p:P){let url=location.origin+'/#/friends/u/'+p.username;try{if(navigator.share)await navigator.share({title:p.display_name,url});else {await navigator.clipboard.writeText(url);toast('Link copied')}}catch(e){if((e as Error).name!=='AbortError')setError('Copy: '+url)}}
 async function upload(file:File,id?:string){await run(async()=>{if(id){const saved=await (engine() as any)?.syncNow?.();if(!saved)throw Error('Workout is saved on this device. Finish cloud sync before uploading its photo.')}imageCache.current.invalidate();
  let bucket=id?'mfd-workout-photos':'mfd-avatars',path=uid+'/'+crypto.randomUUID()+'.jpg',blob=await imageBlob(file,id?1200:400),old:any=id?await checked(c.from('mfd_workout_photos').select('*').eq('owner_id',uid).eq('workout_id',id).maybeSingle()):mine;
  let up=await c.storage.from(bucket).upload(path,blob,{contentType:'image/jpeg',upsert:false});if(up.error)throw up.error;
  try{if(id){if(old)await checked(c.from('mfd_workout_photos').update({path}).eq('owner_id',uid).eq('workout_id',id));else await checked(c.from('mfd_workout_photos').insert({workout_id:id,path}))}else await checked(c.from('mfd_profiles').update({avatar_path:path}).eq('user_id',uid))}catch(e){await c.storage.from(bucket).remove([path]);throw e}
  if(old?.path||old?.avatar_path)await c.storage.from(bucket).remove([old.path||old.avatar_path])},'Photo saved')}
 async function removePhoto(id?:string){await run(async()=>{if(id){let old=await checked(c.from('mfd_workout_photos').select('*').eq('owner_id',uid).eq('workout_id',id).maybeSingle());if(old){await checked(c.from('mfd_workout_photos').delete().eq('owner_id',uid).eq('workout_id',id));await c.storage.from('mfd-workout-photos').remove([old.path])}}else if(mine?.avatar_path){await checked(c.from('mfd_profiles').update({avatar_path:null}).eq('user_id',uid));await c.storage.from('mfd-avatars').remove([mine.avatar_path])}},'Photo removed')}
 const photoInput=(id?:string,label='Add photo')=><label className="chip social-chip" title={label}><Camera aria-hidden="true"/>{label}<input hidden disabled={busy} type="file" accept="image/*" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0],id);e.target.value=''}}/></label>;
 function copyWorkout(w:any){let original=engine().peek(),db=toDB({...original,state:{...original.state,sessions:[w.data],routines:[],active:null}},engine().catalogue()),session=db.workouts[0];if(session){let routine=routineFromWorkout(session,w.data.name,null);update(d=>{for(let e of db.customExercises)if(!d.customExercises.some(x=>x.id===e.id))d.customExercises.push(e);d.routines.push(routine)});toast(`${w.data.name} copied to Training`)}}
 const request=(p:P)=>run(()=>checked(c.from('mfd_friendships').insert({recipient:p.user_id})),'Request sent');
 const accept=(l:any)=>run(()=>checked(c.from('mfd_friendships').update({status:'accepted'}).eq('id',l.id)),'You are now friends');
 const cancel=(l:any,msg:string)=>run(()=>checked(c.from('mfd_friendships').delete().eq('id',l.id)),msg);

 function card(w:any){let p=profiles.find(x=>x.user_id===w.owner_id);if(!p)return null;
  let s=w.data,done=s.sets.filter((x:any)=>x.done!==false),work=done.filter((x:any)=>x.type!=='warmup'),v=work.reduce((n:number,x:any)=>n+(x.kg||0)*(x.reps||0),0),key=w.owner_id+':'+w.workout_id,liked=reactions.some(r=>r.user_id===uid&&r.owner_id===w.owner_id&&r.workout_id===w.workout_id),likes=reactions.filter(r=>r.owner_id===w.owner_id&&r.workout_id===w.workout_id).length,names=[...new Set(done.map((x:any)=>x.exercise))] as string[],own=w.owner_id===uid,comments=feedRef.current?.commentsFor(w.owner_id,w.workout_id).length??0;
  return <article className="card social-post" key={key}>
   <button className="social-post-head" onClick={()=>openProfile(p)} aria-label={`Open ${p.display_name}'s profile`}>{avatar(p)}<span className="grow"><span className="name ellipsis">{p.display_name} <small>@{p.username}</small></span><span className="sub ellipsis">{s.started?ago(s.started):s.date} · {s.name}</span></span></button>
   {photos[key]&&<img className="social-photo" src={photos[key]} alt={`${p.display_name}'s workout photo`} loading="lazy" decoding="async"/>}
   <div className="social-post-stats tnum"><div><span>Duration</span><strong>{Math.round((s.finished-s.started)/60000)||0} min</strong></div><div><span>Volume</span><strong>{Math.round(v).toLocaleString()} kg</strong></div><div><span>Sets</span><strong>{work.length}</strong></div></div>
   <details className="social-exercises"><summary><span className="ellipsis">{names.join(' · ')}</span><ChevronDown aria-hidden="true"/></summary>{names.map(name=><div className="social-row" key={name}><strong>{name}</strong><small className="tnum">{done.filter((x:any)=>x.exercise===name).map((x:any)=>`${x.type==='warmup'?'W':x.set}: ${x.kg??'—'} × ${x.reps??'—'}`).join(' · ')}</small></div>)}</details>
   <div className="social-actions">
    <button className={'social-icon'+(liked?' liked':'')} aria-pressed={liked} aria-label={`${liked?'Remove like':'Like'} · ${likes}`} onClick={()=>run(async()=>{if(liked)await checked(c.from('mfd_reactions').delete().eq('user_id',uid).eq('owner_id',w.owner_id).eq('workout_id',w.workout_id));else await checked(c.from('mfd_reactions').insert({owner_id:w.owner_id,workout_id:w.workout_id}));feedRef.current?.react(w.owner_id,w.workout_id,!liked);setReactions(feedRef.current?.reactionList()||[])})}><Heart aria-hidden="true" fill={liked?'currentColor':'none'}/>{likes>0&&<span className="tnum">{likes}</span>}</button>
    <button className="social-icon" aria-label={`Comments · ${comments}`} onClick={()=>setThread({owner:w.owner_id,workout:w.workout_id,title:s.name})}><MessageCircle aria-hidden="true"/>{comments>0&&<span className="tnum">{comments}</span>}</button>
    <button className="social-icon" aria-label="Copy as a routine" onClick={()=>copyWorkout(w)}><CopyPlus aria-hidden="true"/></button>
    {own&&<span className="social-actions-end">
     <label className="social-icon" aria-label={photos[key]?'Change photo':'Add photo'} title={photos[key]?'Change photo':'Add photo'}><Camera aria-hidden="true"/><input hidden disabled={busy} type="file" accept="image/*" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0],w.workout_id);e.target.value=''}}/></label>
     {photos[key]&&<button className="social-icon" aria-label="Remove photo" onClick={()=>setConfirm({title:'Remove this photo?',label:'Remove',run:()=>removePhoto(w.workout_id)})}><Trash2 aria-hidden="true"/></button>}
    </span>}
   </div>
  </article>}

 const syncNote=syncState!=='saved'&&<p className="social-sync-note" role="status">{syncState==='pending'?'Your latest edits are on this device; cloud sync is pending.':syncState==='offline'?'Offline · your new workouts will reach friends after syncing.':'Cloud sync needs attention. Your local workouts are preserved.'}</p>;
 const shown=visibleFeed(displayed,uid||'',friend);

 if(view.kind==='chat')return selected&&friend(selected.user_id)?<ChatView me={uid!} friend={selected} avatar={avatar(selected)} onBack={back}/>:<><TopBar title="Chat" back="/friends"/><div className="screen">{profiles.length?<Empty icon={LockKeyhole} title="Chat is for friends"/>:<p className="small muted">Loading…</p>}</div></>;

 return <>
  {view.kind==='profile'?<TopBar title={selected?.display_name??''} back="/friends" actions={selected&&friend(selected.user_id)?<button className="icon-btn" aria-label="Friend options" onClick={()=>setMenu(true)}><MoreHorizontal/></button>:undefined}/>
  :<TopBar title="Friends" actions={<>
   <button className="icon-btn" aria-label="Refresh feed" onClick={refreshFeed}><RefreshCw className={loading?'spin':''}/></button>
   <button className="icon-btn badge-host" aria-label={incoming.length?`People · ${incoming.length} requests`:'People'} onClick={()=>setPeople(true)}><UserPlus/>{incoming.length>0&&<span className="count-badge">{incoming.length}</span>}</button>
   <button className="icon-btn badge-host" aria-label={unread.length?`Inbox · ${unread.length} unread`:'Inbox'} onClick={()=>{setInbox(true);loadUnread()}}><Inbox/>{unread.length>0&&<span className="count-badge">{unread.length}</span>}</button>
  </>}/>}
  <div className="screen social-screen">
   {view.kind!=='profile'&&<Segmented label="Friends view" value={view.kind==='me'?'me':'feed'} onChange={v=>navigate(v==='me'?'/friends/me':'/friends',{replace:true})} options={[{value:'feed',label:'Feed'},{value:'me',label:'My profile'}]}/>}
   {error&&<p role="alert" className="social-error">{error}</p>}
   {!mine?<div className="card social-setup"><p>Choose a username to use Friends.</p><button className="btn btn-primary" onClick={()=>navigate('/settings/profile')}>Set up profile</button></div>:<>
    {view.kind==='feed'&&<>
     {syncNote}
     {shown.length===0&&!loading&&<Empty icon={Users} title="No workouts from friends this week" action={<button className="btn btn-primary" onClick={()=>setPeople(true)}><UserPlus aria-hidden="true"/>Find people</button>}/>}
     {shown.slice(0,limit).map(card)}
     {shown.length>limit&&<button className="btn btn-soft btn-block" onClick={()=>setLimit(n=>n+50)}>Load more</button>}
    </>}
    {(view.kind==='me'||view.kind==='profile')&&selected&&<>
     <section className="card social-profile">
      {avatar(selected,'lg')}
      <h2>{selected.display_name}</h2><span className="handle">@{selected.username}</span>
      <div className="social-profile-actions">
       {selected.user_id===uid?<>
        {photoInput(undefined,mine.avatar_path?'Change photo':'Add photo')}
        {mine.avatar_path&&<button className="chip social-chip" onClick={()=>setConfirm({title:'Remove your profile photo?',label:'Remove',run:()=>removePhoto()})}><Trash2 aria-hidden="true"/>Remove</button>}
        <button className="chip social-chip" onClick={()=>navigate('/settings/profile')}><Pencil aria-hidden="true"/>Edit</button>
       </>:friend(selected.user_id)?<>
        <button className="btn btn-primary btn-sm" onClick={()=>openChat(selected)}><MessageCircle aria-hidden="true"/>Message</button>
        <button className={'chip social-chip'+(compare?' on':'')} aria-pressed={compare} onClick={()=>setCompare(!compare)}><GitCompareArrows aria-hidden="true"/>Compare</button>
       </>:(()=>{const l=links.find(l=>[l.sender,l.recipient].includes(selected.user_id));return l?l.recipient===uid?<button className="btn btn-primary btn-sm" onClick={()=>accept(l)}><Check aria-hidden="true"/>Accept request</button>:<button className="chip social-chip" onClick={()=>cancel(l,'Request cancelled')}><Clock aria-hidden="true"/>Requested</button>:<button className="btn btn-primary btn-sm" onClick={()=>request(selected)}><UserPlus aria-hidden="true"/>Add friend</button>})()}
       <button className="chip social-chip" onClick={()=>share(selected)}><Share2 aria-hidden="true"/>Share</button>
      </div>
     </section>
     {selected.user_id===uid&&syncNote}
     {compare&&selected.user_id!==uid&&<section className="card social-compare-card"><div className="social-compare-head"><span>You</span><span className="eyebrow">Private<InfoButton title="Private comparison" lines={['Only you can see this side-by-side comparison.']}/></span><span>@{selected.username}</span></div>
      {[['Workouts',engine().peek().state.sessions.length,totals?totals.workouts:'–'],['Volume (kg)',Math.round(engine().peek().state.sessions.flatMap((s:any)=>s.sets).filter((x:any)=>x.type!=='warmup').reduce((n:number,x:any)=>n+(x.kg||0)*(x.reps||0),0)).toLocaleString(),totals?Math.round(totals.volume).toLocaleString():'–']].map(([label,a,b])=><div className="social-compare" key={label as string}><strong className="tnum">{a}</strong><small>{label}</small><strong className="tnum">{b}</strong></div>)}
     </section>}
     {selected.user_id===uid||friend(selected.user_id)?<>{displayed.map(card)}{displayed.length===0&&!loading&&<p className="small muted social-empty">No workouts yet</p>}{profileOwner&&feedRef.current?.hasMore(profileOwner)&&<button className="btn btn-soft btn-block" disabled={loading} onClick={moreProfile}>Load more</button>}</>:<Empty icon={LockKeyhole} title="Workouts are shared with friends"/>}
    </>}
    {view.kind==='profile'&&!selected&&profiles.length>0&&<Empty icon={Users} title="No one with this username"/>}
   </>}
  </div>
  <PeopleSheet open={people} onClose={()=>setPeople(false)} uid={uid!} profiles={profiles} links={links} friend={friend} avatar={avatar} onOpen={openProfile} onChat={openChat} onRequest={request} onAccept={accept} onCancel={cancel} busy={busy}/>
  <Sheet open={inbox} onClose={()=>setInbox(false)} title="Inbox">
   <div className="social-list">{profiles.filter(p=>friend(p.user_id)).sort((a,b)=>unread.filter(m=>m.sender===b.user_id).length-unread.filter(m=>m.sender===a.user_id).length).map(p=>{const n=unread.filter(m=>m.sender===p.user_id).length;return <button key={p.user_id} className="social-person" onClick={()=>openChat(p)}>{avatar(p)}<span className="grow"><span className="name">{p.display_name}</span><span className={'sub'+(n?' strong':'')}>{n?`${n} new ${n===1?'message':'messages'}`:'@'+p.username}</span></span>{n>0&&<span className="count-badge static">{n}</span>}</button>})}
    {!profiles.some(p=>friend(p.user_id))&&<p className="small muted">Add friends to chat with them.</p>}</div>
   <p className="social-disappear"><Timer aria-hidden="true"/>Disappearing messages<InfoButton title="Disappearing messages" lines={['Messages disappear 5 minutes after they are read.','Unread messages disappear 24 hours after sending.']}/></p>
  </Sheet>
  {selected&&<Sheet open={menu} onClose={()=>setMenu(false)} title={selected.display_name}>
   <div className="option-list">
    <button className="option" onClick={()=>{setMenu(false);setConfirm({title:`Remove ${selected.display_name} as a friend?`,body:'You will stop seeing each other’s workouts and chat.',label:'Remove friend',run:()=>run(()=>checked(c.from('mfd_friendships').delete().or(`sender.eq.${selected.user_id},recipient.eq.${selected.user_id}`)),'Friend removed')})}}><UserMinus aria-hidden="true"/><span className="strong">Remove friend</span></button>
    <button className="option danger" onClick={()=>{setMenu(false);setConfirm({title:`Block ${selected.display_name}?`,body:'They can’t find you, send requests or message you.',label:'Block',run:()=>run(async()=>{await checked(c.from('mfd_blocks').insert({target_id:selected.user_id}));await checked(c.from('mfd_friendships').delete().or(`sender.eq.${selected.user_id},recipient.eq.${selected.user_id}`));navigate('/friends',{replace:true})},'Blocked')})}}><Ban aria-hidden="true"/><span className="strong">Block</span></button>
   </div>
  </Sheet>}
  <CommentsSheet thread={thread} onClose={()=>setThread(null)} uid={uid!} feed={feedRef.current} profiles={profiles} avatar={avatar} onChange={()=>setTick(n=>n+1)} onOpen={openProfile}/>
  <ConfirmSheet open={!!confirm} onClose={()=>setConfirm(null)} danger title={confirm?.title??''} body={confirm?.body} confirmLabel={confirm?.label??'OK'} onConfirm={()=>{confirm?.run();setConfirm(null)}}/>
 </>;
}

function PeopleSheet({open,onClose,uid,profiles,links,friend,avatar,onOpen,onChat,onRequest,onAccept,onCancel,busy}:{open:boolean;onClose:()=>void;uid:string;profiles:P[];links:any[];friend:(id:string)=>boolean;avatar:(p:P)=>React.ReactNode;onOpen:(p:P)=>void;onChat:(p:P)=>void;onRequest:(p:P)=>void;onAccept:(l:any)=>void;onCancel:(l:any,msg:string)=>void;busy:boolean}){
 const [page,setPage]=useState<'find'|'friends'>('find'),[q,setQ]=useState('');
 const friends=profiles.filter(p=>p.user_id!==uid&&friend(p.user_id));
 const requests=links.filter(l=>l.recipient===uid&&l.status==='pending').map(l=>({l,p:profiles.find(p=>p.user_id===l.sender)})).filter((x):x is {l:any;p:P}=>!!x.p);
 const term=q.trim().toLowerCase().replace(/^@/,'');
 const results=profiles.filter(p=>p.user_id!==uid&&!friend(p.user_id)&&!requests.some(r=>r.p.user_id===p.user_id)&&(!term||p.username.includes(term)||p.display_name.toLowerCase().includes(term)));
 const person=(p:P,action:React.ReactNode)=><div className="social-person" key={p.user_id}><button className="social-person-open" onClick={()=>onOpen(p)} aria-label={`Open ${p.display_name}'s profile`}>{avatar(p)}<span className="grow"><span className="name ellipsis">{p.display_name}</span><span className="sub ellipsis">@{p.username}</span></span></button>{action}</div>;
 return <Sheet open={open} onClose={onClose} title="People" size="full">
  <Segmented label="People" value={page} onChange={setPage} options={[{value:'find',label:'Find'},{value:'friends',label:`Friends · ${friends.length}`}]}/>
  {page==='friends'?<div className="social-list">{friends.length?friends.map(p=>person(p,<button className="btn btn-soft btn-sm" onClick={()=>onChat(p)}><MessageCircle aria-hidden="true"/>Chat</button>)):<Empty icon={UserPlus} title="No friends yet" action={<button className="btn btn-primary" onClick={()=>setPage('find')}>Find people</button>}/>}</div>:<>
   <label className="search social-search"><Search/><input type="search" placeholder="Search @username" aria-label="Search people" value={q} onChange={e=>setQ(e.target.value)}/></label>
   {requests.length>0&&<><div className="eyebrow social-eyebrow">Friend requests · {requests.length}</div><div className="social-list">{requests.map(({l,p})=>person(p,<div className="social-request-actions"><button className="round-icon" aria-label={`Decline ${p.display_name}`} disabled={busy} onClick={()=>onCancel(l,'Request declined')}><X aria-hidden="true"/></button><button className="round-icon accent" aria-label={`Accept ${p.display_name}`} disabled={busy} onClick={()=>onAccept(l)}><Check aria-hidden="true"/></button></div>))}</div></>}
   <div className="eyebrow social-eyebrow">{term?'Results':'People'}</div>
   <div className="social-list">{results.slice(0,50).map(p=>{const l=links.find(l=>[l.sender,l.recipient].includes(p.user_id));return person(p,l?<button className="btn btn-soft btn-sm" disabled={busy} onClick={()=>onCancel(l,'Request cancelled')}><Clock aria-hidden="true"/>Requested</button>:<button className="btn btn-primary btn-sm" disabled={busy} onClick={()=>onRequest(p)}><UserPlus aria-hidden="true"/>Add</button>)})}
    {results.length===0&&<p className="small muted">{term?`No one found for “${q}”`:'No one else here yet'}</p>}</div>
  </>}
 </Sheet>;
}

/** One disappearing chat. Updates incrementally every 5 s (lib/chatSync); marks messages read as they come into view. */
function ChatView({me,friend,avatar,onBack}:{me:string;friend:P;avatar:React.ReactNode;onBack:()=>void}){
 const c=client();const sync=useMemo(()=>new ChatSync(me,friend.user_id),[me,friend.user_id]);
 const [messages,setMessages]=useState<ChatMessage[]>([]),[text,setText]=useState(''),[clock,setClock]=useState(Date.now()),[sending,setSending]=useState(false),[error,setError]=useState('');
 const end=useRef<HTMLDivElement>(null),count=useRef(0);
 async function load(){try{setMessages(await sync.refresh(c));setError('')}catch(e){setError((e as Error).message)}}
 useEffect(()=>{load();let timer=setInterval(()=>{if(!document.hidden)load()},5000),tick=setInterval(()=>{setClock(Date.now());setMessages(sync.list())},1000);const visible=()=>{if(!document.hidden)load()};document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);clearInterval(tick);document.removeEventListener('visibilitychange',visible)}},[sync]);
 useEffect(()=>{if(messages.length>count.current)end.current?.scrollIntoView({block:'end'});count.current=messages.length},[messages.length]);
 useEffect(()=>{if(document.hidden)return;let observer=new IntersectionObserver(entries=>{let ids=entries.filter(e=>e.isIntersecting).map(e=>(e.target as HTMLElement).dataset.message!).filter(Boolean);if(!ids.length)return;checked(c.from('mfd_messages').update({read_at:new Date().toISOString()}).in('id',ids).select('*')).then(rows=>{sync.updated(rows);setMessages(sync.list())}).catch(()=>{});entries.forEach(e=>{if(e.isIntersecting)observer.unobserve(e.target)})},{threshold:.6});document.querySelectorAll('.chat-bubble[data-message]').forEach(el=>observer.observe(el));return()=>observer.disconnect()},[messages]);
 async function send(){const body=text.trim();if(!body||sending)return;setSending(true);try{const row=await checked(c.from('mfd_messages').insert({recipient:friend.user_id,body}).select('*').single());sync.add(row);setMessages(sync.list());setText('')}catch(e){setError((e as Error).message)}finally{setSending(false)}}
 return <div className="chat-screen">
  <header className="chat-head"><button className="icon-btn" aria-label="Back" onClick={onBack}><ArrowLeft/></button>{avatar}<span className="grow"><span className="name ellipsis">{friend.display_name}</span><span className="sub">@{friend.username}</span></span><InfoButton title="Disappearing messages" lines={['Messages disappear 5 minutes after they are read.','Unread messages disappear 24 hours after sending.']}/></header>
  <div className="chat-body">
   {messages.length===0&&<p className="chat-empty"><Timer aria-hidden="true"/>Say hi to {friend.display_name}</p>}
   {messages.map(m=>{const mine=m.sender===me;return <div key={m.id} className={'chat-msg'+(mine?' mine':'')}><p className="chat-bubble" data-message={!mine&&!m.read_at?m.id:undefined}>{m.body}</p><span className="chat-meta tnum"><Timer aria-hidden="true"/>{mine?(m.read_at?`Read · ${left(m.expires_at,clock)} left`:'Delivered'):`${left(m.expires_at,clock)} left`}</span></div>})}
   <div ref={end}/>
  </div>
  {error&&<p role="alert" className="social-error chat-error">{error}</p>}
  <form className="chat-input" onSubmit={e=>{e.preventDefault();send()}}><input className="input" aria-label="Message" placeholder={`Message ${friend.display_name}`} value={text} maxLength={2000} onChange={e=>setText(e.target.value)}/><button className="round-icon accent" aria-label="Send" disabled={sending||!text.trim()}><ArrowUp aria-hidden="true"/></button></form>
 </div>;
}

/** Comments on one workout: oldest first, mine or (on my workout) anyone's can be deleted. Kept in the feed's incremental sync. */
function CommentsSheet({thread,onClose,uid,feed,profiles,avatar,onChange,onOpen}:{thread:{owner:string;workout:string;title:string}|null;onClose:()=>void;uid:string;feed:SocialFeed|null;profiles:P[];avatar:(p:P)=>React.ReactNode;onChange:()=>void;onOpen:(p:P)=>void}){
 const c=client();const [text,setText]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState(''),[removing,setRemoving]=useState<string|null>(null);
 const list=thread&&feed?feed.commentsFor(thread.owner,thread.workout):[];
 const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{end.current?.scrollIntoView({block:'end'})},[list.length,thread?.workout]);
 useEffect(()=>{setText('');setError('')},[thread?.workout]);
 async function send(){const body=text.trim();if(!thread||!feed||!body||sending)return;setSending(true);setError('');try{const row=await checked(c.from('mfd_comments').insert({owner_id:thread.owner,workout_id:thread.workout,body}).select('*').single());feed.comment(row);setText('');onChange()}catch(e){setError((e as Error).message)}finally{setSending(false)}}
 async function remove(id:string){if(!feed)return;try{await checked(c.from('mfd_comments').delete().eq('id',id));feed.uncomment(id);onChange()}catch(e){setError((e as Error).message)}}
 return <>
  <Sheet open={!!thread} onClose={onClose} title={thread?.title?`Comments · ${thread.title}`:'Comments'} footer={<form className="comment-input" onSubmit={e=>{e.preventDefault();send()}}><input className="input" aria-label="Write a comment" placeholder="Write a comment" value={text} maxLength={500} onChange={e=>setText(e.target.value)}/><button className="round-icon accent" aria-label="Post comment" disabled={sending||!text.trim()}><ArrowUp aria-hidden="true"/></button></form>}>
   <div className="comment-list">
    {list.length===0&&<p className="small muted comment-empty">No comments yet</p>}
    {list.map(x=>{const p=profiles.find(p=>p.user_id===x.user_id);const mayDelete=x.user_id===uid||thread?.owner===uid;return <div key={x.id} className="comment">
     {p?<button className="comment-avatar" aria-label={`Open ${p.display_name}'s profile`} onClick={()=>{onClose();onOpen(p)}}>{avatar(p)}</button>:<span className="social-avatar">?</span>}
     <div className="grow"><div className="comment-head"><strong>{p?.display_name??'Someone'}</strong><span>{ago(new Date(x.created_at).getTime())}</span></div><p>{x.body}</p></div>
     {mayDelete&&<button className="icon-btn comment-delete" aria-label="Delete comment" onClick={()=>setRemoving(x.id)}><Trash2/></button>}
    </div>})}
    <div ref={end}/>
   </div>
   {error&&<p role="alert" className="social-error">{error}</p>}
  </Sheet>
  <ConfirmSheet open={!!removing} onClose={()=>setRemoving(null)} danger title="Delete this comment?" confirmLabel="Delete" onConfirm={()=>{if(removing)remove(removing);setRemoving(null)}}/>
 </>;
}
