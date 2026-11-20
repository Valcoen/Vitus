-- ============================================================
-- 002 RLS hotfix (UP) - no app change needed
--  * meal_portions: drop the USING(true) policy that let anyone,
--    including logged-out visitors, read/insert/update/delete portions.
--    Planners keep full access, household members keep read access
--    through the existing policies.
--  * recipes: no reading by logged-out visitors.
-- ============================================================
begin;
drop policy if exists meal_portions_all_authenticated on public.meal_portions;

drop policy if exists "Recipes are visible to all" on public.recipes;
drop policy if exists "Recipes selectable by anyone" on public.recipes;
create policy "Recipes readable by authenticated" on public.recipes
  for select to authenticated using (true);
commit;
