-- 002 RLS hotfix (DOWN) - restores the previous, insecure policies.
begin;
create policy meal_portions_all_authenticated on public.meal_portions for all using (true) with check (true);
drop policy if exists "Recipes readable by authenticated" on public.recipes;
create policy "Recipes are visible to all" on public.recipes for select using (true);
create policy "Recipes selectable by anyone" on public.recipes for select using (true);
commit;
