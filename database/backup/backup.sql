-- Weekly encrypted backup of everything MFD keeps (the free Supabase plan keeps no backups).
--
-- How it works:
--   1. Every Sunday 01:00 UTC the database builds one backup itself (pg_cron, no time limit): every table in the
--      public, diary and mfd_mcp schemas as JSON, plus the accounts (id, email, sign-in providers, dates; never
--      passwords or tokens). It is compressed and locked with the owner's PUBLIC key (OpenPGP, AES-256) before it is
--      stored, so the database never holds anything that can open it. The last 2 are kept.
--   2. A script in the owner's Google account (scripts/backup-google-apps-script.gs) fetches the newest one through
--      public.mfd_backup_latest(token) and saves it to Drive ("MFD backups", last 12 kept). The token only fetches
--      locked backups; its SHA-256 is stored here, the token itself only in that script and the owner's Keychain.
--   3. Only the private key on the owner's Mac (passphrase in Keychain "MFD backup key") opens a backup:
--      scripts/backup-open.sh <file.json.gpg>.
--
-- Setup values (public key, token hash) come from a separate file generated locally (scripts-backup-setup.cjs).
-- Safe to re-run.
begin;
create schema if not exists mfd_backup;
revoke all on schema mfd_backup from public, anon, authenticated;

create table if not exists mfd_backup.settings (
  id           boolean primary key default true check (id),
  public_key   text not null,          -- armored OpenPGP public key (RSA; pgcrypto supports RSA/Elgamal only)
  token_sha256 bytea not null
);
create table if not exists mfd_backup.files (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  tables     int not null,
  rows       bigint not null,
  plain_bytes bigint not null,
  data       bytea not null           -- the locked backup (OpenPGP message)
);
alter table mfd_backup.settings enable row level security;
alter table mfd_backup.files enable row level security;
revoke all on all tables in schema mfd_backup from public, anon, authenticated;

-- Build one backup now. Returns its id.
create or replace function mfd_backup.build() returns bigint
language plpgsql security definer set search_path = '' as $$
declare t record; tables jsonb := '{}'; rows jsonb; n int := 0; total bigint := 0; plain text; key bytea; new_id bigint;
begin
  select extensions.dearmor(s.public_key) into key from mfd_backup.settings s;
  if key is null then raise exception 'Backup key not set up (mfd_backup.settings)'; end if;
  for t in select ns.nspname s, c.relname r from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
           where c.relkind in ('r', 'p') and not c.relispartition and ns.nspname in ('public', 'diary', 'mfd_mcp') order by 1, 2 loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from %I.%I x', t.s, t.r) into rows;
    tables := tables || jsonb_build_object(t.s || '.' || t.r, rows);
    n := n + 1; total := total + jsonb_array_length(rows);
  end loop;
  -- Accounts, without passwords or tokens.
  rows := (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
            'providers', u.raw_app_meta_data -> 'providers', 'user_metadata', u.raw_user_meta_data) order by u.created_at), '[]') from auth.users u);
  tables := tables || jsonb_build_object('auth.users', rows);
  n := n + 1; total := total + jsonb_array_length(rows);
  plain := jsonb_build_object('format', 'mfd-backup-1', 'created_at', now(), 'tables', tables)::text;
  insert into mfd_backup.files (tables, rows, plain_bytes, data)
  values (n, total, octet_length(plain), extensions.pgp_pub_encrypt(plain, key, 'compress-algo=2, compress-level=9, cipher-algo=aes256'))
  returning id into new_id;
  delete from mfd_backup.files where id not in (select id from mfd_backup.files order by id desc limit 2);
  return new_id;
end $$;
revoke all on function mfd_backup.build() from public, anon, authenticated;

-- The newest locked backup, for the Google script (called with the publishable key, so as "anon").
create or replace function public.mfd_backup_latest(token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if token is null or length(token) < 32
     or extensions.digest(token, 'sha256') is distinct from (select s.token_sha256 from mfd_backup.settings s) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return (select jsonb_build_object('id', f.id, 'created_at', f.created_at, 'tables', f.tables, 'rows', f.rows,
            'plain_bytes', f.plain_bytes, 'data', encode(f.data, 'base64'))
          from mfd_backup.files f order by f.id desc limit 1);
end $$;
revoke all on function public.mfd_backup_latest(text) from public;
grant execute on function public.mfd_backup_latest(text) to anon, authenticated;

-- Every Sunday 01:00 UTC (the Google script fetches it a few hours later).
do $cron$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mfd-weekly-backup', '0 1 * * 0', 'select mfd_backup.build()');
  end if;
end $cron$;
commit;
