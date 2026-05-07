-- TikTok tracking — mirrors Instagram with TikTok-specific fields:
-- views are the primary metric, and accounts surface a profile-level total
-- likes count. No Meta API connection (TikTok uses its own).

DO $$ BEGIN
  CREATE TYPE public.tiktok_account_status AS ENUM ('active', 'warm_up', 'shadowbanned', 'banned', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tiktok_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  status public.tiktok_account_status NOT NULL DEFAULT 'active',
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,
  total_likes BIGINT NOT NULL DEFAULT 0,
  bio_link TEXT,
  notes TEXT,
  infloww_campaign_code INTEGER,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_creator ON public.tiktok_accounts(creator_id);
ALTER TABLE public.tiktok_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.tiktok_accounts;
CREATE POLICY "Public full access" ON public.tiktok_accounts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_tiktok_accounts_updated ON public.tiktok_accounts;
CREATE TRIGGER trg_tiktok_accounts_updated BEFORE UPDATE ON public.tiktok_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tiktok_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_account_id UUID NOT NULL REFERENCES public.tiktok_accounts(id) ON DELETE CASCADE,
  post_id TEXT,
  caption TEXT,
  media_type TEXT NOT NULL DEFAULT 'video' CHECK (media_type IN ('video', 'photo', 'live')),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  saves_count INTEGER NOT NULL DEFAULT 0,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_account ON public.tiktok_posts(tiktok_account_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_posted_at ON public.tiktok_posts(posted_at DESC);
ALTER TABLE public.tiktok_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.tiktok_posts;
CREATE POLICY "Public full access" ON public.tiktok_posts FOR ALL USING (true) WITH CHECK (true);

-- Allow upsert without colliding with manually-entered posts
CREATE UNIQUE INDEX IF NOT EXISTS tiktok_posts_account_post_unique_idx
  ON public.tiktok_posts (tiktok_account_id, post_id)
  WHERE post_id IS NOT NULL;

-- Allow revenue rows to be attributed to a specific TikTok account
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS tiktok_account_id UUID
  REFERENCES public.tiktok_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_entries_tiktok_account
  ON public.revenue_entries(tiktok_account_id);
