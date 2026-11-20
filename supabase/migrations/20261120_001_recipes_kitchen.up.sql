-- ============================================================
-- 001 Recipes for cook mode, images, import/export  (UP)
-- Additive only: no column is dropped or overwritten.
-- Run AFTER a pg_dump backup. Reverse with the matching .down.sql.
-- ============================================================
begin;

-- 1. Recipe fields
alter table public.recipes
  add column if not exists slug                text,
  add column if not exists image_path          text,
  add column if not exists tags                text[] not null default '{}',
  add column if not exists prep_time           integer check (prep_time  is null or prep_time  >= 0),
  add column if not exists cook_time           integer check (cook_time  is null or cook_time  >= 0),
  add column if not exists kcal_per_serving    numeric check (kcal_per_serving    is null or kcal_per_serving    >= 0),
  add column if not exists protein_per_serving numeric check (protein_per_serving is null or protein_per_serving >= 0),
  add column if not exists fridge_days         integer check (fridge_days is null or fridge_days >= 0),
  add column if not exists freezable           boolean,
  add column if not exists notes               text,             -- storage / reheating notes ("## Notes")
  add column if not exists steps               jsonb,            -- [{ "text": "...", "timer_seconds": 1500 | null }]
  add column if not exists status              text not null default 'ready',
  add column if not exists extra_frontmatter   jsonb not null default '{}'::jsonb,
  add column if not exists extra_sections      jsonb not null default '[]'::jsonb,
  add column if not exists created_at          timestamptz not null default now(),
  add column if not exists updated_at          timestamptz not null default now(),
  add column if not exists last_imported_at    timestamptz,     -- set by Markdown import
  add column if not exists import_hash         text,            -- hash of the last imported file
  -- untouched copy of the old ingredient JSON, so the conversion can be undone
  add column if not exists ingredients_legacy  jsonb;

update public.recipes set ingredients_legacy = ingredients where ingredients_legacy is null;

-- Slug: unique, filled by the conversion script (scripts/convert-recipes.ts)
create unique index if not exists recipes_slug_key on public.recipes (slug) where slug is not null;
create index if not exists recipes_tags_idx on public.recipes using gin (tags);

-- 2. updated_at maintained by the database (used for the "changed in app since import" warning)
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

-- 3. Plans: who created them (recipes.created_by already exists)
alter table public.meals
  add column if not exists created_by uuid references public.users(id) on delete set null;

-- 4. Tracking entries must belong to a user.
--    user_logs.user_id is nullable today; enforce NOT NULL only if no orphan rows exist.
do $$
begin
  if not exists (select 1 from public.user_logs where user_id is null) then
    alter table public.user_logs alter column user_id set not null;
  else
    raise notice 'user_logs has rows without user_id - NOT NULL skipped, review them manually';
  end if;
end $$;

commit;
