-- 007 DOWN: removes the Swiss / reference foods again, except ones a recipe
-- already links to (those would otherwise lose their nutrition values).
begin;
delete from public.food_items f
 where f.source in ('swiss_fcdb', 'manual')
   and not exists (
     select 1 from public.recipes r
      where jsonb_typeof(r.ingredients) = 'array'
        and exists (select 1 from jsonb_array_elements(r.ingredients) e where e->>'food_item_id' = f.id::text));
update public.food_items set is_hidden = false where source = 'vitus';
commit;
