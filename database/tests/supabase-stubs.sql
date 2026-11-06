-- Minimal stand-ins for the Supabase pieces the MFD schema relies on (local and CI tests only).
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon,authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated; grant usage on schema storage to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
create schema cron; create function cron.schedule(a text,b text,c text) returns bigint language sql as $$select 1::bigint$$;
-- PostgREST puts the JWT claims in request.jwt.claims; older code reads request.jwt.claim.sub.
create or replace function auth.uid() returns uuid language sql stable as $$select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),current_setting('request.jwt.claims',true)::jsonb->>'sub'),'')::uuid$$;
create role authenticator login password 'test' noinherit; grant anon,authenticated to authenticator;
