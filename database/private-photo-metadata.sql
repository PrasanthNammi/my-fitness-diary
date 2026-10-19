create table public.mfd_catalogue_photos (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.mfd_catalogue(id),
 owner_id uuid not null default auth.uid() references auth.users(id),
 path text not null unique check(char_length(path)<300),
 created_at timestamptz not null default now()
);
create index mfd_photo_item on public.mfd_catalogue_photos(item_id);
create index mfd_photo_owner on public.mfd_catalogue_photos(owner_id);
alter table public.mfd_catalogue_photos enable row level security;
revoke all on public.mfd_catalogue_photos from anon,authenticated;
grant select,delete on public.mfd_catalogue_photos to authenticated;
grant insert(item_id,path) on public.mfd_catalogue_photos to authenticated;
create policy photo_metadata_read on public.mfd_catalogue_photos for select to authenticated using(owner_id=(select auth.uid()));
create policy photo_metadata_create on public.mfd_catalogue_photos for insert to authenticated with check(owner_id=(select auth.uid()) and split_part(path,'/',1)=(select auth.uid())::text and exists(select 1 from public.mfd_catalogue c where c.id=item_id and c.creator_id=(select auth.uid())));
create policy photo_metadata_delete on public.mfd_catalogue_photos for delete to authenticated using(owner_id=(select auth.uid()));
