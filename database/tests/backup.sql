-- Weekly encrypted backup (database/backup/backup.sql), in a rolled-back transaction, with a THROWAWAY TEST key pair
-- (database/tests/fixtures/backup-test-*.asc, not the real backup key): the backup holds every table and the accounts
-- without passwords, opens with the private key, keeps the last 2, and is only handed out for the right token; nobody
-- can read the stored files directly.
begin;
alter table auth.users add column if not exists email text, add column if not exists created_at timestamptz default now(),
  add column if not exists last_sign_in_at timestamptz, add column if not exists raw_app_meta_data jsonb, add column if not exists raw_user_meta_data jsonb,
  add column if not exists encrypted_password text;
select set_config('test.u', gen_random_uuid()::text, true);
insert into auth.users(id, email, encrypted_password, raw_app_meta_data) values (current_setting('test.u')::uuid, 'backup-test@mfd.invalid', 'SECRET-PASSWORD-HASH', '{"providers":["email"]}');
insert into public.forma_workspaces(user_id, payload) values (current_setting('test.u')::uuid, '{"profile":{"name":"Backup Test"},"meals":[],"weights":[{"id":"bw1","date":"2026-11-19","kg":72.4}],"checkins":[],"chat":[],"routines":[],"sessions":[]}');
insert into mfd_backup.settings(id, public_key, token_sha256) values (true, $k$-----BEGIN PGP PUBLIC KEY BLOCK-----

mQENBGr/RWoBCADRr7TJpK9sKxsphWH/oDbBp6qDE2sh2brQls6rzQ4CIN2Dogv8
XHOIc2np9LlBbzuEZs3JeGajVkK9yOQ3sOo3TBC2/YKsSLHdPgjNtmt3Ehl3xyrm
3SvtwpwJqpOrBY+qYonzkEZrZTpkuNVbbe6Y5Yvgir/dm3vnQl4IJEEpQalFrOEf
FoyJZ3aD/+lzXDO3N1Wly5dDJugx9oeAqkYbYzmMs0vzsVip+C9vb7/JyQZtssNe
wIQ/+TciRlgWjgOdu0q+aPd5NxW+fn6btCL3osA7UwuIvkAhEJebx3jtFOg6hriL
r2zq5kzJDBbDmtLVJBts5xMF+aANH0/Xw0unABEBAAG0J01GRCBiYWNrdXAgVEVT
VCBPTkxZIDx0ZXN0QG1mZC5pbnZhbGlkPokBbQQTAQgAVxYhBCkNn0IPjpVEurdF
rWRw11bAYRuOBQJq/0VqGxSAAAAAAAQADm1hbnUyLDIuNSsxLjEyLDAsMwIbAwUL
CQgHAgIiAgYVCgkICwIEFgIDAQIeBwIXgAAKCRBkcNdWwGEbjuvTB/9Qe0aZ7y8j
HL006vKbhD6bily3Jc5tpGJxk3vYPix3W4bQ0amGAMsYU1mgV/oZsD8exR50bvbu
FGcAx/Gtz5Lu+HsPJUYReufoVpMQ2sQQcVUXEs9w/EM2LHzFhs0VRWOmUWBOmsUQ
fDaPkuiJYXh6Jh8GRXD3bUlbz+CAWKMEg/zX5HPHKTYX+dZLGcudyO+/7vGI8cTA
FPjULJz4jn9PwZCsdGO4sIgBuC0+GdrFtG+Et0nBSBNCgrkMPzPZ/2nxvtIhIMyM
pmkLEwAU5zPrNM96olVxAFkP5SM51/5ddrtHx09Q0+D4p0OZF5+c8CkG4xAfMhaa
t5cKgC/IG3qyuQENBGr/RWoBCAC4GBcp4lsn55X2BhiGpjkWXHBUGtVHACxJ9Wyt
u/N5AUT5H5YbgVrxLWkGfPklXGzy8h0q1+W/kWTlkKYQW3KwRh6g5jwrA9jM3VOD
I0PzlhNlC/5DIUnbCpwsFI/seYkRzThR+hr0YwmV7X18T7Uc7kY9TqYOFRU+QxaI
StkrOC6TomslCEwnmJgqH9YxYJv9scIHytekXQBzwtB5yLLTsHTclsCpAXH41U5f
+MXJhXj+MrAhMYg/WgW+vB5mo/+GZ9mY6jGcT4YA9RSmG6TqSzt7RymGA42q+OLG
juug41MldWTbSDgsm+B3puiYholuqQVuWIybMKP7oC1GDwhXABEBAAGJAVIEGAEI
ADwWIQQpDZ9CD46VRLq3Ra1kcNdWwGEbjgUCav9FahsUgAAAAAAEAA5tYW51Miwy
LjUrMS4xMiwwLDMCGwwACgkQZHDXVsBhG44QwQf+NMhqvnxh+RmRkPtc4dJXQzVq
eFFQA5WTmwkt4x3M9MOMBVDS/IEi+filJo/FX9jQB9i5bxjyZoqy25zqBWOFFiP7
G7JqijmOD5M30iaOOkj+DvNrT/VL8UpqBNjKj97rKbFonw3oK3nyO38tr2i80fgw
m6h0hCIg1Yv/WODuhgAQ5JjabwWtWPDUx9BKMufUw6s3KnrkuBm0IID6zTk6mkjI
nP2ZFG9wA1DsrOcjTY0yDeKuacqmA40HZ/qTZsMZIMt4pdWcHkhRTPwBQ5fHW//N
55XiMEUrpthn5RxvGkidhRy2eXDR9rGcNk/3EKpOHGIP9PGMkLzDF1406mvZCA==
=otRV
-----END PGP PUBLIC KEY BLOCK-----$k$, extensions.digest('right-token-right-token-right-token-1234', 'sha256'))
  on conflict (id) do update set public_key = excluded.public_key, token_sha256 = excluded.token_sha256;
select mfd_backup.build(); select mfd_backup.build(); select mfd_backup.build();
do $t$ declare f mfd_backup.files; plain text; b jsonb; got jsonb; denied boolean := false; begin
  if (select count(*) from mfd_backup.files) <> 2 then raise exception 'should keep the last 2 backups'; end if;
  select * into f from mfd_backup.files order by id desc limit 1;
  if position('Backup Test' in encode(f.data, 'escape')) > 0 then raise exception 'stored backup is readable'; end if;
  plain := extensions.pgp_pub_decrypt(f.data, extensions.dearmor($k$-----BEGIN PGP PRIVATE KEY BLOCK-----

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
6mvZCA==
=6Yew
-----END PGP PRIVATE KEY BLOCK-----$k$));
  b := plain::jsonb;
  if b->>'format' <> 'mfd-backup-1' then raise exception 'format'; end if;
  if not (b->'tables' ? 'public.forma_workspaces' and b->'tables' ? 'auth.users') then raise exception 'tables missing'; end if;
  if not exists (select 1 from jsonb_array_elements(b->'tables'->'public.forma_workspaces') w where w->'payload'->'weights'->0->>'kg' = '72.4') then raise exception 'diary missing'; end if;
  if not exists (select 1 from jsonb_array_elements(b->'tables'->'auth.users') u where u->>'email' = 'backup-test@mfd.invalid') then raise exception 'account missing'; end if;
  if position('SECRET-PASSWORD-HASH' in plain) > 0 then raise exception 'passwords must not be in the backup'; end if;
  if f.rows < 2 or f.tables < 2 then raise exception 'counts'; end if;
  got := public.mfd_backup_latest('right-token-right-token-right-token-1234');
  if (got->>'id')::bigint <> f.id or decode(got->>'data', 'base64') <> f.data then raise exception 'latest'; end if;
  begin perform public.mfd_backup_latest('wrong-token-wrong-token-wrong-token-1234'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'wrong token must be refused'; end if;
end $t$;
set local role anon;
do $t$ declare denied boolean := false; begin
  begin perform 1 from mfd_backup.files; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon must not read stored backups'; end if;
  if public.mfd_backup_latest('right-token-right-token-right-token-1234') is null then raise exception 'token works for the Google script (anon)'; end if;
end $t$;
reset role;
select 'PASS backup: every table + accounts without passwords, locked (opens with the private key), last 2 kept, right token only, not readable directly';
rollback;
