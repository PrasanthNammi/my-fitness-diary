import {syncKey,syncNow} from '../lib/sync';
import {ExercisePicker} from './training/ExercisePicker';
import {useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {Timer,UserRound,Ruler,Goal,Library,Database,ShieldUser,Utensils,Dumbbell,Flag,Download,Upload,Archive,LogOut,RefreshCw,Bell,Palette,Bot,ChevronRight} from 'lucide-react';
import {AppearanceSettings} from './settings/AppearanceSettings';
import {NotificationSettings} from './settings/NotificationSettings';
import {ConfirmSheet,TopBar,Sheet,toast} from '../components/ui';
import {SettingsScreen} from './settings/SettingsScreen';
import {openTool,engine} from '../adapters/engine';
import {goBack,navigate} from '../lib/router';
import {auth} from '../adapters/auth';
import {useDB} from '../data/store';
import {useTargets} from '../data/selectors';
import {energyValue,fmtInt,fmtNum,kgTo,mss} from '../lib/format';

type Item={icon:ReactNode;label:string;sub?:string;onClick:()=>void;danger?:boolean;dot?:boolean};
function Rows({items}:{items:Item[]}){return <div className="card settings-rows">{items.map(it=><button key={it.label} className={'settings-row'+(it.danger?' danger':'')} aria-label={it.dot?`${it.label} · needs attention`:undefined} onClick={it.onClick}>
 <span className="settings-row-icon" aria-hidden="true">{it.icon}</span>
 <span className="grow"><span className="label">{it.label}</span>{it.sub&&<span className="sub">{it.sub}</span>}</span>
 {it.dot&&<span className="attention-dot static" aria-hidden="true"/>}{!it.danger&&<ChevronRight className="chev" aria-hidden="true"/>}
</button>)}</div>}

function appearance(){try{const v=localStorage.getItem('mfd-appearance');return v==='light'?'Light':v==='dark'?'Dark':'System'}catch{return 'System'}}

export function SettingsLive({section}:{section:string|null}){
 const [importing,setImporting]=useState(false),[leaving,setLeaving]=useState(false);
 const syncState=useSyncExternalStore(fn=>engine()?.subscribe(fn)||(()=>{}),syncKey);const [sync,syncText]=syncState.split('|') as [string,string];
 const profile=useDB(d=>d.profile),settings=useDB(d=>d.settings),account=useDB(d=>d.account),t=useTargets()?.targets;
 const file=useRef<HTMLInputElement>(null);
 // Closing the exercise list steps back (it used to open Catalogue again, so the back arrow returned to Exercises).
 if(section==='exercises')return <ExercisePicker browse open onClose={()=>goBack('/settings/catalogue')} onAdd={()=>{}}/>;
 if(['profile','targets','units','workout'].includes(section||''))return <SettingsScreen section={section}/>;
 if(section==='notifications')return <NotificationSettings/>;
 if(section==='appearance')return <AppearanceSettings/>;
 const go=(p:string)=>()=>navigate('/settings/'+p);
 const pages:Record<string,{title:string;items:Item[]}>={
  catalogue:{title:'Exercise & food catalogue',items:[
   {icon:<Dumbbell/>,label:'Exercises',sub:'Browse, search, create your own',onClick:go('exercises')},
   {icon:<Utensils/>,label:'Foods',sub:'Shared and your own foods',onClick:()=>openTool('food')}]},
  data:{title:'Data',items:[
   {icon:<Upload/>,label:'Import',sub:'Hevy workouts or an MFD backup',onClick:()=>setImporting(true)},
   {icon:<Download/>,label:'Export',sub:'Download a backup of your diary',onClick:()=>openTool('backup')},
   {icon:<Flag/>,label:'Reports',sub:'Nutrition data you reported',onClick:()=>openTool('reports')}]},
  account:{title:'Account',items:[
   {icon:<RefreshCw/>,label:'Sync now',sub:syncText,dot:sync==='attention',onClick:()=>{void syncNow()}},
   {icon:<LogOut/>,label:'Log out',danger:true,onClick:()=>setLeaving(true)}]},
 };
 const page=section?pages[section]:undefined;
 const name=profile?.firstName||profile?.name||'You';
 const groups:{title:string;items:Item[]}[]=[
  {title:'You',items:[
   {icon:<UserRound/>,label:'Profile',sub:profile?[profile.name,`${fmtInt(profile.heightCm)} cm`,`${fmtNum(kgTo(profile.weightKg,settings.weightUnit),1)} ${settings.weightUnit}`].filter(Boolean).join(' · '):'Set up your profile',onClick:go('profile')},
   {icon:<Goal/>,label:'Targets',sub:t?`${fmtInt(energyValue(t.kcal,settings.energyUnit))} ${settings.energyUnit} · P ${t.protein} · C ${t.carbs} · F ${t.fat}`:undefined,onClick:go('targets')},
   {icon:<Ruler/>,label:'Units',sub:[settings.weightUnit,settings.energyUnit,settings.lengthUnit ?? 'cm',settings.weekStart===0?'week from Sun':settings.weekStart===6?'week from Sat':''].filter(Boolean).join(' · '),onClick:go('units')}]},
  {title:'App',items:[
   {icon:<Palette/>,label:'Appearance',sub:appearance(),onClick:go('appearance')},
   {icon:<Timer/>,label:'Workout',sub:`Screen, vibration, rest ${mss(settings.defaultRestSec)}`,onClick:go('workout')},
   {icon:<Bell/>,label:'Notifications',sub:'Rest timers, AI entries',onClick:go('notifications')},
   {icon:<Library/>,label:'Exercise & food catalogue',sub:'Exercises, foods',onClick:go('catalogue')},
   {icon:<Bot/>,label:'AI assistants',sub:'ChatGPT and Claude',onClick:()=>navigate('/coach')}]},
  {title:'Data & account',items:[
   {icon:<Database/>,label:'Data',sub:'Import, export, reports',onClick:go('data')},
   {icon:<ShieldUser/>,label:'Account',sub:sync==='saved'?account?.email??syncText:syncText,dot:sync==='attention',onClick:go('account')}]},
 ];
 return <>
  <TopBar title={page?page.title:'Settings'} back={page?'/settings':undefined}/>
  <div className="screen settings-page">
   {page?<>{section==='account'&&account?.email&&<p className="settings-signed-in">Signed in as <strong>{account.email}</strong></p>}<Rows items={page.items}/></>:<>
    <button className="card settings-me" onClick={go('profile')}>
     <span className="settings-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()||'?'}</span>
     <span className="grow"><span className="name">{profile?.name||name}</span><span className="sub">{account?.email??''}</span></span>
     <ChevronRight className="chev" aria-hidden="true"/>
    </button>
    {groups.map(g=><section key={g.title} className="settings-group"><div className="eyebrow">{g.title}</div><Rows items={g.items}/></section>)}
    <p className="settings-version">My Fitness Diary 1.0</p>
   </>}
  </div>
  <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{let f=e.target.files?.[0];e.target.value='';if(!f)return;setImporting(false);try{await engine().restore(f);openTool('restore')}catch(error){toast(error instanceof Error?error.message:'Import failed')}}}/>
  <Sheet open={importing} onClose={()=>setImporting(false)} title="Import"><Rows items={[{icon:<Dumbbell/>,label:'Hevy',sub:'Workouts from a Hevy CSV export',onClick:()=>{setImporting(false);openTool('import')}},{icon:<Archive/>,label:'Backup',sub:'An MFD backup file (.json)',onClick:()=>file.current?.click()}]}/></Sheet>
  <ConfirmSheet open={leaving} onClose={()=>setLeaving(false)} danger title="Log out of My Fitness Diary?" body={sync==='saved'?undefined:'Some changes are not saved to the cloud yet. They stay on this device.'} confirmLabel="Log out" onConfirm={()=>{setLeaving(false);auth.signOut()}}/>
 </>;
}
