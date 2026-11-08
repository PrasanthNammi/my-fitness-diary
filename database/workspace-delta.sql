-- Delta sync (workspace v3). See database/DELTA_SYNC.md. Safe to re-run.
-- The JavaScript twins of workspace_diff / workspace_apply / workspace_compact are in
-- public/legacy/workspace-ops.js; tests/workspace-ops-equivalence.cjs proves they agree.
-- Running this file changes no stored diary: compaction of existing diaries is a separate,
-- verified migration (database/workspace-compact-migration.sql). New writes are stored compact.

-- ---- Change operations ------------------------------------------------------------------------
create or replace function mfd_private.workspace_keyed(list jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(list)='array'
  and not exists(select 1 from jsonb_array_elements(list) e where jsonb_typeof(e)<>'object' or jsonb_typeof(e->'id') is null or jsonb_typeof(e->'id') in('null','object','array'))
  and (select count(distinct e->'id')=count(*) from jsonb_array_elements(list) e)$$;

-- Operations that turn a into b. Applying them to a gives b (jsonb equality).
-- Lists are compared with one join on item ids, so every item is read once.
create or replace function mfd_private.workspace_diff(a jsonb,b jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text;x jsonb;y jsonb;ops jsonb:='[]';part jsonb;
begin
 a:=coalesce(a,'{}');b:=coalesce(b,'{}');
 for k in select key from(select jsonb_object_keys(a) key union select jsonb_object_keys(b))s order by key collate "C" loop
  if not b ? k then ops:=ops||jsonb_build_array(jsonb_build_object('k',k,'d',true));continue;end if;
  if not a ? k then ops:=ops||jsonb_build_array(jsonb_build_object('k',k,'v',b->k));continue;end if;
  x:=a->k;y:=b->k;
  if x=y then continue;end if;
  if mfd_private.workspace_keyed(x) and mfd_private.workspace_keyed(y) then
   with xa as materialized(select e,e->'id' id,n from jsonb_array_elements(x) with ordinality t(e,n)),
        ya as materialized(select e,e->'id' id,n from jsonb_array_elements(y) with ordinality t(e,n)),
        gone as(select xa.id,xa.n from xa left join ya using(id) where ya.id is null),
        put as(select ya.id,ya.e,ya.n from ya left join xa using(id) where xa.id is null or xa.e<>ya.e),
        sim as(select coalesce((select jsonb_agg(xa.id order by xa.n) from xa join ya using(id)),'[]')
                    ||coalesce((select jsonb_agg(ya.id order by ya.n) from ya left join xa using(id) where xa.id is null),'[]') ids),
        tgt as(select coalesce(jsonb_agg(id order by n),'[]') ids from ya)
   select coalesce((select jsonb_agg(jsonb_build_object('k',k,'i',id,'d',true) order by n) from gone),'[]')
        ||coalesce((select jsonb_agg(jsonb_build_object('k',k,'i',id,'v',e) order by n) from put),'[]')
        ||case when (select ids from sim)<>(select ids from tgt) then jsonb_build_array(jsonb_build_object('k',k,'o',(select ids from tgt))) else '[]' end
   into part;
   ops:=ops||part;
  else ops:=ops||jsonb_build_array(jsonb_build_object('k',k,'v',y));end if;
 end loop;
 return ops;
end$$;

-- Applies operations. Raises 22023 when one doesn't fit; callers then fall back to a full copy.
create or replace function mfd_private.workspace_apply(doc jsonb,ops jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare op jsonb;k text;items jsonb;idx bigint;len int;found int;sorted jsonb;
begin
 if jsonb_typeof(doc) is distinct from 'object' then raise exception 'Workspace is not an object' using errcode='22023';end if;
 if jsonb_typeof(ops) is distinct from 'array' then raise exception 'Changes must be a list' using errcode='22023';end if;
 for op in select e from jsonb_array_elements(ops) with ordinality t(e,n) order by n loop
  if jsonb_typeof(op) is distinct from 'object' or jsonb_typeof(op->'k') is distinct from 'string' then raise exception 'Invalid change' using errcode='22023';end if;
  k:=op->>'k';
  if op ? 'o' then
   items:=doc->k;
   if jsonb_typeof(items) is distinct from 'array' then raise exception 'Not a list: %',k using errcode='22023';end if;
   len:=jsonb_array_length(items);
   if jsonb_typeof(op->'o') is distinct from 'array' or jsonb_array_length(op->'o')<>len
     or(select count(distinct e->'id') from jsonb_array_elements(items) e)<>len
     or(select count(distinct e) from jsonb_array_elements(op->'o') e)<>len then raise exception 'Order does not match %',k using errcode='22023';end if;
   select count(m.item),coalesce(jsonb_agg(m.item order by o.n),'[]') into found,sorted from jsonb_array_elements(op->'o') with ordinality o(id,n)
    left join(select e->'id' id,e item from jsonb_array_elements(items) e) m on m.id=o.id;
   if found<>len then raise exception 'Order does not match %',k using errcode='22023';end if;
   doc:=jsonb_set(doc,array[k],sorted);
  elsif op ? 'i' then
   items:=doc->k;
   if jsonb_typeof(items) is distinct from 'array' then raise exception 'Not a list: %',k using errcode='22023';end if;
   select n-1 into idx from jsonb_array_elements(items) with ordinality t(e,n) where jsonb_typeof(e)='object' and e->'id'=op->'i' order by n limit 1;
   if op->'d'='true'::jsonb then
    if idx is null then raise exception 'Missing item in %',k using errcode='22023';end if;
    doc:=jsonb_set(doc,array[k],(select coalesce(jsonb_agg(e order by n),'[]') from jsonb_array_elements(items) with ordinality t(e,n) where n-1<>idx));
   elsif op ? 'v' then
    if jsonb_typeof(op->'v') is distinct from 'object' or (op->'v'->'id') is distinct from (op->'i') then raise exception 'Item id mismatch in %',k using errcode='22023';end if;
    if idx is null then doc:=jsonb_set(doc,array[k],items||jsonb_build_array(op->'v'));
    else doc:=jsonb_set(doc,array[k,idx::text],op->'v');end if;
   else raise exception 'Invalid change' using errcode='22023';end if;
  elsif op->'d'='true'::jsonb then doc:=doc-k;
  elsif op ? 'v' then doc:=doc||jsonb_build_object(k,op->'v');
  else raise exception 'Invalid change' using errcode='22023';end if;
 end loop;
 return doc;
end$$;

-- ---- Compaction v1 ------------------------------------------------------------------------------
-- Fast path: a list with no removable empty field is returned as it is (checked in C by jsonpath).
create or replace function mfd_private.workspace_compact_sets(sets jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when jsonb_typeof(sets) is distinct from 'array' then sets
  when not jsonb_path_exists(sets,'$[*] ? (@.floors == null || @.steps == null || @.custom_metric == null || @.rpe == null || @.distance_meters == null || @.duration_seconds == null || @.superset_id == null)') then sets
  else
  (select coalesce(jsonb_agg(case when jsonb_typeof(s)='object' then s-(select coalesce(array_agg(f),'{}'::text[]) from unnest(array['floors','steps','custom_metric','rpe','distance_meters','duration_seconds','superset_id']) f where s->f='null'::jsonb) else s end order by n),'[]')
   from jsonb_array_elements(sets) with ordinality t(s,n)) end$$;

-- Compact document plus the raw import rows moved out of it ({session id: rows}). Set-based:
-- linear in the size of the diary (a loop that appends one item at a time copies the list each time).
create or replace function mfd_private.workspace_compact(doc jsonb,out document jsonb,out imports jsonb) language plpgsql immutable set search_path='' as $$
declare sessions jsonb;routines jsonb;
begin
 document:=doc;imports:='{}';
 if jsonb_typeof(doc) is distinct from 'object' then return;end if;
 -- Lists with nothing to compact or move are kept as they are (one compiled jsonpath scan).
 if jsonb_typeof(doc->'sessions')='array' and jsonb_path_exists(doc->'sessions','lax $[*] ? (exists(@.hevyRows) || exists(@.sets[*] ? (@.floors == null || @.steps == null || @.custom_metric == null || @.rpe == null || @.distance_meters == null || @.duration_seconds == null || @.superset_id == null)))') then
  select coalesce(jsonb_agg(case when jsonb_typeof(e)<>'object' then e
           else (case when has_rows and (null_rows or movable) then e-'hevyRows' else e end)
                ||case when e ? 'sets' then jsonb_build_object('sets',mfd_private.workspace_compact_sets(e->'sets')) else '{}'::jsonb end end order by n),'[]'),
         coalesce(jsonb_object_agg(e->>'id',e->'hevyRows' order by n) filter(where has_rows and not null_rows and movable),'{}')
   into sessions,imports
   from(select n,e,jsonb_typeof(e)='object' and e ? 'hevyRows' has_rows,jsonb_typeof(e->'hevyRows')='null' null_rows,jsonb_typeof(e->'id') in('string','number','boolean') movable
        from jsonb_array_elements(doc->'sessions') with ordinality t(e,n)) x;
  document:=jsonb_set(document,'{sessions}',sessions);
 end if;
 if jsonb_typeof(doc->'routines')='array' and jsonb_path_exists(doc->'routines','lax $[*].exercises[*].setDetails[*] ? (@.floors == null || @.steps == null || @.custom_metric == null || @.rpe == null || @.distance_meters == null || @.duration_seconds == null || @.superset_id == null)') then
  select coalesce(jsonb_agg(case when jsonb_typeof(r)='object' and jsonb_typeof(r->'exercises')='array' then
           jsonb_set(r,'{exercises}',(select coalesce(jsonb_agg(case when jsonb_typeof(e)='object' and e ? 'setDetails' then jsonb_set(e,'{setDetails}',mfd_private.workspace_compact_sets(e->'setDetails')) else e end order by m),'[]')
                                     from jsonb_array_elements(r->'exercises') with ordinality u(e,m)))
           else r end order by n),'[]')
   into routines from jsonb_array_elements(doc->'routines') with ordinality t(r,n);
  document:=jsonb_set(document,'{routines}',routines);
 end if;
 if jsonb_typeof(doc->'active')='object' and doc->'active' ? 'sets' then
  document:=jsonb_set(document,'{active,sets}',mfd_private.workspace_compact_sets(doc->'active'->'sets'));
 end if;
end$$;

-- ---- Raw import rows ----------------------------------------------------------------------------
create table if not exists public.forma_import_rows(
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id text not null,
 rows jsonb not null,
 stored_at timestamptz not null default now(),
 primary key(user_id,session_id));
alter table public.forma_import_rows enable row level security;
revoke all on public.forma_import_rows from anon,authenticated;
grant select on public.forma_import_rows to authenticated;
drop policy if exists import_rows_read on public.forma_import_rows;
create policy import_rows_read on public.forma_import_rows for select to authenticated using(user_id=(select auth.uid()));

-- The phone files rows of a new Hevy import here before the workouts sync.
create or replace function public.forma_put_import_rows(rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();n integer;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501';end if;
 if jsonb_typeof(rows) is distinct from 'object' or octet_length(rows::text)>8000000 then raise exception 'Invalid import rows' using errcode='22023';end if;
 insert into public.forma_import_rows(user_id,session_id,rows) select v_user,key,value from jsonb_each(rows) where jsonb_typeof(value)<>'null'
  on conflict(user_id,session_id) do update set rows=excluded.rows,stored_at=now();
 get diagnostics n=row_count;return n;
end$$;
revoke all on function public.forma_put_import_rows(jsonb) from public,anon;
grant execute on function public.forma_put_import_rows(jsonb) to authenticated;

-- ---- Change log ---------------------------------------------------------------------------------
create table if not exists public.forma_workspace_changes(
 user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null,
 ops jsonb not null,
 at timestamptz not null default now(),
 primary key(user_id,revision));
create index if not exists forma_workspace_changes_at on public.forma_workspace_changes(at);
alter table public.forma_workspace_changes enable row level security;
revoke all on public.forma_workspace_changes from anon,authenticated;
grant select on public.forma_workspace_changes to authenticated;
drop policy if exists workspace_changes_read on public.forma_workspace_changes;
create policy workspace_changes_read on public.forma_workspace_changes for select to authenticated using(user_id=(select auth.uid()));

-- Every writer: store compact, move raw import rows out, and raise the revision on any change.
create or replace function mfd_private.workspace_before_write() returns trigger language plpgsql security definer set search_path='' as $$
declare c record;part jsonb;
begin
 if tg_op='UPDATE' and new.payload is not distinct from old.payload then return new;end if;
 if tg_op='UPDATE' then
  -- Unchanged parts are copied from the stored (already compact) version and skipped.
  part:=new.payload;
  if part->'sessions' is not distinct from old.payload->'sessions' then part:=part-'sessions';end if;
  if part->'routines' is not distinct from old.payload->'routines' then part:=part-'routines';end if;
  if part->'active' is not distinct from old.payload->'active' then part:=part-'active';end if;
  select * into c from mfd_private.workspace_compact(part);
  -- Usually nothing needed compacting: keep the document as written (no 2 MB reassembly).
  if c.document is distinct from part then
   part:=c.document;
   if new.payload ? 'sessions' and not part ? 'sessions' then part:=part||jsonb_build_object('sessions',old.payload->'sessions');end if;
   if new.payload ? 'routines' and not part ? 'routines' then part:=part||jsonb_build_object('routines',old.payload->'routines');end if;
   if new.payload ? 'active' and not part ? 'active' then part:=part||jsonb_build_object('active',old.payload->'active');end if;
   new.payload:=part;
  end if;
 else
  select * into c from mfd_private.workspace_compact(new.payload);
  new.payload:=c.document;
 end if;
 if c.imports<>'{}'::jsonb then
  insert into public.forma_import_rows(user_id,session_id,rows) select new.user_id,key,value from jsonb_each(c.imports)
   on conflict(user_id,session_id) do update set rows=excluded.rows,stored_at=now();
 end if;
 if tg_op='UPDATE' and new.payload is distinct from old.payload and new.revision<=old.revision then new.revision:=old.revision+1;end if;
 return new;
end$$;
drop trigger if exists forma_workspace_before_write on public.forma_workspaces;
create trigger forma_workspace_before_write before insert or update on public.forma_workspaces for each row execute function mfd_private.workspace_before_write();

-- Every new revision gets its change record, whoever wrote it.
create or replace function mfd_private.workspace_log_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.revision>old.revision then
  insert into public.forma_workspace_changes(user_id,revision,ops) values(new.user_id,new.revision,mfd_private.workspace_diff(old.payload,new.payload))
   on conflict(user_id,revision) do update set ops=excluded.ops,at=now();
 end if;
 return null;
end$$;
drop trigger if exists forma_workspace_log_change on public.forma_workspaces;
create trigger forma_workspace_log_change after update on public.forma_workspaces for each row execute function mfd_private.workspace_log_change();
revoke all on function mfd_private.workspace_before_write(),mfd_private.workspace_log_change() from public,anon,authenticated;

-- ---- Phone API ----------------------------------------------------------------------------------
-- What changed since a revision. One consistent snapshot (STABLE). Never returns the diary itself.
create or replace function public.forma_workspace_pull(since_revision bigint) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_user uuid:=auth.uid();cur bigint;size_doc int;n bigint;changes jsonb;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501';end if;
 select revision,pg_column_size(payload) into cur,size_doc from public.forma_workspaces where user_id=v_user;
 if cur is null then return jsonb_build_object('revision',0,'full',true);end if;
 if since_revision is null or since_revision<1 or since_revision>cur then return jsonb_build_object('revision',cur,'full',true);end if;
 if since_revision=cur then return jsonb_build_object('revision',cur);end if;
 select count(*),coalesce(jsonb_agg(jsonb_build_object('revision',revision,'ops',ops) order by revision),'[]') into n,changes
  from public.forma_workspace_changes where user_id=v_user and revision>since_revision and revision<=cur;
 -- Incomplete history, or changes bigger than the diary itself: a full copy is better.
 if n<>cur-since_revision or pg_column_size(changes)>size_doc then return jsonb_build_object('revision',cur,'full',true);end if;
 return jsonb_build_object('revision',cur,'changes',changes);
end$$;
revoke all on function public.forma_workspace_pull(bigint) from public,anon;
grant execute on function public.forma_workspace_pull(bigint) to authenticated;

-- Save only the changes. Compare-and-swap like forma_save_workspace_v2. SECURITY DEFINER only to
-- reach the private apply helper; every statement is limited to the caller's own row (auth.uid()).
create or replace function public.forma_save_workspace_patch(ops jsonb,expected_revision bigint) returns table(saved_revision bigint,conflict boolean,adjusted boolean) language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();cur bigint;doc jsonb;next jsonb;rev bigint;stored jsonb;started timestamptz:=clock_timestamp();
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501';end if;
 if jsonb_typeof(ops) is distinct from 'array' or octet_length(ops::text)>8000000 then raise exception 'Invalid changes' using errcode='22023';end if;
 if expected_revision is null or expected_revision<1 then raise exception 'Invalid revision' using errcode='22023';end if;
 select revision,payload into cur,doc from public.forma_workspaces where user_id=v_user for update;
 if cur is null or cur<>expected_revision then
  perform mfd_observability.record_sync('conflict',extract(epoch from clock_timestamp()-started)::double precision);
  return query select null::bigint,true,false;return;
 end if;
 next:=mfd_private.workspace_apply(doc,ops);
 if jsonb_typeof(next->'profile') is distinct from 'object' or exists(select 1 from unnest(array['meals','weights','sessions','routines','checkins','chat']) l where jsonb_typeof(next->l) is distinct from 'array')
 then raise exception 'Invalid workspace document' using errcode='22023';end if;
 update public.forma_workspaces set payload=next,revision=revision+1,updated_at=now() where user_id=v_user returning revision,payload into rev,stored;
 perform mfd_observability.record_sync('saved',extract(epoch from clock_timestamp()-started)::double precision);
 return query select rev,false,stored is distinct from next;
end$$;
revoke all on function public.forma_save_workspace_patch(jsonb,bigint) from public,anon;
grant execute on function public.forma_save_workspace_patch(jsonb,bigint) to authenticated;

-- Change records are needed only until phones catch up; phones further behind download in full.
select cron.schedule('forma-workspace-changes-cleanup','23 3 * * *',$$delete from public.forma_workspace_changes where at<now()-interval '30 days'$$);
notify pgrst,'reload schema';
