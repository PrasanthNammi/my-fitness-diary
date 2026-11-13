-- AI assistants read recovery (MFD 2.0): the connector tool get_recovery, behind a new "recovery" permission the
-- person ticks separately (nothing changes for existing connections until they do).
--
-- 1. "recovery" joins the permissions a connection may hold.
-- 2. mfd_mcp.recovery: per day in a range (default the last 14 days, at most 92): sleep hours and stages (with bed
--    and wake time in the person's time zone), steps, resting heart rate, HRV, energy, soreness and the check-in
--    note, plus averages. Values come from the person's own check-ins (typed, or read from Samsung Health by the
--    Android app); nothing else in the diary is read.
-- 3. get_workouts answers with each workout's heart-rate summary (average, maximum, where it came from) instead of
--    the stored series (up to 2,000 readings each), and without internal fields.
--
-- Safe to re-run. Apply after mcp-start-workout.sql. Leaves mfd_mcp.dispatch untouched: the public entry point
-- routes "recovery" here (same session, audience, connection and consent checks) and passes workouts through it.
begin;

alter table mfd_mcp.grants drop constraint if exists grants_permissions_check;
alter table mfd_mcp.grants add constraint grants_permissions_check check (permissions <@ array['workouts','routines','nutrition','progress','profile','recovery','log_workouts','log_routines','log_nutrition','log_progress']);

-- A check-in number: stored as a JSON number, or as text in older entries ("7.5").
create or replace function mfd_mcp.checkin_num(j jsonb) returns numeric language sql immutable set search_path='' as $$
 select case when jsonb_typeof(j)='number' then (j#>>'{}')::numeric
  when jsonb_typeof(j)='string' and j#>>'{}' ~ '^\s*\d{1,6}(\.\d{1,3})?\s*$' then trim(j#>>'{}')::numeric end $$;

create or replace function mfd_mcp.recovery(args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid(); c text := auth.jwt()->>'client_id'; conn text := args->>'connection';
 tz text; today date; doc jsonb; rev bigint; f date; t date; days jsonb; averages jsonb;
begin
 -- Same session, audience and consent checks as mfd_mcp.dispatch.
 if u is null or not exists (
  select 1 from auth.sessions s
  where s.id::text=auth.jwt()->>'session_id' and s.user_id=u and (s.not_after is null or s.not_after>now())
   and exists (select 1 from auth.refresh_tokens rt where rt.session_id=s.id and rt.user_id=u::text and rt.revoked=false)
 ) then raise exception 'Active session required' using errcode='42501'; end if;
 if auth.jwt()->>'aud' is distinct from (select resource_uri from mfd_mcp.settings where id) or not exists(select 1 from mfd_mcp.clients where client_id=c) then
  raise exception 'Invalid audience' using errcode='42501'; end if;
 if conn is null or conn !~ '^[[:graph:]]+$' or length(conn)>512 then raise exception 'Connection required' using errcode='42501'; end if;
 select g2.timezone into tz from mfd_mcp.grants g2 where user_id=u and client_id=conn and 'recovery'=any(permissions) for share;
 if not found then raise exception 'Consent required' using errcode='42501'; end if;
 tz := coalesce(tz,'UTC');
 today := (now() at time zone tz)::date;

 if (args ? 'from' and (jsonb_typeof(args->'from') is distinct from 'string' or mfd_mcp.safe_date(args->>'from') is null))
    or (args ? 'to' and (jsonb_typeof(args->'to') is distinct from 'string' or mfd_mcp.safe_date(args->>'to') is null)) then
  raise exception 'Invalid date range (use YYYY-MM-DD)' using errcode='22023'; end if;
 t := coalesce(mfd_mcp.safe_date(args->>'to'), today);
 f := coalesce(mfd_mcp.safe_date(args->>'from'), t-13);
 if f>t then raise exception 'from must be on or before to' using errcode='22023'; end if;
 if t-f>91 then raise exception 'At most 92 days at a time' using errcode='22023'; end if;

 select payload,revision into doc,rev from public.forma_workspaces where user_id=u;
 -- One row per day: the day's recovery check-in (rows with only body measurements are not recovery).
 with rows as (
  select mfd_mcp.safe_date(x->>'date') d, x
  from jsonb_array_elements(case when jsonb_typeof(doc->'checkins')='array' then doc->'checkins' else '[]' end) x
  where jsonb_typeof(x)='object' and mfd_mcp.safe_date(x->>'date') between f and t
 ), day as (
  select distinct on (d) d,
   mfd_mcp.checkin_num(x->'sleep') sleep, mfd_mcp.checkin_num(x->'steps') steps,
   mfd_mcp.checkin_num(x->'energy') energy, mfd_mcp.checkin_num(x->'soreness') soreness,
   mfd_mcp.checkin_num(x->'restingHr') resting, mfd_mcp.checkin_num(x->'hrv') hrv,
   case when jsonb_typeof(x->'sleepStages')='object' then x->'sleepStages' end stages,
   nullif(left(trim(coalesce(x->>'note','')),300),'') note
  from rows
  where coalesce(mfd_mcp.checkin_num(x->'sleep'),mfd_mcp.checkin_num(x->'steps'),mfd_mcp.checkin_num(x->'energy'),mfd_mcp.checkin_num(x->'soreness'),
    mfd_mcp.checkin_num(x->'restingHr'),mfd_mcp.checkin_num(x->'hrv')) is not null or jsonb_typeof(x->'sleepStages')='object' or nullif(trim(coalesce(x->>'note','')),'') is not null
  order by d
 ), out as (
  select d, jsonb_strip_nulls(jsonb_build_object(
   'date', d, 'sleep_hours', sleep, 'steps', steps, 'resting_heart_rate_bpm', resting, 'hrv_ms', hrv,
   'energy_1_to_5', energy, 'soreness_1_to_5', soreness, 'note', note,
   'sleep_stages_minutes', case when stages is not null then jsonb_strip_nulls(jsonb_build_object(
     'deep', mfd_mcp.checkin_num(stages->'deep'), 'light', mfd_mcp.checkin_num(stages->'light'),
     'rem', mfd_mcp.checkin_num(stages->'rem'), 'awake', mfd_mcp.checkin_num(stages->'awake'))) end,
   'bed_time', case when mfd_mcp.checkin_num(stages->'start') is not null then to_char(to_timestamp(mfd_mcp.checkin_num(stages->'start')/1000) at time zone tz, 'HH24:MI') end,
   'wake_time', case when mfd_mcp.checkin_num(stages->'end') is not null then to_char(to_timestamp(mfd_mcp.checkin_num(stages->'end')/1000) at time zone tz, 'HH24:MI') end
  )) o, sleep, steps, resting, hrv, energy, soreness from day
 )
 select coalesce(jsonb_agg(o order by d),'[]'),
  jsonb_strip_nulls(jsonb_build_object(
   'days_with_data', count(*), 'sleep_hours', round(avg(sleep),1), 'steps', round(avg(steps)),
   'resting_heart_rate_bpm', round(avg(resting),1), 'hrv_ms', round(avg(hrv),1),
   'energy_1_to_5', round(avg(energy),1), 'soreness_1_to_5', round(avg(soreness),1)))
 into days, averages from out;
 return jsonb_build_object('revision',rev,'today',today,'data',jsonb_build_object('from',f,'to',t,'days',days,'averages',averages,
  'note','Sleep, steps, resting heart rate and HRV come from Samsung Health when the user connected it in the MFD Android app; energy, soreness and notes are the user''s own check-ins. Days without data are left out.'));
end $$;
revoke all on function mfd_mcp.recovery(jsonb) from public,anon;
grant execute on function mfd_mcp.recovery(jsonb) to authenticated;

-- Workouts for an assistant: each workout's heart rate as a summary, and no internal per-set fields.
create or replace function mfd_mcp.workouts_out(r jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when jsonb_typeof(r->'data') is distinct from 'array' then r else jsonb_set(r,'{data}',(
  select coalesce(jsonb_agg(
   case when jsonb_typeof(w)<>'object' then w else
    (w-'heartRate'-'sets')
    || case when jsonb_typeof(w->'sets')='array' then jsonb_build_object('sets',(select coalesce(jsonb_agg(case when jsonb_typeof(s)='object' then s-'mfdDoneAt'-'mfdSuggested'-'mfdAi'-'mfdAiPrev'-'mfdAiAdded' else s end order by i),'[]') from jsonb_array_elements(w->'sets') with ordinality q(s,i))) else '{}' end
    || case when jsonb_typeof(w->'heartRate')='object' then jsonb_build_object('heart_rate',jsonb_strip_nulls(jsonb_build_object(
       'avg_bpm',w->'heartRate'->'avg','max_bpm',w->'heartRate'->'max',
       'source',case w->'heartRate'->>'source' when 'watch' then 'MFD Galaxy Watch app' when 'health' then 'Samsung Health' end))) else '{}' end
   end order by n),'[]')
  from jsonb_array_elements(r->'data') with ordinality e(w,n))) end $$;
revoke all on function mfd_mcp.workouts_out(jsonb) from public,anon;
grant execute on function mfd_mcp.workouts_out(jsonb) to authenticated;

-- Route the AI-only operations; everything else still goes to mfd_mcp.dispatch unchanged.
create or replace function public.mfd_mcp(operation text,args jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
 select case operation
  when 'suggest_workout_targets' then mfd_mcp.suggest(args)
  when 'start_workout' then mfd_mcp.start_workout(args)
  when 'recovery' then mfd_mcp.recovery(args)
  when 'workouts' then mfd_mcp.workouts_out(mfd_mcp.dispatch(operation,args))
  else mfd_mcp.dispatch(operation,args) end
$$;
revoke all on function public.mfd_mcp(text,jsonb) from public,anon;
grant execute on function public.mfd_mcp(text,jsonb) to authenticated;
commit;
