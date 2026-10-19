insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('catalogue-photos','catalogue-photos',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy catalogue_photo_read on storage.objects for select to authenticated using(bucket_id='catalogue-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy catalogue_photo_upload on storage.objects for insert to authenticated with check(bucket_id='catalogue-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy catalogue_photo_remove on storage.objects for delete to authenticated using(bucket_id='catalogue-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
