begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.friend',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.owner')::uuid),(current_setting('test.friend')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
insert into public.mfd_catalogue(kind,name,barcode,data) values('food','RLS test oats',null,'{"basis":100,"unit":"g","cal":380,"p":13,"c":60,"f":7}');
select set_config('test.item',(select id::text from public.mfd_catalogue where creator_id=auth.uid() and name='RLS test oats'),true);
insert into public.mfd_catalogue(kind,name,data) values('exercise','RLS test exercise','{"tracking":"weight_reps"}');
select set_config('test.exercise',(select id::text from public.mfd_catalogue where creator_id=auth.uid() and name='RLS test exercise'),true);
select set_config('request.jwt.claim.sub',current_setting('test.friend'),true);
do $$declare n integer;begin
 select count(*) into n from public.mfd_catalogue where id=current_setting('test.item')::uuid;
 if n<>1 then raise exception 'Friend cannot read shared food';end if;
 update public.mfd_catalogue set name='Unauthorized' where id in(current_setting('test.item')::uuid,current_setting('test.exercise')::uuid);
 get diagnostics n=row_count;if n<>0 then raise exception 'Friend edited another creator entry';end if;
 begin
  update public.mfd_catalogue set creator_id=auth.uid() where id=current_setting('test.item')::uuid;
  raise exception 'Ownership change allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.mfd_catalogue(kind,name,data) values('food','Invalid','{}');
  raise exception using errcode='P0002',message='Invalid nutrition allowed';
 exception when raise_exception then null;end;
end $$;
insert into public.mfd_catalogue_reports(item_id,field,message) values(current_setting('test.item')::uuid,'Protein','Please check the packaging.');
select set_config('test.report',(select id::text from public.mfd_catalogue_reports where reporter_id=auth.uid() and item_id=current_setting('test.item')::uuid),true);
do $$declare n integer;begin
 update public.mfd_catalogue_reports set status='resolved' where id=current_setting('test.report')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Reporter resolved own report';end if;
 begin
  update public.mfd_catalogue_reports set message='Changed' where id=current_setting('test.report')::uuid;
  raise exception 'Reporter could modify report content';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$declare n integer;begin
 update public.mfd_catalogue set name='Corrected oats' where id=current_setting('test.item')::uuid;
 get diagnostics n=row_count;if n<>1 then raise exception 'Owner edit failed';end if;
 update public.mfd_catalogue_reports set status='resolved',response='Corrected' where id=current_setting('test.report')::uuid;
 get diagnostics n=row_count;if n<>1 then raise exception 'Owner review failed';end if;
 update public.mfd_catalogue set archived=true where id=current_setting('test.item')::uuid;
 get diagnostics n=row_count;if n<>1 then raise exception 'Owner archive failed';end if;
end $$;
set local role anon;
do $$begin
 begin
  perform 1 from public.mfd_catalogue limit 1;
  raise exception 'Anonymous catalogue access allowed';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: shared reads, creator-only writes for foods and exercises, immutable ownership, valid nutrition, report review permissions, archive, anonymous denial' as result;
rollback;
