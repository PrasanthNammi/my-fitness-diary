import {useSyncExternalStore} from 'react';
import {CloudOff,CloudUpload} from 'lucide-react';
import {engine,openTool} from '../adapters/engine';
// Problems (conflict, error) are shown by the attention dot on the avatar and on Settings > Account.
function status(){const s=engine()?.peek();return !s||s.conflict||s.error?'':s.offline?'offline':s.dirty||s.busy?'pending':''}
export function SyncStatus(){const value=useSyncExternalStore(fn=>engine()?.subscribe(fn)||(()=>{}),status);if(!value)return null;const Icon=value==='offline'?CloudOff:CloudUpload;return <button className="icon-btn sync-status" aria-label={value==='offline'?'Offline. Changes stay on this device until reconnection.':'Saved on this device. Cloud sync pending.'} title={value==='offline'?'Offline':'Saving'} onClick={()=>openTool('account')}><Icon/></button>}
