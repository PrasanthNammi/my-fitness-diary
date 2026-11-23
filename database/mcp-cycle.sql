-- AI assistants read Cycle & Health (MFD 3.1): the connector tool get_cycle, behind TWO separate choices:
--   1. the permission "cycle", ticked on its own when connecting ChatGPT or Claude (never part of "Select all"), and
--   2. the person's own switch in MFD: Settings -> Cycle & Health -> AI assistants (cycle_settings.ai_access, off by
--      default). Switching it off stops every connected assistant at once.
-- Without both, the tool answers that it isn't shared (and nothing else in the connector ever contains cycle data:
-- diary.as_envelope leaves the cycle parts out).
--
-- What it reads (the person's own records, as logged): days in a range (default the last 90, at most 400) with
-- bleeding, flow, pain, symptoms, mood and notes; periods and cycle lengths (the app's rule: a period day within 7 days
-- of the last one belongs to the same period); medicines, doses in the range, lab results with each lab's own range,
-- and conditions. Never an estimate of fertile days or ovulation, and no interpretation (see docs/cycle/EVIDENCE.md).
--
-- Safe to re-run. Apply after mcp-routine-edit.sql and database/diary/17-cycle.sql. Leaves mfd_mcp.dispatch untouched.
begin;

alter table mfd_mcp.grants drop constraint if exists grants_permissions_check;
alter table mfd_mcp.grants add constraint grants_permissions_check check (permissions <@ array['workouts','routines','nutrition','progress','profile','recovery','cycle','log_workouts','log_routines','log_nutrition','log_progress','log_settings']);

create or replace function mfd_mcp.cycle(args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid(); c text := auth.jwt()->>'client_id'; conn text := args->>'connection';
 tz text; today date; f date; t date; days jsonb; periods jsonb;
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
 select g2.timezone into tz from mfd_mcp.grants g2 where user_id=u and client_id=conn and 'cycle'=any(permissions) for share;
 if not found then raise exception 'Consent required' using errcode='42501'; end if;
 -- The person's own switch in MFD (the second choice).
 if not exists (select 1 from diary.cycle_settings s where s.user_id=u and s.deleted_at is null and s.enabled and s.ai_access) then
  raise exception 'Cycle & Health is not shared with AI assistants. The user can switch it on in MFD: Settings -> Cycle & Health -> AI assistants.' using errcode='22023'; end if;

 today := (now() at time zone coalesce(tz,'UTC'))::date;
 begin
  t := coalesce(nullif(args->>'to','')::date, today); f := coalesce(nullif(args->>'from','')::date, t - 89);
 exception when others then raise exception 'Dates must be YYYY-MM-DD' using errcode='22023'; end;
 if f > t then raise exception 'from must not be after to' using errcode='22023'; end if;
 if t - f > 399 then raise exception 'At most 400 days at a time' using errcode='22023'; end if;

 select coalesce(jsonb_agg(x - 'id' order by x->>'date'), '[]') into days
 from jsonb_array_elements(diary.cycle_part(u, 'cycleDays')) x where (x->>'date')::date between f and t;

 -- Periods: runs of period days with gaps of at most 7 days (as the app counts them); the last 24.
 with p as (select local_date d from diary.cycle_days where user_id=u and deleted_at is null and bleeding='period' and local_date<=today),
 g as (select d, sum(case when lag is null or d - lag > 7 then 1 else 0 end) over (order by d) grp from (select d, lag(d) over (order by d) lag from p) z),
 r as (select min(d) s, max(d) e from g group by grp),
 l as (select s, e, lead(s) over (order by s) - s len from r)
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('start', s, 'end', e, 'bleeding_days', e - s + 1, 'cycle_length_days', len)) order by s), '[]') into periods
 from (select * from l order by s desc limit 24) z;

 return jsonb_build_object(
  'range', jsonb_build_object('from', f, 'to', t),
  'days', days,
  'periods', periods,
  'medicines', (select coalesce(jsonb_agg(x - 'id'), '[]') from jsonb_array_elements(diary.cycle_part(u, 'cycleMeds')) x),
  'doses', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('date', x->>'date', 'time', x->>'time', 'medicine', m->>'name', 'status', x->>'status', 'note', x->>'note')) order by x->>'date'), '[]')
    from jsonb_array_elements(diary.cycle_part(u, 'cycleDoses')) x
    left join lateral (select y m from jsonb_array_elements(diary.cycle_part(u, 'cycleMeds')) y where y->>'id' = x->>'medId' limit 1) mm on true
    where (x->>'date')::date between f and t),
  'lab_results', (select coalesce(jsonb_agg(x - 'id' order by x->>'date' desc), '[]') from (select x from jsonb_array_elements(diary.cycle_part(u, 'cycleLabs')) x order by x->>'date' desc limit 100) z),
  'conditions', (select coalesce(jsonb_agg(x - 'id'), '[]') from jsonb_array_elements(diary.cycle_part(u, 'cycleConditions')) x),
  'notes', jsonb_build_array(
   'Recorded by the user in MFD. Days without an entry are unknown, not "no symptoms". "nothing": true means the user noted nothing that day.',
   'Do not infer fertile days, ovulation, pregnancy chances or diagnoses. Lab ranges are each lab''s own (low/high); do not interpret results, suggest discussing them with a doctor.',
   'The app shows its own next-period estimate; it is not part of this data.'));
end $$;
revoke all on function mfd_mcp.cycle(jsonb) from public,anon;
grant execute on function mfd_mcp.cycle(jsonb) to authenticated;

-- The router: "cycle" goes to mfd_mcp.cycle (one line added in place, like mcp-routine-edit.sql).
do $patch$
declare def text; n int;
 old text := $o$  when operation='edit_routine' then mfd_mcp.edit_routine(args)$o$;
 new text := $n$  when operation='edit_routine' then mfd_mcp.edit_routine(args)
  when operation='cycle' then mfd_mcp.cycle(args)$n$;
begin
 def := pg_get_functiondef('public.mfd_mcp(text,jsonb)'::regprocedure);
 if position(new in def) > 0 then return; end if;            -- already changed (re-run)
 n := (length(def) - length(replace(def, old, ''))) / length(old);
 if n <> 1 then raise exception 'public.mfd_mcp: expected the line once, found it % times; nothing was changed', n; end if;
 execute replace(def, old, new);
end $patch$;

commit;
