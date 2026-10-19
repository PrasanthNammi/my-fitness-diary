import {useSyncExternalStore} from 'react';
import {CloudOff,CloudUpload,CloudAlert} from 'lucide-react';
import {engine,openTool} from '../adapters/engine';
function status(){const s=engine()?.peek();return !s?'':s.conflict||s.error?'error':s.offline?'offline':s.dirty||s.busy?'pending':''}
export function SyncStatus(){const value=useSyncExternalStore(fn=>engine()?.subscribe(fn)||(()=>{}),status);if(!value)return null;const Icon=value==='error'?CloudAlert:value==='offline'?CloudOff:CloudUpload;return <button className="icon-btn sync-status" aria-label={value==='error'?'Sync needs attention':value==='offline'?'Offline. Changes stay on this device until reconnection.':'Saved on this device. Cloud sync pending.'} title={value==='error'?'Sync':value==='offline'?'Offline':'Saving'} onClick={()=>openTool('account')}><Icon/></button>}
