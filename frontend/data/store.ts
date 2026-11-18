// Local persistence layer: one versioned document in localStorage, exposed to React
// through useSyncExternalStore. Repositories (./repositories.ts) are the only code that
// writes to it, so swapping in a Supabase-backed implementation stays contained.

import { useSyncExternalStore } from 'react';
import type {
  Account, ActiveWorkout, CheckIn, CoachMessage, DiaryEntry, Exercise, Folder, Food,
  ISODate, Profile, Routine, Settings, WeightEntry, Workout,
} from '../domain/types';

export interface DB {
  version: 1;
  account: Account | null;
  signedIn: boolean;
  profile: Profile | null;
  settings: Settings;
  folders: Folder[];
  routines: Routine[];
  workouts: Workout[];
  active: ActiveWorkout | null;
  customExercises: Exercise[];
  customFoods: Food[];
  favouriteFoodIds: string[];
  diary: DiaryEntry[];
  water: Record<ISODate, number>;
  weights: WeightEntry[];
  checkins: CheckIn[];
  coachThread: CoachMessage[];
  selectedDate: ISODate | null;
  /** Workout suggestions from ChatGPT or Claude (stored as the connector wrote them). */
  aiSuggestions: AiSuggestion[];
  /** Other changes from ChatGPT or Claude (water, goals and settings, folders), listed in the AI list with Undo. */
  aiChanges: AiChange[];
}


import type {AiSuggestion} from '../domain/aiSuggestions';
import type {AiChange} from '../domain/aiChanges';
export {defaultSettings,emptyDB} from './defaults';
import {emptyDB} from './defaults';
import {engine} from '../adapters/engine';
import {toDB,fromDB} from '../adapters/compat';
import {calculateTargets,profileForTargets} from '../domain/nutrition';
import {MFD3} from '../lib/release';
let state:DB=emptyDB(),lastDataVersion=-1,writing=false,disconnect:(()=>void)|undefined;
const listeners=new Set<()=>void>();
export function isDB(v:unknown):v is DB{return !!v&&typeof v==='object'&&Array.isArray((v as DB).workouts)&&Array.isArray((v as DB).diary)}
function notify(){listeners.forEach(l=>l())}
function refresh(){let e=engine();if(!e||writing)return;let s=e.peek();if(s.dataVersion===lastDataVersion)return;lastDataVersion=s.dataVersion;state=toDB(s,e.catalogue());notify()}
export function getDB(){return state}
/** Copy only slices accessed by a repository mutation. History/catalogue stay shared on set edits. */
export function update(fn:(d:DB)=>void){let e=engine();if(!e?.peek().ready)throw Error('Sign in first');let changed=new Set<string>(),draft={...state};const editable=new Proxy(draft,{get(target,key){if(typeof key==='string'&&!changed.has(key)){changed.add(key);const value=Reflect.get(target,key);if(value&&typeof value==='object')Reflect.set(target,key,structuredClone(value))}return Reflect.get(target,key)},set(target,key,value){changed.add(String(key));return Reflect.set(target,key,value)}});fn(editable);let next=fromDB(draft,e.peek().state,changed);if((changed.has('profile')||(MFD3&&changed.has('weights')))&&draft.profile){let t=calculateTargets(profileForTargets(draft.profile,draft.weights,MFD3)).targets;next.profile.cal=t.kcal;next.profile.protein=t.protein;next.profile.carbs=t.carbs;next.profile.fat=t.fat}writing=true;try{e.set(next);state=e.peek().state===next?draft:toDB(e.peek(),e.catalogue());lastDataVersion=e.peek().dataVersion}finally{writing=false}notify()}
export function replaceDB(next:DB){update(d=>Object.assign(d,next))}
export function subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
export function useDB<T>(select:(d:DB)=>T):T{return useSyncExternalStore(subscribe,()=>select(state))}
export const getSaveError=()=>engine()?.peek().error||null;
function connect(){disconnect?.();lastDataVersion=-1;disconnect=engine()?.subscribe(refresh);refresh()}
window.addEventListener('mfd-engine-ready',connect);if(engine())connect();
