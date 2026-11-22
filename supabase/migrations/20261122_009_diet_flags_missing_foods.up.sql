-- ============================================================
-- 009 Diet flags + missing recipe foods (UP)
--  * vegan / vegetarian set where it is clear from the food itself
--    (left open on purpose: wine, beer, spirits – may be clarified with
--    gelatine; pesto – Parmesan with animal rennet; red curry paste –
--    often shrimp paste; mixed sweets and ready meals)
--  * Paneer, Couscous, Bulgur, Tahin, Reisnudeln, Weizen-/Maistortilla,
--    Pita, Hefeflocken with researched values per 100 g
-- ============================================================
begin;

-- vegan (and so vegetarian)
update public.food_items set is_vegetarian = true, is_vegan = true
where (is_vegetarian is null or is_vegan is null) and name in (
  'Sojasauce', 'Zitronensaft', 'Brühe, Gemüse, zubereitet', 'Apfelsaft', 'Bauernbrot', 'Kakaopulver, ohne Zucker',
  'Ananassaft', 'Birnensaft', 'Fruchtsaft (Durchschnitt), ungezuckert', 'Fruchtsaft-Schorle (Durchschnitt, 60% Saft - 40% Wasser), ungezuckert',
  'Karottensaft', 'Orangensaft', 'Orangennektar', 'Tomatensaft', 'Traubensaft', 'Kokoswasser', 'Trinkwasser (Mittelwert Schweiz)',
  'Kaffee löslich, Pulver', 'Kaffee, schwarz, ungezuckert', 'Tee, ungezuckert', 'Limonade, mit Aroma, gezuckert',
  'Colagetränk, gezuckert', 'Colagetränk, mit Süßstoffen', 'Eistee, gezuckert', 'Sirup unverdünnt', 'Sirup zubereitet (verdünnt im Verhältnis 1:5.5)',
  'Energy Drink mit Koffein, Taurin und Vitaminen mit Süßstoffen', 'Energy Drink mit Koffein, Taurin und Vitaminen, gezuckert',
  'Kokosfett', 'Ketchup', 'Senf', 'Tomatensauce', 'Essig-Öl-Salatsauce, hausgemacht (mit Rapsöl)',
  'Salatsauce italienisch, hausgemacht (mit Olivenöl)', 'Vinaigrette (mit Rapsöl)', 'Guacamole, hausgemacht', 'Guacamole, abgepackt',
  'Hummus', 'Wasabi Paste', 'Bäckerhefe, gepresst', 'Bierhefe, getrocknet');

-- vegetarian, not vegan (milk / egg)
update public.food_items set is_vegetarian = true, is_vegan = false
where (is_vegetarian is null or is_vegan is null) and name in (
  'Café crème, ungezuckert', 'Espresso crème, ungezuckert', 'Ristretto crème, ungezuckert', 'Mayonnaise', 'Mayonnaise, kalorienvermindert',
  'Béchamelsauce, hausgemacht', 'Hollandaisesauce', 'Tzatziki', 'Cocktailsauce mit Rapsöl-Mayonnaise, hausgemacht',
  'Tartarsauce mit Rapsöl-Mayonnaise, hausgemacht', 'Hackfleisch/Geschnetzeltes/Pätzli, vegetarisch aus Mykoprotein, roh');

-- vegetarian, vegan unclear (honey, whey, Worcester sauce …)
update public.food_items set is_vegetarian = true
where is_vegetarian is null and name in ('Barbecue Grillsauce', 'Margarine, 35 - 40 % Fett');

-- meat or fish
update public.food_items set is_vegetarian = false, is_vegan = false
where (is_vegetarian is null or is_vegan is null) and name in (
  'Brühe, Geflügel, zubereitet', 'Bolognaisesauce', 'Bratensauce, gebunden', 'Bratensauce, klar', 'Jägersauce', 'Worcester Sauce');

-- missing foods ------------------------------------------------
insert into public.food_items
  (name, category, food_category, kcal_100g, protein_100g, carbs_100g, fat_100g, sugar_100g, fiber_100g, sat_fat_100g, salt_100g,
   unit_grams, aliases, is_vegetarian, is_vegan, source, source_note)
values
  ('Paneer', 'Milchprodukte', 'kaese', 352, 23, 3.5, 25, null, null, null, null, '{}', '{"Paneer-Käse"}', true, false, 'manual',
   'Richtwert: wikifit.de (Paneer). Mit Säure statt Lab dickgelegt, daher vegetarisch.'),
  ('Couscous, trocken', 'Getreide', 'getreide', 351, 12, 66, 2.4, null, 8.8, null, null, '{}', '{Couscous}', true, true, 'manual',
   'Richtwert: utopia.de (Couscous ungekocht); Herstellerangaben 330–356 kcal.'),
  ('Bulgur, trocken', 'Getreide', 'getreide', 348, 12, 67, 1.8, null, 7.5, null, null, '{}', '{Bulgur}', true, true, 'manual',
   'Richtwert: Herstellerangabe Alnatura Bio-Bulgur.'),
  ('Tahin', 'Sonstiges', 'nuesse', 595, 17, 21, 54, null, null, null, null, '{"EL": 15, "TL": 5}', '{Tahini,Sesampaste,Sesammus}', true, true, 'manual',
   'Richtwert: wikifit.de (Tahin); Herstellerangaben 580–650 kcal.'),
  ('Reisnudeln, trocken', 'Getreide', 'getreide', 357, 7.1, 80, 0.8, null, null, null, 0.05, '{}', '{Reisnudeln,Reisbandnudeln,"Vermicelli (Reis)"}', true, true, 'manual',
   'Herstellerangabe Aroy-D / Cock Brand (Reismehl, Wasser).'),
  ('Weizentortilla', 'Getreide', 'brot', 308, 8.8, 55, 4.9, 2.5, 4.4, null, 0.8, '{"Stück": 63}', '{Weizentortillas,Wraps,"Tortilla-Wraps"}', true, true, 'manual',
   'Richtwert: wikifit.de (Tortilla Wraps, Weizenmehl), 1 Stück ≈ 63 g.'),
  ('Maistortilla', 'Getreide', 'brot', 305, 4.8, 60.9, 3.7, 0.7, 5.0, 0.4, 1.4, '{"Stück": 25}', '{Maistortillas,"Tortilla (Mais)"}', true, true, 'manual',
   'Norwegische Lebensmitteltabelle (matvaretabellen.no, Tortilla, corn flour, soft); Stückgewicht ≈ 25 g (kleine Tortilla).'),
  ('Pita', 'Getreide', 'brot', 260, 8.2, 53, 1.1, 3.0, 2.4, null, 1.3, '{"Stück": 80}', '{Pitabrot,Fladenbrot,Pitataschen}', true, true, 'manual',
   'Richtwert: wikifit.de (Pita), 1 Stück ≈ 80 g.'),
  ('Hefeflocken', 'Sonstiges', 'pflanzlich', 338, 26, 40, 4, 1.0, 18, null, 1.0, '{"EL": 5, "TL": 2}', '{"Yeast Flakes",Nährhefe}', true, true, 'manual',
   'Herstellerangabe enerBiO Hefeflocken (wikifit.de); Eiweiß je nach Marke 26–50 g.')
on conflict (name) do nothing;

commit;
