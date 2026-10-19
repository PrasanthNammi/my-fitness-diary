import type {ActiveWorkout,ExerciseBlock,SetEntry,Workout} from './types';
import {e1rm} from './training';
export type Metric='weight'|'reps'|'volume'|'estimate'|'time'|'distance'|'floors'|'steps';
export const metricLabels:Record<Metric,string>={weight:'Weight',reps:'Reps',volume:'Volume',estimate:'1RM',time:'Time',distance:'Distance',floors:'Floors',steps:'Steps'};
export interface PersonalRecord{metric:Metric;value:number;weight?:number;setId:string;date:number;workoutId:string;}
type Best={values:Partial<Record<Metric,PersonalRecord>>;reps:Map<number,PersonalRecord>};
export interface ExerciseStats{sessions:{workout:Workout;blocks:ExerciseBlock[]}[];best:Best;earned:Map<string,PersonalRecord[]>}
const cache=new WeakMap<Workout[],Map<string,ExerciseStats>>();
export function setMetrics(b:ExerciseBlock,s:SetEntry):Partial<Record<Metric,number>>{
 if(!s.done||s.type==='warmup')return {};
 const out:Partial<Record<Metric,number>>={};const weighted=['weight_reps','weighted_bodyweight'].includes(b.tracking);
 if(b.tracking!=='assisted_bodyweight'&&s.weightKg!=null&&s.weightKg>0&&['weight_reps','weighted_bodyweight','weight_time','weight_distance'].includes(b.tracking))out.weight=s.weightKg;
 if(weighted&&s.weightKg!=null&&s.reps!=null&&s.reps>0){out.weight=s.weightKg;out.volume=s.weightKg*s.reps;if(s.weightKg>0&&s.reps<=12)out.estimate=e1rm(s.weightKg,s.reps)}
 if(s.reps!=null&&s.reps>0)out.reps=s.reps;
 if(s.timeSec!=null&&s.timeSec>0)out.time=s.timeSec;
 if(s.distanceKm!=null&&s.distanceKm>0)out.distance=s.distanceKm;
 if(s.floors!=null&&s.floors>0)out.floors=s.floors;
 if(s.steps!=null&&s.steps>0)out.steps=s.steps;
 return out;
}
function accept(best:Best,b:ExerciseBlock,s:SetEntry,w:{id:string;startedAt:number}):PersonalRecord[]{
 const records:PersonalRecord[]=[];const weighted=['weight_reps','weighted_bodyweight','assisted_bodyweight'].includes(b.tracking);
 // Assistance is not load: never award weight, volume, or e1RM records from it.
 for(const [key,value] of Object.entries(setMetrics(b,s)) as [Metric,number][]){
  const record:PersonalRecord={metric:key,value,weight:key==='reps'&&weighted?s.weightKg??0:undefined,setId:s.id,date:w.startedAt,workoutId:w.id};
  const previous=key==='reps'&&weighted?best.reps.get(record.weight!):best.values[key];
  if(!previous||value>previous.value+1e-8){if(key==='reps'&&weighted){best.reps.set(record.weight!,record);if(previous)records.push(record)}else{best.values[key]=record;records.push(record)}}
 }
 return records;
}
export function exerciseStats(history:Workout[]):Map<string,ExerciseStats>{
 let index=cache.get(history);if(index)return index;index=new Map();
 for(const w of [...history].sort((a,b)=>a.startedAt-b.startedAt))for(const block of w.exercises){let stats=index.get(block.exerciseId);if(!stats){stats={sessions:[],best:{values:{},reps:new Map()},earned:new Map()};index.set(block.exerciseId,stats)}let session=stats.sessions.at(-1);if(session?.workout.id!==w.id){session={workout:w,blocks:[]};stats.sessions.push(session)}session.blocks.push(block);for(const s of block.sets){const records=accept(stats.best,block,s,w);if(records.length)stats.earned.set(s.id,records)}}
 cache.set(history,index);return index;
}
const activeCache=new WeakMap<ActiveWorkout,{history:Workout[];earned:Map<string,PersonalRecord[]>}>();
export function activeRecords(history:Workout[],active:ActiveWorkout|null){if(!active)return new Map<string,PersonalRecord[]>();const cached=activeCache.get(active);if(cached?.history===history)return cached.earned;const historical=exerciseStats(history),bests=new Map<string,Best>(),earned=new Map<string,PersonalRecord[]>();for(const b of active.exercises){let best=bests.get(b.exerciseId);if(!best){const base=historical.get(b.exerciseId)?.best;best={values:{...base?.values},reps:new Map(base?.reps)};bests.set(b.exerciseId,best)}for(const s of b.sets){const records=accept(best,b,s,active);if(records.length)earned.set(s.id,records)}}activeCache.set(active,{history,earned});return earned}
