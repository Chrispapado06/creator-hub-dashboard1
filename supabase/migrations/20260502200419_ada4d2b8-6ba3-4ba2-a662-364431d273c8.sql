
CREATE TYPE public.creator_status AS ENUM ('active', 'paused', 'inactive');
CREATE TYPE public.reddit_account_status AS ENUM ('active', 'shadowbanned', 'suspended', 'inactive');

CREATE TABLE public.creators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  of_username TEXT,
  status public.creator_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.reddit_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  status public.reddit_account_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reddit_accounts_creator ON public.reddit_accounts(creator_id);

CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reddit_account_id UUID NOT NULL REFERENCES public.reddit_accounts(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subreddit TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_reddit_account ON public.posts(reddit_account_id);
CREATE INDEX idx_posts_subreddit ON public.posts(subreddit);
CREATE INDEX idx_posts_posted_at ON public.posts(posted_at DESC);
CREATE UNIQUE INDEX idx_posts_unique ON public.posts(reddit_account_id, post_id);

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reddit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Internal tool: open access (no auth)
CREATE POLICY "Public full access" ON public.creators FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.reddit_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access" ON public.posts FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_creators_updated BEFORE UPDATE ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_reddit_accounts_updated BEFORE UPDATE ON public.reddit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
