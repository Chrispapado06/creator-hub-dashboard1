-- ICEFALL — operator media: the storage convention.
--
-- Session 04 asked which bucket layout to build against and offered to take
-- whatever convention I preferred. This is it, plus the constraints that make it
-- hold rather than merely be documented.
--
-- THE CONVENTION
--
--   bucket:  operator-media          (private — see below)
--   path:    <company_id>/<scope>/<filename>
--            where <scope> is either 'company' or a product uuid
--
--   f47ac10b-.../company/logo.webp
--   f47ac10b-.../9c2e.../hero-01.jpg
--
-- The company id comes FIRST because that is what the storage policies match on.
-- Supabase's storage policies can only see the object path, so the path has to
-- carry the authorization key in a position a policy can read. Everything else
-- about the layout is convenience; that first segment is load-bearing.
--
-- WHY THE BUCKET IS PRIVATE
--
-- A public bucket serves every object to anyone with the URL, including media
-- that is still `pending` and media ICEFALL has rejected. Rejected media is
-- often rejected precisely because it should not be published. Objects are
-- served through signed URLs instead, which the application mints for assets
-- whose row says `approved`.
--
-- Making it public later, once approval and the public-read question are both
-- settled, is a one-line change. Making a public bucket private after something
-- has been indexed is not.
--
-- WHY THE CONSTRAINTS ARE ON `media_assets` AND NOT ONLY IN STORAGE
--
-- The storage policies below live in the `storage` schema, which exists on
-- Supabase and not in the PGlite harness the tests run on — so they are guarded
-- and skipped locally. That would leave the whole convention untested. The row
-- side is therefore constrained here, in `public`, where the tests can reach it:
-- an asset row physically cannot name a path outside its own company's folder.
-- Belt and braces, and the braces are the half that is covered.

/* ========================================================================== */
/* The row side — enforced, and testable                                      */
/* ========================================================================== */

-- An asset cannot point at another company's folder. Without this, the storage
-- policy is the only thing standing between an operator and a path they typed,
-- and a bug in the upload client becomes a cross-company write.
alter table public.media_assets drop constraint if exists media_path_is_in_company_folder;
alter table public.media_assets
  add constraint media_path_is_in_company_folder
  check (storage_path like (company_id::text || '/%'));

-- A size ceiling per kind. Session 04 validates before submission — this is the
-- backstop for when something reaches the API another way.
alter table public.media_assets drop constraint if exists media_size_ceiling;
alter table public.media_assets
  add constraint media_size_ceiling check (
    byte_size is null
    or (kind = 'image'    and byte_size <= 12  * 1024 * 1024)
    or (kind = 'video'    and byte_size <= 200 * 1024 * 1024)
    or (kind = 'document' and byte_size <= 20  * 1024 * 1024)
  );

-- A type allowlist rather than a blocklist. An operator uploading an SVG logo is
-- a reasonable thing to want and a script-execution vector to serve, which is
-- why it is absent and should stay absent.
alter table public.media_assets drop constraint if exists media_mime_allowed;
alter table public.media_assets
  add constraint media_mime_allowed check (
    mime_type is null
    or (kind = 'image'    and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
    or (kind = 'video'    and mime_type in ('video/mp4', 'video/webm'))
    or (kind = 'document' and mime_type in ('application/pdf', 'image/jpeg', 'image/png'))
  );

-- Nothing reaches `approved` without ICEFALL knowing what it actually is.
alter table public.media_assets drop constraint if exists media_approved_is_typed;
alter table public.media_assets
  add constraint media_approved_is_typed check (
    state <> 'approved' or (mime_type is not null and byte_size is not null)
  );

comment on column public.media_assets.storage_path is
  'operator-media bucket, <company_id>/<company|product_id>/<filename>. The company id must come first: the storage policies match on it.';

/* ========================================================================== */
/* The storage side — skipped where the storage schema does not exist         */
/* ========================================================================== */

-- Guarded because the PGlite test harness has no `storage` schema. On Supabase
-- this creates the bucket and its policies; locally it is a no-op and the tests
-- exercise the row constraints above instead.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'no storage schema (PGlite?) — skipping the operator-media bucket and its policies';
    return;
  end if;

  -- Private, and 200 MB to cover the video ceiling above.
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('operator-media', 'operator-media', false, 209715200)
    on conflict (id) do update set public = false, file_size_limit = 209715200
  $sql$;

  execute $sql$ drop policy if exists operator_media_read on storage.objects $sql$;
  execute $sql$
    create policy operator_media_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'operator-media'
        and (
          public.is_staff()
          -- The first path segment is the company id, which is the whole reason
          -- the convention puts it there.
          or public.is_company_member(((storage.foldername(name))[1])::uuid)
        )
      )
  $sql$;

  -- Uploading is a Company Admin's job, the same as the catalogue it illustrates.
  execute $sql$ drop policy if exists operator_media_insert on storage.objects $sql$;
  execute $sql$
    create policy operator_media_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'operator-media'
        and (
          public.has_staff_role(array['operations'])
          or public.is_company_admin(((storage.foldername(name))[1])::uuid)
        )
      )
  $sql$;

  execute $sql$ drop policy if exists operator_media_update on storage.objects $sql$;
  execute $sql$
    create policy operator_media_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'operator-media'
        and (
          public.has_staff_role(array['operations'])
          or public.is_company_admin(((storage.foldername(name))[1])::uuid)
        )
      )
  $sql$;

  -- Deleting an object whose asset row is already approved would leave a live
  -- listing pointing at nothing, so that is ICEFALL's call rather than the
  -- operator's. An operator may remove their own pending upload freely.
  execute $sql$ drop policy if exists operator_media_delete on storage.objects $sql$;
  execute $sql$
    create policy operator_media_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'operator-media'
        and (
          public.has_staff_role(array['operations'])
          or (
            public.is_company_admin(((storage.foldername(name))[1])::uuid)
            and not exists (
              select 1 from public.media_assets ma
              where ma.storage_path = storage.objects.name and ma.state = 'approved'
            )
          )
        )
      )
  $sql$;

  -- `anon` gets nothing, as everywhere else. Signed URLs are how an approved
  -- asset reaches a browser, and they are minted by the application.
  raise notice 'operator-media bucket and policies applied';
end
$$;
