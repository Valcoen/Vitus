-- ============================================================
-- 006 Recipe categories + richer food model (UP)
--  * recipe_courses ("Art": Hauptgericht, Kuchen & Torten, …) with the meal
--    slots the week planner may use them for, and an is_treat flag
--  * cuisines ("Küche": Italienisch, Indisch, …)
--  * recipes.course / cuisine / diet
--  * food_categories (shopping aisles) and more per-food data: sugar, fibre,
--    saturated fat, salt, density, unit weights, synonyms, vegan/vegetarian,
--    source (Schweizer Nährwertdatenbank), hidden duplicates
-- Lookup tables are read-only for the app; the seed data lives here and in 007.
-- ============================================================
begin;

-- lookup tables ------------------------------------------------
create table if not exists public.recipe_courses (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label text not null,
  sort smallint not null default 100,
  -- week-planner slots this course may fill: breakfast | lunch | dinner | snack
  plan_slots text[] not null default '{}',
  is_treat boolean not null default false
);

create table if not exists public.cuisines (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label text not null,
  sort smallint not null default 100
);

create table if not exists public.food_categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label text not null,
  -- order of the aisles on the shopping list
  sort smallint not null default 100
);

alter table public.recipe_courses enable row level security;
alter table public.cuisines enable row level security;
alter table public.food_categories enable row level security;
drop policy if exists "recipe_courses readable" on public.recipe_courses;
drop policy if exists "cuisines readable" on public.cuisines;
drop policy if exists "food_categories readable" on public.food_categories;
create policy "recipe_courses readable" on public.recipe_courses for select to authenticated using (true);
create policy "cuisines readable" on public.cuisines for select to authenticated using (true);
create policy "food_categories readable" on public.food_categories for select to authenticated using (true);

insert into public.recipe_courses (slug, label, sort, plan_slots, is_treat) values
  ('fruehstueck',    'Frühstück',          10, '{breakfast}',      false),
  ('hauptgericht',   'Hauptgericht',       20, '{lunch,dinner}',   false),
  ('suppe',          'Suppe & Eintopf',    30, '{lunch,dinner}',   false),
  ('salat',          'Salat',              40, '{lunch,dinner}',   false),
  ('beilage',        'Beilage',            50, '{}',               false),
  ('snack',          'Snack',              60, '{snack}',          false),
  ('dessert',        'Dessert',            70, '{snack}',          true),
  ('kuchen',         'Kuchen & Torten',    80, '{snack}',          true),
  ('gebaeck',        'Kekse & Gebäck',     90, '{snack}',          true),
  ('brot',           'Brot & Brötchen',   100, '{}',               false),
  ('sosse',          'Soße & Dip',        110, '{}',               false),
  ('getraenk',       'Getränk',           120, '{}',               false)
on conflict (slug) do update set label = excluded.label, sort = excluded.sort,
  plan_slots = excluded.plan_slots, is_treat = excluded.is_treat;

insert into public.cuisines (slug, label, sort) values
  ('deutsch', 'Deutsch', 10), ('oesterreichisch', 'Österreichisch', 12), ('schweizerisch', 'Schweizerisch', 14),
  ('italienisch', 'Italienisch', 20), ('franzoesisch', 'Französisch', 22), ('spanisch', 'Spanisch', 24),
  ('griechisch', 'Griechisch', 26), ('orientalisch', 'Orientalisch', 30), ('tuerkisch', 'Türkisch', 32),
  ('indisch', 'Indisch', 40), ('thailaendisch', 'Thailändisch', 42), ('vietnamesisch', 'Vietnamesisch', 44),
  ('chinesisch', 'Chinesisch', 46), ('japanisch', 'Japanisch', 48), ('koreanisch', 'Koreanisch', 50),
  ('mexikanisch', 'Mexikanisch', 60), ('amerikanisch', 'Amerikanisch', 62), ('international', 'International', 90)
on conflict (slug) do update set label = excluded.label, sort = excluded.sort;

insert into public.food_categories (slug, label, sort) values
  ('gemuese', 'Gemüse & Pilze', 10), ('obst', 'Obst', 20), ('kraeuter', 'Kräuter & Gewürze', 30),
  ('kartoffeln', 'Kartoffeln', 35), ('fleisch', 'Fleisch & Geflügel', 40), ('wurst', 'Wurst & Aufschnitt', 45),
  ('fisch', 'Fisch & Meeresfrüchte', 50), ('milch', 'Milch, Joghurt & Sahne', 60), ('kaese', 'Käse', 65),
  ('eier', 'Eier', 70), ('pflanzlich', 'Tofu & Pflanzliches', 75), ('brot', 'Brot & Backwaren', 80),
  ('getreide', 'Nudeln, Reis & Getreide', 85), ('mehl', 'Mehl, Zucker & Backzutaten', 90),
  ('huelsenfruechte', 'Hülsenfrüchte', 95), ('nuesse', 'Nüsse & Samen', 100), ('oele', 'Öle & Fette', 110),
  ('saucen', 'Saucen, Essig & Würzmittel', 120), ('suesses', 'Süßes & Snacks', 130),
  ('getraenke', 'Getränke', 140), ('gerichte', 'Fertiggerichte', 150), ('sonstiges', 'Sonstiges', 200)
on conflict (slug) do update set label = excluded.label, sort = excluded.sort;

-- recipes ------------------------------------------------------
alter table public.recipes
  add column if not exists course text references public.recipe_courses(slug) on update cascade on delete set null,
  add column if not exists cuisine text references public.cuisines(slug) on update cascade on delete set null,
  -- derived from the linked foods on save: vegetarian, vegan
  add column if not exists diet text[] not null default '{}';
create index if not exists recipes_course_idx on public.recipes (course);
create index if not exists recipes_cuisine_idx on public.recipes (cuisine);

update public.recipes set course = case lower(meal_type)
    when 'breakfast' then 'fruehstueck'
    when 'snack' then 'snack'
    when 'lunch' then 'hauptgericht'
    when 'dinner' then 'hauptgericht'
  end
where course is null and meal_type is not null;

-- food items ---------------------------------------------------
alter table public.food_items
  add column if not exists food_category text references public.food_categories(slug) on update cascade on delete set null,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists sugar_100g double precision check (sugar_100g is null or sugar_100g >= 0),
  add column if not exists fiber_100g double precision check (fiber_100g is null or fiber_100g >= 0),
  add column if not exists sat_fat_100g double precision check (sat_fat_100g is null or sat_fat_100g >= 0),
  add column if not exists salt_100g double precision check (salt_100g is null or salt_100g >= 0),
  -- g per ml, for ml/l amounts and spoons of liquids
  add column if not exists density double precision check (density is null or density > 0),
  -- explicit weights per unit, e.g. {"Stück": 150, "EL": 10, "Zehe": 4}
  add column if not exists unit_grams jsonb not null default '{}'::jsonb,
  add column if not exists kind text not null default 'ingredient' check (kind in ('ingredient', 'dish', 'drink')),
  add column if not exists is_vegetarian boolean,
  add column if not exists is_vegan boolean,
  -- prepared for later; not filled automatically (wrong allergen data is worse than none)
  add column if not exists allergens text[] not null default '{}',
  add column if not exists source text not null default 'vitus' check (source in ('vitus', 'swiss_fcdb', 'manual')),
  add column if not exists source_id text,
  add column if not exists source_category text,
  -- duplicates kept for old references, but not offered in the picker
  add column if not exists is_hidden boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists food_items_source_uidx on public.food_items (source, source_id) where source_id is not null;
create index if not exists food_items_name_lower_idx on public.food_items (lower(name));
create index if not exists food_items_category_idx on public.food_items (food_category);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists food_items_updated_at on public.food_items;
create trigger food_items_updated_at before update on public.food_items
  for each row execute function public.touch_updated_at();

commit;
