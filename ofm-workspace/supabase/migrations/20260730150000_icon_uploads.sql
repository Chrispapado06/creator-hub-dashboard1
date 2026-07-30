-- =====================================================================
-- OFM Workspace — custom icon uploads
-- A PUBLIC "icons" bucket for user-uploaded page/database/workspace icons.
-- Icons render everywhere (sidebar, lists), so a public bucket avoids signed-URL
-- churn. Any signed-in user may upload into their own "<uid>/" folder; reads are
-- public. Icon value is stored as "img:<publicUrl>".
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('icons', 'icons', true)
on conflict (id) do nothing;

drop policy if exists icons_read on storage.objects;
create policy icons_read on storage.objects
  for select to anon, authenticated
  using ( bucket_id = 'icons' );

drop policy if exists icons_insert on storage.objects;
create policy icons_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists icons_update on storage.objects;
create policy icons_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists icons_delete on storage.objects;
create policy icons_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- END migration
-- =====================================================================
