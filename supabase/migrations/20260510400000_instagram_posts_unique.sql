-- Add the missing unique index on instagram_posts.
--
-- The dashboard's Meta + ScrapeCreators sync both call:
--   .upsert(upserts, { onConflict: "instagram_account_id,post_id" })
--
-- which Postgres translates into ON CONFLICT (instagram_account_id, post_id)
-- DO UPDATE. That requires a UNIQUE constraint or UNIQUE INDEX matching
-- those exact columns — without it, the call errors with:
--
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
--
-- The original migration created plain (non-unique) indexes on the
-- table, so this index was missing. We mirror facebook_posts' partial
-- unique index pattern (which already works) — partial because some
-- legacy rows may have null post_id (manually-logged posts), and
-- those shouldn't conflict with each other.

create unique index if not exists instagram_posts_account_post_unique_idx
  on public.instagram_posts (instagram_account_id, post_id)
  where post_id is not null;
