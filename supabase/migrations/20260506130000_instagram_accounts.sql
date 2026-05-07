-- Instagram tracking: multi-account per creator (mirrors reddit_accounts).
-- Includes a posts table for manual post-performance entry and an Infloww
-- campaign_code field so Instagram accounts can be attributed to revenue
-- the same way reddit_accounts are.

DO $$ BEGIN
  CREATE TYPE public.instagram_account_status AS ENUM ('active', 'shadowbanned', 'banned', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  status public.instagram_account_status NOT NULL DEFAULT 'active',
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,
  bio_link TEXT,
  notes TEXT,
  infloww_campaign_code INTEGER,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_creator ON public.instagram_accounts(creator_id);
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.instagram_accounts;
CREATE POLICY "Public full access" ON public.instagram_accounts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_instagram_accounts_updated ON public.instagram_accounts;
CREATE TRIGGER trg_instagram_accounts_updated BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  post_id TEXT,
  caption TEXT,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video', 'reel', 'carousel', 'story')),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  reach_count INTEGER NOT NULL DEFAULT 0,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_account ON public.instagram_posts(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_posted_at ON public.instagram_posts(posted_at DESC);
ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.instagram_posts;
CREATE POLICY "Public full access" ON public.instagram_posts FOR ALL USING (true) WITH CHECK (true);

-- Allow revenue rows to be attributed to a specific Instagram account, the
-- same way they can be attributed to a Reddit account.
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS instagram_account_id UUID
  REFERENCES public.instagram_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_entries_instagram_account
  ON public.revenue_entries(instagram_account_id);

-- One-time backfill: if anyone used the old simple Instagram page (rows in
-- social_accounts with platform='instagram'), copy them across so the new
-- richer page sees them. Idempotent on re-run because of NOT EXISTS guard.
INSERT INTO public.instagram_accounts (creator_id, username, followers_count, following_count, posts_count, notes)
SELECT sa.creator_id, sa.username, sa.followers_count, sa.following_count, sa.posts_count, sa.notes
FROM public.social_accounts sa
WHERE sa.platform = 'instagram'
  AND sa.username IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts ia
    WHERE ia.creator_id = sa.creator_id AND ia.username = sa.username
  );
