import {ExercisePicker} from './training/ExercisePicker';
import {useRef,useState,useSyncExternalStore} from 'react';
import {UserRound,Ruler,Goal,Library,Database,ShieldUser,Utensils,Dumbbell,Flag,Download,Upload,Archive,LogOut,RefreshCw,Bell,Palette} from 'lucide-react';
import {AppearanceSettings} from './settings/AppearanceSettings';
import {NotificationSettings} from './settings/NotificationSettings';
import {TopBar,Sheet,toast} from '../components/ui';
import {SettingsScreen} from './settings/SettingsScreen';
import {openTool,engine} from '../adapters/engine';
import {navigate} from '../lib/router';
import {auth} from '../adapters/auth';
export function SettingsLive({section}:{section:string|null}){
 const [importing,setImporting]=useState(false);
 const attention=useSyncExternalStore(fn=>engine()?.subscribe(fn)||(()=>{}),()=>{const s=engine()?.peek();return !!(s?.conflict||s?.error)});const file=useRef<HTMLInputElement>(null);
 if(section==='exercises')return <ExercisePicker browse open onClose={()=>navigate('/settings/catalogue')} onAdd={()=>{}}/>;
 if(['profile','targets','units'].includes(section||''))return <SettingsScreen section={section}/>;
 if(section==='notifications')return <NotificationSettings/>;
 if(section==='appearance')return <AppearanceSettings/>;
 const groups:any={catalogue:[[Utensils,'Foods',()=>openTool('food')],[Dumbbell,'Exercises',()=>navigate('/settings/exercises')],[Flag,'Reports',()=>openTool('reports')]],data:[[Upload,'Import',()=>setImporting(true)],[Download,'Export',()=>openTool('backup')]],account:[[RefreshCw,'Sync',()=>openTool('account')],[LogOut,'Logout',()=>auth.signOut()]]};
 const home:any[]=[[UserRound,'Profile','profile'],[Goal,'Targets','targets'],[Ruler,'Units','units'],[Bell,'Notifications','notifications'],[Palette,'Appearance','appearance'],[Library,'Catalogue','catalogue'],[Database,'Data','data'],[ShieldUser,'Account','account']];
 const items=groups[section||''];
 return <><TopBar title={section?section[0].toUpperCase()+section.slice(1):'Settings'} back={section?'/settings':undefined}/><div className="screen settings-page"><div className={items?'settings-options':'settings-grid'}>{items?items.map(([Icon,label,fn]:any)=><button className="settings-option" key={label} onClick={fn}><Icon/><span>{label}</span></button>):home.map(([Icon,label,path])=><button className="settings-tile" key={path} aria-label={path==='account'&&attention?label+' · sync needs attention':label} onClick={()=>navigate('/settings/'+path)}><Icon/><span>{label}</span>{path==='account'&&attention&&<span className="attention-dot" aria-hidden="true"/>}</button>)}</div></div><input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{let f=e.target.files?.[0];e.target.value='';if(!f)return;setImporting(false);try{await engine().restore(f);openTool('restore')}catch(error){toast(error instanceof Error?error.message:'Import failed')}}}/><Sheet open={importing} onClose={()=>setImporting(false)} title="Import"><div className="settings-options"><button className="settings-option" onClick={()=>{setImporting(false);openTool('import')}}><Dumbbell/><span>Hevy</span></button><button className="settings-option" onClick={()=>file.current?.click()}><Archive/><span>Backup</span></button></div></Sheet></>;
}
