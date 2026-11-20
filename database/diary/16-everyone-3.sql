-- MFD 3.0 for every account, including new ones, and the date of birth required.
--   * Every account is on the 3.0 list (diary.mfd3_people), and each new account joins it when it is created, so a
--     new person's set-up asks for the date of birth (not the age) and the AI connector reads their diary from the
--     tables like everyone else's. Joining can never block a sign-up.
--   * diary.user_profiles.birth_date becomes required (the 3.0 set-up can't finish without it). A save that would
--     make a profile without one is refused; the phone keeps it and saves again once the date of birth is in. If any
--     profile still lacks one, this file stops and changes nothing.
-- Run after 15-tables-switch.sql and database/mcp-read-tables.sql. Safe to re-run.
begin;

insert into diary.mfd3_people (user_id) select id from auth.users on conflict do nothing;

create or replace function diary.join_mfd3() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into diary.mfd3_people (user_id) values (new.id) on conflict do nothing;
  exception when others then
    null;   -- (never block a sign-up; the person would simply get the older set-up)
  end;
  return null;
end $$;
revoke all on function diary.join_mfd3() from public, anon, authenticated;
drop trigger if exists mfd_join_3 on auth.users;
create trigger mfd_join_3 after insert on auth.users for each row execute function diary.join_mfd3();

do $dob$ begin
  if exists (select 1 from diary.user_profiles where birth_date is null) then
    raise exception 'Nothing was changed: % profile(s) still without a date of birth', (select count(*) from diary.user_profiles where birth_date is null);
  end if;
end $dob$;
alter table diary.user_profiles alter column birth_date set not null;

commit;
