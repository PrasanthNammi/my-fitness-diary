begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.friend',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.owner')::uuid),(current_setting('test.friend')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
insert into public.mfd_catalogue(kind,name,data) values('food','Private photo test','{"basis":100,"unit":"g","cal":1,"p":0,"c":0,"f":0}');
select set_config('test.item',(select id::text from public.mfd_catalogue where creator_id=auth.uid() and name='Private photo test'),true);
insert into storage.objects(bucket_id,name) values('catalogue-photos',current_setting('test.owner')||'/test.jpg');
insert into public.mfd_catalogue_photos(item_id,path) values(current_setting('test.item')::uuid,current_setting('test.owner')||'/test.jpg');
do $$declare n integer;begin
 select count(*) into n from public.mfd_catalogue_photos where item_id=current_setting('test.item')::uuid;if n<>1 then raise exception 'Owner metadata read failed';end if;
 select count(*) into n from storage.objects where bucket_id='catalogue-photos' and name=current_setting('test.owner')||'/test.jpg';if n<>1 then raise exception 'Owner storage read failed';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.friend'),true);
do $$declare n integer;begin
 select count(*) into n from public.mfd_catalogue_photos where item_id=current_setting('test.item')::uuid;if n<>0 then raise exception 'Friend saw private metadata';end if;
 select count(*) into n from storage.objects where bucket_id='catalogue-photos' and name=current_setting('test.owner')||'/test.jpg';if n<>0 then raise exception 'Friend saw private photo';end if;
 begin
 insert into storage.objects(bucket_id,name) values('catalogue-photos',current_setting('test.owner')||'/forbidden.jpg');
 raise exception 'Cross-owner upload allowed';exception when insufficient_privilege then null;end;
 delete from public.mfd_catalogue_photos where item_id=current_setting('test.item')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Cross-owner delete allowed';end if;
end $$;
reset role;
select 'PASS: owner photo read/write, friend cannot read private photos/metadata, cross-owner upload/delete denied' as result;
rollback;
