import {useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Dumbbell,X} from 'lucide-react';
import {useDB} from '../../data/store';
import {exerciseName} from '../../data/repositories';
import {navigate} from '../../lib/router';
import {fmtVolume} from '../../lib/format';
import {Empty,InfoButton,Segmented,Sheet} from '../../components/ui';
import {MUSCLES,RADAR_GROUPS,muscleMapping,summarizeMuscles,rangeBounds,muscleBuckets,weekStart,shiftDays,localDay,type Muscle,type Counts} from '../../domain/muscleStats';
import {MuscleAnatomy} from './MuscleAnatomy';

type View='chart'|'body'|'sets';
const number=(v:number)=>v.toLocaleString(undefined,{maximumFractionDigits:1});
const date=(v:number)=>new Date(v).toLocaleDateString(undefined,{day:'numeric',month:'short'});
const colors=['var(--brand)','var(--drop)','var(--carbs)','var(--water)','var(--fat)','var(--fibre)'];
const RULES=['Only completed working sets count. Warm-ups are left out.','Each set gives 1 to its main muscle and 0.5 to each helper muscle, so totals can be higher than the sets you logged.','Shows how your training is spread, not growth or recovery.'];

function Radar({now,previous}:{now:Counts;previous:Counts}){
 const values=(c:Counts)=>RADAR_GROUPS.map(([,keys])=>keys.reduce((s,k)=>s+c[k],0));const a=values(now),b=values(previous),max=Math.max(1,...a,...b);
 const pt=(i:number,r:number)=>[180+Math.cos(-Math.PI*2/3+i*Math.PI/3)*r,140+Math.sin(-Math.PI*2/3+i*Math.PI/3)*r];
 return <><svg className="muscle-chart" viewBox="0 0 360 280" role="img" aria-label={`Sets by muscle group, this period and the one before. Outer ring ${number(max)} sets.`}>
  {[.25,.5,.75,1].map(f=><polygon key={f} points={a.map((_,i)=>pt(i,f*100).join(',')).join(' ')} fill="none" stroke="var(--line)"/>)}
  {RADAR_GROUPS.map(([name],i)=>{const p=pt(i,100),l=pt(i,124);return <g key={name}><line x1="180" y1="140" x2={p[0]} y2={p[1]} stroke="var(--line)"/><text className="radar-label" x={l[0]} y={l[1]+4} textAnchor="middle">{name} {number(a[i])}</text></g>})}
  {[b,a].map((v,j)=><polygon key={j} points={v.map((x,i)=>pt(i,x/max*100).join(',')).join(' ')} fill={j?'var(--brand)':'var(--muted)'} fillOpacity=".14" stroke={j?'var(--brand)':'var(--muted)'} strokeWidth="2" strokeDasharray={j?undefined:'4 3'}/>)}
 </svg><div className="muscle-legend"><span><i className="line"/>Current period</span><span><i className="dashed"/>Previous period</span></div></>;
}

function Trends({rows,selected,mode}:{rows:ReturnType<typeof muscleBuckets>;selected:Muscle[];mode:string}){
 const max=Math.max(1,...rows.flatMap(r=>selected.map(m=>r.counts[m])))*1.1;const x=(i:number)=>rows.length===1?194:48+i*288/Math.max(1,rows.length-1),y=(v:number)=>192-v/max*150;
 const [focus,setFocus]=useState<number|null>(null);const safe=focus==null?rows.length-1:Math.min(focus,rows.length-1);const at=rows[safe];
 return <>{at&&<div className="muscle-trend-key" aria-live="polite"><span className="muscle-trend-date">{mode==='week'?'Week of ':''}{date(at.time)}</span>{selected.map((m,c)=><span key={m} className="muscle-chip"><i style={{background:colors[c%colors.length]}}/>{MUSCLES[m]} <strong className="tnum">{number(at.counts[m])}</strong></span>)}</div>}
  <svg className="muscle-chart" viewBox="0 22 360 208" role="img" aria-label={`Sets per muscle by ${mode}`}>
  {[0,.5,1].map(f=><g key={f}><line x1="48" x2="336" y1={y(f*max)} y2={y(f*max)} stroke="var(--line)"/><text x="40" y={y(f*max)+4} textAnchor="end">{number(f*max)}</text></g>)}
  {selected.map((m,c)=><g key={m}><polyline points={rows.map((r,i)=>`${x(i)},${y(r.counts[m])}`).join(' ')} fill="none" stroke={colors[c%colors.length]} strokeWidth="2.5" strokeLinejoin="round"/>{rows.map((r,i)=><circle key={r.time} cx={x(i)} cy={y(r.counts[m])} r="3" fill={colors[c%colors.length]}/>)}</g>)}
  {rows.map((r,i)=>i===0||i===rows.length-1?<text key={r.time} x={x(i)} y="216" textAnchor={i===0?'start':'end'}>{date(r.time)}</text>:null)}
  {at&&<line x1={x(safe)} x2={x(safe)} y1="32" y2="192" stroke="var(--muted)" strokeDasharray="3 3"/>}
  {rows.map((r,i)=><rect key={r.time} x={x(i)-Math.min(20,144/Math.max(rows.length,1))} y="32" width={Math.min(40,288/Math.max(rows.length,1))} height="165" fill="transparent" onClick={()=>setFocus(i)}/>)}
 </svg></>;
}

/** Muscles with sets first (largest first, with a bar), the untrained ones folded away. */
function MuscleList({counts,previous,selected,onSelect,colorOf}:{counts:Counts;previous?:Counts;selected:(m:Muscle)=>boolean;onSelect:(m:Muscle)=>void;colorOf?:(m:Muscle)=>string|undefined}){
 const [all,setAll]=useState(false);
 const rows=(Object.keys(MUSCLES) as Muscle[]).map(m=>[m,counts[m]] as const).sort((a,b)=>(a[0]==='other'?1:0)-(b[0]==='other'?1:0)||b[1]-a[1]);const max=Math.max(1,rows[0]?.[1]||0);
 const trained=rows.filter(r=>r[1]>0||selected(r[0])),shown=all?rows:trained,hidden=rows.length-trained.length;
 return <div className="muscle-list">
  {shown.map(([m,v])=>{const on=selected(m),color=colorOf?.(m);return <button key={m} type="button" className="muscle-row" aria-pressed={on} onClick={()=>onSelect(m)}>
   {colorOf&&<span className="muscle-dot" style={{background:color||'var(--surface-3)'}} aria-hidden="true"/>}
   <span className="muscle-name">{MUSCLES[m]}</span><span className="muscle-bar" aria-hidden="true"><i style={{width:`${v/max*100}%`}}/></span><span className="tnum muscle-value">{number(v)}{previous&&<small className={v-previous[m]>0?'up':v-previous[m]<0?'down':''}>{v-previous[m]>=0?'+':''}{number(v-previous[m])}</small>}</span></button>})}
  {hidden>0&&<button type="button" className="btn-link muscle-more" onClick={()=>setAll(!all)}>{all?'Show trained only':`Show all ${rows.length}`}</button>}
 </div>;
}

function Unmapped({summary}:{summary:ReturnType<typeof summarizeMuscles>}){
 const [open,setOpen]=useState(false);if(!summary.unmapped)return null;
 return <><button type="button" className="progress-link muscle-unmapped" onClick={()=>setOpen(true)}><span>{summary.unmapped} sets without muscles</span><ChevronRight aria-hidden="true"/></button>
  <Sheet open={open} onClose={()=>setOpen(false)} title="Sets without muscles"><div className="muscle-list">{summary.missing.map(([name,n])=><div key={name} className="muscle-row static"><span className="muscle-name">{name}</span><span className="tnum muscle-value">{number(n)}</span></div>)}</div></Sheet></>;
}

/** Muscle statistics inside Progress → Statistics: Chart (balance), Body (map by week/day) and Sets (trends). */
export function MuscleStats({view='chart',days=90}:{view?:string;days?:number}){
 const tab:View=view==='body'||view==='sets'?view:'chart';
 const workouts=useDB(d=>d.workouts),exercises=useDB(d=>d.customExercises),unit=useDB(d=>d.settings.weightUnit);
 const [mode,setMode]=useState<'week'|'month'>('week'),[week,setWeek]=useState(()=>weekStart(Date.now())),[day,setDay]=useState<number|null>(null);
 const [selected,setSelected]=useState<Muscle[]>(['quadriceps','upper_back','biceps']),[muscle,setMuscle]=useState<Muscle|null>(null);
 const span=days||3650,bounds=rangeBounds(span);
 const start=tab==='body'?(day??week):bounds.start,end=tab==='body'?shiftDays(day??week,day==null?7:1):bounds.end;
 const prevStart=tab==='body'?shiftDays(start,-7):bounds.previousStart,prevEnd=tab==='body'?shiftDays(end,-7):bounds.start;
 const current=useMemo(()=>summarizeMuscles(workouts,exercises,start,end),[workouts,exercises,start,end]);
 const previous=useMemo(()=>summarizeMuscles(workouts,exercises,prevStart,prevEnd),[workouts,exercises,prevStart,prevEnd]);
 const rows=useMemo(()=>muscleBuckets(workouts,exercises,bounds.start,bounds.end,mode),[workouts,exercises,bounds.start,bounds.end,mode]);
 const trainingDays=useMemo(()=>new Set(workouts.filter(w=>w.exercises.some(b=>b.sets.some(s=>s.done&&s.type!=='warmup'))).map(w=>localDay(w.startedAt))),[workouts]);
 // Which exercises gave the tapped muscle its sets in this week/day (main muscle 1, helper 0.5 per set).
 const top=useMemo(()=>{if(!muscle)return[];const byId=new Map(exercises.map(e=>[e.id,e])),credit=new Map<string,number>();for(const w of workouts){if(w.startedAt<start||w.startedAt>=end)continue;for(const b of w.exercises){const map=muscleMapping(byId.get(b.exerciseId)),f=map.primary.includes(muscle)?1:map.secondary.includes(muscle)?.5:0;if(!f)continue;const n=b.sets.filter(x=>x.done&&x.type!=='warmup').length*f;if(n)credit.set(b.exerciseId,(credit.get(b.exerciseId)||0)+n)}}return[...credit].sort((a,b)=>b[1]-a[1]).slice(0,3)},[muscle,workouts,exercises,start,end]);
 const toggle=(m:Muscle)=>setSelected(old=>old.includes(m)?old.filter(x=>x!==m):[...old,m]);
 const total=Object.values(current.counts).reduce((a,b)=>a+b,0);
 const empty=!current.sets&&<Empty icon={Dumbbell} title="No working sets in this period"/>;
 const pick=(m:Muscle)=>setMuscle(m===muscle?null:m);
 const list=(props:Omit<Parameters<typeof MuscleList>[0],'counts'>)=><section className="card progress-card" aria-label="Sets per muscle">
  <div className="muscle-card-head"><span className="eyebrow">All muscles · weighted sets</span><span className="muscle-total tnum">{number(total)}</span></div>
  <MuscleList counts={current.counts} {...props}/><Unmapped summary={current}/></section>;
 const name=(id:string)=>exerciseName(id);
 return <div className="muscle-screen">
  <h2 className="muscle-title">Muscle distribution</h2>
  <div className="muscle-switch"><Segmented label="Muscle view" value={tab} onChange={v=>navigate('/progress/muscles/'+v,{replace:true})} options={[{value:'chart',label:'Chart'},{value:'body',label:'Body'},{value:'sets',label:'Sets'}]}/><InfoButton title="How sets are counted" lines={RULES}/></div>
  {tab==='chart'&&<>
   {empty||<><section className="card progress-card" aria-label="Working sets by group"><span className="eyebrow">Working sets by group</span><Radar now={current.counts} previous={previous.counts}/></section>
    <div className="muscle-stats">{[['Workouts',String(current.sessions)],['Time',number(current.duration/3600000)+' h'],['Volume',fmtVolume(current.volume,unit)],['Logged sets',String(current.sets)]].map(([k,v])=><div key={k} className="card"><span className="k">{k}</span><span className="v tnum">{v}</span></div>)}</div>
    {list({previous:previous.counts,selected:m=>m===muscle,onSelect:pick})}</>}
  </>}
  {tab==='body'&&<>
   <div className="muscle-week-head"><button className="icon-btn" aria-label="Previous week" onClick={()=>{setWeek(shiftDays(week,-7));setDay(null)}}><ChevronLeft/></button><strong>{date(week)} – {date(shiftDays(week,6))}</strong><button className="icon-btn" aria-label="Next week" disabled={week>=weekStart(Date.now())} onClick={()=>{setWeek(shiftDays(week,7));setDay(null)}}><ChevronRight/></button></div>
   <div className="muscle-days">{Array.from({length:7},(_,i)=>{const t=shiftDays(week,i);return <button key={i} type="button" className={trainingDays.has(t)?'trained':''} disabled={t>localDay(Date.now())} aria-pressed={day===t} aria-label={new Date(t).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})+(trainingDays.has(t)?', trained':'')} onClick={()=>setDay(day===t?null:t)}><small>{new Date(t).toLocaleDateString(undefined,{weekday:'short'})}</small><span>{new Date(t).getDate()}</span><i className={trainingDays.has(t)?'on':''}/></button>})}</div>
   <div className="muscle-map"><MuscleAnatomy counts={current.counts} selected={muscle} onSelect={pick}/></div>
   {muscle&&<section className="card muscle-pick" aria-label={MUSCLES[muscle]}>
    <div className="muscle-pick-head"><strong>{MUSCLES[muscle]}</strong><button className="icon-btn" aria-label="Clear muscle" onClick={()=>setMuscle(null)}><X/></button></div>
    <p className="tnum"><b>{number(current.counts[muscle])}</b> weighted sets · {current.counts[muscle]-previous.counts[muscle]>=0?'+':''}{number(current.counts[muscle]-previous.counts[muscle])} vs previous week</p>
    {top.length>0&&<><span className="eyebrow">Top exercises</span>{top.map(([id,n])=><button key={id} type="button" className="muscle-top" onClick={()=>window.dispatchEvent(new CustomEvent('mfd-exercise',{detail:id}))}><span>{name(id)}</span><b className="tnum">{number(n)}</b></button>)}</>}
   </section>}
   {empty||list({previous:previous.counts,selected:m=>m===muscle,onSelect:pick})}
  </>}
  {tab==='sets'&&<>
   {empty||<><section className="card progress-card" aria-label="Trends">
    <Segmented label="Group by" value={mode} onChange={setMode} options={[{value:'week',label:'Week'},{value:'month',label:'Month'}]}/>
    <Trends rows={rows} selected={selected} mode={mode}/></section>
    {list({selected:m=>selected.includes(m),onSelect:toggle,colorOf:m=>selected.includes(m)?colors[selected.indexOf(m)%colors.length]:undefined})}</>}
  </>}
 </div>;
}
