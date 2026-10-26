import { useEffect } from 'react';
import { useDB } from '../data/store';
import { workouts } from '../data/repositories';
import { workoutDeadline } from '../domain/workoutLimit';
import { toast } from '../components/ui';
import { navigate } from './router';

/** One deadline timer for the whole app, with immediate resume/restore recovery. */
export function useWorkoutLimit() {
  const active=useDB(d=>d.active),signedIn=useDB(d=>d.signedIn);
  const id=active?.id,startedAt=active?.startedAt;
  useEffect(()=>{
    if(!signedIn || !id || !Number.isFinite(startedAt) || !startedAt || startedAt<=0) return;
    const check=()=>{
      const result=workouts.expire(Date.now(),id);
      if(!result)return;
      toast(result.workout?'Workout ended at 200 minutes. Completed sets saved.':'Workout ended at 200 minutes. No completed sets to save.');
      if(location.hash==='#/workout')navigate(result.workout?`/progress/session/${result.workout.id}`:'/training',{replace:true});
    };
    check();
    const timer=window.setTimeout(check,Math.max(0,workoutDeadline({startedAt})-Date.now()));
    window.addEventListener('focus',check);
    window.addEventListener('pageshow',check);
    document.addEventListener('visibilitychange',check);
    return()=>{window.clearTimeout(timer);window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',check)};
  },[id,startedAt,signedIn]);
}
