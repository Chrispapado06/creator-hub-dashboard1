-- OnlyFans dashboard tables — pulled from OnlyFansAPI per creator.
-- All tables have public RLS to match the rest of the internal-tool posture.

-- Latest profile + lifetime stats per creator (one row per creator, upserted on sync)
CREATE TABLE IF NOT EXISTS public.of_creator_stats (
  creator_id UUID PRIMARY KEY REFERENCES public.creators(id) ON DELETE CASCADE,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0,
  posts_count INTEGER NOT NULL DEFAULT 0,
  active_subscribers INTEGER NOT NULL DEFAULT 0,
  expired_subscribers INTEGER NOT NULL DEFAULT 0,
  sub_price NUMERIC(10, 2),
  total_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_subs NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_tips NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_ppv NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_messages NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_streams NUMERIC(12, 2) NOT NULL DEFAULT 0,
  earnings_referrals NUMERIC(12, 2) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.of_creator_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_creator_stats;
CREATE POLICY "Public full access" ON public.of_creator_stats FOR ALL USING (true) WITH CHECK (true);

-- Daily earnings breakdown per creator. One row per creator per day.
CREATE TABLE IF NOT EXISTS public.of_earnings_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  earnings_subs NUMERIC(10, 2) NOT NULL DEFAULT 0,
  earnings_tips NUMERIC(10, 2) NOT NULL DEFAULT 0,
  earnings_ppv NUMERIC(10, 2) NOT NULL DEFAULT 0,
  earnings_messages NUMERIC(10, 2) NOT NULL DEFAULT 0,
  earnings_streams NUMERIC(10, 2) NOT NULL DEFAULT 0,
  earnings_referrals NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_of_earnings_daily_creator ON public.of_earnings_daily(creator_id);
CREATE INDEX IF NOT EXISTS idx_of_earnings_daily_date ON public.of_earnings_daily(entry_date DESC);
ALTER TABLE public.of_earnings_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_earnings_daily;
CREATE POLICY "Public full access" ON public.of_earnings_daily FOR ALL USING (true) WITH CHECK (true);

-- Cached subscriber list per creator. One row per fan.
CREATE TABLE IF NOT EXISTS public.of_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  fan_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  total_spent NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tips_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ppv_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  messages_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  subscribed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ,
  notes TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, fan_id)
);
CREATE INDEX IF NOT EXISTS idx_of_subscribers_creator ON public.of_subscribers(creator_id);
CREATE INDEX IF NOT EXISTS idx_of_subscribers_spent ON public.of_subscribers(total_spent DESC);
ALTER TABLE public.of_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_subscribers;
CREATE POLICY "Public full access" ON public.of_subscribers FOR ALL USING (true) WITH CHECK (true);

-- Daily snapshot of subscriber counts (active / new / lost / expired) for churn graphs.
CREATE TABLE IF NOT EXISTS public.of_subscriber_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  lost_count INTEGER NOT NULL DEFAULT 0,
  expired_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_of_sub_metrics_creator ON public.of_subscriber_metrics_daily(creator_id);
CREATE INDEX IF NOT EXISTS idx_of_sub_metrics_date ON public.of_subscriber_metrics_daily(entry_date DESC);
ALTER TABLE public.of_subscriber_metrics_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_subscriber_metrics_daily;
CREATE POLICY "Public full access" ON public.of_subscriber_metrics_daily FOR ALL USING (true) WITH CHECK (true);

-- PPV message performance. One row per PPV unlock-able message sent.
CREATE TABLE IF NOT EXISTS public.of_ppv_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  message_id TEXT,
  sent_at TIMESTAMPTZ,
  price NUMERIC(10, 2),
  recipients_count INTEGER NOT NULL DEFAULT 0,
  unlocks_count INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(10, 2) NOT NULL DEFAULT 0,
  preview TEXT,
  notes TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_of_ppv_creator ON public.of_ppv_messages(creator_id);
CREATE INDEX IF NOT EXISTS idx_of_ppv_sent ON public.of_ppv_messages(sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_of_ppv_unique
  ON public.of_ppv_messages(creator_id, message_id) WHERE message_id IS NOT NULL;
ALTER TABLE public.of_ppv_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_ppv_messages;
CREATE POLICY "Public full access" ON public.of_ppv_messages FOR ALL USING (true) WITH CHECK (true);

-- Promotions / sub-price experiments. Manually tracked by admins.
CREATE TABLE IF NOT EXISTS public.of_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  promo_type TEXT NOT NULL DEFAULT 'discount' CHECK (promo_type IN ('discount', 'free_trial', 'bundle', 'price_change', 'other')),
  discount_pct NUMERIC(5, 2),
  trial_days INTEGER,
  starts_at DATE NOT NULL,
  ends_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_of_promotions_creator ON public.of_promotions(creator_id);
CREATE INDEX IF NOT EXISTS idx_of_promotions_starts ON public.of_promotions(starts_at);
ALTER TABLE public.of_promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public full access" ON public.of_promotions;
CREATE POLICY "Public full access" ON public.of_promotions FOR ALL USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_of_promotions_updated ON public.of_promotions;
CREATE TRIGGER trg_of_promotions_updated BEFORE UPDATE ON public.of_promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
