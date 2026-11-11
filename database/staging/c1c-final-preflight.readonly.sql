-- C.1C final acceptance: READ-ONLY staging preflight/postcheck for gngnrmzeghjzqsmzuktl.
-- Selects identifiers, counts, booleans, timestamps and hashes only. Never selects token, code,
-- secret, email, payload or raw identity data. Session IDs are returned only as SHA-256 hex.
-- Compare with scripts/c1c-final-preflight-compare.cjs.
select jsonb_build_object(
 'observed_at', now(),
 'users', (select coalesce(jsonb_agg(u.id::text order by u.id), '[]') from auth.users u),
 'identities', (select jsonb_build_object('count', count(*), 'providers', coalesce(jsonb_agg(distinct i.provider), '[]')) from auth.identities i),
 'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
    'hash', encode(sha256(convert_to(s.id::text, 'UTF8')), 'hex'),
    'user_id', s.user_id::text,
    'created_at', s.created_at,
    'not_after_null', s.not_after is null,
    'oauth_client', to_jsonb(s)->>'oauth_client_id',
    'refresh_unrevoked', (select count(*) from auth.refresh_tokens rt where rt.session_id = s.id and rt.user_id = s.user_id::text and rt.revoked = false),
    'refresh_revoked', (select count(*) from auth.refresh_tokens rt where rt.session_id = s.id and rt.revoked is not false)
   ) order by s.created_at), '[]') from auth.sessions s),
 'oauth_clients', (select coalesce(jsonb_agg(jsonb_build_object(
    'id', to_jsonb(c)->>'id', 'client_type', to_jsonb(c)->>'client_type',
    'registration_type', to_jsonb(c)->>'registration_type', 'deleted', (to_jsonb(c)->>'deleted_at') is not null)), '[]') from auth.oauth_clients c),
 'oauth_consents', (select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', to_jsonb(c)->>'user_id', 'client_id', to_jsonb(c)->>'client_id',
    'scopes', to_jsonb(c)->>'scopes', 'active', (to_jsonb(c)->>'revoked_at') is null)
   order by to_jsonb(c)->>'user_id'), '[]') from auth.oauth_consents c),
 'local_clients', (select coalesce(jsonb_agg(client_id order by client_id), '[]') from mfd_mcp.clients),
 'grants', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id::text, 'client_id', client_id, 'permissions', permissions) order by user_id), '[]') from mfd_mcp.grants),
 'workspaces', (select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id::text, 'revision', revision) order by user_id), '[]') from public.forma_workspaces),
 'proposals', (select count(*) from mfd_mcp.proposals),
 'settings', (select jsonb_agg(jsonb_build_object('writes_enabled', writes_enabled, 'resource_uri', resource_uri)) from mfd_mcp.settings),
 'dispatcher', (select jsonb_build_object(
    'body_md5', md5(regexp_replace(prosrc, '[[:space:]]', '', 'g')), 'owner', proowner::regrole::text,
    'definer', prosecdef, 'config', proconfig, 'acl', (select jsonb_agg(a::text order by a::text) from unnest(proacl) a),
    'anon_exec', has_function_privilege('anon', p.oid, 'EXECUTE'))
   from pg_proc p where p.oid = 'mfd_mcp.dispatch(text,jsonb)'::regprocedure),
 'wrapper', (select jsonb_build_object(
    'body_md5', md5(regexp_replace(prosrc, '[[:space:]]', '', 'g')), 'owner', proowner::regrole::text,
    'definer', prosecdef, 'config', proconfig, 'acl', (select jsonb_agg(a::text order by a::text) from unnest(proacl) a),
    'anon_exec', has_function_privilege('anon', p.oid, 'EXECUTE'))
   from pg_proc p where p.oid = 'public.mfd_mcp(text,jsonb)'::regprocedure),
 'rls', (select jsonb_agg(jsonb_build_object('table', n.nspname || '.' || c.relname, 'rls', c.relrowsecurity) order by n.nspname, c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('public', 'mfd_mcp')),
 'policies_md5', (select md5(string_agg(schemaname || '.' || tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname))
   from pg_policies where schemaname in ('public', 'mfd_mcp', 'storage')),
 'storage', jsonb_build_object(
    'buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public) order by id), '[]') from storage.buckets),
    'objects', (select count(*) from storage.objects))
) as preflight;
