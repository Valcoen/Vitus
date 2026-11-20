-- ============================================================
-- 005 Drafts, 0-10 rating, shared plan management (UP)
--  * recipes.status: 'draft' | 'ready' (new recipes start as draft)
--  * recipes.rating: 0-10 like the Obsidian notes (was 1-5, all empty)
--  * Shared plan (households): create / leave / remove member /
--    new invite code as SECURITY DEFINER functions, and a guard so a
--    user can no longer put themselves into any plan by editing their
--    own users row (they must use an invite code).
--  NOTE: users.household_id is ON DELETE CASCADE - plans are never deleted.
-- ============================================================
begin;

-- recipes ----------------------------------------------------
update public.recipes set status = 'ready' where status is null or status not in ('draft', 'ready');
alter table public.recipes alter column status set default 'draft';
alter table public.recipes drop constraint if exists recipes_status_check;
alter table public.recipes add constraint recipes_status_check check (status in ('draft', 'ready'));

alter table public.recipes drop constraint if exists recipes_rating_check;
alter table public.recipes add constraint recipes_rating_check check (rating is null or (rating >= 0 and rating <= 10));

-- shared plan ------------------------------------------------
-- Logged-in users may not change household_id themselves, except leaving.
create or replace function public.guard_household_change() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.household_id is not null
     and (tg_op = 'INSERT' or new.household_id is distinct from old.household_id) then
    raise exception 'household changes go through join_household / create_household';
  end if;
  return new;
end $$;

drop trigger if exists users_guard_household on public.users;
create trigger users_guard_household before insert or update of household_id on public.users
  for each row execute function public.guard_household_change();

-- Leaves the current plan; a leaving planner hands over to another member.
create or replace function public.vitus_leave_current(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_household uuid;
  v_next uuid;
begin
  select household_id into v_household from public.users where id = p_user;
  if v_household is null then return; end if;
  update public.users set household_id = null where id = p_user;
  if exists (select 1 from public.households where id = v_household and planner_user_id = p_user) then
    select id into v_next from public.users where household_id = v_household order by created_at nulls last, id limit 1;
    if v_next is not null then
      update public.households set planner_user_id = v_next where id = v_household;
    end if;
  end if;
end $$;
revoke all on function public.vitus_leave_current(uuid) from public, anon, authenticated;

create or replace function public.leave_household() returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.get_user_id();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  perform public.vitus_leave_current(v_me);
end $$;

create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.get_user_id();
  v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  perform public.vitus_leave_current(v_me);
  insert into public.households (name, planner_user_id, invite_code)
  values (left(coalesce(nullif(trim(p_name), ''), 'Unser Plan'), 80), v_me, substring(md5(gen_random_uuid()::text), 1, 8))
  returning id into v_id;
  update public.users set household_id = v_id where id = v_me;
  return v_id;
end $$;

create or replace function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.get_user_id();
  v_household uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select id into v_household from public.households
   where lower(invite_code) = lower(trim(p_code)) limit 1;
  if v_household is null then return null; end if;
  if exists (select 1 from public.users where id = v_me and household_id = v_household) then
    return v_household;
  end if;
  perform public.vitus_leave_current(v_me);
  update public.users set household_id = v_household where id = v_me;
  return v_household;
end $$;

create or replace function public.remove_household_member(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.get_user_id();
  v_household uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_user = v_me then return false; end if;
  select id into v_household from public.households where planner_user_id = v_me
     and id = (select household_id from public.users where id = v_me);
  if v_household is null then return false; end if;
  update public.users set household_id = null where id = p_user and household_id = v_household;
  return found;
end $$;

create or replace function public.regenerate_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.get_user_id();
  v_code text := substring(md5(gen_random_uuid()::text), 1, 8);
begin
  update public.households set invite_code = v_code
   where planner_user_id = v_me and id = (select household_id from public.users where id = v_me);
  if not found then return null; end if;
  return v_code;
end $$;

revoke all on function public.leave_household(), public.create_household(text), public.join_household(text),
  public.remove_household_member(uuid), public.regenerate_invite_code() from public, anon;
grant execute on function public.leave_household(), public.create_household(text), public.join_household(text),
  public.remove_household_member(uuid), public.regenerate_invite_code() to authenticated;

commit;
