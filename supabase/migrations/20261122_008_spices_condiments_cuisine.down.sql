-- 008 (DOWN): removes the foods, aliases, columns and the cuisine FK added in UP.
-- Recipe cuisine values stay on the new slugs (the legacy ones were invalid).
begin;

alter table public.recipes drop constraint if exists recipes_cuisine_fkey;

update public.food_items f
set aliases = (select coalesce(array_agg(x), '{}') from unnest(f.aliases) as x where x <> all (r.remove))
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
) as r(name, remove)
where f.name = r.name;
update public.food_items set unit_grams = unit_grams - 'Stück' where name = 'Zimt';

-- foods added in UP (recipes keep their text; links become dangling ids, shown as plain text)
delete from public.food_items where source = 'manual' and name in (
  'Kreuzkümmel', 'Kurkuma', 'Garam Masala', 'Chilipulver', 'Chiliflocken', 'Chilischote', 'Lorbeerblatt', 'Kümmel',
  'Majoran', 'Kardamom', 'Sternanis', 'Sichuanpfeffer', 'Zitronengras', 'Galgant', 'Kaffirlimettenblätter',
  'Fischsauce', 'Austernsauce', 'Mirin', 'Gochujang', 'Doubanjiang', 'Currypaste, rot', 'Harissa', 'Wasser');

alter table public.food_items drop column if exists source_note, drop column if exists health_note, drop column if exists is_spice;

update public.recipes set cuisine = 'international' where cuisine = 'lateinamerikanisch';
delete from public.cuisines where slug = 'lateinamerikanisch';

commit;
