-- Ordinary CAS conflicts are outcomes, never serialization failures.
create schema if not exists mfd_observability;
revoke all on schema mfd_observability from public,anon,authenticated;
grant usage on schema mfd_observability to authenticated,service_role;
create table if not exists mfd_observability.sync_totals (
 outcome text primary key check(outcome in ('saved','conflict')),
 total bigint not null default 0,
 seconds_total double precision not null default 0,
 last_at timestamptz
);
alter table mfd_observability.sync_totals enable row level security;
revoke all on mfd_observability.sync_totals from public,anon,authenticated;
grant select on mfd_observability.sync_totals to service_role;
insert into mfd_observability.sync_totals(outcome) values('saved'),('conflict') on conflict do nothing;
-- Narrow privileged helper: no workspace access, no user-controlled labels or payloads.
create or replace function mfd_observability.record_sync(outcome text, elapsed double precision)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if outcome not in ('saved','conflict') or elapsed<0 or elapsed>600 then raise exception 'Invalid metric'; end if;
 update mfd_observability.sync_totals t set total=t.total+1,seconds_total=t.seconds_total+elapsed,last_at=clock_timestamp() where t.outcome=record_sync.outcome;
end $$;
revoke all on function mfd_observability.record_sync(text,double precision) from public,anon;
grant execute on function mfd_observability.record_sync(text,double precision) to authenticated;
create or replace function public.forma_save_workspace_v2(document jsonb,expected_revision bigint)
returns table(saved_revision bigint,saved_at timestamptz,conflict boolean)
language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_revision bigint; v_at timestamptz; started timestamptz:=clock_timestamp();
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if jsonb_typeof(document) is distinct from 'object' or octet_length(document::text)>8000000 then raise exception 'Invalid workspace document' using errcode='22023'; end if;
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid revision' using errcode='22023'; end if;
 if expected_revision=0 then
  insert into public.forma_workspaces(user_id,payload) values(v_user,document) on conflict(user_id) do nothing returning revision,updated_at into v_revision,v_at;
 else
  update public.forma_workspaces set payload=document,revision=revision+1,updated_at=now() where user_id=v_user and revision=expected_revision returning revision,updated_at into v_revision,v_at;
 end if;
 perform mfd_observability.record_sync(case when v_revision is null then 'conflict' else 'saved' end,extract(epoch from clock_timestamp()-started)::double precision);
 return query select v_revision,v_at,v_revision is null;
end $$;
revoke all on function public.forma_save_workspace_v2(jsonb,bigint) from public,anon;
grant execute on function public.forma_save_workspace_v2(jsonb,bigint) to authenticated;
create or replace function public.mfd_prometheus_metrics()
returns text language sql security invoker set search_path='' as $$
 select '# TYPE mfd_sync_operations_total counter'||chr(10)||
 coalesce((select string_agg('mfd_sync_operations_total{outcome="'||outcome||'"} '||total,chr(10)) from mfd_observability.sync_totals),'')||chr(10)||
 '# TYPE mfd_sync_duration_seconds_sum counter'||chr(10)||
 coalesce((select 'mfd_sync_duration_seconds_sum '||sum(seconds_total) from mfd_observability.sync_totals),'')||chr(10)||
 '# TYPE mfd_db_transactions_total counter'||chr(10)||
 coalesce((select 'mfd_db_transactions_total{outcome="commit"} '||xact_commit||chr(10)||'mfd_db_transactions_total{outcome="rollback"} '||xact_rollback from pg_catalog.pg_stat_database where datname=current_database()),'')||chr(10)||
 '# TYPE mfd_db_connections gauge'||chr(10)||'mfd_db_connections '||(select count(*) from pg_catalog.pg_stat_activity where datname=current_database())||chr(10)||
 '# TYPE mfd_db_max_connections gauge'||chr(10)||'mfd_db_max_connections '||current_setting('max_connections')||chr(10);
$$;
revoke all on function public.mfd_prometheus_metrics() from public,anon,authenticated;
grant execute on function public.mfd_prometheus_metrics() to service_role;
notify pgrst,'reload schema';
