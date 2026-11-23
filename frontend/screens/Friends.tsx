import {navigate} from '../lib/router';
import {validateImageFile,assertImageDimensions} from '../lib/imageSafety';
import {useEffect,useState,useRef,useMemo,useSyncExternalStore} from 'react';
import {mergeFeed,visibleFeed,SignedImages} from '../lib/socialData';
import {FEED_DAYS,type FeedRow,type SocialFeed} from '../lib/socialFeed';
import {friendsSession,freshPhotos,rememberPeople,rememberPhotos,same} from '../lib/friendsCache';
import {ChatSync,type ChatMessage} from '../lib/chatSync';
import {friendHistory,forgetHistory,toWorkouts} from '../lib/friendHistory';
import {ArrowLeft,ArrowUp,Ban,Bell,Camera,Check,ChevronRight,Clock,Heart,Inbox,LockKeyhole,MessageCircle,MoreHorizontal,Pencil,RefreshCw,Search,Share2,Timer,Trash2,UserMinus,UserPlus,Users,X} from 'lucide-react';
import {client,engine} from '../adapters/engine';
import {useDB} from '../data/store';
import {exercises as exerciseRepo} from '../data/repositories';
import {ConfirmSheet,Empty,InfoButton,Segmented,Sheet,TopBar,toast} from '../components/ui';
import {CopyWorkoutSheet} from './training/CopyWorkoutSheet';
import {ExercisePage} from './training/ExercisePage';
import {toDB} from '../adapters/compat';
import type {Exercise,Workout} from '../domain/types';
import {commonExercises,exerciseMetrics,inPeriod,leader,mondayOf,muscleSplit,PERIODS,PERIOD_TITLE,recordCount,recordSets,totals,weeklyMinutes,weekStreak,type Period} from '../domain/socialStats';
import {fmtVolume} from '../lib/format';
import {ActionRow,agoText,CompareRow,FeedCard,Hero,HoursChart,LikedBy,Metric,metricFormat,MuscleSplitBars,Private,Radar,SetTable,StatRow,type CardActions} from './friends/parts';
import {ExerciseThumb} from './training/ExercisePicker';

type P={user_id:string;username:string;display_name:string;avatar_path?:string|null;created_at?:string};
type View={kind:'feed'}|{kind:'me'}|{kind:'profile';username:string}|{kind:'chat';username:string}|{kind:'workout';owner:string;workout:string}|{kind:'compare';username:string;exercise?:string}|{kind:'activity'};
async function checked(query:any){let {data,error}=await query;if(error)throw error;return data}
async function imageBlob(file:File,edge:number){await validateImageFile(file);let url=URL.createObjectURL(file);try{let img=new Image();img.src=url;await img.decode();assertImageDimensions(img.naturalWidth,img.naturalHeight);let c=document.createElement('canvas'),scale=Math.min(1,edge/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d')!.drawImage(img,0,0,c.width,c.height);let b=await new Promise<Blob|null>(r=>c.toBlob(r,'image/jpeg',.82));if(!b||b.size>(edge===400?1:2)*1024*1024)throw Error('Image too large');return b}finally{URL.revokeObjectURL(url)}}
const ago=(t:number,now=Date.now())=>{const m=Math.max(0,Math.round((now-t)/60000));return m<1?'now':m<60?`${m} min`:m<1440?`${Math.round(m/60)} h`:new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short'})};
const left=(iso:string,now:number)=>{const s=Math.max(0,Math.round((new Date(iso).getTime()-now)/1000));return s>=3600?`${Math.ceil(s/3600)} h`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
const SEEN='mfd-activity-seen:';
const readSeen=(uid:string)=>{try{return Number(localStorage.getItem(SEEN+uid))||0}catch{return 0}};
const writeSeen=(uid:string,t:number)=>{try{localStorage.setItem(SEEN+uid,String(t))}catch{}};
const recordCache=new WeakMap<Workout[],Map<string,string[]>>();
const recordsOf=(ws:Workout[])=>{let r=recordCache.get(ws);if(!r){r=recordSets(ws);recordCache.set(ws,r)}return r};

/** Friends: feed of friends' finished workouts, workout pages, profiles, comparison, activity, people, requests, inbox and disappearing chat. */
export function FriendsScreen({view}:{view:View}){
 const uid=engine()?.peek().user?.id;const c=client();
 // What Friends already knows (lib/friendsCache): shown at once, refreshed quietly in the background.
 const session=uid?friendsSession(uid):null,known0=session?.people||null;
 const [profiles,setProfiles]=useState<P[]>(known0?.profiles||[]),[links,setLinks]=useState<any[]>(known0?.links||[]),[blocks,setBlocks]=useState<any[]>(known0?.blocks||[]),[mine,setMine]=useState<P|null>(known0?.profiles.find((x:P)=>x.user_id===uid)||null);
 const [known,setKnown]=useState(!!known0);
 const [workouts,setWorkouts]=useState<any[]>(()=>session?.feed.feed()||[]),[reactions,setReactions]=useState<any[]>(()=>session?.feed.reactionList()||[]),[photos,setPhotos]=useState<Record<string,string>>(()=>session?freshPhotos(session):{});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[limit,setLimit]=useState(20),[loading,setLoading]=useState(false);
 const [people,setPeople]=useState(false),[inbox,setInbox]=useState(false),[menu,setMenu]=useState(false),[copy,setCopy]=useState<{w:any,extra:any[]}|null>(null),[unread,setUnread]=useState<any[]>(session?.unread||[]);
 const [confirm,setConfirm]=useState<{title:string;body?:string;label:string;run:()=>Promise<any>}|null>(null);
 const [thread,setThread]=useState<{owner:string;workout:string;title:string}|null>(null),[tick,setTick]=useState(0);
 const [histories,setHistories]=useState<Record<string,FeedRow[]>>({}),[likesOf,setLikesOf]=useState<{owner:string;workout:string}|null>(null),[detail,setDetail]=useState<Exercise|null>(null),[period,setPeriod]=useState<Period>('30d');
 const [seen,setSeen]=useState(0);
 const localHistory=useDB(d=>d.workouts),units=useDB(d=>d.settings.weightUnit),goal=useDB(d=>d.profile?.trainingDaysPerWeek??3);const imageCache=useRef(session?.images||new SignedImages());
 const syncState=useSyncExternalStore(fn=>engine()?.subscribe(fn)||(()=>{}),()=>{const s=engine()?.peek();return s?.conflict||s?.error?'error':s?.offline?'offline':s?.dirty||s?.busy?'pending':'saved'});
 const feedRef=useRef(session?.feed||null);
 const selected=view.kind==='profile'||view.kind==='chat'||view.kind==='compare'?profiles.find(p=>p.username===view.username)||null:view.kind==='me'?mine:null;
 const profileOwner=view.kind==='profile'||view.kind==='me'?selected?.user_id:undefined;
 // Another account signed in on this device: switch to its own Friends data (nothing is shared between accounts).
 const firstUid=useRef(uid);
 useEffect(()=>{if(uid===firstUid.current){setSeen(uid?readSeen(uid):0);return}firstUid.current=uid;const s=uid?friendsSession(uid):null;if(s){imageCache.current=s.images}feedRef.current=s?.feed||null;const k=s?.people||null;
  setProfiles(k?.profiles||[]);setLinks(k?.links||[]);setBlocks(k?.blocks||[]);setMine(k?.profiles.find((x:P)=>x.user_id===uid)||null);setKnown(!!k);setPhotos(s?freshPhotos(s):{});setHistories({});setUnread(s?.unread||[]);
  setWorkouts(s?.feed.feed()||[]);setReactions(s?.feed.reactionList()||[]);setSeen(uid?readSeen(uid):0)},[uid]);
 useEffect(()=>{if(uid&&known)rememberPeople(uid,{profiles,links,blocks})},[uid,known,profiles,links,blocks]);
 useEffect(()=>{if(session)rememberPhotos(session,photos)},[photos]);
 useEffect(()=>{if(session)session.unread=unread},[unread]);
 useEffect(()=>{setLimit(20);setMenu(false)},[view.kind,selected?.user_id]);
 useEffect(()=>{window.scrollTo(0,0)},[view.kind,(view as any).workout,(view as any).exercise,selected?.user_id]);
 const localSessions=useMemo(()=>engine()?.peek().state.sessions||[],[localHistory,uid]);
 const displayed=useMemo(()=>{const since=Date.now()-FEED_DAYS*86400000;return mergeFeed(workouts,profileOwner?localSessions:localSessions.filter((x:any)=>x.started>=since),uid||'',profileOwner)},[workouts,localSessions,uid,profileOwner]);
 const friend=(id:string)=>!blocks.some(b=>(b.owner_id===uid&&b.target_id===id)||(b.target_id===uid&&b.owner_id===id))&&links.some(l=>l.status==='accepted'&&[l.sender,l.recipient].includes(id));
 const incoming=links.filter(l=>l.recipient===uid&&l.status==='pending');
 async function refresh(){try{let [p,f,b]=await Promise.all([checked(c.from('mfd_profiles').select('*').order('username').limit(200)),checked(c.from('mfd_friendships').select('*')),checked(c.from('mfd_blocks').select('*'))]);setProfiles(old=>same(old,p)?old:p);setLinks(old=>same(old,f)?old:f);setBlocks(old=>same(old,b)?old:b);const me=p.find((x:P)=>x.user_id===uid)||null;setMine(old=>same(old,me)?old:me);setKnown(true)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{refresh()},[uid]);
 async function run(fn:()=>Promise<any>,done?:string){setBusy(true);setError('');try{await fn();await refresh();setReload(n=>n+1);if(done)toast(done)}catch(e){setError((e as any).code==='23505'?'Unavailable':(e as Error).message)}finally{setBusy(false)}}
 async function refreshFeed(){setReload(n=>n+1);try{await (engine() as any)?.syncNow?.()}finally{setReload(n=>n+1)}}
 // Unread messages for the inbox badge: only rows addressed to me and not yet read (small).
 async function loadUnread(){try{setUnread(await checked(c.from('mfd_messages').select('id,sender,read_at').eq('recipient',uid).is('read_at',null)))}catch{}}
 // Feed: last 7 days, kept on this device; each check downloads only what changed (lib/socialFeed).
 function showFeed(){const feed=feedRef.current;if(!feed)return;setWorkouts(profileOwner?feed.profile(profileOwner):feed.feed());setReactions(feed.reactionList())}
 async function signPhotos(list:any[]){const feed=feedRef.current;if(!feed)return;const owners=new Set(list.map((v:any)=>v.owner_id));if(selected)owners.add(selected.user_id);owners.add(uid);for(const r of feed.reactionList())owners.add(r.user_id);const avatars=profiles.filter(p=>p.avatar_path&&owners.has(p.user_id));const media=list.map((v:any)=>({key:v.owner_id+':'+v.workout_id,path:feed.photoFor(v.owner_id,v.workout_id)})).filter(m=>m.path);
  const [av,ph]=await Promise.all([imageCache.current.urls(c,'mfd-avatars',avatars.map(p=>p.avatar_path!)),imageCache.current.urls(c,'mfd-workout-photos',media.map(m=>m.path!))]);const urls:Record<string,string>={};for(const p of avatars)if(av[p.avatar_path!])urls[p.user_id]=av[p.avatar_path!];for(const m of media)if(ph[m.path!])urls[m.key]=ph[m.path!];return urls}
 async function moreProfile(){const feed=feedRef.current;if(!feed||!profileOwner)return;setLoading(true);try{await feed.loadProfile(c,profileOwner);showFeed();const urls=await signPhotos(feed.profile(profileOwner));if(urls)setPhotos(old=>({...old,...urls}))}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{if(!mine||view.kind==='chat'||view.kind==='compare')return;let canceled=false,inflight=false;showFeed();
  async function load(){const feed=feedRef.current;if(inflight||document.hidden||!feed)return;inflight=true;setLoading(true);try{
   // Friendships can change on the other person's side (accept, remove, block); this list is small.
   const [f,b]=await Promise.all([checked(c.from('mfd_friendships').select('*')),checked(c.from('mfd_blocks').select('*'))]);if(canceled)return;
   const blocked=(id:string)=>b.some((x:any)=>(x.owner_id===uid&&x.target_id===id)||(x.target_id===uid&&x.owner_id===id));
   const visible=f.filter((l:any)=>l.status==='accepted').map((l:any)=>l.sender===uid?l.recipient:l.sender).filter((id:string)=>!blocked(id));
   setLinks(old=>JSON.stringify(old)===JSON.stringify(f)?old:f);setBlocks(old=>JSON.stringify(old)===JSON.stringify(b)?old:b);
   await feed.sync(c,visible);if(profileOwner&&!feed.profile(profileOwner).length&&feed.hasMore(profileOwner))await feed.loadProfile(c,profileOwner);
   if(view.kind==='workout'&&!feed.row(view.owner,view.workout)?.data)await feed.loadWorkout(c,view.owner,view.workout);
   else if(view.kind==='workout')await feed.loadWorkout(c,view.owner,view.workout);
   if(canceled)return;showFeed();setTick(n=>n+1);setError('');setLoading(false);loadUnread();
   // Render workout data first. Images are independent, batched and reuse stable URLs.
   const shownRows=view.kind==='workout'?[feed.row(view.owner,view.workout)].filter(Boolean):profileOwner?feed.profile(profileOwner):feed.feed();
   try{const urls=await signPhotos(shownRows);if(urls&&!canceled)setPhotos(old=>({...old,...urls}))}catch{if(!canceled)setError('Some images could not load. Tap refresh to retry.')}
  }catch(e){if(!canceled)setError((e as Error).message)}finally{inflight=false;if(!canceled)setLoading(false)}}
  load();let timer=setInterval(load,60000);const visible=()=>{if(!document.hidden)load()};window.addEventListener('focus',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
  let wasPending=!!engine()?.peek().dirty;const unsubscribe=engine()?.subscribe(()=>{const s=engine()?.peek();const pending=!!(s?.dirty||s?.busy);if(wasPending&&!pending)load();wasPending=pending});
  return()=>{canceled=true;clearInterval(timer);unsubscribe?.();window.removeEventListener('focus',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible)}},[view.kind,(view as any).workout,selected?.user_id,mine?.user_id,profiles,reload,uid]);
 // People, inbox, activity and chat avatars do not wait for the workout feed.
 useEffect(()=>{if(!people&&!inbox&&view.kind!=='chat'&&view.kind!=='activity'&&view.kind!=='compare'&&!likesOf)return;let canceled=false;const avatars=profiles.filter(p=>p.avatar_path);imageCache.current.urls(c,'mfd-avatars',avatars.map(p=>p.avatar_path!)).then(urls=>{if(!canceled)setPhotos(old=>({...old,...Object.fromEntries(avatars.filter(p=>urls[p.avatar_path!]).map(p=>[p.user_id,urls[p.avatar_path!]]))}))}).catch(()=>{});return()=>{canceled=true}},[people,inbox,view.kind,likesOf,profiles,uid]);

 // ── Friends' full histories (records, hours chart, comparison): saved on this device, only changes downloaded ──
 const shown=visibleFeed(displayed,uid||'',friend);
 const wantedOwners=useMemo(()=>{const o=new Set<string>();if(view.kind==='feed')for(const r of shown)if(r.owner_id!==uid)o.add(r.owner_id);if(view.kind==='workout'&&view.owner!==uid)o.add(view.owner);if((view.kind==='profile'||view.kind==='compare')&&selected&&selected.user_id!==uid)o.add(selected.user_id);return [...o].filter(friend).sort().join(',')},[view.kind,(view as any).owner,shown.length,selected?.user_id,links,blocks,uid]);
 useEffect(()=>{if(!uid||!wantedOwners)return;let canceled=false;(async()=>{for(const owner of wantedOwners.split(',')){try{const rows=await friendHistory(c,uid,owner);if(canceled)return;setHistories(h=>h[owner]===rows?h:{...h,[owner]:rows})}catch(e){if(!canceled&&view.kind!=='feed')setError((e as Error).message)}}})();return()=>{canceled=true}},[wantedOwners,uid,reload]);
 useEffect(()=>{if(!uid||!links.length)return;for(const owner of Object.keys(histories))if(!friend(owner)){forgetHistory(uid,owner);setHistories(h=>{const n={...h};delete n[owner];return n})}},[links,blocks]);
 const feedConv=useMemo(()=>toWorkouts(displayed),[displayed]);
 const feedById=useMemo(()=>new Map(feedConv.workouts.map(w=>[w.id,w])),[feedConv]);
 const localById=useMemo(()=>new Map(localHistory.map(w=>[w.id,w])),[localHistory]);
 const histOf=(owner:string):Workout[]|null=>owner===uid?localHistory:histories[owner]?toWorkouts(histories[owner]!).workouts:null;
 const extraExercises=useMemo(()=>{const m=new Map<string,Exercise>();for(const e of feedConv.exercises)m.set(e.id,e);for(const rows of Object.values(histories))for(const e of toWorkouts(rows).exercises)m.set(e.id,e);return m},[feedConv,histories]);
 const exerciseOf=(id:string)=>exerciseRepo.byId(id)??extraExercises.get(id);
 const nameOf=(id:string)=>exerciseOf(id)?.name??'Exercise';
 /** The workout (app shape) behind a feed row, and its record sets when the owner's history is known. */
 function workoutOf(owner:string,workoutId:string):{w:Workout|null;records:Map<string,string[]>|null}{
  if(owner===uid){const w=localById.get(workoutId)??feedById.get(workoutId)??null;return {w,records:recordsOf(localHistory)}}
  const h=histOf(owner);if(h){const w=h.find(x=>x.id===workoutId);if(w)return {w,records:recordsOf(h)}}
  return {w:feedById.get(workoutId)??null,records:null};
 }

 const openProfile=(p:P)=>{setPeople(false);setInbox(false);setLikesOf(null);navigate(p.user_id===uid?'/friends/me':`/friends/u/${p.username}`)};
 const openChat=(p:P)=>{setPeople(false);setInbox(false);navigate(`/friends/chat/${p.username}`)};
 const openWorkout=(owner:string,workout:string)=>navigate(`/friends/w/${owner}/${encodeURIComponent(workout)}`);
 const back=()=>{if(history.length>1)history.back();else navigate('/friends',{replace:true})};
 function avatar(p:P,size='md'){return <span className={`social-avatar ${size}`} aria-hidden="true">{photos[p.user_id]?<img src={photos[p.user_id]} alt="" loading="lazy" decoding="async"/>:(p.display_name||p.username).slice(0,1).toUpperCase()}</span>}
 async function share(p:P){let url=location.origin+'/#/friends/u/'+p.username;try{if(navigator.share)await navigator.share({title:p.display_name,url});else {await navigator.clipboard.writeText(url);toast('Link copied')}}catch(e){if((e as Error).name!=='AbortError')setError('Copy: '+url)}}
 async function shareWorkout(owner:string,workout:string,title:string){let url=location.origin+`/#/friends/w/${owner}/${encodeURIComponent(workout)}`;try{if(navigator.share)await navigator.share({title,url});else {await navigator.clipboard.writeText(url);toast('Link copied')}}catch(e){if((e as Error).name!=='AbortError')toast('Could not share')}}
 async function upload(file:File,id?:string){await run(async()=>{if(id){const saved=await (engine() as any)?.syncNow?.();if(!saved)throw Error('Workout is saved on this device. Finish cloud sync before uploading its photo.')}imageCache.current.invalidate();
  let bucket=id?'mfd-workout-photos':'mfd-avatars',path=uid+'/'+crypto.randomUUID()+'.jpg',blob=await imageBlob(file,id?1200:400),old:any=id?await checked(c.from('mfd_workout_photos').select('*').eq('owner_id',uid).eq('workout_id',id).maybeSingle()):mine;
  let up=await c.storage.from(bucket).upload(path,blob,{contentType:'image/jpeg',upsert:false});if(up.error)throw up.error;
  try{if(id){if(old)await checked(c.from('mfd_workout_photos').update({path}).eq('owner_id',uid).eq('workout_id',id));else await checked(c.from('mfd_workout_photos').insert({workout_id:id,path}))}else await checked(c.from('mfd_profiles').update({avatar_path:path}).eq('user_id',uid))}catch(e){await c.storage.from(bucket).remove([path]);throw e}
  if(old?.path||old?.avatar_path)await c.storage.from(bucket).remove([old.path||old.avatar_path])},'Photo saved')}
 async function removePhoto(id?:string){await run(async()=>{if(id){let old=await checked(c.from('mfd_workout_photos').select('*').eq('owner_id',uid).eq('workout_id',id).maybeSingle());if(old){await checked(c.from('mfd_workout_photos').delete().eq('owner_id',uid).eq('workout_id',id));await c.storage.from('mfd-workout-photos').remove([old.path])}}else if(mine?.avatar_path){await checked(c.from('mfd_profiles').update({avatar_path:null}).eq('user_id',uid));await c.storage.from('mfd-avatars').remove([mine.avatar_path])}},'Photo removed')}
 const photoInput=(id?:string,label='Add photo')=><label className="chip social-chip" title={label}><Camera aria-hidden="true"/>{label}<input hidden disabled={busy} type="file" accept="image/*" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0],id);e.target.value=''}}/></label>;
 function copyWorkout(w:any){let original=engine().peek(),db=toDB({...original,state:{...original.state,sessions:[w.data],routines:[],active:null}},engine().catalogue()),session=db.workouts[0];if(session)setCopy({w:{...session,title:w.data.name||session.title},extra:db.customExercises})}
 const request=(p:P)=>run(()=>checked(c.from('mfd_friendships').insert({recipient:p.user_id})),'Request sent');
 const accept=(l:any)=>run(()=>checked(c.from('mfd_friendships').update({status:'accepted'}).eq('id',l.id)),'You are now friends');
 const cancel=(l:any,msg:string)=>run(()=>checked(c.from('mfd_friendships').delete().eq('id',l.id)),msg);
 const like=(owner:string,workout:string,liked:boolean)=>run(async()=>{if(liked)await checked(c.from('mfd_reactions').delete().eq('user_id',uid).eq('owner_id',owner).eq('workout_id',workout));else await checked(c.from('mfd_reactions').insert({owner_id:owner,workout_id:workout}));feedRef.current?.react(owner,workout,!liked);setReactions(feedRef.current?.reactionList()||[])});
 const likersOf=(owner:string,workout:string)=>(feedRef.current?.likesFor(owner,workout)??[]).map(r=>profiles.find(p=>p.user_id===r.user_id)).filter((p):p is P=>!!p);

 /** Like / comment / copy / share for one row. */
 function actionsFor(row:any,title:string):CardActions{const liked=reactions.some(r=>r.user_id===uid&&r.owner_id===row.owner_id&&r.workout_id===row.workout_id);return {liked,likes:reactions.filter(r=>r.owner_id===row.owner_id&&r.workout_id===row.workout_id).length,comments:feedRef.current?.commentsFor(row.owner_id,row.workout_id).length??0,onLike:()=>like(row.owner_id,row.workout_id,liked),onComments:()=>setThread({owner:row.owner_id,workout:row.workout_id,title}),onCopy:()=>copyWorkout(row),onShare:()=>shareWorkout(row.owner_id,row.workout_id,title)}}
 function ownPhotoControls(row:any){const key=row.owner_id+':'+row.workout_id;return row.owner_id!==uid?undefined:<>
  <label className="fr-action" aria-label={photos[key]?'Change photo':'Add photo'} title={photos[key]?'Change photo':'Add photo'}><Camera aria-hidden="true"/><input hidden disabled={busy} type="file" accept="image/*" onChange={e=>{if(e.target.files?.[0])upload(e.target.files[0],row.workout_id);e.target.value=''}}/></label>
  {photos[key]&&<button className="fr-action" aria-label="Remove photo" onClick={()=>setConfirm({title:'Remove this photo?',label:'Remove',run:()=>removePhoto(row.workout_id)})}><Trash2 aria-hidden="true"/></button>}
 </>}
 function card(row:any){const p=profiles.find(x=>x.user_id===row.owner_id);if(!p)return null;const {w,records}=workoutOf(row.owner_id,row.workout_id);if(!w)return null;const key=row.owner_id+':'+row.workout_id;
  return <FeedCard key={key} owner={p} w={w} when={row.data?.started??w.startedAt} unit={units} records={records?recordCount(w,records):null} photo={photos[key]} exerciseOf={exerciseOf} nameOf={nameOf} avatar={avatar as any} uid={uid!} likers={likersOf(row.owner_id,row.workout_id)} actions={actionsFor(row,w.title)} ownExtra={ownPhotoControls(row)} onOpen={()=>openWorkout(row.owner_id,row.workout_id)} onProfile={()=>openProfile(p)} onLikes={()=>setLikesOf({owner:row.owner_id,workout:row.workout_id})}/>}

 // ── Activity: likes and comments on my workouts (this week's feed), newest first, likes grouped per workout and day ──
 const activity=useMemo(()=>{const feed=feedRef.current;if(!feed||!uid)return [];type Item={key:string;at:number;kind:'like'|'comment';who:string[];owner:string;workout:string;text?:string};const items:Item[]=[];const likeGroups=new Map<string,Item>();
  for(const r of feed.reactionList()){if(r.owner_id!==uid||r.user_id===uid)continue;const at=Date.parse(r.created_at),day=new Date(at).toDateString(),k=r.workout_id+'|'+day;const g=likeGroups.get(k);if(g){g.who.push(r.user_id);g.at=Math.max(g.at,at)}else{const it:Item={key:'l'+k,at,kind:'like',who:[r.user_id],owner:r.owner_id,workout:r.workout_id};likeGroups.set(k,it);items.push(it)}}
  for(const row of feed.rows.values())if(row.owner_id===uid)for(const x of feed.commentsFor(uid,row.workout_id))if(x.user_id!==uid)items.push({key:'c'+x.id,at:Date.parse(x.created_at),kind:'comment',who:[x.user_id],owner:uid,workout:row.workout_id,text:x.body});
  return items.sort((a,b)=>b.at-a.at)},[reactions,tick,uid,workouts]);
 const newActivity=activity.filter(a=>a.at>seen).length;
 useEffect(()=>{if(view.kind==='activity'&&uid&&activity.length){const t=Math.max(seen,activity[0]!.at);if(t>seen){writeSeen(uid,t)}}},[view.kind,activity,uid]);
 useEffect(()=>{if(view.kind!=='activity'&&uid)setSeen(readSeen(uid))},[view.kind,uid]);

 const syncNote=syncState!=='saved'&&<p className="social-sync-note" role="status">{syncState==='pending'?'Your latest edits are on this device; cloud sync is pending.':syncState==='offline'?'Offline · your new workouts will reach friends after syncing.':'Cloud sync needs attention. Your local workouts are preserved.'}</p>;
 const sheets=<>
  <CopyWorkoutSheet workout={copy?.w??null} extraExercises={copy?.extra} onClose={()=>setCopy(null)}/>
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
  <Sheet open={!!likesOf} onClose={()=>setLikesOf(null)} title={likesOf?`Likes · ${likersOf(likesOf.owner,likesOf.workout).length}`:'Likes'}>
   <div className="social-list">{likesOf&&likersOf(likesOf.owner,likesOf.workout).map(p=><button key={p.user_id} className="social-person" onClick={()=>openProfile(p)}>{avatar(p)}<span className="grow"><span className="name">{p.user_id===uid?'You':p.display_name}</span><span className="sub">@{p.username}</span></span><ChevronRight aria-hidden="true"/></button>)}</div>
  </Sheet>
  <CommentsSheet thread={thread} onClose={()=>{setThread(null);setTick(n=>n+1)}} uid={uid!} feed={feedRef.current} profiles={profiles} avatar={avatar} onChange={()=>setTick(n=>n+1)} onOpen={openProfile}/>
  <ConfirmSheet open={!!confirm} onClose={()=>setConfirm(null)} danger title={confirm?.title??''} body={confirm?.body} confirmLabel={confirm?.label??'OK'} onConfirm={()=>{confirm?.run();setConfirm(null)}}/>
  {detail&&<ExercisePage exercise={detail} onClose={()=>setDetail(null)}/>}
 </>;

 if(view.kind==='chat')return selected&&friend(selected.user_id)?<ChatView me={uid!} friend={selected} avatar={avatar(selected)} onBack={back}/>:<><TopBar title="Chat" back="/friends"/><div className="screen">{profiles.length?<Empty icon={LockKeyhole} title="Chat is for friends"/>:<p className="small muted">Loading…</p>}</div></>;

 // ── Workout page ──
 if(view.kind==='workout'){
  const row=feedRef.current?.row(view.owner,view.workout);const owner=profiles.find(p=>p.user_id===view.owner);const {w,records}=row?workoutOf(view.owner,view.workout):{w:null,records:null};
  const allowed=view.owner===uid||friend(view.owner);
  return <>
   <TopBar title={w?.title??'Workout'} back="/friends" bordered/>
   <div className="screen fr-screen">
    {error&&<p role="alert" className="social-error">{error}</p>}
    {!allowed&&links.length>0?<Empty icon={LockKeyhole} title="Workouts are shared with friends"/>:!w||!owner?<p className="small muted fr-loading">{loading||!profiles.length?'Loading…':'This workout is no longer shared.'}</p>:<>
     <section className="card fr-section">
      <button type="button" className="fr-head" onClick={()=>openProfile(owner)} aria-label={`Open ${owner.display_name}'s profile`}>{avatar(owner)}<span className="grow"><span className="name">{owner.display_name}</span><span className="sub tnum">{new Date(w.startedAt).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'})} · {new Date(w.startedAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span></span></button>
      <h1 className="fr-page-title">{w.title}</h1>
      <StatRow w={w} unit={units} records={records?recordCount(w,records):null} withSets/>
      <ActionRow a={actionsFor(row,w.title)} extra={ownPhotoControls(row)}/>
      <LikedBy likers={likersOf(view.owner,view.workout)} uid={uid!} avatar={avatar as any} onOpen={()=>setLikesOf({owner:view.owner,workout:view.workout})}/>
     </section>
     {photos[view.owner+':'+view.workout]&&<img className="social-photo fr-page-photo" src={photos[view.owner+':'+view.workout]} alt={`${owner.display_name}'s workout photo`} loading="lazy" decoding="async"/>}
     <MuscleSplitBars split={muscleSplit([w],[...extraExercises.values(),...exerciseRepo.all()])}/>
     <SetTable w={w} unit={units} records={records} exerciseOf={exerciseOf} nameOf={nameOf} onExercise={id=>{const e=exerciseOf(id);if(e)setDetail(e)}}/>
     {view.owner!==uid&&mine&&<CompareRow me={mine} friend={owner} avatar={avatar as any} label="Compare with me" onClick={()=>navigate(`/friends/compare/${owner.username}`)}/>}
    </>}
   </div>
   {sheets}
  </>;
 }

 // ── Comparison (private) ──
 if(view.kind==='compare'){
  const them=selected;const theirHistory=them?histOf(them.user_id):null;const exId=view.exercise?decodeURIComponent(view.exercise):undefined;
  const now=Date.now(),a=inPeriod(localHistory,period,now),b=theirHistory?inPeriod(theirHistory,period,now):[];
  const picker=<Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS}/>;
  const body=!them||!mine?<p className="small muted fr-loading">Loading…</p>:!friend(them.user_id)?<Empty icon={LockKeyhole} title="Compare with friends"/>:!theirHistory?<p className="small muted fr-loading">Loading {them.display_name}’s workouts…</p>:exId?(()=>{
   const ex=exerciseOf(exId),metrics=exerciseMetrics(exId,a,b);
   return <>{picker}<Hero me={mine} friend={them} avatar={avatar as any} leader={leader(metrics)}/>
    <section className="card fr-ex-head"><ExerciseThumb exercise={ex}/><span className="grow"><span className="strong ellipsis">{nameOf(exId)}</span><span className="sub">{ex?.primaryMuscle&&ex.primaryMuscle!=='Other'?ex.primaryMuscle:''}</span></span></section>
    <section className="card fr-section">{metrics.map(m=><Metric key={m.label} label={m.label} mine={m.mine} theirs={m.theirs} me={mine} friend={them} avatar={avatar as any} fmt={metricFormat(m,units)}/>)}</section>
    <Private/></>})():(()=>{
   const t1=totals(a),t2=totals(b),common=commonExercises(a,b);
   return <>{picker}<Hero me={mine} friend={them} avatar={avatar as any}/>
    <Radar mine={muscleSplit(a,[...extraExercises.values(),...exerciseRepo.all()])} theirs={muscleSplit(b,[...extraExercises.values(),...exerciseRepo.all()])} friendName={them.display_name}/>
    <section className="card fr-section"><div className="eyebrow">Stats · {PERIOD_TITLE[period]}</div>
     <Metric label="Workouts" mine={t1.count} theirs={t2.count} me={mine} friend={them} avatar={avatar as any} fmt={v=>String(v)}/>
     <Metric label="Workout time" mine={t1.minutes} theirs={t2.minutes} me={mine} friend={them} avatar={avatar as any} fmt={v=>`${(v/60).toFixed(1)} h`}/>
     <Metric label="Total volume" mine={t1.volume} theirs={t2.volume} me={mine} friend={them} avatar={avatar as any} fmt={v=>fmtVolume(v,units)}/>
    </section>
    <section className="card fr-section"><div className="fr-chart-head"><span className="eyebrow">Exercises in common</span><InfoButton title="Exercises in common" lines={['Exercises you both logged in this period. Tap one to compare.']}/></div>
     {common.length===0?<p className="small muted">None in this period</p>:<div className="fr-common">{common.map(id=>{const ex=exerciseOf(id);return <button key={id} type="button" className="fr-common-row" onClick={()=>navigate(`/friends/compare/${them.username}/${encodeURIComponent(id)}`)}><ExerciseThumb exercise={ex}/><span className="grow"><span className="strong ellipsis">{nameOf(id)}</span><span className="sub">{ex?.primaryMuscle&&ex.primaryMuscle!=='Other'?ex.primaryMuscle:''}</span></span><ChevronRight aria-hidden="true"/></button>})}</div>}
    </section>
    <Private/></>})();
  return <><TopBar title={exId?'Exercise comparison':them?`You vs ${them.display_name}`:'Compare'} back="/friends" bordered/><div className="screen fr-screen">{error&&<p role="alert" className="social-error">{error}</p>}{body}</div>{sheets}</>;
 }

 // ── Activity ──
 if(view.kind==='activity'){
  const groups:[string,typeof activity][]=[];const today=new Date().toDateString();
  for(const it of activity){const label=new Date(it.at).toDateString()===today?'Today':'This week';const g=groups.find(x=>x[0]===label);if(g)g[1].push(it);else groups.push([label,[it]])}
  const requests=incoming.map(l=>({l,p:profiles.find(p=>p.user_id===l.sender)})).filter((x):x is {l:any;p:P}=>!!x.p);
  const titleOf=(id:string)=>{const r=feedRef.current?.row(uid!,id);return r?.data?.name??localById.get(id)?.title??'your workout'};
  return <><TopBar title="Activity" back="/friends" bordered/><div className="screen fr-screen">
   {requests.length>0&&<section className="card fr-section"><div className="eyebrow">Friend requests</div>{requests.map(({l,p})=><div key={l.id} className="fr-activity">{avatar(p)}<span className="grow"><b>{p.display_name}</b> sent you a friend request</span><span className="social-request-actions"><button className="round-icon" aria-label={`Decline ${p.display_name}`} disabled={busy} onClick={()=>cancel(l,'Request declined')}><X aria-hidden="true"/></button><button className="round-icon accent" aria-label={`Accept ${p.display_name}`} disabled={busy} onClick={()=>accept(l)}><Check aria-hidden="true"/></button></span></div>)}</section>}
   {activity.length===0&&requests.length===0&&<Empty icon={Bell} title="No activity yet">Likes and comments on your workouts show up here.</Empty>}
   {groups.map(([label,items])=><section key={label} className="card fr-section"><div className="eyebrow">{label}</div>{items.map(it=>{const people=[...new Set(it.who)].map(id=>profiles.find(p=>p.user_id===id)).filter((p):p is P=>!!p);if(!people.length)return null;const first=people[0]!,others=people.length-1;
    return <button key={it.key} type="button" className={'fr-activity'+(it.at>seen?' new':'')} onClick={()=>{openWorkout(it.owner,it.workout);if(it.kind==='comment')setThread({owner:it.owner,workout:it.workout,title:titleOf(it.workout)})}}>
     <span className="fr-activity-avatar">{avatar(first)}<span className={'fr-activity-kind '+it.kind}>{it.kind==='like'?<Heart aria-hidden="true" fill="currentColor"/>:<MessageCircle aria-hidden="true"/>}</span></span>
     <span className="grow"><span><b>{first.display_name}</b>{others>0&&<> and {others} other{others===1?'':'s'}</>} {it.kind==='like'?'liked':'commented on'} <b>{titleOf(it.workout)}</b>{it.text&&<>: “{it.text}”</>}</span><span className="sub">{agoText(it.at)}</span></span>
    </button>})}</section>)}
  </div>{sheets}</>;
 }

 const meProfile=selected&&selected.user_id===uid;
 const profileHistory=selected?histOf(selected.user_id):null;
 const weekStart=mondayOf(Date.now());
 const trainedFriends=[...new Set(shown.filter(r=>r.owner_id!==uid&&new Date(r.data?.started??r.started_at).getTime()>=weekStart).map(r=>r.owner_id))].map(id=>profiles.find(p=>p.user_id===id)).filter((p):p is P=>!!p);
 const myWeek=localHistory.filter(w=>w.startedAt>=weekStart).length;
 return <>
  {view.kind==='profile'?<TopBar title={selected?.display_name??''} back="/friends" actions={selected&&friend(selected.user_id)?<button className="icon-btn" aria-label="Friend options" onClick={()=>setMenu(true)}><MoreHorizontal/></button>:undefined}/>
  :<TopBar title="Friends" actions={<>
   <button className="icon-btn" aria-label="Refresh feed" onClick={refreshFeed}><RefreshCw className={loading?'spin':''}/></button>
   <button className="icon-btn badge-host" aria-label={newActivity?`Activity · ${newActivity} new`:'Activity'} onClick={()=>navigate('/friends/activity')}><Bell/>{newActivity>0&&<span className="count-badge">{newActivity}</span>}</button>
   <button className="icon-btn badge-host" aria-label={incoming.length?`People · ${incoming.length} requests`:'People'} onClick={()=>setPeople(true)}><UserPlus/>{incoming.length>0&&<span className="count-badge">{incoming.length}</span>}</button>
   <button className="icon-btn badge-host" aria-label={unread.length?`Inbox · ${unread.length} unread`:'Inbox'} onClick={()=>{setInbox(true);loadUnread()}}><Inbox/>{unread.length>0&&<span className="count-badge">{unread.length}</span>}</button>
  </>}/>}
  <div className="screen social-screen">
   {view.kind!=='profile'&&<Segmented label="Friends view" value={view.kind==='me'?'me':'feed'} onChange={v=>navigate(v==='me'?'/friends/me':'/friends',{replace:true})} options={[{value:'feed',label:'Feed'},{value:'me',label:'My profile'}]}/>}
   {error&&<p role="alert" className="social-error">{error}</p>}
   {!mine&&!known?null:!mine?<div className="card social-setup"><p>Choose a username to use Friends.</p><button className="btn btn-primary" onClick={()=>navigate('/settings/profile')}>Set up profile</button></div>:<>
    {view.kind==='feed'&&<>
     {syncNote}
     <div className="card fr-week"><span className="eyebrow">This week</span><span className="tnum strong">{myWeek}/{goal}<span className="muted"> workouts</span></span><span className="fr-week-friends">{trainedFriends.length>0&&<span className="fr-stack">{trainedFriends.slice(0,3).map(p=><span key={p.user_id}>{avatar(p,'xs')}</span>)}</span>}<span className="tnum strong">{trainedFriends.length} trained</span></span></div>
     {shown.length===0&&!loading&&<Empty icon={Users} title="No workouts from friends this week" action={<button className="btn btn-primary" onClick={()=>setPeople(true)}><UserPlus aria-hidden="true"/>Find people</button>}/>}
     {shown.slice(0,limit).map(card)}
     {shown.length>limit&&<button className="btn btn-soft btn-block" onClick={()=>setLimit(n=>n+20)}>Load more</button>}
    </>}
    {(view.kind==='me'||view.kind==='profile')&&selected&&<>
     <section className="card social-profile">
      {avatar(selected,'lg')}
      <h2>{selected.display_name}</h2><span className="handle">@{selected.username}</span>
      {(meProfile||friend(selected.user_id))&&<div className="fr-profile-stats tnum">{([['Workouts',profileHistory?String(profileHistory.length):'–'],['This week',profileHistory?`${weeklyMinutes(profileHistory,1).at(-1)!.minutes} min`:'–'],['Streak',profileHistory?`${weekStreak(profileHistory)} wk`:'–']] as const).map(([k,v])=><div key={k}><strong>{v}</strong><span>{k}</span></div>)}</div>}
      <div className="social-profile-actions">
       {meProfile?<>
        {photoInput(undefined,mine.avatar_path?'Change photo':'Add photo')}
        {mine.avatar_path&&<button className="chip social-chip" onClick={()=>setConfirm({title:'Remove your profile photo?',label:'Remove',run:()=>removePhoto()})}><Trash2 aria-hidden="true"/>Remove</button>}
        <button className="chip social-chip" onClick={()=>navigate('/settings/profile')}><Pencil aria-hidden="true"/>Edit</button>
       </>:friend(selected.user_id)?<>
        <button className="btn btn-primary btn-sm" onClick={()=>openChat(selected)}><MessageCircle aria-hidden="true"/>Message</button>
       </>:(()=>{const l=links.find(l=>[l.sender,l.recipient].includes(selected.user_id));return l?l.recipient===uid?<button className="btn btn-primary btn-sm" onClick={()=>accept(l)}><Check aria-hidden="true"/>Accept request</button>:<button className="chip social-chip" onClick={()=>cancel(l,'Request cancelled')}><Clock aria-hidden="true"/>Requested</button>:<button className="btn btn-primary btn-sm" onClick={()=>request(selected)}><UserPlus aria-hidden="true"/>Add friend</button>})()}
       <button className="chip social-chip" onClick={()=>share(selected)}><Share2 aria-hidden="true"/>Share</button>
      </div>
     </section>
     {meProfile&&syncNote}
     {(meProfile||friend(selected.user_id))&&profileHistory&&<HoursChart weeks={weeklyMinutes(profileHistory,12)}/>}
     {!meProfile&&friend(selected.user_id)&&<CompareRow me={mine} friend={selected} avatar={avatar as any} label="Compare" onClick={()=>navigate(`/friends/compare/${selected.username}`)}/>}
     {meProfile||friend(selected.user_id)?<>{displayed.length>0&&<div className="eyebrow fr-recent">Recent workouts</div>}{displayed.map(card)}{displayed.length===0&&!loading&&<p className="small muted social-empty">No workouts yet</p>}{profileOwner&&feedRef.current?.hasMore(profileOwner)&&<button className="btn btn-soft btn-block" disabled={loading} onClick={moreProfile}>Load more</button>}</>:<Empty icon={LockKeyhole} title="Workouts are shared with friends"/>}
    </>}
    {view.kind==='profile'&&!selected&&profiles.length>0&&<Empty icon={Users} title="No one with this username"/>}
   </>}
  </div>
  {sheets}
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
