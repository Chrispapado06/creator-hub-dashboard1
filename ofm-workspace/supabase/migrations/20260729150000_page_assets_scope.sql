-- =====================================================================
-- OFM Workspace — tighten page-assets storage + favorites RLS
-- (from the Step 2 adversarial review)
--
-- Assets are now stored at  <workspace_id>/<owner_uid>/<uuid>.<ext>  so storage
-- policies can scope by workspace AND owner (previously any active member could
-- read/overwrite/delete any asset, and is_active_member_any() leaked across
-- workspaces). foldername(name)[1] = workspace_id, [2] = owner uid.
-- =====================================================================

drop policy if exists "page_assets_read" on storage.objects;
create policy "page_assets_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'page-assets'
    and public.is_active_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "page_assets_insert" on storage.objects;
create policy "page_assets_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'page-assets'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_active_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "page_assets_update" on storage.objects;
create policy "page_assets_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'page-assets'
    and public.is_active_member(((storage.foldername(name))[1])::uuid)
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_manager_or_owner(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "page_assets_delete" on storage.objects;
create policy "page_assets_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'page-assets'
    and public.is_active_member(((storage.foldername(name))[1])::uuid)
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_manager_or_owner(((storage.foldername(name))[1])::uuid)
    )
  );

-- favorites: revoke self-access on deactivation, matching the insert policy.
drop policy if exists page_favorites_select on public.page_favorites;
create policy page_favorites_select on public.page_favorites for select to authenticated
  using ( user_id = auth.uid() and public.is_active_member_any() );

drop policy if exists page_favorites_delete on public.page_favorites;
create policy page_favorites_delete on public.page_favorites for delete to authenticated
  using ( user_id = auth.uid() and public.is_active_member_any() );
