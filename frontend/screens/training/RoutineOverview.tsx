import { exerciseThumbnail } from '../../catalogue/media';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Dumbbell, Pencil, Play } from 'lucide-react';
import { Empty, TopBar } from '../../components/ui';
import { LineChart } from '../../components/Charts';
import { useDB } from '../../data/store';
import { exercises, exerciseName, workouts } from '../../data/repositories';
import { routineSessions, lastExerciseSession, routineTrend } from '../../domain/routineStats';
import { trackingFields, weightHeading, workingVolume } from '../../domain/training';
import type { Exercise, ExerciseBlock, SetEntry } from '../../domain/types';
import { duration, fmtNum, fmtVolume, kgTo, mss } from '../../lib/format';
import { navigate } from '../../lib/router';
import { ExercisePage } from './ExercisePage';

function RoutineThumbnail({ exercise }: { exercise?: Exercise }) {
  const src=exercise?.entry?exerciseThumbnail(exercise.entry,'/catalogue/app_media'):exercise?.mediaUrl;
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return <span className="routine-thumbnail" aria-hidden="true">{src&&!failed?<img src={src} alt="" loading="lazy" decoding="async" width="52" height="52" onError={()=>setFailed(true)}/>:<Dumbbell size={24}/>}</span>;
}
function plannedSummary(b: ExerciseBlock): string {
  const parts=[`${b.sets.length} ${b.sets.length===1?'set':'sets'}`];
  for(const field of trackingFields(b.tracking).filter(f=>f!=='weightKg')) {
    const values=b.sets.map(s=>s[field]).filter((v):v is number=>v!=null&&Number.isFinite(v));
    if(!values.length)continue;
    const lo=Math.min(...values),hi=Math.max(...values),format=(n:number)=>field==='timeSec'?mss(n):fmtNum(n,2);
    const unit=field==='timeSec'?'':field==='distanceKm'?' km':` ${field}`;
    parts.push(`${format(lo)}${hi!==lo?`–${format(hi)}`:''}${unit}`);
  }
  return parts.join(' · ');
}

export function RoutineOverview({ routineId }: { routineId: string }) {
  const routines=useDB(d=>d.routines),history=useDB(d=>d.workouts),active=useDB(d=>d.active),unit=useDB(d=>d.settings.weightUnit);
  const catalogue=useDB(d=>d.customExercises);
  const routine=routines.find(r=>r.id===routineId);
  const [selected,setSelected]=useState<Exercise|null>(null);
  const sessions=useMemo(()=>routine?routineSessions(routine,history):[],[routine,history]);
  const trend=useMemo(()=>routineTrend(sessions),[sessions]);
  const latest=useMemo(()=>new Map(routine?.exercises.map(b=>[b.exerciseId,lastExerciseSession(b.exerciseId,history)])),[routine,history]);
  const date=(value:number)=>new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
  const summary=(b:ExerciseBlock,s:SetEntry)=>trackingFields(b.tracking).map(f=>s[f]==null?'–':f==='weightKg'?`${fmtNum(kgTo(s[f]!,unit),2)} ${weightHeading(b.tracking,unit)}`:f==='timeSec'?mss(s[f]!):f==='distanceKm'?`${fmtNum(s[f]!,2)} km`:String(s[f])).join(' × ');
  if(!routine)return <><TopBar title="Routine" back="/training"/><div className="screen"><Empty icon={Dumbbell} title="Routine not found"/></div></>;
  const last=sessions.at(-1);
  return <>
    <TopBar title={routine.name} back="/training" bordered actions={<button className="icon-btn" aria-label="Edit routine" onClick={()=>navigate(`/training/routine/edit/${routine.id}`)}><Pencil/></button>}/>
    <div className="screen routine-overview">
      <div className="small muted routine-sub">{routine.exercises.length} exercises · {last?`Last trained ${date(last.startedAt)}`:'Not trained yet'}</div>
      <button className="btn btn-primary btn-block routine-go" onClick={()=>{if(!active)workouts.start(routine);navigate('/workout')}}><Play/>{active?'Resume current workout':'Start Workout'}</button>
      <div className="routine-exercise-list">
      {routine.exercises.map(b=>{const ex=catalogue.find(e=>e.id===b.exerciseId),previous=latest.get(b.exerciseId);return <button type="button" className="routine-exercise" key={b.id} onClick={()=>{const resolved=ex||exercises.byId(b.exerciseId);if(resolved)setSelected(resolved)}} disabled={!ex} aria-label={`View ${exerciseName(b.exerciseId)} stats`}>
        <RoutineThumbnail exercise={ex}/>
        <div className="routine-exercise-info"><h3>{exerciseName(b.exerciseId)}</h3><div className="small muted">{plannedSummary(b)}</div>
          <div className="small muted routine-last">{previous?`Last · ${date(previous.workout.startedAt)}`:'No logged sets yet'}</div>
          {previous&&<div className="routine-values">{previous.blocks.flatMap(block=>block.sets.filter(s=>s.done).map(s=><span key={s.id}>{summary(block,s)}</span>))}</div>}
        </div><ChevronRight className="muted" size={16}/>
      </button>})}
      </div>
      {sessions.length>0&&<div className="routine-stats" aria-label="Routine summary">
        <div><div className="k">Sessions</div><div className="v">{sessions.length}</div></div>
        <div><div className="k">Avg. time</div><div className="v">{duration(sessions.reduce((n,w)=>n+(w.endedAt-w.startedAt),0)/sessions.length/1000)}</div></div>
        <div><div className="k">Best volume</div><div className="v">{fmtVolume(Math.max(...sessions.map(w=>workingVolume(w.exercises))),unit)}</div></div>
      </div>}
      <section className="routine-trend card" aria-label="Routine performance">
        <h3>{trend.label}</h3>
        {trend.points.length?<><div className="small muted">{trend.unit==='kg'?'Completed working sets · weight × reps':'Completed sets per session'}</div><LineChart points={trend.points.map(p=>({...p,y:trend.unit==='kg'?kgTo(p.y,unit):p.y}))} unit={trend.unit==='kg'?unit:'sets'} label={trend.label} height={140} format={v=>fmtNum(v,0)}/></>:<p className="small muted">Your trend appears after your first logged workout.</p>}
      </section>

    </div>
    {selected&&<ExercisePage exercise={selected} onClose={()=>setSelected(null)}/>}
  </>;
}
