-- 005 DOWN. Ratings above 5 are halved to fit the old 1-5 check.
begin;
drop function if exists public.remove_household_member(uuid);
drop function if exists public.regenerate_invite_code();
drop function if exists public.leave_household();
drop function if exists public.create_household(text);
drop trigger if exists users_guard_household on public.users;
drop function if exists public.guard_household_change();
-- join_household back to the 004 version
create or replace function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_household uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into v_household from public.households where lower(invite_code) = lower(trim(p_code)) limit 1;
  if v_household is null then return null; end if;
  update public.users set household_id = v_household where auth_id = auth.uid();
  return v_household;
end $$;
drop function if exists public.vitus_leave_current(uuid);
alter table public.recipes drop constraint if exists recipes_rating_check;
update public.recipes set rating = greatest(1, round(rating / 2.0)) where rating is not null;
alter table public.recipes add constraint recipes_rating_check check (rating >= 1 and rating <= 5);
alter table public.recipes drop constraint if exists recipes_status_check;
alter table public.recipes alter column status set default 'ready';
commit;
