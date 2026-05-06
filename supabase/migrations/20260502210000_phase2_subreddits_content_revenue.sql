-- subreddits: linked to a specific reddit account
CREATE TABLE public.subreddits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reddit_account_id UUID NOT NULL REFERENCES public.reddit_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'banned')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subreddits_account ON public.subreddits(reddit_account_id);
ALTER TABLE public.subreddits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.subreddits FOR ALL USING (true) WITH CHECK (true);

-- tracking_links: infloww (or any) links attached to a reddit account
CREATE TABLE public.tracking_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reddit_account_id UUID NOT NULL REFERENCES public.reddit_accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracking_links_account ON public.tracking_links(reddit_account_id);
ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.tracking_links FOR ALL USING (true) WITH CHECK (true);

-- content_items: manually tracked content pieces
CREATE TABLE public.content_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  reddit_account_id UUID REFERENCES public.reddit_accounts(id) ON DELETE SET NULL,
  subreddit_id UUID REFERENCES public.subreddits(id) ON DELETE SET NULL,
  tracking_link_id UUID REFERENCES public.tracking_links(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image' CHECK (content_type IN ('image', 'video', 'text', 'link')),
  post_url TEXT,
  posted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_items_creator ON public.content_items(creator_id);
CREATE INDEX idx_content_items_account ON public.content_items(reddit_account_id);
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.content_items FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_content_items_updated BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- revenue_entries: manual OF revenue attributed to a reddit account / tracking link
CREATE TABLE public.revenue_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  reddit_account_id UUID REFERENCES public.reddit_accounts(id) ON DELETE SET NULL,
  tracking_link_id UUID REFERENCES public.tracking_links(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'new_sub' CHECK (source IN ('new_sub', 'renewal', 'tip', 'ppv', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_revenue_entries_creator ON public.revenue_entries(creator_id);
CREATE INDEX idx_revenue_entries_account ON public.revenue_entries(reddit_account_id);
CREATE INDEX idx_revenue_entries_date ON public.revenue_entries(entry_date DESC);
ALTER TABLE public.revenue_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.revenue_entries FOR ALL USING (true) WITH CHECK (true);
