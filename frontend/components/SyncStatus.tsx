import {useSyncExternalStore} from 'react';
import {CloudOff,CloudUpload,RefreshCw} from 'lucide-react';
import {engine} from '../adapters/engine';
import {syncKey,syncNow} from '../lib/sync';
// Shown only while something isn't in the cloud yet. Tap = Sync now (with feedback). Problems also show the
// attention dot on the avatar and on Settings > Account.
export function SyncStatus(){
 const key=useSyncExternalStore(fn=>engine()?.subscribe(fn)||(()=>{}),syncKey);const [kind,label]=key.split('|') as [string,string];
 if(kind==='saved'||kind==='attention')return null;
 const Icon=kind==='offline'?CloudOff:kind==='retrying'?RefreshCw:CloudUpload;
 return <button className={'icon-btn sync-status '+kind} aria-label={label+'. Tap to sync now.'} title={label} onClick={()=>{void syncNow()}}><Icon/></button>;
}
