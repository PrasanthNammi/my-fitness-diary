import {todayISO} from './format';
// Calendar browsing is device-session UI state, never a cloud workspace edit.
let day=todayISO(),selected=day;
const listeners=new Set<()=>void>();
export function refreshDay(){const now=todayISO();if(now!==day){day=now;selected=now;listeners.forEach(fn=>fn())}}
export function selectedDay(){return selected}
export function selectDay(value:string){refreshDay();if(value!==selected){selected=value;listeners.forEach(fn=>fn())}}
export function subscribeDay(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
if(typeof window!=='undefined'&&typeof document!=='undefined'&&typeof document.addEventListener==='function'&&typeof window.addEventListener==='function'){
window.addEventListener('focus',refreshDay);
window.addEventListener('pageshow',refreshDay);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay()});
setInterval(()=>{if(!document.hidden)refreshDay()},30000);

}
