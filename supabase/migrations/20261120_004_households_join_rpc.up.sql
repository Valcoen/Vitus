-- ============================================================
-- 004 Households private + invite join via function (UP)
-- DEPLOY TOGETHER WITH THE NEW APP CODE: the old code joins a household by
-- reading the households table, which this migration closes.
--  * households: only members (or the creator, right after creating) can
--    read them - invite codes are no longer public.
--  * join_household(code): checks the code and joins in one step.
--  * recipes: delete policy (there was none, deletes silently did nothing).
--    Open to logged-in users for now; roles will narrow it later.
-- ============================================================
begin;

drop policy if exists "Households selectable by anyone" on public.households;
create policy "Households readable by members" on public.households
  for select to authenticated
  using (id = public.get_user_household_id() or planner_user_id = public.get_user_id());

create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id into v_household from public.households
   where lower(invite_code) = lower(trim(p_code))
   limit 1;
  if v_household is null then
    return null;
  end if;
  update public.users set household_id = v_household where auth_id = auth.uid();
  return v_household;
end $$;

revoke all on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;

drop policy if exists "Recipes delete authenticated" on public.recipes;
create policy "Recipes delete authenticated" on public.recipes
  for delete to authenticated using (true);

commit;
