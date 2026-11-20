-- 004 (DOWN): restores public household reads (insecure, old behaviour).
begin;
drop policy if exists "Households readable by members" on public.households;
create policy "Households selectable by anyone" on public.households for select using (true);
drop function if exists public.join_household(text);
drop policy if exists "Recipes delete authenticated" on public.recipes;
commit;
