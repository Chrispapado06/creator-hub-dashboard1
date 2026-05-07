-- Add Meta / Instagram Graph API connection fields to instagram_accounts.
-- A user supplies their long-lived access token + IG User ID; we hit Graph API
-- to pull profile + recent media.

ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_ig_user_id    TEXT,
  ADD COLUMN IF NOT EXISTS meta_connected_at  TIMESTAMPTZ;

-- Allow upserting synced IG media without colliding with manually-entered posts
-- (which have post_id = NULL). Partial unique index — only enforces uniqueness
-- when post_id is set.
CREATE UNIQUE INDEX IF NOT EXISTS instagram_posts_account_post_unique_idx
  ON public.instagram_posts (instagram_account_id, post_id)
  WHERE post_id IS NOT NULL;
