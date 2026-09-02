-- ICEFALL — the video/identity gate goes back on the post-media bucket.
--
-- WHAT THIS RESTORES. `20260902160000_post_media_bucket.sql` shipped with its
-- insert policy carrying only two arms — the bucket, and your own folder —
-- because the third arm ("only an identity-verified profile may upload video")
-- referenced `public.identity_verified(public.profiles)`, which did not resolve
-- on the live database and took two pushes down with SQLSTATE 42883. That file
-- says so in plain terms rather than hiding it, and names the consequence: the
-- rule survived only in Composer.tsx, so anyone with the anon key and curl
-- could upload video unverified.
--
-- `20260902190000_identity_repair_and_promotion_columns.sql` recreates the
-- function idempotently. This file runs after it — filename order guarantees
-- that, and the guard below verifies it rather than trusting it.
--
-- ALL THREE ARMS ARE SPELLED OUT, NOT DIFFED. A policy has no ALTER for its
-- predicate, so this is a drop-and-create, and a drop-and-create written from a
-- description is exactly how an arm gets silently dropped. The bucket arm and
-- the owner-folder arm below are the ones already live, restated verbatim.
--
-- TWO NULL TRAPS, BOTH DELIBERATE:
--   `public.identity_verified(p) is true` — NOT `not (... is false)`. The
--   function returns NULL for a profile row that does not exist; `not NULL` is
--   NULL; and a WITH CHECK treats NULL as pass. The natural negative reading
--   would therefore let an unverified account through. This fails closed by
--   construction — the same trap the guide-credentials work hit earlier.
--   `coalesce(metadata->>'mimetype', '')` — a NULL mimetype must read as "not a
--   video" and pass, not poison the conjunction to NULL.
--
-- KNOWN LIMITATION, STATED SO NOBODY READS THIS AS AIRTIGHT: `metadata->>'mimetype'`
-- is CLIENT-ASSERTED. An mp4 labelled image/jpeg gets past this gate. The lie
-- costs the liar — the app renders it with an <img> and it does not display —
-- so this is a real barrier to casual bypass, not a guarantee. Server-side
-- content sniffing in an edge function is the airtight version and is a
-- different piece of work.

do $$
begin
  -- PGlite (the test harness) has no storage schema, and neither does any
  -- environment without Supabase Storage. Skip rather than fail.
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'post-media identity gate skipped: no storage schema in this environment';
    return;
  end if;

  -- ORDERING, VERIFIED RATHER THAN ASSUMED. If the repair has not run — or ran
  -- and did not take — creating a policy that references a missing function
  -- raises 42883 and aborts the push, which is precisely the failure this
  -- feature has already caused twice. Skip loudly instead: the bucket keeps its
  -- owner-folder arm, the gate stays client-side for one more cycle, and a
  -- human is told exactly what to do. One policy must never take a push down.
  if to_regprocedure('public.identity_verified(public.profiles)') is null then
    raise warning 'post-media identity gate NOT applied: public.identity_verified(public.profiles) does not exist. Apply 20260902190000_identity_repair_and_promotion_columns.sql first, then re-run this migration. The video gate remains CLIENT-SIDE ONLY until then — unverified video upload is possible with the anon key.';
    return;
  end if;

  execute $sql$ drop policy if exists post_media_insert on storage.objects $sql$;
  execute $sql$
    create policy post_media_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'post-media'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (
          coalesce(metadata->>'mimetype', '') not like 'video/%'
          or exists (
            select 1
              from public.profiles p
             where p.id = auth.uid()
               and public.identity_verified(p) is true
          )
        )
      )
  $sql$;

  raise notice 'post-media identity gate applied: video upload now requires an identity-verified profile, enforced server-side';

exception
  -- `storage.objects` is owned by `supabase_storage_admin` on hosted projects,
  -- not by the role a migration runs as. If that is the case here, warn with the
  -- real error and the by-hand fix rather than aborting every migration behind
  -- this one — the lesson from the push that failed on this bucket's own file.
  when insufficient_privilege then
    raise warning 'post-media identity gate NOT applied (insufficient privilege): %', sqlerrm;
    raise warning 'Apply by hand: Supabase dashboard -> Storage -> Policies -> objects -> edit post_media_insert, and add to its WITH CHECK: AND (coalesce(metadata->>''mimetype'','''') not like ''video/%%'' OR exists (select 1 from public.profiles p where p.id = auth.uid() and public.identity_verified(p) is true)). Until then, unverified video upload is possible with the anon key.';
end;
$$;
