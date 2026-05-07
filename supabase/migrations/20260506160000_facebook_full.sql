-- Facebook tracking — mirrors instagram_accounts/posts but adapted for Pages.
-- Includes status enum, posts table, Infloww revenue attribution, and Meta
-- connection fields (Page ID + Page Access Token).

DO $$ BEGIN
  CREATE TYPE public.facebook_account_status AS ENUM ('active', 'warm_up', 'shadowbanned', 'banned', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.facebook_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  page_url TEXT,
  status public.facebook_account_status NOT NULL DEFAULT 'active',
  followers_count INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,
  about_link TEXT,
  notes TEXT,
  infloww_campaign_code INTEGER,
  last_synced_at TIMESTAMPTZ,
  meta_access_token TEXT,
  meta_page_id TEXT,
  meta_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_accounts_creator ON public.facebook_accounts(creator_id);
ALTER TABLE public.facebook_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.facebook_accounts;
CREATE POLICY "Public full access" ON public.facebook_accounts FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_facebook_accounts_updated ON public.facebook_accounts;
CREATE TRIGGER trg_facebook_accounts_updated BEFORE UPDATE ON public.facebook_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.facebook_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facebook_account_id UUID NOT NULL REFERENCES public.facebook_accounts(id) ON DELETE CASCADE,
  post_id TEXT,
  message TEXT,
  media_type TEXT NOT NULL DEFAULT 'status' CHECK (media_type IN ('photo', 'video', 'reel', 'link', 'status')),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reactions_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  reach_count INTEGER NOT NULL DEFAULT 0,
  video_views INTEGER NOT NULL DEFAULT 0,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facebook_posts_account ON public.facebook_posts(facebook_account_id);
CREATE INDEX IF NOT EXISTS idx_facebook_posts_posted_at ON public.facebook_posts(posted_at DESC);
ALTER TABLE public.facebook_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.facebook_posts;
CREATE POLICY "Public full access" ON public.facebook_posts FOR ALL USING (true) WITH CHECK (true);

-- Allow upserting synced FB posts without colliding with manually-entered ones
CREATE UNIQUE INDEX IF NOT EXISTS facebook_posts_account_post_unique_idx
  ON public.facebook_posts (facebook_account_id, post_id)
  WHERE post_id IS NOT NULL;

-- Allow revenue rows to be attributed to a specific FB account
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS facebook_account_id UUID
  REFERENCES public.facebook_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_entries_facebook_account
  ON public.revenue_entries(facebook_account_id);

-- One-time backfill from the old social_accounts table (platform='facebook')
INSERT INTO public.facebook_accounts (creator_id, name, followers_count, posts_count, notes)
SELECT sa.creator_id, sa.username, sa.followers_count, sa.posts_count, sa.notes
FROM public.social_accounts sa
WHERE sa.platform = 'facebook'
  AND sa.username IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.facebook_accounts fa
    WHERE fa.creator_id = sa.creator_id AND fa.name = sa.username
  );
