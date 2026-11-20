-- 003 (DOWN): removes the policies. The bucket and its files are kept on
-- purpose (deleting photos is not reversible); delete it in the dashboard
-- if you really want to: Storage → recipe-images → Delete bucket.
begin;
drop policy if exists "recipe images insert authenticated" on storage.objects;
drop policy if exists "recipe images update authenticated" on storage.objects;
drop policy if exists "recipe images delete authenticated" on storage.objects;
commit;
