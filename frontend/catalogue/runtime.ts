import {ExerciseCatalogue} from './catalogue';
import {HevyMatcher,type HevyMap} from './hevyMatcher';
import type {Catalogue,CatalogueEntry} from './exercise';
import type {Exercise} from '../domain/types';
let catalogue:ExerciseCatalogue|undefined,map:HevyMap|undefined,pending:Promise<void>|undefined;
let records:Exercise[]=[];const legacyIds=new Map<string,string>();
export const getCatalogue=()=>catalogue;
export const catalogueExercises=()=>records;
export function mapEntry(e:CatalogueEntry):Exercise {return {id:e.id,name:e.name,primaryMuscle:catalogue?.meta.groups[e.muscle_groups.primary[0]]||e.muscle_groups.primary[0]||'Other',secondaryMuscles:e.muscle_groups.secondary.map(g=>catalogue?.meta.groups[g]||g),equipment:e.equipment.map(k=>catalogue?.meta.equipment[k]||k).join(' · '),source:'mfd',sourceRef:e.id,tracking:e.tracking,mediaUrl:null,instructions:e.steps,entry:e};}
export function loadMfdCatalogue(){return pending??=(async()=>{const responses=await Promise.all(['/catalogue/mfd_exercises.json','/catalogue/hevy_map.json','/catalogue/free_exercise_db_map.json'].map(p=>fetch(p).then(r=>{if(!r.ok)throw Error('Catalogue unavailable');return r.json()})));catalogue=new ExerciseCatalogue(responses[0] as Catalogue);map=responses[1];records=catalogue.all().map(mapEntry);const fed=responses[2];for(const [key,value] of Object.entries(fed.by_source_id||fed.by_id||fed)){if(typeof value==='string'&&catalogue.get(value)){legacyIds.set('free-exercise-db:'+key,value);legacyIds.set('free-'+key,value)}};})().catch(e=>{pending=undefined;throw e})}
const EMPTY_LINKS:Record<string,string>={};
let lastLinks:object|undefined,matcher:HevyMatcher|undefined;let resolvedCache=new Map<string,string|null>();
export function resolveExercise(row:any,links:Record<string,string>=EMPTY_LINKS):string|null {
 if(!catalogue||!map)return null;
 if(catalogue.get(row.catalogId))return row.catalogId;
 if(row.catalogId?.startsWith('custom:'))return row.catalogId;
 // Old shared/provider IDs may be attached to Hevy imports; match their exact title.
 if(row.catalogId?.startsWith('shared-')&&!row.imported&&!row.exercise_template_id&&!row.template_id&&!/hevy/i.test(row.catalogSource||''))return null;
 if(legacyIds.has(row.catalogId))return legacyIds.get(row.catalogId)!;
 if(lastLinks!==links||!matcher){matcher=new HevyMatcher(catalogue.all(),map,links);lastLinks=links;resolvedCache=new Map()}
 const template=row.exercise_template_id||row.template_id||(/hevy/i.test(row.catalogSource||'')?row.catalogId:undefined);const title=row.exercise||row.name||'',key=template+'|'+title;if(resolvedCache.has(key))return resolvedCache.get(key)!;const result=matcher.match(title,template);const id=result.mfdId&&(catalogue.get(result.mfdId)||result.mfdId.startsWith('custom:'))?result.mfdId:null;resolvedCache.set(key,id);return id;
}
/** Copy only changed branches; original import metadata and measurements are retained. */
export function migrateExerciseIds(old:any){
 if(!catalogue)return old;const links=old.mfdExerciseLinks||EMPTY_LINKS;
 // Repair the known legacy reps-only seated-calf mapping without changing numeric values.
 const row=(value:any,context:any={})=>{const id=resolveExercise({...value,...context},links);if(!id)return value;const source=id.startsWith('custom:')?'Custom':'MFD';const repair=id==='seated_calf_raise'&&value.tracking==='reps';if(id===value.catalogId&&value.catalogSource===source&&!repair)return value;return {...value,...(repair?{tracking:'weight_reps'}:{}),...(value.catalogId&&value.catalogId!==id?{legacyCatalogId:value.legacyCatalogId||value.catalogId}:{}),catalogId:id,catalogSource:source}};
 const mapSame=(array:any[],fn:(v:any,i:number)=>any)=>{let changed=false;const next=array.map((v,i)=>{const n=fn(v,i);if(n!==v)changed=true;return n});return changed?next:array};
 const sessions=mapSame(old.sessions,(s:any)=>{const sets=mapSame(s.sets,(v:any)=>row(v,{imported:/hevy/i.test(s.source||'')||!!s.hevyRows||!!s.importKey}));return sets===s.sets?s:{...s,sets}});
 const routines=mapSame(old.routines,(r:any)=>{const exercises=mapSame(r.exercises,(e:any,i:number)=>{const template=e.exercise_template_id||r.hevyOriginal?.exercises?.[i]?.exercise_template_id;const imported=/hevy/i.test(r.source||'')||!!r.hevyOriginal;let next=row(e,{exercise:e.name,exercise_template_id:template,imported});const id=next.catalogId;if(e.setDetails){const details=mapSame(e.setDetails,(s:any)=>row(s,{exercise:e.name,exercise_template_id:template,imported,...(catalogue?.get(id)||id?.startsWith('custom:')?{catalogId:id}:{})}));if(details!==e.setDetails)next={...next,setDetails:details}}return next});return exercises===r.exercises?r:{...r,exercises}});
 const sets=old.active&&mapSame(old.active.sets,(s:any)=>row(s));const active=old.active&&sets!==old.active.sets?{...old.active,sets}:old.active;
 return sessions!==old.sessions||routines!==old.routines||active!==old.active?{...old,sessions,routines,active,mfdCatalogueVersion:catalogue.meta.version}:old;
}

export function installNativeCatalogue(engine:any){
 engine?.installCatalogue(records.map(e=>({id:e.id,name:e.name,muscle:e.primaryMuscle,equipment:e.equipment,tracking:e.tracking,source:'MFD',instructions:e.instructions,images:[]})),(row:any,links:Record<string,string>)=>resolveExercise(row,links), (title:string,links:Record<string,string>)=>map?new HevyMatcher(catalogue!.all(),map,links).match(title):null, (id:string,title:string,links:Record<string,string>)=>map?new HevyMatcher(catalogue!.all(),map,links).remember(id,null,title):links,migrateExerciseIds);
}
