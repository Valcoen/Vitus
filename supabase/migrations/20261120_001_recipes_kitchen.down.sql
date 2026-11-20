-- ============================================================
-- 001 Recipes for cook mode, images, import/export  (DOWN)
-- Restores the original ingredient JSON and removes the added columns.
-- WARNING: recipes created/edited after 001 lose their new fields
-- (images, steps, tags...). Export all recipes to Markdown first.
-- ============================================================
begin;

update public.recipes set ingredients = ingredients_legacy where ingredients_legacy is not null;

drop trigger if exists recipes_set_updated_at on public.recipes;
drop function if exists public.set_updated_at();
drop index if exists public.recipes_slug_key;
drop index if exists public.recipes_tags_idx;

alter table public.recipes
  drop column if exists slug,
  drop column if exists image_path,
  drop column if exists tags,
  drop column if exists prep_time,
  drop column if exists cook_time,
  drop column if exists kcal_per_serving,
  drop column if exists protein_per_serving,
  drop column if exists fridge_days,
  drop column if exists freezable,
  drop column if exists notes,
  drop column if exists steps,
  drop column if exists status,
  drop column if exists extra_frontmatter,
  drop column if exists extra_sections,
  drop column if exists created_at,
  drop column if exists updated_at,
  drop column if exists last_imported_at,
  drop column if exists import_hash,
  drop column if exists ingredients_legacy;

alter table public.meals drop column if exists created_by;
alter table public.user_logs alter column user_id drop not null;

commit;
