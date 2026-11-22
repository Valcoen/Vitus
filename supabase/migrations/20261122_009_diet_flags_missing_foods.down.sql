-- 009 (DOWN): removes the foods added in UP. The diet flags set in UP are
-- kept (they were unknown before, not wrong); restore from backup if needed.
begin;
delete from public.food_items where source = 'manual' and name in (
  'Paneer', 'Couscous, trocken', 'Bulgur, trocken', 'Tahin', 'Reisnudeln, trocken', 'Weizentortilla', 'Maistortilla', 'Pita', 'Hefeflocken');
commit;
