-- ============================================================
-- 003 Storage bucket for recipe photos (UP)
-- Public read (photos are not sensitive; URLs contain the recipe UUID),
-- writes only for logged-in users. The app re-encodes every upload to
-- WebP server-side, so only image/webp is accepted here.
-- ============================================================
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recipe images insert authenticated" on storage.objects;
drop policy if exists "recipe images delete authenticated" on storage.objects;
drop policy if exists "recipe images update authenticated" on storage.objects;
create policy "recipe images insert authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'recipe-images');
create policy "recipe images update authenticated" on storage.objects
  for update to authenticated using (bucket_id = 'recipe-images');
create policy "recipe images delete authenticated" on storage.objects
  for delete to authenticated using (bucket_id = 'recipe-images');
commit;
