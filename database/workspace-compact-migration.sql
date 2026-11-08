-- One-time compaction of existing diaries (after database/workspace-delta.sql). All or nothing:
-- 1. copies every diary to mfd_private.workspaces_before_compaction (kept; drop it manually later),
-- 2. stores every diary compact (the write trigger removes the listed null set fields and moves
--    hevyRows to public.forma_import_rows),
-- 3. verifies every account independently of the compaction code. Any difference raises an error
--    and the whole transaction rolls back, leaving everything as it was.
-- Run it as one statement batch (Supabase SQL editor runs the file in one transaction).
begin;
lock table public.forma_workspaces in exclusive mode;-- no saves during the few seconds this takes

create table if not exists mfd_private.workspaces_before_compaction(user_id uuid primary key,payload jsonb not null,revision bigint not null,copied_at timestamptz not null default now());
-- A previous copy is never overwritten.
insert into mfd_private.workspaces_before_compaction(user_id,payload,revision) select user_id,payload,revision from public.forma_workspaces on conflict(user_id) do nothing;
alter table mfd_private.workspaces_before_compaction enable row level security;-- no policies: owner only
revoke all on mfd_private.workspaces_before_compaction from public,anon,authenticated;

-- Raw rows first (from the original diaries), then the compact diaries. The write trigger raises
-- each revision and records the change.
insert into public.forma_import_rows(user_id,session_id,rows)
 select w.user_id,i.key,i.value from public.forma_workspaces w cross join lateral mfd_private.workspace_compact(w.payload) c cross join lateral jsonb_each(c.imports) i
 on conflict(user_id,session_id) do update set rows=excluded.rows,stored_at=now();
update public.forma_workspaces w set payload=c.document from(select user_id,(mfd_private.workspace_compact(payload)).document from public.forma_workspaces) c
 where c.user_id=w.user_id and c.document is distinct from w.payload;

do $$declare
 fields text[]:=array['floors','steps','custom_metric','rpe','distance_meters','duration_seconds','superset_id'];
 bad int;checked int;rows_checked int;
begin
 -- Every account: the same top-level keys, and every key except sessions/routines/active identical.
 select count(*) into bad from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id)
  where (w.payload is distinct from b.payload and w.revision<>b.revision+1) or (w.payload=b.payload and w.revision<>b.revision);
 if bad>0 then raise exception 'Compaction check: % diaries have an unexpected revision',bad;end if;
 select count(*) into bad from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id),jsonb_each(b.payload) k
  where k.key not in('sessions','routines','active') and w.payload->k.key is distinct from k.value;
 if bad>0 then raise exception 'Compaction check: % top-level values changed',bad;end if;
 select count(*) into bad from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id)
  where (select array_agg(k order by k) from jsonb_object_keys(b.payload) k) is distinct from (select array_agg(k order by k) from jsonb_object_keys(w.payload) k);
 if bad>0 then raise exception 'Compaction check: % diaries lost or gained keys',bad;end if;

 -- Workouts: same ids in the same order; every field other than sets/hevyRows identical.
 select count(*) into bad from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id)
  where (select jsonb_agg(e->'id' order by n) from jsonb_array_elements(coalesce(b.payload->'sessions','[]')) with ordinality t(e,n))
   is distinct from (select jsonb_agg(e->'id' order by n) from jsonb_array_elements(coalesce(w.payload->'sessions','[]')) with ordinality t(e,n));
 if bad>0 then raise exception 'Compaction check: workout list changed in % diaries',bad;end if;
 select count(*) into bad from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id),
  jsonb_array_elements(coalesce(b.payload->'sessions','[]')) with ordinality bs(s,n)
  where (bs.s-'sets'-'hevyRows') is distinct from ((w.payload->'sessions'->(n::int-1))-'sets'-'hevyRows');
 if bad>0 then raise exception 'Compaction check: % workouts changed outside their sets',bad;end if;

 -- Sets: every set, in order, equals the original minus only the listed fields that were null.
 select count(*),count(*) filter(where
   (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(bs.st) where not(value='null'::jsonb and key=any(fields)))
   is distinct from (w.payload->'sessions'->(ses.n::int-1)->'sets'->(bs.m::int-1)))
  into checked,bad
  from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id),
   jsonb_array_elements(coalesce(b.payload->'sessions','[]')) with ordinality ses(s,n),
   jsonb_array_elements(case when jsonb_typeof(ses.s->'sets')='array' then ses.s->'sets' else '[]' end) with ordinality bs(st,m);
 if bad>0 then raise exception 'Compaction check: % of % sets differ beyond removed empty fields',bad,checked;end if;
 select count(*) into bad from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id),
  jsonb_array_elements(coalesce(b.payload->'sessions','[]')) with ordinality ses(s,n)
  where jsonb_typeof(ses.s->'sets')='array' and jsonb_array_length(ses.s->'sets')<>jsonb_array_length(w.payload->'sessions'->(ses.n::int-1)->'sets');
 if bad>0 then raise exception 'Compaction check: set counts changed in % workouts',bad;end if;

 -- Routines and an open workout: same check on their sets.
 select count(*) into bad from public.forma_workspaces w join mfd_private.workspaces_before_compaction b using(user_id),
  jsonb_array_elements(coalesce(b.payload->'routines','[]')) with ordinality r(rt,n)
  where (select jsonb_agg(case when jsonb_typeof(e)='object' and jsonb_typeof(e->'setDetails')='array' then e-'setDetails' else e end order by m) from jsonb_array_elements(case when jsonb_typeof(r.rt->'exercises')='array' then r.rt->'exercises' else '[]' end) with ordinality x(e,m))
   is distinct from (select jsonb_agg(case when jsonb_typeof(e)='object' and jsonb_typeof(e->'setDetails')='array' then e-'setDetails' else e end order by m) from jsonb_array_elements(case when jsonb_typeof(w.payload->'routines'->(r.n::int-1)->'exercises')='array' then w.payload->'routines'->(r.n::int-1)->'exercises' else '[]' end) with ordinality x(e,m));
 if bad>0 then raise exception 'Compaction check: % routines changed',bad;end if;

 -- Raw import rows: every non-null hevyRows is in forma_import_rows, byte for byte.
 select count(*),count(*) filter(where i.rows is distinct from ses.s->'hevyRows') into rows_checked,bad
  from mfd_private.workspaces_before_compaction b cross join lateral jsonb_array_elements(coalesce(b.payload->'sessions','[]')) ses(s)
  left join public.forma_import_rows i on i.user_id=b.user_id and i.session_id=ses.s->>'id'
  where jsonb_typeof(ses.s->'hevyRows') not in('null') and ses.s ? 'hevyRows';
 if bad>0 then raise exception 'Compaction check: % of % import row sets missing or different',bad,rows_checked;end if;
 select count(*) into bad from public.forma_workspaces w,jsonb_array_elements(coalesce(w.payload->'sessions','[]')) s(x) where x ? 'hevyRows' and jsonb_typeof(x->'id') in('string','number','boolean');
 if bad>0 then raise exception 'Compaction check: % workouts still carry import rows',bad;end if;

 raise notice 'Compaction verified: % sets and % import row sets across % diaries',checked,rows_checked,(select count(*) from public.forma_workspaces);
end$$;
commit;
