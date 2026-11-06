import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {engine} from '../adapters/engine';

/**
 * New versions install in the background. People can apply one straight away from the
 * "New version available" banner; otherwise it applies by itself once the app is idle.
 * Either way: only after drafts are saved, never during a workout, and no sign-out.
 */
export function AppUpdates(){
 const requested=useRef(false),manual=useRef(false);
 const [waiting,setWaiting]=useState(false),[canTap,setCanTap]=useState(false),[dismissed,setDismissed]=useState(false),[updating,setUpdating]=useState(false),[blocked,setBlocked]=useState(false);
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  let cancelled=false,lastActivity=Date.now(),lastCheck=0,giveUp:ReturnType<typeof setTimeout>|undefined;
  const active=()=>{lastActivity=Date.now()};
  const view=()=>({hidden:document.hidden,idleMs:Date.now()-lastActivity,hash:location.hash,drafts:!!document.querySelector('.sheet,.exercise-page,form'),focused:document.activeElement?.tagName||''});
  const safe=()=>isSafeUpdate(engine()?.peek(),view());
  const tapSafe=()=>isSafeTapUpdate(engine()?.peek(),view());
  // A tapped update only needs this window to be at a safe point; an automatic one also needs it idle.
  const ready=()=>(manual.current?tapSafe():safe())&&engine()?.checkpoint()===true;
  const refresh=async()=>{const registration=await navigator.serviceWorker.getRegistration();if(cancelled)return;setWaiting(!!registration?.waiting&&!!navigator.serviceWorker.controller);setCanTap(tapSafe())};
  const check=async()=>{const registration=await navigator.serviceWorker.getRegistration();if(cancelled||!registration)return;if(Date.now()-lastCheck>300000){lastCheck=Date.now();registration.update().catch(()=>{})}if(registration.waiting&&!requested.current&&!manual.current&&ready()){requested.current=true;registration.waiting.postMessage({type:'MFD_REQUEST_UPDATE'});setTimeout(()=>{requested.current=false},10000)}refresh()};
  const message=(event:MessageEvent)=>{if(event.data?.type==='MFD_CHECK_READY')event.ports[0]?.postMessage({ready:ready()})};
  const changed=()=>{if(manual.current||ready())location.reload()};
  const visibility=()=>{if(!document.hidden){setDismissed(false);check()}};
  // Tapping "Update": save, ask the new version to take over, reload when it has.
  const apply=async()=>{const registration=await navigator.serviceWorker.getRegistration();if(!registration?.waiting||!tapSafe()||engine()?.checkpoint()!==true){refresh();return}
   manual.current=true;setUpdating(true);setBlocked(false);registration.waiting.postMessage({type:'MFD_REQUEST_UPDATE'});
   // Another open MFD window (a second tab, mid-workout) can hold the old version.
   clearTimeout(giveUp);giveUp=setTimeout(()=>{manual.current=false;setUpdating(false);setBlocked(true)},6000)};
  window.addEventListener('mfd-apply-update',apply);
  window.addEventListener('pointerdown',active,{passive:true});window.addEventListener('keydown',active);window.addEventListener('input',active);window.addEventListener('hashchange',refresh);document.addEventListener('visibilitychange',visibility);navigator.serviceWorker.addEventListener('message',message);navigator.serviceWorker.addEventListener('controllerchange',changed);
  const timer=setInterval(check,15000),ui=setInterval(refresh,2000);check();
  return()=>{cancelled=true;clearInterval(timer);clearInterval(ui);clearTimeout(giveUp);window.removeEventListener('mfd-apply-update',apply);window.removeEventListener('pointerdown',active);window.removeEventListener('keydown',active);window.removeEventListener('input',active);window.removeEventListener('hashchange',refresh);document.removeEventListener('visibilitychange',visibility);navigator.serviceWorker.removeEventListener('message',message);navigator.serviceWorker.removeEventListener('controllerchange',changed)};
 },[]);
 if(!waiting||dismissed||(!canTap&&!updating))return null;
 return <div className="update-banner" role="status">
  <span className="update-banner-text">{blocked?'Close MFD in other tabs to update':updating?'Updating…':'New version available'}</span>
  {!updating&&<button className="btn btn-primary btn-sm" onClick={()=>window.dispatchEvent(new Event('mfd-apply-update'))}>Update</button>}
  {!updating&&<button className="icon-btn" aria-label="Not now" onClick={()=>{setDismissed(true);setBlocked(false)}}><X/></button>}
 </div>;
}

export function isSafeUpdate(s:any,v:{hidden:boolean;idleMs:number;hash:string;drafts:boolean;focused:string}){return isSafeTapUpdate(s,v)&&!v.hidden&&v.idleMs>15000}

/** Safe to switch versions when the person asks: data settled, no workout, nothing half-edited. */
export function isSafeTapUpdate(s:any,v:{hash:string;drafts:boolean;focused:string}){return !!s?.ready&&!s.starting&&!s.reconciling&&!s.busy&&!s.state.active&&!s.modalOpen&&!/\/routine\/|\/workout|\/settings\/[^/]+/.test(v.hash)&&!v.drafts&&!['INPUT','TEXTAREA','SELECT'].includes(v.focused)}
