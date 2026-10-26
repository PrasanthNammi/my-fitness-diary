import {useEffect,useRef,useState} from 'react';
import {Timer} from 'lucide-react';
import {Sheet,Segmented,toast} from '../../components/ui';
import {useDB} from '../../data/store';
import {workouts} from '../../data/repositories';
import {useNow} from '../../lib/hooks';
import {clockValue, type Clock} from '../../domain/workoutClock';
const initial:Clock={mode:'timer',durationSec:75,valueMs:75000,startedAt:null};
const display=(ms:number)=>{const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`};
export function WorkoutClock(){
 const active=useDB(d=>d.active),clock=active?.clock??initial;
 const [open,setOpen]=useState(false),[minutes,setMinutes]=useState('1'),[seconds,setSeconds]=useState('15');
 const now=useNow(200,clock.startedAt!==null),fired=useRef('');
 const value=clockValue(clock,now),running=clock.startedAt!==null;
 function save(next:Clock){workouts.mutate(w=>{w.clock=next})}
 useEffect(()=>{if(clock.mode!=='timer'||!running||value>0)return;const key=`${active?.id}:${clock.startedAt}`;if(fired.current===key)return;fired.current=key;navigator.vibrate?.([200,100,200]);toast('Warm-up timer finished');save({...clock,startedAt:null,valueMs:0})},[value,running,clock,active?.id]);
 const valid=minutes.trim()!==''&&seconds.trim()!==''&&Number.isInteger(+minutes)&&Number.isInteger(+seconds)&&+minutes>=0&&+seconds>=0&&+seconds<60&&+minutes*60 + +seconds>0&&+minutes*60 + +seconds<=7200;
 function adjust(delta:number){const n=Date.now(),v=Math.min(7200000,Math.max(0,clockValue(clock,n)+delta*1000));save({...clock,valueMs:v,startedAt:running?n:null,durationSec:Math.max(1,clock.durationSec+delta)})}
 return <><button className="icon-btn" aria-label="Workout clock" onClick={()=>setOpen(true)}><Timer/>{running&&<span className="clock-mini">{display(value)}</span>}</button><Sheet open={open} onClose={()=>setOpen(false)} title="Clock"><div className="stack">
 <Segmented label="Clock mode" value={clock.mode} options={[{value:'timer',label:'Timer'},{value:'stopwatch',label:'Stopwatch'}]} onChange={mode=>save({...clock,mode,startedAt:null,valueMs:mode==='timer'?clock.durationSec*1000:0})}/>
 <div className="warmup-clock" role="timer" aria-label={clock.mode==='timer'?'Time remaining':'Elapsed time'}>{display(value)}</div>
 {clock.mode==='timer'&&<><div className="row-between"><button className="btn btn-ghost" onClick={()=>adjust(-15)}>−15s</button><button className="btn btn-ghost" onClick={()=>adjust(15)}>+15s</button></div>{!running&&<div className="row"><label className="grow">Minutes<input className="input" aria-label="Timer minutes" type="number" inputMode="numeric" min="0" max="120" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label><label className="grow">Seconds<input className="input" aria-label="Timer seconds" type="number" inputMode="numeric" min="0" max="59" value={seconds} onChange={e=>setSeconds(e.target.value)}/></label><button className="btn btn-secondary" disabled={!valid} onClick={()=>{const sec=+minutes*60 + +seconds;save({...clock,durationSec:sec,valueMs:sec*1000,startedAt:null})}}>Set</button></div>}</>}
 <div className="row"><button className="btn btn-primary grow" onClick={()=>{const n=Date.now();save({...clock,valueMs:running?clockValue(clock,n):clock.mode==='timer'&&clock.valueMs<=0?clock.durationSec*1000:clock.valueMs,startedAt:running?null:n})}}>{running?'Pause':clock.valueMs>0&&(clock.mode==='stopwatch'||clock.valueMs!==clock.durationSec*1000)?'Resume':'Start'}</button><button className="btn btn-secondary" onClick={()=>save({...clock,startedAt:null,valueMs:clock.mode==='timer'?clock.durationSec*1000:0})}>Reset</button></div>
 </div></Sheet></>;
}
