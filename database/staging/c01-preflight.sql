-- READ ONLY. Run only after approval, against the explicitly verified staging project.
-- Save this metadata result securely before remediation; it contains no workspace rows.
begin transaction read only;
-- Missing/invalid delegation metadata never implies authorization. Invalid JSON
-- aborts this read-only query; absent/wrong-shaped metadata produces false below.
with provider as (
 select (select setting::jsonb from pg_settings where name='supautils.policy_grants') as policy_grants
), storage_authority as (
 select c.relname,pg_get_userbyid(c.relowner) as owner,
  pg_has_role(current_user,c.relowner,'USAGE') as ordinary_owner_or_inherited_owner,
  coalesce(jsonb_typeof(p.policy_grants)='object'
   and jsonb_typeof(p.policy_grants->current_user)='array'
   and (p.policy_grants->current_user) @> jsonb_build_array('storage.'||c.relname),false) as supported_delegation_configured
 from pg_class c cross join provider p
 where c.oid in('storage.objects'::regclass,'storage.buckets'::regclass)
)
select jsonb_build_object(
 'database',current_database(),'role',current_user,
 'operator_is_superuser',(select rolsuper from pg_roles where rolname=current_user),
 'operator_is_expected_sql_editor_role',current_user='postgres',
 'operator_is_supabase_admin_member',pg_has_role(current_user,'supabase_admin','MEMBER'),
 'provider_defaults_review_only',true,
 'operator_capabilities',jsonb_build_object(
  'database_create',has_database_privilege(current_user,current_database(),'CREATE'),
  'public_schema_create',has_schema_privilege(current_user,'public','CREATE'),
  'auth_users_references',has_table_privilege(current_user,'auth.users','REFERENCES'),
  'storage_policy_authority', (select jsonb_object_agg(relname,jsonb_build_object(
   'owner',owner,'ordinary_owner_or_inherited_owner',ordinary_owner_or_inherited_owner,
   'supported_delegation_configured',supported_delegation_configured,
   'policy_management_preflight_pass',ordinary_owner_or_inherited_owner or supported_delegation_configured)) from storage_authority),
  'all_storage_policy_authority_established',(select count(*)=2 and bool_and(ordinary_owner_or_inherited_owner or supported_delegation_configured) from storage_authority),
  'storage_bucket_insert_select',has_table_privilege(current_user,'storage.buckets','INSERT') and has_table_privilege(current_user,'storage.buckets','SELECT')),
 'server_version',current_setting('server_version'),
 'api_schema_setting',current_setting('pgrst.db_schemas',true),
 'active_mcp_settings',(select jsonb_agg(jsonb_build_object('id',id,'writes_enabled',writes_enabled,'resource_uri',resource_uri)) from mfd_mcp.settings),
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl)) from pg_namespace where nspname in('public','mfd_private','mfd_observability','mfd_mcp')),
 'tables',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'forced_rls',c.relforcerowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','mfd_private','mfd_observability','mfd_mcp') and c.relkind='r'),
 'columns',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid))) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname in('public','mfd_private','mfd_observability','mfd_mcp') and c.relkind='r'),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in('public','mfd_private','mfd_observability','mfd_mcp') or (schemaname='storage' and tablename='objects')),
 'indexes',(select jsonb_agg(to_jsonb(i)) from pg_indexes i where schemaname in('public','mfd_private','mfd_observability','mfd_mcp')),
 'functions',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'security_definer',p.prosecdef,'config',p.proconfig,'source_md5',md5(p.prosrc))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','mfd_private','mfd_observability','mfd_mcp')),
 'default_acls',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl)) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole in(select oid from pg_roles where rolname in('postgres','supabase_admin'))),
 'bucket_configuration',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) from storage.buckets where id in('mfd-avatars','mfd-workout-photos','catalogue-photos'))
) as c01_metadata_snapshot;
commit;
