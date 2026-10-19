-- Shared catalogue only; private forma_workspaces remains unchanged.
create table public.mfd_catalogue (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null default auth.uid() references auth.users(id),
 kind text not null check(kind in ('food','exercise')),
 name text not null check(char_length(btrim(name)) between 1 and 150),
 barcode text check(barcode is null or barcode ~ '^[0-9]{8,14}$'),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=50000),
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint exercise_no_barcode check(kind='food' or barcode is null)
);
create unique index mfd_catalogue_barcode on public.mfd_catalogue(barcode) where barcode is not null;
create index mfd_catalogue_creator on public.mfd_catalogue(creator_id);
create index mfd_catalogue_kind on public.mfd_catalogue(kind,archived);
create table public.mfd_catalogue_reports (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.mfd_catalogue(id),
 reporter_id uuid not null default auth.uid() references auth.users(id),
 field text not null check(char_length(field) between 1 and 80),
 message text not null check(char_length(btrim(message)) between 1 and 2000),
 status text not null default 'open' check(status in ('open','resolved','dismissed')),
 response text not null default '' check(char_length(response)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index mfd_reports_item on public.mfd_catalogue_reports(item_id);
create index mfd_reports_reporter on public.mfd_catalogue_reports(reporter_id);
create unique index mfd_reports_open on public.mfd_catalogue_reports(item_id,reporter_id) where status='open';
alter table public.mfd_catalogue enable row level security;
alter table public.mfd_catalogue_reports enable row level security;
revoke all on public.mfd_catalogue,public.mfd_catalogue_reports from anon,authenticated;
grant select on public.mfd_catalogue,public.mfd_catalogue_reports to authenticated;
grant insert(kind,name,barcode,data) on public.mfd_catalogue to authenticated;
grant update(name,barcode,data,archived) on public.mfd_catalogue to authenticated;
grant insert(item_id,field,message) on public.mfd_catalogue_reports to authenticated;
grant update(status,response) on public.mfd_catalogue_reports to authenticated;
create policy catalogue_read on public.mfd_catalogue for select to authenticated using (true);
create policy catalogue_create on public.mfd_catalogue for insert to authenticated with check(creator_id=(select auth.uid()));
create policy catalogue_edit on public.mfd_catalogue for update to authenticated using(creator_id=(select auth.uid())) with check(creator_id=(select auth.uid()));
create policy reports_read on public.mfd_catalogue_reports for select to authenticated using(reporter_id=(select auth.uid()) or exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid())));
create policy reports_create on public.mfd_catalogue_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='open' and response='' and exists(select 1 from public.mfd_catalogue c where c.id=item_id and not c.archived));
create policy reports_review on public.mfd_catalogue_reports for update to authenticated using(exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid()))) with check(exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid())));
create function public.mfd_catalogue_validate() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text; v numeric;
begin
 if tg_op='UPDATE' then new.updated_at=clock_timestamp(); end if;
 if tg_table_name='mfd_catalogue' then
  if new.kind='food' then
   foreach k in array array['basis','cal','p','c','f'] loop
    if jsonb_typeof(new.data->k) is distinct from 'number' then raise exception 'Missing numeric %',k; end if;
    v=(new.data->>k)::numeric;
    if v<0 or v>100000 or (k='basis' and v<=0) then raise exception 'Invalid %',k; end if;
   end loop;
   if (new.data->>'unit') is null or (new.data->>'unit') not in ('g','ml','serving') then raise exception 'Invalid reference unit'; end if;
  else
   if (new.data->>'tracking') is null or (new.data->>'tracking') not in ('weight_reps','reps','duration','weight_duration','distance_duration','weight_distance') then raise exception 'Invalid exercise tracking'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.mfd_catalogue_validate() from public,anon,authenticated;
create trigger mfd_catalogue_validate before insert or update on public.mfd_catalogue for each row execute function public.mfd_catalogue_validate();
create trigger mfd_report_updated before update on public.mfd_catalogue_reports for each row execute function public.mfd_catalogue_validate();
