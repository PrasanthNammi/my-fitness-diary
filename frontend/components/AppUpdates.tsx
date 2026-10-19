import {useEffect,useRef} from 'react';
import {engine} from '../adapters/engine';
/** Install only after drafts are saved, with no workout in progress. No forced sign-out. */
export function AppUpdates(){
 const requested=useRef(false);
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  let cancelled=false,lastActivity=Date.now(),lastCheck=0;
  const active=()=>{lastActivity=Date.now()};
  const safe=()=>isSafeUpdate(engine()?.peek(),{hidden:document.hidden,idleMs:Date.now()-lastActivity,hash:location.hash,drafts:!!document.querySelector('.sheet,.exercise-page,form'),focused:document.activeElement?.tagName||''});
  const ready=()=>safe()&&engine()?.checkpoint()===true;
  const check=async()=>{const registration=await navigator.serviceWorker.getRegistration();if(cancelled||!registration)return;if(Date.now()-lastCheck>300000){lastCheck=Date.now();registration.update().catch(()=>{})}if(registration.waiting&&!requested.current&&ready()){requested.current=true;registration.waiting.postMessage({type:'MFD_REQUEST_UPDATE'});setTimeout(()=>{requested.current=false},10000)}};
  const message=(event:MessageEvent)=>{if(event.data?.type==='MFD_CHECK_READY')event.ports[0]?.postMessage({ready:ready()})};
  const changed=()=>{if(ready())location.reload()};
  const visibility=()=>{if(!document.hidden)check()};
  window.addEventListener('pointerdown',active,{passive:true});window.addEventListener('keydown',active);window.addEventListener('input',active);document.addEventListener('visibilitychange',visibility);navigator.serviceWorker.addEventListener('message',message);navigator.serviceWorker.addEventListener('controllerchange',changed);const timer=setInterval(check,15000);check();
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('pointerdown',active);window.removeEventListener('keydown',active);window.removeEventListener('input',active);document.removeEventListener('visibilitychange',visibility);navigator.serviceWorker.removeEventListener('message',message);navigator.serviceWorker.removeEventListener('controllerchange',changed)};
 },[]);return null;
}

export function isSafeUpdate(s:any,v:{hidden:boolean;idleMs:number;hash:string;drafts:boolean;focused:string}){return !!s?.ready&&!s.starting&&!s.reconciling&&!s.busy&&!s.state.active&&!s.modalOpen&&!v.hidden&&v.idleMs>15000&&!/\/routine\/|\/workout|\/settings\/[^/]+/.test(v.hash)&&!v.drafts&&!['INPUT','TEXTAREA','SELECT'].includes(v.focused)}
