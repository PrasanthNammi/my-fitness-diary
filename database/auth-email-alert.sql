-- Sign-up / password-reset email failures, counted for Grafana (2026-11-26).
-- Supabase sends these emails through the MFD Gmail (custom SMTP). When Gmail refused the app password
-- (11-26 Nov 2026) every email sign-up failed and was rolled back, leaving nothing in the database and
-- no alert. The app's server now calls mfd_note_auth_email_failure() when Supabase answers that it could
-- not send an email; the count is exported by mfd_prometheus_metrics() and alerted on in Grafana.
-- No email address, user or request detail is stored: one counter and the time of the last failure.
-- Run after database/sync-observability.sql. Safe to run again.
begin;
create table if not exists mfd_observability.auth_email_failures (
 id boolean primary key default true check (id),
 total bigint not null default 0,
 last_at timestamptz
);
alter table mfd_observability.auth_email_failures enable row level security;
revoke all on mfd_observability.auth_email_failures from public,anon,authenticated;
grant select on mfd_observability.auth_email_failures to service_role;
insert into mfd_observability.auth_email_failures(id) values(true) on conflict do nothing;

-- Called by the app's server with the public key (people signing up have no session yet), so anyone could
-- call it: at most one count per 10 seconds, which can only keep the alert on, never grow the table.
create or replace function public.mfd_note_auth_email_failure()
returns void language plpgsql security definer set search_path='' as $$
begin
 update mfd_observability.auth_email_failures set total=total+1,last_at=clock_timestamp()
  where id and (last_at is null or last_at<clock_timestamp()-interval '10 seconds');
end $$;
revoke all on function public.mfd_note_auth_email_failure() from public;
grant execute on function public.mfd_note_auth_email_failure() to anon,authenticated;

create or replace function public.mfd_prometheus_metrics()
returns text language sql security invoker set search_path='' as $$
 select '# TYPE mfd_sync_operations_total counter'||chr(10)||
 coalesce((select string_agg('mfd_sync_operations_total{outcome="'||outcome||'"} '||total,chr(10)) from mfd_observability.sync_totals),'')||chr(10)||
 '# TYPE mfd_sync_duration_seconds_sum counter'||chr(10)||
 coalesce((select 'mfd_sync_duration_seconds_sum '||sum(seconds_total) from mfd_observability.sync_totals),'')||chr(10)||
 '# TYPE mfd_db_transactions_total counter'||chr(10)||
 coalesce((select 'mfd_db_transactions_total{outcome="commit"} '||xact_commit||chr(10)||'mfd_db_transactions_total{outcome="rollback"} '||xact_rollback from pg_catalog.pg_stat_database where datname=current_database()),'')||chr(10)||
 '# TYPE mfd_db_connections gauge'||chr(10)||'mfd_db_connections '||(select count(*) from pg_catalog.pg_stat_activity where datname=current_database())||chr(10)||
 '# TYPE mfd_db_max_connections gauge'||chr(10)||'mfd_db_max_connections '||current_setting('max_connections')||chr(10)||
 '# TYPE mfd_auth_email_failures_total counter'||chr(10)||
 coalesce((select 'mfd_auth_email_failures_total '||total from mfd_observability.auth_email_failures),'mfd_auth_email_failures_total 0')||chr(10);
$$;
revoke all on function public.mfd_prometheus_metrics() from public,anon,authenticated;
grant execute on function public.mfd_prometheus_metrics() to service_role;
commit;
notify pgrst,'reload schema';
