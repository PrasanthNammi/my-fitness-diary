import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {BarChart3,ChevronRight,Crown,History,ImageOff,Trophy,X} from 'lucide-react';
import {InfoButton} from '../../components/ui';
import {ExerciseThumb} from './ExercisePicker';
import type {Exercise,SetEntry} from '../../domain/types';
import {useDB} from '../../data/store';
import {exercises} from '../../data/repositories';
import {exerciseStats,metricLabels,setMetrics,type Metric} from '../../domain/records';
import {setLabels,trackingFields,weightHeading} from '../../domain/training';
import {exerciseVisual,mediaCredits} from '../../catalogue/media';
import {getCatalogue} from '../../catalogue/runtime';
import {LineChart} from '../../components/Charts';
import {fmtNum,kgTo,mss} from '../../lib/format';

export function ExerciseGuide({exercise:ex,onSelect}:{exercise:Exercise;onSelect?:(e:Exercise)=>void}){
 const entry=ex.entry;const visual=entry?exerciseVisual(entry,'/catalogue/app_media'):{kind:'none'} as const;
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[ex.id]);
 const groups=entry?[["Setup",entry.setup],["Movement",entry.steps],["Cues",entry.cues],["Breathing",entry.breathing?[entry.breathing]:[]],["Mistakes",entry.mistakes],["Safety",entry.safety],["Variation",entry.variation_notes]] as const:[['Movement',ex.instructions||[]]] as const;
 return <div className="stack">
  <div className="exercise-media">{failed||visual.kind==='none'?ex.mediaUrl&&!failed?<img src={ex.mediaUrl} alt={ex.name} decoding="async" onError={()=>setFailed(true)}/>:<ImageOff aria-label="No demonstration available"/>:visual.kind==='animation'?<img src={visual.src} alt={ex.name} decoding="async" onError={()=>setFailed(true)}/>:visual.kind==='video'?<video src={visual.src} poster={visual.poster} controls playsInline preload="none" onError={()=>setFailed(true)}/>:<div className="exercise-frames">{visual.frames.map(frame=><figure key={frame.path}><img src={frame.path} alt={`${ex.name}: ${frame.role}`} loading="lazy" decoding="async" onError={()=>setFailed(true)}/><figcaption>{frame.role==='start'?'①':'②'}</figcaption></figure>)}</div>}</div>
    {groups.filter(([,lines])=>lines.length).map(([title,lines],i)=><details className="guide-section" key={title} open={i===0||undefined}><summary>{title}</summary><ol>{lines.map((line,j)=><li key={j}>{line}</li>)}</ol></details>)}
  {entry&&onSelect&&([['alternatives','Alternatives'],['easier','Easier'],['harder','Harder']] as const).map(([key,label])=>{const ids=entry[key];return ids.length?<section className="guide-related" key={key}><div className="eyebrow">{label}</div>{ids.map(id=>{const e=exercises.byId(id);return e?<button className="card guide-related-row" key={id} onClick={()=>onSelect(e)}><ExerciseThumb exercise={e}/><span className="grow"><span className="nm">{e.name}</span><span className="mt">{[e.equipment,e.entry?.level].filter(Boolean).join(' · ')}</span></span><ChevronRight size={16} aria-hidden="true"/></button>:null})}</section>:null})}
  {entry&&<details className="guide-section source-credit"><summary aria-label="Source and review status">ⓘ</summary><p>MFD · {entry.review_status}</p>{mediaCredits(entry).map(c=><p key={c}>{c}</p>)}{entry.media.animation&&<p>Animation · {entry.media.animation.license}</p>}{entry.sources.free_exercise_db.map(s=><a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer">{s.name} ↗</a>)}</details>}
 </div>
}
const chartDescriptions: Record<Metric, { title: string; description: string }> = {
 weight: { title: 'Heaviest weight per workout', description: 'Highest load in a completed working set' },
 reps: { title: 'Most reps in a set', description: 'Highest reps in a completed working set per workout' },
 volume: { title: 'Volume per workout', description: 'Total weight × reps across completed working sets' },
 estimate: { title: 'Estimated one-rep max', description: 'Estimated from completed working sets of 12 reps or fewer' },
 time: { title: 'Longest set per workout', description: 'Longest duration in a completed working set' },
 distance: { title: 'Longest distance per workout', description: 'Farthest distance in a completed working set' },
 floors: { title: 'Most floors per workout', description: 'Highest floor count in a completed working set' },
 steps: { title: 'Most steps per workout', description: 'Highest step count in a completed working set' },
};
export function ExercisePage({exercise,onClose}:{exercise:Exercise;onClose:()=>void}){
 const history=useDB(d=>d.workouts),unit=useDB(d=>d.settings.weightUnit);
 const [ex,setEx]=useState(exercise),[tab,setTab]=useState<'history'|'charts'|'records'|'guide'>('history'),[metric,setMetric]=useState<Metric>('weight'),[range,setRange]=useState(0);
 const ref=useRef<HTMLDivElement>(null);const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{const token=crypto.randomUUID();historyPush(token);const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';const pop=()=>closeRef.current();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();window.history.back();}if(e.key==='Tab'){const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select,input,summary,video[controls]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};window.addEventListener('popstate',pop);document.addEventListener('keydown',key,true);ref.current?.focus();return()=>{window.removeEventListener('popstate',pop);document.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;previous?.focus({preventScroll:true})}},[]);
 const close=()=>window.history.state?.mfdExercise?window.history.back():onClose();
 const stats=useMemo(()=>exerciseStats(history).get(ex.id),[history,ex.id]);
 const sessions=useMemo(()=>stats?.sessions.filter(s=>!range||s.workout.startedAt>=Date.now()-range*86400000)||[],[stats,range]);
 const fields=trackingFields(ex.tracking);
 const metrics:Metric[]=[...(fields.includes('weightKg')&&ex.tracking!=='assisted_bodyweight'?['weight'] as Metric[]:[]),...(fields.includes('reps')?['reps'] as Metric[]:[]),...(['weight_reps','weighted_bodyweight'].includes(ex.tracking)?['volume','estimate'] as Metric[]:[]),...(fields.includes('timeSec')?['time'] as Metric[]:[]),...(fields.includes('distanceKm')?['distance'] as Metric[]:[]),...(fields.includes('floors')?['floors'] as Metric[]:[]),...(fields.includes('steps')?['steps'] as Metric[]:[])];
 const selected=metrics.includes(metric)?metric:metrics[0]||'reps';
 const chartInfo=chartDescriptions[selected];
 const metricUnit=(m:Metric)=>['weight','volume','estimate'].includes(m)?unit:m==='distance'?'km':m==='time'?'s':metricLabels[m].toLowerCase();
 const display=(v:number,m:Metric)=>['weight','volume','estimate'].includes(m)?kgTo(v,unit):v;
 const points=useMemo(()=>sessions.flatMap(({workout,blocks})=>{const values=blocks.flatMap(b=>b.sets.map(s=>setMetrics(b,s)[selected]).filter((v):v is number=>v!=null));if(!values.length)return [];return [{x:workout.startedAt,y:display(selected==='volume'?values.reduce((a,b)=>a+b,0):Math.max(...values),selected)}]}),[sessions,selected,unit]);
 const summary=(s:SetEntry)=>fields.map(f=>s[f]==null?'–':f==='timeSec'?mss(s[f]!):f==='weightKg'?`${fmtNum(kgTo(s[f]!,unit),2)} ${weightHeading(ex.tracking,unit)}`:f==='distanceKm'?`${fmtNum(s[f]!,2)} km`:String(s[f])).join(' × ');
 const day=(t:number)=>new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
 const level=ex.entry?.level?ex.entry.level[0].toUpperCase()+ex.entry.level.slice(1):null;
 const headline=(['weight','estimate','volume','time','distance','reps'] as Metric[]).map(m=>stats?.best.values[m]).filter((r):r is NonNullable<typeof r>=>!!r).slice(0,3);
 const repsAt=stats?[...stats.best.reps.values()].sort((a,b)=>(b.weight??0)-(a.weight??0)):[];
 const TABS=[['history','History'],['charts','Charts'],['records','Records'],['guide','Guide']] as const;
 const ranges=<div className="segmented exercise-range" role="group" aria-label="Date range">{([[30,'1M'],[90,'3M'],[365,'1Y'],[0,'All']] as const).map(([days,label])=><button key={days} type="button" aria-label={days?`Last ${days} days`:'All time'} aria-pressed={range===days} onClick={()=>setRange(days)}>{label}</button>)}</div>;
 return createPortal(<div className="exercise-page" role="dialog" aria-modal="true" aria-label={ex.name} tabIndex={-1} ref={ref}>
  <header className="exercise-page-head">
   <ExerciseThumb exercise={ex}/>
   <div className="exercise-title"><h1>{ex.name}</h1><p>{[ex.primaryMuscle,ex.equipment,level].filter(Boolean).join(' · ')}</p></div>
   <button className="icon-btn" aria-label="Close exercise" onClick={close}><X/></button>
  </header>
  <nav className="exercise-tabs tab-chips" role="tablist" aria-label="Exercise details">{TABS.map(([id,label])=><button key={id} type="button" role="tab" className="chip" aria-label={id} aria-selected={tab===id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
  <div className="exercise-page-body" key={ex.id}>
  {(tab==='history'||tab==='charts')&&ranges}
  {tab==='history'&&<section className="card exercise-inline-trend" aria-label="Exercise performance"><div className="exercise-card-head"><h3>{chartInfo.title}</h3><button className="btn btn-link" onClick={()=>setTab('charts')}>All charts</button></div>{points.length?<LineChart key={`preview-${selected}-${range}-${ex.id}`} points={points} unit={metricUnit(selected)} label={chartInfo.title} height={140} format={v=>fmtNum(v,1)}/>:<div className="exercise-empty"><BarChart3 aria-label="No chart data"/></div>}</section>}
  {tab==='history'&&(sessions.length?[...sessions].reverse().map(({workout,blocks})=><section key={workout.id} className="exercise-history card"><div className="exercise-card-head"><strong>{workout.title}</strong><time>{day(workout.startedAt)}</time></div>{blocks.map(b=>{const labels=setLabels(b.sets);return b.sets.filter(s=>s.done).map(s=>{const rec=stats?.earned.get(s.id);return <div className="exercise-history-set" key={s.id}><span className={`set-label ${s.type}`}>{labels[b.sets.indexOf(s)]}</span><span className="grow tnum">{summary(s)}{s.rpe!=null&&<span className="muted"> · RPE {s.rpe}</span>}</span>{rec&&<Crown className="record-crown" aria-label={rec.map(r=>metricLabels[r.metric]).join(', ')}/>}</div>})})}</section>):<div className="exercise-empty"><History aria-label="No history"/></div>)}
  {tab==='charts'&&<><div className="exercise-metrics" role="group" aria-label="Chart">{metrics.map(m=><button className="chip" key={m} aria-pressed={selected===m} onClick={()=>setMetric(m)}>{m==='weight'?'Heaviest':metricLabels[m]}</button>)}</div><section className="card exercise-chart" aria-label={chartInfo.title}><div className="exercise-card-head"><h3>{chartInfo.title}</h3><InfoButton title={chartInfo.title} lines={[chartInfo.description,'Gold crowns in History mark the sets that set a record.']}/></div>{points.length?<LineChart key={`${selected}-${range}-${ex.id}`} points={points} unit={metricUnit(selected)} label={chartInfo.title} format={v=>fmtNum(v,1)}/>:<div className="exercise-empty"><BarChart3 aria-label="No chart data"/></div>}</section></>}
  {tab==='records'&&(stats&&(headline.length||repsAt.length)?<>
   {headline.length>0&&<div className="record-cards">{headline.map(r=><div className="card record-card" key={r.metric}><Trophy aria-hidden="true"/><span className="k">{r.metric==='weight'?'Heaviest':r.metric==='estimate'?'Best 1RM':`Best ${metricLabels[r.metric].toLowerCase()}`}</span><strong className="tnum">{fmtNum(display(r.value,r.metric),1)}<small> {metricUnit(r.metric)}</small></strong><time>{day(r.date)}</time></div>)}</div>}
   {repsAt.length>0&&<section className="card reps-at"><div className="eyebrow">Best reps at each weight</div>{repsAt.map(r=><div className="reps-at-row" key={r.setId}><strong className="tnum">{fmtNum(kgTo(r.weight??0,unit),2)} {unit}</strong><span className="grow tnum">{fmtNum(r.value,0)} reps</span><time>{day(r.date)}</time></div>)}</section>}
  </>:<div className="exercise-empty"><Crown aria-label="No records"/></div>)}
  {tab==='guide'&&<ExerciseGuide exercise={ex} onSelect={setEx}/>}
  </div>
 </div>,document.body)
}
function historyPush(token:string){window.history.pushState({...window.history.state,mfdExercise:token},'',window.location.href)}
