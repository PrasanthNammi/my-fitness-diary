-- Reference schema for Supabase migration 20261016133048_forma_private_workspaces.
-- Already applied remotely. This is not an additional migration.
create table public.forma_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now(),
 constraint forma_payload_size check (octet_length(payload::text) <= 8000000)
);
alter table public.forma_workspaces enable row level security;
create policy owner_select on public.forma_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_insert on public.forma_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy owner_update on public.forma_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_delete on public.forma_workspaces for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.forma_workspaces from anon;
grant select,insert,update,delete on public.forma_workspaces to authenticated;
create function public.forma_save_workspace(document jsonb, expected_revision bigint)
returns table(saved_revision bigint, saved_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_revision bigint; v_at timestamptz;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if jsonb_typeof(document) is distinct from 'object' or octet_length(document::text)>8000000 then raise exception 'Invalid workspace document' using errcode='22023'; end if;
 if expected_revision < 0 or expected_revision is null then raise exception 'Invalid revision' using errcode='22023'; end if;
 if expected_revision = 0 then
  insert into public.forma_workspaces(user_id,payload) values(v_user,document)
  on conflict (user_id) do nothing returning revision,updated_at into v_revision,v_at;
 else
  update public.forma_workspaces set payload=document,revision=revision+1,updated_at=now()
  where user_id=v_user and revision=expected_revision returning revision,updated_at into v_revision,v_at;
 end if;
 if v_revision is null then raise exception 'Workspace changed on another device. Reload before saving.' using errcode='40001'; end if;
 return query select v_revision,v_at;
end $$;
revoke all on function public.forma_save_workspace(jsonb,bigint) from public,anon;
grant execute on function public.forma_save_workspace(jsonb,bigint) to authenticated;
