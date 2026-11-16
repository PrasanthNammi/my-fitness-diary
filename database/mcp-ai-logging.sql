-- More things AI assistants can log (MFD 2.1): water, body measurements, routine folders, and goals & settings.
--
-- 1. log_water (permission "log_nutrition"): adds millilitres to a day's water (50-5000 ml at a time, a day at most
--    10 L). Days before yesterday only when nothing is logged there yet, like weigh-ins.
-- 2. log_measurements (permission "log_progress"): a NEW dated row with waist, chest, hips and/or arms in cm, the
--    same row the app's "Add measurements" writes. Days before yesterday only when that day has none.
-- 3. Routine folders (permission "log_routines"): create_routine takes an optional folder; move_routine puts an
--    existing routine in a folder. A folder that doesn't exist is created only with create_folder=true, which the
--    assistant may send only after the user agreed to that folder name. get_routines answers with folder names.
-- 4. change_settings (new permission "log_settings", ticked separately): goal, activity level, training days, target
--    weight, height, age, water goal, units and default rest. Always two steps: the first call only returns the
--    change (from -> to, and the calorie and macro targets it leads to) and a confirm_token; the second call with
--    the same values and that token, after the user said yes, saves it. Safe limits: target weight within 25% of
--    the current weight and a BMI of at least 18.5; the app's own calorie floor stays. Never email, password,
--    account, privacy, friends, notifications or connections.
--
-- Every change is listed for the app in the diary's "aiChanges" (last 100), where the user can undo it; new
-- measurement rows carry "addedBy" like other AI entries. All writes count towards the 30-a-day limit.
--
-- Safe to re-run. Apply after mcp-recovery.sql. Leaves mfd_mcp.dispatch untouched.
begin;

alter table mfd_mcp.grants drop constraint if exists grants_permissions_check;
alter table mfd_mcp.grants add constraint grants_permissions_check check (permissions <@ array['workouts','routines','nutrition','progress','profile','recovery','log_workouts','log_routines','log_nutrition','log_progress','log_settings']);

-- Settings changes waiting for the user's yes (10 minutes).
create table if not exists mfd_mcp.pending_changes(
 token uuid primary key default gen_random_uuid(), user_id uuid not null, connection text not null,
 request jsonb not null, created_at timestamptz not null default now());
alter table mfd_mcp.pending_changes enable row level security;
revoke all on mfd_mcp.pending_changes from public,anon,authenticated;

-- The caller, checked the same way as mfd_mcp.dispatch: live session, connector audience, the connection's consent
-- for `perm`, writes enabled, and a well-formed request_id. Returns the user, connection and the user's today.
create or replace function mfd_mcp.ai_writer(perm text, args jsonb, out u uuid, out conn text, out today date)
language plpgsql security definer set search_path='' as $$
declare c text := auth.jwt()->>'client_id'; tz text; rid text := args->>'request_id';
begin
 u := auth.uid(); conn := args->>'connection';
 if u is null or not exists (
  select 1 from auth.sessions s
  where s.id::text=auth.jwt()->>'session_id' and s.user_id=u and (s.not_after is null or s.not_after>now())
   and exists (select 1 from auth.refresh_tokens rt where rt.session_id=s.id and rt.user_id=u::text and rt.revoked=false)
 ) then raise exception 'Active session required' using errcode='42501'; end if;
 if auth.jwt()->>'aud' is distinct from (select resource_uri from mfd_mcp.settings where id) or not exists(select 1 from mfd_mcp.clients where client_id=c) then
  raise exception 'Invalid audience' using errcode='42501'; end if;
 if conn is null or conn !~ '^[[:graph:]]+$' or length(conn)>512 then raise exception 'Connection required' using errcode='42501'; end if;
 select g.timezone into tz from mfd_mcp.grants g where user_id=u and client_id=conn and perm=any(permissions) for share;
 if not found then raise exception 'Consent required' using errcode='42501'; end if;
 today := (now() at time zone coalesce(tz,'UTC'))::date;
 if not (select writes_enabled from mfd_mcp.settings where id) then
  raise exception 'Adding entries is turned off for this diary' using errcode='22023'; end if;
 if args ? 'request_id' and (jsonb_typeof(args->'request_id') is distinct from 'string' or rid !~ '^[A-Za-z0-9_-]+$' or length(rid)>64) then
  raise exception 'Invalid request_id' using errcode='22023'; end if;
end $$;
revoke all on function mfd_mcp.ai_writer(text,jsonb) from public,anon,authenticated;

-- The diary, locked for this change, if the app can load it (same checks as adding entries).
create or replace function mfd_mcp.ai_doc(u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare doc jsonb;
begin
 select payload into doc from public.forma_workspaces where user_id=u for update;
 if not found then raise exception 'Open the diary app once before adding entries' using errcode='22023'; end if;
 if jsonb_typeof(doc->'profile') is distinct from 'object'
    or exists (select 1 from unnest(array['meals','weights','sessions','routines','checkins','chat']) k where jsonb_typeof(doc->k) is distinct from 'array')
    or exists (select 1 from unnest(array['cal','protein','carbs','fat','days']) k where jsonb_typeof(doc->'profile'->k) is distinct from 'number' or (doc->'profile'->>k)::numeric<=0) then
  raise exception 'Finish setting up the diary app before adding entries' using errcode='22023'; end if;
 if octet_length(doc::text)>7500000 then raise exception 'Diary is too large to add entries here' using errcode='22023'; end if;
 return doc;
end $$;
revoke all on function mfd_mcp.ai_doc(uuid) from public,anon,authenticated;

-- One more write for this app today (30 at most).
create or replace function mfd_mcp.ai_count(u uuid, conn text, today date) returns void language plpgsql security definer set search_path='' as $$
declare used integer;
begin
 delete from mfd_mcp.write_counts where user_id=u and day<today-7;
 insert into mfd_mcp.write_counts as w values(u,conn,today,1) on conflict(user_id,connection,day) do update set n=w.n+1 returning n into used;
 if used>30 then raise exception 'Daily limit of 30 new entries for this app reached; try again tomorrow' using errcode='22023'; end if;
end $$;
revoke all on function mfd_mcp.ai_count(uuid,text,date) from public,anon,authenticated;

create or replace function mfd_mcp.ai_by(conn text, rid text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('connection',conn,'at',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'request',rid)) $$;

-- The diary with one more AI change listed (newest last, the last 100 kept), and its revision moved on.
create or replace function mfd_mcp.ai_save(u uuid, doc jsonb, change jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare rev bigint; list jsonb := case when jsonb_typeof(doc->'aiChanges')='array' then doc->'aiChanges' else '[]' end || jsonb_build_array(change);
begin
 if jsonb_array_length(list)>100 then select jsonb_agg(v order by n) into list from jsonb_array_elements(list) with ordinality e(v,n) where n>jsonb_array_length(list)-100; end if;
 update public.forma_workspaces set payload=jsonb_set(doc,'{aiChanges}',list), revision=revision+1, updated_at=now() where user_id=u returning revision into rev;
 return rev;
end $$;
revoke all on function mfd_mcp.ai_save(uuid,jsonb,jsonb) from public,anon,authenticated;

-- A repeated request (same connection and request_id) answers with the first result instead of adding again.
create or replace function mfd_mcp.ai_repeat(doc jsonb, conn text, rid text) returns jsonb language sql stable set search_path='' as $$
 select case when rid is null then null else (select v from jsonb_array_elements(case when jsonb_typeof(doc->'aiChanges')='array' then doc->'aiChanges' else '[]' end) v
  where v->'addedBy'->>'connection'=conn and v->'addedBy'->>'request'=rid limit 1) end $$;

-- ── Water ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function mfd_mcp.log_water(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w record; doc jsonb; d date := mfd_mcp.safe_date(args->>'date'); ml numeric := mfd_mcp.safe_num(args->'ml'); had numeric; was jsonb; rev bigint; id text := gen_random_uuid()::text;
begin
 select * into w from mfd_mcp.ai_writer('log_nutrition', args);
 if d is null or d<date '2000-01-01' then raise exception 'Invalid date (YYYY-MM-DD)' using errcode='22023'; end if;
 if d>w.today then raise exception 'Water cannot be logged in the future (today is %)', to_char(w.today,'FMDD Mon YYYY') using errcode='22023'; end if;
 if ml is null or ml<>trunc(ml) or ml not between 50 and 5000 then raise exception 'ml must be a whole number from 50 to 5000' using errcode='22023'; end if;
 doc := mfd_mcp.ai_doc(w.u);
 was := mfd_mcp.ai_repeat(doc, w.conn, args->>'request_id');
 if was is not null then return jsonb_build_object('id',was->>'id','duplicate',true); end if;
 had := coalesce(mfd_mcp.safe_num(doc->'water'->(d::text)),0);
 if d<w.today-1 and had>0 then
  raise exception 'Water is already logged on %. Older days can only be filled when empty; change it in the app if needed.', to_char(d,'FMDD Mon YYYY') using errcode='22023'; end if;
 if had+ml>10000 then raise exception 'That would make % ml on that day; at most 10,000 ml a day', had+ml using errcode='22023'; end if;
 perform mfd_mcp.ai_count(w.u, w.conn, w.today);
 doc := jsonb_set(doc,'{water}',(case when jsonb_typeof(doc->'water')='object' then doc->'water' else '{}' end)||jsonb_build_object(d::text,had+ml));
 rev := mfd_mcp.ai_save(w.u, doc, jsonb_build_object('id',id,'kind','water','date',d,'ml',ml,'addedBy',mfd_mcp.ai_by(w.conn,args->>'request_id')));
 return jsonb_build_object('id',id,'revision',rev,'date',d,'added_ml',ml,'day_total_ml',had+ml);
end $$;
revoke all on function mfd_mcp.log_water(jsonb) from public,anon;
grant execute on function mfd_mcp.log_water(jsonb) to authenticated;

-- ── Body measurements ────────────────────────────────────────────────────────────────────────────────────────
create or replace function mfd_mcp.log_measurements(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w record; doc jsonb; d date := mfd_mcp.safe_date(args->>'date'); m jsonb := '{}'; k text; v numeric; rev bigint; id text := gen_random_uuid()::text;
 rid text := args->>'request_id'; existing text;
 lim constant jsonb := '{"waist":[40,200],"chest":[50,200],"hips":[50,200],"arms":[15,80]}';
begin
 select * into w from mfd_mcp.ai_writer('log_progress', args);
 if d is null or d<date '2000-01-01' then raise exception 'Invalid date (YYYY-MM-DD)' using errcode='22023'; end if;
 if d>w.today then raise exception 'Measurements cannot be in the future (today is %)', to_char(w.today,'FMDD Mon YYYY') using errcode='22023'; end if;
 foreach k in array array['waist','chest','hips','arms'] loop
  if args ? (k||'_cm') then
   v := mfd_mcp.safe_num(args->(k||'_cm'));
   if v is null or v not between (lim->k->>0)::numeric and (lim->k->>1)::numeric then
    raise exception '%_cm must be from % to % cm', k, lim->k->>0, lim->k->>1 using errcode='22023'; end if;
   m := m||jsonb_build_object(k,round(v,1));
  end if;
 end loop;
 if m='{}' then raise exception 'Give at least one of waist_cm, chest_cm, hips_cm or arms_cm' using errcode='22023'; end if;
 doc := mfd_mcp.ai_doc(w.u);
 if rid is not null then
  select e->>'id' into existing from jsonb_array_elements(doc->'checkins') e where e->'addedBy'->>'connection'=w.conn and e->'addedBy'->>'request'=rid limit 1;
  if existing is not null then return jsonb_build_object('id',existing,'duplicate',true); end if;
 end if;
 if d<w.today-1 and exists(select 1 from jsonb_array_elements(doc->'checkins') e where e->>'date'=d::text
    and coalesce(nullif(e->>'waist',''),nullif(e->>'chest',''),nullif(e->>'hips',''),nullif(e->>'arms','')) is not null) then
  raise exception 'You already have measurements on %. Older days can only be filled when empty; change it in the app if needed.', to_char(d,'FMDD Mon YYYY') using errcode='22023'; end if;
 perform mfd_mcp.ai_count(w.u, w.conn, w.today);
 m := jsonb_build_object('id',id,'date',d::text,'note','')||m||jsonb_build_object('addedBy',mfd_mcp.ai_by(w.conn,rid));
 doc := jsonb_set(doc,'{checkins}',(select jsonb_agg(e order by e->>'date', n) from jsonb_array_elements(doc->'checkins'||jsonb_build_array(m)) with ordinality x(e,n)));
 update public.forma_workspaces set payload=doc, revision=revision+1, updated_at=now() where user_id=w.u returning revision into rev;
 return jsonb_build_object('id',id,'revision',rev,'added',m-'addedBy','note','Stored in cm; the app shows inches if the user chose them.');
end $$;
revoke all on function mfd_mcp.log_measurements(jsonb) from public,anon;
grant execute on function mfd_mcp.log_measurements(jsonb) to authenticated;

-- ── Routine folders ──────────────────────────────────────────────────────────────────────────────────────────
-- The folder named `name` (any case): its id, or null when there is none.
create or replace function mfd_mcp.folder_id(doc jsonb, name text) returns text language sql stable set search_path='' as $$
 select f->>'id' from jsonb_array_elements(case when jsonb_typeof(doc->'folders')='array' then doc->'folders' else '[]' end) f
 where lower(btrim(f->>'name'))=lower(btrim(name)) limit 1 $$;
create or replace function mfd_mcp.folder_names(doc jsonb) returns text language sql stable set search_path='' as $$
 select coalesce(nullif(string_agg('"'||(f->>'name')||'"', ', '),''),'none yet') from jsonb_array_elements(case when jsonb_typeof(doc->'folders')='array' then doc->'folders' else '[]' end) f $$;

-- The folder to put a routine in, created when allowed. Returns (doc, folder id, created).
create or replace function mfd_mcp.ai_folder(doc jsonb, args jsonb, out doc_out jsonb, out fid text, out created boolean) language plpgsql set search_path='' as $$
declare nm text := btrim(coalesce(args->>'folder',''));
begin
 doc_out := doc; created := false;
 if nm='' or length(nm)>40 then raise exception 'folder must be 1 to 40 characters' using errcode='22023'; end if;
 if args ? 'create_folder' and jsonb_typeof(args->'create_folder') is distinct from 'boolean' then raise exception 'create_folder must be true or false' using errcode='22023'; end if;
 fid := mfd_mcp.folder_id(doc, nm);
 if fid is not null then return; end if;
 if coalesce((args->>'create_folder')::boolean,false) is not true then
  raise exception 'There is no folder called "%" (folders: %). Ask the user whether to create it, suggesting a name, and only after they agree call again with create_folder: true.', nm, mfd_mcp.folder_names(doc) using errcode='22023'; end if;
 if jsonb_array_length(case when jsonb_typeof(doc->'folders')='array' then doc->'folders' else '[]' end)>=30 then raise exception 'At most 30 folders' using errcode='22023'; end if;
 fid := gen_random_uuid()::text; created := true;
 doc_out := jsonb_set(doc,'{folders}',(case when jsonb_typeof(doc->'folders')='array' then doc->'folders' else '[]' end)||jsonb_build_array(jsonb_build_object('id',fid,'name',nm)));
 doc_out := jsonb_set(doc_out,'{folderOpen}',(case when jsonb_typeof(doc->'folderOpen')='object' then doc->'folderOpen' else '{}' end)||jsonb_build_object(fid,true));
end $$;
revoke all on function mfd_mcp.ai_folder(jsonb,jsonb) from public,anon,authenticated;

-- create_routine with a folder: checks the folder first (nothing is added if it is missing and may not be created),
-- adds the routine as before, then files it.
create or replace function mfd_mcp.create_routine_in(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w record; doc jsonb; f record; r jsonb; rev bigint;
begin
 select * into w from mfd_mcp.ai_writer('log_routines', args);
 select payload into doc from public.forma_workspaces where user_id=w.u;
 select * into f from mfd_mcp.ai_folder(coalesce(doc,'{}'), args); -- raises before anything is added
 r := mfd_mcp.dispatch('create_routine', args-'folder'-'create_folder');
 if coalesce((r->>'duplicate')::boolean,false) then return r; end if;
 doc := mfd_mcp.ai_doc(w.u);
 select * into f from mfd_mcp.ai_folder(doc, args);
 doc := jsonb_set(f.doc_out,'{routines}',(select jsonb_agg(case when e->>'id'=r->>'id' then e||jsonb_build_object('folderId',f.fid) else e end order by n) from jsonb_array_elements(f.doc_out->'routines') with ordinality x(e,n)));
 if f.created then
  rev := mfd_mcp.ai_save(w.u, doc, jsonb_build_object('id',gen_random_uuid(),'kind','folder','folderId',f.fid,'name',btrim(args->>'folder'),'addedBy',mfd_mcp.ai_by(w.conn,null)));
 else
  update public.forma_workspaces set payload=doc, revision=revision+1, updated_at=now() where user_id=w.u returning revision into rev;
 end if;
 return r||jsonb_build_object('revision',rev,'folder',btrim(args->>'folder'),'folder_created',f.created);
end $$;
revoke all on function mfd_mcp.create_routine_in(jsonb) from public,anon;
grant execute on function mfd_mcp.create_routine_in(jsonb) to authenticated;

create or replace function mfd_mcp.move_routine(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w record; doc jsonb; f record; routine jsonb; rev bigint; was jsonb; id text := gen_random_uuid()::text;
begin
 select * into w from mfd_mcp.ai_writer('log_routines', args);
 if coalesce(btrim(args->>'routine'),'')='' or length(args->>'routine')>80 then raise exception 'routine: the exact name from get_routines' using errcode='22023'; end if;
 doc := mfd_mcp.ai_doc(w.u);
 was := mfd_mcp.ai_repeat(doc, w.conn, args->>'request_id');
 if was is not null then return jsonb_build_object('id',was->>'id','duplicate',true); end if;
 select e into routine from jsonb_array_elements(doc->'routines') e where lower(btrim(e->>'name'))=lower(btrim(args->>'routine')) limit 1;
 if routine is null then raise exception 'No routine called "%"; use the exact name from get_routines', btrim(args->>'routine') using errcode='22023'; end if;
 select * into f from mfd_mcp.ai_folder(doc, args);
 if routine->>'folderId' is not distinct from f.fid then return jsonb_build_object('routine',routine->>'name','folder',btrim(args->>'folder'),'unchanged',true); end if;
 perform mfd_mcp.ai_count(w.u, w.conn, w.today);
 doc := jsonb_set(f.doc_out,'{routines}',(select jsonb_agg(case when e->>'id'=routine->>'id' then e||jsonb_build_object('folderId',f.fid) else e end order by n) from jsonb_array_elements(f.doc_out->'routines') with ordinality x(e,n)));
 rev := mfd_mcp.ai_save(w.u, doc, jsonb_strip_nulls(jsonb_build_object('id',id,'kind','move','routineId',routine->>'id','name',routine->>'name',
  'from',nullif(routine->>'folderId',''),'to',f.fid,'createdFolder',case when f.created then f.fid end,'folder',btrim(args->>'folder'),'addedBy',mfd_mcp.ai_by(w.conn,args->>'request_id'))));
 return jsonb_build_object('id',id,'revision',rev,'routine',routine->>'name','folder',btrim(args->>'folder'),'folder_created',f.created);
end $$;
revoke all on function mfd_mcp.move_routine(jsonb) from public,anon;
grant execute on function mfd_mcp.move_routine(jsonb) to authenticated;

-- get_routines: each routine with its folder's name, plus the list of folders.
create or replace function mfd_mcp.routines_out(r jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare folders jsonb;
begin
 select case when jsonb_typeof(payload->'folders')='array' then payload->'folders' else '[]' end into folders from public.forma_workspaces where user_id=auth.uid();
 if jsonb_typeof(r->'data') is distinct from 'array' then return r; end if;
 return jsonb_set(r,'{data}',(select coalesce(jsonb_agg(case when jsonb_typeof(e)='object' then e||jsonb_build_object('folder',
   (select f->>'name' from jsonb_array_elements(coalesce(folders,'[]')) f where f->>'id'=e->>'folderId' limit 1)) else e end order by n),'[]')
  from jsonb_array_elements(r->'data') with ordinality x(e,n)))
  ||jsonb_build_object('folders',(select coalesce(jsonb_agg(f->>'name'),'[]') from jsonb_array_elements(coalesce(folders,'[]')) f));
end $$;
revoke all on function mfd_mcp.routines_out(jsonb) from public,anon;
grant execute on function mfd_mcp.routines_out(jsonb) to authenticated;

-- ── Goals & settings ─────────────────────────────────────────────────────────────────────────────────────────
-- The app's daily targets (frontend/domain/nutrition.ts calculateTargets): Mifflin-St Jeor BMR x activity, goal
-- adjustment with a floor (1500 kcal men, 1200 women), protein per kg, fat as a share of energy, carbs the rest.
create or replace function mfd_mcp.targets(sex text, kg numeric, cm numeric, age numeric, activity text, goal text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare bmr numeric := 10*kg + 6.25*cm - 5*age + case when sex='female' then -161 else 5 end;
 factor numeric := case activity when 'sedentary' then 1.2 when 'light' then 1.375 when 'very' then 1.725 when 'extra' then 1.9 else 1.55 end;
 adj numeric := case goal when 'lose' then -0.2 when 'gain' then 0.1 when 'recomp' then -0.1 else 0 end;
 ppk numeric := case goal when 'maintain' then 1.6 when 'gain' then 1.8 else 2.0 end;
 share numeric := case goal when 'maintain' then 0.3 else 0.25 end;
 kcal numeric; p numeric; f numeric;
begin
 kcal := greatest(bmr*factor*(1+adj), case when sex='female' then 1200 else 1500 end);
 kcal := round(kcal/10)*10; p := round(kg*ppk); f := round(kcal*share/9);
 return jsonb_build_object('kcal',kcal,'protein_g',p,'carbs_g',greatest(0,round((kcal-p*4-f*9)/4)),'fat_g',f);
end $$;

-- What change_settings works on, read the way the app reads the profile and settings.
create or replace function mfd_mcp.settings_now(doc jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare p jsonb := coalesce(doc->'profile','{}'); s jsonb := case when jsonb_typeof(doc->'mfdSettings')='object' then doc->'mfdSettings' else '{}' end;
 n numeric; act text := p->>'activity'; latest numeric;
begin
 select mfd_mcp.safe_num(e->'kg') into latest from jsonb_array_elements(case when jsonb_typeof(doc->'weights')='array' then doc->'weights' else '[]' end) e
  where mfd_mcp.safe_num(e->'kg')>0 order by e->>'date' desc limit 1;
 return jsonb_build_object(
  'goal', case when p->>'goal' ~* 'lose|loss' then 'lose' when p->>'goal' ~* 'gain|muscle' then 'gain' when p->>'goal' ~* 'recomp' then 'recomp' else 'maintain' end,
  'activity', case when act in ('sedentary','light','moderate','very','extra') then act
   else case mfd_mcp.safe_num(p->'activity') when 1.2 then 'sedentary' when 1.375 then 'light' when 1.725 then 'very' when 1.9 then 'extra' else 'moderate' end end,
  'training_days', coalesce(nullif(mfd_mcp.safe_num(p->'days'),0),3),
  'target_weight_kg', coalesce(nullif(mfd_mcp.safe_num(p->'target'),0),nullif(mfd_mcp.safe_num(p->'weight'),0),68),
  'height_cm', coalesce(nullif(mfd_mcp.safe_num(p->'height'),0),175),
  'age', coalesce(nullif(mfd_mcp.safe_num(p->'age'),0),26),
  'water_goal_ml', case when mfd_mcp.safe_num(p->'waterGoalMl') between 250 and 10000 then mfd_mcp.safe_num(p->'waterGoalMl') else 2500 end,
  'weight_unit', case when s->>'weightUnit'='lb' then 'lb' else 'kg' end,
  'energy_unit', case when s->>'energyUnit'='kJ' then 'kJ' else 'kcal' end,
  'length_unit', case when s->>'lengthUnit'='in' then 'in' else 'cm' end,
  'default_rest_seconds', coalesce(mfd_mcp.safe_num(s->'defaultRestSec'),90),
  -- Not changeable here; used for the targets and the target-weight limits.
  '_sex', case when p->>'sex'='female' then 'female' else 'male' end,
  '_weight_kg', coalesce(nullif(mfd_mcp.safe_num(p->'weight'),0),68),
  '_current_kg', coalesce(latest,nullif(mfd_mcp.safe_num(p->'weight'),0),68));
end $$;

create or replace function mfd_mcp.change_settings(args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w record; doc jsonb; cur jsonb; nxt jsonb; req jsonb := '{}'; changes jsonb := '{}'; k text; v jsonb; n numeric; tok uuid; pend record;
 t_from jsonb; t_to jsonb; p jsonb; s jsonb; rev bigint; id text := gen_random_uuid()::text; target_kg numeric; height numeric;
 fields constant text[] := array['goal','activity','training_days','target_weight_kg','height_cm','age','water_goal_ml','weight_unit','energy_unit','length_unit','default_rest_seconds'];
begin
 select * into w from mfd_mcp.ai_writer('log_settings', args);
 -- The requested values, checked against the safe limits.
 foreach k in array fields loop
  if not args ? k then continue; end if;
  v := args->k; n := mfd_mcp.safe_num(v);
  if (k='goal' and coalesce(v#>>'{}','') not in ('lose','maintain','gain','recomp'))
   or (k='activity' and coalesce(v#>>'{}','') not in ('sedentary','light','moderate','very','extra'))
   or (k='weight_unit' and coalesce(v#>>'{}','') not in ('kg','lb')) or (k='energy_unit' and coalesce(v#>>'{}','') not in ('kcal','kJ'))
   or (k='length_unit' and coalesce(v#>>'{}','') not in ('cm','in'))
   or (k='training_days' and (n is null or n<>trunc(n) or n not between 1 and 7))
   or (k='target_weight_kg' and (n is null or n not between 30 and 300))
   or (k='height_cm' and (n is null or n not between 120 and 230))
   or (k='age' and (n is null or n<>trunc(n) or n not between 13 and 100))
   or (k='water_goal_ml' and (n is null or n<>trunc(n) or n not between 1000 and 6000))
   or (k='default_rest_seconds' and (n is null or n<>trunc(n) or n not between 15 and 600)) then
   raise exception 'Invalid % (see the limits in the tool description)', k using errcode='22023'; end if;
  req := req||jsonb_build_object(k,case when k in ('target_weight_kg','height_cm') then to_jsonb(round(n,1)) when n is not null and k not in ('goal','activity','weight_unit','energy_unit','length_unit') then to_jsonb(n) else v end);
 end loop;
 if req='{}' then raise exception 'Nothing to change' using errcode='22023'; end if;
 if args ? 'confirm_token' and (jsonb_typeof(args->'confirm_token') is distinct from 'string' or args->>'confirm_token' !~ '^[0-9a-f-]{36}$') then
  raise exception 'Invalid confirm_token' using errcode='22023'; end if;

 doc := case when args ? 'confirm_token' then mfd_mcp.ai_doc(w.u) else (select payload from public.forma_workspaces where user_id=w.u) end;
 if doc is null then raise exception 'Open the diary app once before changing settings' using errcode='22023'; end if;
 cur := mfd_mcp.settings_now(doc); nxt := cur||req;
 for k in select key from jsonb_each(req) loop
  if cur->k is distinct from req->k then changes := changes||jsonb_build_object(k,jsonb_build_object('from',cur->k,'to',req->k)); end if;
 end loop;
 if changes='{}' then return jsonb_build_object('unchanged',true,'note','These are already the user''s settings.'); end if;
 -- Target weight: within 25% of the current weight, and a BMI of at least 18.5 at the (new) height.
 if changes ? 'target_weight_kg' or changes ? 'height_cm' then
  target_kg := (nxt->>'target_weight_kg')::numeric; height := (nxt->>'height_cm')::numeric/100;
  if changes ? 'target_weight_kg' and abs(target_kg-(cur->>'_current_kg')::numeric)>0.25*(cur->>'_current_kg')::numeric then
   raise exception 'A target weight must be within 25%% of the current weight (% kg)', trim_scale(round((cur->>'_current_kg')::numeric,1)) using errcode='22023'; end if;
  if target_kg/(height*height)<18.5 then
   raise exception 'That target weight is below a healthy minimum for % cm (at least % kg)', round(height*100), ceil(18.5*height*height) using errcode='22023'; end if;
 end if;
 if changes ?| array['goal','activity','height_cm','age'] then
  t_from := mfd_mcp.targets(cur->>'_sex',(cur->>'_weight_kg')::numeric,(cur->>'height_cm')::numeric,(cur->>'age')::numeric,cur->>'activity',cur->>'goal');
  t_to := mfd_mcp.targets(nxt->>'_sex',(nxt->>'_weight_kg')::numeric,(nxt->>'height_cm')::numeric,(nxt->>'age')::numeric,nxt->>'activity',nxt->>'goal');
 end if;

 if not args ? 'confirm_token' then
  -- Step 1: nothing is saved. The user must see this and say yes first.
  delete from mfd_mcp.pending_changes where created_at<now()-interval '10 minutes' or (user_id=w.u and connection=w.conn);
  insert into mfd_mcp.pending_changes(user_id,connection,request) values(w.u,w.conn,req) returning token into tok;
  return jsonb_strip_nulls(jsonb_build_object('saved',false,'confirm_token',tok,'changes',changes,
   'daily_targets',case when t_from is not null then jsonb_build_object('from',t_from,'to',t_to) end,
   'note','Nothing is saved yet. Show the user exactly these changes (and the new daily targets) and ask for a clear yes. Only after they agree, call change_settings again with the same values and this confirm_token (valid for 10 minutes). If they want something different, start again without a token.'));
 end if;

 -- Step 2: the same values the user saw, within 10 minutes, once.
 delete from mfd_mcp.pending_changes where token=(args->>'confirm_token')::uuid and user_id=w.u and connection=w.conn
  and created_at>now()-interval '10 minutes' returning * into pend;
 if not found then raise exception 'This confirmation expired or was already used. Show the change to the user again (call without confirm_token).' using errcode='22023'; end if;
 if pend.request is distinct from req then raise exception 'The values differ from what the user confirmed. Show the change to the user again (call without confirm_token).' using errcode='22023'; end if;
 perform mfd_mcp.ai_count(w.u, w.conn, w.today);
 p := doc->'profile'; s := case when jsonb_typeof(doc->'mfdSettings')='object' then doc->'mfdSettings' else '{}' end;
 for k in select key from jsonb_each(changes) loop
  v := nxt->k;
  case k
   when 'goal' then p := p||jsonb_build_object('goal',case v#>>'{}' when 'lose' then 'Fat loss' when 'gain' then 'Build muscle' when 'recomp' then 'Recomposition' else 'Maintain' end);
   when 'activity' then p := p||jsonb_build_object('activity',case v#>>'{}' when 'sedentary' then 1.2 when 'light' then 1.375 when 'very' then 1.725 when 'extra' then 1.9 else 1.55 end);
   when 'training_days' then p := p||jsonb_build_object('days',v);
   when 'target_weight_kg' then p := p||jsonb_build_object('target',v);
   when 'height_cm' then p := p||jsonb_build_object('height',v);
   when 'age' then p := p||jsonb_build_object('age',v);
   when 'water_goal_ml' then p := p||jsonb_build_object('waterGoalMl',v);
   when 'weight_unit' then s := s||jsonb_build_object('weightUnit',v);
   when 'energy_unit' then s := s||jsonb_build_object('energyUnit',v);
   when 'length_unit' then s := s||jsonb_build_object('lengthUnit',v);
   when 'default_rest_seconds' then s := s||jsonb_build_object('defaultRestSec',v);
  end case;
 end loop;
 -- The stored targets follow, as when the app saves the profile.
 if t_to is not null then p := p||jsonb_build_object('cal',t_to->'kcal','protein',t_to->'protein_g','carbs',t_to->'carbs_g','fat',t_to->'fat_g'); end if;
 doc := jsonb_set(jsonb_set(doc,'{profile}',p),'{mfdSettings}',s);
 rev := mfd_mcp.ai_save(w.u, doc, jsonb_build_object('id',id,'kind','settings','changes',changes,'addedBy',mfd_mcp.ai_by(w.conn,args->>'request_id')));
 return jsonb_strip_nulls(jsonb_build_object('saved',true,'id',id,'revision',rev,'changes',changes,'daily_targets',t_to,
  'note','Saved. The user can undo it in the app (AI assistants).'));
end $$;
revoke all on function mfd_mcp.change_settings(jsonb) from public,anon;
grant execute on function mfd_mcp.change_settings(jsonb) to authenticated;

-- Route the AI-only operations; everything else still goes to mfd_mcp.dispatch unchanged.
create or replace function public.mfd_mcp(operation text,args jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
 select case
  when operation='suggest_workout_targets' then mfd_mcp.suggest(args)
  when operation='start_workout' then mfd_mcp.start_workout(args)
  when operation='recovery' then mfd_mcp.recovery(args)
  when operation='workouts' then mfd_mcp.workouts_out(mfd_mcp.dispatch(operation,args))
  when operation='routines' then mfd_mcp.routines_out(mfd_mcp.dispatch(operation,args))
  when operation='create_routine' and (args ? 'folder' or args ? 'create_folder') then mfd_mcp.create_routine_in(args)
  when operation='log_water' then mfd_mcp.log_water(args)
  when operation='log_measurements' then mfd_mcp.log_measurements(args)
  when operation='move_routine' then mfd_mcp.move_routine(args)
  when operation='change_settings' then mfd_mcp.change_settings(args)
  else mfd_mcp.dispatch(operation,args) end
$$;
revoke all on function public.mfd_mcp(text,jsonb) from public,anon;
grant execute on function public.mfd_mcp(text,jsonb) to authenticated;
commit;
