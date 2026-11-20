-- 006 DOWN. Removes the Swiss food rows only if 007 was rolled back first.
begin;
drop trigger if exists food_items_updated_at on public.food_items;
drop function if exists public.touch_updated_at();
drop index if exists public.food_items_source_uidx, public.food_items_name_lower_idx, public.food_items_category_idx;
alter table public.food_items
  drop column if exists food_category, drop column if exists aliases, drop column if exists sugar_100g,
  drop column if exists fiber_100g, drop column if exists sat_fat_100g, drop column if exists salt_100g,
  drop column if exists density, drop column if exists unit_grams, drop column if exists kind,
  drop column if exists is_vegetarian, drop column if exists is_vegan, drop column if exists allergens,
  drop column if exists source, drop column if exists source_id, drop column if exists source_category,
  drop column if exists is_hidden, drop column if exists updated_at;
alter table public.recipes drop column if exists course, drop column if exists cuisine, drop column if exists diet;
drop table if exists public.recipe_courses, public.cuisines, public.food_categories;
commit;
