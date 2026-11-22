-- ============================================================
-- 008 Spices, Asian condiments, readable names, Latin American cuisine (UP)
--  * cuisines: "Lateinamerikanisch"
--  * food_items.is_spice (spices count with 0 kcal), health_note (short
--    note on traditional / health use, shown in the food list), source_note
--  * new spices (no nutrition values) and condiments (researched values)
--  * aliases so recipes can say "Kichererbsen (Dose)" instead of
--    "Kichererbse, gekocht (ohne Zugabe von Fett und Salz)"
--  * recipes.cuisine: legacy values fixed, then a real foreign key
-- ============================================================
begin;

-- cuisine ------------------------------------------------------
insert into public.cuisines (slug, label, sort) values ('lateinamerikanisch', 'Lateinamerikanisch', 64)
on conflict (slug) do update set label = excluded.label, sort = excluded.sort;

-- food columns -------------------------------------------------
alter table public.food_items
  add column if not exists is_spice boolean not null default false,
  add column if not exists health_note text check (health_note is null or length(health_note) <= 600),
  add column if not exists source_note text check (source_note is null or length(source_note) <= 300);

-- new foods ----------------------------------------------------
-- spices: nutrition 0 on purpose (amounts in recipes are tiny)
insert into public.food_items
  (name, category, food_category, kcal_100g, protein_100g, carbs_100g, fat_100g, unit_grams, aliases,
   is_vegetarian, is_vegan, is_spice, source, health_note, source_note)
values
  ('Kreuzkümmel', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 2, "EL": 6}', '{Cumin,"Kreuzkümmel, gemahlen"}', true, true, true, 'manual',
   'Wird traditionell bei Blähungen und Völlegefühl eingesetzt; kleine Studien deuten auf eine verdauungsfördernde Wirkung hin. Liefert etwas Eisen.', null),
  ('Kurkuma', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 3, "EL": 9}', '{Gelbwurz,Kurkumapulver}', true, true, true, 'manual',
   'Enthält Curcumin, das in Studien entzündungshemmend und antioxidativ wirkt. Mit schwarzem Pfeffer und etwas Fett wird es besser aufgenommen. Hochdosierte Präparate nur nach ärztlicher Rücksprache.', null),
  ('Garam Masala', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 2, "EL": 6}', '{}', true, true, true, 'manual',
   'Indische Würzmischung u. a. aus Kreuzkümmel, Koriander, Kardamom, Zimt, Nelken und Pfeffer. Gilt als wärmend und verdauungsfördernd und ist reich an pflanzlichen Antioxidantien.', null),
  ('Chilipulver', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 2.5, "EL": 8}', '{Cayennepfeffer}', true, true, true, 'manual',
   'Capsaicin regt Durchblutung und Stoffwechsel leicht an und kann das Sättigungsgefühl fördern. Bei empfindlichem Magen sparsam verwenden.', null),
  ('Chiliflocken', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 1.5, "EL": 5}', '{"Pul Biber",Chiliflocken,"Chili, getrocknet"}', true, true, true, 'manual',
   'Getrocknete, grob zerstoßene Chilis. Capsaicin wirkt leicht stoffwechselanregend; bei empfindlichem Magen sparsam verwenden.', null),
  ('Chilischote', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"Stück": 10}', '{Chilischoten,Chili,"rote Chilischote",Jalapeño,Peperoncino}', true, true, true, 'manual',
   'Frische Chilis liefern Vitamin C und Capsaicin, das die Durchblutung anregt. Kerne und Scheidewände entfernen, wenn es milder sein soll.', null),
  ('Lorbeerblatt', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"Blatt": 0.2, "Stück": 0.2}', '{Lorbeer,Lorbeerblätter}', true, true, true, 'manual',
   'Ätherische Öle wirken traditionell verdauungsfördernd. Wird mitgekocht und vor dem Essen entfernt.', null),
  ('Kümmel', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 2, "EL": 6}', '{Kümmelsamen}', true, true, true, 'manual',
   'Klassisches Hausmittel gegen Blähungen und Völlegefühl; macht Kohl, Hülsenfrüchte und deftige Gerichte bekömmlicher.', null),
  ('Majoran', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 1, "EL": 3}', '{"Majoran, getrocknet"}', true, true, true, 'manual',
   'Wird traditionell als verdauungsförderndes und leicht krampflösendes Kraut zu fetten, deftigen Speisen verwendet.', null),
  ('Kardamom', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 2, "Stück": 0.2}', '{"Kardamom, gemahlen",Kardamomkapseln}', true, true, true, 'manual',
   'Gilt traditionell als Mittel gegen Völlegefühl und Mundgeruch; seine ätherischen Öle wirken antioxidativ.', null),
  ('Sternanis', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"Stück": 1}', '{}', true, true, true, 'manual',
   'Enthält Anethol und wird traditionell bei Blähungen und Husten eingesetzt. Nur echten (chinesischen) Sternanis verwenden.', null),
  ('Sichuanpfeffer', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"TL": 2, "EL": 6}', '{Szechuanpfeffer,"Szechuan-Pfeffer"}', true, true, true, 'manual',
   'Der Wirkstoff Hydroxy-alpha-Sanshool erzeugt das typische Kribbeln auf der Zunge; traditionell appetitanregend.', null),
  ('Zitronengras', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"Stange": 15, "Stück": 15}', '{Lemongrass}', true, true, true, 'manual',
   'Citralhaltige ätherische Öle geben das frische Zitrusaroma; traditionell beruhigend und verdauungsfördernd. Wird meist nicht mitgegessen.', null),
  ('Galgant', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"Stück": 20}', '{Thai-Ingwer}', true, true, true, 'manual',
   'Ingwerverwandte Wurzel, die traditionell bei Magen-Darm-Beschwerden und Übelkeit eingesetzt wird.', null),
  ('Kaffirlimettenblätter', 'Sonstiges', 'kraeuter', 0, 0, 0, 0, '{"Blatt": 0.5, "Stück": 0.5}', '{Kaffirlimettenblatt,Makrut-Limettenblätter}', true, true, true, 'manual',
   'Intensives Zitrusaroma aus ätherischen Ölen. Werden mitgekocht und nicht gegessen.', null)
on conflict (name) do nothing;

-- condiments and water: researched values per 100 g
insert into public.food_items
  (name, category, food_category, kcal_100g, protein_100g, carbs_100g, fat_100g, sugar_100g, sat_fat_100g, salt_100g,
   density, unit_grams, aliases, is_vegetarian, is_vegan, source, source_note)
values
  ('Fischsauce', 'Sonstiges', 'saucen', 35, 5.1, 3.6, 0, 3.6, null, 12.7, 1.2, '{}', '{"Fish Sauce","Nam Pla"}', false, false, 'manual',
   'Richtwert: Energie/Makros USDA FoodData Central 2706457, Natrium FNRI-Nährwerttabelle (Philippinen); je nach Marke bis ca. 20 g Salz.'),
  ('Austernsauce', 'Sonstiges', 'saucen', 51, 1.4, 10.9, 0.3, null, null, 6.8, 1.2, '{}', '{"Oyster Sauce"}', false, false, 'manual',
   'Richtwert: USDA FoodData Central 174529 (Sauce, oyster, ready-to-serve).'),
  ('Mirin', 'Sonstiges', 'saucen', 239, 0, 42.8, 0, 34.6, null, 0, 1.17, '{}', '{"Hon Mirin","süßer Reiswein"}', true, true, 'manual',
   'Richtwert: Herstellerangabe Hon Mirin (gourmet-versand.com); Mirin-Würzmittel ohne Alkohol liegen ähnlich.'),
  ('Gochujang', 'Sonstiges', 'saucen', 233, 6.1, 40, 2.3, 27, null, 6.6, null, '{"EL": 18, "TL": 6}', '{"koreanische Chilipaste"}', true, true, 'manual',
   'Richtwert: Herstellerangabe Sempio Gochujang (REWE).'),
  ('Doubanjiang', 'Sonstiges', 'saucen', 92, 3.2, 11, 2.5, 8.1, 0.4, 11.3, null, '{"EL": 18, "TL": 6}', '{Chili-Bohnenpaste,Chili-Bohnen-Sauce,"Toban Djan"}', true, true, 'manual',
   'Richtwert: Herstellerangabe Lee Kum Kee Chili-Bohnen-Sauce (gurkerl.at).'),
  ('Currypaste, rot', 'Sonstiges', 'saucen', 83, 3.9, 4.2, 3.4, null, null, 11.5, null, '{"EL": 16, "TL": 5}', '{"rote Currypaste","Red Curry Paste"}', null, null, 'manual',
   'Richtwert: Real Thai rote Currypaste (wikifit.de). Viele Pasten enthalten Garnelenpaste – vegan nur laut Etikett.'),
  ('Harissa', 'Sonstiges', 'saucen', 72, 3.0, 8.7, 1.0, 4.0, null, 2.75, null, '{"EL": 15, "TL": 5}', '{Harissapaste}', true, true, 'manual',
   'Richtwert Harissa-Paste (wikifit.de); Salz je nach Marke 1,6–11 g.'),
  ('Wasser', 'Sonstiges', 'getraenke', 0, 0, 0, 0, 0, 0, 0, 1, '{}', '{Leitungswasser}', true, true, 'manual',
   'Leitungswasser, ohne Nährwerte.')
on conflict (name) do nothing;

-- existing spices: mark as spice (their nutrition values stay) -----
update public.food_items f set is_spice = true, health_note = coalesce(f.health_note, n.note)
from (values
  ('Zimt', 'Kann laut Studien den Blutzuckeranstieg nach dem Essen leicht dämpfen. Cassia-Zimt enthält viel Cumarin – größere Mengen besser mit Ceylon-Zimt.'),
  ('Paprikapulver, edelsüß', 'Reich an Carotinoiden (Provitamin A) und Antioxidantien; mild und ohne nennenswerte Schärfe.'),
  ('Paprika (Gewürz)', 'Reich an Carotinoiden (Provitamin A) und Antioxidantien.'),
  ('Pfeffer, schwarz, gemahlen', 'Piperin regt die Verdauungssäfte an und verbessert die Aufnahme von Curcumin aus Kurkuma.'),
  ('Currypulver', 'Mischung meist mit Kurkuma, Koriander, Kreuzkümmel und Bockshornklee; liefert die Pflanzenstoffe der Einzelgewürze.'),
  ('Oregano, getrocknet', 'Enthält Carvacrol und Thymol, die antioxidativ und antimikrobiell wirken; traditionell bei Erkältungen genutzt.')
) as n(name, note)
where f.name = n.name;

-- readable aliases ---------------------------------------------
-- Each alias is only added to the food it belongs to; the matcher looks at
-- the full alias first, so "Kichererbsen (Dose)" lands on the cooked variant.
update public.food_items f
set aliases = (select array_agg(distinct x) from unnest(f.aliases || a.add) as x)
from (values
  ('Kichererbse, gekocht (ohne Zugabe von Fett und Salz)', array['Kichererbsen (Dose)', 'Kichererbsen, gekocht']),
  ('Kichererbse, getrocknet', array['Kichererbsen, getrocknet']),
  ('Linse, geschält, getrocknet', array['Rote Linsen', 'Gelbe Linsen']),
  ('Linse, ganz, getrocknet', array['Tellerlinsen', 'Berglinsen', 'Braune Linsen']),
  ('Bohne (alle Arten), gekocht (ohne Zugabe von Fett und Salz)', array['Kidneybohnen (Dose)', 'Schwarze Bohnen (Dose)', 'Weiße Bohnen (Dose)', 'Bohnen (Dose)']),
  ('Tofu, fest, nature (Durchschnitt)', array['Tofu natur']),
  ('Hähnchen, Schenkel, ohne Haut, roh', array['Hähnchenschenkel ohne Haut', 'Hähnchenoberschenkel']),
  ('Rind, Hals, roh', array['Rindergulasch']),
  ('Rind, Geschnetzeltes, roh', array['Rindergeschnetzeltes']),
  ('Lachs, roh', array['Lachsfilet']),
  ('Erbse, grün, tiefgekühlt', array['TK-Erbsen']),
  ('Olive, schwarz', array['Schwarze Oliven']),
  ('Olive, grün, in Salzlake, abgetropft', array['Grüne Oliven']),
  ('Sardelle im Öl, abgetropft', array['Sardellenfilets']),
  ('Sesamsamen, geschält', array['Sesam']),
  ('Paprika, grün, roh', array['grüne Paprika']),
  ('Zwiebel (Rot)', array['rote Zwiebel', 'rote Zwiebeln']),
  ('Erdnuss, geröstet, ohne Salz', array['Erdnüsse, ungesalzen', 'geröstete Erdnüsse']),
  ('Kakaopulver, ohne Zucker', array['Backkakao']),
  ('Hafergetränk, nature', array['Haferdrink']),
  ('Joghurt, nature', array['Naturjoghurt']),
  ('Nudeln ohne Ei, Vollkorn, trocken', array['Vollkornspaghetti', 'Vollkornnudeln']),
  ('Truthahn', array['Putenbrust']),
  ('Hackfleisch (Schwein)', array['Schweinehack']),
  ('Zucker, braun', array['brauner Zucker']),
  ('Zuckermais (Konserve)', array['Mais (Dose)']),
  ('Chia-Samen', array['Chiasamen']),
  ('Pfefferminze, roh', array['Minze', 'Pfefferminze']),
  ('Bohnen, grün', array['grüne Bohnen']),
  ('Beeren (Durchschnitt), roh', array['gemischte Beeren']),
  ('Champignon, roh', array['Champignons']),
  ('Zimt', array['Zimtstange'])
) as a(name, add)
where f.name = a.name;

-- a cinnamon stick weighs about 3 g
update public.food_items set unit_grams = unit_grams || '{"Stück": 3}'::jsonb where name = 'Zimt' and not unit_grams ? 'Stück';

-- recipes.cuisine: legacy English values → lookup slugs, then a foreign key
update public.recipes set cuisine = case slug
    when 'mango-kefir-powerbowl-mit-geroesteten-cashews' then 'international'
    when 'griechische-protein-bowl-mit-walnuessen-honig-fruechten' then 'griechisch'
    when 'vollkorn-penne-mit-zucchini-mozzarella' then 'italienisch'
    when 'gebratenes-lachsfilet-auf-mandel-bohnen-rosmarinkartoffeln' then 'international'
    when 'haehnchen-brokkoli-wok-mit-reis' then 'chinesisch'
    when 'rinderhuefte-szechuan-style-auf-gruenen-bohnen' then 'chinesisch'
    else cuisine end
where cuisine is not null and cuisine not in (select slug from public.cuisines);
update public.recipes set cuisine = 'deutsch' where lower(cuisine) = 'german';
update public.recipes set cuisine = null where cuisine is not null and cuisine not in (select slug from public.cuisines);

alter table public.recipes drop constraint if exists recipes_cuisine_fkey;
alter table public.recipes add constraint recipes_cuisine_fkey
  foreign key (cuisine) references public.cuisines(slug) on update cascade on delete set null;

commit;
