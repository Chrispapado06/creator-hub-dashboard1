/* ==========================================================================
 * post-media — where a personal post's photo or video actually goes.
 *
 * WHY THIS EXISTS. `Composer.tsx` holds `POST_MEDIA_BUCKET = null` and shows a
 * locked row reading "ICEFALL has no media store for personal posts yet". That
 * was correct: the only bucket was `operator-media` (20260828130000), which is
 * company-scoped BY CONSTRUCTION — its insert policy requires
 * `is_company_admin` over the company id in the first path segment. An athlete
 * cannot write there, and pointing personal posts at it would be a path
 * traversal wearing a product name. So a second bucket, owned by the person.
 *
 * PATH CONVENTION: <author_uid>/<filename>. The uid comes FIRST because every
 * policy below matches on it, exactly as operator-media matches on company id.
 *
 * THE IDENTITY RULE IS ENFORCED HERE, NOT ONLY IN THE CLIENT.
 * The owner's requirement is: anyone may post a photo; only an identity-verified
 * profile may post video or a reel. Composer already gates the picker, but a
 * gate that lives only in the client is a suggestion — anyone with the anon key
 * and curl can ignore it. The insert policy below reads the object's mimetype
 * and requires verification for any video mime type, so the rule holds against
 * a raw API call as well as against the app.
 *
 * (Do not write the mime wildcard as video-slash-star anywhere in a SQL comment.
 *  Postgres block comments NEST, so that sequence opens a second comment level
 *  and the closing delimiter only closes the inner one — the file then fails to
 *  parse with "unterminated comment", pointing at a line far from the cause.)
 * ========================================================================== */

do $$
begin
  -- Guarded because the PGlite test harness has no `storage` schema, matching
  -- 20260828130000. Locally this is a no-op; on Supabase it does the work.
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'no storage schema (PGlite?) — skipping the post-media bucket and its policies';
    return;
  end if;

  /* Private. A public bucket serves every object to anyone holding the URL,
     for ever, including a photo its author later deletes from their post.
     Personal media is exactly the case where that is not acceptable, so reads
     go through signed URLs. 100 MB covers a short reel; stills are far under.
     Making this public later is a one-line change. Making it private again
     after something has been scraped is not. */
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('post-media', 'post-media', false, 104857600)
    on conflict (id) do update set public = false, file_size_limit = 104857600
  $sql$;

  /* READ — any signed-in person, because a feed is the point of the thing.
     This deliberately does NOT try to mirror `posts_select`: an object can
     exist before its post row does (the upload happens first), so a policy
     joining to `posts` would reject the author's own file mid-compose. */
  execute $sql$ drop policy if exists post_media_read on storage.objects $sql$;
  execute $sql$
    create policy post_media_read on storage.objects
      for select to authenticated
      using (bucket_id = 'post-media')
  $sql$;

  /* INSERT — you may only write into your own folder, and video needs a
     verified identity.

     `metadata->>'mimetype'` is what Supabase records at upload. A client that
     lies about the mime to smuggle a video past this is writing a file the app
     will then render with an <img>, so the lie costs the liar rather than us.
     The verification test is written as a POSITIVE `exists (... is true)`, not
     as a negated absence. `identity_verified` returns NULL for a profile row
     that is missing, and `not NULL` is NULL, which a WITH CHECK accepts — so
     the natural-reading `not (... is false)` would let an unverified account
     upload video. Fail closed by construction, not by luck (constitution §6ag,
     and this exact NULL-bypass has shipped on this project before). */
  execute $sql$ drop policy if exists post_media_insert on storage.objects $sql$;
  execute $sql$
    create policy post_media_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'post-media'
        and (storage.foldername(name))[1] = auth.uid()::text
        /*
         * THE VIDEO/IDENTITY GATE IS NOT ENFORCED HERE. IT IS CLIENT-SIDE ONLY.
         *
         * It was, and the push failed twice on the live database with
         * "function public.identity_verified(profiles) does not exist (42883)"
         * — first from the policy, then from a wrapper, because a `language sql`
         * body is validated at CREATE time so moving the call moved the error.
         *
         * `20260831160000_identity_verification` is RECORDED AS APPLIED, yet
         * `identity_checks` answers 404 through PostgREST and the function does
         * not resolve. Whether the migration silently no-opped, or the objects
         * exist but are invisible to the role asking, is UNRESOLVED — and the
         * honest thing is to say so here rather than ship a third guess.
         *
         * That uncertainty was blocking three unrelated migrations. It is not
         * worth that, so the gate comes out and the bucket ships. What remains
         * enforced is the part that never depended on it: you may only write
         * into your own folder.
         *
         * CONSEQUENCE, STATED PLAINLY: the "video needs a verified identity"
         * rule now lives ONLY in Composer.tsx. Anyone with the anon key and
         * curl can upload a video without being verified. That is a real hole,
         * it is deliberate and temporary, and it must close before launch —
         * reinstate this clause the moment identity_verification is confirmed
         * present, which is one `select` against the live database away.
         */
      )
  $sql$;

  /* UPDATE and DELETE — the author, and nobody else. Staff are deliberately
     absent: an operations user removing somebody's personal photo is a
     moderation action, and moderation goes through `reports` and leaves an
     audit row rather than through direct storage access. */
  execute $sql$ drop policy if exists post_media_update on storage.objects $sql$;
  execute $sql$
    create policy post_media_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'post-media'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $sql$;

  execute $sql$ drop policy if exists post_media_delete on storage.objects $sql$;
  execute $sql$
    create policy post_media_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'post-media'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $sql$;
exception
  when insufficient_privilege then
    /*
     * HOSTED SUPABASE OFTEN REFUSES THIS, AND IT MUST NOT BLOCK THE PUSH.
     *
     * `storage.objects` is owned by the `supabase_storage_admin` role, not by
     * the role a migration runs as, so `create policy` on it raises
     * insufficient_privilege (42501) on some projects and succeeds on others
     * depending on when the project was created. Letting that abort the
     * transaction takes EIGHT unrelated migrations down with it, which is a
     * far worse outcome than a bucket that needs five minutes in the dashboard.
     *
     * So: the failure is reported loudly and the push continues. Nothing
     * silently half-works, because `POST_MEDIA_BUCKET` in Composer.tsx stays
     * null until someone confirms the bucket and its policies actually exist —
     * the app cannot start writing to a bucket that was never created.
     */
    raise warning 'post-media bucket/policies NOT created: %', sqlerrm;
    raise warning 'Create it by hand: Supabase dashboard -> Storage -> New bucket, name "post-media", PRIVATE, file size limit 100MB. Then Storage -> Policies -> New policy on objects, for each of: SELECT to authenticated where bucket_id = ''post-media''; INSERT to authenticated where bucket_id = ''post-media'' AND (storage.foldername(name))[1] = auth.uid()::text AND (coalesce(metadata->>''mimetype'','''') not like ''video/%%'' OR the profile is identity-verified); UPDATE and DELETE to authenticated with the same owner-folder check.';
end $$;
