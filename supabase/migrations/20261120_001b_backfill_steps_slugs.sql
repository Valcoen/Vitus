-- 001b: backfill slug + structured steps from instructions (applied 2026-11-20). Idempotent.
begin;
update recipes r set steps = (
  select coalesce(jsonb_agg(jsonb_build_object('text', regexp_replace(trim(p), '^\d+[.)]\s*', ''), 'timer_seconds', null) order by ord), '[]'::jsonb)
  from regexp_split_to_table(r.instructions, E'\n\s*\n') with ordinality as t(p, ord)
  where trim(p) <> ''
) where steps is null and instructions is not null;
update recipes set slug = left(trim(both '-' from regexp_replace(
    replace(replace(replace(replace(lower(title),'ä','ae'),'ö','oe'),'ü','ue'),'ß','ss'),
    '[^a-z0-9]+', '-', 'g')), 80)
  where slug is null;
commit;
